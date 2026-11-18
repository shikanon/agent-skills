'use strict';
const path = require('node:path');
const C = require('./core.cjs');
function timestamp(value) {
  if (value == null || value === '') return null;
  if (/^\d+$/.test(String(value))) { const n = Number(value); return n === 0 ? null : new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
  const s = /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(value) ? value.replace(' ', 'T') + (/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? '' : '+08:00') : value;
  return Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
}
function recordsFrom(data, depth = 0) {
  if (depth > 5 || !data || typeof data !== 'object') return [];
  if (Array.isArray(data)) {
    if (data.some(x => x && (x.aweme_id || x.item_id || x.itemId))) return data.map(x => ({object_id: String(x.aweme_id || x.item_id || x.itemId || ''), title: x.title ?? x.item_title ?? x.aweme_title ?? '', description: x.description ?? x.desc ?? '', publish_at: timestamp(x.schedule_time ?? x.scheduled_time ?? x.publish_time), status: x.status ?? x.aweme_status}));
    return data.flatMap(x => recordsFrom(x, depth + 1));
  }
  return Object.values(data).flatMap(x => recordsFrom(x, depth + 1));
}
function observe(page, observations) {
  page.on('response', async r => {
    try {
      if (!/work_list|item_list|aweme_list|post_list|video_list/.test(new URL(r.url()).pathname)) return;
      const records = recordsFrom(await r.json()); if (records.length) observations.douyin.push(records);
    } catch {}
  });
}
async function visibleOne(page, selectors) {
  for (const s of selectors) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) return el; }
  throw Error('Expected native control was not found; inspect DOM and the reviewed upstream before adapting selectors');
}
async function validate(page, item) {
  if (await page.locator('input[placeholder*="填写作品标题"]').first().inputValue() !== item.title) throw Error('Douyin title mismatch');
  const desc = await page.locator('div.zone-container[contenteditable="true"]').first().innerText();
  if (desc.trimEnd() !== item.description.trimEnd()) throw Error('Description or topic suggestion changed the requested copy');
  const schedule = page.getByPlaceholder('日期和时间', {exact: true});
  if (item.mode === 'scheduled' && (!await schedule.isVisible() || await schedule.inputValue() !== C.shanghai(item.publish_at))) throw Error('Douyin native schedule/mode mismatch');
  if (item.mode === 'immediate' && await schedule.isVisible().catch(() => false)) throw Error('Immediate mode was not selected');
  if (item.collection && !await page.getByText(item.collection, {exact: true}).first().isVisible()) throw Error('Requested Douyin collection was not selected');
  if (item.ai && !(await page.locator('body').allInnerTexts()).join('\n').includes('内容由AI生成')) throw Error('AI declaration was not retained in the form');
}
async function prepare({page, jobDir, item}) {
  C.assertSource(item); C.assertSchedule(item);
  const current = C.read(path.join(jobDir, 'ledger.json')).items.find(x => x.id === item.id);
  if (current.status !== 'planned') throw Error('Inspect/reconcile an existing prepared or submitted item before uploading again');
  await page.goto(C.TARGETS.douyin.create, {waitUntil: 'domcontentloaded'});
  const input = page.locator('input.upload-btn-input, input[type=file][accept*="video"], div[class^="container"] input[type=file]').first();
  C.updateItem(jobDir, item.id, x => {x.status = 'uploading'; x.upload_started_at = new Date().toISOString();});
  await input.setInputFiles(item.file);
  const title = page.locator('input[placeholder*="填写作品标题"]').first();
  await title.waitFor({state: 'visible', timeout: 180000}); await title.fill(item.title);
  const editor = page.locator('div.zone-container[contenteditable="true"]').first();
  await editor.fill(''); await editor.click(); await page.keyboard.type(item.description, {delay: 1});
  await page.keyboard.press('Escape'); await editor.press('Tab');
  await page.locator('[class^="long-card"]').getByText('重新上传', {exact: true}).first().waitFor({state: 'visible', timeout: 300000});
  if (item.collection) {
    await page.locator('[class*="select-collection-"] .semi-select-selection').first().click();
    await page.locator('.semi-select-option.collection-option').filter({hasText: item.collection}).filter({has: page.getByText(item.collection, {exact: true})}).first().click();
  }
  if (item.ai) {
    const entry = await visibleOne(page, ['text="请选择自主声明"', 'text="请选择声明类型"', 'text="添加自主声明"', 'text="自主声明"', 'text="作品声明"']);
    await entry.click();
    const dialog = page.locator('.semi-modal-content').filter({hasText: '请选择声明类型'}).first();
    await dialog.locator('label.semi-radio').filter({hasText: '内容由AI生成'}).click();
    await dialog.getByRole('button', {name: '确定', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
  }
  if (item.original != null) {
    const label = page.locator('label').filter({hasText: /^原创声明$/}).first();
    if (!await label.isVisible().catch(() => false)) throw Error('Requested original control is not offered here; do not claim it was set');
    await label.locator('input[type=checkbox]').setChecked(item.original);
  }
  if (item.download_allowed != null) {
    const advanced = page.getByText('高级设置', {exact: true}).first();
    if (await advanced.isVisible().catch(() => false)) await advanced.click();
    const row = page.getByText('允许下载', {exact: true}).locator('..');
    const switchInput = row.locator('input[type=checkbox],input.semi-switch-native-control').first();
    await switchInput.setChecked(item.download_allowed);
    if (await switchInput.isChecked() !== item.download_allowed) throw Error('Download setting did not stick');
  }
  if (item.cover) {
    await page.locator('[class*="cover-"]').filter({has: page.locator('img')}).first().click();
    const modal = page.locator('[class*="dy-creator-content-portal"],.semi-modal-content').filter({hasText: /封面/}).first();
    await modal.locator('input[type=file][accept*="image"]').first().setInputFiles(item.cover);
    await modal.getByRole('button', {name: '完成', exact: true}).click();
    await modal.waitFor({state: 'hidden', timeout: 90000});
  }
  if (item.mode === 'scheduled') {
    await page.locator('[class^="radio"]').filter({hasText: '定时发布'}).first().click();
    const time = page.getByPlaceholder('日期和时间', {exact: true});
    await time.fill(C.shanghai(item.publish_at)); await time.press('Enter'); await time.press('Tab');
  } else {
    const now = page.locator('[class^="radio"]').filter({hasText: '立即发布'}).first();
    await now.click();
  }
  await validate(page, item);
  const evidence = await C.snapshot(page, path.join(jobDir, item.id + '-prepared'));
  C.prepared(jobDir, item.id, {evidence: evidence.screenshot, native_schedule: item.mode === 'scheduled' ? await page.getByPlaceholder('日期和时间', {exact: true}).inputValue() : null});
  return {status: 'prepared_not_published', id: item.id};
}
async function submit({page, jobDir, item}) {
  return C.publishOnce({page, jobDir, id: item.id, button: page.getByRole('button', {name: '发布', exact: true}), validate: x => validate(page, x), responsePredicate: r => /\/(?:aweme|video|post)\/(?:create|publish)(?:\/|$)/.test(new URL(r.url()).pathname)});
}
async function inventory({context, jobDir}) {
  const page = await context.newPage(), observations = {douyin: []}; observe(page, observations);
  try {
    await page.goto(C.TARGETS.douyin.list, {waitUntil: 'domcontentloaded'});
    // Bounded wait; an unrecognized response schema is not interpreted as an empty account.
    const deadline = Date.now() + 12000;
    while (!observations.douyin.length && Date.now() < deadline) await page.waitForTimeout(300);
    const evidence = await C.snapshot(page, path.join(jobDir, 'douyin-inventory-' + Date.now()));
    const records = [...new Map(observations.douyin.flat().map(x => [x.object_id, x])).values()];
    const file = evidence.screenshot.replace(/\.png$/, '.json'); C.write(file, {records, scope: 'Visible first inventory page only; paginate/search the native UI to establish absence.'});
    return {records, evidence: file, screenshot: evidence.screenshot, complete_inventory: false, note: 'If title or schedule is absent in normal UI responses, reopen the saved edit form and read the native controls. Never fill proof fields from the plan.'};
  } finally { await page.close(); }
}
module.exports = {observe, recordsFrom, timestamp, prepare, validate, submit, inventory};
