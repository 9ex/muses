const agent = require('../globalAgent');
const protocol = require('./protocol');

async function handle(proxy, request, clientSocket, head) {
  try {
    let url = new URL(`http://${request.url}`);
    let remoteSocket = await createRemoteSocket(url);
    writeEstablished(clientSocket);

    if (proxy.shouldDecryptHttps(url.hostname)) {
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

async function createRemoteSocket(url) {
  let remoteSocket = await agent.connect(url.hostname, +url.port || 443);
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
