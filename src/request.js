const http = require('http');
const https = require('https');
const debug = require('debug')('muses:request');
const ReadableStream = require('stream').Readable;
const Outgoing = require('./message').Outgoing;

const REQUEST_TIMEOUT = 3600 * 1000;
const MAX_BUFFER_SIZE = 4 * 1024 * 1024;

async function handler(proxy, request, response) {
  try {
    await receive({
      proxy,
      session: request.session,
      request,
      response
    });
  } catch (err) {
    debug('error occurred: %s', err);

    if (!response.headersSent) {
      response.writeHead(502, 'Proxy Error');
      response.end(err.stack);
    }
  }
}

async function receive(ctx) {
  let incoming = ctx.session.initIncoming(ctx.request);
  debug('received request: %s', incoming.url);
  ctx.proxy.emit('request', incoming);

  let {
    outgoing,
    outBody,
    srcBody
  } = await executeExtensions(incoming);
  if (outgoing) {
    reply(ctx, outgoing, outBody);
  } else {
    await invoke(ctx, incoming, srcBody);
  }
}

async function invoke(ctx, incoming, reqBody) {
  if (reqBody !== undefined && incoming.hasHeader('Content-Length')) {
    incoming.setHeader('Content-Length', Buffer.byteLength(reqBody).toString());
  }
  let proto = incoming.secure ? https : http;
  let options = incoming.toRequestOptions();
  let socket = incoming.connection.remoteSocket;
  if (socket) {
    debug('reuse remote socket: %s:%d', socket.remoteAddress, socket.remotePort);
    options.createConnection = () => socket;
  }
  let replies = await sendRequest(proto, options, reqBody || incoming._raw);
  let outgoing = ctx.session.initOutgoing(replies);
  ctx.proxy.emit('response', outgoing);

  let {
    outgoing: res,
    outBody,
    srcBody
  } = await executeExtensions(outgoing);
  reply(ctx, res || outgoing, outBody || srcBody);
}

function reply(ctx, outgoing, body) {
  let response = ctx.response;
  if (outgoing.statusMessage) {
    response.statusMessage = outgoing.statusMessage;
  }
  if (body !== undefined && outgoing.hasHeader('Content-Length')) {
    outgoing.setHeader('Content-Length', Buffer.byteLength(body).toString());
  }
  response.writeHead(outgoing.statusCode, outgoing.headers);
  if (body !== undefined) {
    response.end(body);
  } else {
    outgoing._raw.pipe(response);
  }
}

async function executeExtensions(msg) {
  let outgoing;
  let outBody;
  let srcBody;

  if (msg.greedy) {
    srcBody = await readAll(msg._raw, MAX_BUFFER_SIZE);
  }
  if (msg.tamper) {
    let ret = await msg.tamper(srcBody, msg);
    if (typeof ret === 'string' || ret instanceof Buffer) {
      srcBody = ret;
    }
  }
  if (msg.responder) {
    let ret = await msg.responder(srcBody, msg);
    if (ret && typeof ret === 'object') {
      outgoing = msg.session.initOutgoing({
        headers: ret.headers || {},
        statusCode: ret.statusCode || 200
      });

      if (typeof ret.body === 'string' || ret.body instanceof Buffer) {
        outBody = ret.body;
      } else {
        outBody = '';
      }
    }
  }
  return {
    res: outgoing,
    outBody,
    srcBody
  };
}

function sendRequest(proto, options, data) {
  return new Promise((resolve, reject) => {
    let req = proto.request(options, resolve);
    req.setNoDelay();
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT, () => reject(new Error('Request timeout')));
    if (typeof data === 'string' || data instanceof Buffer) {
      req.end(data);
    } else if (data instanceof ReadableStream) {
      data.pipe(req);
    } else {
      req.end();
    }
  });
}

function readAll(stream, sizeLimit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let chunks = [];
    stream.on('data', d => {
      size += d.length;
      if (size > sizeLimit) {
        reject(new Error(''));
        return;
      }
      chunks.push(d);
    });
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

exports.handler = handler;
