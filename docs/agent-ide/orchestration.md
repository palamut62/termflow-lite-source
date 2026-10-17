# Orchestration - Ajandan ajana is devri (Agent IDE)

Durum: TASLAK 2026-10-17, dilim 0 (CLI dogrulamasi) ve dilim 1 (`src/main/agentRunner.ts`) TAMAM. Kapsam: yalniz Agent IDE modu (`uiMode: 'ide'`);
Terminal (Lite) modunda ne ayar ne MCP kaydi gorunur. Bagimli: worktree.ts, agentHooks/hookServer.ts,
usage/agentUsage.ts, memory/mcpServer.ts (ayni MCP deseni). PRD Faz 5 "orchestration" maddesinin ilk dilimi.

## Amac
Koordinator ajan (Claude Code, Codex...) mekanik ya da ucuz isleri baska bir ajana/modele (OpenCode + ucretsiz
GLM/DeepSeek, Grok, Codex) devreder, sonucu diff + test ile kontrol eder. Amac: pahali ajanin limitini yalniz
planlama/review/kritik isler icin harcamak. TermFlow iskeleti saglar: izolasyon (worktree), calistirma, limit gorunurlugu.

## MCP: `termflow-agents`
`termflow-memory` gibi bagimliliksiz stdio JSON-RPC, `ELECTRON_RUN_AS_NODE=1` ile uygulamanin exe'siyle; ana surece
yerel HTTP + rastgele token ile baglanir (hookServer deseni). Surecleri ana uygulama baslatir; MCP yalniz istemcidir.

| Arac | Girdi | Cikti |
|---|---|---|
| `list_agents` | - | ajan, kurulu mu, modeller, ucretsiz/ucretli, limit (Claude 5h/7d %, Codex), son hata |
| `delegate_task` | `agent`, `model?`, `prompt`, `check_command?`, `timeout_s?` | `task_id` (hemen doner, is arka planda) |
| `get_task_result` | `task_id` | `status` (running/done/failed/timeout), ajan son mesaji, `git diff --stat`, degisen dosyalar, `check_command` cikis kodu + son 40 satir |
| `discard_task` | `task_id` | worktree + dal silinir |

- Her gorev `.termflow-worktrees/deleg-<kisa-id>` worktree'sinde, dal `deleg/<kisa-id>`; ana dala TermFlow merge ETMEZ.
- Gorev IDE'de session rail'de "Delegated by <ajan>" grubunda gorunur (canli cikti izlenebilir).
- MCP `instructions` metni: neyi devret (test, dokuman, mekanik refactor, tek dosyalik ince is), neyi devretme
  (guvenlik, mimari, geri alinmasi zor karar). Kabul kriterini `check_command` olarak ver.
- **Geri donus kurali:** ayni gorev iki kez `failed` ya da `check_command` gecmezse koordinator isi kendisi yapar
  (BRAIN-POLICY Sonnet kuralinin aynisi). Aracin aciklamasina yazilir.

## Ayarlar (Ayarlar > Orchestration, yalniz IDE)
- Ajan basina: etkin, varsayilan model, "ucretsiz" etiketi, kimlik/bakiye durumu.
- Esik kurali: "Claude 5h kullanimi %X'i gecince list_agents ucretsiz modelleri onerir" (yalniz oneri; devri ajan yapar).
- Ayni anda en fazla N is (varsayilan 2), is basina zaman asimi (varsayilan 10 dk).
- "Register MCP" dugmesi: `termflow-agents`i Claude/Codex/OpenCode yapilandirmasina yazar (Memory > Connect'in aynisi).
- Model listesi saglayici API'sinden (OpenCode icin `opencode models`), diske 24 saat cache, Refresh + Test (BRAIN-POLICY).

## Dilim 0 sonucu: headless komutlar (2026-10-17, bu PC, Windows 11)
Hepsi `a.txt` icerigini degistiren kucuk gorevle gercekten calistirildi.

| Ajan | Surum | Komut (prompt argumandir, kabuga yazilmaz) | Sonuc |
|---|---|---|---|
| OpenCode | 1.18.34 | `opencode run --dir <wt> -m <saglayici/model> --auto --format json "<prompt>"` | GECTI (JSON olay satirlari; `--dir` ile klasor) |
| Codex | 0.162.1 | `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json -C <wt> -o <wt>/<son-mesaj.txt> "<prompt>"` | GECTI 30 sn. `--sandbox workspace-write` Windows'ta "arac erisim hatasi" verip dosyayi degistirmedi |
| Grok | 1.0.52 | `grok -p "<prompt>" --always-approve --output-format json --cwd <dir>` | GECTI 40 sn. `--permission-mode acceptEdits` ile `stopReason: cancelled`, dosya degismedi |
| Gemini | 0.64.0 | `gemini -p "<prompt>" --approval-mode yolo -o json` | KULLANILAMAZ: `IneligibleTierError` (hesap katmani desteklenmiyor). Dogrulama gelene kadar listede "unavailable" |
| Claude Code | - | `claude -p` | DOGRULANMADI: bu PC'de `claude --version` bos cikti verdi. Koordinator rolunde zaten, hedef olarak sonra |

Not: tam izin bayraklari yalniz tek kullanimlik worktree icin kabul edilebilir; kullanici deposunun ana klasorunde asla.

### Ucretsiz / uygun fiyatli model olcumu (OpenCode, ayni gorev: Turkce slugify, 3 dogrulama vakasi)
| Model | Sure | Sonuc |
|---|---|---|
| `opencode/deepseek-v4.1-flash-free` | 18 sn | GECTI (en hizli) |
| `opencode/glm-5.3-flash-free` | 30-83 sn | GECTI (sure degisken) |
| `opencode/mimo-v2.6-flash-free` | 56 sn | GECTI |
| `opencode/big-pickle` | 115 sn | BASARISIZ (cikis 0 ama dosya yok) |
| `opencode/nemotron-3.5-lightning-free` | >200 sn | ZAMAN ASIMI |
| `deepseek/deepseek-flash`, `deepseek-v4-pro` | - | 402 Insufficient Balance (OpenCode'daki DeepSeek anahtarinin bakiyesi bos) |

Tek gorevlik kucuk ornek; model kalitesi hakkinda genel hukum degil. Bu yuzden "Test" dugmesi ve gorev bazli `check_command` sart.

### Profil bulgusu
Uygulamadaki sirket profilleri (`providerProfiles`: DeepSeek, OpenRouter) `claude` CLI'ini Anthropic uyumlu `baseUrl` ve
model ile calistiriyor. Bu, Claude olmayan modeller icin ikinci devir yolu: `claude -p` + o profilin env'i. Anahtarlar
`provider-secrets.json`'da; bu dilimde okunmadi/denenmedi, dilim 2'de profil env'i uygulama icinden cozulerek denenecek.

## Zorunlu tasarim kurallari (denemelerden)
1. **Surec agaci oldurulur.** Windows'ta `timeout`/`kill` yalniz sarmalayiciyi oldurur, `opencode.exe` yetim kalir ve sonraki
   OpenCode calistirmalari 0 bayt cikti ile asili kalir. Zaman asiminda ve `discard_task`ta `taskkill /T /F` (agac) kullan.
2. **OpenCode'u paralel baslatma.** 6 ayri `opencode run` ayni anda baslayinca hepsi asildi. Ya sirayla (varsayilan N=1 OpenCode icin)
   ya da tek `opencode serve` + `run --attach`. Ikisi de dilim 2'de olculur.
3. Cikis kodu 0 basari demek degildir (`big-pickle`); basari `check_command` ve diff ile olculur, bos diff = `failed`.
4. Anahtar/bakiye hatalari (402, auth) `failed` + okunur mesaj olarak koordinatora doner; sessizce yutulmaz.
5. Ajan ciktisi koordinatora gitmeden once boyut siniri (son mesaj + diff ozeti); tam diff ayrica `get_task_result` `full_diff: true` ile.
6. **Klasor her ajana acikca verilir** (`--dir` / `-C` / `--cwd` + `PWD` env). OpenCode spawn cwd'sini yok sayip miras `PWD`'yi
   kullandi ve dosyayi worktree yerine TermFlow'un kendi deposuna yazdi (dilim 1 canli denemesi). Regresyon: birim + entegrasyon testi.

## Basari olcutleri
- Claude Code `delegate_task` ile OpenCode + `opencode/deepseek-v4.1-flash-free`'e is verir, `get_task_result` diff + test sonucunu doner.
- Zaman asimli gorev sonrasi yetim `opencode.exe` kalmaz; hemen ardindan yeni gorev baslar.
- Terminal modunda Orchestration ayari ve MCP kaydi gorunmez.

## Test
- Birim: komut uretimi (ajan basina, tirnak/yeni satir), JSON olay ayristirma, kuyruk/esik mantigi, MCP `handle`.
- Entegrasyon: gecici depoda sahte ajan betigi worktree'de dosya degistirir, sonra `discard_task`.
- E2E (IDE): sahte ajanla gorev -> rail grubu -> sonuc.

## Dilimler
0. [x] Headless bayrak ve model dogrulamasi (bu belge).
1. [x] `agentRunner.ts`: komut tablosu, worktree'de calistirma, surec agaci oldurme (`worktreeSetup.killProcessTree`), zaman asimi,
   iptal, diff (yeni dosyalar dahil), kontrol komutu, `discardTask`. Birim 11 + entegrasyon 8 test. Canli: OpenCode
   (deepseek-v4.1-flash-free, glm-5.3-flash-free), Grok, Codex ayni slugify gorevini worktree'de yapti, kontrol gecti (4/4).
2. Gorev kuyrugu, hookServer'a yerel API, OpenCode seri/serve karari, provider profil env'iyle `claude -p`.
3. `termflow-agents` MCP + `list_agents` (agentUsage limit verisi) + Register MCP.
4. Ayarlar > Orchestration, rail grubu, model listesi cache + Test.
5. Esik onerisi, E2E, dokuman/site.
