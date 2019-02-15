const ProxyAgent = require('proxy-agent');

(() => {
  const PAC_LOCAL_CACHE_TIME = 120 * 1000;
  const PacProxyAgent = require('pac-proxy-agent');
  const NOTMODIFIED = new Error('Pac file from local cache.');
  NOTMODIFIED.code = 'ENOTMODIFIED';
  let loadPacFile = PacProxyAgent.prototype.loadPacFile;
  PacProxyAgent.prototype.loadPacFile = function (fn) {
    let self = this;
    if (self._pacLoadTime) {
      if (Date.now() - self._pacLoadTime < PAC_LOCAL_CACHE_TIME) {
        fn(NOTMODIFIED);
        return;
      }
    }
    loadPacFile.call(self, (err, code) => {
      if (!err) {
        self._pacLoadTime = Date.now();
      }
      fn(err, code);
    });
  };
})();

class Agent extends ProxyAgent {
  constructor() {
    
  }
}

exports.Agent = Agent;
