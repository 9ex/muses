const debug = require('debug')('muses:message');

const RAW = Symbol('raw');
const HEADERS = Symbol('headers');
const GREEDY = Symbol('greedy');
const TAMPER = Symbol('tamper');
const RESPONDER = Symbol('responder');

class Message {
  constructor(msg) {
    this[RAW] = msg;

    let rawHeaders = msg.rawHeaders;
    let headers = {};
    for (let i = 0; i < rawHeaders.length; i += 2) {
      let name = rawHeaders[i];
      let lname = name.toLowerCase();
      let header = headers[lname];
      if (!header) {
        header = headers[lname] = {
          name,
          values: []
        };
      }
      header.values.push(rawHeaders[i + 1]);
    }
    this[HEADERS] = headers;

    this.httpVersion = msg.httpVersion || '1.1';
    this[GREEDY] = false;
    this[TAMPER] = null;
    this[RESPONDER] = null;
  }

  get _raw() {
    return this[RAW];
  }

  get _socket() {
    return this[RAW].socket;
  }

  /**
   * get header value
   * @param {string} name
   */
  header(name) {
    if (typeof name !== 'string') {
      throw new TypeError('name must be a string');
    }

    let lname = name.toLowerCase();
    let header = this[HEADERS][lname];
    return header ? header.values : undefined;
  }

  /**
   * Check specified name of header is set, case insensitive.
   * @param {string} name
   */
  hasHeader(name) {
    if (typeof name !== 'string') {
      throw new TypeError('name must be a string');
    }

    return name.toLowerCase() in this[HEADERS];
  }

  /**
   * set header value
   * @param {string} name
   * @param {string|string[]} value
   */
  setHeader(name, value) {
    if (typeof name !== 'string') {
      throw new TypeError('name must be a string');
    }

    let headers = this[HEADERS];
    let lname = name.toLowerCase();
    let header = headers[lname];
    if (!header) {
      header = headers[lname] = { name };
    }
    if (typeof value === 'string') {
      header.values = [value];
    } else if (value instanceof Array && value.every(v => typeof v === 'string')) {
      header.values = value;
    } else {
      throw new TypeError('value must be a string or string[]');
    }
  }

  /**
   * append header value
   * @param {string} name
   * @param {string|string[]} value
   */
  appendHeader(name, value) {
    if (typeof name !== 'string') {
      throw new TypeError('name must be a string');
    }

    let headers = this[HEADERS];
    let lname = name.toLowerCase();
    let header = headers[lname];
    if (!header) {
      header = headers[lname] = {
        name,
        values: []
      };
    }
    if (typeof value === 'string') {
      header.values.push(value);
    } else if (value instanceof Array && value.every(v => typeof v === 'string')) {
      header.values = header.values.concat(value);
    } else {
      throw new TypeError('value must be a string or string[]');
    }
  }

  /**
   * get headers
   */
  get headers() {
    let headers = this[HEADERS];
    let result = {};
    for (let key in headers) {
      let header = headers[key];
      let count = header.values.length;
      if (count === 1) {
        result[header.name] = header.values[0];
      } else if (count > 1) {
        result[header.name] = header.values;
      }
    }
    return result;
  }

  get tamper() {
    return this[TAMPER];
  }
  set tamper(fn) {
    if (fn && typeof fn !== 'function') {
      throw new TypeError('tamper must be a function');
    }
    this[TAMPER] = fn || null;
  }

  get responder() {
    return this[RESPONDER];
  }
  set responder(fn) {
    if (fn && typeof fn !== 'function') {
      throw new TypeError('responder must be a function');
    }
    this[RESPONDER] = fn || null;
  }

  get greedy() {
    if (this[TAMPER]) {
      return true;
    } else {
      return this[GREEDY];
    }
  }
  set greedy(val) {
    if (typeof val === 'boolean') {
      this[GREEDY] = val;
    }
  }
}

class Request extends Message {
  constructor(req) {
    super(req);

    let url = getUrl(req);
    this.method = req.method;
    this.secure = url.protocol === 'https:';
    this.pathname = url.pathname;
    this.search = url.search;
    this.host = url.host;
    this.port = +url.port || (req.socket.encrypted ? 443 : 80);
    this.hash = url.hash;
    let hostname = this.hostname = url.hostname;
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      this.hostname = hostname.slice(1, -1);
    }

    Object.defineProperty(this, 'url', {
      value: url
    });
  }

  get _muses() {
    let socket = this._socket;
    return socket._parent ? socket._parent.muses : socket.muses;
  }

  get path() {
    return this.pathname + this.search;
  }

  toRequestOptions() {
    return {
      host: this.host,
      hostname: this.hostname,
      port: this.port,
      method: this.method,
      headers: this.headers,
      path: this.path
    };
  }
}

class Response extends Message {
  constructor(msg, request) {
    super(msg);

    this.statusCode = msg.statusCode;
    this.statusMessage = msg.statusMessage;

    this.request = request instanceof Request ? request : null;
  }
}

function getUrl(req) {
  let rawUrl = req.url;
  let protocol = rawUrl.split('://', 1)[0];
  if (~protocol.indexOf('/')) {
    rawUrl = (req.socket.encrypted ? 'https://' : 'http://') + req.headers.host + rawUrl;
  }
  let url = new URL(rawUrl);
  return url;
}

exports.Message = Message;
exports.Request = Request;
exports.Response = Response;
