import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { copyMatchedFiles, createDestFolder, listSourceFiles, validateFolderName } from './copy'

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
  it('returns only regular image files', async () => {
    await touch(src, 'DSC0001.ARW')
    await touch(src, 'notes.txt')
    await fs.mkdir(join(src, 'DSC0002.JPG'))
    expect(await listSourceFiles(src)).toEqual(['DSC0001.ARW'])
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
