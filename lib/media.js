import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bounded } from './files.js';

const execute = promisify(execFile);
let pdfModule;
async function pdf(path) {
  pdfModule ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = await pdfModule;
  return getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false, useSystemFonts: true }).promise;
}
async function renderPage(doc, pageNumber) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const page = await doc.getPage(pageNumber);
  const initial = page.getViewport({ scale: 1.5 });
  const scale = Math.min(1.5, 3000 / Math.max(initial.width / 1.5, initial.height / 1.5));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toBuffer('image/png');
}
async function recognize(file, language, config, signal) {
  if (!['eng','chi_sim','eng+chi_sim','chi_sim+eng'].includes(language)) throw new Error('Bundled OCR languages: eng, chi_sim, eng+chi_sim.');
  const { stdout } = await execute(process.execPath, [fileURLToPath(new URL('./ocr-worker.js', import.meta.url)), file, language, path.join(config.dataDir, 'ocr-data')], {
    windowsHide: true, timeout: config.timeoutMs * 2, maxBuffer: 4_000_000, signal,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  return JSON.parse(stdout);
}

export async function pdfRead(files, args, config, signal) {
  const file = await files.read(args.file);
  const doc = await pdf(file);
  try {
    const start = bounded(args.page_start, 1, 1, doc.numPages, 'page_start');
    const count = bounded(args.page_count, 5, 1, 20, 'page_count');
    const offset = bounded(args.char_offset, 0, 0, 10_000_000, 'char_offset');
    const end = Math.min(doc.numPages, start + count - 1);
    const empty = []; const texts = [];
    for (let n = start; n <= end; n++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = content.items.map(item => item.str === undefined ? '' : item.str + (item.hasEOL ? '\n' : ' ')).join('');
      if (!text.trim() && args.ocr) {
        const image = files.output(`ocr-page-${n}.png`);
        await writeFile(image, await renderPage(doc, n));
        try { text = (await recognize(image, args.language || config.ocrLanguage, config, signal)).text; }
        finally { await unlink(image).catch(() => {}); }
      }
      if (!text.trim()) empty.push(n);
      texts.push(`[page ${n}]\n${text}`);
    }
    const full = texts.join('\n\n');
    return { path: file, total_pages: doc.numPages, page_start: start, page_end: end,
      next_page: end < doc.numPages ? end + 1 : null, char_offset: offset,
      next_char_offset: offset + config.maxTextChars < full.length ? offset + config.maxTextChars : null,
      text: full.slice(offset, offset + config.maxTextChars), pages_without_text: empty,
      note: empty.length ? 'Some pages have no extractable text. Try ocr:true or pdf_render. OCR and PDF reading order may contain errors; verify equations/tables against the rendered page.' : 'Extracted text may reorder columns and lose equation/table layout. Verify technical details against pdf_render.' };
  } finally { await doc.destroy(); }
}
export async function pdfRender(files, args) {
  const doc = await pdf(await files.read(args.file));
  try {
    const page = bounded(args.page, 1, 1, doc.numPages, 'page');
    const target = files.output(`page-${page}.png`);
    await writeFile(target, await renderPage(doc, page));
    return { path: target, page, total_pages: doc.numPages };
  } finally { await doc.destroy(); }
}
export async function imageRead(files, args, config, signal) {
  const { loadImage } = await import('@napi-rs/canvas');
  const file = await files.read(args.file);
  const image = await loadImage(file);
  if (image.width * image.height > 25_000_000) throw new Error('Image exceeds 25 megapixels. Resize it first.');
  let text = ''; let confidence = null;
  if (args.ocr !== false) {
    const data = await recognize(file, args.language || config.ocrLanguage, config, signal); text = data.text; confidence = data.confidence;
  }
  return { path: file, width: image.width, height: image.height, text: text.slice(0, config.maxTextChars),
    truncated: text.length > config.maxTextChars, confidence,
    note: 'OCR reads text only; it does not describe objects, diagrams or scenes. A vision-capable model/provider is needed for semantic image understanding.' };
}
export async function videoInspect(files, args, config, signal) {
  const file = await files.read(args.file);
  const result = await execute(config.ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', file],
    { windowsHide: true, timeout: config.timeoutMs, maxBuffer: 2_000_000, signal });
  const data = JSON.parse(result.stdout);
  return { path: file, format: data.format, streams: data.streams, note: 'Metadata only. Use video_frame to extract a picture. No audio transcription or automatic video understanding is included.' };
}
export async function videoFrame(files, args, config, signal) {
  const file = await files.read(args.file);
  if (typeof args.seconds !== 'number' || !Number.isFinite(args.seconds) || args.seconds < 0 || args.seconds > 86400) throw new Error('seconds must be a finite number in 0..86400.');
  const target = files.output('video-frame.png');
  await execute(config.ffmpegPath, ['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','file,pipe','-ss',String(args.seconds),'-i',file,'-frames:v','1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease',target],
    { windowsHide: true, timeout: config.timeoutMs, maxBuffer: 1_000_000, signal });
  await files.read(target);
  return { path: target, seconds: args.seconds, note: 'One sampled frame, not a description of the whole video. Use image_read for OCR or a vision provider for scene understanding.' };
}
