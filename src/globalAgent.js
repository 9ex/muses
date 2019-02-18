const ProxyAgent = require('proxy-agent');
const http = require('http');
const net = require('net');
let agent = ProxyAgent();

function clearProxy() {
  setProxy();
}

function setProxy(opts) {
  agent = ProxyAgent(opts);
}

function hasProxy() {
  return !!agent.proxy;
}

function getAgent() {
  return agent;
}

function connect(hostname, port) {
  return new Promise((resolve, reject) => {
    if (hasProxy()) {
      let options = { path: '/', host: hostname, port };
      let req = http.request(options);
      agent.callback(req, options, (err, socket) => {
        if (err) {
          reject(err);
        } else {
          resolve(socket);
        }
      });
    } else {
      let socket = net.connect({
        host: hostname,
        port: port
      }, () => resolve(socket));
      socket.on('error', reject);
    }
  });
}

// patch for pac-proxy-agent, add local cache
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

exports.clearProxy = clearProxy;
exports.setProxy = setProxy;
exports.hasProxy = hasProxy;
exports.getAgent = getAgent;
exports.connect = connect;
