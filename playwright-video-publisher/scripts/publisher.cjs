#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const C = require('./core.cjs');
const args = process.argv.slice(2), command = args.shift();
function arg(name, fallback) { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; }
function required(name) { const v = arg(name); if (!v) throw Error('--' + name + ' is required'); return v; }
function emit(x) { process.stdout.write(JSON.stringify(x) + '\n'); }
function loadPlaywright() {
  const candidates = [process.env.MEDIA_PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean);
  for (const p of candidates) { try { return require(p); } catch {} }
  throw Error('Set MEDIA_PLAYWRIGHT_MODULE to the installed playwright package');
}
async function session(jobDir) {
  const job = C.read(path.join(jobDir, 'ledger.json'));
  const lock = path.join(jobDir, 'session.lock');
  if (fs.existsSync(lock)) {
    const pid = C.read(lock).pid;
    let live = true; try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') live = false; else throw e; }
    if (live) throw Error('This job already has a running session');
    fs.unlinkSync(lock);
  }
  C.write(lock, {pid: process.pid}, true);
  const profile = path.resolve(arg('profile', path.join(os.homedir(), '.local/share/media-video-publisher', job.platform, job.account)));
  fs.mkdirSync(profile, {recursive: true, mode: 0o700}); fs.chmodSync(profile, 0o700);
  let context, closing = false;
  const close = async () => { closing = true; if (context) await context.close(); fs.rmSync(lock, {force: true}); };
  process.once('SIGTERM', () => close().finally(() => process.exit(0)));
  process.once('SIGINT', () => close().finally(() => process.exit(0)));
  try {
    const {chromium} = loadPlaywright();
    const executable = process.env.MEDIA_CHROMIUM_EXECUTABLE;
    context = await chromium.launchPersistentContext(profile, {headless: false, ...(executable ? {executablePath: executable} : {}), viewport: {width: 1440, height: 1080}, locale: 'zh-CN', timezoneId: 'Asia/Shanghai'});
    const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(20000);
    const observations = {wechat: [], douyin: [], processing: []};
    const adapter = require('./' + job.platform + '.cjs');
    adapter.observe?.(page, observations);
    await page.goto(C.TARGETS[job.platform].list, {waitUntil: 'domcontentloaded', timeout: 60000});
    const inbox = path.join(jobDir, 'inbox'), results = path.join(jobDir, 'results');
    fs.mkdirSync(inbox, {recursive: true, mode: 0o700}); fs.mkdirSync(results, {recursive: true, mode: 0o700});
    C.write(path.join(jobDir, 'session.json'), {pid: process.pid, platform: job.platform, profile, started_at: new Date().toISOString()});
    emit({status: 'session_ready', job: jobDir, profile, expected_account: job.expected_account});
    while (!closing) {
      for (const name of fs.readdirSync(inbox).filter(x => x.endsWith('.json')).sort()) {
        const input = path.join(inbox, name), output = path.join(results, name);
        // If interrupted after claiming a command, never execute it a second time.
        const claimed = input + '.running'; fs.renameSync(input, claimed);
        const request = C.read(claimed);
        C.write(output, {status: 'running', id: request.id, started_at: new Date().toISOString()});
        try {
          let result;
          if (request.action === 'snapshot') result = await C.snapshot(page, path.join(jobDir, 'snapshot-' + request.id));
          else if (request.action === 'close') { result = {closed: true}; closing = true; }
          else if (request.action === 'script') {
            const file = fs.realpathSync(path.resolve(request.script));
            const allowed = [fs.realpathSync(jobDir), C.SKILL].some(root => file.startsWith(root + path.sep));
            if (!allowed) throw Error('Adaptation scripts must be in this job or this skill');
            delete require.cache[require.resolve(file)];
            result = await require(file)({page, context, jobDir, core: C, adapter, observations, params: request.params || {}});
          } else throw Error('Unknown action');
          C.write(output, {status: 'complete', id: request.id, result});
        } catch (e) {
          const evidence = await C.snapshot(page, path.join(jobDir, 'error-' + request.id)).catch(() => ({}));
          C.write(output, {status: 'failed', id: request.id, error: C.safeError(e), screenshot: evidence.screenshot});
        }
        fs.rmSync(claimed, {force: true});
        if (closing) break;
      }
      if (!closing) await new Promise(r => setTimeout(r, 250));
    }
  } finally { await close(); }
}
async function main() {
  if (!command || command === 'help' || command === '--help') {
    emit({commands: ['check-upstream [--output file]', 'plan --request file --job directory', 'session --job directory [--profile directory]', 'call --job directory --action snapshot|script|close [--script file] [--params JSON]', 'result --job directory --id UUID'], note: 'Every invocation checks GitHub. Only an explicit job script can upload or publish.'}); return;
  }
  const update = C.checkUpstreams();
  const jobDir = arg('job') ? path.resolve(arg('job')) : null;
  const report = arg('output') || (jobDir ? path.join(jobDir, 'upstream-check.json') : path.join(C.MEDIA, '.publication-runtime/latest-upstream-check.json'));
  // Never replace a user's unrelated output file when planning.
  if (command === 'plan' && fs.existsSync(path.join(jobDir || '', 'ledger.json'))) throw Error('Existing ledger is preserved; choose its existing session instead of planning again');
  C.write(report, update);
  if (command === 'check-upstream') { emit(update); return; }
  emit({event: 'upstream_checked', report, status: Object.fromEntries(Object.entries(update.repositories).map(([k,v]) => [k,v.status]))});
  if (command === 'plan') {
    const requestFile = path.resolve(required('request')), outputDir = path.resolve(required('job'));
    const ledger = C.plan(C.read(requestFile), path.dirname(requestFile));
    C.write(path.join(outputDir, 'ledger.json'), ledger, true);
    emit({job: outputDir, platform: ledger.platform, items: ledger.items.length, status: 'planned_no_upload'});
  } else if (command === 'session') await session(path.resolve(required('job')));
  else if (command === 'call') {
    const dir = path.resolve(required('job')), id = crypto.randomUUID(), action = required('action');
    if (!['snapshot','script','close'].includes(action)) throw Error('Unknown action');
    const request = {id, action, params: JSON.parse(arg('params', '{}'))};
    if (action === 'script') request.script = path.resolve(required('script'));
    C.write(path.join(dir, 'inbox', id + '.json'), request, true);
    emit({status: 'queued', id, result_file: path.join(dir, 'results', id + '.json'), note: 'Poll result; do not resubmit this command if it is slow.'});
  } else if (command === 'result') {
    const id = required('id'); if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid result id');
    const p = path.join(path.resolve(required('job')), 'results', id + '.json');
    emit(fs.existsSync(p) ? C.read(p) : {status: 'queued', id});
  } else throw Error('Unknown command: ' + command);
}
main().catch(e => { emit({status: 'error', error: C.safeError(e)}); process.exitCode = 1; });
