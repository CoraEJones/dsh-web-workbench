import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Config } from '../index.js';
import { Workbench } from '../lib/workbench.js';
import { sidebarRequest } from '../lib/sidebar.js';

const require=createRequire(import.meta.url);
const script=await readFile(new URL('../client.js',import.meta.url));
const reactRoot=process.env.WORKBENCH_REACT_FIXTURES;
const react=await readFile(path.join(reactRoot?path.join(reactRoot,'react'):path.dirname(require.resolve('react/package.json')),'umd/react.production.min.js'));
const reactDOM=await readFile(path.join(reactRoot?path.join(reactRoot,'react-dom'):path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.production.min.js'));

test('real React sidebar forwards native drag, caret, interrupted pointers and resize recovery', {timeout:60000},async t=>{
  await mkdir('.test-data',{recursive:true});
  const data=await mkdtemp(path.resolve('.test-data/client-'));
  const config=Config.parse({dataDir:data,timeoutMs:5000});const workbench=new Workbench(config);
  const assets={'/react.js':react,'/react-dom.js':reactDOM,'/client.js':script};
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(assets[url.pathname]){res.writeHead(200,{'content-type':'text/javascript'});res.end(assets[url.pathname]);return;}
      if(url.pathname.startsWith('/api/workbench.')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const request=new Request(url.href,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
        const response=await sidebarRequest(workbench,config,url.pathname.slice('/api/workbench.'.length),request);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(url.pathname==='/site'){
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
        res.end('<style>body{background:white;color:black;font:22px Arial}input,button{font:22px Arial}#text{position:absolute;left:40px;top:40px;width:400px;padding:8px}#range{position:absolute;left:40px;top:120px;width:400px}button{position:absolute;left:500px;top:40px;cursor:pointer}</style><input id=text aria-label=Text><input id=range type=range value=10><button onclick="window.clicks=(window.clicks||0)+1">Count</button>');return;
      }
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(`<!doctype html><style>:root{--dsw-alias-label-primary:#182133;--dsw-alias-label-secondary:#515d70;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f4f6f9;--dsw-alias-bg-layer-2:#e9edf2;--dsw-alias-border-l2:#b9c2ce;--dsw-alias-state-business-primary:#225dc5;--dsw-alias-interactive-bg-hover:#e2e9f4}body{margin:0;font:14px Arial}#root{width:100%;max-width:640px;height:100vh}[data-dockkit-pointer] .ww-view{pointer-events:none}</style><div id=root></div><script src=/react.js></script><script src=/react-dom.js></script><script>
      window.__ModuleLoader__={load(def){window.plugin=def.factory(name=>{if(name==='react')return React;throw Error(name);});}};
      </script><script src=/client.js></script><script>
      const copies={};window.disposers=[];
      const ctx={effect(fn){const dispose=fn();if(typeof dispose==='function')disposers.push(dispose);},locale:{bind:ns=>key=>copies[ns]?.zh?.[key]||key,register(ns,v){copies[ns]=v;return()=>{};}},sidebarRightTabs:{register:()=>()=>{}},sidebarRight:{openTab(){}},slots:{inject(_name,fn){fn();},register(spec,component){if(spec.name==='sidebar.right.pane.tab')window.Panel=component;return()=>{};}}};
      plugin.apply(ctx);const tab={visible:true,actions:{bindCommands:()=>()=>{}}};
      ReactDOM.createRoot(document.querySelector('#root')).render(React.createElement(Panel,{sessionId:'client',useTabInfo:()=>({tab}),t:ctx.locale.bind('webWorkbench')}));
      </script>`);
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const viewer=await chromium.launch({channel:'msedge',headless:true});
  t.after(async()=>{await viewer.close();await workbench.dispose();await new Promise(r=>server.close(r));});
  await workbench.ai('client',true,async session=>session.browser.open(base+'/site'));
  const remote=workbench.sessions.get('client').browser;
  const page=await viewer.newPage({viewport:{width:800,height:850}});
  page.setDefaultTimeout(10000);page.on('pageerror',error=>console.error('Client fixture:',error.message));
  await page.goto(base);await page.locator('.ww img').waitFor();
  await page.getByRole('button',{name:'接管浏览器',exact:true}).click();
  await page.getByText('你在操作 · AI 已暂停',{exact:true}).waitFor();
  const coords=async(x,y)=>{const b=await page.locator('.ww img').boundingBox();return{x:b.x+x*b.width/1280,y:b.y+y*b.height/900};};
  let p=await coords(100,60);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);
  await page.keyboard.type('Caret position');
  await remote.page.waitForFunction(()=>document.querySelector('#text').value==='Caret position');
  await page.locator('.ww-caret').waitFor();
  const before=await page.locator('.ww-caret').boundingBox();await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(x=>document.querySelector('.ww-caret').getBoundingClientRect().x<x,before.x);
  assert.equal(await page.locator('.ww img').evaluate(e=>getComputedStyle(e).cursor),'text');
  const previousFrame=await page.locator('.ww img').getAttribute('src');
  await page.waitForFunction(previous=>document.querySelector('.ww img').src!==previous,previousFrame);
  await page.screenshot({path:path.join(data,'sidebar-wide.png')});
  p=await coords(90,130);const end=await coords(420,130);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:18});await page.mouse.up();
  await remote.page.waitForFunction(()=>Number(document.querySelector('#range').value)>85);
  // Blur while a real button is pressed: release without accidentally clicking it.
  p=await coords(530,55);await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.waitForFunction(()=>document.querySelector('.ww img').hasPointerCapture(1));
  await page.evaluate(()=>dispatchEvent(new Event('blur')));await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('.ww img').hasPointerCapture(1));
  assert.equal(await remote.page.evaluate(()=>window.clicks||0),0);
  await page.mouse.click(p.x,p.y);await remote.page.waitForFunction(()=>window.clicks===1);
  // Stale host resize marker recovers on the next mouse move, without reload.
  await page.evaluate(()=>document.querySelector('#root').setAttribute('data-dockkit-pointer','99'));
  await page.mouse.move(p.x+15,p.y+15);
  await page.waitForFunction(()=>!document.querySelector('[data-dockkit-pointer]'));
  await page.mouse.click(p.x,p.y);await remote.page.waitForFunction(()=>window.clicks===2);
  await page.setViewportSize({width:420,height:850});
  p=await coords(90,60);await page.mouse.click(p.x,p.y);await page.locator('.ww-caret').waitFor();
  await page.screenshot({path:path.join(data,'sidebar-narrow.png')});
  const caret=await page.locator('.ww-caret').boundingBox(), image=await page.locator('.ww img').boundingBox();
  assert.ok(caret.x>=image.x&&caret.x<image.x+image.width);
  await page.getByRole('button',{name:'交还给 AI',exact:true}).click();await page.getByText('AI 可操作',{exact:true}).waitFor();
  assert.equal(remote.pointer,null);
});
