const net = require('net');

class TcpAgent {
  constructor(proxy) {
    this._proxy = proxy;
    this._replies = [];
    this._sends = [];
    this._results = [];
  }

  send(data) {
    this._sends.push(data);
    return this;
  }

  reply(data) {
    this._replies.push(data);
    return this;
  }

  done() {
    return new Promise((resolve, reject) => {
      let proxy = this._proxy;
      !proxy.listening && proxy.listen(0);
      let client;
      let server = net.createServer().listen(0);
      let cleanup = () => {
        client && client.end();
        proxy.close();
        server.close();
      };
      let clientReceived = {};
      let serverReceived = {};
      let completed = 0;
      let complete = err => {
        completed++;
        if (err) {
          cleanup();
          reject(err);
        } else if (completed === 2) {
          cleanup();
          setTimeout(resolve, 5, { clientReceived, serverReceived });
        }
      };

      server.on('connection', socket => {
        client = socket;
        reply(this._replies, socket, serverReceived, complete);
      });
      send(this._sends, proxy.address().port, server.address().port, clientReceived, complete);
    });
  }
}

function record(recorder, socket) {
  recorder.allData = [];
  recorder.allText = [];
  socket.on('data', data => {
    let text = data.toString();
    recorder.text = text;
    recorder.allText.push(text);
    recorder.data = data;
    recorder.allData.push(data);
  });
}

function reply(replies, socket, recorder, done) {
  socket.on('error', done);
  let write = () => {
    let data = replies.shift();
    if (data) {
      socket.write(data);
      setTimeout(write, 5);
    } else {
      done();
    }
  };
  write();
  record(recorder, socket);
}

function send(sends, proxyPort, serverPort, recorder, done) {
  let socket = net.connect(proxyPort, () => {
    socket.write(`CONNECT 127.0.0.1:${serverPort} HTTP/1.1\r\n\r\n`);
    socket.once('data', d => {
      let res = d.toString();
      if (!res.startsWith('HTTP/1.1 200 Connection Established\r\n')) {
        let err = new Error('Connect to proxy failed');
        err.code = 'ECONNECTPROXY';
        err.data = res;
        done(err);
      }
      let read = () => {
        let data = sends.shift();
        if (data) {
          socket.write(data);
          setTimeout(read, 5);
        } else {
          done();
        }
      };
      read();
      record(recorder, socket);
    });
  });
}

module.exports = proxy => new TcpAgent(proxy);
