import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it } from 'vitest'
import { parseGrep, pathspecs, searchFiles } from './fileSearch'

let dir = ''
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

it('groups git grep -z output by file', () => {
  const result = parseGrep('a b.txt\x001\x00hello world\na b.txt\x002\x00foo Hello\nsub/c.md\x001\x00x hello\n', 'C:/r')
  expect(result.truncated).toBe(false)
  expect(result.files.map((f) => [f.path, f.matches.length])).toEqual([['a b.txt', 2], ['sub/c.md', 1]])
  expect(result.files[0]?.matches[1]).toEqual({ line: 2, text: 'foo Hello' })
})

it('turns include/exclude globs into pathspecs and drops flag-like input', () => {
  expect(pathspecs('*.ts, src/**', 'dist')).toEqual([':(glob)**/*.ts', ':(glob)src/**', ':(exclude,glob)**/dist'])
  expect(pathspecs('', 'node_modules')).toEqual(['.', ':(exclude,glob)**/node_modules'])
  expect(pathspecs('--output=x', '')).toEqual(['.'])
})

it('searches a plain folder outside git, honouring case and word options', async () => {
  dir = mkdtempSync(join(tmpdir(), 'termflow-search-'))
  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'a.txt'), 'Hello world\nhelloworld\n')
  writeFileSync(join(dir, 'sub', 'b.md'), 'say hello\n')
  const all = await searchFiles(dir, { text: 'hello' })
  expect(all.files.reduce((n, f) => n + f.matches.length, 0)).toBe(3)
  const exact = await searchFiles(dir, { text: 'hello', caseSensitive: true, word: true, include: '*.md' })
  expect(exact.files.map((f) => f.path)).toEqual(['sub/b.md'])
  expect((await searchFiles(dir, { text: '(', regex: true })).error).toBeTruthy()
})
