const agent = require('../globalAgent');
const protocol = require('./protocol');
const debug = require('debug')('muses:handler:connect');

async function handle(proxy, request, clientSocket, head) {
  try {
    let { hostname, port } = new URL(`http://${request.url}`);
    port = +port || 443;
    let remoteSocket = await createRemoteSocket(port, hostname);
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
        clientSocket.remoteSocket, clientSocket.remotePort,
        remoteSocket.remoteSocket, remoteSocket.remotePort);
      pipe(clientSocket, remoteSocket, head);
    }
  } catch (err) {
    writeError(clientSocket, err);
  }
}

function pipe(src, dest, buf) {
  if (buf) {
    dest.write(buf);
  }
  src.pipe(dest).pipe(src);
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

module.exports = handle;
