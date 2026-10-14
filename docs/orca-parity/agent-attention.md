# agent-attention - Ajan bitti / seni bekliyor bildirimi

Durum: UYGULANDI 2026-10-14 (dal `feature/agent-hooks`). Bagimli: agent-hooks. Ortak kurallar: [README.md](README.md).

## Amac
Kullanici baska sekmede ya da baska uygulamadayken bir ajan turunu bitirdiginde veya onay istediginde
bunu kacirmasin. Bugun sistem bildirimi yalniz OSC 133 kabuk komutu 10 sn'den uzun surup arka planda
bitince gidiyor (`TerminalView.tsx` onCommandFinished); ajan turlari bildirim uretmiyor.

## Davranis
- **Tetikleyiciler** (agent-hooks olaylarindan): `needs-input` (izin / soru), `done` (tur bitti), `error` (API hatasi).
  Bildirim yalniz sekme gorunmuyorsa ya da pencere odakta degilse gider (mevcut `unseen` kurali).
- **Sistem bildirimi:** mevcut `IPC.WINDOW_NOTIFY` kullanilir (tiklayinca pencere one gelir, sekme secilir).
  Baslik: "Claude Code needs you" / "Codex finished" / "Claude Code stopped with an error"; govde: sekme adi +
  `last_assistant_message`'in ilk satiri (maskeli, 160 karakter).
- **Okunmadi durumu:** sekmede `attention: 'needs-input' | 'done' | 'error' | null`. Sekme gorunur olunca temizlenir.
  Sekme cubugunda ve session rail'de nokta: needs-input amber, done yesil, error kirmizi. Sag tik "Mark as unread".
- **Zil:** sekme cubugunun saginda (RemoteIndicator yaninda) zil simgesi + sayi. Acilinca okunmamislarin listesi
  (ajan, sekme, olay, ne zaman); tiklayinca sekmeye gider. "Clear all".
- **Gorev cubugu:** Windows `win.setOverlayIcon(sayi rozeti, 'N agents need attention')` + needs-input'ta
  `win.flashFrame(true)`; Linux `app.setBadgeCount(n)`. Sayi 0 olunca temizlenir. Rozet resmi renderer'da canvas ile
  cizilip data URL olarak gonderilir (yeni ikon dosyasi yok).
- **Ses:** kategori basina (needs-input / done / error) secim: Off, yerlesik ses (`fun/sounds.ts playCue`) ya da
  kullanicinin sectigi dosya (MP3/WAV/OGG/M4A/FLAC, ana surecte dialog ile secilir, `userData/sounds/`'a kopyalanir).
  Ortak ses seviyesi. Pes pese iki ajan bitse de ses calar (kisa kuyruk, ayni anda en fazla 1).
- **Ayarlar > Notifications** (yeni bolum, Terminal'deki `commandNotifications` buraya tasinir):
  kategori basina Sistem / Ses / Yalniz nokta anahtarlari, ses dosyasi, ses seviyesi, "Only when TermFlow is not focused".

## Basari olcutleri
- Arka plandaki Claude sekmesi izin isteyince 1 sn icinde bildirim + amber nokta + zil sayisi 1 + Windows rozet.
- Bildirime tiklayinca dogru sekme secilir, nokta ve rozet temizlenir.
- Odaktaki sekmede bildirim gitmez, ses ayara gore calar.
- Ayarlardan bir kategori kapatilinca o kategori hicbir kanal uretmez.

## Test
- Birim: olay + gorunurluk -> {bildirim, ses, nokta} karar tablosu (`attentionPolicy.test.ts`), okunmadi sayaci,
  ses dosyasi uzanti/boyut dogrulamasi (en fazla 5 MB).
- E2E: sahte hook olayi yazilir; zil sayisi, nokta, "Mark as unread", sekmeye gecince temizlenme.
- Elle: Windows gorev cubugu rozeti ve flashFrame (E2E'de gorulmez).

## Dilimler
1. `attention` durumu + nokta + sekmeye gecince temizleme.
2. Sistem bildirimi + ses (yerlesik).
3. Zil listesi + Mark as unread.
4. Gorev cubugu rozeti / flash, ozel ses dosyasi, Ayarlar > Notifications.

## Uygulama notlari (2026-10-14)
- Kod: `src/renderer/src/attention/` (attentionPolicy saf + testli, alerts calisma zamani, AttentionBell), ana surec
  `src/main/ipc/alerts.ts` (ses sec/yukle, `setOverlayIcon` / `flashFrame` / Linux `setBadgeCount`), ayar
  `agentAlerts` + `settings/NotificationSettings.tsx`.
- Ozel ses `userData/sounds/alert.<uzanti>`; renderer yalniz baytlari alir ve WebAudio ile cozer, CSP `media-src` degismedi.
  Tek dosya tum kategoriler icin (Orca ile ayni).
- Isaret yalniz sekmeye gecince, zilden secince ya da pencere odak alinca kalkar; boylece "Mark as Unread"
  (terminal sag tik menusu; sekmelerin kendi sag tik menusu yok) gorunur sekmede de kalir. Ajan yeniden calisinca isaret kalkar.
- Dikkat noktasi varken ayni yerdeki surec noktasi CSS ile gizlenir.
- `commandNotifications` Terminal bolumunde kaldi (tasima ertelendi); zil listesine girmiyor.
- E2E: `e2e/agent-hooks.spec.ts` "background tab ..." (nokta, zil, ziyaretle temizlenme, Mark as Unread).
- Elle dogrulanmadi: Windows gorev cubugu rozeti / yanip sonme ve gercek sistem bildirimi (E2E'de kapali).
