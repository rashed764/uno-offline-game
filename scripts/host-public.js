/**
 * Public Hosting Startup Script via Localtunnel
 * Spins up the UNO server and establishes a secure public tunnel.
 */
'use strict';

const localtunnel = require('localtunnel');
const PORT = process.env.PORT || 3000;

// Import server.js which starts the Express/Socket.io server on PORT
require('../server');

async function initPublicTunnel() {
  console.log('\n⏳ Initializing secure public tunnel via Localtunnel...');
  
  try {
    const tunnel = await localtunnel({ port: PORT });

    console.log('\n==================================================');
    console.log('\x1b[1m\x1b[32m🎮 UNO GAME IS NOW LIVE GLOBALLY!\x1b[0m');
    console.log('==================================================');
    console.log(`\x1b[1m🌐 Public Game URL: \x1b[36m${tunnel.url}\x1b[0m`);
    console.log('🔗 Copy and send this link to your friends anywhere to play!');
    console.log('==================================================\n');

    tunnel.on('close', () => {
      console.log('\n❌ Public tunnel closed.');
      process.exit(0);
    });

    tunnel.on('error', (err) => {
      console.error('\n❌ Tunnel error:', err.message);
    });

  } catch (err) {
    console.error('\n❌ Failed to establish localtunnel:', err.message);
    console.log('💡 Tip: Check your internet connection or try again.');
  }
}

// Give the server 500ms to bind to the port before launching the tunnel
setTimeout(initPublicTunnel, 500);
