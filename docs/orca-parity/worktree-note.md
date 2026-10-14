# worktree-note - Sekme / worktree durum notu

Durum: TASLAK 2026-10-14. Bagimli: agent-hooks. Ortak kurallar: [README.md](README.md).

## Amac
Paralel ajanlarla calisirken her worktree'nin "ne yapiliyor, nerede kaldi" bilgisini bir bakista gormek.
Orca'da ajan bunu CLI ile yaziyor; TermFlow'da uygulamayi kumanda eden CLI kapsam disi, bu yuzden not
iki kaynaktan dolar: kullanici elle yazar, ajanin son tur ozeti otomatik onerilir.

## Davranis
- Sekme basina `note?: { text: string; stage: 'todo' | 'in-progress' | 'review' | 'done'; updatedAt: number; source: 'user' | 'agent' }`.
  `session.json`'a yazilir (worktree sekmesi kapaninca silinir).
- Session rail'de worktree satirinin altinda tek satir not + asama rozeti; tiklayinca duzenleme kutusu.
  Sekme sag tik menusu "Edit note...". Asama klavyeyle degistirilebilir.
- Otomatik: agent-hooks `Stop` olayi geldiginde `last_assistant_message`'in ilk anlamli satiri (maskeli, 120 karakter)
  `source: 'agent'` olarak yazilir; kullanici notu (`source: 'user'`) varsa EZILMEZ, ajan ozeti altta soluk satir olur.
- Asama otomatik degismez; yalniz kullanici degistirir (verilmis karar: duygu/durum metinden tahmin edilmez).
- Telefon (Remote Access) sekme listesinde not ve asama gorunur ve duzenlenebilir.
- Jump palette notu aranabilir alana ekler.

## Basari olcutleri
- Claude turu bitince session rail'de ozet satiri gorunur.
- Elle yazilan not sonraki turlarda kaybolmaz.
- Yeniden acilista not ve asama geri gelir.

## Test
- Birim: ozet satiri secimi (bos satir, kod blogu, markdown basligi atlanir), kullanici/ajan onceligi, normalize.
- E2E: not yaz -> yeniden baslat -> not duruyor; sahte Stop olayi -> ajan satiri.

## Dilimler
1. Model + session.json + rail gosterimi + elle duzenleme.
2. Stop olayindan otomatik ozet + telefon + palet aramasi.
