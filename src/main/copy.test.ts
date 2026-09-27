import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  copyMatchedFiles,
  createDestFolder,
  describeDownloadsFolder,
  findExistingFiles,
  getFreeSpace,
  listSourceFiles,
  validateFolderName
} from './copy'

let root: string
let src: string
let dest: string

const touch = (dir: string, name: string, content = name): Promise<void> =>
  fs.writeFile(join(dir, name), content)

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'kayana-copy-'))
  src = join(root, 'src')
  dest = join(root, 'dest')
  await fs.mkdir(src)
  await fs.mkdir(dest)
})

afterEach(async () => {
  // Restore permissions changed by tests so cleanup can delete everything
  for (const name of await fs.readdir(src)) {
    await fs.chmod(join(src, name), 0o644).catch(() => {})
  }
  await fs.rm(root, { recursive: true, force: true })
})

describe('listSourceFiles', () => {
  it('returns only regular image files, with their sizes', async () => {
    await touch(src, 'DSC0001.ARW', 'x'.repeat(1234))
    await touch(src, 'notes.txt')
    await fs.mkdir(join(src, 'DSC0002.JPG'))
    expect(await listSourceFiles(src)).toEqual([{ name: 'DSC0001.ARW', size: 1234 }])
  })
})

describe('getFreeSpace', () => {
  it('returns free bytes for an existing folder', async () => {
    const free = await getFreeSpace(dest)
    expect(free).toBeGreaterThan(0)
  })

  it('uses the nearest existing parent for a folder not created yet', async () => {
    const free = await getFreeSpace(join(dest, 'not-yet', 'deeper'))
    expect(free).toBeGreaterThan(0)
  })
})

describe('copyMatchedFiles', () => {
  it('copies matched files and reports not found', async () => {
    await touch(src, 'DSC3185.ARW')
    const results = await copyMatchedFiles(src, dest, ['3185', '9999'], 'raw')
    expect(results.success).toEqual([{ input: '3185', matched: 'DSC3185.ARW' }])
    expect(results.notFound).toEqual(['9999'])
    expect(results.failed).toEqual([])
    expect(results.skipped).toEqual([])
    expect(await fs.readFile(join(dest, 'DSC3185.ARW'), 'utf8')).toBe('DSC3185.ARW')
  })

  it('never overwrites an existing destination file (skipped instead)', async () => {
    await touch(src, 'DSC3185.ARW', 'new')
    await touch(dest, 'DSC3185.ARW', 'original')
    const results = await copyMatchedFiles(src, dest, ['3185'], 'raw')
    expect(results.skipped).toEqual([
      { input: '3185', matched: 'DSC3185.ARW', reason: 'Already exists in destination' }
    ])
    expect(results.success).toEqual([])
    expect(results.failed).toEqual([])
    expect(await fs.readFile(join(dest, 'DSC3185.ARW'), 'utf8')).toBe('original')
  })

  it('puts each file in exactly one bucket when one of two files fails', async () => {
    await touch(src, 'DSC0001.ARW')
    await touch(src, 'DSC0001.JPG')
    await fs.chmod(join(src, 'DSC0001.JPG'), 0o000)
    const results = await copyMatchedFiles(src, dest, ['1'], 'both')
    expect(results.success).toEqual([{ input: '1', matched: 'DSC0001.ARW' }])
    expect(results.failed).toHaveLength(1)
    expect(results.failed[0]).toMatchObject({ input: '1', matched: 'DSC0001.JPG' })
    expect(results.failed[0].error).toBe('Permission denied')
    expect(results.skipped).toEqual([])
  })

  it('ignores directories that look like image files', async () => {
    await fs.mkdir(join(src, 'DSC0009.JPG'))
    const results = await copyMatchedFiles(src, dest, ['9'], 'raw')
    expect(results.notFound).toEqual(['9'])
    expect(results.failed).toEqual([])
  })
})

describe('copyMatchedFiles options', () => {
  it('replaces existing files when asked, leaving no temp files behind', async () => {
    await touch(src, 'DSC3185.ARW', 'new')
    await touch(dest, 'DSC3185.ARW', 'original')
    const results = await copyMatchedFiles(src, dest, ['3185'], 'raw', { conflict: 'replace' })
    expect(results.success).toEqual([{ input: '3185', matched: 'DSC3185.ARW' }])
    expect(results.skipped).toEqual([])
    expect(await fs.readFile(join(dest, 'DSC3185.ARW'), 'utf8')).toBe('new')
    expect(await fs.readdir(dest)).toEqual(['DSC3185.ARW'])
  })

  it('keeps the original when a replace fails', async () => {
    await touch(src, 'DSC3185.ARW', 'new')
    await fs.chmod(join(src, 'DSC3185.ARW'), 0o000)
    await touch(dest, 'DSC3185.ARW', 'original')
    const results = await copyMatchedFiles(src, dest, ['3185'], 'raw', { conflict: 'replace' })
    expect(results.failed).toHaveLength(1)
    expect(await fs.readFile(join(dest, 'DSC3185.ARW'), 'utf8')).toBe('original')
    expect(await fs.readdir(dest)).toEqual(['DSC3185.ARW'])
  })

  it('reports progress after every file with cumulative bytes', async () => {
    await touch(src, 'DSC0001.ARW', 'x'.repeat(10))
    await touch(src, 'DSC0002.ARW', 'x'.repeat(30))
    const events: unknown[] = []
    await copyMatchedFiles(src, dest, ['1', '2'], 'raw', { onProgress: (p) => events.push(p) })
    expect(events).toEqual([
      { done: 1, total: 2, bytesDone: 10, bytesTotal: 40, current: 'DSC0001.ARW' },
      { done: 2, total: 2, bytesDone: 40, bytesTotal: 40, current: 'DSC0002.ARW' }
    ])
  })

  it('stops after the current file when cancelled', async () => {
    await touch(src, 'DSC0001.ARW')
    await touch(src, 'DSC0002.ARW')
    await touch(src, 'DSC0003.ARW')
    const controller = new AbortController()
    const results = await copyMatchedFiles(src, dest, ['1', '2', '3'], 'raw', {
      signal: controller.signal,
      onProgress: () => controller.abort()
    })
    expect(results.cancelled).toBe(true)
    expect(results.success).toEqual([{ input: '1', matched: 'DSC0001.ARW' }])
    expect(await fs.readdir(dest)).toEqual(['DSC0001.ARW'])
  })

  it('returns a plain error instead of throwing when the source is gone', async () => {
    const results = await copyMatchedFiles(join(root, 'unplugged-card'), dest, ['1'], 'raw')
    expect(results.error).toBe("Can't read the source folder — is the card still connected?")
    expect(results.success).toEqual([])
  })
})

describe('findExistingFiles', () => {
  it('lists which files already exist in the destination', async () => {
    await touch(dest, 'DSC0001.ARW')
    expect(await findExistingFiles(dest, ['DSC0001.ARW', 'DSC0002.ARW'])).toEqual(['DSC0001.ARW'])
  })

  it('returns nothing when the destination does not exist yet', async () => {
    expect(await findExistingFiles(join(root, 'nope'), ['DSC0001.ARW'])).toEqual([])
  })
})

describe('describeDownloadsFolder', () => {
  it('returns null for a folder that does not exist', async () => {
    expect(await describeDownloadsFolder(root, 'new-client')).toBeNull()
  })

  it('counts the files in an existing folder', async () => {
    await touch(dest, 'a.jpg')
    await touch(dest, 'b.jpg')
    expect(await describeDownloadsFolder(root, 'dest')).toEqual({ fileCount: 2 })
  })

  it('returns null for invalid names', async () => {
    expect(await describeDownloadsFolder(root, '../dest')).toBeNull()
  })
})

describe('validateFolderName', () => {
  it('accepts a normal name', () => {
    expect(validateFolderName('Wedding Picks 2026-09')).toBeNull()
  })

  it.each(['', '   '])('rejects empty %j', (name) => {
    expect(validateFolderName(name)).toBe('Enter a folder name')
  })

  it.each(['a/b', 'a\\b', '../x', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0001b'])(
    'rejects illegal characters in %j',
    (name) => {
      expect(validateFolderName(name)).toBe('Folder name can\'t contain / \\ : * ? " < > |')
    }
  )

  it.each(['.', '..', '...'])('rejects dots-only name %j', (name) => {
    expect(validateFolderName(name)).toBe("Folder name can't be only dots")
  })

  it.each(['CON', 'nul', 'com1', 'LPT9.txt'])('rejects Windows reserved name %j', (name) => {
    expect(validateFolderName(name)).toBe(
      `"${name}" is a reserved name on Windows — choose another name`
    )
  })
})

describe('createDestFolder', () => {
  it('creates the folder as a direct child of Downloads, trimming the name', async () => {
    const result = await createDestFolder(root, '  Picks  ')
    expect(result).toEqual({ ok: true, path: join(root, 'Picks') })
    expect((await fs.stat(join(root, 'Picks'))).isDirectory()).toBe(true)
  })

  it('reuses an existing folder', async () => {
    await fs.mkdir(join(root, 'Picks'))
    expect(await createDestFolder(root, 'Picks')).toEqual({ ok: true, path: join(root, 'Picks') })
  })

  it('does not create anything outside Downloads', async () => {
    const result = await createDestFolder(join(root, 'Downloads'), '../escape')
    expect(result.ok).toBe(false)
    await expect(fs.stat(join(root, 'escape'))).rejects.toThrow()
  })

  it('returns a readable error when the folder cannot be created', async () => {
    await touch(root, 'Picks') // a file already occupies the name
    const result = await createDestFolder(root, 'Picks')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/^Couldn't create folder: /)
  })
})
