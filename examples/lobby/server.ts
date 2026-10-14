// The lobby example's server. Run: npm run example:lobby (then open the example, in as many tabs as you like).
import { WebSocketServer } from 'ws';
import { LobbyHost, type LobbyLink } from '../../src';
import { EventBus } from '../../src/events/EventBus';
import { LobbyClient } from '../../src/net/lobby/LobbyClient';
import { MODES, PORT, type PlayerInfo } from './shared';

const lobby = new LobbyHost<PlayerInfo>({
  modes: MODES,
  readyCheckMs: 12_000,
  declineLockMs: 20_000,
  // never trust what a client says about itself: keep what is valid, replace the rest
  admit: (data) => {
    const d = (data ?? {}) as Partial<PlayerInfo>;
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 16) : 'player';
    // a real game reads the rating from its own records; here a client's claim is clamped and kept
    const rating = Number.isFinite(d.rating) ? Math.max(0, Math.min(3000, Math.round(d.rating!))) : 1000;
    return { name, rating };
  },
  ratingOf: (_id, data) => data.rating,
  // a real game starts a game server (or a room on this one) here and hands out where to connect
  onStart: (match) => {
    console.log(`match ${match.id} (${match.mode}): ${match.players.map((p) => `${p.data.name}[${p.team}]`).join(' ')}`);
    return { server: `ws://127.0.0.1:${PORT + 1}/${match.id}`, note: 'the game would start here' };
  },
  onJoin: (id) => console.log(`+ ${lobby.dataOf(id)?.name} (${id})`),
  onLeave: (id) => console.log(`- ${id}`),
});

/**
 * Bots: in-process members that queue for every mode in turn and accept whatever they are offered, so one person can
 * see the whole flow. They speak the same messages a page does, through a link with no socket under it.
 */
function bot(name: string, rating: number): void {
  const events = new EventBus<{ message: { t: string; [k: string]: unknown } }>();
  let id = -1;
  const link: LobbyLink = { send: (msg) => lobby.message(id, JSON.stringify(msg)), events };
  id = lobby.connect({ send: (data) => setTimeout(() => events.emit('message', JSON.parse(data as string))), close: () => {} });
  const client = new LobbyClient(link);
  let turn = 0;
  const requeue = () => setTimeout(() => client.queue(MODES[turn++ % MODES.length]!.id), 1500 + Math.random() * 3000);
  client.events.on('found', () => setTimeout(() => client.accept(), 600 + Math.random() * 1500));
  client.events.on('cancelled', ({ requeued }) => !requeued && requeue());
  client.events.on('start', ({ match }) => {
    setTimeout(() => lobby.finish(match), 100);
    requeue();
  });
  lobby.message(id, JSON.stringify({ t: 'hello', data: { name, rating } }));
  requeue();
}
['Ash', 'Bryn', 'Cael', 'Dara', 'Elin'].forEach((n, i) => bot(`${n} (bot)`, 900 + i * 60));

const wss = new WebSocketServer({ port: PORT, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const id = lobby.connect(ws);
  ws.on('message', (data, binary) => lobby.message(id, binary ? new Uint8Array(data as Buffer) : data.toString()));
  ws.on('close', () => lobby.disconnect(id));
  ws.on('error', () => lobby.disconnect(id));
});
lobby.start();
console.log(`lobby example server on ws://127.0.0.1:${PORT}`);
