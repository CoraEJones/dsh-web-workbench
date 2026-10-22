import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { Config, makeTools } from '../index.js';
import { Workbench } from '../lib/workbench.js';
import { sidebarRequest, apiPath } from '../lib/sidebar.js';

test('sidebar shares AI browser, gates AI on takeover, stages/uploads/downloads and restores login', { timeout: 60000 }, async () => {
  await mkdir('.test-data', {recursive:true});
  const config=Config.parse({dataDir:await mkdtemp(path.resolve('.test-data/shared-')),timeoutMs:10000});
  const workbench=new Workbench(config);const tools=makeTools(config,()=>{},workbench);
  const call=(name,args={})=>tools.find(t=>t.name===name).execute(args,{agent:{session:{id:'shared'}}});
  const server=http.createServer((req,res)=>{
    if(req.url==='/file'){res.writeHead(200,{'content-disposition':'attachment; filename=shared.txt'});res.end('SHARED DOWNLOAD');return;}
    res.writeHead(200,{'content-type':'text/html','set-cookie':'session=kept; Path=/; Max-Age=3600'});
    res.end('<title>Shared</title><input aria-label="Name" style="position:absolute;left:20px;top:20px"><input type=file onchange="document.querySelector(\'p\').textContent=this.files[0].name"><p></p><a href=/file>Download</a>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const req=(name,body,extra={},ui=true)=>sidebarRequest(workbench,config,name,new Request(`http://localhost${apiPath(name)}?${new URLSearchParams({session:'shared',...extra})}`,
    body===undefined?{}:{method:'POST',headers:{'content-type':'application/json',...(ui?{'x-workbench-ui':'1'}:{})},body:JSON.stringify(body)}));
  try {
    let page=await call('web_browser_open',{url});const browser=workbench.sessions.get('shared').browser;const context=browser.context;
    page=await call('web_browser_action',{action:'fill',ref:page.elements.find(e=>e.label==='Name').ref,text:'AI input'});
    const frame=await req('frame');assert.equal(frame.headers.get('content-type'),'image/jpeg');assert.ok((await frame.arrayBuffer()).byteLength>1000);
    await req('control',{action:'takeover'});await assert.rejects(call('web_browser_snapshot'),/HUMAN_CONTROL/);
    await req('control',{action:'click',x:70,y:28});await req('control',{action:'key',key:'Control+A'});await req('control',{action:'text',text:'人类接管'});
    assert.equal(await browser.page.locator('input[aria-label=Name]').inputValue(),'人类接管');
    const response=await sidebarRequest(workbench,config,'upload',new Request(`http://localhost${apiPath('upload')}?session=shared&name=human.txt`,{method:'POST',headers:{'x-workbench-ui':'1'},body:'HUMAN UPLOAD'}));
    const upload=await response.json();assert.equal(response.status,200);
    await req('control',{action:'upload',file:upload.file});assert.match(await browser.page.locator('p').innerText(),/human.txt/);
    await req('control',{action:'release'});page=await call('web_browser_snapshot');assert.match(page.text,/human.txt/);assert.equal(browser.context,context);
    await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Download').ref});await call('web_browser_downloads');
    const state=await(await req('state')).json();assert.equal(state.downloads.length,1);
    assert.equal(await(await req('download',undefined,{file:state.downloads[0].name})).text(),'SHARED DOWNLOAD');
    assert.equal((await req('control',{action:'takeover'},{},false)).status,403);
    assert.equal((await req('download',undefined,{file:'../auth-state.json'})).status,404);
    await call('web_browser_close');await workbench.dispose();
    const restored=new Workbench(config);
    try {const session=await restored.state('shared');await session.browser.start();assert.ok((await session.browser.context.cookies(url)).some(c=>c.name==='session'&&c.value==='kept'));assert.equal((await readFile(path.join(session.files.root,upload.file))).toString(),'HUMAN UPLOAD');}
    finally{await restored.dispose();}
  } finally {await workbench.dispose();await new Promise(r=>server.close(r));}
});

test('takeover blocks already queued AI and oversized streamed uploads remove partial files', async()=>{
  await mkdir('.test-data',{recursive:true});
  const config=Config.parse({dataDir:await mkdtemp(path.resolve('.test-data/gate-')),maxFileBytes:1024});
  const workbench=new Workbench(config);
  try {
    const session=await workbench.state('gate');let release;
    const blocking=workbench.enqueue(session,()=>new Promise(r=>{release=r;}));await new Promise(r=>setImmediate(r));
    const queued=workbench.ai('gate',true,()=>assert.fail('AI must remain paused'));
    await workbench.human('gate',{action:'takeover'});release();await blocking;await assert.rejects(queued,/HUMAN_CONTROL/);
    const response=await sidebarRequest(workbench,config,'upload',new Request('http://localhost/api/workbench.upload?session=gate&name=big.bin',{method:'POST',headers:{'x-workbench-ui':'1'},body:Buffer.alloc(2048)}));
    assert.equal(response.status,400);assert.deepEqual(await readdir(session.files.root),[]);
  }finally{await workbench.dispose();}
});
