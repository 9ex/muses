const util = require('util');
const fs = require('fs');

exports.fit = function (promise, fn) {
  if (fn) {
    promise.then(ret => fn(null, ret), err => fn(err));
  } else {
    return promise;
  }
};

exports.fsPromise = {
  appendFile: util.promisify(fs.appendFile),
  chmod: util.promisify(fs.chmod),
  access: util.promisify(fs.access),
  chown: util.promisify(fs.chown),
  close: util.promisify(fs.close),
  copyFile: util.promisify(fs.copyFile),
  fchmod: util.promisify(fs.fchmod),
  fchown: util.promisify(fs.fchown),
  fdatasync: util.promisify(fs.fdatasync),
  fstat: util.promisify(fs.fstat),
  fsync: util.promisify(fs.fsync),
  ftruncate: util.promisify(fs.ftruncate),
  futimes: util.promisify(fs.futimes),
  link: util.promisify(fs.link),
  lstat: util.promisify(fs.lstat),
  mkdir: util.promisify(fs.mkdir),
  mkdtemp: util.promisify(fs.mkdtemp),
  open: util.promisify(fs.open),
  read: util.promisify(fs.read),
  readdir: util.promisify(fs.readdir),
  readFile: util.promisify(fs.readFile),
  readlink: util.promisify(fs.readlink),
  realpath: util.promisify(fs.realpath),
  rename: util.promisify(fs.rename),
  rmdir: util.promisify(fs.rmdir),
  stat: util.promisify(fs.stat),
  symlink: util.promisify(fs.symlink),
  truncate: util.promisify(fs.truncate),
  unlink: util.promisify(fs.unlink),
  utimes: util.promisify(fs.utimes),
  write: util.promisify(fs.write),
  writeFile: util.promisify(fs.writeFile)
};

Object.assign(exports, util);
