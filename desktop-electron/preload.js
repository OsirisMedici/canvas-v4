/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osirisVaultDesktop", {
  getRuntimeStatus: () => ipcRenderer.invoke("osiris-vault:get-runtime-status"),
  startVault: () => ipcRenderer.invoke("osiris-vault:start"),
  stopVault: () => ipcRenderer.invoke("osiris-vault:stop"),
  revealDataFolder: () => ipcRenderer.invoke("osiris-vault:reveal-data-folder"),
  revealLogsFolder: () => ipcRenderer.invoke("osiris-vault:reveal-logs-folder"),
  chooseVaultFolder: () => ipcRenderer.invoke("osiris-vault:choose-vault-folder"),
});
