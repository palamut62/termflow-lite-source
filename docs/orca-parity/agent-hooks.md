# agent-hooks - Ajan durumunu ajanin kendisinden okumak

Durum: UYGULANDI 2026-10-14 (dal `feature/agent-hooks`). Bagimli: yok. Ortak kurallar: [README.md](README.md).

## Amac
Sekme / durum cubugu / Agent Inbox ajanin gercek durumunu gostersin: `working`, `needs-input`
(onay ya da soru), `done` (tur bitti), `error` (API hatasiyla bitti). Onceden durum prompt sezgisinden
okunuyordu ve Claude Code / Codex bostayken de 'Running' kaliyordu. agent-attention, agent-resume,
usage-meter ve worktree-note bunun uzerine kurulur.

## Dogrulanan gercekler (2026-10-14, Claude Code 2.1.289, Codex 0.162.1)
- `claude --settings <dosya>` ile verilen hook'lar proje/kullanici hook'lariyla BIRLESIR (canli denendi; dokuman da
  "hook entries merge across settings levels" diyor).
- Claude `type: "http"` hook'u destekler: olay JSON'u POST govdesi, basliklarda `$VAR` yalniz `allowedEnvVars` ile.
  Bos 2xx = karar yok (PermissionRequest'te normal onay ekrani acilir). Baglanti hatasi bloklamaz.
- `SessionStart` http hook DESTEKLEMEZ (yalniz command). Oturum kimligi ilk `UserPromptSubmit`'ten gelir;
  ilk prompt'a kadar sekmede eski sezgi calisir. Konusma basligi (yalniz SessionStart'ta) bu yuzden yok.
- `Notification/permission_prompt` ancak ~6 sn sessizlikten sonra gelir; aninda onay icin `PermissionRequest` kullanilir.
- Electron-as-node command hook'u ~450 ms suruyor (hedef < 300 ms); bu yuzden command degil http hook.
- Codex `-c` degerleri TOML olarak cozulemezse string sayilir: `tui.notifications=true`, `tui.notification_method=osc9`,
  `tui.notification_condition=always` tirnaksiz gecer. OSC 9 icerigi: tur sonunda SON MESAJ (or. `ok`), onayda
  `Approval requested: <komut>`. Codex calisirken pencere basligini braille spinner'la baslatir.
- Codex'in "N warnings" sayaci bu argumanlardan degil, kendi limit uyarilarindan.

## Verilen kararlar
- **Kullanici dosyasina yazilmaz.** Claude'a `--settings <userData/agent-hooks/claude-settings.json>`, Codex'e `-c`;
  ikisi de yalniz TermFlow'un baslattigi sekmelerde (`prepareLaunch`, argumanlar prompt'tan `--` once).
  Kullanici zaten `--settings` verdiyse eklenmez.
- **Tasima: loopback HTTP.** `src/main/agentHooks/hookServer.ts` 127.0.0.1'de rastgele portta; her acilista yeni
  32 baytlik token. Token ve sekme kimligi ajana env ile (`TERMFLOW_HOOK_TOKEN`, `TERMFLOW_TAB_ID`) gecer, ayar dosyasinda
  sir yok. Host basligi 127.0.0.1 olmali (DNS rebinding), token sabit-zamanli karsilastirilir, govde en fazla 1 MB.
- Claude olaylari: `UserPromptSubmit`/`PostToolUse` -> working, `PermissionRequest` ve dikkat isteyen `Notification`
  -> needs-input, `Stop` -> done (`last_assistant_message` ilk satiri, maskeli), `StopFailure` -> error.
- Codex: OSC 9 handler (yalniz Codex sekmesinde; `\d+;` ile baslayan ConEmu alt komutlari yok sayilir) ve `onTitleChange`
  spinner'i -> working. Tur sonundan sonraki 1,5 sn icindeki son spinner karesi isi yeniden baslatmaz.
  Codex oturum kimligi bu modulde alinmiyor (`notify` sarmalayicisi agent-resume'a birakildi).
- Hook'lu sekmede (`tab.agentHook` varken) prompt sezgisi, bell ve tus vurusu sekme durumunu DEGISTIRMEZ; Agent Inbox'ta
  approval/question/completed/error yalniz hook'tan gelir. `tab.running` (surec canli) hook'tan etkilenmez.
- Esleme: working->`running`, needs-input/idle->`waiting`, done->`completed`, error->`error`.
- Ayar `agentHooks` (varsayilan acik), Ayarlar > Agent Security. Kapaliyken ek arguman/env yok.

## Dogrulama
- Birim: `src/shared/agentHooks.test.ts` (gercek Stop govdesi ve Codex metinleriyle), `hookServer.test.ts`
  (token, sekme kimligi, Host, token dosyada yok), `cli.test.ts` (arguman sirasi, env yalniz Claude), store testleri.
- E2E: `e2e/agent-hooks.spec.ts` sahte `claude` `--settings` dosyasini okuyup http hook'larini cagirir.
- Canli (output/agent-hooks-live.cjs): gercek Claude'da working -> done("ok") -> working -> needs-input("Approve Write"),
  reddedince waiting kalir. Gercek Codex'te uygulama icinde tur sonu OSC 9 -> completed; onay OSC 9 ham PTY probunda.

## Bilinen sinirlar
- Kullanici `allowedHttpHookUrls` tanimladiysa ve 127.0.0.1 listede yoksa Claude hook'lari calismaz; sekme eski sezgiye duser.
- Codex'te "working" baslik spinner'iyla uygulama icinde ayrica gozlenmedi (ilk tur zaten sezgiyle running'di); limit dolu oldugu icin tekrar denenmedi.
- OpenCode kapsam disi; eski sezgi devam ediyor.
