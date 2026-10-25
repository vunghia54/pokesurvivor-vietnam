'use strict';
const net = require('node:net');

function isEmulatorRunning(port = 9099) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(200, () => {
      s.destroy();
      resolve(false);
    });
  });
}

module.exports = { isEmulatorRunning };
