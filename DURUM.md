# TermFlow Lite - Durum

guncel: 2026-10-08 | son arac: Claude Code | dal: `main` | surum 1.20.0

> Bu dosya projeye giren her yapay zeka aracinin ilk okudugu yerdir. Kisa tutulur (en fazla ~80 satir).
> Kalici bilgi (mimari, kararlar, ayrintili gecmis) `PROJE-REHBER.md`'de (varsa) / README'de.

## Ne bu proje
Minimal, hizli, cok ozellestirilebilir capraz platform (Windows/Linux) terminal; gelistiriciler ve CLI ajan kullanicilari icin.
Stack: Electron (electron-vite), React, TypeScript, xterm.js, node-pty. Surum 1.20.0 (freeware, kapali kaynak).
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
- [x] 1.20.0 Secim duzeltmesi: Claude Code caret'i, tum input secilip Delete ile temizleme
- [x] 1.20.0 Memory model katalogu: OpenRouter'dan tum modeller, 24 saat cache, Refresh + Test
- [ ] Model secici (Unreleased): datalist yerine `settings/ModelPicker.tsx`; acilinca tum modeller, All/Free filtresi, ucretsizler yesil
- [ ] Siradaki aday: sekme durumunun (`tab.activity`) ajan spinner'ina bakmasi

## Son oturum (2026-10-08)
- 1.19.1 yayinlandi (resim yapistirma)
- Secimin uzerine yazma Claude Code'da bozuktu: Claude gercek imleci gizleyip cizdigi caret'in 1 sutun sagina park ediyor, yanlis harf siliniyordu. `SelectionEdit` sinifi DECTCEM (?25) takip eder; imlec gizliyken secim satirindaki tek inverse hucre caret sayilir
- Secim imlecin mantiksal satirina kirpilir: uc tik / Select All + Delete inputu temizler. Gercek Claude Code 2.1.289 ve Codex 0.160 ile probe'la dogrulandi; E2E'ye uc tik + Delete eklendi
- Memory > Model: `main/memory/models.ts` (`ModelCatalog` + `testModel`), IPC `memory:models` / `memory:test-model`; canli denendi (467 model, cache 68 KB, deepseek-v4-flash testi 1.4 sn, $0.0000074). Global kural BRAIN-POLICY'ye eklendi

## Yarim kalan / siradaki adim
- 1.19.1 yayinda (2026-10-08): Release + verify-release yesil, exe/zip/AppImage/deb + latest*.yml
- Site: Agent Memory (f2), secimin uzerine yazma (f4), resim yapistirma (f5) EN/TR; tum inputu silme yayinlaninca f4.li4e eklenecek
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
