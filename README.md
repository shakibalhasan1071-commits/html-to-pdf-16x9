# HTML → 16:9 PDF (Puppeteer)

সার্ভার-সাইডে headless Chrome দিয়ে **নিখুঁত 16in × 9in** PDF।

## চালানো

```bash
cd html-to-pdf-16x9
npm install
npm start
```

ব্রাউজার: http://localhost:3000

## API

**POST** `/api/export-pdf`

```json
{ "html": "<!DOCTYPE html>...", "filename": "slides-16x9.pdf" }
```

Response: `application/pdf`

**POST** `/api/export-pdf-upload` — multipart `file` বা field `html`

## সার্ভারে যা হয়

1. HTML লোড (`setContent`)
2. CSS ইনজেক্ট:
   - `@page { size: 16in 9in; margin: 0; }`
   - `.slide, .slide-frame, .pg { width: 16in; height: 9in; page-break-after: always; }`
3. `page.pdf({ width: '16in', height: '9in', printBackground: true, preferCSSPageSize: true })`

## ডিপ্লয় নোট

- Linux সার্ভারে Puppeteer-এর জন্য প্রয়োজনীয় Chrome deps ইনস্টল করতে হতে পারে
- `PORT` env দিয়ে পোর্ট বদলানো যায়
- বড় HTML (বেস64 ছবি) → body limit 25MB

## Auto Slides এর সাথে

অ্যাপ থেকে “দ্রুত HTML” এক্সপোর্ট নিয়ে এখানে পেস্ট/আপলোড → 16:9 PDF।
অথবা Auto Slides থেকে `POST /api/export-pdf` কল করে ইন্টিগ্রেট করা যায়।
