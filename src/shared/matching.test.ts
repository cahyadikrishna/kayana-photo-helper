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

describe('parseIdentifiers edge cases (#4)', () => {
  const ids = (input: string): string[] => parseIdentifiers(input).identifiers

  it('treats a bare filename as its number, not its extension', () => {
    expect(ids('3185.JPG')).toEqual(['3185'])
    expect(ids('3185.jpg\n3190.jpg')).toEqual(['3185', '3190'])
    expect(ids('DSC_0012.JPG')).toEqual(['DSC0012'])
    expect(ids('IMG_1234.CR3')).toEqual(['IMG1234'])
  })

  it('still strips list numbering like "1. 5504" and "1) 5504"', () => {
    expect(ids('1. 5504\n2) 5505\n10.   5506')).toEqual(['5504', '5505', '5506'])
  })

  it('keeps long letter prefixes whole', () => {
    expect(ids('WEDDING_3185')).toEqual(['WEDDING3185'])
    expect(ids('wedding-3185')).toEqual(['WEDDING3185'])
  })

  it('ignores OS duplicate suffixes like " (1)"', () => {
    expect(ids('IMG_1234 (1).jpg')).toEqual(['IMG1234'])
    expect(ids('3185 (2).JPG')).toEqual(['3185'])
  })

  it('keeps a parenthesised number that is not a duplicate suffix', () => {
    expect(ids('(3185)')).toEqual(['3185'])
  })

  it('dedupes pure numbers by value, keeping the first spelling', () => {
    const { identifiers, duplicates } = parseIdentifiers('0012\n12')
    expect(identifiers).toEqual(['0012'])
    expect(duplicates.get('0012')).toBe(2)
  })

  it('splits comma and space separated lists', () => {
    expect(ids('3185, 3190 3555')).toEqual(['3185', '3190', '3555'])
    expect(ids('3185,3190;3555\tKYN3600')).toEqual(['3185', '3190', '3555', 'KYN3600'])
  })

  it('handles mixed lines', () => {
    expect(ids('• 3185.jpg\n- DSC_0012\n3. kyn-3600, 3601\nIMG_1234 (1).jpg')).toEqual([
      '3185',
      'DSC0012',
      'KYN3600',
      '3601',
      'IMG1234'
    ])
  })
})

describe('AppleDouble / dotfiles (#5)', () => {
  it('isImageFile rejects dotfiles', () => {
    expect(isImageFile('._DSC03185.ARW')).toBe(false)
    expect(isImageFile('.DS_Store')).toBe(false)
    expect(isImageFile('.hidden.jpg')).toBe(false)
  })

  it('matchIdentifiers never matches AppleDouble companions', () => {
    const files = ['DSC03185.ARW', '._DSC03185.ARW', '._DSC03185.JPG', 'DSC03185.JPG']
    expect(matchIdentifiers(files, ['3185'], 'both')).toEqual([
      { identifier: '3185', files: ['DSC03185.ARW', 'DSC03185.JPG'] }
    ])
  })
})

describe('extensions (#3)', () => {
  it('recognises modern RAW formats as RAW, case-insensitively', () => {
    for (const f of ['DSC.CR3', 'dsc.cr3', 'DSC.NRW', 'DSC.SRW']) {
      expect(isImageFile(f)).toBe(true)
    }
    expect(selectFormats(['R5_0001.CR3', 'R5_0001.JPG'], 'raw')).toEqual(['R5_0001.CR3'])
  })

  it('recognises HEIC/HEIF as images but not RAW', () => {
    expect(isImageFile('IMG_0001.HEIC')).toBe(true)
    expect(isImageFile('IMG_0001.heif')).toBe(true)
    expect(selectFormats(['IMG_0001.HEIC', 'IMG_0001.DNG'], 'raw')).toEqual(['IMG_0001.DNG'])
    expect(selectFormats(['IMG_0001.HEIC', 'IMG_0001.DNG'], 'jpg')).toEqual(['IMG_0001.HEIC'])
  })

  it('matches CR3 files by number', () => {
    expect(matchIdentifiers(['R5_3185.CR3', 'R5_3185.xmp'], ['3185'], 'raw')).toEqual([
      { identifier: '3185', files: ['R5_3185.CR3'] }
    ])
  })
})
