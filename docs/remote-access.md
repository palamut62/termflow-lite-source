# Remote Access (mobil web) - Spec

Durum: onaylandi 2026-10-09. Dal: `feature/remote-access`.

## Amac
Telefondan, Tailscale agi uzerinden, masaustundeki TermFlow Lite'i tam kontrol etmek:
sekmeleri canli izlemek ve yazmak, sekme acmak/kapatmak, shell/profil/provider/SSH ve
tum ayarlari yonetmek, ajan oturumlarini surdurmek, proje/git/memory islemleri.
Telefon ayri bir kopya degil, masaustunun uzaktan kumandasidir: iki ekran ayni durumu gorur.

## Verilen kararlar
- Sunucu Electron ana surecinde gomulu; yalnizca Tailscale IPv4 adresine (100.64.0.0/10) baglanir.
  LAN ve internet dinlenmez. Tailscale yoksa sunucu acilmaz, durum "no-tailscale" olur.
  Aktarim HTTP + WebSocket (Tailscale WireGuard ile sifreli).
- Varsayilan kapali (`settings.remote.enabled=false`). Ayarlar > Remote'tan acilir.
- Eslestirme: masaustu QR gosterir: `http://<100.x>:<port>/#pair=<kod>`. Kod 32 bayt rastgele,
  5 dk gecerli, tek kullanimlik. Telefon kodu `POST /api/pair` ile uzun omurlu cihaz anahtarina
  cevirir (32 bayt); anahtar tarayicida (localStorage) saklanir, masaustunde yalnizca SHA-256'si
  (`userData/remote-devices.json`, atomik yazim).
- Oturum suresizdir; yalnizca masaustu "Disconnect" / "Disconnect all" ile biter. Iptal edilen
  cihazin soketleri aninda kapanir.
- WebSocket: ilk mesaj `auth` olmali (anahtar URL'de tasinmaz), Origin = Host kontrolu,
  eslestirme denemelerine hiz siniri (IP basina dakikada 10).
- Provider API anahtarlari telefona asla gitmez; telefon yalnizca yeni anahtar yazar/siler.
  `asciiBackgrounds` (buyuk resimler) telefona gonderilmez.
- PTY boyutu: telefon bir sekmeye abone oldugunda PTY telefon boyutuna gecer; masaustunun
  istedigi boyut saklanir ve telefon ayrilinca (sekme degisimi, arka plan, kopma) geri uygulanir.
- Cikti telefona `PtyCore` ham dokunusundan gider; masaustundeki render modundan (buffer) bagimsizdir.
- Sekme durumu renderer'da kalir. Renderer sekme listesini ana surece yayinlar (`remote:tabs`);
  telefonun sekme komutlari (ac/kapat/yeniden adlandir/one al/ajan surdur/kayitli komut)
  ana surec uzerinden renderer'a iletilir ve sonucu beklenir.
- Ana surecin `ipcMain.handle` kanallari bir kayit defterine alinir; telefon yalnizca izin
  listesindeki kanallari cagirabilir (dialog, pencere, pano, sistem acma kanallari kapali).
- Telefondan ayar degisince masaustune `settings:changed` gider; masaustu degisikligi de
  tum telefonlara yayinlanir.
- Mobil arayuz ayri Vite girisi (`src/remote/` -> `out/remote/`), React + xterm.js, Ingilizce
  (uygulama arayuzu karari). Urun sahibi atfi About'ta.

## Protokol (JSON, WebSocket `/ws`)
Istemci -> sunucu: `auth{token}`, `call{id,method,params}`, `sub{tabId,cols,rows}`,
`unsub{tabId}`, `input{tabId,data}`, `resize{tabId,cols,rows}`.
Sunucu -> istemci: `hello{device,tabs,activeTabId,settings,shells,platform,version}`,
`result{id,ok,value|error}`, `tabs{tabs,activeTabId}`, `settings{settings}`,
`snapshot{tabId,data}`, `data{tabId,data}`, `exit{tabId,exitCode}`, `revoked`.
Metotlar: `ipc` (izin listeli kanal), `tab.open|close|rename|focus|restart`,
`agent.resume`, `saved.list|run`, `device.forget` (telefon kendi kaydini siler).

## Fazlar
1. Cekirdek: sunucu, eslestirme, cihaz yonetimi, sekme listesi, canli terminal, boyut devralma,
   sekme ac/kapat, mobil tus cubugu (Esc/Tab/Ctrl/Alt/oklar/^C) ve yazma kutusu.
2. Ayarlar: genel ayarlar, shell/profil/provider (anahtar yazma dahil)/SSH yonetimi.
3. Kalanlar: ajan oturumlari (surdur), kayitli komutlar, proje (git/gorevler/dosyalar), Memory.

## Test
- Birim: tailscale IP secimi, cihaz deposu (tek kullanim, sure, hash), protokol dogrulama,
  izin listesi, boyut hakemligi (TerminalManager), hub (fake soket + fake renderer).
- Entegrasyon: gercek http+ws sunucusu 127.0.0.1'de (test kancasiyla) eslestirme + auth + akis.
- Canli: Tailscale IP'sinden yerlesik tarayicida mobil gorunum.
