# worktree-setup - Worktree kurulum adimlari

Durum: TASLAK 2026-10-14. Bagimli: yok. Ortak kurallar: [README.md](README.md).

## Amac
Ajan basina worktree bugun var (`.termflow-worktrees/`), ama yeni checkout'ta `node_modules` ve `.env`
yok; ajanin ilk isi kurulumla ugrasmak oluyor. Depo basina bir kez tanimlanan adimlar her yeni
worktree'de ajan baslamadan once otomatik calissin.

## Davranis
- Ayar `worktreeSetup: Record<repoRoot, { copyFiles: string[]; commands: string[]; enabled: boolean }>`.
  Duzenleme: worktree baslatici modalinda (`WorktreeLauncherModal.tsx`) "Setup steps" acilir bolumu ve
  Ayarlar > Workspaces altinda depo listesi.
- **copyFiles:** depo kokune gore goreli yollar ya da basit glob (`.env*`, `config/local.json`). Ana surec yalniz
  kok icindeki duzenli dosyalari kopyalar (`..`, mutlak yol, sembolik link reddedilir), hedef zaten varsa atlar.
- **commands:** sirayla, worktree klasorunde, kullanicinin varsayilan kabuguyla. Cikti modalda canli gosterilir
  (kucuk salt-okunur xterm), adim basina 10 dk zaman asimi, iptal dugmesi.
- Bir adim basarisiz olursa: "Setup failed at step 2. [Start agent anyway] [Open shell here] [Cancel]".
- Baslangic onerisi: depoda `package-lock.json` varsa `npm ci`, `pnpm-lock.yaml` varsa `pnpm install`,
  `requirements.txt` varsa `pip install -r requirements.txt` oneri olarak doldurulur (kaydedilmeden calismaz).
  Mevcut proje algilama (`ipc/project.ts`) kullanilir.
- GitHub PR'dan worktree acma akisi da ayni adimlari calistirir.

## Basari olcutleri
- `.env` ve `npm ci` tanimli depoda yeni worktree acilinca ajan `.env` mevcut ve `node_modules` kurulu halde baslar.
- Kok disina cikan yol (`../secret`) kaydedilemez, ana surec de reddeder.
- Basarisiz adimda uc secenek calisir; Cancel worktree'yi kaldirma teklifini (mevcut akis) gosterir.

## Test
- Birim: yol/glob dogrulama ve cozumleme, oneri uretimi (kilit dosyasina gore).
- Entegrasyon: gecici git deposunda worktree + kopyalama + basarili/basarisiz komut.
- E2E: modalda adim tanimla -> worktree ac -> dosya mevcut.

## Dilimler
1. Ayar modeli + ana surec kopyalama (guvenli yol) + testler.
2. Komut calistirma + canli cikti + basarisizlik secenekleri.
3. Oneriler + GitHub PR akisi + Ayarlar listesi.
