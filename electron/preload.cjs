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
  parsePlaylist: (url) => ipcRenderer.invoke("amymusic:parse-playlist-url", url)
});
