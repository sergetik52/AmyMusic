import react from "@vitejs/plugin-react";
import { HttpsProxyAgent } from "https-proxy-agent";
import https from "node:https";
import { defineConfig, loadEnv } from "vite";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requestUpstream(upstreamUrl, req, proxy, extraHeaders = {}) {
  return new Promise(async (resolve, reject) => {
    const body = req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await readRequestBody(req);

    const upstream = https.request(
      upstreamUrl,
      {
        method: req.method,
        agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
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

    upstream.on("error", reject);
    if (body) upstream.write(body);
    upstream.end();
  });
}

function maskSecrets(value) {
  return String(value)
    .replace(/client_id=([^&]+)/g, "client_id=***")
    .replace(/Authorization: Basic [^,\s]+/gi, "Authorization: Basic ***")
    .replace(/Authorization: Bearer [^,\s]+/gi, "Authorization: Bearer ***");
}

function requestOAuthToken({ clientId, clientSecret, proxy }) {
  return new Promise((resolve, reject) => {
    const body = "grant_type=client_credentials";
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const upstreamUrl = new URL("https://secure.soundcloud.com/oauth/token");

    const request = https.request(
      upstreamUrl,
      {
        method: "POST",
        agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
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

function createTokenManager({ env, pickProxy }) {
  let cachedToken = null;
  let expiresAt = 0;
  let pending = null;

  async function getAccessToken() {
    const clientId = env.VITE_SOUNDCLOUD_CLIENT_ID || "";
    const clientSecret = env.SOUNDCLOUD_CLIENT_SECRET || "";

    if (!clientSecret) {
      return "";
    }

    if (cachedToken && Date.now() < expiresAt - 60_000) {
      return cachedToken;
    }

    if (pending) {
      return pending;
    }

    pending = (async () => {
      const proxy = pickProxy();
      console.info("[AmyMusic:oauth] token request", {
        proxy: proxy || "direct",
        hasClientId: Boolean(clientId),
        hasSecret: Boolean(clientSecret)
      });

      const token = await requestOAuthToken({
        clientId,
        clientSecret,
        proxy
      });

      cachedToken = token.access_token || "";
      expiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;

      console.info("[AmyMusic:oauth] token received", {
        proxy: proxy || "direct",
        expiresIn: token.expires_in,
        hasAccessToken: Boolean(cachedToken)
      });

      pending = null;
      return cachedToken;
    })().catch((error) => {
      pending = null;
      console.error("[AmyMusic:oauth] token failed", {
        message: maskSecrets(error.message)
      });
      throw error;
    });

    return pending;
  }

  return { getAccessToken };
}

function createSoundCloudProxyPlugin(env) {
  const target = env.VITE_SOUNDCLOUD_PROXY_TARGET || "https://api-v2.soundcloud.com";
  const proxyList = (env.VITE_SOUNDCLOUD_HTTP_PROXIES || "")
    .split(",")
    .map((proxy) => proxy.trim())
    .filter(Boolean);
  let cursor = 0;

  function pickProxy() {
    if (!proxyList.length) return null;
    const proxy = proxyList[cursor % proxyList.length];
    cursor += 1;
    return proxy.startsWith("http://") || proxy.startsWith("https://")
      ? proxy
      : `http://${proxy}`;
  }

  function orderedProxies(firstProxy) {
    const normalized = proxyList.map((proxy) =>
      proxy.startsWith("http://") || proxy.startsWith("https://")
        ? proxy
        : `http://${proxy}`
    );
    if (!firstProxy) return [null];
    return [firstProxy, ...normalized.filter((proxy) => proxy !== firstProxy)];
  }

  function normalizeProxyList(value = "") {
    return String(value || "")
      .split(",")
      .map((proxy) => proxy.trim())
      .filter(Boolean)
      .map((proxy) =>
        proxy.startsWith("http://") || proxy.startsWith("https://")
          ? proxy
          : `http://${proxy}`
      );
  }

  const tokenManager = createTokenManager({ env, pickProxy });
  const runtimeTokenCache = new Map();

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

  return {
    name: "amymusic-soundcloud-proxy",
    configureServer(server) {
      server.middlewares.use("/api/soundcloud", async (req, res) => {
        const upstreamUrl = new URL(req.url || "/", target);
        const forceClientIdOnly = upstreamUrl.searchParams.get("_auth") === "client";
        const runtimeClientSecret = upstreamUrl.searchParams.get("_client_secret") || "";
        const runtimeProxies = normalizeProxyList(upstreamUrl.searchParams.get("_proxies") || "");
        const proxy = runtimeProxies[0] || pickProxy();
        upstreamUrl.searchParams.delete("_auth");
        upstreamUrl.searchParams.delete("_client_secret");
        upstreamUrl.searchParams.delete("_proxies");
        const startedAt = Date.now();

        console.info("[AmyMusic:proxy] request", {
          upstream: maskSecrets(upstreamUrl.toString()),
          proxy: proxy || "direct"
        });

        try {
          let response = null;
          let usedProxy = proxy;
          let lastError = null;
          let accessToken = "";

          if (!forceClientIdOnly && runtimeClientSecret) {
            try {
              accessToken = await getRuntimeAccessToken({
                clientId: upstreamUrl.searchParams.get("client_id") || "",
                clientSecret: runtimeClientSecret,
                proxy
              });
            } catch (error) {
              console.error("[AmyMusic:proxy] runtime oauth unavailable", {
                message: maskSecrets(error.message)
              });
            }
          } else if (!forceClientIdOnly) {
            try {
              accessToken = await tokenManager.getAccessToken();
            } catch (error) {
              console.error("[AmyMusic:proxy] oauth unavailable", {
                message: maskSecrets(error.message)
              });
            }
          } else {
            console.info("[AmyMusic:proxy] auth forced to client_id only");
          }

          const authHeaders = accessToken
            ? { authorization: `Bearer ${accessToken}` }
            : {};

          const proxyCandidates = runtimeProxies.length
            ? [proxy, ...runtimeProxies.filter((candidate) => candidate !== proxy)]
            : orderedProxies(proxy);

          for (const candidateProxy of proxyCandidates) {
            try {
              response = await requestUpstream(upstreamUrl, req, candidateProxy, authHeaders);
              usedProxy = candidateProxy;

              console.info("[AmyMusic:proxy] attempt", {
                status: response.statusCode,
                ms: Date.now() - startedAt,
                proxy: candidateProxy || "direct",
                auth: accessToken ? "bearer" : "client_id"
              });

              if (![403, 429, 500, 502, 503, 504].includes(response.statusCode)) {
                break;
              }
            } catch (error) {
              lastError = error;
              console.error("[AmyMusic:proxy] attempt failed", {
                message: error.message,
                proxy: candidateProxy || "direct"
              });
            }
          }

          if (!response && lastError) {
            throw lastError;
          }

          console.info("[AmyMusic:proxy] response", {
            status: response.statusCode,
            ms: Date.now() - startedAt,
            proxy: usedProxy || "direct"
          });

          res.statusCode = response.statusCode;
          Object.entries(response.headers).forEach(([key, value]) => {
            if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
              res.setHeader(key, value);
            }
          });

          res.end(response.body);
        } catch (error) {
          console.error("[AmyMusic:proxy] failed", {
            message: error.message,
            proxy: proxy || "direct",
            upstream: maskSecrets(upstreamUrl.toString())
          });

          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: "SOUNDCLOUD_PROXY_FAILED",
              message: error.message,
              proxy: proxy || "direct"
            })
          );
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: "./",
    server: {
      port: 5173,
      strictPort: true
    },
    plugins: [react(), createSoundCloudProxyPlugin(env)]
  };
});
