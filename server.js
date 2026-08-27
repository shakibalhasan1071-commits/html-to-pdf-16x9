/**
 * HTML → 16:9 PDF (Puppeteer / headless Chrome)
 * POST /api/export-pdf  { html: "<!DOCTYPE html>..." }
 */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  const candidates = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).send('index.html not found.');
});

const FORCE_16x9_CSS = `
@page { size: 16in 9in; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; width: 16in !important; background: #000; }
.slide, .slide-frame, .pg, .slide-wrapper {
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
.slide:last-child, .slide-frame:last-child, .pg:last-child {
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
  if (/<html[\s>]/i.test(raw) || /<!DOCTYPE/i.test(raw)) return raw;
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
  if (!documentHtml) throw new Error('HTML খালি');

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
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(documentHtml, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 120000,
    });
    await page.addStyleTag({ content: FORCE_16x9_CSS });
    try {
      await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 300));

    return await page.pdf({
      width: '16in',
      height: '9in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
}

app.post('/api/export-pdf', async (req, res) => {
  try {
    let html = req.body && req.body.html;
    if (!html && req.file && req.file.buffer) {
      html = req.file.buffer.toString('utf8');
    }
    if (!html || !String(html).trim()) {
      return res.status(400).json({ error: 'html required' });
    }

    const pdfBuffer = await htmlToPdfBuffer(html);

    // বাংলা নাম হেডারে দিলে error হয় — শুধু ASCII
    const rawName = (req.body && req.body.filename) || 'slides-16x9.pdf';
    let safe = String(rawName)
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80);
    if (!safe || safe === '.pdf') safe = 'slides-16x9';
    if (!/\.pdf$/i.test(safe)) safe += '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '"');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (err) {
    console.error('export-pdf error:', err);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});

app.post('/api/export-pdf-upload', upload.single('file'), async (req, res) => {
  try {
    let html = (req.body && req.body.html) || '';
    if (req.file && req.file.buffer) html = req.file.buffer.toString('utf8');
    if (!html.trim()) return res.status(400).json({ error: 'file or html required' });
    const pdfBuffer = await htmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="slides-16x9.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, page: '16in x 9in', engine: 'puppeteer' });
});

app.listen(PORT, () => {
  console.log('HTML→16:9 PDF on port', PORT);
});
