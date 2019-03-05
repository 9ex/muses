const assert = require('assert');
const util = require('./util');
const LRU = require('lru-cache');
const tls = require('tls');
const fs = util.fsPromise;
const forge = require('node-forge');
const pki = forge.pki;

const KEY_BITS = 1024;
const DEFAULT_SUBJECT = {
  emailAddress: 'dev@rex.cc',
  countryName: 'CN',
  stateOrProvinceName: 'GuangDong',
  localityName: 'ShenZhen',
  organizationName: 'muses',
  organizationalUnitName: 'muses'
};

const CERT = Symbol('cert.cert');
const KEY = Symbol('cert.key');
const PEM = Symbol('cert.pem');

const ROOT_NAME = 'MUSES_ROOT_CA';
const ROOT_DAYS = 365 * 5;
const DEFAULT_DAYS = 14;

class Cert {
  constructor(cert, key) {
    assert(!cert || 'subject' in cert, 'cert must be null or Certificate');
    assert(!key || 'sign' in key, 'key must be null or PrivateKey');

    this[CERT] = cert;
    this[KEY] = key;
    this[PEM] = null;
  }

  get cert() {
    return this[CERT];
  }

  get key() {
    return this[KEY];
  }

  pem() {
    let pem = this[PEM];
    if (!pem) {
      pem = this[PEM] = {
        cert: pki.certificateToPem(this[CERT]),
        key: pki.privateKeyToPem(this[KEY])
      };
    }
    return {
      cert: pem.cert,
      key: pem.key
    };
  }

  issue(commonName, days, altNames) {
    assert(!altNames || altNames instanceof Array, 'altNames must be null or string[]');
    if (altNames) {
      if (!~altNames.indexOf(commonName)) {
        altNames = [commonName].concat(altNames);
      }
    } else {
      altNames = [commonName];
    }

    return makeCert(this, commonName, days, altNames);
  }

  save(certFile, keyFile, fn) {
    let pem = this.pem();
    let promise = Promise.all([
      fs.writeFile(certFile, pem.cert),
      fs.writeFile(keyFile, pem.key)
    ]).then(() => this);

    return util.fit(promise, fn);
  }
}

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
      assert(cert instanceof Cert, 'invalid cert');
      this._root = cert;
    } else if (arguments.length === 2) {
      let certPem = arguments[0];
      let keyPem = arguments[1];
      this._root = loadPem(certPem, keyPem);
    } else {
      throw new Error('invalid arguments');
    }
  }

  getRoot() {
    if (!this._root) {
      this._root = makeCa(ROOT_NAME, ROOT_DAYS);
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

function makeCert(issuer, commonName, days, altNames) {
  assert(!issuer || issuer instanceof Cert, 'issuer must be null or Cert');
  assert(typeof commonName === 'string', 'commonName must be string');
  assert(Number.isInteger(days) && days > 0, 'days must be integer and greater than 0');
  assert(!altNames || (altNames instanceof Array && altNames.every(s => typeof s === 'string')),
    'altNames must be null or string[]');

  let keyPair = pki.rsa.generateKeyPair(KEY_BITS);

  let cert = createCertificate(commonName, days, altNames);
  cert.publicKey = keyPair.publicKey;

  if (!issuer) {
    issuer = {
      cert: cert,
      key: keyPair.privateKey
    };
  }
  cert.setIssuer(issuer.cert.subject.attributes);
  cert.sign(issuer.key, forge.md.sha256.create());

  return new Cert(cert, keyPair.privateKey);
}

function createCertificate(commonName, days, altNames) {
  let subject = [];
  for (let name in DEFAULT_SUBJECT) {
    subject.push({
      name,
      value: DEFAULT_SUBJECT[name]
    });
  }
  subject.push({
    name: 'commonName',
    value: commonName
  });

  let cert = pki.createCertificate();
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);
  cert.setSubject(subject);
  if (altNames) {
    cert.setExtensions([{
      name: 'subjectAltName',
      altNames: altNames.map(value => ({ type: 2, value }))
    }]);
  }

  return cert;
}

function load(certFile, keyFile, fn) {
  let promise = Promise.all([
    fs.readFile(certFile),
    fs.readFile(keyFile)
  ]).then(files => loadPem(files[0], files[1]));
  return util.fit(promise, fn);
}

function loadPem(certPem, keyPem) {
  let cert = pki.certificateFromPem(certPem);
  let key = pki.privateKeyFromPem(keyPem);
  return new Cert(cert, key);
}

function makeCa(commonName, days) {
  return makeCert(null, commonName, days);
}

function setDefaultSubject(name, value) {
  assert(name in DEFAULT_SUBJECT, `can't set default subject with name: ${name}`);
  assert(typeof value === 'string', 'value must be string');

  DEFAULT_SUBJECT[name] = value;
}

exports.Cert = Cert;
exports.CertCache = CertCache;
exports.makeCa = makeCa;
exports.load = load;
exports.loadPem = loadPem;
exports.setDefaultSubject = setDefaultSubject;
