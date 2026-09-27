// Shared identifier parsing and file matching.
// Imported by both the main process (actual copy) and the renderer (preview),
// so the preview always shows exactly what will be copied.
// Must stay free of Node/Electron/DOM APIs.

export type FormatPreference = 'raw' | 'jpg' | 'both'

export const RAW_EXTENSIONS = [
  '.arw',
  '.cr2',
  '.nef',
  '.dng',
  '.orf',
  '.pef',
  '.rw2',
  '.raw',
  '.raf'
]
export const JPEG_EXTENSIONS = ['.jpg', '.jpeg']
export const OTHER_EXTENSIONS = ['.png', '.tiff', '.tif']
export const IMAGE_EXTENSIONS = [...RAW_EXTENSIONS, ...JPEG_EXTENSIONS, ...OTHER_EXTENSIONS]

export interface MatchResult {
  identifier: string
  files: string[]
}

export const getExtension = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.substring(dot).toLowerCase()
}

export const getBaseName = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? filename : filename.substring(0, dot)
}

export const isRawFile = (filename: string): boolean =>
  RAW_EXTENSIONS.includes(getExtension(filename))

export const isJpegFile = (filename: string): boolean =>
  JPEG_EXTENSIONS.includes(getExtension(filename))

export const isImageFile = (filename: string): boolean =>
  IMAGE_EXTENSIONS.includes(getExtension(filename))

export function parseIdentifiers(input: string): {
  identifiers: string[]
  duplicates: Map<string, number>
} {
  const counts = new Map<string, number>()

  for (const line of input.split('\n')) {
    let cleanLine = line.trim()
    if (!cleanLine) continue
    cleanLine = cleanLine.replace(/^\d+\.\s*/, '')
    cleanLine = cleanLine.replace(/^[-•*]\s*/, '')
    cleanLine = cleanLine.trim()
    if (!cleanLine) continue

    const matches = cleanLine.match(/[A-Za-z]{2,6}[-_]?\d+|\d+/g)
    if (matches) {
      for (const m of matches) {
        const key = m.toUpperCase().replace(/([A-Z]{2,6})[-_](\d)/g, '$1$2')
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    } else {
      const key = cleanLine.toUpperCase()
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  const identifiers: string[] = []
  const duplicates = new Map<string, number>()
  for (const [key, count] of counts) {
    identifiers.push(key)
    if (count > 1) duplicates.set(key, count)
  }
  return { identifiers, duplicates }
}

const normalizeId = (s: string): string => s.toUpperCase().replace(/[-_]/g, '')

// Pure numbers match the trailing number of the base name (leading zeros ignored);
// alphanumeric identifiers must equal the base name ignoring case and - / _.
export function matchFileToIdentifier(file: string, identifier: string): boolean {
  const baseName = getBaseName(file)
  if (/^\d+$/.test(identifier)) {
    const trailingMatch = baseName.match(/(\d+)$/)
    return trailingMatch ? parseInt(trailingMatch[1], 10) === parseInt(identifier, 10) : false
  }
  return normalizeId(baseName) === normalizeId(identifier)
}

// Picks which formats of each shot to copy. Files are grouped by base name
// (DSC0001.ARW + DSC0001.JPG = one shot). If the preferred format is missing
// for a shot, falls back to what exists so no shot is silently dropped.
export function selectFormats(files: string[], preference: FormatPreference): string[] {
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const base = getBaseName(file)
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(file)
  }

  const selected: string[] = []
  for (const group of groups.values()) {
    if (preference === 'both') {
      selected.push(...group)
      continue
    }
    const raw = group.filter(isRawFile)
    const jpeg = group.filter(isJpegFile)
    const other = group.filter((f) => !isRawFile(f) && !isJpegFile(f))
    const order = preference === 'raw' ? [raw, other, jpeg] : [jpeg, other, raw]
    selected.push(...(order.find((g) => g.length > 0) ?? []))
  }
  return selected
}

export function matchIdentifiers(
  files: string[],
  identifiers: string[],
  preference: FormatPreference
): MatchResult[] {
  const imageFiles = files.filter(isImageFile)
  return identifiers.map((identifier) => ({
    identifier,
    files: selectFormats(
      imageFiles.filter((file) => matchFileToIdentifier(file, identifier)),
      preference
    )
  }))
}
