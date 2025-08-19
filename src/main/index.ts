import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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
      const files = await fs.readdir(sourceFolder)
      // Filter for common image formats
      const imageExtensions = [
        '.jpg',
        '.jpeg',
        '.png',
        '.tiff',
        '.tif',
        '.raw',
        '.cr2',
        '.nef',
        '.arw',
        '.dng',
        '.orf',
        '.pef',
        '.rw2'
      ]
      const imageFiles = files.filter((file) => {
        const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
        return imageExtensions.includes(ext)
      })
      return imageFiles
    } catch (error) {
      console.error('Error reading source folder:', error)
      return []
    }
  })

  // Handle creating destination folder in Downloads
  ipcMain.handle('create-dest-folder', async (_, folderName: string) => {
    try {
      const downloadsPath = join(homedir(), 'Downloads')
      const destPath = join(downloadsPath, folderName)

      // Create the folder if it doesn't exist
      await fs.mkdir(destPath, { recursive: true })

      return destPath
    } catch (error) {
      console.error('Error creating destination folder:', error)
      throw error
    }
  })

  // Handle file copying with fuzzy matching
  ipcMain.handle(
    'copy-files',
    async (_, sourceFolder: string, destFolder: string, inputNumbers: string[]) => {
      const results = {
        success: [] as { input: string; matched: string }[],
        failed: [] as { input: string; matched: string; error: string }[],
        notFound: [] as string[]
      }

      // Get all files from source folder
      const sourceFiles = await fs.readdir(sourceFolder)

      // Define file extensions with priority (RAW formats first)
      const rawExtensions = ['.arw', '.cr2', '.nef', '.dng', '.orf', '.pef', '.rw2', '.raw', '.raf']
      const jpegExtensions = ['.jpg', '.jpeg']
      const otherExtensions = ['.png', '.tiff', '.tif']
      const allExtensions = [...rawExtensions, ...jpegExtensions, ...otherExtensions]

      const imageFiles = sourceFiles.filter((file) => {
        const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
        return allExtensions.includes(ext)
      })

      // Helper function to get base filename (without extension)
      const getBaseName = (filename: string): string => {
        return filename.substring(0, filename.lastIndexOf('.'))
      }

      // Helper function to check if file is RAW format
      const isRawFile = (filename: string): boolean => {
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
        return rawExtensions.includes(ext)
      }

      // Helper function to prioritize RAW files when both RAW and JPG exist
      const prioritizeRawFiles = (matchingFiles: string[]): string[] => {
        const grouped = new Map<string, string[]>()

        // Group files by base name (filename without extension)
        for (const file of matchingFiles) {
          const baseName = getBaseName(file)
          if (!grouped.has(baseName)) {
            grouped.set(baseName, [])
          }
          grouped.get(baseName)!.push(file)
        }

        const prioritizedFiles: string[] = []

        // For each group, prefer RAW over JPG
        for (const [, files] of grouped) {
          const rawFiles = files.filter(isRawFile)
          const jpegFiles = files.filter((file) => {
            const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
            return jpegExtensions.includes(ext)
          })
          const otherFiles = files.filter((file) => {
            const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
            return otherExtensions.includes(ext)
          })

          // Priority: RAW > Other formats > JPEG (only if no RAW available)
          if (rawFiles.length > 0) {
            prioritizedFiles.push(...rawFiles)
          } else if (otherFiles.length > 0) {
            prioritizedFiles.push(...otherFiles)
          } else {
            prioritizedFiles.push(...jpegFiles)
          }
        }

        return prioritizedFiles
      }

      for (const inputNumber of inputNumbers) {
        try {
          // Find matching files that contain this number
          const matchingFiles = imageFiles.filter((file) => {
            // Extract numbers from filename
            const fileNumbers = file.match(/\d+/g) || []
            return fileNumbers.some((fileNum) => {
              // Convert both to integers for comparison to ignore leading zeros
              const inputNum = parseInt(inputNumber, 10)
              const fileNumInt = parseInt(fileNum, 10)

              // Check multiple matching strategies:
              // 1. Exact integer match (ignores leading zeros)
              // 2. String contains (for partial matches)
              // 3. Bidirectional contains (handles various cases)
              return (
                fileNumInt === inputNum ||
                fileNum.includes(inputNumber) ||
                inputNumber.includes(fileNum)
              )
            })
          })

          if (matchingFiles.length === 0) {
            results.notFound.push(inputNumber)
            continue
          }

          // Apply RAW file prioritization
          const prioritizedFiles = prioritizeRawFiles(matchingFiles)

          // Copy prioritized files
          for (const matchedFile of prioritizedFiles) {
            const sourcePath = join(sourceFolder, matchedFile)
            const destPath = join(destFolder, matchedFile)

            await fs.copyFile(sourcePath, destPath)
            results.success.push({ input: inputNumber, matched: matchedFile })
          }
        } catch (error) {
          console.error(`Failed to copy files for ${inputNumber}:`, error)
          const matchingFiles = imageFiles.filter((file) => {
            const fileNumbers = file.match(/\d+/g) || []
            return fileNumbers.some((fileNum) => {
              const inputNum = parseInt(inputNumber, 10)
              const fileNumInt = parseInt(fileNum, 10)
              return (
                fileNumInt === inputNum ||
                fileNum.includes(inputNumber) ||
                inputNumber.includes(fileNum)
              )
            })
          })

          if (matchingFiles.length > 0) {
            const prioritizedFiles = prioritizeRawFiles(matchingFiles)
            results.failed.push({
              input: inputNumber,
              matched: prioritizedFiles.join(', '),
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }
      }

      return results
    }
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
