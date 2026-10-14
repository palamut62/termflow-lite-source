# agent-race - Ayni prompt'u N ajana gondermek

Durum: TASLAK 2026-10-14. Bagimli: agent-attention, worktree-setup. Ortak kurallar: [README.md](README.md).

## Amac
Zor bir isi ayni anda 2-5 ajana (ya da ayni ajanin farkli modellerine) vermek, her biri kendi worktree'sinde,
sonra sonuclari yan yana gorup birini tutmak. TermFlow'da parcalar var (ajan basina worktree, broadcast,
split); eksik olan tek akista birlestirmek. Diff goruntuleyici kapsam disi: karsilastirma ozet duzeyinde kalir.

## Davranis
- Komut paleti ve worktree baslaticidan "Race agents...": prompt kutusu (cok satir), 2-5 satir
  "profil + model + izin modu" secimi, temel dal (varsayilan mevcut dal), worktree-setup adimlari (depoda tanimliysa).
- Baslat: her satir icin `.termflow-worktrees/race-<kisa-id>-<n>` worktree + dal `race/<kisa-id>/<profil>`;
  setup adimlari; ajan sekmesi prompt'la baslar. Sekmeler session rail'de "Race: <prompt ilk 40 karakter>" grubunda,
  ayni sekmede otomatik izgara split.
- **Prompt'la baslatma** (paylasilan yetenek, scheduled-prompts da kullanir): Claude `claude "<prompt>"`,
  Codex `codex "<prompt>"`, OpenCode `opencode --prompt "<prompt>"`. Arguman olarak gecer (kabuga yazilmaz,
  kacis sorunu yok). Dilim 0'da her ajan surumunde dogrulanir; desteklemeyen profil secilemez.
- Karsilastirma paneli (grup basliginda "Compare"): satir basina ajan, durum (agent-attention), sure,
  `git diff --shortstat` (dosya / + / -), degisen dosya listesi (tiklayinca editorde acilir, mevcut `system:open-in-editor`),
  istege bagli test komutu (depo icin bir kez girilir, her worktree'de calisir, cikis kodu gosterilir).
- "Keep this one": digerlerinin worktree ve dallarini kaldirma teklifi (mevcut kaldirma akisi, onay modali),
  kazanan worktree'de bir shell sekmesi acilir ve birlestirme komutu ipucu gosterilir. TermFlow kendisi merge etmez.

## Basari olcutleri
- 3 ajanli yaris tek tikla 3 worktree, 3 sekme, ayni prompt ile baslar.
- Hepsi bitince agent-attention tek bildirim degil, grup ozeti verir ("Race finished: 3/3").
- Compare panelindeki rakamlar `git diff --shortstat` ile ayni.
- Keep sonrasi yalniz kazanan worktree kalir; kullanicinin kendi worktree'lerine dokunulmaz.

## Test
- Birim: dal/klasor adi uretimi (cakisma, gecersiz karakter), prompt arguman uretimi (ajan basina, tirnak/yeni satir),
  shortstat ayristirma.
- Entegrasyon: gecici depoda 3 worktree olustur/kaldir.
- E2E: sahte ajan betikleri dosya degistirir -> Compare rakamlari -> Keep.

## Dilimler
0. Ajan basina prompt argumani dogrulamasi.
1. Prompt'la baslatma (paylasilan) + yaris modali + worktree/sekme olusturma + rail grubu.
2. Compare paneli + test komutu.
3. Keep akisi + grup bildirimi.
