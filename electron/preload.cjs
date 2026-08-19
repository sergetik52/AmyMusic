const { contextBridge, ipcRenderer } = require("electron");

const portArg = process.argv.find((arg) => arg.startsWith("--amymusic-proxy-port="));
const proxyPort = portArg ? portArg.split("=")[1] : "";

contextBridge.exposeInMainWorld("amyMusicConfig", {
  soundCloudApiBase: proxyPort
    ? `http://127.0.0.1:${proxyPort}/api/soundcloud`
    : "/api/soundcloud"
});

contextBridge.exposeInMainWorld("amyMusicDesktop", {
  getAutoLaunch: () => ipcRenderer.invoke("amymusic:get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("amymusic:set-auto-launch", Boolean(enabled)),
  setTrayEnabled: (enabled) => ipcRenderer.invoke("amymusic:set-tray-enabled", Boolean(enabled)),
  showWindow: () => ipcRenderer.invoke("amymusic:show-window"),
  parsePlaylist: (url) => ipcRenderer.invoke("amymusic:parse-playlist-url", url),
  getBandlinkChart: () => ipcRenderer.invoke("amymusic:get-bandlink-chart"),
  setDiscordActivity: (activity) => ipcRenderer.invoke("amymusic:set-discord-activity", activity),
  setDiscordBotToken: (token) => ipcRenderer.invoke("amymusic:set-discord-bot-token", token),
  getDiscordBotToken: () => ipcRenderer.invoke("amymusic:get-discord-bot-token"),
  getAppVersion: () => ipcRenderer.invoke("amymusic:get-app-version"),
  checkUpdate: () => ipcRenderer.invoke("amymusic:check-update"),
  startUpdate: () => ipcRenderer.invoke("amymusic:start-update"),
  toggleOverlay: () => ipcRenderer.invoke("amymusic:toggle-overlay"),
  resizeOverlay: (width, height) => ipcRenderer.invoke("amymusic:resize-overlay", width, height),
  onUpdateProgress: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on("amymusic:update-progress", subscription);
    return () => ipcRenderer.removeListener("amymusic:update-progress", subscription);
  }
});
