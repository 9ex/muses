const trans = require('../helper/transagent');
const Proxy = require('../../src/proxy');
const assert = require('assert');

describe('proxy.header.modify', () => {
  it('modify request & response headers', async () => {
    let proxy = new Proxy();
    proxy.on('incoming', ic => ic.setHeader('X-Req-Key', 'xyz'));
    proxy.on('outgoing', og => og.setHeader('X-Res-Key', '123'));

    let { clientReceived, serverReceived } =
    await trans(proxy)
      .get('/proxy/modify-headers')
      .reply('ok');

    assert.strictEqual(serverReceived.headers['X-Req-Key'], 'xyz');
    assert.strictEqual(clientReceived.headers['X-Res-Key'], '123');
  });
});
