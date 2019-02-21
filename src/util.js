const util = require('util');

exports.fit = function (promise, fn) {
  if (fn) {
    promise.then(ret => fn(null, ret), err => fn(err));
  } else {
    return promise;
  }
};

Object.assign(exports, util);
