import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FormatPreference } from '../shared/matching'
import type { ConflictPolicy, CopyProgress } from '../shared/types'

// Custom APIs for renderer
const api = {
  selectFolder: (type: 'source' | 'destination', defaultPath?: string) =>
    ipcRenderer.invoke('select-folder', type, defaultPath),
  getSourceFiles: (sourceFolder: string) => ipcRenderer.invoke('get-source-files', sourceFolder),
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard-write', text),
  getFreeSpace: (target: string | null) => ipcRenderer.invoke('get-free-space', target),
  createDestFolder: (folderName: string) => ipcRenderer.invoke('create-dest-folder', folderName),
  copyFiles: (
    sourceFolder: string,
    destFolder: string,
    identifiers: string[],
    preference: FormatPreference,
    conflict: ConflictPolicy
  ) =>
    ipcRenderer.invoke('copy-files', sourceFolder, destFolder, identifiers, preference, conflict),
  cancelCopy: () => ipcRenderer.invoke('cancel-copy'),
  onCopyProgress: (callback: (progress: CopyProgress) => void) => {
    const listener = (_: Electron.IpcRendererEvent, progress: CopyProgress): void =>
      callback(progress)
    ipcRenderer.on('copy-progress', listener)
    return () => {
      ipcRenderer.removeListener('copy-progress', listener)
    }
  },
  findExistingFiles: (destFolder: string, files: string[]) =>
    ipcRenderer.invoke('find-existing-files', destFolder, files),
  describeDownloadsFolder: (folderName: string) =>
    ipcRenderer.invoke('describe-downloads-folder', folderName),
  openFolder: (folder: string) => ipcRenderer.invoke('open-folder', folder)
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
