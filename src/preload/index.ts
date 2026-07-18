import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getMods: () => ipcRenderer.invoke('get-mods'),
  getState: () => ipcRenderer.invoke('get-state'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  activateMod: (modId: string) => ipcRenderer.invoke('activate-mod', modId),
  deactivateMod: (modId: string) => ipcRenderer.invoke('deactivate-mod', modId),
  browseFolder: (type: 'gta' | 'fivem') => ipcRenderer.invoke('browse-folder', type),
  getModsDir: () => ipcRenderer.invoke('get-mods-dir'),
  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
  refreshMods: () => ipcRenderer.invoke('refresh-mods'),
  saveCustomMod: (modId: string, customData: { nameAr?: string; descriptionAr?: string }) => ipcRenderer.invoke('save-custom-mod', modId, customData),
  downloadMod: (modId: string) => ipcRenderer.invoke('download-mod', modId),
  onDownloadProgress: (callback: (data: { modId: string; progress: number }) => void) => {
    const listener = (_event: unknown, data: { modId: string; progress: number }): void => callback(data)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback
  window.electron = electronAPI
  // @ts-expect-error fallback
  window.api = api
}
