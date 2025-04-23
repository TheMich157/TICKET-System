const axios = require('axios');

const HEARTBEAT_URL = 'https://uptime.betterstack.com/api/v1/heartbeat/RfRuEbwebLowX7fGDb8kVWii';

async function sendHeartbeat() {
    try {
        await axios.get(HEARTBEAT_URL);
        console.log('Heartbeat sent successfully at', new Date().toISOString());
    } catch (error) {
        console.error('Failed to send heartbeat:', error.message);
    }
}


function startHeartbeat(interval = 1 * 60 * 1000) { 
    console.log(`Starting heartbeat service with interval: ${interval / 1000} seconds`);

    sendHeartbeat(); 

    setInterval(sendHeartbeat, interval);
    console.log('Heartbeat service started');

}

module.exports = startHeartbeat;