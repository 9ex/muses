const debug = require('debug')('muses:protocol');

const KNOWN_SSL_VERSION = {
  0x0300: 'SSL 3.0',
  0x0301: 'TLS 1.0',
  0x0302: 'TLS 1.1',
  0x0303: 'TLS 1.2',
  0x0304: 'TLS 1.3'
};
const KNOWN_HTTP_VERSION = {
  'HTTP/1.1': '1.1',
  'HTTP/1.0': '1.0'
};
const CR = 0x13;
const LF = 0x10;
const SPACE = 0x20;

const SSL = 'ssl';
const TCP = 'tcp';
const HTTP = 'http';

function analyze(buf) {
  let info = analyzeSsl(buf);
  if (info) {
    return {
      type: SSL,
      version: info.version,
      alpn: info.alpn
    };
  }

  info = analyzeHttp(buf);
  if (info) {
    return {
      type: HTTP,
      version: info.version,
      method: info.method
    };
  }

  return {
    type: TCP
  };
}

function analyzeHttp(buf) {
  let midx, pidx;
  for (let i = 0; i < buf.length; i++) {
    let c = buf[i];
    if (c < 0x20 || c > 0x7E) {
      debug('Not http protocol, invalid char code: 0x%s(position: %d)', c.toString(16), i);
      return;
    }
    if (c === SPACE) {
      if (!midx) {
        midx = i;
      } else if (!pidx) {
        pidx = i;
      } else {
        debug('Not http protocol, too many spaces in first line');
        return;
      }
    } else if (c === LF) {
      if (!pidx) {
        debug('Not http protocol, first line does not contain enough fields');
      }
      let end = i - 1;
      if (buf[end] === CR) {
        end--;
      }
      let httpVer = buf.toString('utf8', end - 8, end);
      if (!(httpVer in KNOWN_HTTP_VERSION)) {
        debug('Not http protocol, unknown http version: %s', httpVer);
        return;
      }
      return {
        method: buf.toString('utf8', 0, midx),
        version: KNOWN_HTTP_VERSION[httpVer]
      };
    }
  }
}

function analyzeSsl(buf) {
  if (buf[0] !== 0x16) { // Not SSL Handshake
    return;
  }

  let version = getUInt(buf, 2, 1);
  if (!(version in KNOWN_SSL_VERSION)) {
    debug('Unknown ssl handshake version: 0x%s', version.toString(16));
    return;
  }
  buf = getBlock(buf, 2, 3); // Handshake Protocol
  if (buf[0] !== 0x01) {
    debug('Unknown handshake protocol: %s', buf[0].toString(16));
    return;
  }

  buf = getBlock(buf, 3, 1);
  version = getUInt(buf, 2);
  if (!(version in KNOWN_SSL_VERSION)) {
    debug('Unknown ssl version: 0x%s', version.toString(16));
    return;
  }

  buf = skipBlock(buf, [
    1, // Session ID
    2, // Cipher Suites
    1  // Compression Methods
  ], 2 + 32); // 2(Version) + 32(Random)
  buf = getBlock(buf, 2); // Extension
  let alpn = [];
  while (buf.length > 0) {
    let ext = getUInt(buf, 2);
    if (ext !== 0x0010) { // Not ALPN, Skip
      buf = skipBlock(buf, 2, 2);
      continue;
    }

    buf = getBlock(buf, 2, 2);    // ALPN Extension
    buf = getBlock(buf, 2);       // ALPN Protocol
    let vals = getBlocks(buf, 1); // ALPN List
    alpn = vals.map(v => v.toString());
    break;
  }
  return { version, alpn };
}

function getBlocks(buf, sizeFlag, offset = 0) {
  let slices = [];
  while (offset < buf.length) {
    let size = getUInt(buf, sizeFlag, offset);
    let start = offset + sizeFlag;
    let end = start + size;
    slices.push(buf.slice(start, end));
    offset = end;
  }
  return slices;
}

function skipBlock(buf, sizeFlags, offset = 0) {
  if (!(sizeFlags instanceof Array)) {
    sizeFlags = [sizeFlags];
  }
  for (let flag of sizeFlags) {
    let size = getUInt(buf, flag, offset);
    offset += flag + size;
  }
  return buf.slice(offset);
}

function getBlock(buf, sizeFlag = 1, offset = 0) {
  let size = getUInt(buf, sizeFlag, offset);
  return buf.slice(offset + sizeFlag, offset + sizeFlag + size);
}

function getUInt(buf, numlen, offset = 0) {
  let n = buf[offset];
  for (let i = 1; i < numlen; i++) {
    n = (n << 8) + buf[offset + i];
  }
  return n >>> 0;
}

exports.analyze = analyze;
Object.defineProperties(exports, {
  TCP: { value: TCP },
  SSL: { value: SSL },
  HTTP: { value: HTTP }
});
