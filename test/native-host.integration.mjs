// Run with the installed DSH Electron executable and ELECTRON_RUN_AS_NODE=1.
// This loads real Cordis, SystemPrompt and ToolRuntime, without an LLM request.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const install = process.env.DSH_INSTALL_DIR || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness');
const modules = path.join(install, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai');
const load = (name) => import(pathToFileURL(path.join(modules, name, 'lib', 'index.js')));
const { Context } = await load('cordis');
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const packageDir = process.env.WORKBENCH_PACKAGE_DIR || path.resolve(import.meta.dirname, '..');
const plugin = await import(pathToFileURL(path.join(packageDir, 'index.js')));
const reportDir = path.resolve(process.env.WORKBENCH_REPORT_DIR || 'output/deepseek-harness-plugin');
await mkdir(reportDir, { recursive: true });
const ctx = new Context();
const report = { runtime: 'DSH 0.2.1-rc.2', installed_package: packageDir, checks: [] };
let server;
try {
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  await ctx.plugin(plugin, { dataDir: path.join(reportDir, '.native-data'), headless: true, browserChannel: 'msedge' });
  const registry = ctx.tools;
  const schemas = registry.schemas();
  assert.equal(schemas.length, 13); report.checks.push('All 13 tools registered in the real native registry');
  let count=0;
  async function call(name,args={}) {
    const result = await registry.execute({ name, arguments: args, callId: `integration-${++count}`, signal: AbortSignal.timeout(30000) });
    assert.equal(result.isError, false, JSON.stringify(result));
    return result.value;
  }
  const status = await call('web_workbench_status');
  assert.ok(status.capabilities.includes('javascript_browser'));
  report.checks.push('Native tool dispatch, output validation and result rendering');
  server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<title>Native Host Test</title><h1>Native host works</h1><input aria-label="Test input"><button onclick="document.querySelector(\'h1\').textContent=\'Native click verified\'">Apply</button>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let page=await call('web_browser_open',{url:`http://127.0.0.1:${server.address().port}`});
  page=await call('web_browser_action',{action:'fill',ref:page.elements.find(e=>e.tag==='input').ref,text:'Native host input'});
  page=await call('web_browser_action',{action:'click',ref:page.elements.find(e=>e.label==='Apply').ref});
  assert.match(page.text,/Native click verified/);
  await call('web_browser_close');
  report.checks.push('Real browser open, fill, click and close through native ToolRuntime');
  const canvasModule = await import(pathToFileURL(path.join(packageDir,'node_modules','@napi-rs','canvas','index.js')));
  const canvas=canvasModule.createCanvas(700,160);const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,700,160);c.fillStyle='black';c.font='40px Arial';c.fillText('NATIVE OCR WORKS',20,95);
  const file=path.join(status.directory,'native-ocr.png');await writeFile(file,canvas.toBuffer('image/png'));
  const ocr=await call('image_read',{file,language:'eng'});assert.match(ocr.text,/NATIVE OCR WORKS/);
  report.checks.push('Native OCR subprocess and bundled language data');
  await ctx.fiber.dispose();
  assert.equal(registry.get('web_workbench_status'),undefined);
  report.checks.push('Tool registrations removed when the plugin context disposes');
  report.passed=true;
} catch(error) {
  report.passed=false;report.error=error.stack || String(error);process.exitCode=1;
} finally {
  await ctx.fiber.dispose().catch(()=>{});
  if(server)await new Promise(r=>server.close(r));
  await writeFile(path.join(reportDir,'native-host-integration.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
