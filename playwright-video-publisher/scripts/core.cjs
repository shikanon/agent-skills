'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const SKILL = path.resolve(__dirname, '..');
const MEDIA = process.env.MEDIA_PUBLISHER_WORKSPACE
  ? path.resolve(process.env.MEDIA_PUBLISHER_WORKSPACE)
  : (path.basename(path.dirname(SKILL)) === 'skills' && path.basename(path.dirname(path.dirname(SKILL))) === '.agents'
    ? path.resolve(SKILL, '../../..') : process.cwd());
const TARGETS = {
  wechat: {create: 'https://channels.weixin.qq.com/platform/post/create', list: 'https://channels.weixin.qq.com/platform/post/list'},
  douyin: {create: 'https://creator.douyin.com/creator-micro/content/upload', list: 'https://creator.douyin.com/creator-micro/content/manage'},
  kuaishou: {create: 'https://cp.kuaishou.com/article/publish/video', list: 'https://cp.kuaishou.com/article/manage/video'},
  bilibili: {create: 'https://member.bilibili.com/platform/upload/video', list: 'https://member.bilibili.com/platform/upload-manager/article'}
};
function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function write(p, d, exclusive = false) {
  fs.mkdirSync(path.dirname(p), {recursive: true, mode: 0o700});
  const content = JSON.stringify(d, null, 2) + '\n';
  if (exclusive) return fs.writeFileSync(p, content, {flag: 'wx', mode: 0o600});
  const tmp = p + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(tmp, content, {mode: 0o600}); fs.renameSync(tmp, p);
}
function safeError(e) {
  return String(e.message || e).replace(/https?:\/\/[^\s"'<>]+/g, s => {
    try { const u = new URL(s); return u.origin + u.pathname; } catch { return '[URL]'; }
  }).slice(0, 3000);
}
function hash(file, algorithm = 'sha256') { return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex'); }
function shanghai(date) {
  const d = new Date(new Date(date).getTime() + 8 * 3600000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
function intent(item) {
  const fields = ['id', 'file', 'sha256', 'title', 'short_title', 'description', 'mode', 'publish_at', 'collection', 'original', 'ai', 'cover', 'cover_sha256', 'download_allowed'];
  if (item.intent_version === 2) fields.push('intent_version', 'tags', 'collection_pending');
  return crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(fields.map(k => [k, item[k] ?? null])))).digest('hex');
}
function assertSource(item) {
  if (hash(item.file) !== item.sha256) throw Error('Source file changed: ' + item.id);
  if (item.cover && hash(item.cover) !== item.cover_sha256) throw Error('Cover file changed: ' + item.id);
}
function assertSchedule(item, now = Date.now()) {
  if (item.mode === 'scheduled' && Date.parse(item.publish_at) <= now) throw Error('Scheduled time has passed: ' + item.id);
}
function plan(request, baseDir = MEDIA) {
  if (!TARGETS[request.platform]) throw Error('Unsupported platform');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(request.account || '')) throw Error('account must be a safe profile label');
  if (!request.expected_account?.trim()) throw Error('expected_account must identify the intended creator account');
  if (!request.items?.length) throw Error('items are required');
  if (['kuaishou', 'bilibili'].includes(request.platform) && request.items.length !== 1) throw Error('Use one item per job for this platform');
  const ids = new Set(), hashes = new Set();
  const items = request.items.map(raw => {
    const x = {...raw};
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(x.id || '') || ids.has(x.id)) throw Error('Missing/duplicate/unsafe item id');
    ids.add(x.id);
    if (!x.title?.trim() || !x.description?.trim()) throw Error('Explicit title and description are required: ' + x.id);
    if (!['immediate', 'scheduled'].includes(x.mode)) throw Error('Explicit mode is required; immediate is never the fallback');
    if (['kuaishou', 'bilibili'].includes(request.platform)) {
      x.intent_version = 2;
      if (x.mode !== 'scheduled') throw Error('This adapter supports scheduled mode only');
      if (!x.cover || x.ai !== true) throw Error('Adapter requires explicit cover and ai=true');
      if (request.platform === 'kuaishou' && x.download_allowed !== false) throw Error('Kuaishou adapter requires download_allowed=false');
      if (request.platform === 'bilibili' && x.download_allowed != null) throw Error('Bilibili download setting is not supported; omission does not mean downloads are disabled');
      if (request.platform === 'bilibili' && (x.original !== true || !Array.isArray(x.tags) || !x.tags.length || x.collection)) throw Error('Bilibili adapter requires original=true, tags, and no collection');
      if (request.platform === 'bilibili' && !/\.png$/i.test(x.cover)) throw Error('Bilibili adapter currently requires a PNG cover');
      if (request.platform === 'kuaishou' && !x.collection_pending && !x.collection) throw Error('Specify a collection or collection_pending=true');
      if (request.platform === 'kuaishou' && x.original === true) throw Error('Kuaishou original declaration is not supported by this adapter');
    }
    if (x.mode === 'scheduled') {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(x.publish_at || '') || !Number.isFinite(Date.parse(x.publish_at))) throw Error('Use ISO 8601 with timezone: ' + x.id);
      if (Date.parse(x.publish_at) % 60000 !== 0) throw Error('Native scheduling requires whole minutes');
      x.publish_at = new Date(x.publish_at).toISOString();
    } else if (x.publish_at) throw Error('Immediate mode cannot contain publish_at');
    if (request.platform === 'wechat' && (!/^[\p{L}\p{N} ]{6,16}$/u.test(x.short_title || ''))) throw Error('WeChat short_title must contain 6-16 letters/numbers/spaces');
    if (request.platform === 'douyin' && Array.from(x.title).length > 30) throw Error('Douyin title exceeds 30 characters; do not truncate silently');
    x.file = path.resolve(baseDir, x.file || '');
    if (!fs.statSync(x.file).isFile()) throw Error('Missing source file');
    const actual = hash(x.file);
    if (x.sha256 && x.sha256 !== actual) throw Error('Requested SHA256 does not match source');
    if (hashes.has(actual)) throw Error('Duplicate source bytes in this job');
    hashes.add(actual); x.sha256 = actual; x.bytes = fs.statSync(x.file).size;
    if (x.cover) { x.cover = path.resolve(baseDir, x.cover); x.cover_sha256 = hash(x.cover); }
    for (const flag of ['original', 'ai', 'download_allowed']) if (x[flag] != null && typeof x[flag] !== 'boolean') throw Error(flag + ' must be boolean');
    x.status = 'planned'; x.public_playback_verified = false;
    return x;
  });
  return {schema_version: 1, platform: request.platform, account: request.account, expected_account: request.expected_account, timezone: 'Asia/Shanghai', created_at: new Date().toISOString(), items};
}
function updateItem(jobDir, id, fn) {
  const p = path.join(jobDir, 'ledger.json'), job = read(p), item = job.items.find(x => x.id === id);
  if (!item) throw Error('Unknown item id: ' + id);
  fn(item, job); job.updated_at = new Date().toISOString(); write(p, job); return item;
}
function prepared(jobDir, id, proof) {
  return updateItem(jobDir, id, item => {
    if (['submission_unknown', 'accepted_unverified', 'verified'].includes(item.status)) throw Error('Reconcile an existing attempt before preparing/uploading again');
    assertSource(item); assertSchedule(item);
    item.status = 'prepared'; item.prepared_intent = intent(item); item.prepared_proof = proof;
  });
}
async function publishOnce({page, jobDir, id, button, validate, responsePredicate}) {
  const item = read(path.join(jobDir, 'ledger.json')).items.find(x => x.id === id);
  if (!item || item.status !== 'prepared' || item.prepared_intent !== intent(item)) throw Error('Prepared content is missing or has changed; do not publish');
  assertSource(item); assertSchedule(item); await validate(item);
  const cls = await button.getAttribute('class');
  if (!await button.isEnabled() || /disabled/.test(cls || '')) throw Error('Publish control is disabled');
  updateItem(jobDir, id, x => { x.status = 'submission_unknown'; x.attempted_at = new Date().toISOString(); });
  const waiting = page.waitForResponse(responsePredicate, {timeout: 60000}); waiting.catch(() => {});
  // Persist uncertainty before exactly one click. Never loop or retry this click.
  await button.click();
  const response = await waiting, data = await response.json();
  const code = data.errCode ?? data.status_code ?? data.code;
  if (code !== 0) throw Error('Platform rejected submission: ' + code + ' ' + (data.errMsg || data.status_msg || data.message || ''));
  return updateItem(jobDir, id, x => {
    x.status = 'accepted_unverified';
    x.acceptance = {http_status: response.status(), code, at: new Date().toISOString()};
  });
}
function verifyRecord(jobDir, id, record, proofFile) {
  if (!proofFile || !fs.statSync(proofFile).isFile()) throw Error('Save actual platform readback evidence first');
  return updateItem(jobDir, id, (item, job) => {
    if (!record.object_id || record.title !== (job.platform === 'wechat' ? item.short_title : item.title) || record.description?.trimEnd() !== item.description.trimEnd()) throw Error('Platform identity/title/description do not match');
    if (item.receipt && item.receipt.object_id !== record.object_id) throw Error('Previously verified platform identity changed');
    if (item.mode === 'scheduled' && Date.parse(record.publish_at) !== Date.parse(item.publish_at)) throw Error('Saved schedule differs from requested schedule');
    if (record.file_size != null && Number(record.file_size) !== item.bytes) throw Error('Saved video size differs from source');
    if (record.sha256 != null && record.sha256 !== item.sha256) throw Error('Saved video hash differs from source');
    item.receipt = {...record, evidence: path.resolve(proofFile), verified_at: new Date().toISOString()};
    item.status = 'verified'; item.public_playback_verified = false;
  });
}
function checkUpstreams(config = read(path.join(SKILL, 'upstreams.json')), runner = execFileSync) {
  return {checked_at: new Date().toISOString(), repositories: Object.fromEntries(Object.entries(config).map(([name, ref]) => {
    try {
      const output = runner('git', ['ls-remote', '--symref', ref.url, 'HEAD'], {encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe']});
      const head = output.match(/^([a-f0-9]{40})\s+HEAD$/m)?.[1];
      if (!head) throw Error('Remote HEAD was not returned');
      const branch = output.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m)?.[1] || null;
      return [name, {url: ref.url, reviewed_commit: ref.reviewed_commit, remote_commit: head, default_branch: branch, has_update: head !== ref.reviewed_commit, status: head === ref.reviewed_commit ? 'up_to_date' : 'update_available'}];
    } catch (e) { return [name, {url: ref.url, reviewed_commit: ref.reviewed_commit, remote_commit: null, has_update: null, status: 'check_failed', error: safeError(e)}]; }
  }))};
}
async function snapshot(page, output) {
  const text = (await page.locator('body').allInnerTexts()).join('\n\n');
  fs.writeFileSync(output + '.txt', text, {mode: 0o600});
  await page.screenshot({path: output + '.png', fullPage: true}); fs.chmodSync(output + '.png', 0o600);
  return {text, screenshot: output + '.png', url: new URL(page.url()).origin + new URL(page.url()).pathname};
}
module.exports = {SKILL, MEDIA, TARGETS, read, write, hash, intent, plan, updateItem, prepared, publishOnce, verifyRecord, assertSource, assertSchedule, shanghai, safeError, checkUpstreams, snapshot};
