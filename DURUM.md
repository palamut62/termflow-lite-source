# TermFlow Lite - Durum

guncel: 2026-10-07 | son arac: Claude Code | dal: `feature/secimi-yazarak-degistir` | surum 1.19.0

> Bu dosya projeye giren her yapay zeka aracinin ilk okudugu yerdir. Kisa tutulur (en fazla ~80 satir).
> Kalici bilgi (mimari, kararlar, ayrintili gecmis) `PROJE-REHBER.md`'de (varsa) / README'de.

## Ne bu proje
Minimal, hizli, cok ozellestirilebilir capraz platform (Windows/Linux) terminal; gelistiriciler ve CLI ajan kullanicilari icin.
Stack: Electron (electron-vite), React, TypeScript, xterm.js, node-pty. Surum 1.19.0 (freeware, kapali kaynak).
Kaynak repo PRIVATE `palamut62/termflow-lite-source`; release'ler PUBLIC `palamut62/termflow-lite`. Site: termflowlite.lol (Vercel, `website/`).

## Calistir / test et
- `npm run dev` (gelistirme), `npm run verify` (vitest + tsc + build)
- `npm test` (birim), `npm run test:e2e` (Playwright, ~8 dk), `npm run build:site` (site karakter demosu)
- Paket: `npm run dist:win` / `dist:linux`; yayin: `npm run release:tag` (CI yayinlar, bkz. `docs/releasing.md`)

## Asama
- [x] 1.9-1.13: motion, Mica/Acrylic, OSC 133 shell integration, komut bloklari, ASCII karakter motoru
- [x] 1.15-1.17: dosya paneli, medya onizleme kartlari, profil basina ASCII arka plan
- [x] Site EN/TR dil destegi, Buy Me a Coffee butonu
- [x] 1.17.2: kapali kaynaga gecis (freeware); CI/RELEASES_TOKEN akisi uctan uca dogrulandi
- [x] 1.18.0 Agent Memory: 30 gunluk session hafizasi + yerel MCP, Ayarlar > Memory. Spec `docs/agent-memory.md`, 8/8 dilim
- [x] 1.19.0 Secimin uzerine yazma: cift tikla secilen kelime yazilan metinle yerinde degisir
- [ ] Siradaki aday: sekme durumunun (`tab.activity`) ajan spinner'ina bakmasi

## Son oturum (2026-10-07)
- Secimin uzerine yazma: `terminal/selectionEdit.ts` (saf `planSelectionEdit` + `handleSelectionEditKey`), `TerminalView` key handler'ina bagli
- Secim imlecin mantiksal satirindaysa (soft wrap dahil) oklarla secim sonuna gidilir, backspace ile silinir, karakter xterm'e birakilir; aksi halde eski davranis. Broadcast acikken kapali
- Birim `selectionEdit.test.ts` (8) + E2E `e2e/selection-edit.spec.ts` (PowerShell'de gercek tus/cift tik) gecti; `npm run verify` yesil

## Yarim kalan / siradaki adim
- Secimin uzerine yazma Claude Code/Codex icinde elle denenmeli (imleci gercek caret'e koymayan TUI'de devreye girmez, eski davranis kalir)
- 1.18.0 yayinda (2026-10-06): Release + verify-release yesil, public repoda exe/zip/AppImage/deb + latest*.yml. Site Agent Memory'den henuz bahsetmiyor
- Gercek ajan kaydi (Connect) yalniz testlerde mock'landi; kurulu surumle Claude/Codex/OpenCode'da elle denenmeli
- Ertelenen aday: `tab.activity` 'Running' sorunu

## Acik sorunlar / bilinen sinirlar
- Durum cubugu/sekme durumu Claude Code ve Codex bostayken de 'Running' gosteriyor (karakter artik spinner'a bakiyor, sekme degil)
- CI E2E `afterEach app.close()` 60 sn teardown zaman asimi (1.6.1'den beri, kararsiz)
- Birim testlerde bir test ara sira 5 sn zaman asimina dusuyor (tekrarda geciyor); `@vitest/coverage-v8` kurulu degil
- PSReadLine 2.1+ cift oneri korumasi yalniz script ile test edildi (makinede 2.0)
- zsh shim'i Linux'ta elle dogrulanmali
- README ekran goruntuleri yeni gorselleri icermiyor

## Dokunma (verilmis kararlar)
- Detay `PROJE-REHBER.md` "Verilmis kararlar"da; ozet:
- Native dialog yasak; bilgi icin `toastStore`
- Backdrop'ta `transparent:true` kullanilmaz (Mica/Acrylic `setBackgroundMaterial`)
- Shell integration kullanicinin `$PROFILE`'ina yazmaz; CMD/WSL desteklenmez
- Yeni sekme her zaman `resolveStartupCwd()` ile acilir; `workspaceCwd` miras verilmez
- Karakter durumu cikti metninden tahmin edilmez; yalniz ajan spinner'i ve acik zaman kurallari
- Hava durumu: IP ile konum yok; yalniz yuvarlanmis koordinat gider
- Yayin yalniz CI uzerinden; lokal exe release'e yuklenmez; public repo adi degismez
- Site dili: `website/i18n.js`; uygulama arayuzu yalniz Ingilizce
