// Shared identifier parsing and file matching.
// Imported by both the main process (actual copy) and the renderer (preview),
// so the preview always shows exactly what will be copied.
// Must stay free of Node/Electron/DOM APIs.

export type FormatPreference = 'raw' | 'jpg' | 'both'

export const RAW_EXTENSIONS = [
  '.arw',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.dng',
  '.orf',
  '.pef',
  '.rw2',
  '.raw',
  '.raf',
  '.srw'
]
export const JPEG_EXTENSIONS = ['.jpg', '.jpeg']
export const OTHER_EXTENSIONS = ['.png', '.tiff', '.tif', '.heic', '.heif']
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

// Dotfiles are never photos; this also skips macOS AppleDouble companions
// (._DSC0001.ARW) that appear on exFAT/FAT32 SD cards.
export const isImageFile = (filename: string): boolean =>
  !filename.startsWith('.') && IMAGE_EXTENSIONS.includes(getExtension(filename))

// "1. 5504" / "1) 5504" — requires whitespace so "3185.JPG" is left alone
const LIST_NUMBERING = /^\d+[.)]\s+/
const BULLET = /^[-•*]\s*/
const IMAGE_EXTENSION_SUFFIX = new RegExp(
  `\\.(${IMAGE_EXTENSIONS.map((e) => e.slice(1)).join('|')})\\b`,
  'gi'
)
// OS duplicate-copy suffix, e.g. "IMG_1234 (1).jpg"
const DUPLICATE_SUFFIX = /(?<=[A-Za-z0-9])\s*\(\d{1,3}\)/g
const TOKEN = /[A-Za-z]+[-_]?\d+|\d+/g

// Pure numbers are compared by value, so "0012" and "12" are the same identifier.
const dedupeKey = (id: string): string => (/^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : id)

export function parseIdentifiers(input: string): {
  identifiers: string[]
  duplicates: Map<string, number>
} {
  // dedupe key -> first spelling seen + count
  const seen = new Map<string, { identifier: string; count: number }>()
  const add = (identifier: string): void => {
    const key = dedupeKey(identifier)
    const entry = seen.get(key)
    if (entry) entry.count++
    else seen.set(key, { identifier, count: 1 })
  }

  for (const line of input.split('\n')) {
    const cleanLine = line
      .trim()
      .replace(LIST_NUMBERING, '')
      .replace(BULLET, '')
      .replace(IMAGE_EXTENSION_SUFFIX, '')
      .replace(DUPLICATE_SUFFIX, '')
      .trim()
    if (!cleanLine) continue

    const tokens = cleanLine.match(TOKEN)
    if (tokens) {
      for (const token of tokens) add(token.toUpperCase().replace(/^([A-Z]+)[-_](\d)/, '$1$2'))
    } else {
      add(cleanLine.toUpperCase())
    }
  }

  const identifiers: string[] = []
  const duplicates = new Map<string, number>()
  for (const { identifier, count } of seen.values()) {
    identifiers.push(identifier)
    if (count > 1) duplicates.set(identifier, count)
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
