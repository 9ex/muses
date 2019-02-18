const http = require('http');
const EventEmitter = require('events');
const requestHandler = require('./handler/request');
const connectHandler = require('./handler/connect');

const DEFAULT_TIMEOUT = 2 * 3600 * 1000;

const SERVER = Symbol('proxy.server');

/**
 * core service
 */
class Proxy extends EventEmitter {
  /**
   * @type {number}
   * @readonly
   */
  address() {
    let server = this[SERVER];
    return server && server.address();
  }

  /**
   * @type {bool}
   * @readonly
   */
  get listening() {
    let server = this[SERVER];
    return server && server.listening;
  }

  /**
   * Starts the service listening for connections
   */
  listen(port = 0, host, done) {
    if (this.listening) {
      done && done(new Error('This instance has already started.'));
      return;
    }
    try {
      let server = http.createServer()
        .on('request', requestHandler.bind(undefined, this))
        .on('connect', connectHandler.bind(undefined, this))
        .on('clientError', (err, socket) => {
          this.emit('error', err);
          socket && socket.end();
        })
        .on('connection', socket => {
          socket.setNoDelay();
        });
      server.timeout = DEFAULT_TIMEOUT;
      server.listen({ port, host }, () => done && done(null, server.address()));
      this[SERVER] = server;
    } catch (err) {
      done && done(err);
    }
  }

  assignHttpRequest() {
    throw new Error('assignHttpRequest Not Implemented');
  }

  assignHttpsRequest() {
    throw new Error('assignHttpsRequest Not Implemented');
  }

  /**
   * Stops service from accepting new connections and keeps existing connections.
   */
  close(done) {
    if (!this.listening) {
      done && done(new Error('Proxy isn\'t started'));
    }
    this[SERVER].close(err => {
      if (err) {
        done && done(err);
      } else {
        delete this[SERVER];
        done && done();
      }
    });
  }
}

module.exports = Proxy;
