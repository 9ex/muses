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
  }

  reply(data) {
    this._replies.push(data);
    return this;
  }

  done() {
    return new Promise((resolve, reject) => {
      let proxy = this._proxy;
      !proxy.listening && proxy.listen(0);
      let server = net.createServer().listen(0);
      let cleanup = () => {
        proxy.close();
        server.close();
      };
      return new Promise((resolve, reject) => {
        let clientReceived = {};
        let serverReceived = {};
        let done = err => {
          done.count = 1 + done.count || 0;
          if (err) {
            cleanup();
            reject(err);
          } else if (done.count === 2) {
            cleanup();
            setTimeout(resolve, 5, { clientReceived, serverReceived });
          }
        };

        server.on('connection', socket => reply(socket, serverReceived, done));
        send(proxy.address().port, server.address().port, clientReceived, done);
      });
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

function reply(socket, recorder, done) {
  socket.on('error', done);
  let write = () => {
    let data = this._replies.shift();
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

function send(proxyPort, serverPort, recorder, done) {
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
        let data = this._sends.shift();
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
