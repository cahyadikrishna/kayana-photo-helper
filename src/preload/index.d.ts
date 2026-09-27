import { ElectronAPI } from '@electron-toolkit/preload'
import type { FormatPreference } from '../shared/matching'
import type { CopyResults, CreateDestFolderResult } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectFolder: (type: 'source' | 'destination') => Promise<string | null>
      getSourceFiles: (sourceFolder: string) => Promise<string[]>
      createDestFolder: (folderName: string) => Promise<CreateDestFolderResult>
      copyFiles: (
        sourceFolder: string,
        destFolder: string,
        identifiers: string[],
        preference: FormatPreference
      ) => Promise<CopyResults>
    }
  }
}
