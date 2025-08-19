import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectFolder: (type: 'source' | 'destination') => Promise<string | null>
      getSourceFiles: (sourceFolder: string) => Promise<string[]>
      createDestFolder: (folderName: string) => Promise<string>
      copyFiles: (
        sourceFolder: string,
        destFolder: string,
        inputNumbers: string[]
      ) => Promise<{
        success: { input: string; matched: string }[]
        failed: { input: string; matched: string; error: string }[]
        notFound: string[]
      }>
    }
  }
}
