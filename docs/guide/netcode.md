# Netcode: multiplayer movement

The engine's netcode is server-authoritative movement over a WebSocket. Every client and the server run the same
deterministic `stepMover` on the same fixed input steps. The client applies its own steps straight away (prediction),
sends them, and when a snapshot says where the server has the body as of a given step, it rewinds there and replays
the steps the server has not seen yet (reconciliation). Other bodies are drawn a little in the past, between two
snapshots (interpolation). The client side is `Connection`, `PredictedMover` and `InterpolationBuffer`; the server side
is `Room` and `RoomHost`. `Room` is transport-free, so you can wire it to any socket library.
[`examples/multiplayer`](/examples#multiplayer) is a whole working pair: a courtyard that two or more tabs walk
through a local server. For rooms, queues and ready checks before a match, see [Lobby and matchmaking](lobby.md).

## Deterministic movement

A body is a `MoverState` (position, last direction, dash state) made by `createMover(x, y)`. One fixed step of input is
an `InputStep`, `[axisX, axisY, flags]`, and `stepMover(state, step, params, grid)` moves the state by one step,
mutating it. There are `INPUT_STEP_RATE` (60) steps a second, and each moves by `INPUT_STEP_DT` of a second.

```ts
import { createCollisionGrid, createMover, stepMover, INPUT_FLAG_DASH, type MovementParams } from '1681-engine';

// '1' is solid, row-major; the string must be exactly width × height long
const grid = createCollisionGrid(40, 26, 16, solidString, { bodyHalfWidth: 6, bodyHalfHeight: 4 });
const params: MovementParams = { speed: 100, dashSpeed: 280, dashSteps: 10, dashCooldownSteps: 40, canMove: true, canDash: true };

const body = createMover(64, 192);
stepMover(body, [1, 0, 0], params, grid); // one step right
stepMover(body, [0, 0, INPUT_FLAG_DASH], params, grid); // a dodge roll along the last direction
```

- The axes are clamped to -1, 0 or 1, and a diagonal is scaled by `DIAGONAL`. An analog stick's value is rounded off
  inside `stepMover`, so movement is always eight-way.
- `INPUT_FLAG_DASH` starts a roll of `dashSteps` steps along the last direction moved, then `dashCooldownSteps` before
  the next. A roll is committed: input neither steers it nor aims the next one while it runs.
- The body box defaults to `BODY_HALF_WIDTH` × `BODY_HALF_HEIGHT` (a 10×6 foot box); outside the grid counts as solid.
- `createCollisionGrid` also takes `ground` and `shotOverTiles`, for tiles a body cannot walk but a shot flies over
  (`blocksShot`).

Put the grid and the params in one module both sides import, as the example's `shared.ts` does.

## The client

`Connection` opens the socket, sends `hello` (with `options.hello()` as its data) on every connect, batches input,
decodes snapshots (binary or JSON), pings to keep the round trip (`rtt`) and the server clock up to date, and
reconnects with backoff. Its `events` bus emits:

| Event | Payload |
|---|---|
| `open` | — |
| `close` | `{ code, reason, willRetry }` |
| `welcome` | `{ t: 'welcome', id, tick, stepRate, snapRate }`: your player id |
| `snapshot` | a `Snapshot` |
| `message` | anything with a `t` the engine does not know: the game's own messages |

| Option | Default | What |
|---|---|---|
| `reconnect` | true | reconnect after a drop, waiting 250 ms × 2ⁿ |
| `maxBackoffMs` | 10 000 | the longest wait between tries |
| `pingMs` | 1000 | ping interval |
| `hello` | — | returns the `hello.data` sent on every (re)connect |
| `WebSocket` | the global one | the WebSocket class (Node 22+ and browsers have one) |

`queueInput(seq, step)` adds a step to this frame's batch and `flush()` sends the batch as one `input` message; call
`flush` once a frame. `send(msg)` sends any message now, and drops it while the socket is closed.

`PredictedMover` owns the local body. `step(input)` applies a step at once, keeps it, and returns its sequence number
(send that with it). `reconcile(ack, me)` drops every step up to `ack`, puts the body where the server says and
replays the rest. If the replay lands somewhere else, `correction` says how far, and `drawX`/`drawY` ease the jump out
over a few frames (`smooth(dt)`, `smoothing` 0.8 by default); a jump of 64 px or more is shown at once, as a teleport.
`setParams` and `setGrid` change the rules for future steps and replays alike.

`InterpolationBuffer` keeps a short history per body. `push(snapshot.time, updates)` records a snapshot, and
`sample(id, serverNow())` returns `{ x, y, aim, anim, hp, flags }` drawn `delayMs` (100) in the past, blended between
the two snapshots around that moment; `anim`, `hp` and `flags` come from the older one. Past the newest snapshot it
carries on along the last motion for at most 120 ms, then holds. `remove(id)` forgets a body that left view.

A minimal client loop, following the example:

```ts
import { Connection, PredictedMover, InterpolationBuffer, serverNow, system, INPUT_FLAG_DASH, type InputStep } from '1681-engine';
import { GRID, PARAMS } from './shared';

const conn = new Connection('ws://127.0.0.1:5181', { hello: () => ({ name: 'Ash' }) });
const others = new InterpolationBuffer(100);
let myId = -1;
let mover: PredictedMover | null = null;

conn.events.on('welcome', (w) => (myId = w.id));
conn.events.on('snapshot', (s) => {
  for (const sp of s.sp ?? []) addBody(sp.id, sp.data);
  for (const id of s.rm ?? []) { removeBody(id); others.remove(id); }
  if (s.me) {
    mover ??= new PredictedMover(s.me[0], s.me[1], PARAMS, GRID);
    mover.reconcile(s.ack, s.me);
  }
  others.push(s.time, (s.up ?? []).filter((u) => u[0] !== myId)); // your own body is predicted, not interpolated
});
conn.events.on('close', () => (mover = null)); // a reconnect is a new player: start over
conn.connect();

// in a scene: input and prediction on the fixed step, one send a frame
world.addSystem(system('input', 'fixed', () => {
  if (!mover) return;
  const step: InputStep = [axisX(), axisY(), rollPressed() ? INPUT_FLAG_DASH : 0];
  conn.queueInput(mover.step(step), step);
}));
world.addSystem(system('send', 'frame', () => conn.flush()));

// in update(dt)
mover?.smooth(dt);
if (mover) placeBody(myId, mover.drawX, mover.drawY);
for (const id of others.ids()) {
  const s = others.sample(id, serverNow());
  if (s) placeBody(id, s.x, s.y);
}
```

## Snapshots and the wire

The messages are in `protocol.ts`: `ClientMessage` (`hello`, `input` with `seq` and `steps`, `ping`) and
`ServerMessage` (`welcome`, `pong`, `Snapshot`). A game adds its own beside them; anything with an unknown `t` goes to
the game untouched, on `message` on the client and `onMessage` on the server.

A `Snapshot` carries `tick`, `time` (server wall time, ms), `ack` (the last of your steps applied, -1 before any), `me`
(your own body whole, as a `MoverWire`, made by `moverToWire`), `sp` (bodies that came into view, with the game's
data), `rm` (bodies that left) and `up` (every body in view as `[id, x, y, aim, anim, hp, flags]`).

A snapshot with no `up` is one JSON text frame. One with updates is a binary frame: a tag byte, the JSON without `up`,
then a 16-byte record per body (`encodeSnapshotFrame` / `decodeSnapshotFrame`; `RoomHost` and `Connection` do this for
you). Positions travel to 1/8 px and aim to 1/256 of a turn; `quantizeUpdates` applies the same rounding without the
bytes, for a local simulation that must move on the grid the server sends. The record layout and why it is that way
are in [Architecture → Determinism](architecture.md#determinism) and the comment at the top of `snapshotCodec.ts`.

## The server clock

`serverNow()` is the server's wall time as this client best knows it: this device's clock plus `serverOffset()`.
`Connection` feeds it from every pong; `noteServerTime(serverMs, rttMs)` feeds it from anything else that returns the
server's time (a REST answer). The sample with the shortest round trip wins, a sample over a minute old gives way to
the next one, and a round trip over 2 s is ignored. `resetServerClock()` goes back to the device's own clock, for an
offline game or after leaving a server. Read `serverNow()`, never `Date.now()`, for anything reckoned against the
server: interpolation, timetables, resets.

## Cadence

For repeated timed actions (an attack, a cooldown, a potion), `cadenceEarly(now, due, slack)` says whether an action
arrived earlier than its slack allows, and `cadenceNext(now, due, interval)` when the next one is due: a whole interval
after the later of `now` and `due`, so the slack forgives jitter without adding up. `CADENCE` holds default slacks
(`attackEarlyShare` 0.2, `lockSlackMs` 60, `cooldownSlackMs` 40, `potionSlackMs` 150). Client and server must run the
same arithmetic.

```ts
if (cadenceEarly(now, p.attackDue, interval * CADENCE.attackEarlyShare)) return refuse();
p.attackDue = cadenceNext(now, p.attackDue, interval);
```

## The server

`Room` applies each player's steps once, in order, with the same `stepMover`, and builds each player a snapshot.
`RoomHost` runs a room for sockets: `hello` joins, `input` goes to the room, pings get pongs with the server's time,
the room steps at `stepRate` (60) and snapshots go out at `snapRate` (20). A socket only needs `send` and `close`
(`HostSocket`), so a `ws` socket fits as it is.

```ts
import { WebSocketServer } from 'ws';
import { Room, RoomHost } from '1681-engine';
import { GRID, PARAMS, type PlayerInfo } from './shared';

const room = new Room<PlayerInfo>({
  grid: GRID,
  params: PARAMS,
  spawn: (id) => ({ x: 64 + id * 24, y: 192 }),
  // what others see of each body
  onStep: (p, step) => { p.anim = step[0] !== 0 || step[1] !== 0 ? 1 : 0; },
});

const host = new RoomHost(room, {
  // validate what the client says about itself; throw to refuse it (the socket closes with 4003)
  admit: (data) => ({ name: String((data as { name?: unknown })?.name ?? 'player').slice(0, 16), color: 0x6a90d0 }),
});

new WebSocketServer({ port: 5181, maxPayload: 64 * 1024 }).on('connection', (ws) => {
  const id = host.connect(ws);
  ws.on('message', (data, binary) => host.message(id, binary ? new Uint8Array(data as Buffer) : data.toString()));
  ws.on('close', () => host.disconnect(id));
  ws.on('error', () => host.disconnect(id));
});
host.start();
```

`RoomOptions` also take `maxQueue` (30 steps waiting before more are refused), `maxStepsPerTick` (3) and `backlog` (4):
a player with more than `backlog` steps waiting catches up a few a tick, never faster. `RoomHostOptions` take
`maxStrikes` (20 refused inputs before the socket is closed with 4008), `onMessage`, `onJoin`, `onLeave` and `now`
(a clock for tests). `host.sendTo(id, msg)` sends one of the game's own messages; `stepOnce()` steps without the timer,
for tests or a server that drives its own loop. Each `RoomPlayer` has `aim`, `anim`, `hp` and `flags` for the game to
set (in `onStep` or its own systems), `params` to change per player, and `strikes`. `room.place(id, x, y)` moves a
player by hand (a respawn, a teleport).

## Bodies the server moves

Monsters, projectiles and crates take no input and are not predicted: the server moves them and sends them beside
the players, in the same snapshots.

```ts
const room = new Room<PlayerInfo, MonsterInfo>({ grid: GRID, params: PARAMS, spawn });
const wolf = room.addBody({ kind: 'wolf' }, 320, 96); // id from BODY_ID_BASE (2^24) up, or pass one
// in the server's own simulation, every step
wolf.x += vx;
wolf.anim = 1;
wolf.hp = 7;
room.removeBody(wolf.id); // players who saw it get it in `rm`
```

A `RoomBody` has `x`, `y`, `aim`, `anim`, `hp`, `flags` and the game's `data` (sent in `sp` when a player first sees
it). On the client it is one more id in `up`: interpolate it with the other bodies. Bodies are under `interest` and in
the lag-compensation `history` like players; `canSee(viewer, other)` gets either, told apart by `other.kind`
(`'player'` or `'body'`). `room.place(id, x, y)` moves either at once. Body and player ids never clash: an id one
holds is refused to the other.

## Interest: send each player what is near it

By default a `Room` sends every body to every player. Give it `interest` and each player is sent itself and the
bodies within `radius` px of it, nothing else: bandwidth grows with how crowded a spot is, not with the size of the
room.

```ts
const room = new Room<PlayerInfo>({
  grid: GRID,
  params: PARAMS,
  spawn,
  // about a screen and a half: a body comes into view before it walks onto the screen
  interest: { radius: 480, leaveMargin: 120, canSee: (me, other) => !other.data.hidden || other.data.team === me.data.team },
});
```

- A body comes into view (`sp`) within `radius` and leaves it (`rm`) only past `radius + leaveMargin` (default a
  quarter of `radius`), so one walking along the edge is not spawned and removed on every snapshot.
- `canSee(viewer, other)` decides what distance alone does not: a hidden enemy, a team's own across the map.
- The client needs nothing new: what leaves view arrives in `rm`, as before. Remove it from the
  `InterpolationBuffer` there (`others.remove(id)`), as the client loop above does.
- Bodies are filed in a `SpatialHash` (square cells of `radius` px) after every step, so a query looks at a 3×3
  block of cells, not at everyone. The class is exported for a game's own use: monsters, loot, triggers.

## Lag compensation: judge a shot against what the shooter saw

A client draws other bodies `delayMs` (100) in the past, and its shot takes half a round trip to arrive. By then the
target has walked on, and a shot judged against where it is now misses what the shooter clearly hit. Make the room
with `rewindMs` and it keeps a short history of positions, recorded as each round of snapshots goes out, which is
the very picture clients interpolate between.

```ts
// the client: send the time the target was drawn at with the shot
conn.send({ t: 'shoot', at: others.viewTime(serverNow()), dx, dy });

// the server
const room = new Room<PlayerInfo>({ grid: GRID, params: PARAMS, spawn, rewindMs: 250 });
const host = new RoomHost(room, {
  onMessage: (id, msg) => {
    if (msg.t !== 'shoot') return;
    const me = room.players.get(id)!.mover;
    const at = host.rewindTime(msg.at); // kept within 250 ms of now
    const hit = room.history!.alongRay(at, me.x, me.y, Number(msg.dx), Number(msg.dy), 320, 6, id)[0];
    if (hit && !wallBetween(me, hit)) damage(hit.id);
  },
});
```

- `room.history` is a `LagCompensator`: `at(id, time)`, `all(time)`, `near(time, x, y, radius, except)` and
  `alongRay(time, x, y, dx, dy, range, radius, except)` (bodies a ray met, nearest first). They blend between
  recorded frames the way `InterpolationBuffer.sample` does, so a rewind lands within the wire's 1/8 px of where the
  client drew the body.
- `host.rewindTime(claimed)` keeps a claimed time within `rewindMs` of now (and never in the future); a claim that
  is not a number is taken as now. Without `rewindMs` it is always now. `LagCompensator.clampTime(claimed, now,
  maxMs)` is the same rule for a server of the game's own.
- Keep `rewindMs` to what real players need: the interpolation delay plus a round trip, 200–300 ms. The longer it is,
  the further a player with a bad connection can shoot round a corner the target already turned.
- The history knows positions only. Walls, cover and the shooter's own reach are the game's to check, against the
  hit `alongRay` returns.
- `LagCompensator` works without a `Room`: `record(time, bodies)` from any server loop, for monsters as well.

## REST: `ApiClient`

`ApiClient` sends JSON with a bearer token and a timeout (`timeoutSignal`), refreshes a 401 once through `refresher`
and sends the request again, and calls `onStatus[status]` / `onError` before throwing an `ApiError` (an "update
required" gate on 426). Routes and types stay the game's: subclass it or wrap `request`.

## Pitfalls

- **Movement must be deterministic.** Never read the clock, `Math.random` or a frame's `dt` inside the fixed movement:
  `stepMover` always moves by `INPUT_STEP_DT`. Keep the operation order identical in a port to another language, so the
  doubles match bit for bit.
- **The same `MovementParams` and grid on both sides.** If they differ, every replay lands somewhere new and the body
  jitters with corrections. When a buff changes the rules, change them on the server's `RoomPlayer.params` and with
  `PredictedMover.setParams` on the client.
- **Step on the fixed loop at 60 Hz.** One `InputStep` is one 60th of a second of movement. The engine's fixed loop runs
  at 60 by default (`Engine.create({ hz })`); at another rate the body walks at the wrong speed. Predict in a `fixed`
  system and `flush` once a frame.
- **Sequence numbers are the client's own.** A server room fills a gap with standing still and refuses one longer than
  `maxQueue`. After a reconnect the server sees a new player whose `ack` starts at -1, so throw the old
  `PredictedMover` away and make a new one from the next snapshot's `me`, as the example does on `close`.
- **Input sent while closed is lost.** `send` drops it; nothing resends it.
- **Don't interpolate yourself.** `up` includes your own body; filter your id out before `push`, and draw yourself at
  `drawX`/`drawY`.
- **Interpolate at server time.** Pass `serverNow()` to `sample`, not `Date.now()`: snapshot times are the server's.
- **Positions travel within ±4096 px.** The record's i16 at 1/8 px holds maps up to 4096 px a side; larger worlds need
  their own codec.
- **`RoomHost` reads text only.** Clients send JSON; a binary message is ignored. Validate a player's data in `admit`:
  it is whatever the client sent.
- **Bodies the server moves are positions only.** `Room` does not step them: their movement, collisions and AI are
  the server's own code.
- **A `Room` sends every body to every player unless given `interest`.** A large world wants `interest`; a
  small arena does not need it.
