'use strict';
// The human must explicitly authorize reusing their running Chrome first.
async function connectExisting(chromium, endpoint = 'chrome') {
  if (endpoint !== 'chrome') {
    const u = new URL(endpoint);
    if (!['http:','ws:'].includes(u.protocol) || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) || u.username || u.password) throw Error('Existing browser endpoint must be local');
  }
  const browser = await chromium.connectOverCDP(endpoint, {noDefaults: true, timeout: 30000});
  const context = browser.contexts()[0];
  if (!context) { await browser.close(); throw Error('Existing Chrome has no browser context'); }
  // For connectOverCDP, browser.close disconnects its transport. Never close the shared context.
  return {browser, context, disconnect: () => browser.close()};
}
module.exports = {connectExisting};
