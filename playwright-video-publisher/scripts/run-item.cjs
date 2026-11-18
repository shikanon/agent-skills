'use strict';
const path = require('node:path');
module.exports = async function run(ctx) {
  const {core: C, jobDir, adapter, params} = ctx;
  const job = C.read(path.join(jobDir, 'ledger.json'));
  if (['kuaishou', 'bilibili'].includes(job.platform)) {
    if (!['prepare', 'submit', 'verify'].includes(params.phase) || job.items.length !== 1 || job.items[0].id !== params.id) throw Error('Use prepare, submit or verify with the single job item');
    return adapter(ctx);
  }
  if (params.phase === 'inventory') return adapter.inventory(ctx);
  const item = job.items.find(x => x.id === params.id);
  if (!item) throw Error('Unknown item id');
  if (params.phase === 'prepare') return adapter.prepare({...ctx, item});
  if (params.phase === 'submit') return adapter.submit({...ctx, item});
  if (params.phase === 'verify') {
    const inventory = await adapter.inventory(ctx);
    const matches = inventory.records.filter(x => x.title === (job.platform === 'wechat' ? item.short_title : item.title));
    if (matches.length !== 1) throw Error('Need exactly one matching saved post; inspect/paginate the inventory before any retry');
    return C.verifyRecord(jobDir, item.id, matches[0], inventory.evidence);
  }
  throw Error('phase must be inventory, prepare, submit or verify');
};
