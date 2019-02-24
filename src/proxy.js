const assert = require('assert');
const http = require('http');
const https = require('https');
const tls = require('tls');
const EventEmitter = require('events');
const debug = require('debug')('muses:proxy');
const CertCache = require('./cert_cache');
const requestHandler = require('./request').handler;
const connectHandler = require('./connect').handler;

const DEFAULT_TIMEOUT = 2 * 3600 * 1000;
const SERVER = Symbol('proxy.server');
const HTTPS_SERVER = Symbol('proxy.httpsServer');
const DECRYPT_HTTPS = Symbol('proxy.decryptHttps');

/**
 * core service
 */
class Proxy extends EventEmitter {
  constructor(options) {
    super();

    let certCache;
    if (options) {
      assert(typeof options === 'object', 'options should be object');
      if (options.ca) {
        certCache = new CertCache(options.ca);
      } else if (options.certPem && options.keyPem) {
        certCache = new CertCache(options.caCertPem, options.caKeyPem);
      }
    } else {
      certCache = new CertCache();
    }

    this[SERVER] = createServer(this, http);

    let ca = certCache.getRoot();
    let httpsOptions = ca.pem();
    httpsOptions.SNICallback = SNICallback.bind(undefined, certCache);
    this[HTTPS_SERVER] = createServer(this, https, httpsOptions);
    this[DECRYPT_HTTPS] = new DecryptHttpsOptions();
  }

  get decryptHttps() {
    return this[DECRYPT_HTTPS];
  }

  shouldDecryptHttps(hostname, port) {
    return this.decryptHttps.hit(hostname, port);
  }

  /**
   * @type {number}
   * @readonly
   */
  address() {
    return this[SERVER].address();
  }

  /**
   * @type {bool}
   * @readonly
   */
  get listening() {
    return this[SERVER].listening;
  }

  /**
   * Starts the service listening for connections
   */
  listen(port = 0, host, done) {
    if (this.listening) {
      done && done(new Error('This instance has already started.'));
      return;
    }
    try {
      this[SERVER].listen({ port, host }, () => done && done(null, this.address()));
    } catch (err) {
      done && done(err);
    }
  }

  assignHttpRequest(clientSocket, remoteSocket, buf) {
    debug('assign http request: %s:%d', remoteSocket.remoteAddress, remoteSocket.remotePort);
    clientSocket.muses.remoteSocket = remoteSocket;
    this[SERVER].emit('connection', clientSocket);
    if (buf) {
      clientSocket.unshift(buf);
    }
  }

  assignHttpsRequest(hostname, clientSocket, remoteSocket, buf) {
    debug('assign https request: %s:%d', remoteSocket.remoteAddress, remoteSocket.remotePort);

    let tlssock = new tls.TLSSocket(remoteSocket, {
      secureContext: tls.createSecureContext({
        rejectUnauthorized: true,
        ciphers: tls.DEFAULT_CIPHERS,
        checkServerIdentity: tls.checkServerIdentity,
        minDHSize: 1024
      }),
      isServer: false,
      requestCert: true,
      rejectUnauthorized: true
    });
    tlssock._releaseControl();
    tlssock.setServername(hostname);
    clientSocket.muses.remoteSocket = tlssock;
    this[HTTPS_SERVER].emit('connection', clientSocket);
    if (buf) {
      clientSocket.unshift(buf);
    }
  }

  /**
   * Stops service from accepting new connections and keeps existing connections.
   */
  close(done) {
    if (!this.listening) {
      done && done(new Error('Proxy isn\'t started'));
    }
    this[SERVER].close(err => {
      if (err) {
        done && done(err);
      } else {
        done && done();
      }
    });
  }
}

class DecryptHttpsOptions {
  constructor() {
    this._enabled = false;
    this._filterMode = 'exclude';
    this._hosts = [];
    this._hostsRegex = [];
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    assert(typeof val === 'boolean', 'enabled must be boolean');
    this._enabled = val;
  }

  get filterMode() {
    return this._filterMode;
  }
  set filterMode(mode) {
    assert(mode !== DecryptHttpsOptions.INCLUDE && mode !== DecryptHttpsOptions.EXCLUDE,
      'filterMode must be "include" or "exclude"');
    this._filterMode = mode;
  }

  get hosts() {
    return this._hosts;
  }
  set hosts(val) {
    assert(Array.isArray(val), 'hosts must be string[]');
    assert(val.forEach(i => typeof i === 'string'), 'hosts must be string[]');

    this._hosts = val;
    this._hostsRegex = val.map(i => {
      let pattern = '^' + i.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*') + '$';
      return new RegExp(pattern, 'i');
    });
  }

  hit(hostname, port) {
    assert(typeof hostname === 'string', 'hostname must be string');
    assert(Number.isInteger(port), 'port must be interger');

    if (!this.enabled) {
      return false;
    }
    let host = `${hostname}:${port}`;
    let matched = this._hostsRegex.some(r => r.test(hostname) || r.test(host));
    if (matched) {
      return this.filterMode === DecryptHttpsOptions.INCLUDE;
    } else {
      return this.filterMode === DecryptHttpsOptions.EXCLUDE;
    }
  }
}

function createServer(proxy, protocol, options) {
  let server = options
    ? protocol.createServer(options)
    : protocol.createServer();

  server.on('request', requestHandler.bind(undefined, proxy))
    .on('connect', connectHandler.bind(undefined, proxy))
    .on('clientError', (_, socket) => socket && socket.end())
    .on('connection', socket => {
      if (!socket.muses) {
        socket.setNoDelay();
        Object.defineProperty(socket, 'muses', { value: {} });
        socket.once('error', err => {
          debug('client socket encounter an error: %s %s', err.code, err.message);
        });
      }
    });
  server.timeout = DEFAULT_TIMEOUT;
  return server;
}

function SNICallback(certCache, servername, cb) {
  cb(null, certCache.get(servername));
}

DecryptHttpsOptions.INCLUDE = 'include';
DecryptHttpsOptions.EXCLUDE = 'exclude';

module.exports = Proxy;
