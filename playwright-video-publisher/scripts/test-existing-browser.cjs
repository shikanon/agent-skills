'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {connectExisting}=require('./existing-browser.cjs');
const {chromium}=require(process.env.MEDIA_PLAYWRIGHT_MODULE || 'playwright');
test('reject nonlocal endpoints before connecting',async()=>{await assert.rejects(connectExisting(chromium,'http://example.com:9222'),/local/);});
test('shared disconnect preserves original browser and page',async()=>{
 const owner=await chromium.launch({headless:true,args:['--remote-debugging-port=19228']});
 try{const context=await owner.newContext();const p=await context.newPage();await p.goto('data:text/html,<title>Preserve me</title>');const shared=await connectExisting(chromium,'http://127.0.0.1:19228');await shared.disconnect();assert(owner.isConnected());assert(!p.isClosed());assert.equal(await p.title(),'Preserve me');}finally{await owner.close();}
});
