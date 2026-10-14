# Lobby and matchmaking

The front room of an online game, before anyone is in a match: players browse and create rooms, share a private
room's code, say they are ready and chat; a player alone or a whole room queues for a mode, a `Matchmaker` makes
matches by rating, and every match goes through a ready check before the game is told to start it. Like the netcode's
`Room`, it is transport-free: wire it to any WebSocket library. [`examples/lobby`](/examples#lobby) is a whole lobby
screen on the [React kit](react.md), with five bots keeping the queue busy.

## The server

`LobbyHost` runs on Node 22 or later (like the netcode's `Room`); the client side runs in any browser.

```ts
import { WebSocketServer } from 'ws';
import { LobbyHost } from '1681-engine';

const lobby = new LobbyHost<{ name: string }>({
  modes: [
    { id: 'duel', teams: 2, teamSize: 1 },
    { id: '2v2', teams: 2, teamSize: 2, window: 150, widenPerSecond: 25 },
  ],
  // never trust a client's own account of itself: keep what is valid, throw to refuse it
  admit: (data) => ({ name: String((data as { name?: unknown })?.name ?? 'player').slice(0, 16) }),
  ratingOf: (id, data, mode) => ratings.get(`${data.name}:${mode}`) ?? 1000,
  // a match is made and accepted: start it, and tell each player where to go
  onStart: (match) => {
    const ticket = gameServers.reserve(match); // the game's own
    return (playerId: number) => ({ server: ticket.url, token: ticket.tokenFor(playerId) });
  },
});

new WebSocketServer({ port: 8092 }).on('connection', (ws) => {
  const id = lobby.connect(ws);
  ws.on('message', (data, binary) => lobby.message(id, binary ? '' : data.toString()));
  ws.on('close', () => lobby.disconnect(id));
});
lobby.start(); // searches the queue every second (`matchEveryMs`)
```

`onStart` returns one value for everyone or a function of the player's id; it may throw to call the start off (everyone
is put back in the queue). When the game is over, `lobby.finish(matchId)` opens the rooms it came from again.

| Option | Default | What |
|---|---|---|
| `modes` | none | what the queue fills; without modes the lobby has rooms only |
| `readyCheckMs` | 15 000 | time to accept a found match; 0 starts it at once |
| `declineLockMs` | 30 000 | how long one who declined (or let the check lapse) is kept out of the queue |
| `maxRoomPlayers`, `listLimit` | 8, 50 | the largest room, and how many rooms a browser is sent |
| `chatMax`, `nameMax` | 200, 32 | characters of a chat line and a room name |
| `ratePerSecond` | 20 | messages a second before refusing; three times that closes the socket |

## The matchmaker

`Matchmaker` is pure — tickets in, matches out, no clock and no sockets — so a game can use it on its own or test its
modes under node. A mode is `teams` sides of `teamSize`; a ticket is a group that must not be split (a player alone or
a party), its rating, and when it joined.

Each search takes the **oldest** ticket of a mode as the anchor and gathers the groups within its rating window — and
within each one's own window, so a newcomer is never thrown in with veterans just because a veteran has waited long.
Windows start at `window` (100) and widen by `widenPerSecond` (10) up to `maxWindow` (600), so everyone is matched in
the end. Groups are taken closest rating first, with a small search rather than a greedy pass, so a party of three is
not shut out by two singles taken before it; the teams are then balanced by rating (`balanceTeams`), parties kept whole.

## Rooms and parties

A room has a host, a name, a mode, a size, the game's own `settings` (a map, a difficulty: only the host changes them,
and changing them clears everyone's ready flag), and a six-letter `code`. A private room is never listed and is joined
only by its code. When the host leaves, the next member to have come hosts; an empty room closes.

A room is also a **party**: its host queues it as one ticket when everyone is ready, and its members land on one team.
The host may instead start the room's own game (`lobby/start`, everyone ready), outside matchmaking, with the room's
settings handed to `onStart`.

## The ready check

A found match is offered to everyone with a deadline. When all accept, `onStart` runs. When someone declines, leaves,
or the clock runs out, the match is called off: whoever did not accept is locked out of the queue for `declineLockMs`
(and their party is not requeued), and every group that did accept goes back into the queue **at its old place** —
it keeps the time it joined, so it does not lose its wait.

## The client

`LobbyClient` keeps the lobby's state from the server's messages and has a method for everything a lobby screen does.
Give it the game's `Connection` (or anything that sends JSON and emits the messages the netcode does not handle):

```ts
import { Connection, LobbyClient } from '1681-engine';

const conn = new Connection('wss://lobby.example.com', { hello: () => ({ name }) }).connect();
const lobby = new LobbyClient(conn);

lobby.events.on('change', redraw); // rooms, room, queued, match, lockedUntil
lobby.events.on('found', () => showAcceptDialog(lobby.match!)); // then lobby.accept() or lobby.decline()
lobby.events.on('start', ({ data }) => joinGame(data)); // what onStart returned for you
lobby.events.on('error', ({ code, message }) => toast(message));

lobby.create({ name: 'Friday night', mode: '2v2', maxPlayers: 4, private: true });
lobby.joinByCode('QK2Y4R');
lobby.setReady(true);
lobby.queue('duel');
```

| State | What |
|---|---|
| `id`, `modes` | your lobby id and the modes on offer |
| `rooms` | the open public rooms, fullest first |
| `room` | your room whole: members with their data and ready flags, host, code, settings, `queued` |
| `queued` | your queue: mode, since when, how many other groups wait |
| `match` | a found match waiting for answers: players and teams, deadline, who accepted |
| `lockedUntil` | kept out of the queue until then, after a decline |

Errors come back as codes (`room-full`, `not-ready`, `locked`…) with an English message, so a game shows its own
words for them.
