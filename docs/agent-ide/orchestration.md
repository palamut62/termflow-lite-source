# Orchestration - Ajandan ajana is devri (Agent IDE)

Durum: UYGULANDI 2026-10-17 (dilim 0-5). Kapsam: yalniz Agent IDE surumu; ayar sayfasi ve Delegated paneli yalniz IDE
yerlesiminde (`uiMode: 'ide'`) gorunur, Lite'ta servis hic kurulmaz. PRD Faz 5 "orchestration" maddesi.

## Amac
Koordinator ajan (Claude Code, Codex, OpenCode) mekanik isleri baska bir ajana/modele (OpenCode + ucretsiz modeller,
Grok, Codex, Claude Code ya da `claude` ile calisan saglayici profilleri) devreder ve sonucu diff + kontrol komutuyla
denetler. Amac: pahali ajanin limitini planlama/review/kritik isler icin saklamak. TermFlow isi yapmaz; izolasyon,
calistirma, kuyruk ve limit gorunurlugu saglar.

## Akis
1. Koordinator `list_agents` cagirir: kullanilabilir hedefler, model, ucretsiz mi, Claude/Codex limitleri, esik ipucu.
2. `delegate_task(agent, prompt, cwd, model?, check_command?, timeout_s?)` -> gorev kuyruga girer, id hemen doner.
3. TermFlow depo HEAD'inden `deleg/<id>` dalinda worktree acar (`../.termflow-worktrees/<depo>/deleg-<id>`), ajani
   headless calistirir, degisiklikleri o dala commit eder ("TermFlow delegate", `--no-verify`), kontrol komutunu kosar.
4. `get_task_result(task_id, wait_s<=55, full_diff?)` bitene kadar bekler; durum, dosyalar, diff ozeti, kontrol ciktisi,
   son mesaj, maliyet. Koordinator inceler, uygunsa kendi checkout'unda `git cherry-pick <commit>`, sonra `discard_task`.
5. Ayni gorev iki kez basarisiz olursa koordinator isi kendisi yapar (MCP talimatinda ve sonuc metninde yazili).

## Parcalar
| Dosya | Gorev |
|---|---|
| `src/main/agentRunner.ts` | Komut tablosu, worktree'de calistirma, surec agaci oldurme, zaman asimi, iptal, diff + commit, kontrol, `discardTask`, `taskDiff` |
| `src/main/orchestration/manager.ts` | Hedef listesi/cozme (saglayici env + anahtar), kuyruk (genel sinir + OpenCode tek), kalici kayit (`userData/orchestration/tasks.json`, son 50), `wait` |
| `src/main/orchestration/models.ts` | CLI'dan model listesi (`opencode models --verbose`, `grok models`), memory `ModelCatalog` ile 24 saat cache |
| `src/main/orchestration/service.ts` | Hepsini baglar: hedefler, `list_agents` raporu, esik ipucu, Test, API |
| `src/main/orchestration/apiServer.ts` | Yerel HTTP API (127.0.0.1, Host + token kontrolu), `endpoint.json` |
| `src/main/orchestration/mcpServer.ts`, `serverEntry.ts` | `termflow-agents` stdio MCP (`out/mcp/agents-server.cjs`) |
| `src/main/ipc/orchestration.ts` | IPC, API'yi ayarla ac/kapa, MCP kaydi (memory `connect.ts`, ad parametreli) |
| `src/renderer/src/settings/OrchestrationSettings.tsx` | Ayarlar > Orchestration |
| `src/renderer/src/shells/ide/DelegatedPanel.tsx` | Sag panel "Delegated tasks" sekmesi |

## Kararlar
- **Endpoint dosyasi:** MCP sureci ajanin cocugu; hookServer gibi token env ile gelemez. Port + token
  `userData/orchestration/endpoint.json`'a yazilir, MCP her cagrida okur (uygulama yeniden acilinca kendiliginden duzelir).
  Dosya kapanista silinir. Ayni kullanicinin surecleri okuyabilir; hookServer env'i icin de ayni varsayim gecerli.
- **Commit + cherry-pick:** yalniz index'e almak koordinatorun sonucu almasini zorlastiriyordu; gorev dalina commit edilir.
  TermFlow ana dala merge ETMEZ.
- **Session rail grubu yerine Delegated paneli:** headless gorevin PTY'si yok; panel durum, sure, maliyet, dosyalar,
  kontrol ve cikti sonunu gosterir; Open (worktree'de kabuk), Copy apply command, Stop, Discard.
- **Uzaktan Erisim:** orchestration IPC'leri telefon izin listesinde DEGIL (Test/gorev ajan calistirir).
- **Model listesi:** CLI'in kendi komutundan; Codex'te liste komutu yok (serbest metin), Claude icin cevrimdisi yedek
  (`haiku/sonnet/opus`), saglayici profilinde profilin modelleri. `structured` alani burada arac cagirma yetenegi.
- **Varsayilan:** kapali; OpenCode modeli `opencode/deepseek-v4.1-flash-free` (olcumde en hizli gecen ucretsiz model),
  ayni anda 2 gorev, 10 dk sinir, Claude 5h esigi %70.

## Headless komutlar (2026-10-17, bu PC, Windows 11, hepsi gercek gorevle denendi)
| Ajan | Surum | Komut (prompt argumandir, kabuk yok) | Sonuc |
|---|---|---|---|
| OpenCode | 1.18.34 | `opencode run --dir <wt> -m <model> --auto --format json "<p>"` | GECTI |
| Codex | 0.162.1 | `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json -C <wt> -o <wt>/.termflow-last-message.txt "<p>"` | GECTI 30 sn; `--sandbox workspace-write` Windows'ta dosya yazamadi |
| Grok | 1.0.52 | `grok -p "<p>" --always-approve --output-format json --cwd <wt>` | GECTI 40 sn; `acceptEdits` gorevi iptal etti |
| Claude Code | 2.1.289 | `claude -p "<p>" --dangerously-skip-permissions --output-format json [--model m]` | GECTI 45 sn ($0.04, haiku). Klasor bayragi yok: spawn cwd + `PWD` |
| Gemini | 0.64.0 | `gemini -p "<p>" --approval-mode yolo -o json` | KULLANILAMAZ: `IneligibleTierError`; hedef listesinde yok |

Saglayici profilleri (`providerProfiles`, komutu `claude`): `baseUrlEnv`/`apiKeyEnv`/`modelEnv` env ile verilir, anahtar
yalniz o surecin env'ine girer, kayda/sonuca yazilmaz. `modelEnv` varsa `--model` gecilmez.

### Ucretsiz model olcumu (OpenCode, Turkce slugify, 3 vaka)
| Model | Sure | Sonuc |
|---|---|---|
| `opencode/deepseek-v4.1-flash-free` | 18 sn | GECTI |
| `opencode/glm-5.3-flash-free` | 30-83 sn | GECTI |
| `opencode/mimo-v2.6-flash-free` | 56 sn | GECTI |
| `opencode/big-pickle` | 115 sn | BASARISIZ (cikis 0, dosya yok) |
| `opencode/nemotron-3.5-lightning-free` | >200 sn | ZAMAN ASIMI |
| `deepseek/deepseek-flash`, `deepseek-v4-pro` | - | 402 Insufficient Balance |

Kucuk ornek; genel kalite hukmu degil. Bu yuzden Test dugmesi ve gorev basina `check_command`.

## Zorunlu kurallar (denemelerden)
1. **Surec agaci oldurulur** (`worktreeSetup.killProcessTree`): Windows'ta yalniz sarmalayiciyi oldurmek yetim `opencode.exe`
   birakir ve sonraki OpenCode calistirmalari 0 bayt ciktiyla asili kalir.
2. **OpenCode tek tek:** 6 paralel `opencode run` hepsi asildi; kuyruk OpenCode'u seri calistirir.
3. **Cikis 0 basari degil:** bos diff = `failed`; kontrol komutu gecmezse `failed`.
4. **Saglayici hatalari** (402, auth, `is_error`) okunur mesajla `failed` doner.
5. **Cikti siniri:** son mesaj 4000, cikti sonu 8000 karakter; tam diff yalniz `full_diff` ile (200 KB'de kesilir).
6. **Klasor acikca verilir** (`--dir` / `-C` / `--cwd` + `PWD`): OpenCode spawn cwd'sini yok sayip miras `PWD`'ye,
   TermFlow'un kendi deposuna yazdi.

## Test
- Birim: `agentRunner.test.ts`, `orchestration/{models,manager,api}.test.ts`, `SettingsStore`, `connect` (ad parametresi).
- Entegrasyon: `agentRunner.integration.test.ts` (gercek git, sahte ajan, agac oldurme, iptal, PWD, commit).
- E2E (IDE): `e2e/ide-orchestration.spec.ts` - PATH'te sahte `opencode`; API -> worktree -> kontrol -> Delegated paneli ->
  Discard; kotu istekler; Terminal yerlesiminde ayar gizli.
- Canli: OpenCode (deepseek-v4.1-flash-free, glm-5.3-flash-free), Grok, Codex gercek gorevle 4/4 (dilim 1).

## Dilimler
0. [x] Headless bayrak ve model dogrulamasi.
1. [x] `agentRunner.ts`.
2. [x] Kuyruk, yerel API, saglayici profil env'iyle `claude -p`.
3. [x] `termflow-agents` MCP, `list_agents` limit raporu, Connect.
4. [x] Ayarlar > Orchestration (model listesi + Yenile + Test), Delegated paneli.
5. [x] Esik ipucu, E2E, dokuman. Site bolumu yok (karar bekliyor).

## Acik
- Gercek koordinatorden (Claude Code MCP uzerinden) uctan uca deneme: kullanici Ayarlar > Orchestration > Connect yapinca.
- Linux'ta elle denenmedi (surec grubu oldurme kodu var, test Windows'ta kostu).
- `opencode serve` + `--attach` ile OpenCode paralelligi olculmedi; simdilik seri.
