# Mobile: Capacitor, back button, safe area

A game built with the engine is a web page, so a phone app is that page in a native web view.
[Capacitor](https://capacitorjs.com) is the shell the engine is set up for. `1681-engine/mobile` holds the parts a
phone build needs beyond the browser: a config with a game's defaults, Android's back button, the safe area, a
screen that stays on, and the native build number the over-the-air updater checks.

Capacitor is an **optional peer**: nothing in the engine imports it. You hand in your own plugins (their types here
are structural subsets of Capacitor's), so a build that is not a phone app never needs it installed.

## Setting up

```sh
npm install @capacitor/core @capacitor/app @capacitor/splash-screen
npm install -D @capacitor/cli
npm install @capacitor/android   # and/or @capacitor/ios
npx cap add android
```

```ts
// capacitor.config.ts
import { capacitorConfig } from '1681-engine/mobile';

export default capacitorConfig({
  appId: 'com.example.mygame',
  appName: 'My Game',
  webDir: 'dist', // default
  backgroundColor: '#000000', // default: behind the web view while it loads
  debug: process.env.DEBUG === '1', // lets Chrome's and Safari's inspectors attach
});
```

`capacitorConfig` gives a game's defaults rather than a web page's:

- served from `https://localhost` on Android, with no plain-http requests, so cookies, `crypto.subtle` and service
  workers behave as on the web;
- on iOS the web view does not scroll or bounce and is drawn edge to edge (`contentInset: 'never'`): keep the HUD out
  of the notch with `safeAreaInsets`;
- the splash screen stays up until the game hides it (`SplashScreen.hide()` once the first scene has drawn), so the
  player never sees an empty web view;
- `@capgo/capacitor-updater`, if you use it, does not update on its own: the engine's `pickWebUpdate` decides (see
  [Desktop → patching](desktop.md)).

Anything else goes in `extra`, laid over the defaults field by field. Then `npm run build && npx cap sync` and open
the native project (`npx cap open android`) to run and sign it.

## The back button

Android's back button (and the back gesture) closes the app by default. Send it to a `BackStack` instead: the most
recently pushed handler answers first, and when none takes the press, the root does.

```ts
import { App } from '@capacitor/app';
import { BackStack, doubleBackToExit, installBackButton } from '1681-engine/mobile';

const back = new BackStack(
  doubleBackToExit({
    notify: () => toast('Press back again to quit'),
    exit: () => App.exitApp(), // or App.minimizeApp() to keep the run alive
  }),
);
await installBackButton(App, back);

// a dialog closes on back while it is open
const off = back.push(() => (dialog.close(), true));
dialog.onClose = off;
// a running level pauses on back; returning false lets the press go on down the stack
back.push(() => (scene.paused ? false : (scene.pause(), true)));
```

## The screen

- `safeAreaInsets()` reads `env(safe-area-inset-*)` and returns `{ top, right, bottom, left }` in CSS px: what a
  canvas HUD keeps its buttons clear of. It is 0 everywhere a browser has no notch. Read it again on resize (an
  orientation change moves the notch). The React kit's sheets already respect the safe area through CSS.
- `keepScreenOn()` holds the Screen Wake Lock while the game runs, and asks for it again each time the page comes
  back (the browser drops it whenever the page is hidden). It resolves to the release, and does nothing where the API
  is missing or the browser refuses.
- Orientation, fullscreen, rumble and touch detection are in [Platform](platform.md); `onAppResume` tells you when
  the app comes back from the background, to check a socket that may have died there.

## Over-the-air updates

The [release store](desktop.md#the-release-store) drives phones too. `nativeBuildOf(App)` is the app's native build
as a number (Android's versionCode, iOS's CFBundleVersion), which `pickWebUpdate` checks against the `minNative` of
each web, so a web that calls a plugin the installed app lacks never reaches it:

```ts
import { App } from '@capacitor/app';
import { nativeBuildOf } from '1681-engine/mobile';
import { pickWebUpdate, apkUpdateOf } from '1681-engine/updates';

const native = await nativeBuildOf(App); // Infinity in a browser: every web fits
const web = pickWebUpdate(latest, channelUrl, runningWebVersion, native);
const apk = apkUpdateOf(latest, channelUrl, appVersion, web); // only when the web cannot come over the air
```

## Pitfalls

- **Hide the splash screen yourself.** With `launchAutoHide: false` it stays up until `SplashScreen.hide()`; a game
  that forgets shows its splash for good.
- **The first sound needs a gesture** on a phone too: see [Audio](audio.md). A web view counts a tap like a browser.
- **The back stack is yours to keep tidy.** A handler pushed by a dialog and never popped keeps answering after the
  dialog is gone: take it off where the dialog closes, whatever closed it.
- **Debug builds only.** `debug: true` lets anyone with a cable inspect the web view: keep it off a release build.

## API

[`capacitorConfig`](/api/mobile/functions/capacitorConfig) · [`BackStack`](/api/mobile/classes/BackStack) ·
[`doubleBackToExit`](/api/mobile/functions/doubleBackToExit) · [`installBackButton`](/api/mobile/functions/installBackButton) ·
[`nativeBuildOf`](/api/mobile/functions/nativeBuildOf) · [`safeAreaInsets`](/api/mobile/functions/safeAreaInsets) ·
[`keepScreenOn`](/api/mobile/functions/keepScreenOn)
