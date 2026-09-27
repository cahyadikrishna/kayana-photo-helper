// IPC contract shared by main, preload and renderer.

export interface SourceFile {
  name: string
  size: number
}

export interface CopyResults {
  success: { input: string; matched: string }[]
  failed: { input: string; matched: string; error: string }[]
  // Files not copied on purpose, e.g. already present in the destination.
  skipped: { input: string; matched: string; reason: string }[]
  notFound: string[]
  // Set when the editor pressed Cancel; files after that point were not attempted.
  cancelled?: boolean
  // Set when the job could not run at all (e.g. card unplugged). User-facing.
  error?: string
}

// What to do with files that already exist in the destination.
export type ConflictPolicy = 'skip' | 'replace'

export interface CopyProgress {
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
  current: string
}

// `error` is a user-facing message, shown to the editor as-is.
export type CreateDestFolderResult = { ok: true; path: string } | { ok: false; error: string }
