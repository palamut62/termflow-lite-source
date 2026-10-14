# jump-palette - Sekme ve oturum atlama paleti

Durum: UYGULANDI 2026-10-14 (dal `feature/agent-hooks`). Bagimli: agent-attention. Ortak kurallar: [README.md](README.md).

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

## Uygulama notlari (2026-10-14)
- Kod: saf siralama `src/renderer/src/jumpRanking.ts` (+test), `store/jumpPaletteStore.ts` (ac/kapa + sekme yakinlik
  takibi `lastSeen`), `components/JumpPalette.tsx` (TaskPalette CSS'i), `terminalStore.openBeside` (Shift+Enter).
- Kisayol `settings.shortcuts` icinde `ctrl+shift+j -> jump-palette`; Ayarlar > Keyboard'dan degistirilebilir.
- Bos sorguda aktif sekme listelenmez; "son aktif" = en son aktif olan ya da aktiflikten cikan an (Alt+Tab gibi).
  Bekleyen sekmenin zamani olayin zamanidir.
- Session rail gruplari ayri satir olmadi: sekmenin klasor adi, tam yolu ve worktree depo adi aranir, yani depo adi
  yazinca o gruptaki sekmeler gelir. Agirlik: baslik/dal 3, klasor/depo adi 2, profil/tam yol 1.
- Rakam: bos sorguda `1`-`9`, sorgu varken `Ctrl+1`-`9`. Shift+Enter yalniz sekme satirinda split yapar; oturum ve
  klasor satirinda Enter gibi davranir. Bir sekmede acik olan oturum (hook ya da resume kimligi) oturum listesinde tekrar cikmaz.
- "Open new tab in" satiri mevcut `system.resolvePath` ile (aktif sekmenin klasorune gore) yalniz klasorse cikar.
- E2E: `e2e/agent-hooks.spec.ts` "Ctrl+Shift+J ..." (bekleyen sekme ilk, `1` ile atlama, Shift+Enter split).
  Dondurma bilesen durumu (`useState` baslangici) ile yapildi; ayri testi yok.
