import path from 'node:path';
import { createHash } from 'node:crypto';
import { Files } from './files.js';
import { Browser } from './browser.js';

/** One browser per DSH Session, shared by native tools and the sidebar. */
export class Workbench {
  constructor(config) {
    this.config = config; this.sessions = new Map(); this.initializing = new Map(); this.disposed = false;
  }
  async state(key = 'standalone') {
    if (this.disposed) throw new Error('Plugin has been unloaded.');
    if (typeof key !== 'string' || !key.length || key.length > 256) throw new Error('Invalid Session.');
    if (!this.sessions.has(key) && !this.initializing.has(key)) {
      if (this.sessions.size + this.initializing.size >= 32) throw new Error('32 browser sessions are active. Reload the plugin to release sessions.');
      this.initializing.set(key, (async () => {
        const id = createHash('sha256').update(key).digest('hex').slice(0, 24);
        const files = new Files(path.join(this.config.dataDir, id, 'files'), this.config.maxFileBytes);
        await files.init();
        const session = { files, browser: new Browser(files, this.config), tail: Promise.resolve(), owner: 'ai', busy: false, epoch: 0, controlRevision: 0 };
        this.sessions.set(key, session); return session;
      })());
    }
    if (this.initializing.has(key)) { try { await this.initializing.get(key); } finally { this.initializing.delete(key); } }
    return this.sessions.get(key);
  }
  enqueue(session, run) {
    const task = session.tail.catch(() => {}).then(async () => {
      if (this.disposed) throw new Error('Plugin has been unloaded.');
      session.busy = true;
      try { return await run(); } finally { session.busy = false; }
    });
    session.tail = task; return task;
  }
  async ai(key, browserAccess, run, signal) {
    const session = await this.state(key);
    return this.enqueue(session, async () => {
      signal?.throwIfAborted();
      if (browserAccess && session.owner === 'human') throw new Error('HUMAN_CONTROL: The human has taken over this browser in the DSH sidebar. Wait for the human to return control; do not resume or bypass it.');
      const wasRunning = !!session.browser.context;
      const abort = () => { void session.browser.close().catch(() => {}); };
      signal?.addEventListener('abort', abort, { once: true });
      try { return await run(session); }
      finally {
        if (!wasRunning && session.browser.context) session.epoch++;
        signal?.removeEventListener('abort', abort);
      }
    });
  }
  async human(key, args) {
    const session = await this.state(key);
    // Set the gate immediately, including for AI calls already waiting in the queue.
    // A browser operation already in flight finishes before manual input is applied.
    if (args.action === 'takeover') { session.owner = 'human'; session.controlRevision++; return this.view(session); }
    if (args.action === 'release') {
      const revision = session.controlRevision;
      return this.enqueue(session, async () => {
        if (revision !== session.controlRevision) throw new Error('A newer takeover is active.');
        await session.browser.clearRefs(); session.owner = 'ai'; return this.view(session);
      });
    }
    if (session.owner !== 'human') throw new Error('Take over the browser before operating it.');
    return this.enqueue(session, async () => {
      if (session.owner !== 'human') throw new Error('Browser control has been returned to AI.');
      const wasRunning = !!session.browser.context;
      await session.browser.manual(args);
      if (!wasRunning && session.browser.context) session.epoch++;
      return this.view(session);
    });
  }
  view(session) {
    if (!session) return { running: false, owner: 'ai', busy: false, epoch: 0, tabs: [], downloads: [] };
    const browser = session.browser;
    return { running: !!browser.context, owner: session.owner, busy: session.busy, epoch: session.epoch,
      url: browser.page?.url() || '', viewport: { width: 1280, height: 900 },
      tabs: [...browser.tabs].filter(([, p]) => !p.isClosed()).map(([id, p]) => ({ id, url: p.url(), active: p === browser.page })),
      downloads: browser.downloadHistory.map(d => ({ ...d, name: d.path ? path.basename(d.path) : undefined })),
      upload_requested: !!browser.fileChooser,
    };
  }
  async frame(key) {
    const session = this.sessions.get(key);
    if (!session?.browser.context || !session.browser.page || session.browser.page.isClosed()) return null;
    // Frames do not refresh refs, navigate, or start a second browser.
    if (session.frame) return session.frame;
    session.frame = this.enqueue(session, () => session.browser.page.screenshot({ type: 'jpeg', quality: 65, timeout: 4000 }))
      .finally(() => { session.frame = null; });
    return session.frame;
  }
  async dispose() {
    this.disposed = true;
    await Promise.allSettled([...this.initializing.values()]);
    await Promise.allSettled([...this.sessions.values()].map(async session => {
      await session.browser.close(); await session.tail.catch(() => {});
    }));
    this.sessions.clear();
  }
}
