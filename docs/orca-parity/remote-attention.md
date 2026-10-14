# remote-attention - Telefonda ajan bildirimleri

Durum: TASLAK 2026-10-14. Bagimli: agent-attention. Ortak kurallar: [README.md](README.md), [../remote-access.md](../remote-access.md).

## Amac
Masa basinda degilken "ajan bitti / onay bekliyor" bilgisini telefonda gormek ve oradan cevap vermek.
Remote Access (Tailscale + QR) zaten canli terminal ve yazma sagliyor; eksik olan dikkat sinyali.

## Teknik sinir (karar gerektirir)
Gercek push (uygulama kapaliyken bildirim) Service Worker + Web Push ister; bunlar guvenli baglam (HTTPS) ister.
Remote sunucu bugun `http://100.x.y.z` uzerinden calisiyor (Tailscale WireGuard sifreli ama tarayici icin
"guvenli baglam" degil). Bu yuzden iki faz:

### Faz A - Uygulama acikken (HTTPS gerektirmez)
- WebSocket'e yeni mesaj `attention{tabId, kind: 'needs-input'|'done'|'error', title, at}` ve `tabs`
  listesine `attention` alani. Telefon: ust bant ("Claude Code needs you - Open"), sekme listesinde nokta,
  baslik cubugunda sayi, Android'de `navigator.vibrate` (iOS desteklemez), istege bagli kisa ses.
- Telefon gorunur degilken (`visibilitychange`) gelen olaylar biriktirilir, geri donulunce ozet bant.
- Telefonda bir sekmeyi acmak masaustundeki okunmadi durumunu da temizler (iki yonlu).
- Ayarlar > Remote Access: "Send attention to phones" (varsayilan acik).

### Faz B - Uygulama kapaliyken (ONAY GEREKLI)
- `tailscale serve` ile `https://<makine>.<tailnet>.ts.net` uzerinden sunmak (Tailscale'in kendi sertifikasi;
  yalniz tailnet icinden erisilir, mevcut "LAN/internete acilmaz" kararini bozmaz) + Service Worker + Web Push (VAPID,
  anahtarlar `userData`'da). iOS'ta yalniz ana ekrana eklenmis uygulamada calisir.
- Kullanicinin tailnet'inde HTTPS sertifikalarinin acik olmasi gerekir; degilse Faz A ile kalinir.

## Basari olcutleri
- Faz A: telefonda TermFlow acikken arka plandaki Claude sekmesi izin isteyince 1 sn icinde bant gorunur,
  "Open" dogru sekmeye gider; masaustundeki nokta temizlenir.
- Faz B: telefon uygulamasi kapaliyken sistem bildirimi gelir, tiklayinca o sekme acilir.

## Test
- Birim: hub `attention` yayini (fake soket), telefon tarafi biriktirme/ozet mantigi.
- E2E: `e2e/remote.spec.ts`'e sahte hook olayi -> telefon gorunumunde bant.
- Canli: gercek iPhone ve Android (DURUM.md'deki bekleyen telefon denemesiyle birlikte).

## Dilimler
1. Protokol + hub yayini + telefon bandi ve noktalari (Faz A).
2. Iki yonlu okunmadi temizligi + ayar.
3. Faz B (onaydan sonra ayri spec guncellemesi).

## Acik sorular
- Faz B yapilsin mi? `tailscale serve` kullanicinin tailnet ayarini (HTTPS sertifikalari) gerektiriyor.
