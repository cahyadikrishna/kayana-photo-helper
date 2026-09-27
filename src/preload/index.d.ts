import { ElectronAPI } from '@electron-toolkit/preload'
import type { FormatPreference } from '../shared/matching'
import type { CopyResults, CreateDestFolderResult, SourceFile } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectFolder: (type: 'source' | 'destination') => Promise<string | null>
      getSourceFiles: (sourceFolder: string) => Promise<SourceFile[]>
      // Free bytes on the destination volume; null = Downloads folder. Null result if unknown.
      readClipboard: () => Promise<string>
      writeClipboard: (text: string) => Promise<void>
      getFreeSpace: (target: string | null) => Promise<number | null>
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
