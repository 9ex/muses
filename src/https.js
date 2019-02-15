const https = require('https');
const fs = require('fs');

function createHandler() {
  https.createServer({
    cert: fs.readFileSync('../test/cert/nas.server.crt'),
    key: fs.readFileSync('../test/cert/nas.server.key')
  });
}

exports.createHandler = createHandler;
