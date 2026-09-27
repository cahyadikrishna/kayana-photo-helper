// Turns match results into what the editor sees before copying:
// one row per identifier (problems first), sizes and totals.

import { getBaseName, type MatchResult } from './matching'

export type PreviewStatus = 'missing' | 'multiple' | 'found'

export interface PreviewRow {
  identifier: string
  files: string[]
  status: PreviewStatus
  // Distinct shots (base names); DSC0001.ARW + DSC0001.JPG is one shot.
  shots: number
  bytes: number
  // How many times the identifier appears in the pasted list (1 = no duplicate).
  duplicateCount: number
}

export interface Preview {
  rows: PreviewRow[]
  total: number
  found: number
  missing: number
  multiple: number
  // Unique files across all rows, so a file matched twice is counted once.
  fileCount: number
  totalBytes: number
  missingIds: string[]
}

const STATUS_ORDER: PreviewStatus[] = ['missing', 'multiple', 'found']

const countShots = (files: string[]): number => new Set(files.map(getBaseName)).size

// "multiple" means different shots matched (e.g. two cameras), not RAW + JPG of one shot.
const statusOf = (shots: number): PreviewStatus =>
  shots === 0 ? 'missing' : shots > 1 ? 'multiple' : 'found'

export function buildPreview(
  matches: MatchResult[],
  sizes: Map<string, number>,
  duplicates: Map<string, number>
): Preview {
  const sizeOf = (file: string): number => sizes.get(file) ?? 0

  const rows: PreviewRow[] = matches.map(({ identifier, files }) => {
    const shots = countShots(files)
    return {
      identifier,
      files,
      status: statusOf(shots),
      shots,
      bytes: files.reduce((sum, f) => sum + sizeOf(f), 0),
      duplicateCount: duplicates.get(identifier) ?? 1
    }
  })
  // Array.prototype.sort is stable, so input order is kept within each status
  rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  const uniqueFiles = new Set(matches.flatMap((m) => m.files))
  const missingIds = rows.filter((r) => r.status === 'missing').map((r) => r.identifier)

  return {
    rows,
    total: rows.length,
    found: rows.filter((r) => r.status === 'found').length,
    missing: missingIds.length,
    multiple: rows.filter((r) => r.status === 'multiple').length,
    fileCount: uniqueFiles.size,
    totalBytes: [...uniqueFiles].reduce((sum, f) => sum + sizeOf(f), 0),
    missingIds
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

// Decimal units (1 KB = 1000 B), matching what Finder shows.
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit++
  }
  const shown = unit > 0 && value < 10 ? Math.floor(value * 10) / 10 : Math.round(value)
  return `${shown} ${UNITS[unit]}`
}

// Text the admin can paste straight into the client chat.
export function missingListText(missingIds: string[]): string {
  return missingIds.length ? `Not found (${missingIds.length}): ${missingIds.join(', ')}` : ''
}
