const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jobHunterDesktop', {
  isDesktop: true,
  getContext() {
    return ipcRenderer.invoke('desktop:get-context');
  },
  openWorkspace() {
    return ipcRenderer.invoke('desktop:open-workspace');
  },
  resetWorkspace() {
    return ipcRenderer.invoke('desktop:reset-workspace');
  },
});
