import { describe, expect, it } from 'vitest'
import {
  isImageFile,
  matchFileToIdentifier,
  matchIdentifiers,
  parseIdentifiers,
  selectFormats
} from './matching'

describe('parseIdentifiers', () => {
  it('parses plain numbers, list bullets and numbering', () => {
    expect(parseIdentifiers('3185\n• 3190\n- 3555\n1. 5504').identifiers).toEqual([
      '3185',
      '3190',
      '3555',
      '5504'
    ])
  })

  it('normalises prefixed identifiers', () => {
    expect(parseIdentifiers('DSC_0012\nkyn-3185').identifiers).toEqual(['DSC0012', 'KYN3185'])
  })

  it('reports duplicates', () => {
    const { identifiers, duplicates } = parseIdentifiers('3185\n3185\n3190')
    expect(identifiers).toEqual(['3185', '3190'])
    expect(duplicates.get('3185')).toBe(2)
  })
})

describe('matchFileToIdentifier', () => {
  it('matches pure numbers against the trailing number, ignoring leading zeros', () => {
    expect(matchFileToIdentifier('ZVE01503.JPG', '1503')).toBe(true)
    expect(matchFileToIdentifier('WED_3185.ARW', '3185')).toBe(true)
    expect(matchFileToIdentifier('WED_13185.ARW', '3185')).toBe(false)
  })

  it('matches alphanumeric identifiers by exact base name', () => {
    expect(matchFileToIdentifier('DSC_0012.JPG', 'DSC0012')).toBe(true)
    expect(matchFileToIdentifier('DSC_00123.JPG', 'DSC0012')).toBe(false)
  })
})

describe('isImageFile', () => {
  it('accepts Fujifilm RAF (was missing from the preview list)', () => {
    expect(isImageFile('DSCF3185.RAF')).toBe(true)
  })
})

describe('selectFormats', () => {
  const shot = ['DSC0001.ARW', 'DSC0001.JPG']

  it('raw: keeps only RAW when both exist', () => {
    expect(selectFormats(shot, 'raw')).toEqual(['DSC0001.ARW'])
  })

  it('jpg: keeps only JPG when both exist', () => {
    expect(selectFormats(shot, 'jpg')).toEqual(['DSC0001.JPG'])
  })

  it('both: keeps every format', () => {
    expect(selectFormats(shot, 'both')).toEqual(shot)
  })

  it('falls back to what exists when the preferred format is missing', () => {
    expect(selectFormats(['DSC0002.JPG'], 'raw')).toEqual(['DSC0002.JPG'])
    expect(selectFormats(['DSC0003.ARW'], 'jpg')).toEqual(['DSC0003.ARW'])
  })

  it('decides per shot, not across the whole match set', () => {
    expect(selectFormats(['A_1.ARW', 'A_1.JPG', 'B_1.JPG'], 'raw')).toEqual(['A_1.ARW', 'B_1.JPG'])
  })
})

describe('matchIdentifiers', () => {
  it('ignores non-image files and reports empty matches', () => {
    const files = ['DSC3185.ARW', 'DSC3185.JPG', 'DSC3185.XMP', 'notes.txt']
    expect(matchIdentifiers(files, ['3185', '9999'], 'raw')).toEqual([
      { identifier: '3185', files: ['DSC3185.ARW'] },
      { identifier: '9999', files: [] }
    ])
  })
})
