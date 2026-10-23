import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Config } from '../index.js';
import { Workbench } from '../lib/workbench.js';

const source=await readFile(new URL('../client.js',import.meta.url),'utf8');
let client;
vm.runInNewContext(source,{window:{__ModuleLoader__:{load(definition){client=definition.factory(()=>({}));}}}});

async function setup(t) {
  await mkdir('.test-data',{recursive:true});
  const workbench=new Workbench(Config.parse({dataDir:await mkdtemp(path.resolve('.test-data/pointer-')),timeoutMs:5000}));
  t.after(()=>workbench.dispose());
  const session=await workbench.state('pointer');await session.browser.start();
  await workbench.human('pointer',{action:'takeover'});
  return {workbench,browser:session.browser,page:session.browser.page,send:args=>workbench.human('pointer',args)};
}

test('real mouse down/move/up drags a range and a sortable control; cancellation and lease recover',async t=>{
  const {browser,page,send}=await setup(t);
  await page.setContent(`<input id=range type=range min=0 max=100 value=10 style="position:absolute;left:50px;top:50px;width:400px"><div id=sort style="position:absolute;left:50px;top:150px;width:100px;height:50px;background:orange">Drag</div><p id=result></p><script>
  window.events=[];addEventListener('pointermove',e=>events.push(e.buttons));
  let dragging=false;sort.onpointerdown=()=>dragging=true;addEventListener('pointermove',e=>{if(dragging)sort.style.left=e.clientX+'px'});addEventListener('pointerup',()=>dragging=false);
  </script>`);
  const pointer=(phase,id,x=100,y=60)=>send({action:'pointer',phase,pointer_id:id,x,y});
  await pointer('down','range',100,60);await pointer('move','range',300,60);await pointer('move','range',420,60);await pointer('up','range',420,60);
  assert.ok(Number(await page.locator('#range').inputValue())>85);
  await pointer('down','sort',80,170);await pointer('move','sort',180,170);await pointer('move','sort',300,170);await pointer('up','sort',300,170);
  assert.equal(await page.locator('#sort').evaluate(e=>e.style.left),'300px');
  await page.evaluate(()=>{
    const source=document.createElement('div');source.id='native';source.draggable=true;source.textContent='Native';source.style='position:absolute;left:40px;top:260px;width:100px;height:40px;background:blue';
    const drop=document.createElement('div');drop.id='drop';drop.style='position:absolute;left:500px;top:260px;width:150px;height:80px;background:gray';drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();drop.textContent='Dropped';};
    document.body.append(source,drop);
  });
  await pointer('down','native',80,280);await pointer('move','native',120,280);await pointer('move','native',550,280);await pointer('up','native',550,280);
  assert.equal(await page.locator('#drop').innerText(),'Dropped');
  await pointer('down','lost',320,170);await pointer('cancel','lost');assert.equal(browser.pointer,null);
  await pointer('down','new',320,170);await pointer('up','lost',330,170);assert.equal(browser.pointer.id,'new');
  await send({action:'release'});assert.equal(browser.pointer,null);
  await send({action:'takeover'});browser.pointerIdleMs=80;await pointer('down','timeout');
  await new Promise(r=>setTimeout(r,200));assert.equal(browser.pointer,null);
  await pointer('down','next');await pointer('up','next');assert.equal(browser.pointer,null);
  assert.ok((await page.evaluate(()=>events)).includes(1));
  await assert.rejects(pointer('down','invalid',NaN,60),/Invalid pointer/);
  await browser.close();await pointer('cancel','late');assert.equal(browser.context,null);
});

test('hover cursor and caret geometry follow typing, arrows, multiline text and iframe focus without exposing values',async t=>{
  const {browser,page,send}=await setup(t);
  await page.setContent('<input id=text style="position:absolute;left:40px;top:40px;width:400px;font:20px Arial;padding:8px"><button style="position:absolute;left:600px;top:40px;cursor:pointer">Go</button><textarea style="position:absolute;left:40px;top:140px;width:400px;height:120px;font:20px Arial;line-height:26px;padding:8px"></textarea><iframe style="position:absolute;left:30px;top:350px" srcdoc="<input aria-label=inside style=font-size:20px>"></iframe>');
  await send({action:'pointer',phase:'hover',x:610,y:50});assert.equal(browser.interaction.cursor,'pointer');
  await send({action:'click',x:80,y:60});await send({action:'text',text:'Private text'});
  const first=browser.interaction.caret;assert.ok(first&&first.x>80&&first.height>15);
  assert.ok(!JSON.stringify(browser.interaction).includes('Private'));
  await send({action:'key',key:'ArrowLeft'});assert.ok(browser.interaction.caret.x<first.x);
  await send({action:'click',x:80,y:170});await send({action:'text',text:'第一行\nsecond line'});
  assert.ok(browser.interaction.caret.y>175);
  await page.frames()[1].getByLabel('inside').fill('Frame');await browser.updateInteraction();
  assert.ok(browser.interaction.caret.x>30&&browser.interaction.caret.y>350);
});

test('client bridge coalesces slow moves but preserves ordered down/up and recovers from failed transport',async()=>{
  const sent=[];let release;
  const bridge=client.createPointerBridge(async packet=>{sent.push({...packet});if(sent.length===1)await new Promise(r=>release=r);});
  bridge.push({action:'pointer',phase:'down',pointer_id:'one',x:0});
  for(let x=1;x<=100;x++)bridge.push({action:'pointer',phase:'move',pointer_id:'one',x});
  bridge.push({action:'pointer',phase:'up',pointer_id:'one',x:100});release();await bridge.idle();
  assert.deepEqual(sent.map(p=>p.phase),['down','move','up']);assert.equal(sent[1].x,100);
  const recovery=[];
  const broken=client.createPointerBridge(async p=>{recovery.push(p.phase);if(p.phase==='move')throw Error('offline');});
  broken.push({action:'pointer',phase:'down',pointer_id:'one'});broken.push({action:'pointer',phase:'move',pointer_id:'one'});broken.push({action:'pointer',phase:'up',pointer_id:'one'});
  await broken.idle();assert.deepEqual(recovery,['down','move','cancel']);
});

test('dock recovery clears host state on blur, missing-up movement, cancellation and lost capture; next click works',async t=>{
  const {page}=await setup(t);
  await page.setContent('<style>[data-dockkit-pointer] #surface{pointer-events:none}</style><div id=dock><button id=surface onclick="this.textContent=\'clicked\'">Click</button></div>');
  await page.evaluate(()=>{window.__ModuleLoader__={load(definition){window.client=definition.factory(()=>({}));}};});
  await page.addScriptTag({content:source});
  const result=await page.evaluate(async()=>{
    const dispose=client.installDockPointerGuard(window,document), dock=document.querySelector('#dock'), cancelled=[];
    addEventListener('pointercancel',e=>cancelled.push(e.pointerId));
    const arm=()=>dock.setAttribute('data-dockkit-pointer','9');
    const clean=()=>!dock.hasAttribute('data-dockkit-pointer');const checks=[];
    arm();dispatchEvent(new Event('blur'));checks.push(clean());
    arm();dispatchEvent(new PointerEvent('pointermove',{buttons:0,pointerType:'mouse'}));checks.push(clean());
    arm();dispatchEvent(new PointerEvent('pointerup',{pointerId:8}));checks.push(!clean());
    dispatchEvent(new PointerEvent('pointercancel',{pointerId:9}));await Promise.resolve();checks.push(clean());
    arm();dock.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:9}));await Promise.resolve();checks.push(clean());
    // A normal host up commits before the guard runs, with no spurious cancel.
    let committed=false;const count=cancelled.length;
    addEventListener('pointerup',()=>{committed=true;dock.removeAttribute('data-dockkit-pointer');},{once:true});
    arm();dispatchEvent(new PointerEvent('pointerup',{pointerId:9}));await Promise.resolve();checks.push(committed&&cancelled.length===count);
    arm();dispose();checks.push(clean());
    return {checks,cancelled};
  });
  assert.ok(result.checks.every(Boolean));assert.ok(result.cancelled.every(id=>id===9));
  await page.locator('#surface').click();assert.equal(await page.locator('#surface').innerText(),'clicked');
});
