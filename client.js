window.__ModuleLoader__.load({
  id: 'dsh-web-workbench',
  factory(require) {
    const React = require('react');
    const { createElement: h, useState, useEffect, useRef } = React;
    const ID = 'dsh-web-workbench';
    const kind = 'workbench-browser';
    const namespace = 'webWorkbench';
    const zh = {
      title: 'AI 浏览器', guide: '查看 AI 正在操作的浏览器，随时接管',
      open: '打开 AI 浏览器', ai: 'AI 可操作', human: '你在操作 · AI 已暂停', busy: '正在完成当前操作…',
      takeover: '接管浏览器', release: '交还给 AI', back: '后退', forward: '前进', reload: '刷新', go: '打开',
      address: '网页地址', newTab: '新建浏览器标签页', close: '关闭浏览器',
      start: '打开网页后，AI 和你将看到同一个浏览器。', help: '接管后可直接点击、滚动和输入；登录状态会保留。',
      watch: '正在观看 AI 操作。点击“接管浏览器”后即可操作网页。', waiting: '正在连接浏览器画面…',
      keyboard: '网页键盘输入', text: '中文或粘贴文本', insert: '输入到网页',
      choose: '选择文件', attach: '上传到当前网页', staged: '已准备文件：', uploading: '正在准备文件…',
      fileHelp: '文件将放入本会话，供 AI 使用。接管后也可上传到网页。', chooser: '网页正在等待文件，请点击“选择文件”。',
      downloads: '下载文件', emptyDownloads: '还没有下载文件', save: '另存到本机', retry: '重试连接',
      remote: '远程网页画面', unavailable: '连接失败，请重试。', oversize: '文件超出允许大小。',
    };
    const en = {
      title: 'AI Browser', guide: 'Watch the AI browser and take over at any time',
      open: 'Open AI Browser', ai: 'AI can operate', human: 'You are in control · AI paused', busy: 'Finishing the current operation…',
      takeover: 'Take over', release: 'Return to AI', back: 'Back', forward: 'Forward', reload: 'Reload', go: 'Open',
      address: 'Web address', newTab: 'New browser tab', close: 'Close browser',
      start: 'Open a page to share the same browser with AI.', help: 'Take over to click, scroll and type. Your sign-in is retained.',
      watch: 'Watching AI. Take over to operate the page.', waiting: 'Connecting to the browser view…',
      keyboard: 'Page keyboard input', text: 'Text to insert or paste', insert: 'Type into page',
      choose: 'Choose file', attach: 'Upload to page', staged: 'File ready: ', uploading: 'Preparing file…',
      fileHelp: 'Files are staged for AI in this Session. Take over to upload to the page.', chooser: 'The page is waiting for a file. Choose one below.',
      downloads: 'Downloads', emptyDownloads: 'No downloads yet', save: 'Save a copy', retry: 'Retry connection',
      remote: 'Remote browser view', unavailable: 'Connection failed. Try again.', oversize: 'The file exceeds the size limit.',
    };
    const css = `
      .ww{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit;font-size:13px}
      .ww *{box-sizing:border-box}.ww button,.ww input,.ww textarea{font:inherit;color:inherit;caret-color:var(--dsw-alias-label-primary)}
      .ww button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:6px;min-height:32px;padding:5px 9px;cursor:pointer;white-space:nowrap}
      .ww button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ww button:disabled{opacity:.5;cursor:default}
      .ww button:focus-visible,.ww input:focus-visible,.ww textarea:focus-visible,.ww summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
      .ww input,.ww textarea{min-width:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:6px;padding:6px 8px}
      .ww ::placeholder{color:var(--dsw-alias-label-secondary)}.ww ::selection{background:var(--dsw-alias-interactive-bg-hover)}
      .ww-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .ww-status{flex:1;min-width:100px;font-weight:600}.ww .ww-control{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
      .ww-nav{display:flex;gap:4px;width:100%;align-items:center}.ww-nav input{flex:1;width:0}.ww-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;padding:6px!important}
      .ww-tabs{display:flex;gap:4px;overflow:auto;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) var(--dsw-alias-bg-base)}
      .ww-tabs button{max-width:180px;overflow:hidden;text-overflow:ellipsis}.ww-tabs [aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary)}
      .ww-view{flex:1;min-height:160px;overflow:auto;position:relative;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) var(--dsw-alias-bg-base)}
      .ww-view img{display:block;width:100%;height:auto;user-select:none;touch-action:none}.ww-view[data-control=human] img{cursor:crosshair}
      .ww-empty{padding:32px 20px;line-height:1.6;color:var(--dsw-alias-label-secondary)}.ww-empty p{margin:0 0 10px}.ww-note{padding:6px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l2)}
      .ww-error{padding:8px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);overflow-wrap:anywhere}.ww-files{padding:8px;border-top:1px solid var(--dsw-alias-border-l2);flex:none}
      .ww-input-row{display:flex;gap:6px;margin-bottom:8px}.ww-input-row input{flex:1;width:0}.ww-file-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .ww-help{margin:6px 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.ww details{margin-top:8px}.ww summary{cursor:pointer}.ww-download{display:flex;gap:8px;align-items:center;margin-top:6px}.ww-download span{flex:1;min-width:0;overflow-wrap:anywhere}
      .ww-keyboard{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none}
    `;
    function endpoint(name, session, extra = {}) {
      return `/api/workbench.${name}?${new URLSearchParams({ session, ...extra })}`;
    }
    async function request(name, session, args, signal) {
      const response = await fetch(endpoint(name, session), { signal, cache: 'no-store',
        ...(args === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-workbench-ui': '1' }, body: JSON.stringify(args) }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
      return value;
    }
    function Icon({ name }) {
      const paths = { back: 'm14 5-7 7 7 7', forward: 'm10 5 7 7-7 7', reload: 'M20 10a8 8 0 1 0-1 7M20 4v6h-6', plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6' };
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }));
    }
    function Panel({ sessionId, useTabInfo, t }) {
      const { tab } = useTabInfo();
      const [state, setState] = useState({ running: false, owner: 'ai', tabs: [], downloads: [] });
      const [address, setAddress] = useState(''); const [error, setError] = useState(''); const [networkError, setNetworkError] = useState('');
      const [src, setSrc] = useState(''); const [text, setText] = useState('');
      const [file, setFile] = useState(null); const [uploading, setUploading] = useState(false);
      const [retry, setRetry] = useState(0); const keyboard = useRef(null); const image = useRef(null);
      const fileInput = useRef(null); const composing = useRef(false); const urls = useRef(new Set());
      const human = state.owner === 'human'; const humanRef = useRef(human); humanRef.current = human;
      const [working, setWorking] = useState(0);
      async function act(args) {
        setWorking(n => n + 1);
        try { const value = await request('control', sessionId, args); setState(value); setError(''); return value; }
        catch (e) { setError(e.message); throw e; }
        finally { setWorking(n => n - 1); }
      }
      const send = args => { void act(args).catch(() => {}); };
      useEffect(() => {
        const abort = new AbortController(); let timer;
        async function poll() {
          try {
            if (tab.visible && !document.hidden) {
              const value = await request('state', sessionId, undefined, abort.signal);
              if (abort.signal.aborted) return;
              setState(value);
              if (value.running) {
                const response = await fetch(endpoint('frame', sessionId), { signal: abort.signal, cache: 'no-store' });
                if (!response.ok) throw new Error(`Browser view: HTTP ${response.status}`);
                if (response.status !== 204) {
                  const blob = await response.blob();
                  if (!abort.signal.aborted) { const next = URL.createObjectURL(blob); urls.current.add(next); setSrc(next); }
                }
              } else setSrc('');
              setNetworkError('');
            }
          } catch (e) { if (!abort.signal.aborted) setNetworkError(e.message); }
          if (!abort.signal.aborted) timer = setTimeout(poll, 350);
        }
        void request('client', sessionId, { mounted: true }).catch(() => {});
        void poll();
        return () => { abort.abort(); clearTimeout(timer); for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
      }, [sessionId, tab.visible, retry]);
      useEffect(() => { if (state.url) setAddress(state.url); }, [state.url]);
      useEffect(() => {
        const target = image.current;
        if (!target) return;
        const wheel = e => {
          if (!humanRef.current) return;
          e.preventDefault(); e.stopPropagation();
          send({ action: 'scroll', dx: Math.max(-5000, Math.min(5000, Math.round(e.deltaX))), dy: Math.max(-5000, Math.min(5000, Math.round(e.deltaY))) });
        };
        target.addEventListener('wheel', wheel, { passive: false });
        return () => target.removeEventListener('wheel', wheel);
      }, [!!src, sessionId]);
      useEffect(() => tab.actions.bindCommands({ refresh: () => send({ action: 'reload' }) }), [tab.actions, sessionId]);
      function click(event) {
        if (!human) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        send({ action: 'click', x: (event.clientX - bounds.left) * 1280 / bounds.width, y: (event.clientY - bounds.top) * 900 / bounds.height, double: event.detail === 2 });
        keyboard.current?.focus({ preventScroll: true });
      }
      function keydown(event) {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.key === 'Process') return;
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
        if (['Control', 'Alt', 'Shift', 'Meta', 'Dead'].includes(event.key)) return;
        event.preventDefault();
        const key = `${event.ctrlKey ? 'Control+' : ''}${event.metaKey ? 'Meta+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key === ' ' ? 'Space' : event.key}`;
        send({ action: 'key', key });
      }
      async function stage(event) {
        const chosen = event.target.files?.[0]; event.target.value = ''; if (!chosen) return;
        setUploading(true);
        try {
          if (chosen.size > state.max_file_bytes) throw new Error(t('oversize'));
          const response = await fetch(endpoint('upload', sessionId, { name: chosen.name }), { method: 'POST', headers: { 'x-workbench-ui': '1' }, body: chosen });
          const value = await response.json(); if (!response.ok) throw new Error(value.error);
          setFile(value); setError('');
          if (humanRef.current && state.upload_requested) await act({ action: 'upload', file: value.file });
        } catch (e) { setError(e.message); } finally { setUploading(false); }
      }
      async function save(entry) {
        try {
          const response = await fetch(endpoint('download', sessionId, { file: entry.name }));
          if (!response.ok) throw new Error((await response.json()).error);
          const url = URL.createObjectURL(await response.blob());
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = entry.name; anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (e) { setError(e.message); }
      }
      const iconButton = (action, icon, label, disabled = !human || !state.running) => h('button', { type: 'button', title: t(label), 'aria-label': t(label), className: 'ww-icon', disabled, onClick: () => send({ action }) }, h(Icon, { name: icon }));
      return h('section', { className: 'ww', 'data-session': sessionId, 'aria-label': t('title') }, h('style', null, css),
        h('div', { className: 'ww-bar' },
          h('span', { className: 'ww-status', role: 'status' }, t(human ? 'human' : 'ai')),
          h('button', { type: 'button', className: 'ww-control', disabled: !!working, onClick: () => send({ action: human ? 'release' : 'takeover' }) }, t(human ? 'release' : 'takeover')),
          h('form', { className: 'ww-nav', onSubmit: e => { e.preventDefault(); send({ action: 'navigate', url: address.match(/^https?:\/\//i) ? address : `https://${address}` }); } },
            iconButton('back', 'back', 'back'), iconButton('forward', 'forward', 'forward'), iconButton('reload', 'reload', 'reload'),
            h('input', { value: address, onChange: e => setAddress(e.target.value), 'aria-label': t('address'), placeholder: 'https://', disabled: !human, autoComplete: 'off', spellCheck: false }),
            h('button', { type: 'submit', disabled: !human || !address || !!working }, t('go')))),
        state.tabs.length > 0 && h('div', { className: 'ww-tabs', 'aria-label': t('title') },
          ...state.tabs.map(entry => h('button', { key: entry.id, type: 'button', title: entry.url, 'aria-pressed': entry.active, disabled: !human, onClick: () => send({ action: 'switch_tab', tab_id: entry.id }) }, entry.url === 'about:blank' ? t('newTab') : entry.url.replace(/^https?:\/\//, ''))),
          iconButton('new_tab', 'plus', 'newTab', !human), iconButton('close', 'close', 'close')),
        h('div', { className: 'ww-note' }, working ? t('busy') : t(human ? 'help' : 'watch')),
        (error || networkError) && h('div', { className: 'ww-error', role: 'alert' }, error || networkError, ' ', h('button', { type: 'button', onClick: () => { setError(''); setRetry(n => n + 1); } }, t('retry'))),
        h('div', { className: 'ww-view', 'data-control': state.owner },
          src && state.running ? h('img', { ref: image, src, alt: t('remote'), draggable: false, onClick: click,
            onLoad: e => {
              for (const url of urls.current) if (url !== src) { URL.revokeObjectURL(url); urls.current.delete(url); }
              if (!image.current?.dataset.reported) {
                image.current.dataset.reported = 'true';
                void request('client', sessionId, { mounted: true, frame_displayed: true, width: e.target.naturalWidth, height: e.target.naturalHeight }).catch(() => {});
              }
            },
          }) : h('div', { className: 'ww-empty' }, h('p', null, t(state.running ? 'waiting' : 'start')), h('p', null, t('help'))),
          h('textarea', { ref: keyboard, className: 'ww-keyboard', tabIndex: -1, 'aria-label': t('keyboard'), disabled: !human,
            onKeyDown: keydown, onCompositionStart: () => { composing.current = true; },
            onCompositionEnd: e => { composing.current = false; if (e.target.value) send({ action: 'text', text: e.target.value }); e.target.value = ''; },
            onChange: e => { if (!composing.current && e.target.value) { send({ action: 'text', text: e.target.value }); e.target.value = ''; } },
            onPaste: e => { e.preventDefault(); e.stopPropagation(); send({ action: 'text', text: e.clipboardData.getData('text/plain') }); },
          })),
        h('div', { className: 'ww-files' },
          human && h('form', { className: 'ww-input-row', onSubmit: e => { e.preventDefault(); if (text) { send({ action: 'text', text }); setText(''); } } },
            h('input', { value: text, onChange: e => setText(e.target.value), placeholder: t('text'), 'aria-label': t('text') }),
            h('button', { type: 'submit', disabled: !text || !state.running }, t('insert'))),
          state.upload_requested && h('p', { className: 'ww-help', role: 'status' }, t('chooser')),
          h('div', { className: 'ww-file-row' },
            h('button', { type: 'button', disabled: uploading, title: t('fileHelp'), onClick: () => fileInput.current.click() }, t(uploading ? 'uploading' : 'choose')),
            h('input', { ref: fileInput, type: 'file', hidden: true, onChange: stage }),
            file && h('button', { type: 'button', disabled: !human || !state.running || !!working, onClick: () => send({ action: 'upload', file: file.file }) }, t('attach'))),
          file && h('p', { className: 'ww-help', role: 'status' }, t('staged'), file.file),
          h('details', null, h('summary', null, `${t('downloads')} (${state.downloads?.length || 0})`),
            state.downloads?.length ? state.downloads.map((entry, i) => h('div', { className: 'ww-download', key: entry.name || i }, h('span', null, entry.name || entry.error), entry.name && h('button', { type: 'button', onClick: () => { void save(entry); } }, t('save')))) : h('p', { className: 'ww-help' }, t('emptyDownloads')))));
    }
    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        const t = ctx.locale.bind(namespace);
        ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'web-workbench.copy');
        ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind, title: () => t('title'), keepMounted: true,
          guide: [{ id: 'open', title: () => t('title'), description: () => t('guide'), order: 20 }],
        }), 'web-workbench.tab');
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: namespace }, Panel));
        function Watcher({ sessionId }) {
          const epoch = useRef(0);
          useEffect(() => {
            const abort = new AbortController(); let timer;
            async function poll() {
              try {
                if (!document.hidden) {
                  const state = await request('state', sessionId, undefined, abort.signal);
                  if (!abort.signal.aborted && state.running && state.epoch > epoch.current) {
                    epoch.current = state.epoch; ctx.sidebarRight.openTab(kind);
                  }
                }
              } catch { /* A reconnect retries without interrupting the conversation. */ }
              if (!abort.signal.aborted) timer = setTimeout(poll, 1500);
            }
            void poll(); return () => { abort.abort(); clearTimeout(timer); };
          }, [sessionId]);
          return h('button', { type: 'button', title: t('guide'), onClick: () => ctx.sidebarRight.openTab(kind),
            style: { font: 'inherit', color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' },
          }, t('open'));
        }
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: ID, order: 20 }, Watcher));
      },
    };
  },
});
