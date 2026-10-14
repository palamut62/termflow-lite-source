# scheduled-prompts - Zamanlanmis ajan prompt'lari

Durum: TASLAK 2026-10-14. Bagimli: agent-race (prompt'la baslatma). Ortak kurallar: [README.md](README.md).

## Amac
Kayitli komutlar bugun zamanlanabiliyor (daily / weekly / interval, `commandSchedule.ts`), ama yalniz kabuk
komutu calistiriyor. Tekrarlayan ajan isleri (sabah issue ozeti, gece bagimlilik kontrolu) icin ayni
zamanlayiciyla bir ajanin prompt'la baslatilmasi, gereksiz calismayi engelleyen on kontrol ve kacirilan
calismanin toleransi.

## Davranis
- `SavedCommand`'a `kind: 'command' | 'agent-prompt'` (eski kayitlar `command`). `agent-prompt` icin:
  `profileId` bir ajan profili olmali, `command` alani prompt metni, ek alanlar `model?`, `permissionMode?`,
  `precheck?: string`, `graceMinutes?: number` (varsayilan 0), `worktree?: boolean` (her calismada yeni worktree).
- On kontrol: calismadan once `precheck` klasorde kullanicinin kabuguyla calisir (ana surec, 60 sn zaman asimi);
  cikis kodu != 0 ise calisma "skipped" olarak sonuc listesine yazilir, ajan baslamaz.
  Ornek: `git fetch -q && test -n "$(git log HEAD..@{u} --oneline)"`.
- Kacirilan calisma: TermFlow kapaliyken gecen zaman, acilista `graceMinutes` icindeyse bir kez calisir, degilse
  "missed" yazilir. Ust uste birikmez (en fazla bir telafi).
- Mevcut cakisma onleme (onceki calisma surerken yenisi baslamaz) aynen gecerli.
- Calisma yeni sekmede (ya da `worktree` ile yeni worktree'de) prompt'la baslar; bitisi agent-attention ile bildirilir.
- Sonuc listesine `ran | skipped | missed | failed` + sure. "Run now" ve duraklatma mevcut arayuzden.
- Yedek / geri yukleme: ice aktarilan zamanlamalar mevcut kurala gore duraklatilmis baslar.

## Basari olcutleri
- Her 5 dk'lik `agent-prompt`, on kontrol 1 donerken hic ajan baslatmaz, sonuc "skipped".
- On kontrol 0 donunce Claude sekmesi prompt'la acilir.
- Kapaliyken kacirilan calisma tolerans icindeyse acilista bir kez calisir.
- Eski `savedCommands` verisi bozulmadan yuklenir.

## Test
- Birim: normalize (eski kayit -> `command`), kacirilan calisma karari (tolerans, tek telafi), sonuc listesi siniri.
- Entegrasyon: on kontrol calistirici (0 / 1 / zaman asimi).
- E2E: kisa aralikli `agent-prompt` + sahte ajan; skipped ve ran sonuclari.

## Dilimler
1. Model + normalize + form alanlari (`SavedCommands.tsx`).
2. On kontrol + calistirma (prompt'la baslatma) + sonuc durumlari.
3. Kacirilan calisma + worktree secenegi.
