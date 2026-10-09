# TermFlow Lite - Durum

guncel: 2026-10-09 | son arac: Claude Code | dal: `main` | surum 1.23.0

> Bu dosya projeye giren her yapay zeka aracinin ilk okudugu yerdir. Kisa tutulur (en fazla ~80 satir).
> Kalici bilgi (mimari, kararlar, ayrintili gecmis) `PROJE-REHBER.md`'de (varsa) / README'de.

## Ne bu proje
Minimal, hizli, cok ozellestirilebilir capraz platform (Windows/Linux) terminal; gelistiriciler ve CLI ajan kullanicilari icin.
Stack: Electron (electron-vite), React, TypeScript, xterm.js, node-pty. Surum 1.20.1 (freeware, kapali kaynak).
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
- [x] 1.20.1 Model secici: datalist yerine `settings/ModelPicker.tsx`; acilinca tum modeller, All/Free filtresi, ucretsizler yesil
- [x] 1.21.0 Remote Access: Tailscale + QR ile telefondan tam kontrol; spec `docs/remote-access.md`, 3/3 faz; site f8 (EN/TR)
- [x] 1.21.1 Telefon klavyesi (dokununca acilir, canli yazma, IME uyumlu), cift terminal cevabi giderildi, sekme cubugunda bagli telefon simgesi
- [x] 1.22.0 Telefon: eslestirme ekraninda QR tarama (fotograf + jsQR), elle yazilabilir kod, masaustunde cihaz basina Reconnect QR (ayni kayit, yeni anahtar), ana ekran uygulamasi icin sabit dosya adlari + ETag
- [x] 1.23.0 Voice Input: Space basili tut-konus, OpenRouter ses modeliyle yaziya cevirme + temizleme, Enter'siz ekleme; spec `docs/voice-input.md`
- [ ] Siradaki aday: sekme durumunun (`tab.activity`) ajan spinner'ina bakmasi

## Son oturum (2026-10-09)
- 1.21.0 Remote Access yayinlandi (Tailscale + QR, canli terminal, ayarlar/profil/provider/SSH/Memory, ajan oturumu, proje); site f8 bolumu
- 1.21.1: telefonda terminale dokununca klavye acilmiyordu. `src/remote/src/phoneInput.ts` (alan farki -> tus vurusu); telefondaki xterm onData'si artik gonderilmiyor (masaustuyle cift terminal cevabi ajan inputunu bozabiliyordu)
- Telefondan acilan sekme telefon boyutunda dogar; abonelikte Windows'ta temiz ekran + ConPTY yeniden cizimi (Claude Code'da kayma yok). Sekme cubugu sag ustte bagli telefon simgesi (`RemoteIndicator`). Gercek Claude Code 2.1.289 ile telefon gorunumunde canli denendi

- Duzeltme (surum 1.21.1 kaldi, yerel kurulum): telefon ikonlari `.gitignore` *.png yuzunden CI paketine girmiyordu (logo kirik); `public/` icin git-ignore guard testi. iPhone ana ekran uygulamasi Safari deposunu goremedigi icin eslesme kayboluyordu: QR altinda 10 karakterlik elle yazilabilir kod + telefonda kod alani

- Duzeltme (surum 1.21.1, yerel kurulum): telefon artik varsayilan olarak masaustu boyutunu AYNALAR (masaustu daralmaz, Claude Code bozulmaz); "Fit" ile telefon boyutuna gecis, ayna modunda Zoom 1x-3x

- 1.23.0 Voice Input: Space uzun basis -> kayit -> OpenRouter (tek istek, WAV) -> temiz metin `term.paste`. Canli deneme yapilamadi: OpenRouter hesabinda kredi yok (402), ucretsiz ses modelleri kredi ya da listelenmis uygulama istiyor; E2E sahte mikrofon + sahte sunucuyla gecti

## Yarim kalan / siradaki adim
- Remote Access gercek telefonla (iOS Safari + Android Chrome) denenmeli: Windows Guvenlik Duvari izni, yazilim klavyesi/visualViewport, iOS'ta localStorage silinmesi (ana ekrana ekleyince kalici)
- 1.22.0 yayinda (2026-10-09): Release + verify-release yesil, bu PC'ye yerel derleme sessiz kuruldu. iPhone ana ekran uygulamasinda 'Scan QR code' / Reconnect gercek telefonla denenmeli
- Gercek ajan kaydi (Memory Connect) yalniz testlerde mock'landi; kurulu surumle Claude/Codex/OpenCode'da elle denenmeli
- Ertelenen aday: `tab.activity` 'Running' sorunu

## Acik sorunlar / bilinen sinirlar
- E2E `session-rail` 'a collapsed group hides its sessions' 2026-10-09'da 1.22.0 kodunda da kiriliyor (grup basligi tiklamasi daraltmiyor); Voice'tan bagimsiz, incelenmeli
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
- Surum kurali (kullanici, 2026-10-09): mevcut ozellik duzeltmesinde surum ARTMAZ; ayni surum yerelde derlenip (`npm run build && npm run dist:win`) bu PC'ye sessiz kurulur (Git Bash'te `MSYS_NO_PATHCONV=1 ./dist/TermFlow-Lite-<v>-x64.exe /S --force-run`; yoksa /S `S:/` olur ve sihirbaz acilir). Yeni ozellikte surum artar ve CI ile yayinlanir
- Site dili: `website/i18n.js`; uygulama arayuzu yalniz Ingilizce
