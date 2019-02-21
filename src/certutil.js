const assert = require('assert');
const util = require('./util');
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

class Cert {
  constructor(certPem, keyPem, cert, key) {
    assert(typeof certPem === 'string' || certPem instanceof Buffer, 'certPem must be string or Buffer');
    assert(typeof keyPem === 'string' || keyPem instanceof Buffer, 'keyPem must be string or Buffer');
    assert(!cert || 'subject' in cert, 'cert must be null or Certificate');
    assert(!key || 'sign' in key, 'key must be null or PrivateKey');

    this[CERT] = cert || pki.certificateFromPem(certPem);
    this[KEY] = key || pki.privateKeyFromPem(keyPem);
    this[PEM] = {};
    Object.defineProperties(this[PEM], {
      cert: { value: certPem, enumerable: true },
      key: { value: keyPem, enumerable: true }
    });
  }

  get cert() {
    return this[CERT];
  }

  get key() {
    return this[KEY];
  }

  get pem() {
    return this[PEM];
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
    let promise = Promise.all([
      util.writeFile(certFile, this.pem.cert),
      util.writeFile(keyFile, this.pem.key)
    ]).then(() => this);
    return util.fit(promise, fn, true);
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

  return new Cert(
    pki.certificateToPem(cert),
    pki.privateKeyToPem(keyPair.privateKey),
    cert,
    keyPair.privateKey
  );
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
  let promise = Promise.all([util.readFile(certFile), util.readFile(keyFile)])
    .then(files => new Cert(files[0], files[1]));
  return util.fit(promise, fn);
}

function loadPem(certPem, keyPem) {
  return new Cert(certPem, keyPem);
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
exports.makeCa = makeCa;
exports.load = load;
exports.loadPem = loadPem;
exports.setDefaultSubject = setDefaultSubject;
