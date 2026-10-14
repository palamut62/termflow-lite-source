# terminal-polish - Kucuk ama gunluk terminal iyilestirmeleri

Durum: UYGULANDI 2026-10-14 (dal `feature/agent-hooks`). Bagimli: agent-hooks (yalniz Copy Session ID). Ortak kurallar: [README.md](README.md).
Her madde bagimsiz; ayri commit, ayri test.

## 1. Reset Terminal
- Sag tik menusune (`TerminalContextMenu.tsx`, Clear'in altina) "Reset Terminal": `term.reset()` + yeniden fit.
  Coken bir TUI'nin biraktigi fare izleme, bracketed paste, uygulama imlec tuslari, alternatif ekran temizlenir;
  kabuk yeniden baslamaz, PTY'ye bir sey yazilmaz.
- Olcut: `printf '\e[?1000h\e[?1049h'` sonrasi Reset ile fare secimi ve normal ekran geri gelir, kabuk ayni PID.

## 2. OSC 52 pano yazma
- `registerOscHandler(52)`: `c;<base64>` (ya da bos secici) -> metin -> mevcut pano IPC'si. SSH + tmux icindeki
  TUI'lerden kopyalama calisir (TermFlow'un kalici tmux oturumu ozelligiyle dogrudan ilgili).
- Okuma istegi (`?`) her zaman reddedilir (guvenlik). Ust sinir 1 MB; gecersiz base64 yok sayilir.
- Ayar `osc52Clipboard: boolean` (varsayilan acik), kopyalaninca kucuk toast "Copied from terminal app".
- Olcut: `printf '\e]52;c;%s\a' $(printf hello | base64)` sonrasi panoda `hello`.

## 3. Shift+Enter ile yeni satir (ajan girislerinde)
- xterm.js 6 kitty klavye protokolunu desteklemiyor (typings'te yok); bu yuzden eslemeyle cozulur:
  ajan sekmesinde (Claude Code, Codex, OpenCode) Shift+Enter -> `\x1b\r` (Meta+Enter, Claude Code'un tanidigi
  yeni satir). Ayar `shiftEnterNewline: 'agents' | 'always' | 'off'` (varsayilan `agents`).
- Dilim 0: Codex ve OpenCode'un `\x1b\r`'yi yeni satir sayip saymadigi canli denenir; saymayana Ctrl+J (`\n`) gonderilir.
- Olcut: Claude Code giris kutusunda Shift+Enter ikinci satir acar, gondermez.

## 4. Link tiklama menusu
- Duz tikla web/dosya linkinde kucuk menu: Open, Copy link (dosyada ek: Reveal in folder, Open in editor);
  Ctrl+tik dogrudan acar (bugunku davranis). Ayar `linkClick: 'menu' | 'open-with-ctrl'` (varsayilan bugunku davranis).
- `pathLinks.ts` ve web-links eklentisinin activate cagrisi ortak bir `openLinkMenu`'ye gider.

## 5. Tema ice aktarma + minimum kontrast
- Ayarlar > Appearance > Import theme: Windows Terminal JSON (`schemes[]`), iTerm2 `.itermcolors` (plist XML),
  Ghostty tema dosyasi (`palette = N=#rrggbb`, `background`, `foreground`, `cursor-color`). Ana surecte dialog ile
  secilir, renderer'a yalniz ayristirilmis renkler gelir; `customTheme`'e (ya da adlandirilmis ozel temalar listesine) yazilir.
- `minimumContrastRatio` xterm secenegi (1-21, varsayilan 1 = kapali; "Auto" = 4.5) ayar olarak.
- Olcut: uc formattan birer ornek dosya ice aktarilir ve 16 renk + on/arka plan dogru.

## 6. Copy Session ID ve ajan basligi
- Sekme sag tik menusune "Copy Session ID" (agent-hooks'tan gelen kimlik varsa).
- Konusma basligi agent-hooks'ta (elle verilen ad her zaman kazanir).

## Test
- Birim: OSC 52 ayristirma (secici, base64, boyut, `?` red), uc tema ayristiricisi (ornek dosyalarla),
  Shift+Enter karar fonksiyonu (sekme turu x ayar), link menusu aksiyon listesi.
- E2E: Reset Terminal, OSC 52 -> pano (pano kilit riski bilinen, `app.spec` notuna bak), tema ice aktarma.

## Uygulama notlari (2026-10-14)
- Saf yardimcilar `src/renderer/src/terminal/terminalExtras.ts` (OSC 52, URL, Shift+Enter), tema ayristirici
  `src/shared/themeImport.ts`; ikisi de testli. E2E `e2e/terminal-polish.spec.ts`.
- Shift+Enter: Claude'a `ESC CR` (2.1.289'da gondermeden cok satira gectigi denendi), Codex/OpenCode'a `LF` (Ctrl+J,
  belgelenmis; Codex limiti dolu oldugu icin canli denenmedi). Ayar tek anahtar `shiftEnterNewline` (varsayilan acik);
  'always' secenegi eklenmedi (kabukta ESC CR anlamsiz).
- Link: duz tik davranisi degismedi (web linki ve yol dogrudan acilir). Orca'nin duz tik menusu yerine mevcut sag tik
  desenine "Open Link / Copy Link" eklendi (yollarda zaten Open/Reveal/Copy Path vardi). `linkClick` ayari eklenmedi.
- Tema ice aktarma tek `customTheme`'in uzerine yazar ve onu secer (adlandirilmis liste eklenmedi).
- Reset Terminal `term.reset()` (RIS): ekran ve gecmis temizlenir, PTY'ye bir sey yazilmaz.
- OSC 52 her yazmada kucuk toast gosterir; okuma (`?`) reddedilir; ust sinir ~1 MB.
- E2E OSC 52 testi gercek isletim sistemi panosuna yazar (app.spec'teki gibi).
