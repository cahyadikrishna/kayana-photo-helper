import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FormatPreference } from '../shared/matching'

// Custom APIs for renderer
const api = {
  selectFolder: (type: 'source' | 'destination') => ipcRenderer.invoke('select-folder', type),
  getSourceFiles: (sourceFolder: string) => ipcRenderer.invoke('get-source-files', sourceFolder),
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard-write', text),
  getFreeSpace: (target: string | null) => ipcRenderer.invoke('get-free-space', target),
  createDestFolder: (folderName: string) => ipcRenderer.invoke('create-dest-folder', folderName),
  copyFiles: (
    sourceFolder: string,
    destFolder: string,
    identifiers: string[],
    preference: FormatPreference
  ) => ipcRenderer.invoke('copy-files', sourceFolder, destFolder, identifiers, preference)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
