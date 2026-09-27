const os = require('os');

/**
 * Retrieves the local network IPv4 address(es) of the machine.
 * Useful for displaying the URL that other devices on the same Wi-Fi can connect to.
 * @returns {Array<{interface: string, ip: string}>} Array of active non-internal IPv4 interfaces
 */
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const localIps = [];

  for (const interfaceName of Object.keys(interfaces)) {
    for (const net of interfaces[interfaceName]) {
      // IPv4 standard and non-internal loopback (ignore 127.0.0.1)
      const isIPv4 = net.family === 'IPv4' || net.family === 4;
      if (isIPv4 && !net.internal) {
        localIps.push({
          interface: interfaceName,
          ip: net.address
        });
      }
    }
  }

  return localIps;
}

module.exports = {
  getLocalIpAddresses
};
