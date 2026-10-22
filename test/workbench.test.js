import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { makeTools, Config, apply } from '../index.js';
import { Files, downloadFile } from '../lib/files.js';

function makePdf() {
  const stream = 'BT /F1 20 Tf 60 750 Td (Harness PDF full text works.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let data = '%PDF-1.4\n'; const offsets = [0];
  for (let n=0; n<objects.length; n++) { offsets.push(Buffer.byteLength(data)); data += `${n+1} 0 obj\n${objects[n]}\nendobj\n`; }
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x => String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(data);
}
function scannedPdf(image) {
  const stream='q 595 0 0 130 0 600 cm /Scan Do Q';
  const objects=[
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1000 /Height 220 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')]),
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
  ];
  const chunks=[Buffer.from('%PDF-1.4\n')]; const offsets=[]; let size=chunks[0].length;
  for(let n=0;n<objects.length;n++) { offsets.push(size); const chunk=Buffer.concat([Buffer.from(`${n+1} 0 obj\n`),objects[n],Buffer.from('\nendobj\n')]); chunks.push(chunk); size+=chunk.length; }
  chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return Buffer.concat(chunks);
}

let root, base, server, dispose;
const pdf = makePdf();
let call;
before(async () => {
  await mkdir('.test-data', { recursive: true }); root = await mkdtemp(path.resolve('.test-data/run-'));
  server = http.createServer((req,res) => {
    if (req.url === '/pdf') { res.writeHead(200, {'Content-Type':'application/pdf'}); res.end(pdf); return; }
    if (req.url === '/private') { if (!req.headers.cookie?.includes('signed=yes')) { res.writeHead(403); res.end('login required'); return; } res.writeHead(200,{'Content-Type':'application/pdf'}); res.end(pdf); return; }
    if (req.url === '/big') { res.writeHead(200,{'Content-Type':'application/octet-stream'}); res.end(Buffer.alloc(4000)); return; }
    if (req.url === '/redirect') { res.writeHead(302,{Location:'/pdf'}); res.end(); return; }
    if (req.url === '/badredirect') { res.writeHead(302,{Location:'file:///C:/Windows/win.ini'}); res.end(); return; }
    if (req.url === '/slow') { res.writeHead(200); res.write('start'); const timer=setInterval(()=>res.write(Buffer.alloc(100)),100); res.on('close',()=>clearInterval(timer)); return; }
    if (req.url === '/login') { res.writeHead(200,{'Set-Cookie':'signed=yes; Path=/; Max-Age=3600','Content-Type':'text/html'}); res.end('<h1>Signed in</h1>'); return; }
    if (req.url === '/download') { res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename=paper.pdf'}); res.end(pdf); return; }
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(`<!doctype html><title>Workbench fixture</title><h1>Interactive test</h1><form action='/submitted'><label>Name<input name='name'></label><button type=submit>Submit</button></form><label>Upload<input type=file onchange="document.querySelector('#uploaded').textContent=this.files[0].name"></label><p id=uploaded></p><button onclick="document.body.dataset.confirmed=String(confirm('Are you sure?'))">Confirm</button><a href='/download'>Download paper</a><a target=_blank href='/other'>New tab</a><script>document.body.append(' JavaScript rendered.')</script>`);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); base = `http://127.0.0.1:${server.address().port}`;
  const tools = makeTools({dataDir:root,headless:true,browserChannel:'msedge',ocrLanguage:'eng',timeoutMs:10000}, c=>dispose=c);
  call = (name,args={},session='test') => tools.find(t=>t.name===name).execute(args,{agent:{session:{id:session}},signal:new AbortController().signal});
});
after(async () => { await dispose?.(); await new Promise(r=>server.close(r)); });

test('session directories isolate file access and keep browser profiles out of file area', async () => {
  const a=await call('web_workbench_status',{},'a'); const b=await call('web_workbench_status',{},'b');
  assert.notEqual(a.directory,b.directory);
  const foreign=path.join(b.directory,'foreign.txt'); await writeFile(foreign,'private');
  await assert.rejects(call('pdf_read',{file:foreign},'a'),/inside/);
  const outside=path.resolve(a.directory,'..','cookie.txt'); await writeFile(outside,'private');
  await assert.rejects(call('image_read',{file:outside,ocr:false},'a'),/inside/);
});
test('HTTP binary download, redirects, unauthorized response and HTML detection', async () => {
  const result=await call('web_download_file',{url:base+'/redirect'});
  assert.deepEqual(await readFile(result.path),pdf); assert.equal(result.content_type,'application/pdf');
  await assert.rejects(call('web_download_file',{url:base+'/private'}),/HTTP 403/);
  await assert.rejects(call('web_download_file',{url:base+'/badredirect'}),/HTTP\(S\)/);
  const html=await call('web_download_file',{url:base+'/'}); assert.match(html.warning,/HTML/);
});
test('streaming limit and cancellation remove partial downloads', async () => {
  const files=new Files(path.join(root,'limits'),1024); await files.init();
  await assert.rejects(downloadFile(files,base+'/big'),/size limit/); assert.deepEqual(await readdir(files.root),[]);
  await assert.rejects(downloadFile(files,base+'/slow',{signal:AbortSignal.timeout(160)})); assert.deepEqual(await readdir(files.root),[]);
});
test('PDF extraction, page validation, rendering and image dimensions', async () => {
  const d=await call('web_download_file',{url:base+'/pdf'});
  const text=await call('pdf_read',{file:d.path}); assert.match(text.text,/Harness PDF full text works/); assert.equal(text.total_pages,1);
  await assert.rejects(call('pdf_read',{file:d.path,page_start:0}),/page_start/);
  const image=await call('pdf_render',{file:d.path});
  const metadata=await call('image_read',{file:image.path,ocr:false}); assert.ok(metadata.width>500); assert.ok(metadata.height>800);
});
test('browser JavaScript, stale refs, fill and real form submission', async () => {
  let page=await call('web_browser_open',{url:base+'/'}); assert.match(page.text,/JavaScript rendered/); assert.equal(page.status,200);
  const input=page.elements.find(e=>e.tag==='input' && e.type==='text').ref;
  page=await call('web_browser_action',{action:'fill',ref:input,text:'Alice'});
  await assert.rejects(call('web_browser_action',{action:'fill',ref:input,text:'Bob'}),/Stale/);
  await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Submit').ref});
  page=await call('web_browser_snapshot'); assert.match(page.url,/submitted\?name=Alice/);
});
test('file upload, screenshot, browser download and confirmation dialog policy', async () => {
  let page=await call('web_browser_open',{url:base+'/'});
  const {directory}=await call('web_workbench_status'); const upload=path.join(directory,'upload.txt'); await writeFile(upload,'sample');
  page=await call('web_browser_action',{action:'upload',ref:page.elements.find(e=>e.type==='file').ref,file:upload}); assert.match(page.text,/upload.txt/);
  const screen=await call('web_browser_screenshot'); assert.equal((await readFile(screen.path)).subarray(1,4).toString(),'PNG');
  page=await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Confirm').ref}); assert.equal(page.dialogs[0].accepted,false);
  page=await call('web_browser_action',{action:'dialog',accept:true});
  page=await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Confirm').ref}); assert.equal(page.dialogs[0].accepted,true);
  page=await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Download paper').ref});
  const result=await call('web_browser_downloads'); const downloads=[...page.downloads,...result.downloads]; assert.equal(downloads.length,1); assert.deepEqual(await readFile(downloads[0].path),pdf);
});
test('persistent login, cookie-aware download and independent sessions', async () => {
  await call('web_browser_open',{url:base+'/login'}); await call('web_browser_close');
  const d=await call('web_download_file',{url:base+'/private',use_browser_session:true}); assert.deepEqual(await readFile(d.path),pdf);
  await assert.rejects(call('web_download_file',{url:base+'/private',use_browser_session:true},'other'),/403/);
});
test('new tabs can be selected', async () => {
  let page=await call('web_browser_open',{url:base+'/'});
  await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='New tab').ref});
  page=await call('web_browser_snapshot');
  const tab=page.tabs.find(t=>t.url.endsWith('/other')); assert.ok(tab);
  page=await call('web_browser_action',{action:'switch_tab',tab_id:tab.id}); assert.match(page.url,/other/);
});
test('invalid arguments fail before a browser action', async () => {
  await assert.rejects(call('web_browser_action',{action:'evaluate',text:'alert(1)'}),/Invalid action/);
  await assert.rejects(call('web_browser_open',{url:'file:///C:/Windows/win.ini'}),/HTTP\(S\)/);
  await assert.rejects(call('web_browser_action',{action:'scroll',amount:99999}),/amount/);
});
test('Host registration uses native JSON schemas and removable resources', () => {
  const registered=[]; const sections=[]; const listeners=[];
  apply({tools:{register:t=>registered.push(t),get:()=>true},systemPrompt:{section:s=>sections.push(s)},on:(name,fn)=>listeners.push([name,fn])},{dataDir:root});
  assert.equal(registered.length,13); assert.equal(listeners[0][0],'dispose'); assert.match(sections[0].text({}),/untrusted/);
  for (const tool of registered) { assert.equal(tool.parameters.additionalProperties,false); assert.equal(tool.output.render({},{} )[0].type,'text'); }
  assert.equal(Config.parse({}).headless,false);
});
test('video metadata and frame extraction using a generated local clip', async () => {
  const {directory}=await call('web_workbench_status'); const file=path.join(directory,'sample.mp4');
  await promisify(execFile)('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x240:d=1','-c:v','libx264','-y',file],{windowsHide:true});
  const info=await call('video_inspect',{file}); assert.equal(info.streams[0].width,320);
  const frame=await call('video_frame',{file,seconds:0.5}); assert.ok((await readFile(frame.path)).length>100);
});
test('English OCR recognizes actual pixels', async () => {
  const {directory}=await call('web_workbench_status'); const file=path.join(directory,'ocr.png');
  const canvas=createCanvas(1000,200); const c=canvas.getContext('2d'); c.fillStyle='white'; c.fillRect(0,0,1000,200); c.fillStyle='black'; c.font='50px Arial'; c.fillText('HARNESS OCR WORKS',30,110); await writeFile(file,canvas.toBuffer('image/png'));
  const result=await call('image_read',{file,language:'eng'}); assert.match(result.text,/HARNESS OCR WORKS/);
});
test('Chinese OCR works offline with the bundled language data', async () => {
  const {directory}=await call('web_workbench_status'); const file=path.join(directory,'chinese.png');
  const canvas=createCanvas(1000,220); const c=canvas.getContext('2d'); c.fillStyle='white'; c.fillRect(0,0,1000,220); c.fillStyle='black'; c.font='60px Microsoft YaHei'; c.fillText('中文识别测试',50,120); await writeFile(file,canvas.toBuffer('image/png'));
  const result=await call('image_read',{file,language:'eng+chi_sim'}); assert.match(result.text.replace(/\s/g,''),/中文识别测试/);
});
test('scanned PDF pages use OCR only when requested', async () => {
  const {directory}=await call('web_workbench_status'); const file=path.join(directory,'scan.pdf');
  const canvas=createCanvas(1000,220); const c=canvas.getContext('2d'); c.fillStyle='white'; c.fillRect(0,0,1000,220); c.fillStyle='black'; c.font='52px Arial'; c.fillText('SCANNED PDF WORKS',40,120);
  await writeFile(file,scannedPdf(canvas.toBuffer('image/jpeg')));
  const empty=await call('pdf_read',{file}); assert.deepEqual(empty.pages_without_text,[1]);
  const text=await call('pdf_read',{file,ocr:true,language:'eng'}); assert.match(text.text,/SCANNED PDF WORKS/); assert.deepEqual(text.pages_without_text,[]);
});
