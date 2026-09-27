import { ElectronAPI } from '@electron-toolkit/preload'
import type { FormatPreference } from '../shared/matching'
import type {
  ConflictPolicy,
  CopyProgress,
  CopyResults,
  CreateDestFolderResult,
  SourceFile
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectFolder: (type: 'source' | 'destination', defaultPath?: string) => Promise<string | null>
      getSourceFiles: (sourceFolder: string) => Promise<SourceFile[]>
      readClipboard: () => Promise<string>
      writeClipboard: (text: string) => Promise<void>
      // Free bytes on the destination volume; null = Downloads folder. Null result if unknown.
      getFreeSpace: (target: string | null) => Promise<number | null>
      createDestFolder: (folderName: string) => Promise<CreateDestFolderResult>
      copyFiles: (
        sourceFolder: string,
        destFolder: string,
        identifiers: string[],
        preference: FormatPreference,
        conflict: ConflictPolicy
      ) => Promise<CopyResults>
      cancelCopy: () => Promise<void>
      // Returns an unsubscribe function
      onCopyProgress: (callback: (progress: CopyProgress) => void) => () => void
      findExistingFiles: (destFolder: string, files: string[]) => Promise<string[]>
      describeDownloadsFolder: (folderName: string) => Promise<{ fileCount: number } | null>
      // Resolves to an error message, or '' on success
      openFolder: (folder: string) => Promise<string>
    }
  }
}
