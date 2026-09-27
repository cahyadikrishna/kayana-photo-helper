import { describe, expect, it } from 'vitest'
import { resultHeadline, resultOutcome } from './results'
import type { CopyResults } from './types'

const empty: CopyResults = { success: [], failed: [], skipped: [], notFound: [] }
const ok = { input: '1', matched: 'DSC0001.ARW' }

describe('resultOutcome', () => {
  it('ok when everything copied', () => {
    expect(resultOutcome({ ...empty, success: [ok] })).toBe('ok')
  })

  it('issues when something was skipped, missing or failed alongside copies', () => {
    expect(resultOutcome({ ...empty, success: [ok], notFound: ['2'] })).toBe('issues')
    expect(resultOutcome({ ...empty, success: [ok], skipped: [{ ...ok, reason: 'x' }] })).toBe(
      'issues'
    )
  })

  it('none when nothing copied and something went wrong', () => {
    expect(resultOutcome({ ...empty, notFound: ['2'] })).toBe('none')
    expect(resultOutcome({ ...empty, failed: [{ ...ok, error: 'x' }] })).toBe('none')
  })

  it('cancelled and failed take priority', () => {
    expect(resultOutcome({ ...empty, success: [ok], cancelled: true })).toBe('cancelled')
    expect(resultOutcome({ ...empty, error: 'card gone' })).toBe('failed')
  })
})

describe('resultHeadline', () => {
  it('describes each outcome', () => {
    expect(resultHeadline({ ...empty, success: [ok, ok] })).toBe('All 2 files copied')
    expect(resultHeadline({ ...empty, success: [ok] })).toBe('All 1 file copied')
    expect(resultHeadline({ ...empty, success: [ok], notFound: ['2'] })).toBe(
      'Copy finished with issues'
    )
    expect(resultHeadline({ ...empty, notFound: ['2'] })).toBe('Nothing copied')
    expect(resultHeadline({ ...empty, success: [ok], cancelled: true })).toBe(
      'Cancelled — 1 file copied'
    )
    expect(resultHeadline({ ...empty, error: 'x' })).toBe('Copy failed')
  })
})
