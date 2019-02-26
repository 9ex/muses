const assert = require('assert');
const { Incoming, Outgoing } = require('./message');

const INCOMING = Symbol('session.incoming');
const OUTGOING = Symbol('session.outgoing');
const CONNECTION = Symbol('session.connection');
const SESSIONS = Symbol('session.');

class Session {
  constructor(conn) {
    assert(conn instanceof Connection, 'conn muse be Connection');

    this[CONNECTION] = conn;
    this[INCOMING] = new Incoming(this);
    this[OUTGOING] = new Outgoing(this);
  }

  get connection() {
    return this[CONNECTION];
  }

  get incoming() {
    return this[INCOMING];
  }

  get outgoing() {
    return this[OUTGOING];
  }

  initIncoming(req) {
    return this[INCOMING].init(req);
  }

  initOutgoing(res) {
    return this[OUTGOING].init(res);
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
