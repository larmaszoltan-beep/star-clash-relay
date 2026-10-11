const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Star Clash Arena Relay Server is active and running!\n');
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

// Kapcsolat ébren tartása (Render timeout elkerülése végett)
function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  let currentRoom = null;
  let role = null;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return; // Ha nem JSON, figyelmen kívül hagyjuk
    }

    if (data.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }

    if (data.t === 'host') {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      currentRoom = code;
      role = 'host';
      rooms.set(code, { host: ws, guest: null });
      ws.send(JSON.stringify({ t: 'code', code }));
    } 
    else if (data.t === 'join') {
      const code = data.code;
      const room = rooms.get(code);
      if (room && !room.guest) {
        currentRoom = code;
        role = 'guest';
        room.guest = ws;
        ws.send(JSON.stringify({ t: 'joined', code }));
        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(JSON.stringify({ t: 'peer' }));
        }
      } else {
        ws.send(JSON.stringify({ t: 'err', m: 'A szoba nem található vagy tele van.' }));
      }
    } 
    else {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;

      if (role === 'host' && room.guest && room.guest.readyState === WebSocket.OPEN) {
        room.guest.send(message);
      } else if (role === 'guest' && room.host && room.host.readyState === WebSocket.OPEN) {
        room.host.send(message);
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      const target = role === 'host' ? room.guest : room.host;
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ t: 'bye' }));
      }
      rooms.delete(currentRoom);
    }
  });
});

// Időzítő az elhalt kapcsolatok takarítására
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Relay server successfully running on port ${PORT}`);
});