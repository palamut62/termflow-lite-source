# scrollback-restore - Terminal icerigini yeniden acilista geri getirmek

Durum: TASLAK 2026-10-14. Bagimli: yok. Ortak kurallar: [README.md](README.md).

## Amac
Bugun sekmeler, klasorler ve bolunmus duzen geri geliyor ama terminaller bos aciliyor. Kullanici
uygulamayi kapatip actiginda (ya da guncellemeden sonra) her panenin son ciktisini gorsun.

## Verilen kararlar (oneri)
- `@xterm/addon-serialize` (resmi xterm eklentisi, yeni bagimlilik: ONAY GEREKLI). Yalniz normal buffer
  serilestirilir; alternatif ekran (vim, Claude Code TUI) yazilmaz, ajan TUI'leri zaten kendi ekranini cizer.
- Kayit: kapanista (`beforeunload` + ana surecin `before-quit` istegi) ve 60 sn'de bir, yalniz degisen sekmeler.
  Dosya `userData/scrollback/<tabId>.txt` (ANSI dahil), atomik yazim. Sekme basina ust sinir 2000 satir ve 1 MB;
  toplam 50 MB, asinca en eski sekmeler kirpilir.
- **Gizlilik:** yazmadan once `secretRedaction` ile API anahtari maskeleme. Ayar `restoreScrollback: boolean`
  (varsayilan acik) ve "Clear saved scrollback" dugmesi. Kapali olunca klasor silinir.
- Geri yuklemede icerik yeni PTY baslamadan once `term.write` ile basilir, ardindan soluk bir ayirici satir:
  `--- restored <tarih saat> ---`. Kabuk yeni prompt'unu altina yazar.
- Sekme kapatilinca dosyasi silinir. `PersistedSession`'da olmayan dosyalar acilista temizlenir.
- Remote Access telefona geri yuklenen icerik gitmez (yalniz canli akis), mevcut davranis korunur.

## Basari olcutleri
- 3 sekmeli bir oturum kapatilip acilinca her sekmede son ~2000 satir ayni renklerle gorunur, altinda ayirici.
- Alternatif ekrandayken kapatilan sekme bos degil, alternatif ekrana girmeden onceki icerikle acilir.
- `sk-...` gibi bir anahtar diskte maskeli.
- Ayar kapatilinca `userData/scrollback` silinir ve yeni kayit yapilmaz.
- Acilis suresi 10 sekmeyle olculur; artis < 150 ms.

## Test
- Birim: boyut kirpma (satir + bayt + toplam), maskeleme, yetim dosya temizligi listesi.
- E2E: komut ciktisi yaz -> uygulamayi kapat -> ac -> metin ve ayirici gorunur; ayar kapali senaryosu.

## Dilimler
1. Serilestirme + dosya deposu (ana surec, atomik) + kapanista kayit.
2. Geri yukleme + ayirici + yetim temizligi.
3. Periyodik kayit, ayar, temizleme dugmesi, boyut sinirlari.

## Acik sorular
- Varsayilan acik mi olsun? Terminal ciktisi diske yazilmis olur (maskeli de olsa). Oneri: acik, ayarda net aciklama.
