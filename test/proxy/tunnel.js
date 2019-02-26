const tcp = require('../helper/tcpagent');
const Proxy = require('../../src/proxy');
const assert = require('assert');

describe('proxy.tunnel', () => {
  it('tcp stream must be properly proxied', async () => {
    let { clientReceived, serverReceived } =
    await tcp(new Proxy())
      .send('Hello Rex')
      .reply('Hello World')
      .done();

    assert(clientReceived.text, 'Hello World');
    assert(serverReceived.text, 'Hello Rex');
  });
});
