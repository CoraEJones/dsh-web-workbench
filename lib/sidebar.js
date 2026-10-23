import path from 'node:path';
import { open, readFile, unlink } from 'node:fs/promises';

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200) => Response.json(value, { status, headers });
export const apiPath = name => `/api/workbench.${name}`;

/** These exact routes inherit DSH's owner authentication and Host/Origin fence. */
export function registerSidebar(ctx, workbench, config) {
  for (const name of ['state', 'frame', 'control', 'upload', 'download', 'client']) {
    ctx.connection.fetch.register({ path: apiPath(name), methods: [name === 'state' || name === 'frame' || name === 'download' ? 'GET' : 'POST'],
      requestBody: name === 'upload' ? 'streaming' : 'buffered',
      fetch: request => sidebarRequest(workbench, config, name, request),
    });
  }
}

export async function sidebarRequest(workbench, config, name, request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('session');
    if (typeof key !== 'string' || !key.length || key.length > 256) return json({ error: 'Invalid Session.' }, 400);
    if (request.method === 'POST' && request.headers.get('x-workbench-ui') !== '1') return json({ error: 'Sidebar UI header required.' }, 403);
    if (name === 'state') return json({ ...workbench.view(workbench.sessions.get(key)), max_file_bytes: config.maxFileBytes });
    if (name === 'frame') {
      const frame = await workbench.frame(key);
      return frame ? new Response(frame, { headers: { ...headers, 'content-type': 'image/jpeg' } }) : new Response(null, { status: 204, headers });
    }
    if (name === 'control') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required.' }, 415);
      const text = await request.text();
      if (text.length > 110000) return json({ error: 'Request too large.' }, 413);
      const args = JSON.parse(text);
      if (!args || typeof args !== 'object' || Array.isArray(args)) return json({ error: 'Invalid action.' }, 400);
      return json(await workbench.human(key, args));
    }
    if (name === 'upload') {
      const session = await workbench.state(key);
      if (Number(request.headers.get('content-length')) > config.maxFileBytes) return json({ error: 'File exceeds size limit.' }, 413);
      const target = session.files.output(url.searchParams.get('name') || 'upload.bin');
      const file = await open(target, 'wx'); let size = 0;
      try {
        if (!request.body) throw new Error('Empty upload.');
        for await (const chunk of request.body) {
          request.signal.throwIfAborted(); size += chunk.length;
          if (size > config.maxFileBytes) throw new Error('File exceeds size limit.');
          await file.writeFile(chunk);
        }
        await file.close();
        return json({ file: path.basename(target), bytes: size });
      } catch (error) { await file.close().catch(() => {}); await unlink(target).catch(() => {}); throw error; }
    }
    if (name === 'download') {
      const session = workbench.sessions.get(key);
      const file = url.searchParams.get('file');
      if (!session || !file || path.basename(file) !== file) return json({ error: 'Unknown download.' }, 404);
      const target = await session.files.read(file);
      return new Response(await readFile(target), { headers: { ...headers, 'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}` } });
    }
    if (name === 'client') {
      // Optional diagnostics describe this plugin's own mounted view only.
      const report = await request.json();
      if (config.verifyOnLoad) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const directory = path.join(config.dataDir, 'diagnostics'); await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, 'live-client.json'), JSON.stringify({ version: '0.2.1', process_id: process.pid,
          at: new Date().toISOString(), mounted: report.mounted === true, frame_displayed: report.frame_displayed === true,
          width: Number(report.width) || 0, height: Number(report.height) || 0, error: String(report.error || '').slice(0, 500) }, null, 2));
      }
      return json({ ok: true });
    }
    return json({ error: 'Unknown route.' }, 404);
  } catch (error) { return json({ error: error.message }, /control|Take over/.test(error.message) ? 409 : 400); }
}
