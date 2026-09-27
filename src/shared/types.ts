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
}

// `error` is a user-facing message, shown to the editor as-is.
export type CreateDestFolderResult = { ok: true; path: string } | { ok: false; error: string }
