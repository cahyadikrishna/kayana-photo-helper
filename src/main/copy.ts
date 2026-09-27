// File-system side of the copy job. No Electron imports so it can be unit tested.
import { constants, promises as fs } from 'fs'
import { dirname, join, resolve } from 'path'
import { isImageFile, matchIdentifiers, type FormatPreference } from '../shared/matching'
import type { CopyResults, CreateDestFolderResult, SourceFile } from '../shared/types'

const ILLEGAL_CHARS_MESSAGE = 'Folder name can\'t contain / \\ : * ? " < > |'

// Turns Node fs errors into short messages an editor can act on.
function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return 'Permission denied'
    case 'ENOSPC':
      return 'Destination is full'
    case 'ENOENT':
      return 'File or folder no longer exists'
    case 'EEXIST':
      return 'A file with that name already exists'
    case 'EROFS':
      return 'Destination is read-only'
    default:
      return error instanceof Error ? error.message : 'Unknown error'
  }
}

// Regular image files in the folder (not recursive), with sizes. Directories
// named like images, e.g. "DSC0001.JPG/", are ignored.
export async function listSourceFiles(sourceFolder: string): Promise<SourceFile[]> {
  const entries = await fs.readdir(sourceFolder, { withFileTypes: true })
  const images = entries.filter((e) => e.isFile() && isImageFile(e.name))
  return Promise.all(
    images.map(async (e) => ({
      name: e.name,
      size: (await fs.stat(join(sourceFolder, e.name))).size
    }))
  )
}

// Free bytes on the volume holding `target`. The folder may not exist yet
// (e.g. a new Downloads subfolder), so the nearest existing parent is used.
export async function getFreeSpace(target: string): Promise<number | null> {
  let dir = resolve(target)
  for (;;) {
    try {
      const stats = await fs.statfs(dir)
      return stats.bavail * stats.bsize
    } catch (error) {
      const parent = dirname(dir)
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' || parent === dir) return null
      dir = parent
    }
  }
}

export async function copyMatchedFiles(
  sourceFolder: string,
  destFolder: string,
  identifiers: string[],
  preference: FormatPreference
): Promise<CopyResults> {
  const results: CopyResults = { success: [], failed: [], skipped: [], notFound: [] }
  const sourceFiles = (await listSourceFiles(sourceFolder)).map((f) => f.name)

  for (const { identifier, files } of matchIdentifiers(sourceFiles, identifiers, preference)) {
    if (files.length === 0) {
      results.notFound.push(identifier)
      continue
    }
    // Per file, so every file lands in exactly one bucket
    for (const file of files) {
      try {
        await fs.copyFile(join(sourceFolder, file), join(destFolder, file), constants.COPYFILE_EXCL)
        results.success.push({ input: identifier, matched: file })
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
          results.skipped.push({
            input: identifier,
            matched: file,
            reason: 'Already exists in destination'
          })
        } else {
          console.error(`Failed to copy ${file} for ${identifier}:`, error)
          // COPYFILE_EXCL means any file at the destination is our partial copy
          // (e.g. disk full mid-copy); remove it so a rerun doesn't skip it as existing.
          await fs.rm(join(destFolder, file), { force: true }).catch(() => {})
          results.failed.push({ input: identifier, matched: file, error: describeFsError(error) })
        }
      }
    }
  }

  return results
}

// Returns a user-facing error message, or null when the name is usable.
export function validateFolderName(rawName: string): string | null {
  const name = rawName.trim()
  if (!name) return 'Enter a folder name'
  // eslint-disable-next-line no-control-regex
  if (/[/\\<>:"|?*\u0000-\u001f]/.test(name)) return ILLEGAL_CHARS_MESSAGE
  if (/^\.+$/.test(name)) return "Folder name can't be only dots"
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name)) {
    return `"${name}" is a reserved name on Windows — choose another name`
  }
  return null
}

// Creates (or reuses) <downloadsDir>/<folderName>.
export async function createDestFolder(
  downloadsDir: string,
  folderName: string
): Promise<CreateDestFolderResult> {
  const validationError = validateFolderName(folderName)
  if (validationError) return { ok: false, error: validationError }

  const base = resolve(downloadsDir)
  const destPath = resolve(base, folderName.trim())
  if (dirname(destPath) !== base) {
    return { ok: false, error: 'Folder must be directly inside Downloads' }
  }

  try {
    await fs.mkdir(destPath, { recursive: true })
    return { ok: true, path: destPath }
  } catch (error) {
    console.error('Error creating destination folder:', error)
    return { ok: false, error: `Couldn't create folder: ${describeFsError(error)}` }
  }
}
