import { mkdir, realpath, stat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function httpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP(S) URLs without embedded credentials are supported.');
  }
  return url.href;
}

export function bounded(value, fallback, min, max, name) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in ${min}..${max}.`);
  return n;
}

export class Files {
  constructor(root, maxBytes) { this.root = path.resolve(root); this.maxBytes = maxBytes; }
  async init() { await mkdir(this.root, { recursive: true }); this.root = await realpath(this.root); }
  async read(file) {
    const resolved = await realpath(path.resolve(this.root, file));
    const relative = path.relative(this.root, resolved);
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('File must be inside this session\'s workbench directory. Copy the file there first.');
    }
    const info = await stat(resolved);
    if (!info.isFile() || info.size > this.maxBytes) throw new Error('File is not a regular file or exceeds the configured size limit.');
    return resolved;
  }
  output(name = 'file.bin') {
    const safe = path.basename(name.replaceAll('\\', '/')).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-100) || 'file.bin';
    return path.join(this.root, `${randomUUID().slice(0, 12)}-${safe}`);
  }
}

/** Stream to an exclusive, randomly named file; never return a partial artifact. */
export async function downloadFile(files, url, { signal, cookies, referer, maxRedirects = 8 } = {}) {
  let current = httpUrl(url);
  for (let n = 0; n <= maxRedirects; n++) {
    signal?.throwIfAborted();
    const headers = {};
    if (cookies) {
      const matching = await cookies(current);
      if (matching.length) headers.cookie = matching.map(c => `${c.name}=${c.value}`).join('; ');
    }
    if (referer && new URL(referer).origin === new URL(current).origin) headers.referer = referer;
    const response = await fetch(current, { redirect: 'manual', signal, headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect has no Location header.');
      current = httpUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}. This site may require sign-in, permission or manual verification.`); }
    if (Number(response.headers.get('content-length')) > files.maxBytes) {
      await response.body?.cancel(); throw new Error('Download exceeds size limit.');
    }
    const contentType = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const extension = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'video/mp4': '.mp4' }[contentType] || '.bin';
    let name = decodeURIComponent(new URL(current).pathname.split('/').pop() || 'download');
    if (!path.extname(name)) name += extension;
    const output = files.output(name);
    const file = await open(output, 'wx');
    let bytes = 0;
    try {
      if (!response.body) throw new Error('Empty response body.');
      for await (const chunk of response.body) {
        signal?.throwIfAborted(); bytes += chunk.length;
        if (bytes > files.maxBytes) throw new Error('Download exceeds size limit.');
        await file.writeFile(chunk);
      }
      await file.close();
      return { path: output, bytes, content_type: contentType, url: current,
        warning: contentType.includes('html') ? 'Downloaded HTML. This may be a login or access-denied page, not the requested document.' : '' };
    } catch (error) {
      await file.close().catch(() => {}); await unlink(output).catch(() => {}); throw error;
    }
  }
  throw new Error('Too many redirects.');
}
