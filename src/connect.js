const agent = require('./global_agent');
const protocol = require('./protocol');
const debug = require('debug')('muses:connect');

async function handler(proxy, request, clientSocket, head) {
  try {
    let { hostname, port } = new URL(`http://${request.url}`);
    port = +port || 443;
    let remoteSocket = await createRemoteSocket(port, hostname);
    debug('remote socket created: %s:%d', remoteSocket.remoteAddress, remoteSocket.remotePort);
    writeEstablished(clientSocket);

    if (proxy.shouldDecryptHttps(hostname, port)) {
      debug('%s:%d decrypting https', hostname, port);

      clientSocket.once('data', buf => {
        clientSocket.pause();
        let proto = protocol.analyze(buf);
        if (proto.type === protocol.HTTP) {
          proxy.assignHttpRequest(clientSocket, remoteSocket, buf);
        } else if (proto.type === protocol.SSL && ~proto.alpn.indexOf('http/1.1')) {
          proxy.assignHttpsRequest(clientSocket, remoteSocket, buf);
        } else {
          pipe(clientSocket, remoteSocket, buf);
        }
        clientSocket.resume();
      });
    } else {
      debug('do not decrypt https, %s:%d<=>%s:%d piping...',
        clientSocket.remoteAddress, clientSocket.remotePort,
        remoteSocket.remoteAddress, remoteSocket.remotePort);

      pipe(clientSocket, remoteSocket, head);
    }
  } catch (err) {
    debug('error occurred: %s %s', err.code, err.message);
    writeError(clientSocket, err);
  }
}

function pipe(clientSocket, remoteSocket, buf) {
  if (buf) {
    remoteSocket.write(buf);
  }
  clientSocket.once('error', err => {
    debug('client socket error: %s %s', err.code, err.message);
    remoteSocket.destroy();
  });
  remoteSocket.once('error', err => {
    debug('remote socket error: %s %s', err.code, err.message);
    remoteSocket.destroy();
  });
  clientSocket.pipe(remoteSocket).pipe(clientSocket);
}

async function createRemoteSocket(port, hostname) {
  let remoteSocket = await agent.connect(port, hostname);
  return remoteSocket;
}

function writeEstablished(clientSocket) {
  clientSocket.write(`HTTP/1.1 200 Connection Established\r\n\r\n`);
}

function writeError(clientSocket, err) {
  let msg = err.message;
  let length = Buffer.byteLength(msg);
  clientSocket.write(`HTTP/1.1 502 Server Unreachable\r\n` +
    `Content-Length: ${length}\r\n` +
    `\r\n` +
    msg);
  clientSocket.end();
}

exports.handler = handler;
