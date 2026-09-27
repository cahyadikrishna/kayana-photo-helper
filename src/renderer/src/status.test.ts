import { describe, expect, it } from 'vitest'
import { footerStatus, type StatusInput } from './status'

const ready: StatusInput = {
  job: 'idle',
  outcome: null,
  hasSource: true,
  isScanning: false,
  hasDest: true,
  hasNumbers: true,
  fileCount: 3,
  notEnoughSpace: false
}

describe('footerStatus', () => {
  it('walks the editor through the form in order', () => {
    expect(footerStatus({ ...ready, hasSource: false, hasDest: false, hasNumbers: false })).toEqual(
      { label: 'Choose a source folder', tone: 'waiting' }
    )
    expect(footerStatus({ ...ready, isScanning: true }).label).toBe('Scanning folder…')
    expect(footerStatus({ ...ready, hasDest: false }).label).toBe('Choose a destination')
    expect(footerStatus({ ...ready, hasNumbers: false }).label).toBe('Paste photo numbers')
    expect(footerStatus({ ...ready, fileCount: 0 })).toEqual({
      label: 'No photos matched',
      tone: 'error'
    })
    expect(footerStatus({ ...ready, notEnoughSpace: true })).toEqual({
      label: 'Not enough space',
      tone: 'error'
    })
  })

  it('is ready when everything is filled in', () => {
    expect(footerStatus(ready)).toEqual({ label: 'Ready to copy', tone: 'ready' })
  })

  it('reflects a running or finished job', () => {
    expect(footerStatus({ ...ready, job: 'running' })).toEqual({
      label: 'Copying…',
      tone: 'running'
    })
    expect(footerStatus({ ...ready, job: 'done', outcome: 'ok' })).toEqual({
      label: 'Done',
      tone: 'done'
    })
    expect(footerStatus({ ...ready, job: 'done', outcome: 'issues' }).label).toBe(
      'Done with issues'
    )
    expect(footerStatus({ ...ready, job: 'done', outcome: 'cancelled' }).label).toBe('Cancelled')
    expect(footerStatus({ ...ready, job: 'done', outcome: 'none' }).tone).toBe('error')
    expect(footerStatus({ ...ready, job: 'error', outcome: 'failed' })).toEqual({
      label: 'Failed',
      tone: 'error'
    })
  })
})
