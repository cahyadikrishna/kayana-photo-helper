import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { FormatPreference } from '../shared/matching'
import type { CopyResults, CreateDestFolderResult } from '../shared/types'
import { copyMatchedFiles, createDestFolder, getFreeSpace, listSourceFiles } from './copy'

// Must be set at module level (before app.whenReady) for macOS dock tooltip to work
app.setName('Kayana Photo Helper')

// Use a raster icon (PNG) placed in project's resources so main process can load it in dev and production
const iconPath = join(__dirname, '../../resources/icon.png')
const appIcon = nativeImage.createFromPath(iconPath)

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 900,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Provide an icon for Windows/Linux. On macOS the app bundle/dock icon is used instead.
    ...(process.platform === 'darwin' ? {} : { icon: appIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kayana.photo-helper')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set dock icon on macOS (works in dev and packaged app)
  if (process.platform === 'darwin') {
    try {
      app.dock?.setIcon(appIcon)
    } catch {
      // ignore in environments where dock is unavailable
    }
  }

  // IPC test
  ipcMain.on('ping', () => console.log('Hello from main process!'))

  // Handle folder selection
  ipcMain.handle('select-folder', async (_, type: 'source' | 'destination') => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: `Select ${type} folder`
    })

    if (result.canceled) {
      return null
    }

    return result.filePaths[0]
  })

  // Handle getting files from source folder
  ipcMain.handle('get-source-files', async (_, sourceFolder: string) => {
    try {
      return await listSourceFiles(sourceFolder)
    } catch (error) {
      console.error('Error reading source folder:', error)
      return []
    }
  })

  // Clipboard via the main process: navigator.clipboard in the renderer can
  // silently fail when the window isn't focused.
  ipcMain.handle('clipboard-read', () => clipboard.readText())
  ipcMain.handle('clipboard-write', (_, text: string) => clipboard.writeText(text))

  // Free space on the destination volume; no path means the Downloads folder
  ipcMain.handle('get-free-space', (_, target: string | null) =>
    getFreeSpace(target || join(homedir(), 'Downloads'))
  )

  // Handle creating destination folder in Downloads
  ipcMain.handle(
    'create-dest-folder',
    (_, folderName: string): Promise<CreateDestFolderResult> =>
      createDestFolder(join(homedir(), 'Downloads'), folderName)
  )

  // Handle file copying
  ipcMain.handle(
    'copy-files',
    (
      _,
      sourceFolder: string,
      destFolder: string,
      identifiers: string[],
      preference: FormatPreference
    ): Promise<CopyResults> => copyMatchedFiles(sourceFolder, destFolder, identifiers, preference)
  )

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
