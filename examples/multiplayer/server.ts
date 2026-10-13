// The multiplayer example's authoritative server. Run: npm run example:server (then open the example in two tabs).
import { WebSocketServer } from 'ws';
import { Room, RoomHost } from '../../src';
import { GRID, PARAMS, PORT, TILE, W, type PlayerInfo } from './shared';

const room = new Room<PlayerInfo>({
  grid: GRID,
  params: PARAMS,
  spawn: (id) => ({ x: (4 + ((id * 7) % (W - 8))) * TILE, y: 12 * TILE }),
  // what other players see of each body: facing in `aim`, walking in `anim`
  onStep: (p, step) => {
    p.aim = p.mover.lastDx < 0 ? Math.PI : 0;
    p.anim = p.mover.dashLeft > 0 ? 2 : step[0] !== 0 || step[1] !== 0 ? 1 : 0;
  },
});

const host = new RoomHost(room, {
  // never trust what a client says about itself: keep what is valid, replace the rest
  admit: (data) => {
    const d = (data ?? {}) as Partial<PlayerInfo>;
    const name = typeof d.name === 'string' ? d.name.slice(0, 16) : 'player';
    const color = Number.isInteger(d.color) ? (d.color! & 0xffffff) : 0x6a90d0;
    if (room.players.size >= 16) throw new Error('the room is full');
    return { name, color };
  },
  onJoin: (id) => console.log(`+ ${room.players.get(id)?.data.name} (${id}), ${room.players.size} in the room`),
  onLeave: (id) => console.log(`- player ${id}, ${room.players.size} in the room`),
});

const wss = new WebSocketServer({ port: PORT, maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  const id = host.connect(ws);
  ws.on('message', (data, binary) => host.message(id, binary ? new Uint8Array(data as Buffer) : data.toString()));
  ws.on('close', () => host.disconnect(id));
  ws.on('error', () => host.disconnect(id));
});
host.start();
console.log(`multiplayer example server on ws://127.0.0.1:${PORT}`);
