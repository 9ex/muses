const assert = require('assert');
const tls = require('tls');
const certutil = require('./certutil');
const LRU = require('lru-cache');

const ROOT_NAME = 'MUSES_ROOT_CA';
const ROOT_DAYS = 365 * 5;
const DEFAULT_DAYS = 14;

class CertCache {
  constructor() {
    Object.defineProperty(this, '_cache', {
      value: new LRU()
    });
    if (arguments.length > 0) {
      this.setRoot(...arguments);
    } else {
      this._root = null;
    }
  }

  /**
   * set root CA
   * @param {Cert} cert
   *
   * set root CA by pem
   * @param {string} certPem
   * @param {string} keyPem
   */
  setRoot(cert) {
    if (arguments.length === 1) {
      assert(cert instanceof certutil.Cert, 'invalid cert');
      this._root = cert;
    } else if (arguments.length === 2) {
      let certPem = arguments[0];
      let keyPem = arguments[1];
      this._root = certutil.loadPem(certPem, keyPem);
    } else {
      throw new Error('invalid arguments');
    }
  }

  getRoot() {
    if (!this._root) {
      this._root = certutil.makeCa(ROOT_NAME, ROOT_DAYS);
    }
    return this._root;
  }

  get(commonName) {
    assert(commonName && typeof commonName === 'string', 'invalid commonName');

    let ctx = this._cache.get(commonName);
    if (!ctx) {
      let cert = this.getRoot().issue(commonName, DEFAULT_DAYS);
      ctx = tls.createSecureContext(cert.pem());
      this._cache.set(commonName, ctx);
    }

    return ctx;
  }
}

module.exports = CertCache;
