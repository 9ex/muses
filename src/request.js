const http = require('http');
const https = require('https');
const debug = require('debug')('muses:request');
const ReadableStream = require('stream').Readable;

const REQUEST_TIMEOUT = 3600 * 1000;
const MAX_BUFFER_SIZE = 4 * 1024 * 1024;

async function handler(proxy, reader, writer) {
  try {
    await receive({
      proxy,
      session: reader.session,
      reader,
      writer
    });
  } catch (err) {
    debug('error occurred: %s', err);

    if (!writer.headersSent) {
      writer.writeHead(502, 'Proxy Error');
      writer.end(err.stack);
    }
  }
}

async function receive(ctx) {
  let req = ctx.session.initRequest(ctx.reader);
  debug('received request: %s', req.url);
  ctx.proxy.emit('request', req);

  let {
    res,
    resBody,
    srcBody
  } = await executeExtensions(req);
  if (res) {
    reply(ctx, res, resBody);
  } else {
    await invoke(ctx, req, srcBody);
  }
}

async function invoke(ctx, req, reqBody) {
  if (reqBody !== undefined && req.hasHeader('Content-Length')) {
    req.setHeader('Content-Length', Buffer.byteLength(reqBody).toString());
  }
  let proto = req.secure ? https : http;
  let options = req.toRequestOptions();
  let socket = req.connection.remoteSocket;
  if (socket) {
    debug('reuse remote socket: %s:%d', socket.remoteAddress, socket.remotePort);
    options.createConnection = () => socket;
  }
  let replier = await sendRequest(proto, options, reqBody || req._raw);
  let res = ctx.session.initResponse(replier);
  ctx.proxy.emit('response', res);

  let {
    res: res2,
    resBody,
    srcBody
  } = await executeExtensions(res);
  reply(ctx, res2 || res, resBody || srcBody);
}

function reply(ctx, res, body) {
  let writer = ctx.writer;
  if (res.statusMessage) {
    writer.statusMessage = res.statusMessage;
  }
  if (body !== undefined && res.hasHeader('Content-Length')) {
    res.setHeader('Content-Length', Buffer.byteLength(body).toString());
  }
  writer.writeHead(res.statusCode, res.headers);
  if (body !== undefined) {
    writer.end(body);
  } else {
    res._raw.pipe(writer);
  }
}

async function executeExtensions(msg) {
  let res;
  let resBody;
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
      if (!ret.headers) {
        ret.headers = {};
      }
      if (!ret.statusCode) {
        ret.statusCode = 200;
      }
      res = new Response(ret);
      if (typeof ret.body === 'string' || ret.body instanceof Buffer) {
        resBody = ret.body;
      } else {
        resBody = '';
      }
    }
  }
  return {
    res,
    resBody,
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
