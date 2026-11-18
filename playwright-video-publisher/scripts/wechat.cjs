'use strict';
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.cjs');
function normalize(x) {
  const m = x.desc?.media?.[0] || {};
  return {object_id: x.objectId, title: x.desc?.shortTitle?.[0]?.shortTitle || '', description: x.desc?.description || '', publish_at: x.effectiveTime ? new Date(x.effectiveTime * 1000).toISOString() : null, original_declared: x.originalInfo?.isDeclared === 1, file_size: m.fileSize, duration: m.videoPlayLen, width: m.width, height: m.height, status: x.status, handle_status: x.handleStatus};
}
function observe(page, observations) {
  page.on('response', async r => {
    try {
      const p = new URL(r.url()).pathname;
      if (p.endsWith('/post/post_clip_video_result')) {
        const d = await r.json();
        if (d.errCode === 0 && d.data?.duration != null) observations.processing.push({at: Date.now(), duration: d.data.duration, width: d.data.width, height: d.data.height});
      }
      if (p.endsWith('/post/post_list')) {
        const d = await r.json(); if (d.errCode === 0) observations.wechat.push((d.data?.list || []).map(normalize));
      }
    } catch {}
  });
}
async function setSchedule(page, item) {
  if (item.mode === 'immediate') { await page.getByText('不定时', {exact: true}).click(); return; }
  await page.getByText('定时', {exact: true}).click();
  const input = page.getByPlaceholder('请选择发表时间', {exact: true});
  const target = C.shanghai(item.publish_at), before = await input.inputValue();
  await input.click();
  const [date, time] = target.split(' ');
  const [ty, tm, td] = date.split('-').map(Number), [by, bm] = before.slice(0, 10).split('-').map(Number);
  const months = (ty - by) * 12 + tm - bm;
  if (Math.abs(months) > 12) throw Error('Schedule lies outside the supported native calendar range');
  const direction = months >= 0 ? 'next' : 'prev';
  for (let n = 0; n < Math.abs(months); n++) {
    await page.locator('[class*="picker"] [class*="' + direction + '"]:visible').first().click();
  }
  if (before.slice(0, 10) !== date) {
    await page.locator('td a:visible').filter({hasText: new RegExp('^\\s*' + td + '\\s*$')}).click();
    if (!await page.getByPlaceholder('请选择时间', {exact: true}).isVisible()) await input.click();
  }
  const timeInput = page.getByPlaceholder('请选择时间', {exact: true});
  await timeInput.fill(time); await timeInput.press('Tab');
  await page.getByText('发表时间', {exact: true}).click();
  if (await input.inputValue() !== target) throw Error('Native time picker did not retain requested schedule');
}
async function cover(page, file) {
  const trigger = page.locator('[class*="cover-edit"]:visible, [class*="cover-wrap"]:not([class*="video-cover"]):visible').first();
  await trigger.click();
  await page.locator('.single-cover-uploader-wrap input[type=file]').first().setInputFiles(file);
  await page.locator('.single-cover-uploader-wrap .finish-wrap img').first().waitFor({state: 'visible'});
  await page.locator('.cover-set-footer button.weui-desktop-btn_primary').click();
  await page.locator('[class*="cover"]:visible').filter({hasText: '生成中'}).first().waitFor({state: 'hidden', timeout: 90000});
}
async function validate(page, item) {
  const title = await page.locator('input[placeholder*="短标题"]').inputValue();
  const desc = await page.locator('div.input-editor').first().innerText();
  if (title !== item.short_title || desc.trimEnd() !== item.description.trimEnd()) throw Error('Prepared WeChat title/description mismatch');
  const timed = await page.locator('input[type=radio][value="1"]').isChecked();
  if (timed !== (item.mode === 'scheduled')) throw Error('Native publish mode mismatch');
  if (timed && await page.getByPlaceholder('请选择发表时间', {exact: true}).inputValue() !== C.shanghai(item.publish_at)) throw Error('Prepared native schedule mismatch');
  if (item.original != null && await page.locator('.declare-original-checkbox input[type=checkbox]').isChecked() !== item.original) throw Error('Original declaration mismatch');
  if (item.ai && !await page.locator('span.select-value').filter({hasText: /^含AI生成内容$/}).isVisible()) throw Error('AI declaration was not selected');
  if (item.collection && !await page.getByText(item.collection, {exact: true}).first().isVisible()) throw Error('Requested collection was not selected');
}
async function prepare({page, jobDir, item, observations}) {
  C.assertSource(item); C.assertSchedule(item);
  const current = C.read(path.join(jobDir, 'ledger.json')).items.find(x => x.id === item.id);
  if (!['planned','prepared'].includes(current.status)) throw Error('Reconcile prior submission before uploading again');
  if (current.status === 'prepared') throw Error('A prepared upload already exists; inspect it before uploading again');
  if (item.download_allowed != null) throw Error('WeChat download control requires inspection; no such control was validated in this form');
  await page.goto(C.TARGETS.wechat.create, {waitUntil: 'domcontentloaded'});
  const started = Date.now();
  C.updateItem(jobDir, item.id, x => {x.status = 'uploading'; x.upload_started_at = new Date().toISOString();});
  await page.locator('input[type=file][accept*="video"]').first().setInputFiles(item.file);
  await page.locator('input[placeholder*="短标题"]').fill(item.short_title);
  const ed = page.locator('div.input-editor').first(); await ed.fill(''); await ed.click();
  await page.keyboard.type(item.description, {delay: 1});
  if (item.collection) { await page.getByText('选择合集', {exact: true}).click(); await page.getByText(item.collection, {exact: true}).click(); }
  // Clear an automatically selected city using the native menu, when present.
  const locationLabel = page.getByText('位置', {exact: true});
  const row = locationLabel.locator('..');
  const selected = row.locator('[class*="select-value"]:visible').first();
  if (await selected.isVisible().catch(() => false) && (await selected.innerText()).trim() !== '不显示位置') {
    await selected.click(); await page.getByText('不显示位置', {exact: true}).click();
  }
  await setSchedule(page, item);
  if (item.original != null) {
    await page.locator('.declare-original-checkbox input[type=checkbox]').setChecked(item.original);
    const agreement = page.locator('.original-proto-wrapper input[type=checkbox]:visible').first();
    if (item.original && await agreement.isVisible()) { await agreement.check(); await page.getByRole('button', {name: '声明原创', exact: true}).click(); }
  }
  if (item.ai) { await page.getByText('选择视频标注', {exact: true}).click(); await page.getByText('含AI生成内容', {exact: true}).click(); }
  await page.getByText('取消上传', {exact: true}).waitFor({state: 'hidden', timeout: 300000});
  const deadline = Date.now() + 300000;
  while (!observations.processing.some(x => x.at >= started)) {
    if (Date.now() > deadline) throw Error('Server video processing did not finish; title field visibility does not prove readiness');
    await page.waitForTimeout(500);
  }
  if (item.cover) await cover(page, item.cover);
  await page.locator('[class*="cover"]:visible').filter({hasText: '生成中'}).first().waitFor({state: 'hidden', timeout: 90000});
  await validate(page, item);
  const evidence = await C.snapshot(page, path.join(jobDir, item.id + '-prepared'));
  C.prepared(jobDir, item.id, {evidence: evidence.screenshot, native_schedule: item.mode === 'scheduled' ? await page.getByPlaceholder('请选择发表时间', {exact: true}).inputValue() : null});
  return {status: 'prepared_not_published', id: item.id};
}
async function submit({page, jobDir, item}) {
  return C.publishOnce({page, jobDir, id: item.id, button: page.getByRole('button', {name: '发表', exact: true}), validate: x => validate(page, x), responsePredicate: r => new URL(r.url()).pathname.endsWith('/post/post_create')});
}
async function inventory({context, jobDir}) {
  const page = await context.newPage(), records = [];
  try {
    let pending = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/post/post_list'), {timeout: 60000}); pending.catch(() => {});
    await page.goto(C.TARGETS.wechat.list, {waitUntil: 'domcontentloaded'});
    for (let n = 0; n < 100; n++) {
      const d = await (await pending).json();
      if (d.errCode !== 0) throw Error('Creator inventory request failed');
      records.push(...(d.data?.list || []).map(normalize));
      await page.getByRole('button', {name: '发表视频', exact: true}).waitFor();
      const next = page.getByText('下一页', {exact: true}).first();
      if (!await next.isVisible().catch(() => false)) break;
      pending = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/post/post_list'), {timeout: 30000}); pending.catch(() => {});
      await next.click();
      if (n === 99) throw Error('Inventory pagination limit reached; do not assume complete');
    }
    const evidence = path.join(jobDir, 'wechat-inventory-' + Date.now() + '.json');
    C.write(evidence, {observed_at: new Date().toISOString(), records});
    return {records, evidence};
  } finally { await page.close(); }
}
module.exports = {observe, normalize, setSchedule, prepare, validate, submit, inventory};
