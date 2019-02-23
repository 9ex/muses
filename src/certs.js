const assert = require('assert');
const certutil = require('./certutil');
const LRU = require('lru-cache');

const ROOT_NAME = 'MUSES_ROOT_CA';
const ROOT_DAYS = 365 * 5;
const DEFAULT_DAYS = 14;
const cache = new LRU();
let root = null;

function setRoot(cert) {
  assert(cert instanceof certutil.Cert, 'invalid cert');

  root = cert;
}

function getRoot() {
  if (!root) {
    root = certutil.makeCa(ROOT_NAME, ROOT_DAYS);
  }
  return root;
}

function get(commonName) {
  assert(commonName && typeof commonName === 'string', 'invalid commonName');

  let cert = cache.get(commonName);
  if (!cert) {
    cert = getRoot().issue(commonName, DEFAULT_DAYS);
    cache.set(commonName, cert);
  }

  return cert;
}

exports.get = get;
exports.setRoot = setRoot;
exports.getRoot = getRoot;
