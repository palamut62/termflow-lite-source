# Orca karsilastirmasi - Yetenek haritasi ve ortak spec

Durum: TASLAK 2026-10-14, onay bekliyor. Kaynak: onorca.dev dokumanlari + changelog (1.4.224'e kadar).
Kapsam: Orca'da olup TermFlow Lite'ta olmayan, "cok iyi bir terminal" cizgisini bozmayan ozellikler.

Kapsam DISI (kullanici karari 2026-10-14, bu dosyalarda yok): diff goruntuleyici / AI diff yorumu,
Monaco editoru, gomulu Chromium / Design Mode, GitHub-Linear-Jira panelleri, orchestration,
uygulamayi kumanda eden CLI, Native Chat / CSV / Jupyter, hesap degistirici.

## Yetenek haritasi

| Modul id | Sorumluluk | Bagimli | Spec |
|---|---|---|---|
| agent-hooks | Ajan durumunu (calisiyor / onay bekliyor / bitti) ajanin kendi hook ve bildirimlerinden okumak; oturum kimligi, konusma adi | - | [agent-hooks.md](agent-hooks.md) |
| agent-attention | Ajan bitti / seni bekliyor: sistem bildirimi, ses, okunmadi durumu, zil listesi, gorev cubugu rozeti | agent-hooks | [agent-attention.md](agent-attention.md) |
| scrollback-restore | Terminal icerigini yeniden acilista geri getirmek | - | [scrollback-restore.md](scrollback-restore.md) |
| agent-resume | Geri yuklenen ajan sekmesini kendi oturumuyla (`--resume`) surdurmek | agent-hooks | [agent-resume.md](agent-resume.md) |
| usage-meter | Claude / Codex 5 saatlik ve haftalik limit, sifirlanma saati, %80 uyarisi | agent-hooks | [usage-meter.md](usage-meter.md) |
| terminal-polish | Reset Terminal, OSC 52 pano, Shift+Enter, link menusu, tema ice aktarma, minimum kontrast, Copy Session ID | agent-hooks (yalniz Copy Session ID) | [terminal-polish.md](terminal-polish.md) |
| jump-palette | Ctrl+Shift+J: sekme/oturum atlama, once seni bekleyenler | agent-attention | [jump-palette.md](jump-palette.md) |
| worktree-setup | Worktree acildiktan sonra dosya kopyalama + kurulum komutlari | - | [worktree-setup.md](worktree-setup.md) |
| worktree-note | Worktree / sekme durum notu ve asama (todo, in-progress, review, done) | agent-hooks | [worktree-note.md](worktree-note.md) |
| agent-hibernate | Bostaki arka plan ajanlarini uyutup sekmeye donunce surdurmek | agent-hooks, scrollback-restore, agent-resume | [agent-hibernate.md](agent-hibernate.md) |
| agent-race | Ayni prompt'u N ajana, her biri kendi worktree'sinde; karsilastir, birini tut | agent-attention, worktree-setup | [agent-race.md](agent-race.md) |
| scheduled-prompts | Kayitli komutlara zamanlanmis ajan prompt'u, on kontrol, kacirilan calisma toleransi | agent-race (prompt'la baslatma) | [scheduled-prompts.md](scheduled-prompts.md) |
| remote-attention | Telefonda "ajan bitti / onay bekliyor" bildirimi | agent-attention | [remote-attention.md](remote-attention.md) |

Dongu yok; oklar tek yonlu.

## Yapim sirasi ve surumler

1. **1.24.0**: agent-hooks -> agent-attention (+ terminal-polish paralel)
2. **1.25.0**: scrollback-restore, agent-resume, usage-meter
3. **1.26.0**: jump-palette, worktree-setup, worktree-note
4. **1.27.0**: agent-hibernate, agent-race, scheduled-prompts, remote-attention

Her surum yeni ozellik oldugu icin surum artar, CHANGELOG yazilir, CI ile yayinlanir
(PROJE-REHBER "Surum kurali"). Bir modul tek basina da yayinlanabilir.

## Ortak spec (tum moduller icin gecerli)

### Teknoloji
Electron 39, React 18 + TypeScript, xterm.js 6 (WebGL), `@lydell/node-pty`, Zustand, electron-vite,
vitest, Playwright. Yeni bagimlilik yalniz `@xterm/addon-serialize` (scrollback-restore) icin onerilir.

### Komutlar
- Gelistirme: `npm run dev`
- Birim: `npm test` (tek dosya: `npx vitest run src/main/agentHooks/hookEvents.test.ts`)
- Tam dogrulama: `npm run verify` (vitest + tsc + build)
- E2E: `npm run test:e2e` (~8 dk) ya da tek dosya `npx playwright test e2e/<modul>.spec.ts` (build sonrasi)
- Paket: `npm run dist:win`; yayin: `npm run release:tag`

### Proje yapisi (yeni dosyalarin yeri)
- `src/main/<modul>/` ana surec mantigi (ag, dosya, surec). Saf fonksiyonlar Electron'a bagimli olmaz ki test edilebilsin.
- `src/main/ipc/<modul>.ts` IPC kayitlari; kanal adlari `src/shared/ipc.ts`.
- `src/shared/` iki surecin paylastigi tip ve saf dogrulama (`types.ts` AppSettings + DEFAULT_SETTINGS).
- `src/renderer/src/components|terminal|store|settings/` arayuz.
- Ajanlarin calistirdigi betikler `src/main/agentHooks/*Entry.ts` -> esbuild ile `out/hooks/*.cjs`
  (Memory MCP sunucusunun `build:mcp` deseni), ajanlar uygulamanin kendi exe'siyle `ELECTRON_RUN_AS_NODE=1` calistirir.
- Spec'ler bu klasorde; tamamlaninca PROJE-REHBER "Verilmis kararlar" ve "Hangi istek icin nereye bakilir" guncellenir.

### Kod stili
Mevcut desen: saf mantik ayri dosyada ve testli, IPC girdileri ana surecte dogrulanir, yorumlar Turkce ve yalniz "neden".

```ts
// src/main/ipc/window.ts deseni: payload ana surecte dogrulanir, metin kisaltilir.
ipcMain.on(IPC.WINDOW_NOTIFY, (_event, payload: CommandNotification) => {
  if (!payload || typeof payload.title !== 'string' || typeof payload.tabId !== 'string') return
  if (!Notification.isSupported()) return
  new Notification({ title: payload.title.slice(0, 80), body: payload.body.slice(0, 200) }).show()
})
```

- Yeni ayar: `AppSettings` + `DEFAULT_SETTINGS` + ilgili `settings/*Settings.tsx` + `Settings.tsx` keywords + `SettingsStore.normalize`.
- Arayuz metni Ingilizce; kullaniciya hata `toastStore` ile; native dialog yok.
- Animasyon `settings.motion`'a uyar, yalniz transform/opacity.

### Test stratejisi
- Her modulun saf cekirdegi (ayristirici, durum makinesi, siralama, dogrulama) vitest ile, `*.test.ts` kaynagin yaninda.
- Ana surec dosya/surec isleri gecici klasorle entegrasyon testi (`*.integration.test.ts`).
- Kullanici akisi modul basina bir Playwright senaryosu (`e2e/<modul>.spec.ts`), izole userData, `motion:'off'`.
- Ajan davranisi gercek ajan yerine sahte betikle (hook JSON'unu ya da OSC dizisini yazan kucuk CLI) taklit edilir;
  gercek Claude Code / Codex ile canli deneme ayrica yapilir ve DURUM.md'ye yazilir.

### Sinirlar
- **Her zaman:** kullanicinin dosyalarina (`~/.claude/settings.json`, `~/.codex/config.toml`, `$PROFILE`) YAZMAMA;
  ajan ayarlari yalniz baslatma argumaniyla (`--settings`, `-c`) verilir. API anahtari / token renderer'a ve diske duz
  gitmez. Disariya giden her yeni veri `secretRedaction` ile maskelenir. Her ozellik Ayarlar'dan kapatilabilir.
- **Once sor:** yeni bagimlilik, kalici veri bicimi degisikligi (`session.json`, settings surumu), mevcut verilmis bir
  karari degistirmek (or. `resumeSession` kalici yazilmaz karari), ag'a cikan yeni istek.
- **Asla:** ajanin OAuth token'ini okumak, kullanicinin ajan oturum dosyalarini degistirmek, bildirim icin cikti
  metninden duygu/durum tahmini (PROJE-REHBER karari), LAN/internete yeni port acmak.

## Acik sorular (tum harita)
1. Surum gruplamasi yukaridaki gibi mi, yoksa her modul ayri surum mu?
2. agent-resume ve agent-hibernate, `PersistedSession`'a ajan oturum kimligini yazmayi gerektiriyor; bu, "resumeSession
   bilincli olarak yazilmaz" kararini degistirir. Onay gerekli (ayrinti agent-resume.md).
3. OpenCode ilk surumde hook kapsaminda degil (spinner yedegi kalir); eklenti sistemiyle ikinci adimda mi?
