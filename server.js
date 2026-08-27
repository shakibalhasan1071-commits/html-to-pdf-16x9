/**
 * HTML → 16:9 PDF (Puppeteer / headless Chrome)
 * POST /api/export-pdf  { html: "<!DOCTYPE html>..." } or multipart file
 * Returns application/pdf
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// Serve UI from /public or repo root (GitHub upload often puts index.html at root)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const fs = require('fs');
app.get('/', (req, res) => {
  const candidates = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).send('index.html not found. Upload public/index.html or index.html to the repo.');
});

/** CSS forced before print — exact 16:9 pages */
const FORCE_16x9_CSS = `
@page {
  size: 16in 9in;
  margin: 0;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 16in !important;
  background: #000;
}
.slide,
.slide-frame,
.pg,
.slide-wrapper {
  page-break-after: always !important;
  break-after: page !important;
  width: 16in !important;
  height: 9in !important;
  max-width: 16in !important;
  max-height: 9in !important;
  margin: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.slide:last-child,
.slide-frame:last-child,
.pg:last-child {
  page-break-after: auto !important;
  break-after: auto !important;
}
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
`;

function wrapHtmlIfNeeded(html) {
  const raw = String(html || '').trim();
  if (!raw) return null;

  // Full document
  if (/<html[\s>]/i.test(raw) || /<!DOCTYPE/i.test(raw)) {
    return raw;
  }

  // Fragment → full page
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>16:9 Export</title>
</head>
<body>
${raw}
</body>
</html>`;
}

async function htmlToPdfBuffer(html) {
  const documentHtml = wrapHtmlIfNeeded(html);
  if (!documentHtml) {
    throw new Error('HTML খালি');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    // Viewport roughly 16:9 for layout (CSS @page controls PDF page size)
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    await page.setContent(documentHtml, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 180000
    });
    await page.addStyleTag({ content: FORCE_16x9_CSS });
    // KaTeX + web fonts load
    try {
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        // extra wait for KaTeX font files
        await new Promise(r => setTimeout(r, 800));
      });
    } catch (e) {}
    try {
      await page.waitForFunction(() => {
        const k = document.querySelector('.katex');
        if (!k) return true;
        return document.fonts && document.fonts.check('1em KaTeX_Main');
      }, { timeout: 8000 }).catch(() => {});
    } catch (e2) {}
    const pdf = await page.pdf({
      width: '16in',
      height: '9in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

/** JSON body: { html: "..." } */
app.post('/api/export-pdf', async (req, res) => {
  try {
    let html = req.body && req.body.html;

    // Optional: file field via multipart (same route with multer)
    if (!html && req.file && req.file.buffer) {
      html = req.file.buffer.toString('utf8');
    }

    if (!html || !String(html).trim()) {
      return res.status(400).json({ error: 'html required — JSON { html } or file upload' });
    }

    const pdfBuffer = await htmlToPdfBuffer(html);

    // সবসময় ফিক্সড ASCII নাম — বাংলা হেডারে যাবে না
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="slides-16x9.pdf"');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error('export-pdf error:', err);
    res.status(500).json({
      error: err.message || 'PDF generation failed',
    });
  }
});

/** Multipart: field "html" or file "file" */
app.post('/api/export-pdf-upload', upload.single('file'), async (req, res) => {
  try {
    let html = (req.body && req.body.html) || '';
    if (req.file && req.file.buffer) {
      html = req.file.buffer.toString('utf8');
    }
    if (!html.trim()) {
      return res.status(400).json({ error: 'file or html required' });
    }

    const pdfBuffer = await htmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="slides-16x9.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('export-pdf-upload error:', err);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, page: '16in x 9in', engine: 'puppeteer' });
});

app.listen(PORT, () => {
  console.log(`HTML→16:9 PDF running on http://localhost:${PORT}`);
  console.log(`  UI:  http://localhost:${PORT}/`);
  console.log(`  API: POST /api/export-pdf  { "html": "..." }`);
});
