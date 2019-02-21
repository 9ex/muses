const util = require('util');
const fs = require('fs');

exports.fit = function (promise, fn) {
  if (fn) {
    promise.then(ret => fn(null, ret), err => fn(err));
  } else {
    return promise;
  }
};

exports.stat = util.promisify(fs.stat);

exports.readFile = util.promisify(fs.readFile);

exports.writeFile = util.promisify(fs.writeFile);

Object.assign(exports, util);
