// How a finished copy job is summarised to the editor.
// Never claims success when nothing (or not everything) was copied.

import type { CopyResults } from './types'

export type ResultOutcome = 'ok' | 'issues' | 'none' | 'cancelled' | 'failed'

export function resultOutcome(results: CopyResults): ResultOutcome {
  if (results.error) return 'failed'
  if (results.cancelled) return 'cancelled'
  const problems = results.failed.length + results.notFound.length
  if (results.success.length === 0 && problems > 0) return 'none'
  if (problems + results.skipped.length > 0) return 'issues'
  return 'ok'
}

const files = (n: number): string => `${n} file${n !== 1 ? 's' : ''}`

export function resultHeadline(results: CopyResults): string {
  switch (resultOutcome(results)) {
    case 'failed':
      return 'Copy failed'
    case 'cancelled':
      return `Cancelled — ${files(results.success.length)} copied`
    case 'none':
      return 'Nothing copied'
    case 'issues':
      return 'Copy finished with issues'
    case 'ok':
      return `All ${files(results.success.length)} copied`
  }
}
