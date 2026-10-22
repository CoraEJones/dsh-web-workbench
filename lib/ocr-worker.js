// Kept in a short-lived process so cancellation kills OCR and its worker threads.
import { mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import eng from '@tesseract.js-data/eng';
import chi from '@tesseract.js-data/chi_sim';
import { createWorker } from 'tesseract.js';

const languages = { eng, chi_sim: chi };
let worker;
try {
  const [file, language = 'eng+chi_sim', localData] = process.argv.slice(2);
  const codes = language.split('+');
  if (!codes.length || codes.some(c => !languages[c])) throw new Error('Bundled OCR languages: eng, chi_sim, eng+chi_sim.');
  await mkdir(localData, { recursive: true });
  for (const code of codes) {
    const source = path.join(languages[code].langPath, `${code}.traineddata.gz`);
    const target = path.join(localData, `${code}.traineddata.gz`);
    if ((await stat(target).catch(() => null))?.size !== (await stat(source)).size) await copyFile(source, target);
  }
  worker = await createWorker(language, 1, { langPath: localData, cacheMethod: 'none', logger: () => {}, errorHandler: error => { console.error(String(error).slice(0,2000)); process.exit(1); } });
  const result = await worker.recognize(file);
  process.stdout.write(JSON.stringify({ text: result.data.text, confidence: result.data.confidence }));
  await worker.terminate();
} catch (error) {
  await worker?.terminate(); console.error(error.message); process.exitCode = 1;
}
