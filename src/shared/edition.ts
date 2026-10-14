/**
 * Hangi urun derleniyor (docs/agent-ide/PRD.md bolum 12): ayni kaynaktan iki exe.
 * Derleme zamaninda `TERMFLOW_EDITION=ide` -> electron.vite.config.ts `define`. Testlerde ve
 * define olmayan derlemelerde 'lite'.
 */
declare const __TERMFLOW_EDITION__: string | undefined

export type Edition = 'lite' | 'ide'

export const EDITION: Edition = typeof __TERMFLOW_EDITION__ !== 'undefined' && __TERMFLOW_EDITION__ === 'ide' ? 'ide' : 'lite'

export interface ProductIdentity {
  name: string
  appId: string
  /** Kurucu/dosya adlarinda bosluksuz ad. */
  slug: string
}

export const PRODUCTS: Record<Edition, ProductIdentity> = {
  lite: { name: 'TermFlow Lite', appId: 'com.palamut62.termflowlite', slug: 'TermFlow-Lite' },
  ide: { name: 'TermFlow Agent IDE', appId: 'com.palamut62.termflowagentide', slug: 'TermFlow-Agent-IDE' }
}

export const PRODUCT = PRODUCTS[EDITION]
