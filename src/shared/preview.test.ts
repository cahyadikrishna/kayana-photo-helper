import { describe, expect, it } from 'vitest'
import { buildPreview, formatBytes, missingListText } from './preview'

describe('buildPreview', () => {
  const sizes = new Map([
    ['DSC03185.ARW', 25_000_000],
    ['DSC03190.ARW', 30_000_000],
    ['A_3202.ARW', 20_000_000],
    ['B_3202.ARW', 22_000_000]
  ])

  const matches = [
    { identifier: '3185', files: ['DSC03185.ARW'] },
    { identifier: '3519', files: [] },
    { identifier: '3202', files: ['A_3202.ARW', 'B_3202.ARW'] },
    { identifier: '3190', files: ['DSC03190.ARW'] },
    { identifier: '4410', files: [] }
  ]

  it('sorts problems first, keeping input order within each group', () => {
    const { rows } = buildPreview(matches, sizes, new Map())
    expect(rows.map((r) => [r.identifier, r.status])).toEqual([
      ['3519', 'missing'],
      ['4410', 'missing'],
      ['3202', 'multiple'],
      ['3185', 'found'],
      ['3190', 'found']
    ])
  })

  it('sums sizes per row and overall', () => {
    const preview = buildPreview(matches, sizes, new Map())
    expect(preview.rows.find((r) => r.identifier === '3202')?.bytes).toBe(42_000_000)
    expect(preview.totalBytes).toBe(97_000_000)
    expect(preview.fileCount).toBe(4)
  })

  it('counts each group and lists missing identifiers in input order', () => {
    const preview = buildPreview(matches, sizes, new Map())
    expect(preview).toMatchObject({ total: 5, found: 2, missing: 2, multiple: 1 })
    expect(preview.missingIds).toEqual(['3519', '4410'])
  })

  it('attaches duplicate counts from the input', () => {
    const { rows } = buildPreview(matches, sizes, new Map([['3185', 2]]))
    expect(rows.find((r) => r.identifier === '3185')?.duplicateCount).toBe(2)
    expect(rows.find((r) => r.identifier === '3190')?.duplicateCount).toBe(1)
  })

  it('counts a file matched by two identifiers once in the totals', () => {
    const preview = buildPreview(
      [
        { identifier: '3185', files: ['DSC03185.ARW'] },
        { identifier: 'DSC03185', files: ['DSC03185.ARW'] }
      ],
      sizes,
      new Map()
    )
    expect(preview.fileCount).toBe(1)
    expect(preview.totalBytes).toBe(25_000_000)
  })

  it('treats RAW + JPG of the same shot as found, not multiple', () => {
    const { rows } = buildPreview(
      [{ identifier: '3185', files: ['DSC03185.ARW', 'DSC03185.JPG'] }],
      sizes,
      new Map()
    )
    expect(rows[0].status).toBe('found')
  })

  it('treats unknown sizes as 0', () => {
    const preview = buildPreview([{ identifier: '1', files: ['X_1.ARW'] }], new Map(), new Map())
    expect(preview.totalBytes).toBe(0)
  })
})

describe('formatBytes', () => {
  it('uses decimal units like Finder', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(25_000)).toBe('25 KB')
    expect(formatBytes(25_400_000)).toBe('25 MB')
    expect(formatBytes(1_234_000_000)).toBe('1.2 GB')
    expect(formatBytes(2_500_000_000_000)).toBe('2.5 TB')
  })

  it('keeps one decimal below 10 in a unit', () => {
    expect(formatBytes(1_500_000)).toBe('1.5 MB')
    expect(formatBytes(9_950_000)).toBe('9.9 MB')
  })
})

describe('missingListText', () => {
  it('formats a chat-ready line', () => {
    expect(missingListText(['3519', '3602', '4410'])).toBe('Not found (3): 3519, 3602, 4410')
  })

  it('is empty when nothing is missing', () => {
    expect(missingListText([])).toBe('')
  })
})
