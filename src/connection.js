const assert = require('assert');
const { Request, Response } = require('./message');

const REQUEST = Symbol('session.request');
const RESPONSE = Symbol('session.response');
const CONNECTION = Symbol('session.connection');
const SESSIONS = Symbol('session.');

class Session {
  constructor(conn) {
    assert(conn instanceof Connection, 'conn muse be Connection');

    this[CONNECTION] = conn;
    this[REQUEST] = new Request(this);
    this[RESPONSE] = new Response(this);
  }

  get connection() {
    return this[CONNECTION];
  }

  get request() {
    return this[REQUEST];
  }

  get response() {
    return this[RESPONSE];
  }

  initRequest(req) {
    return this[REQUEST].init(req);
  }

  initResponse(res) {
    return this[RESPONSE].init(res);
  }
}

class Connection {
  constructor(socket) {
    this[SESSIONS] = [];
  }

  newSession() {
    let session = new Session(this);
    this[SESSIONS].push(session);
    return session;
  }

  * sessions() {
    for (let session of this[SESSIONS]) {
      yield session;
    }
  }
}

module.exports = exports = Connection;
exports.Session = Session;
