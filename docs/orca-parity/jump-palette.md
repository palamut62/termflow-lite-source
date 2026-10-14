# jump-palette - Sekme ve oturum atlama paleti

Durum: TASLAK 2026-10-14. Bagimli: agent-attention. Ortak kurallar: [README.md](README.md).

## Amac
Cok sekmeli ajan kullaniminda "hangi sekme beni bekliyor"a tek tusla gitmek. Mevcut palet
(Ctrl+Shift+P) gorev/komut odakli; bu palet yalniz sekmeler ve son oturumlar icin.

## Davranis
- Kisayol `Ctrl+Shift+J` (yeniden atanabilir). Ctrl+J kullanilmaz: kabukta ve Codex'te yeni satir (LF).
- Bos sorguda en fazla 9 satir, acilis aninda dondurulur: once `needs-input`, sonra `error`, sonra `done`
  (okunmamis), sonra son aktif sekmeler. Palet acikken `1`-`9` (ya da Ctrl+1-9) ilgili satira atlar.
- Sorgu yazilinca: acik sekmeler (baslik, profil, klasor, worktree dali), session rail gruplari (depo adi),
  son ajan oturumlari (mevcut oturum tarayicisi verisi, sec -> surdur). Basit bulanik eslesme + yakinlik siralamasi.
- `Enter` sec, `Shift+Enter` sekmeyi aktif panenin yanina split olarak acar, `Esc` kapat.
- Satir: durum noktasi (agent-attention renkleri), ajan ikonu, baslik, klasor, "2m ago".
- Hicbir sey eslesmezse son satir "Open new tab in <sorgu>" (sorgu var olan bir klasorse).

## Basari olcutleri
- 6 sekmeden biri izin beklerken Ctrl+Shift+J -> 1 o sekmeyi secer.
- Sorgu "api" -> klasoru ya da dali "api" iceren sekmeler ustte.
- Klavyeyle tamamen kullanilabilir, ekran okuyucu satir etiketlerini okur (listbox/option rolleri).

## Test
- Birim: siralama (dikkat -> yakinlik), dondurma (acikken yeni olay sirayi degistirmez), bulanik eslesme.
- E2E: kisayol, rakamla atlama, Shift+Enter split.

## Dilimler
1. Palet bileseni + sekme kaynagi + dikkat siralamasi.
2. Oturum kaynagi (surdur), split ile acma, yeni sekme satiri.
