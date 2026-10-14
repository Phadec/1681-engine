# Desktop: patching, sessions, lockdown

Two subpaths for shipping a game as a desktop app on Electron, and its web to phones:

- **`1681-engine/updates`** — pure rules for file-by-file web updates from a release store: the feed's shapes, which
  web to take, what to copy or download. No Node, DOM or Electron, so the main process, a browser build and a phone's
  web view share it.
- **`1681-engine/electron`** — the main-process side: the web patcher, the shell's identity, an OS-encrypted session
  store and a window lockdown.

Electron is an **optional peer**: nothing in the engine imports it. You hand in your own `app`, `safeStorage`,
`ipcMain`, `shell` and windows (their types here are structural subsets of Electron's, so Electron's objects fit as
they are, and a test passes fakes). Both subpaths ship as ES modules and as CommonJS, so a main process compiled from
`.cts` to `.cjs` (TypeScript `module: NodeNext`) can `import` them and gets `require` calls that work on any Electron:

```ts
// electron/main.cts — compiled by tsc to dist-electron/main.cjs
import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron';
import { WebPatcher, SessionStore, registerSessionStore, lockDownWindow, denyPermissions, refuseDebugLaunch, shellId } from '1681-engine/electron';
```

## The release store

A publish script writes, per channel (say `live/` and `test/`):

| Path | What |
|---|---|
| `<channel>/latest.json` | `LatestJson`: the newest version, its web manifest's path, the shell and native build it needs, any APK and installers. Written **last**, so a client never reads a release that is half up. |
| `<channel>/web/<version>.json` | `WebManifest`: every file of the built web with its sha256 and size. |
| `<channel>/files/<sha256>` | Each content once. A release uploads only what the store lacks; a client downloads only what it lacks. |

Any static host that serves those paths works (an S3 bucket, a CDN). The engine reads, never writes, the store.

## Patching the web

```ts
const patcher = new WebPatcher({
  root: path.join(app.getPath('userData'), 'web'),
  builtinDir: path.join(__dirname, '..', 'dist'),
  appVersion: app.getVersion(),
  shell: () => shellId(process.versions.electron, __dirname),
  channelUrl: `https://store.example/public/${app.getName() === 'My Game Test' ? 'test' : 'live'}`,
  packaged: app.isPackaged,
});

win.loadFile(patcher.startEntry());               // a patched web when there is a good one, else the built-in
ipcMain.handle('web:booted', () => patcher.markBooted()); // the page calls this once it has mounted

const l = await patcher.latest();
if (l && patcher.patchable(l)) {
  await patcher.prepare(l, (percent) => …);       // builds <root>/<version>/ beside the running web
  const entry = patcher.applyPending();           // now, or leave it: the next start takes it
  if (entry) for (const w of BrowserWindow.getAllWindows()) w.loadFile(entry);
}
```

- **Only what changed is downloaded.** `planWeb` copies every file whose content the running web already holds — at
  its own path or under another (a bundler renamed it) — and fetches the rest once each, checking every download
  against its hash. The new web is built in `<version>.part/` and renamed whole, so a crash never leaves a folder that
  looks finished.
- **Only for the same shell.** The web talks to the main process through the preload script and may need what a newer
  shell adds, so a manifest names the shell it was built with (`shellId`: a hash of the compiled main-process files and
  the Electron version). A release with another shell is not `patchable`: ship an installer (electron-updater) instead.
  Code the shell takes from `node_modules` — this module included — is not in that folder: pass its version in
  `shellId(version, { dirs: [__dirname], extra: ['1681-engine 0.6.0'] })`, and reckon it the same way in the publish
  script.
- **A broken web cannot lock players out.** A web that never calls `markBooted` within `maxTries` starts (default 2)
  is dropped, and the shell goes back to the last web that did boot (`keepPrevious`, default true; false goes straight
  back to the built-in web). A patched web no newer than the installed build is ignored: an installer overtook it.
- `tidy()` (run by `startEntry`) deletes every web but the active, pending and previous one.

On phones, the same feed drives an over-the-air updater: `pickWebUpdate(latest, channelUrl, webVersion, nativeBuild)`
picks a web newer than the one running whose `minNative` the app's native build meets, `pluginEntries` turns its
manifest into `@capgo/capacitor-updater`'s multi-file download list, and `apkUpdateOf` offers the package only when
the web cannot come over the air.

## Staying logged in

```ts
registerSessionStore(ipcMain, new SessionStore({ safeStorage, dir: app.getPath('userData') }));
// preload: get/set/clear → ipcRenderer.invoke('session:get' | 'session:set' | 'session:clear')
```

One small string (a refresh token and a name) encrypted by the OS — DPAPI on Windows, the Keychain on the Mac — and
written atomically to `session.bin` (`fileName`). On Linux without a keyring (`basic_text`) nothing is written: a token
in the clear is worse than logging in again. Never keep it in `localStorage`, where any script in the page reads it.

## Lockdown

```ts
refuseDebugLaunch(app); // first line of main: a packaged app started with --inspect or a remote-debugging switch quits

const win = new BrowserWindow({ webPreferences: { contextIsolation: true, sandbox: true, devTools: !app.isPackaged } });
lockDownWindow(win, {
  shell,
  packaged: app.isPackaged,
  devServerUrl: app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL,
  external: { hosts: ['example.com', 'discord.gg'], paths: [{ host: 'github.com', prefix: '/my-studio/' }] },
});
denyPermissions(session.defaultSession, ['fullscreen']);
```

- No new window ever opens: a link to an allowed host (https, no credentials, the host or a subdomain; a shared host
  like a code host only under its listed paths) goes to the system browser, anything else is refused and logged.
- The window never navigates or redirects away from the game's own page (`file://`, or the dev server's origin in a dev
  run): a web page loaded there would get the preload's API.
- A packaged build refuses the DevTools keys; a dev run toggles DevTools on F12 (`devToolsKey`).
- `denyPermissions` answers camera, microphone, notifications and the rest with no, but those you list.

These keep honest players' windows on the game. They are not anti-cheat: flip Electron's fuses (`RunAsNode`,
`EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, asar integrity) in your packager too.
