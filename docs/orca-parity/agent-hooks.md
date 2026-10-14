# agent-hooks - Ajan durumunu ajanin kendisinden okumak

Durum: TASLAK 2026-10-14. Bagimli: yok. Ortak kurallar: [README.md](README.md).

## Amac
Sekme / durum cubugu / Agent Inbox ajanin gercek durumunu gostersin: `working`, `needs-input`
(onay ya da soru), `done` (tur bitti), `error` (API hatasiyla bitti). Bugun durum spinner metninden
okunuyor ve Claude Code / Codex bostayken de 'Running' kaliyor (DURUM.md acik sorun). Bu modul
o sorunu kapatir ve agent-attention, agent-resume, usage-meter, worktree-note'un temelidir.

## Dogrulanmis kaynaklar (2026-10-14)
- Claude Code hook olaylari: `UserPromptSubmit`, `Stop`, `StopFailure`, `Notification`
  (matcher `notification_type`: `permission_prompt`, `idle_prompt`, `agent_needs_input`, `elicitation_dialog` ...),
  `SessionStart` (`source`, `session_title`), `SessionEnd`. Her olayda stdin JSON: `session_id`, `transcript_path`,
  `cwd`, `hook_event_name`; `Stop` ayrica `last_assistant_message`.
- `claude --settings <dosya-ya-da-json>` kurulu surumde var; kullanici dosyasina dokunmadan hook verilebilir.
- Codex: `-c key=value` ile her ayar baslatmada ezilebilir. `tui.notification_method="osc9"`,
  `tui.notification_condition="always"`, `tui.notifications=["agent-turn-complete","approval-requested"]`
  ile Codex terminale OSC 9 bildirimi yazar. `notify` programi `agent-turn-complete` ile `thread-id` verir.

## Verilen kararlar (oneri)
- **Kullanici dosyasina yazilmaz.** Claude'a hook'lar TermFlow'un baslattigi her ajan sekmesinde
  `--settings <userData/agent-hooks/claude-settings.json>` ile verilir. Codex'e `-c` argumanlariyla.
  TermFlow disinda baslatilan ajanlar etkilenmez.
- **Tasima: dosya, port yok.** Hook betigi (`out/hooks/agent-hook.cjs`, uygulama exe'si + `ELECTRON_RUN_AS_NODE=1`)
  stdin JSON'unu okur, yalniz izinli alanlari (`hook_event_name`, `notification_type`, `session_id`, `cwd`,
  `session_title`, `last_assistant_message` ilk 300 karakter, maskeli) tek satir olarak
  `userData/agent-hooks/events/<tabId>.jsonl`'e ekler. Ana surec klasoru izler (`fs.watch` + 1 sn yoklama yedegi).
  Sebep: ag yuzeyi yok, uygulama yeniden baslasa da olay kaybolmaz. Sekme kimligi ajana `TERMFLOW_TAB_ID` env'iyle gecer.
- **Codex OSC 9 renderer'da okunur** (`term.parser.registerOscHandler(9, ...)`): `approval-requested` metni ->
  `needs-input`, tur sonu -> `done`. `working` icin mevcut spinner okumasi (`fun/agentActivity.ts readPulse`) kalir.
  Codex `thread-id` (oturum kimligi) `notify` betigiyle alinir; kullanicinin kendi `notify`'i varsa betik onu da cagirir.
- **Oncelik:** hook/OSC olayi varsa spinner tahmini o sekmede yalniz `working` icin kullanilir; `done` ve
  `needs-input` yalniz olaydan gelir. Hook alinmayan ajanlarda (OpenCode, ozel provider) bugunku davranis aynen kalir.
- Durum `TabActivity`'ye eslenir: working->`running`, needs-input->`waiting`, done->`completed`, error->`error`.
  Yeni alan `tab.agent = { sessionId?, title?, lastEvent, lastEventAt }`.
- Ayar: `agentHooks: boolean` (varsayilan acik). Kapaliyken `--settings`/`-c` eklenmez.
- Sekme basligi: `SessionStart.session_title` varsa ve kullanici sekmeyi elle adlandirmadiysa baslik olur.

## Basari olcutleri
- Gercek Claude Code'da: prompt gonderilince sekme `running`; izin sorusunda 1 sn icinde `waiting`;
  tur bitince 1 sn icinde `completed`; bostayken bir daha `running`'e donmez.
- Gercek Codex'te ayni uc gecis (approval ve turn-complete OSC 9 ile).
- `~/.claude/settings.json` ve `~/.codex/config.toml` degismez (test oncesi/sonrasi hash ayni).
- Kullanicinin kendi hook'lari ve `notify` programi calismaya devam eder.
- Ayar kapatilinca yeni sekmelerde ek arguman yok.

## Test
- Birim: hook JSON -> olay ayristirma ve alan izin listesi (`hookEvents.test.ts`), olay -> TabActivity durum makinesi,
  OSC 9 metin ayristirma, Codex `-c` arguman uretimi (kullanicinin `notify`'i varken ve yokken).
- Entegrasyon: betik gecici userData'ya JSONL yazar, izleyici olayi sekmeye ulastirir.
- E2E: sahte "claude" betigi `--settings` dosyasini okuyup hook komutunu kendi cagirir; sekme durum gecisleri dogrulanir.
- Canli: Claude Code 2.1.x ve Codex ile bir tur + bir izin istegi (DURUM.md'ye not).

## Dilimler
0. Dogrulama: Claude `--settings` ile verilen hook'lar kullanici hook'lariyla BIRLESIYOR mu (ezilmiyor mu);
   Windows'ta Electron-as-node hook suresi (hedef p95 < 300 ms). Olumsuzsa bu spec guncellenir.
1. Hook betigi + esbuild girisi + JSONL izleyici + IPC `agent-hooks:event`.
2. Claude baslatma argumani (`profileResolver.ts`), `TERMFLOW_TAB_ID` env, renderer durum eslemesi.
3. Codex OSC 9 + `notify` sarmalayici, `-c` argumanlari.
4. Ayar + sekme basligi + Agent Inbox'a olay yazimi; PROJE-REHBER karar satiri; spinner kararinin guncellenmesi.

## Acik sorular
- `--settings` hook'lari kullanicinin hook'larini eziyorsa: kullanici hook'larini okuyup birlestirilmis gecici dosya
  mi uretelim, yoksa yalniz Codex'teki gibi bildirim kanalina (`preferredNotifChannel`) mi dusulsun?
