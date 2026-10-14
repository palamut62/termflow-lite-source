# agent-resume - Geri yuklenen ajan sekmesini kendi oturumuyla surdurmek

Durum: TASLAK 2026-10-14. Bagimli: agent-hooks. Ortak kurallar: [README.md](README.md).

## Amac
Orca'da ajanlar ayri bir arka plan servisinde yasar, uygulama kapansa da olmez. TermFlow'da Quit,
guncelleme ya da cokme tum ajanlari oldurur. Ayri servis buyuk bir mimari degisiklik; bunun yerine
ayni kullanici faydasinin buyuk kismini ucuza veren yol: yeniden acilista ajan sekmesi bos shell ya da
yeni ajan yerine kaldigi konusmayla (`claude --resume <id>`, `codex resume <id>`, `opencode --session <id>`) acilir.
Surdurme argumanlari bugun zaten var (`profileResolver.ts`).

## Mevcut karar ile catisma (ONAY GEREKLI)
`PersistedSession` yorumu: "ajan konusma referansi (resumeSession) bilincli olarak yazilmaz" ve
`SessionStore` bu alani dusurur. Bu modul o karari su kosulla degistirir: yalniz `{ agent, id }` yazilir
(konusma icerigi degil), ayar acikken.

## Davranis
- Oturum kimligi kaynagi: agent-hooks (`SessionStart.session_id` Claude, `notify thread-id` Codex). Hook yoksa
  mevcut oturum tarayicisinin eslestirmesi (cwd + baslangic zamani, `AgentSessionOwnershipStore`) yedek.
- Acilista ajan sekmesi icin: kimlik varsa sekme `resume` argumaniyla baslar; scrollback-restore varsa eski cikti
  ustte, ayirici "resuming <agent> session" altta.
- Yalniz kapanista ajan bostaysa (`done`/`needs-input`) otomatik surdurulur. Kapanista ajan calisiyorsa
  (`working`) tur yarida kesilmistir: sekme bir kart gosterir: "Claude Code was working when TermFlow closed.
  [Resume] [Start fresh]" (in-app, native dialog yok).
- Surdurme basarisiz olursa (ajan cikis kodu != 0 ilk 5 sn icinde) sekme normal ajan baslangicina duser ve toast gosterir.
- Ayar `resumeAgentsOnRestore: 'off' | 'ask' | 'auto'` (varsayilan `ask`: her sekme icin kart).
- Kapanis onayi: pencere kapatilip calisan ajan varsa mevcut "Confirm before close" metni "N agents are working;
  they will be resumed next time" seklinde bilgilendirir.

## Basari olcutleri
- Bos Claude sekmesi olan oturum kapatilip acilinca ayni konusma devam eder (ilk mesajda onceki baglam var).
- Calisirken kapatilan sekme Resume / Start fresh karti gosterir.
- Ayar `off` iken `session.json`'da ajan kimligi yok.
- Silinmis ya da baska makineye ait oturum kimligi sekmeyi bozmaz.

## Test
- Birim: `SessionStore` normalize (`resumeSession` yalniz `{agent,id}` ve izinli ajanlarla), karar tablosu
  (ayar x kapanis durumu -> auto/kart/hicbiri), basarisiz surdurme yedegi.
- E2E: sahte ajan betigi `--resume <id>` argumanini ekrana yazar; yeniden acilista arguman dogrulanir.

## Dilimler
1. Kimligi sekmeye bagla + `session.json`'a yaz/oku (ayar arkasinda).
2. Acilista auto/ask akisi + kart + basarisiz yedek.
3. Kapanis onayi metni, Remote Access sekme listesine "resumed" etiketi.

## Acik sorular
- Varsayilan `ask` mi `auto` mu?
- Ileride gercek arka plan servisi (Orca'nin daemon'u gibi) istenirse ayri spec; bu modul onu engellemez.
