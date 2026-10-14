# agent-hibernate - Bostaki ajanlari uyutmak

Durum: TASLAK 2026-10-14. Bagimli: agent-hooks, scrollback-restore, agent-resume. Ortak kurallar: [README.md](README.md).

## Amac
Her bos ajan sekmesi bellekte bir Node sureci ve model oturumu tutar (Claude Code tek basina yuzlerce MB).
Cok sekmeyle calisan kullanici icin, isini bitirmis ve uzun suredir dokunulmamis arka plan ajanlarini
durdurup sekmeye donunce ayni konusmayla geri getirmek.

## Davranis
- Ayar `agentHibernate: { enabled: false; idleMinutes: 30 }` (deneysel, varsayilan kapali; 1-1440 dk).
- Bir sekme uyutulur, ANCAK hepsi dogruysa:
  - agent-hooks durumu `done` (needs-input ya da working degil) ve oturum kimligi biliniyor,
  - sekme gorunur degil (aktif sekme ya da gorunen split pane degil),
  - `done`'dan beri klavye girdisi ve yeni cikti yok, `idleMinutes` doldu,
  - ajan surdurulebilir (Claude, Codex, OpenCode), telefon o sekmeye abone degil, broadcast acik degil.
- Uyutma: scrollback kaydedilir, PTY kapatilir, sekme "Sleeping" olur (ay simgesi, soluk baslik). Pane'de son
  cikti salt-okunur + "Sleeping since 14:20. Press any key or click to wake."
- Uyandirma: sekmeye gecis + tus/tik -> agent-resume yolu ile ayni profil, model, izin modu ve klasorle `--resume`.
  Basarisizsa normal baslangic + toast; eski konusma oturum tarayicisinda kalir.
- Elle: sekme sag tik "Sleep now" (ayni kosullar, sure haric) ve session rail grup menusu "Sleep idle agents".
- Session rail filtresi "Hide sleeping".

## Basari olcutleri
- `idleMinutes=1` ile arka plandaki bitmis Claude sekmesi 1 dk sonra uyur, ajan sureci sonlanir (PID yok).
- Sekmeye donup tusa basinca ayni konusma devam eder.
- Izin bekleyen ya da calisan ajan asla uyutulmaz.

## Test
- Birim: uygunluk karar fonksiyonu (her kosul icin bir negatif vaka), zamanlayici sifirlama (girdi/cikti).
- E2E: sahte ajan + kisa sure -> Sleeping -> tus -> `--resume <id>` ile yeniden basladi.

## Dilimler
1. Uygunluk + zamanlayici + elle "Sleep now".
2. Uyandirma + basarisiz yedek + rail filtresi + ayar.
