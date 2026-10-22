import http from 'node:http';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

/** Explicit opt-in live-Host check; no LLM or external website is contacted. */
export async function verifyLiveHost(ctx, config, signal) {
  const report = { process_id: process.pid, started_at: new Date().toISOString(), checks: [], passed: false };
  let server;
  let browserOpened = false;
  let count=0;
  async function call(name, args={}) {
    const result = await ctx.tools.execute({ name, arguments: args, callId: `workbench-verification-${process.pid}-${++count}`, signal });
    assert.equal(result.isError,false,JSON.stringify(result));
    return result.value;
  }
  try {
    const names = ctx.tools.schemas().map(s=>s.name);
    const expected = ['web_workbench_status','web_browser_open','web_browser_snapshot','web_browser_action','web_browser_screenshot','web_browser_downloads','web_browser_close','web_download_file','pdf_read','pdf_render','image_read','video_inspect','video_frame'];
    assert.ok(expected.every(name=>names.includes(name)));
    report.registered_tools=expected;
    report.checks.push('All 13 tools are visible in the running Host registry');
    const status=await call('web_workbench_status');
    assert.ok(status.capabilities.includes('javascript_browser'));
    report.checks.push('web_workbench_status dispatched and validated by the running Host');
    server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Workbench live verification</title><style>body{font:36px Arial;background:white;color:black}</style><h1>HARNESS LIVE READY</h1><label>Test<input aria-label="Test"></label><button onclick="document.querySelector(\'h1\').textContent=\'HARNESS LIVE VERIFIED\'">Apply</button>');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browserOpened=true;
    let page=await call('web_browser_open',{url:`http://127.0.0.1:${server.address().port}`});
    page=await call('web_browser_action',{action:'fill',ref:page.elements.find(e=>e.tag==='input').ref,text:'verified'});
    page=await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Apply').ref});
    assert.match(page.text,/HARNESS LIVE VERIFIED/);
    report.checks.push('Real browser open, form fill and click through the running Host');
    const screenshot=await call('web_browser_screenshot');
    const ocr=await call('image_read',{file:screenshot.path,language:'eng'});
    assert.match(ocr.text,/HARNESS LIVE VERIFIED/);
    report.checks.push('Browser screenshot and offline OCR through the running Host');
    report.passed=true;
  } catch(error) {
    report.error=error.stack || String(error);
  } finally {
    if(browserOpened)await call('web_browser_close').catch(()=>{});
    if(server)await new Promise(r=>server.close(r));
    report.finished_at=new Date().toISOString();
    const directory=path.join(config.dataDir,'diagnostics');await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,'live-host.json'),JSON.stringify(report,null,2));
  }
  return report;
}
