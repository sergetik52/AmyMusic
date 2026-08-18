const { app, BrowserWindow, ipcMain, Menu, protocol, Tray } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const isDev = process.env.AMYMUSIC_DEV === "1";
const mainErrorLogPath = path.join(os.tmpdir(), "amymusic-main-error.log");

function writeMainErrorLog(label, error) {
  const details = error?.stack || error?.message || String(error);
  const message = `[${new Date().toISOString()}] ${label}\n${details}\n\n`;
  try {
    fs.appendFileSync(mainErrorLogPath, message, "utf8");
  } catch {
    // If logging fails, keep Electron's default crash dialog behavior.
  }
}

process.on("uncaughtException", (error) => {
  writeMainErrorLog("uncaughtException", error);
  console.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  writeMainErrorLog("unhandledRejection", error);
  console.error(error);
  process.exit(1);
});

const soundCloudTarget = process.env.VITE_SOUNDCLOUD_PROXY_TARGET || "https://api-v2.soundcloud.com";
const envProxyList = (process.env.VITE_SOUNDCLOUD_HTTP_PROXIES || "")
  .split(",")
  .map((proxy) => proxy.trim())
  .filter(Boolean);

let proxyCursor = 0;
let proxyServer = null;
let proxyPort = 0;
let mainWindow = null;
let tray = null;
let isTrayEnabled = false;
let isQuitting = false;
let cachedEnvToken = null;
let cachedEnvTokenExpiresAt = 0;
const runtimeTokenCache = new Map();
let httpsProxyAgentModule = null;
let mainConfigPath = null; // resolved after app is ready

// ─── Persistent config (survives app restarts) ──────────────────────────────
function getMainConfigPath() {
  if (!mainConfigPath) {
    mainConfigPath = path.join(app.getPath("userData"), "amymusic-config.json");
  }
  return mainConfigPath;
}

function readMainConfig() {
  try {
    return JSON.parse(fs.readFileSync(getMainConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeMainConfig(patch) {
  try {
    const current = readMainConfig();
    fs.writeFileSync(
      getMainConfigPath(),
      JSON.stringify({ ...current, ...patch }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[AmyMusic] failed to write config", err.message);
  }
}

function getDistPath() {
  return isDev
    ? path.join(__dirname, "..", "public")
    : path.join(__dirname, "..", "dist");
}

function getAppIconPath() {
  return path.join(getDistPath(), "logo.png");
}

function registerFileAssetFallback() {
  protocol.interceptFileProtocol("file", (request, callback) => {
    let requestedPath = "";

    try {
      requestedPath = fileURLToPath(request.url);
    } catch {
      callback({ error: -6 });
      return;
    }

    if (fs.existsSync(requestedPath)) {
      callback(requestedPath);
      return;
    }

    const assetPath = path.join(getDistPath(), path.basename(requestedPath));
    if (fs.existsSync(assetPath)) {
      callback(assetPath);
      return;
    }

    callback(requestedPath);
  });
}

async function createProxyAgent(proxy) {
  if (!proxy) return undefined;
  if (!httpsProxyAgentModule) {
    httpsProxyAgentModule = await import("https-proxy-agent");
  }
  return new httpsProxyAgentModule.HttpsProxyAgent(proxy);
}

function normalizeProxy(proxy) {
  if (!proxy) return "";
  return proxy.startsWith("http://") || proxy.startsWith("https://")
    ? proxy
    : `http://${proxy}`;
}

function normalizeProxyList(value = "") {
  return String(value || "")
    .split(/[\s,]+/)
    .map((proxy) => normalizeProxy(proxy.trim()))
    .filter(Boolean);
}

function pickEnvProxy() {
  if (!envProxyList.length) return null;
  const proxy = normalizeProxy(envProxyList[proxyCursor % envProxyList.length]);
  proxyCursor += 1;
  return proxy;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function maskSecrets(value) {
  return String(value)
    .replace(/client_id=([^&]+)/g, "client_id=***")
    .replace(/_client_secret=([^&]+)/g, "_client_secret=***")
    .replace(/Authorization: Basic [^,\s]+/gi, "Authorization: Basic ***")
    .replace(/Authorization: Bearer [^,\s]+/gi, "Authorization: Bearer ***");
}

async function requestUpstream(upstreamUrl, req, proxy, extraHeaders = {}) {
  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : await readBody(req);
  const agent = await createProxyAgent(proxy);

  return new Promise((resolve, reject) => {
    const request = https.request(
      upstreamUrl,
      {
        method: req.method,
        agent,
        headers: {
          ...req.headers,
          host: upstreamUrl.host,
          accept: "application/json, text/plain, */*",
          "accept-encoding": "identity",
          "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          origin: "https://soundcloud.com",
          referer: "https://soundcloud.com/",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          ...extraHeaders
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 500,
            headers: response.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function requestOAuthToken({ clientId, clientSecret, proxy }) {
  const agent = await createProxyAgent(proxy);

  return new Promise((resolve, reject) => {
    const body = "grant_type=client_credentials";
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const upstreamUrl = new URL("https://secure.soundcloud.com/oauth/token");

    const request = https.request(
      upstreamUrl,
      {
        method: "POST",
        agent,
        headers: {
          accept: "application/json; charset=utf-8",
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
          authorization: `Basic ${auth}`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`OAuth token failed: ${response.statusCode} ${text}`));
            return;
          }

          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function getEnvAccessToken(proxy) {
  const clientId = process.env.VITE_SOUNDCLOUD_CLIENT_ID || "";
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return "";
  if (cachedEnvToken && Date.now() < cachedEnvTokenExpiresAt - 60_000) return cachedEnvToken;

  const token = await requestOAuthToken({ clientId, clientSecret, proxy });
  cachedEnvToken = token.access_token || "";
  cachedEnvTokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
  return cachedEnvToken;
}

async function getRuntimeAccessToken({ clientId, clientSecret, proxy }) {
  if (!clientId || !clientSecret) return "";
  const cacheKey = `${clientId}:${clientSecret}:${proxy || "direct"}`;
  const cached = runtimeTokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const token = await requestOAuthToken({ clientId, clientSecret, proxy });
  const accessToken = token.access_token || "";
  runtimeTokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000
  });
  return accessToken;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.end(JSON.stringify(payload));
}

async function handleSoundCloudProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "*");
    res.end();
    return;
  }

  const localUrl = new URL(req.url || "/", `http://127.0.0.1:${proxyPort}`);
  if (!localUrl.pathname.startsWith("/api/soundcloud")) {
    sendJson(res, 404, { error: "NOT_FOUND" });
    return;
  }

  const upstreamPath = localUrl.pathname.replace(/^\/api\/soundcloud/, "") || "/";
  const upstreamUrl = new URL(`${upstreamPath}${localUrl.search}`, soundCloudTarget);
  const forceClientIdOnly = upstreamUrl.searchParams.get("_auth") === "client";
  const runtimeClientSecret = upstreamUrl.searchParams.get("_client_secret") || "";
  const runtimeProxies = normalizeProxyList(upstreamUrl.searchParams.get("_proxies") || "");
  const firstProxy = runtimeProxies[0] || pickEnvProxy();

  upstreamUrl.searchParams.delete("_auth");
  upstreamUrl.searchParams.delete("_client_secret");
  upstreamUrl.searchParams.delete("_proxies");

  try {
    let accessToken = "";
    if (!forceClientIdOnly && runtimeClientSecret) {
      accessToken = await getRuntimeAccessToken({
        clientId: upstreamUrl.searchParams.get("client_id") || "",
        clientSecret: runtimeClientSecret,
        proxy: firstProxy
      });
    } else if (!forceClientIdOnly) {
      accessToken = await getEnvAccessToken(firstProxy).catch((error) => {
        console.error("[AmyMusic:electron-proxy] env oauth failed", maskSecrets(error.message));
        return "";
      });
    }

    const proxyCandidates = runtimeProxies.length ? runtimeProxies : [firstProxy];
    let response = null;
    let lastError = null;

    for (const candidateProxy of proxyCandidates) {
      try {
        response = await requestUpstream(
          upstreamUrl,
          req,
          candidateProxy || null,
          accessToken ? { authorization: `Bearer ${accessToken}` } : {}
        );
        if (![403, 429, 500, 502, 503, 504].includes(response.statusCode)) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!response && lastError) throw lastError;

    res.statusCode = response.statusCode;
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader("access-control-allow-origin", "*");
    res.end(response.body);
  } catch (error) {
    console.error("[AmyMusic:electron-proxy] failed", maskSecrets(error.message));
    sendJson(res, 502, {
      error: "SOUNDCLOUD_PROXY_FAILED",
      message: error.message
    });
  }
}

function startProxyServer() {
  return new Promise((resolve, reject) => {
    proxyServer = http.createServer(handleSoundCloudProxy);
    proxyServer.on("error", reject);
    proxyServer.listen(0, "127.0.0.1", () => {
      proxyPort = proxyServer.address().port;
      resolve(proxyPort);
    });
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createTray() {
  if (tray) return tray;

  tray = new Tray(getAppIconPath());
  tray.setToolTip("AmyMusic");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть AmyMusic", click: showMainWindow },
    { type: "separator" },
    {
      label: "Выход",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
  return tray;
}

function setTrayEnabled(enabled) {
  isTrayEnabled = Boolean(enabled);
  writeMainConfig({ trayEnabled: isTrayEnabled }); // persist across restarts
  if (isTrayEnabled) {
    createTray();
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
  return isTrayEnabled;
}

function registerDesktopIpc() {
  ipcMain.handle("amymusic:get-auto-launch", () =>
    app.getLoginItemSettings().openAtLogin
  );

  ipcMain.handle("amymusic:set-auto-launch", (_event, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath
    });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle("amymusic:set-tray-enabled", (_event, enabled) =>
    setTrayEnabled(enabled)
  );

  ipcMain.handle("amymusic:show-window", () => {
    showMainWindow();
    return true;
  });

  ipcMain.handle("amymusic:parse-playlist-url", async (_event, url) => {
    return new Promise((resolve, reject) => {
      const hiddenWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      hiddenWindow.loadURL(url).catch((err) => {
        hiddenWindow.destroy();
        reject(err);
      });

      hiddenWindow.webContents.on('did-finish-load', async () => {
        try {
          const result = await hiddenWindow.webContents.executeJavaScript(`
            new Promise((resolve) => {
              let sameCountIterations = 0;
              const tracksMap = new Map();
              
              const interval = setInterval(() => {
                let foundAnyNew = false;
                
                // Parse tracks first before scrolling
                const rows = document.querySelectorAll('.CommonTrack_root__i6shE, .d-track');
                if (rows.length > 0) {
                  // Fallback generic scroll just in case
                  window.scrollBy(0, 150);
                  
                  // Scroll the last track element into view to force virtual list to render next batch
                  const lastRow = rows[rows.length - 1];
                  if (lastRow && typeof lastRow.scrollIntoView === 'function') {
                    // block: 'start' pushes the last known item to the top, revealing the next items below it
                    lastRow.scrollIntoView({ behavior: 'auto', block: 'start' });
                  }
                  rows.forEach(row => {
                    const titleEl = row.querySelector('.Meta_title__GGBnH');
                    const artistEl = row.querySelector('.Meta_artistCaption__JESZi');
                    const indexContainer = row.closest('[data-index]');
                    
                    if (titleEl) {
                      const title = titleEl.innerText.trim();
                      const artist = artistEl ? artistEl.innerText.trim() : '';
                      
                      let key = indexContainer ? parseInt(indexContainer.getAttribute('data-index'), 10) : (title + '::' + artist);
                      
                      if (!tracksMap.has(key)) {
                        tracksMap.set(key, { 
                          title, 
                          artist, 
                          index: indexContainer ? parseInt(indexContainer.getAttribute('data-index'), 10) : tracksMap.size 
                        });
                        foundAnyNew = true;
                      }
                    }
                  });
                } else {
                  // Fallback to simple matching if wrapper class is different
                  const titles = document.querySelectorAll('.Meta_title__GGBnH');
                  const artists = document.querySelectorAll('.Meta_artistCaption__JESZi');
                  titles.forEach((titleEl, i) => {
                     const title = titleEl.innerText.trim();
                     const artist = artists[i] ? artists[i].innerText.trim() : '';
                     const indexContainer = titleEl.closest('[data-index]');
                     
                     let key = indexContainer ? parseInt(indexContainer.getAttribute('data-index'), 10) : (title + '::' + artist);
                     if (!tracksMap.has(key)) {
                       tracksMap.set(key, { 
                         title, 
                         artist, 
                         index: indexContainer ? parseInt(indexContainer.getAttribute('data-index'), 10) : tracksMap.size 
                       });
                       foundAnyNew = true;
                     }
                  });
                }
                
                if (foundAnyNew) {
                  sameCountIterations = 0;
                } else {
                  sameCountIterations++;
                }
                
                // wait up to 2 seconds (10 * 200ms) for new items to load, or stop at max cap
                if (sameCountIterations > 10 || tracksMap.size >= 2500) {
                  clearInterval(interval);
                  
                  // Convert Map to array and sort by index
                  const tracks = Array.from(tracksMap.values())
                    .sort((a, b) => a.index - b.index)
                    .map(t => ({ title: t.title, artist: t.artist }));
                  
                  resolve(tracks);
                }
              }, 200); // 200ms fast interval for smooth small scrolling
            });
          `);
          hiddenWindow.destroy();
          resolve(result);
        } catch (error) {
          hiddenWindow.destroy();
          reject(error);
        }
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#000000",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#000000",
      symbolColor: "#ffffff",
      height: 36
    },
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--amymusic-proxy-port=${proxyPort}`]
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    writeMainErrorLog(
      "did-fail-load",
      new Error(`${errorCode} ${errorDescription} ${validatedURL || ""}`)
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeMainErrorLog("render-process-gone", new Error(JSON.stringify(details)));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("minimize", (event) => {
    if (!isTrayEnabled) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("close", (event) => {
    if (!isTrayEnabled || isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  if (isDev) {
    mainWindow.loadURL(process.env.AMYMUSIC_DEV_SERVER_URL || "http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: { amymusicProxyPort: String(proxyPort) }
    });
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerDesktopIpc();
  registerFileAssetFallback();
  await startProxyServer();

  // Restore persisted tray setting so close-to-tray works immediately after restart
  const savedConfig = readMainConfig();
  if (savedConfig.trayEnabled) {
    isTrayEnabled = true;
    createTray();
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  proxyServer?.close();
  tray?.destroy();
});
