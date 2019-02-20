const forge = require('node-forge');
const pki = forge.pki;

const KEY_BITS = 1024;
const SUBJECT = {
  emailAddress: 'dev@rex.cc',
  countryName: 'CN',
  stateOrProvinceName: 'GuangDong',
  localityName: 'ShenZhen',
  organizationName: 'muses',
  organizationalUnitName: 'muses'
};

class CA {
  issue(commonName, caCertPem, caKeyPem) {
    issue();
  }
}

function issue(issuer, commonName, altNames) {
  let keyPair = pki.rsa.generateKeyPair(KEY_BITS);
  let subject = [];
  for (let name in SUBJECT) {
    subject.push({
      name,
      value: SUBJECT[name]
    });
  }
  subject.push({
    name: 'commonName',
    value: commonName
  });

  let cert = pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  cert.setSubject(subject);
  if (altNames) {
    cert.setExtensions([{
      name: 'subjectAltName',
      altNames: altNames.map(value => ({ type: 2, value }))
    }]);
  }
  cert.setIssuer((issuer ? issuer.cert : cert).subject.attributes);
  cert.sign(issuer ? issuer.key : keyPair.privateKey, forge.md.sha256.create());

  return {
    cert: cert,
    key: keyPair.privateKey,
    pem: {
      cert: pki.certificateToPem(cert),
      key: pki.privateKeyToPem(keyPair.privateKey)
    }
  };
}

exports.CA = CA;
