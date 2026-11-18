'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const C = require('./core.cjs');
const W = require('./wechat.cjs');
const D = require('./douyin.cjs');
function fixture(platform = 'wechat') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-publisher-test-'));
  const file = path.join(dir, 'fixture.mp4'); fs.writeFileSync(file, 'local fixture bytes');
  const request = {platform, account: 'test-creator', expected_account: 'Test Creator', items: [{id: 'one', file, title: '完整标题', short_title: platform === 'wechat' ? '第一讲状态与动作' : undefined, description: '唯一正文\n第二段 #强化学习', mode: 'scheduled', publish_at: '2099-01-02T12:00:00+08:00'}]};
  const job = C.plan(request); C.write(path.join(dir, 'ledger.json'), job, true);
  return {dir, request, job, item: job.items[0], close: () => fs.rmSync(dir, {recursive: true, force: true})};
}
test('timezone is preserved and missing mode never becomes immediate', () => {
  const f = fixture();
  try { assert.equal(C.shanghai(f.item.publish_at), '2099-01-02 12:00'); delete f.request.items[0].mode; assert.throws(() => C.plan(f.request), /mode/); }
  finally { f.close(); }
});
test('duplicate source bytes and mismatching expected hash are rejected', () => {
  const f = fixture();
  try {
    f.request.items.push({...f.request.items[0], id: 'two'}); assert.throws(() => C.plan(f.request), /Duplicate source/);
    f.request.items.pop(); f.request.items[0].sha256 = 'wrong'; assert.throws(() => C.plan(f.request), /SHA256/);
  } finally { f.close(); }
});
test('source changes and past schedules are detected', () => {
  const f = fixture();
  try { fs.appendFileSync(f.item.file, 'changed'); assert.throws(() => C.assertSource(f.item), /changed/); assert.throws(() => C.assertSchedule({...f.item, publish_at: '2001-01-01T00:00:00Z'}), /passed/); }
  finally { f.close(); }
});
test('an existing ledger cannot be overwritten by initialization', () => {
  const f = fixture(); try { assert.throws(() => C.write(path.join(f.dir, 'ledger.json'), {}, true), /EEXIST/); } finally { f.close(); }
});
test('remote update, unchanged HEAD and failed checks are distinguishable', () => {
  const old = 'a'.repeat(40), newer = 'b'.repeat(40), config = {wechat: {url: 'https://github.com/example/repo.git', reviewed_commit: old}};
  const runner = head => () => 'ref: refs/heads/main\tHEAD\n' + head + '\tHEAD\n';
  assert.equal(C.checkUpstreams(config, runner(old)).repositories.wechat.has_update, false);
  assert.equal(C.checkUpstreams(config, runner(newer)).repositories.wechat.has_update, true);
  const failed = C.checkUpstreams(config, () => { throw Error('Network failed https://example.com/x?token=hidden'); }).repositories.wechat;
  assert.equal(failed.has_update, null); assert.equal(failed.status, 'check_failed'); assert(!failed.error.includes('token='));
});
test('ambiguous submission is persisted before click and cannot be clicked again', async () => {
  const f = fixture(); let clicks = 0;
  try {
    C.prepared(f.dir, 'one', {});
    const button = {getAttribute: async () => 'primary', isEnabled: async () => true, click: async () => { clicks++; assert.equal(C.read(path.join(f.dir,'ledger.json')).items[0].status, 'submission_unknown'); }};
    const page = {waitForResponse: () => Promise.reject(Error('Receipt timed out'))};
    const options = {page, jobDir: f.dir, id: 'one', button, validate: async () => {}, responsePredicate: () => true};
    await assert.rejects(C.publishOnce(options), /timed out/);
    await assert.rejects(C.publishOnce(options), /Prepared content/);
    assert.equal(clicks, 1); assert.throws(() => C.prepared(f.dir, 'one', {}), /Reconcile/);
  } finally { f.close(); }
});
test('changed metadata blocks submission after preparation', async () => {
  const f = fixture();
  try { C.prepared(f.dir, 'one', {}); const j=C.read(path.join(f.dir,'ledger.json'));j.items[0].description='changed';C.write(path.join(f.dir,'ledger.json'),j);await assert.rejects(C.publishOnce({jobDir:f.dir,id:'one'}),/Prepared content/); }
  finally { f.close(); }
});
test('a mismatched native schedule cannot be verified', () => {
  const f=fixture();
  try {const p=path.join(f.dir,'proof.json');C.write(p,{});assert.throws(()=>C.verifyRecord(f.dir,'one',{object_id:'saved',title:f.item.short_title,description:f.item.description,publish_at:'2099-01-02T05:00:00Z'},p),/schedule differs/);assert.equal(C.read(path.join(f.dir,'ledger.json')).items[0].status,'planned');}
  finally {f.close();}
});
test('Douyin observed records preserve timezone and do not invent missing titles', () => {
  const rows=D.recordsFrom({data:{aweme_list:[{aweme_id:'id',desc:'text',schedule_time:'2099-01-02 12:00'}]}});
  assert.equal(rows[0].publish_at,'2099-01-02T04:00:00.000Z');assert.equal(rows[0].title,'');assert.equal(D.timestamp(0),null);
});
test('CLI plan and disk RPC work without stdin; every invocation checks both upstreams', async () => {
  const f=fixture(), bin=path.join(f.dir,'bin'), job=path.join(f.dir,'rpc-job');let child;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async predicate=>{const end=Date.now()+8000;while(!predicate()){if(Date.now()>end)throw Error('RPC fixture timed out');await pause(30);}};
  try {
    fs.mkdirSync(bin);const gitLog=path.join(f.dir,'git-checks.jsonl');
    const refs=C.read(path.join(C.SKILL,'upstreams.json'));
    const fakeGit='#!'+process.execPath+'\nconst fs=require("node:fs");fs.appendFileSync(process.env.MEDIA_TEST_GIT_LOG,JSON.stringify(process.argv.slice(2))+"\\n");const head='+JSON.stringify(refs)+'[process.argv.join(" ").includes("wechat-channels-upload")?"wechat":"douyin"].reviewed_commit;process.stdout.write("ref: refs/heads/main\\tHEAD\\n"+head+"\\tHEAD\\n");';
    fs.writeFileSync(path.join(bin,'git'),fakeGit,{mode:0o755});
    const mock=path.join(f.dir,'mock-playwright.cjs');
    fs.writeFileSync(mock,'const page={on(){},setDefaultTimeout(){},async goto(){}};module.exports={chromium:{async launchPersistentContext(){return {pages(){return [page]},async close(){}}}}};');
    const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,MEDIA_PLAYWRIGHT_MODULE:mock,MEDIA_TEST_GIT_LOG:gitLog};
    const cli=path.join(__dirname,'publisher.cjs'),request=path.join(f.dir,'request.json');C.write(request,f.request);
    const run=args=>JSON.parse(execFileSync(process.execPath,[cli,...args],{env,encoding:'utf8'}).trim().split('\n').at(-1));
    assert.equal(run(['plan','--request',request,'--job',job]).status,'planned_no_upload');
    child=spawn(process.execPath,[cli,'session','--job',job,'--profile',path.join(f.dir,'profile')],{env,stdio:['ignore','ignore','pipe']});
    await wait(()=>fs.existsSync(path.join(job,'session.json')));
    const task=path.join(job,'task.cjs');fs.writeFileSync(task,'module.exports=async({core,jobDir})=>({worked:true,items:core.read(require("node:path").join(jobDir,"ledger.json")).items.length});');
    const queued=run(['call','--job',job,'--action','script','--script',task]);
    await wait(()=>{const p=path.join(job,'results',queued.id+'.json');return fs.existsSync(p)&&C.read(p).status==='complete';});
    const result=run(['result','--job',job,'--id',queued.id]);assert.equal(result.result.worked,true);assert.equal(result.result.items,1);
    run(['call','--job',job,'--action','close']);await wait(()=>child.exitCode!==null);
    assert.equal(child.exitCode,0);assert(!fs.existsSync(path.join(job,'session.lock')));
    const checks=fs.readFileSync(gitLog,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(checks.length,10);assert(checks.every(x=>x[0]==='ls-remote'&&x[1]==='--symref'));
  } finally {if(child&&child.exitCode===null){child.kill('SIGTERM');await pause(100);}f.close();}
});
function playwright() {
  for(const p of [process.env.MEDIA_PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{return require(p);}catch{}}
  throw Error('Playwright is required for local browser validation');
}
function browserPath() {
  if(process.env.MEDIA_CHROMIUM_EXECUTABLE)return process.env.MEDIA_CHROMIUM_EXECUTABLE;
  const p=path.join(os.homedir(),'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  return fs.existsSync(p)?p:undefined;
}
for(const platform of ['wechat','douyin'])test(platform+' local browser: prepare, one submit, persisted native readback',async()=>{
  const f=fixture(platform), {chromium}=playwright();
  const browser=await chromium.launch({headless:true,...(browserPath()?{executablePath:browserPath()}:{})});
  try {
    const page=await browser.newPage({timezoneId:'Asia/Shanghai'}), observations={wechat:[],douyin:[],processing:[]};
    page.on('pageerror', e => console.error('Local fixture error:', e.message));
    const adapter=platform==='wechat'?W:D; adapter.observe?.(page,observations);
    const create=platform==='wechat'?C.TARGETS.wechat.create:C.TARGETS.douyin.create;
    const endpoint=platform==='wechat'?'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_create':'https://creator.douyin.com/web/api/media/aweme/create/';
    const processing='https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_clip_video_result';
    const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div>Test Creator</div>'+
      '<input type="file" accept="video/*" class="upload-btn-input" onchange="upload()">'+
      '<span id="uploading" style="display:none">取消上传</span><div class="long-card-test" style="display:none" id="ready">重新上传</div>'+
      '<input placeholder="'+(platform==='wechat'?'填写短标题有机会获得更多流量':'填写作品标题')+'">'+
      '<div contenteditable="true" class="'+(platform==='wechat'?'input-editor':'zone-container')+'"></div>'+
      '<div><span>位置</span><span class="select-value">不显示位置</span></div>'+
      (platform==='wechat'?'<label><input type="radio" name="mode" value="0" checked>不定时</label><label onclick="showSchedule()"><input type="radio" name="mode" value="1">定时</label>':'<div class="radio-now">立即发布</div><div class="radio-later" onclick="showSchedule()">定时发布</div>')+
      '<span>发表时间</span><input id="schedule" placeholder="'+(platform==='wechat'?'请选择发表时间':'日期和时间')+'" value="2099-01-01 14:00" style="display:none" '+(platform==='wechat'?'readonly onclick="calendar.style.display=\'block\'"':'')+'>'+
      '<div id="calendar" style="display:none"><table><tr><td><a onclick="schedule.value=\'2099-01-02 14:00\'">2</a></td></tr></table><input placeholder="请选择时间" onblur="schedule.value=schedule.value.slice(0,11)+this.value"></div>'+
      '<div class="declare-original-checkbox"><input type="checkbox"></div><button id="publish" class="disabled" onclick="save()">'+(platform==='wechat'?'发表':'发布')+'</button>'+
      '<script>const schedule=document.getElementById("schedule"),calendar=document.getElementById("calendar");window.clicks=0;function showSchedule(){schedule.style.display="block";}'+
      'function upload(){uploading.style.display="block";setTimeout(async()=>{'+(platform==='wechat'?'await fetch('+JSON.stringify(processing)+');':'')+'uploading.style.display="none";ready.style.display="block";publish.className="primary";},150);}'+
      'async function save(){if(publish.className==="disabled")throw Error("clicked before processing");window.clicks++;window.saved={object_id:"local-saved-id",title:document.querySelector("input[placeholder*=\'标题\']").value,description:document.querySelector("[contenteditable]").innerText,publish_at:new Date(schedule.value.replace(" ","T")+":00+08:00").toISOString(),file_size:document.querySelector("input[type=file]").files[0].size};await fetch('+JSON.stringify(endpoint)+',{method:"POST"});}</script></body></html>';
    let external=0;
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url===create)return route.fulfill({status:200,contentType:'text/html',body:html});
      if(url===processing)return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({errCode:0,data:{duration:3,width:1080,height:1920}})});
      if(url===endpoint)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(platform==='wechat'?{errCode:0}:{status_code:0})});
      external++;await route.abort();
    });
    await adapter.prepare({page,jobDir:f.dir,item:f.item,observations});
    assert.equal(C.read(path.join(f.dir,'ledger.json')).items[0].status,'prepared');
    assert.equal(await page.evaluate(()=>window.clicks),0);
    await adapter.submit({page,jobDir:f.dir,item:f.item});
    await assert.rejects(adapter.submit({page,jobDir:f.dir,item:f.item}),/Prepared content/);
    const saved=await page.evaluate(()=>window.saved), proof=path.join(f.dir,'actual-native-fixture.json');C.write(proof,saved);
    C.verifyRecord(f.dir,'one',saved,proof);
    assert.equal(C.read(path.join(f.dir,'ledger.json')).items[0].status,'verified');
    assert.equal(await page.evaluate(()=>window.clicks),1);assert.equal(external,0);
  } finally {await browser.close();f.close();}
});
