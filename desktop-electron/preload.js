/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canvasV4Desktop", {
  getRuntimeStatus: () => ipcRenderer.invoke("canvas-v4:get-runtime-status"),
  start: () => ipcRenderer.invoke("canvas-v4:start"),
  stop: () => ipcRenderer.invoke("canvas-v4:stop"),
  openWorkspace: () => ipcRenderer.invoke("canvas-v4:open-workspace"),
  chooseWorkspace: () => ipcRenderer.invoke("canvas-v4:choose-workspace"),
  revealPrivateData: () => ipcRenderer.invoke("canvas-v4:reveal-private-data"),
  revealLogs: () => ipcRenderer.invoke("canvas-v4:reveal-logs-folder"),
  choosePrivateData: () => ipcRenderer.invoke("canvas-v4:choose-private-data"),
});
