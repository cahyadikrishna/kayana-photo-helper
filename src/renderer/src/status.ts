// The footer status: tells the editor what happens next, in form order.

import type { ResultOutcome } from '../../shared/results'

export type JobStatus = 'idle' | 'running' | 'done' | 'error'

export type StatusTone = 'waiting' | 'ready' | 'running' | 'done' | 'error'

export interface StatusInput {
  job: JobStatus
  outcome: ResultOutcome | null
  hasSource: boolean
  isScanning: boolean
  hasDest: boolean
  hasNumbers: boolean
  fileCount: number
  notEnoughSpace: boolean
}

const DONE_LABEL: Record<ResultOutcome, string> = {
  ok: 'Done',
  issues: 'Done with issues',
  none: 'Nothing copied',
  cancelled: 'Cancelled',
  failed: 'Failed'
}

export function footerStatus(input: StatusInput): { label: string; tone: StatusTone } {
  const { job, outcome } = input
  if (job === 'running') return { label: 'Copying…', tone: 'running' }
  if ((job === 'done' || job === 'error') && outcome) {
    const failed = outcome === 'failed' || outcome === 'none'
    return { label: DONE_LABEL[outcome], tone: failed ? 'error' : 'done' }
  }

  if (!input.hasSource) return { label: 'Choose a source folder', tone: 'waiting' }
  if (input.isScanning) return { label: 'Scanning folder…', tone: 'waiting' }
  if (!input.hasDest) return { label: 'Choose a destination', tone: 'waiting' }
  if (!input.hasNumbers) return { label: 'Paste photo numbers', tone: 'waiting' }
  if (input.fileCount === 0) return { label: 'No photos matched', tone: 'error' }
  if (input.notEnoughSpace) return { label: 'Not enough space', tone: 'error' }
  return { label: 'Ready to copy', tone: 'ready' }
}
