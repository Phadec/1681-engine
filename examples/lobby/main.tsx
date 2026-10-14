import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Connection, LobbyClient } from '../../src';
import { Modal, Panel, TabStrip, injectBaseCss } from '../../src/react';
import { MODES, PORT, type PlayerInfo } from './shared';

/*
 * A lobby screen over `LobbyClient`, built from the React kit: browse and create rooms, share a private room's code,
 * ready up, chat, queue alone or as a room, and answer a found match before its clock runs out. The example server
 * (npm run example:lobby) keeps five bots queueing, so one tab is enough to see a match made.
 */

injectBaseCss();

const NAMES = ['Fenn', 'Gwen', 'Hale', 'Isla', 'Joss', 'Kit'];
const me: PlayerInfo = { name: NAMES[Math.floor(Math.random() * NAMES.length)]!, rating: 900 + Math.floor(Math.random() * 300) };
const conn = new Connection(`ws://${location.hostname || '127.0.0.1'}:${PORT}`, { hello: () => me }).connect();
const lobby = new LobbyClient(conn);
(globalThis as { lobby?: LobbyClient }).lobby = lobby;

/** Re-renders on every change of the lobby's state. */
let version = 0;
lobby.events.on('change', () => version++);
const subscribe = (fn: () => void) => lobby.events.on('change', fn);
const useLobby = () => useSyncExternalStore(subscribe, () => version);

function useNow(ms = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const nameOf = (data: unknown) => (data as PlayerInfo | undefined)?.name ?? '?';

function App() {
  useLobby();
  const [tab, setTab] = useState<'play' | 'room'>('play');
  const [error, setError] = useState('');
  const [chat, setChat] = useState<string[]>([]);
  const [started, setStarted] = useState('');
  useEffect(() => {
    const offs = [
      lobby.events.on('error', (e) => setError(e.message)),
      lobby.events.on('chat', ({ from, text }) => setChat((c) => [...c.slice(-50), `${nameOf(lobby.room?.members.find((m) => m.id === from)?.data)}: ${text}`])),
      lobby.events.on('start', (s) => setStarted(`${s.match} (${s.mode}): ${s.players.map((p) => `${nameOf(p.data)} [team ${p.team + 1}]`).join(', ')} → ${JSON.stringify(s.data)}`)),
      lobby.events.on('kicked', () => setError('You were removed from the room')),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => setTab(lobby.room ? 'room' : 'play'), [lobby.room?.id]);
  return (
    <Panel title={`Lobby: ${me.name} (${me.rating})`} width={520} footer={error ? <div className="error">{error}</div> : null}>
      <TabStrip
        tabs={[
          { id: 'play', label: 'Play' },
          { id: 'room', label: 'Your room', disabled: !lobby.room },
        ]}
        value={tab}
        onChange={(t) => {
          setError('');
          setTab(t);
        }}
      />
      {tab === 'play' ? <PlayTab /> : <RoomTab chat={chat} />}
      {started && <p>Last match: {started}</p>}
      <MatchFound />
    </Panel>
  );
}

function PlayTab() {
  const now = useNow(1000);
  const [code, setCode] = useState('');
  const q = lobby.queued;
  const locked = lobby.lockedUntil > now;
  return (
    <div>
      <h4>Queue</h4>
      {q ? (
        <div className="row">
          In the {q.mode} queue for {Math.max(0, Math.round((now - q.since) / 1000))} s, {q.waiting} other group(s) waiting
          <button className="e1681-button small" onClick={() => lobby.leaveQueue()}>
            Leave
          </button>
        </div>
      ) : (
        <div className="row">
          {MODES.map((m) => (
            <button key={m.id} className="e1681-button" disabled={locked} onClick={() => lobby.queue(m.id)}>
              {m.id}
            </button>
          ))}
          {locked && <span className="muted">locked out for {Math.ceil((lobby.lockedUntil - now) / 1000)} s</span>}
        </div>
      )}
      <h4>Rooms</h4>
      <div className="row">
        <button className="e1681-button" onClick={() => lobby.create({ name: `${me.name}'s room`, mode: '2v2', maxPlayers: 4 })}>
          New room
        </button>
        <button className="e1681-button" onClick={() => lobby.create({ name: `${me.name}'s friends`, mode: '2v2', maxPlayers: 2, private: true })}>
          New private room
        </button>
      </div>
      <div className="row">
        <input className="e1681-input" value={code} placeholder="code" maxLength={6} onChange={(e) => setCode(e.target.value)} />
        <button className="e1681-button" disabled={code.length < 6} onClick={() => lobby.joinByCode(code)}>
          Join by code
        </button>
        <button className="e1681-button ghost" onClick={() => lobby.list()}>
          Refresh
        </button>
      </div>
      <ul className="list">
        {lobby.rooms.length === 0 && <li className="muted">No open rooms</li>}
        {lobby.rooms.map((r) => (
          <li key={r.id}>
            <span>
              {r.name} <span className="muted">{r.mode}</span>
            </span>
            <span>
              {r.players}/{r.maxPlayers}{' '}
              <button className="e1681-button small" onClick={() => lobby.join(r.id)}>
                Join
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoomTab({ chat }: { chat: string[] }) {
  const [text, setText] = useState('');
  const room = lobby.room;
  if (!room) return <p className="muted">You are in no room.</p>;
  const mine = room.members.find((m) => m.id === lobby.id);
  return (
    <div>
      <div className="row">
        <b>{room.name}</b> <span className="muted">{room.mode}</span>
        {room.private && <span>code {room.code}</span>}
        {room.queued && <span>· queued</span>}
        {room.busy && !room.queued && <span>· playing</span>}
      </div>
      <ul className="list">
        {room.members.map((m) => (
          <li key={m.id}>
            <span>
              {nameOf(m.data)} {m.id === room.host ? '(host)' : ''}
            </span>
            <span>
              {m.ready ? 'ready' : 'not ready'}
              {lobby.isHost && m.id !== lobby.id && (
                <>
                  {' '}
                  <button className="e1681-button small" onClick={() => lobby.promote(m.id)}>
                    Make host
                  </button>{' '}
                  <button className="e1681-button small" onClick={() => lobby.kick(m.id)}>
                    Kick
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="row">
        {!lobby.isHost && (
          <button className="e1681-button" onClick={() => lobby.setReady(!mine?.ready)}>
            {mine?.ready ? 'Not ready' : 'Ready'}
          </button>
        )}
        {lobby.isHost && !room.queued && (
          <button className="e1681-button" disabled={!lobby.roomReady} onClick={() => lobby.queue(room.mode)}>
            Queue the room
          </button>
        )}
        {lobby.isHost && !room.queued && (
          <button className="e1681-button" disabled={!lobby.roomReady} onClick={() => lobby.startRoom()}>
            Start a private game
          </button>
        )}
        {room.queued && (
          <button className="e1681-button" onClick={() => lobby.leaveQueue()}>
            Leave the queue
          </button>
        )}
        <button className="e1681-button ghost" onClick={() => lobby.leave()}>
          Leave the room
        </button>
      </div>
      <div className="chat">
        {chat.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      <div className="row">
        <input
          className="e1681-input"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !text.trim()) return;
            lobby.chat(text);
            setText('');
          }}
        />
      </div>
    </div>
  );
}

function MatchFound() {
  const now = useNow();
  const m = lobby.match;
  if (!m) return null;
  // the deadline is the server's clock; a page's clock is close enough for a countdown
  const left = Math.max(0, Math.ceil((m.expiresAt - now) / 1000));
  return (
    <Modal
      onCancel={() => lobby.decline()}
      onConfirm={() => lobby.accept()}
      width={360}
      label="Match found"
      actions={
        m.answered ? (
          <span className="muted">Waiting for the others…</span>
        ) : (
          <>
            <button className="e1681-button" onClick={() => lobby.accept()}>
              Accept
            </button>
            <button className="e1681-button ghost" onClick={() => lobby.decline()}>
              Decline
            </button>
          </>
        )
      }
    >
      <h3>Match found: {m.mode}</h3>
      <p>{left} s to accept</p>
      <ul className="list">
        {m.players.map((p) => (
          <li key={p.id}>
            <span>
              {nameOf(p.data)} <span className="muted">team {p.team + 1}</span>
            </span>
            <span>{m.accepted.includes(p.id) ? 'accepted' : '…'}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
