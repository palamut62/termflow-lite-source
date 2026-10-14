import { describe, expect, it } from 'vitest'
import { parseThemeFile } from './themeImport'

const ANSI = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']

describe('parseThemeFile', () => {
  it('reads a Windows Terminal scheme and maps purple to magenta', () => {
    const scheme = { name: 'Campbell X', background: '#0C0C0C', foreground: '#CCCCCC', cursorColor: '#FFFFFF', selectionBackground: '#FFFFFF',
      black: ANSI[0], red: ANSI[1], green: ANSI[2], yellow: ANSI[3], blue: ANSI[4], purple: ANSI[5], cyan: ANSI[6], white: ANSI[7],
      brightBlack: ANSI[8], brightRed: ANSI[9], brightGreen: ANSI[10], brightYellow: ANSI[11], brightBlue: ANSI[12], brightPurple: ANSI[13], brightCyan: ANSI[14], brightWhite: ANSI[15] }
    const result = parseThemeFile('x.json', JSON.stringify({ schemes: [scheme] }))
    expect(result).toMatchObject({ name: 'Campbell X', colors: { background: '#0c0c0c', magenta: '#bc3fbc', brightMagenta: '#d670d6', cursor: '#ffffff' } })
  })

  it('reads an iTerm2 .itermcolors plist', () => {
    const entry = (key: string, r: number, g: number, b: number): string =>
      `<key>${key}</key><dict><key>Blue Component</key><real>${b}</real><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`
    const body = Array.from({ length: 16 }, (_, i) => entry(`Ansi ${i} Color`, i / 15, 0, 1)).join('')
      + entry('Background Color', 0, 0, 0) + entry('Foreground Color', 1, 1, 1)
    const result = parseThemeFile('Dracula.itermcolors', `<?xml version="1.0"?><plist><dict>${body}</dict></plist>`)
    expect(result).toMatchObject({ name: 'Dracula', colors: { black: '#0000ff', brightWhite: '#ff00ff', background: '#000000', foreground: '#ffffff' } })
    if ('colors' in result) expect(result.colors.cursor).toBe('#ffffff')
  })

  it('reads a Ghostty theme with comments and hex values', () => {
    const text = ['# my theme', ...ANSI.map((c, i) => `palette = ${i}=${c}`), 'background = #1d1f21', 'foreground = c5c8c6', 'cursor-color = #aeafad'].join('\n')
    expect(parseThemeFile('tomorrow', text)).toMatchObject({ colors: { background: '#1d1f21', foreground: '#c5c8c6', cursor: '#aeafad', red: '#cd3131' } })
  })

  it('names what is missing and rejects unknown formats', () => {
    expect(parseThemeFile('a.json', '{"background":"#000000"}')).toMatchObject({ error: expect.stringContaining('missing') })
    expect(parseThemeFile('a.txt', 'hello')).toMatchObject({ error: expect.stringContaining('Unknown theme format') })
    expect(parseThemeFile('a.json', '{bad')).toEqual({ error: 'The JSON file could not be read.' })
  })
})
