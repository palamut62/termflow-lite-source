# agent-detect - Kurulu ajan CLI'larini otomatik bulma

Durum: UYGULANDI 2026-10-14 (kullanici istegi, dal `feature/agent-hooks`). Bagimli: yok. Ortak kurallar: [README.md](README.md).

## Amac
Kullanici hicbir sey girmeden: bilgisayarda kurulu her ajan CLI'i yeni sekme menusunde hazir, tam yetkili
acilan bir profil olarak gorunsun; ajan kurulunca / kaldirilinca liste kendiliginden guncellensin.

## Davranis
- Katalog `BUILTIN_PROFILES` (`src/shared/profiles.ts`): Claude Code, Codex, OpenCode, Ollama Serve + Gemini CLI,
  Qwen Code, GitHub Copilot CLI, Grok, Droid, Kimi, Pi, Codebuff, Cursor Agent, Amp, Aider, Crush.
  Tam yetki bayraklari kurulu CLI'larin `--help` ciktisindan (Gemini/Qwen/Kimi `--yolo`, Copilot `--allow-all`,
  Grok `--always-approve`, Droid `--auto high`); Cursor Agent / Amp / Aider / Crush belgelerden, yerelde dogrulanmadi.
- Tespit ana surecte (`src/main/agentDetect.ts`): programin PATH'te bulunmasi (`executablePath`); PATH = kayit
  defterindeki guncel PATH + surec PATH'i (`currentSearchPath`, yeni sekmeler de bunu alir) + `%APPDATA%\npm`.
- Tarama acilista ve pencere odak aldiginda (en sik 30 sn'de bir); sonuc `settings.installedAgents`. Degisince
  menuler, telefon (Remote) ve Gezgin sag tik menusu kendiliginden guncellenir; sonradan kurulan icin toast.
- Secicilerde `availableProfiles`: kurulu olmayan yerlesik gizli, kullanicinin ayni programi calistiran kendi profili
  varsa yerlesik kopyasi gizli. Isim cozumlemeleri (`mergeProfiles`) filtrelenmez.
- Ayarlar > Profiles: "Not installed" soluk satir, "Rescan installed agents", satirda tam yetki bayragi.
- Claude / Codex / OpenCode izin modu eskisi gibi Ayarlar > Agent Security'den (varsayilan Workspace); diger ajanlar
  profilin `fullPermissions` / `fullPermissionArgs` alanina gore acilir (varsayilan tam yetki).

## Kapsam disi
- Ajan CLI'larinin kendi surumunu guncellemek (npm/winget ile yukseltme).
- Linux'ta masaustunden acilan uygulamanin dar PATH'i: kabuk profilinde eklenen klasorler taranmaz.

## Test
- Birim: `profiles.test.ts` (`availableProfiles`, `profileExecutable`), `src/main/agentDetect.test.ts`.
- E2E: `e2e/agent-detect.spec.ts` (PATH'e sahte `amp`; uygulama acikken `crush` kurulunca Rescan + toast).
- Canli: menuden Gemini CLI acildi, sekme `gemini --yolo` calistirdi (2026-10-14).
