# TermFlow Lite - Durum

guncel: 2026-10-08 | son arac: Claude Code | dal: `main` | surum 1.19.1

> Bu dosya projeye giren her yapay zeka aracinin ilk okudugu yerdir. Kisa tutulur (en fazla ~80 satir).
> Kalici bilgi (mimari, kararlar, ayrintili gecmis) `PROJE-REHBER.md`'de (varsa) / README'de.

## Ne bu proje
Minimal, hizli, cok ozellestirilebilir capraz platform (Windows/Linux) terminal; gelistiriciler ve CLI ajan kullanicilari icin.
Stack: Electron (electron-vite), React, TypeScript, xterm.js, node-pty. Surum 1.19.1 (freeware, kapali kaynak).
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
- [x] 1.19.1 Resim yapistirma: panodaki resim PNG olarak kaydedilip yolu yapistirilir
- [ ] Siradaki aday: sekme durumunun (`tab.activity`) ajan spinner'ina bakmasi

## Son oturum (2026-10-07)
- 1.19.0: secimin uzerine yazma (`terminal/selectionEdit.ts`) yayinlandi, site EN/TR guncellendi (Vercel)
- 1.19.1 Resim yapistirma: panoda yalniz resim varsa `main/pastedImages.ts` PNG'yi `%TEMP%/termflow-lite-paste`'e kaydeder (7 gun), yol dosya gibi yapistirilir; sag tik Paste sonrasi odak terminale doner. E2E `e2e/paste-image.spec.ts` (main pano okumalari stub'li)
- Coklu dosya kopyasinda hala yalniz ilk yol gelir: Electron Windows'ta CF_HDROP okuyamiyor, PowerShell `Get-Clipboard` ~2 sn ve kararsiz

## Yarim kalan / siradaki adim
- 1.19.1 yayinda (2026-10-08): Release + verify-release yesil, exe/zip/AppImage/deb + latest*.yml
- Site guncel: Agent Memory (f2) ve secimin uzerine yazma (f4) maddeleri EN/TR eklendi, Vercel prod
- Secimin uzerine yazma Claude Code/Codex icinde elle denenmeli (imleci gercek caret'e koymayan TUI'de devreye girmez, eski davranis kalir)
- Gercek ajan kaydi (Connect) yalniz testlerde mock'landi; kurulu surumle Claude/Codex/OpenCode'da elle denenmeli
- Ertelenen aday: `tab.activity` 'Running' sorunu

## Acik sorunlar / bilinen sinirlar
- Durum cubugu/sekme durumu Claude Code ve Codex bostayken de 'Running' gosteriyor (karakter artik spinner'a bakiyor, sekme degil)
- E2E `app.spec` "pastes ..." iki testi gercek OS panosuna yazar; pano kilitliyken (2026-10-07) degisiklikten bagimsiz kirilir
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
