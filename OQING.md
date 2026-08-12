# TraderPro — 2-BOSQICH (server qatlami)

Bu papkadagi fayllar saytning **ichiga kirmaydi** — ular server tomonida turadi.
Sayt (`index.html`) allaqachon ularni **qo'llab-quvvatlaydigan qilib yangilandi**:
Ctrl+K → **"Server qatlami"** buyrug'i orqali holatni ko'rasiz va sozlaysiz.

| Fayl | Nima uchun |
|---|---|
| `firestore.rules` | Firebase ma'lumot bazasini himoyalash |
| `storage.rules` | Skrinshotlar saqlanadigan Storage himoyasi |
| `worker.js` | Gemini kalitini serverda yashiradigan proxy (Cloudflare Worker) |
| `sw.js` | Offline rejim (Service Worker) |
| `manifest.webmanifest` | Telefonga "ilova" bo'lib o'rnatilishi |
| `icon.svg` | Ilova ikonkasi |
| `build_split.py` | Bitta faylni CSS/JS ga bo'lish va siqish |

---

## 1) Firebase qoidalari (5 daqiqa) — ENG MUHIMI

Hozir bazangiz **himoyasiz** bo'lishi mumkin: qoidalar "test mode" da bo'lsa,
havolani bilgan har kim ma'lumotni o'qiy va o'chira oladi.

1. [console.firebase.google.com](https://console.firebase.google.com) → loyihangiz `zavqiddin-98795`
2. **Firestore Database → Rules** → `firestore.rules` matnini qo'ying → **Publish**
3. **Storage → Rules** → `storage.rules` matnini qo'ying → **Publish**
4. Tekshiring: o'zingiz kirsangiz yozish ishlaydi, boshqa akkaunt faqat o'qiydi.

> Qoidalarda sizning emailingiz yozilgan. Email o'zgarsa — qoidada ham o'zgartiring.

---

## 2) AI proxy — Gemini kalitini brauzerdan olib tashlash (15 daqiqa)

Hozir kalit foydalanuvchi brauzerida turadi. Kim saytni ochsa, kalitni ko'ra oladi.
Proxy yoqilgach kalit **faqat serverda** qoladi.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**
2. Kod oynasiga `worker.js` ni to'liq joylang → **Deploy**
3. **Settings → Variables and Secrets** ga qo'shing:
   - `GEMINI_KEY` (Secret) — Google AI Studio kaliti
   - `SITE_SECRET` (Secret) — o'zingiz o'ylab topgan uzun parol
   - `ALLOWED_ORIGINS` (Text) — saytingiz manzili, masalan `https://traderpro.pages.dev`
   - `TG_TOKEN`, `TG_CHAT` (ixtiyoriy) — Telegram uchun
4. Worker manzilini nusxalang (`...workers.dev`)
5. Saytda: **Ctrl+K → "AI proxy sozlash"** → manzil + `SITE_SECRET` ni kiriting
6. **Ctrl+K → "Server qatlami" → Tekshirish** — yashil bo'lsa tayyor

### Muhim xavfsizlik qadami
Eski kalit fayl ichida ko'rilgan bo'lishi mumkin. Proxy ishlaganiga ishonch hosil qilgach:
- Google AI Studio da **eski kalitni o'chiring**, yangisini yarating va faqat Worker ga qo'ying
- Sayt sozlamalaridagi brauzer kalitini tozalang

> Proxy o'chiq turganda sayt avvalgidek to'g'ridan-to'g'ri Google API bilan ishlaydi — hech narsa buzilmaydi.

---

## 3) PWA — telefonga ilova qilib o'rnatish (5 daqiqa)

Faqat **HTTPS** orqali ochilganda ishlaydi (Netlify, Vercel, GitHub Pages, Firebase Hosting).

1. `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` — to'rttasini **bitta papkaga** joylang
2. Saytni oching → **Ctrl+K → "Offline rejim (PWA)"**
3. Telefonda brauzer menyusi → **"Add to Home screen"**

Natija: ilova ikonkasi, to'liq ekran, internetsiz ham ochiladi (ma'lumot allaqachon telefonda).

> Yangi versiya chiqarganingizda `sw.js` ichidagi `traderpro-v1` ni `v2` ga o'zgartiring — aks holda eski nusxa keshda qolishi mumkin.

---

## 4) Faylni bo'lish va siqish (ixtiyoriy)

```bash
cd stage2
python3 build_split.py
```

`dist/` papkasida: `index.html` + `assets/app-XX.js` + `assets/style-XX.css` + `.gz` nusxalar.

- Brauzer keshi ishlaydi — ikkinchi ochilishda ancha tez
- `esbuild` yoki `terser` o'rnatilgan bo'lsa avtomatik minify qiladi
- Firebase modul skripti **ataylab tegilmaydi** (aks holda `file://` da ishlamay qoladi)
- Bitta faylli `index.html` baribir saqlanadi — uni o'chirmang

---

## 5) Telegram bildirishnomalari

Ikki xil ishlaydi:
- **Bot to'g'ridan-to'g'ri** — saytdagi Market Signal bo'limida token va chat id ni kiriting
- **Proxy orqali** — token Worker da yashirin qoladi (xavfsizroq)

Saytda: **Ctrl+K → "Telegram xabarlari"**
- 📊 Kun yakuni hisoboti
- 🚫 Limit ishga tushganda ogohlantirish (kuniga bir marta)
- ⛔ VETO — taqiqlangan bitim urinishi
- 🗓 Haftalik xulosa (qo'lda yuboriladi)

---

## 6) Keyingi bosqich uchun qolgan ishlar

| Ish | Nima kerak |
|---|---|
| Mentor izohlari (ko'p foydalanuvchi) | `firestore.rules` dagi `comments` bo'limi tayyor, UI kerak |
| Web Push bildirishnoma | Firebase Cloud Messaging + server kaliti |
| Avtomatik kunlik hisobot (siz saytni ochmasangiz ham) | Cloudflare Cron Trigger + Worker |
| Ma'lumotni shifrlash | Parol asosidagi kalit (Web Crypto API) |
