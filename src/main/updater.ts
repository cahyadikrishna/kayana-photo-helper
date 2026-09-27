import { app, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'

const RELEASES_URL =
  'https://github.com/cahyadikrishna/kayana-photo-helper-releases/releases/latest'

// Checks the releases repo once on launch. Windows downloads the update in the
// background and installs it on restart. Unsigned macOS builds can't install
// updates themselves (Squirrel.Mac requires a code signature), so there we only
// point the user to the download page.
export function setupAutoUpdates(isBusy: () => boolean): void {
  if (!app.isPackaged) return

  const canInstall = process.platform !== 'darwin'
  autoUpdater.autoDownload = canInstall

  autoUpdater.on('update-available', async (info) => {
    if (canInstall) return
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Kayana Photo Helper ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Download the new version and replace the app in Applications.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) shell.openExternal(RELEASES_URL)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    // Don't interrupt a copy; the update still installs when the app quits
    if (isBusy()) return
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Kayana Photo Helper ${info.version} is ready to install`,
      detail: 'Restart now to update, or it will install the next time you close the app.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0 && !isBusy()) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (error) => console.error('Auto-update failed:', error))

  autoUpdater.checkForUpdates().catch((error) => console.error('Update check failed:', error))
}
