import type { BackStack } from './backButton';

/*
 * Capacitor is never imported here: the game hands in its own plugins, and their types below are structural subsets
 * of Capacitor's, so the App plugin of @capacitor/app fits as it is and a test passes a fake. A game that is not a phone
 * build never needs Capacitor installed.
 */

/** What a plugin's `addListener` resolves to. */
export interface ListenerHandle {
  remove(): Promise<void> | void;
}

/** The slice of `@capacitor/app`'s `App` the engine uses. */
export interface AppLike {
  addListener(event: 'backButton', cb: (e: { canGoBack: boolean }) => void): Promise<ListenerHandle> | ListenerHandle;
  exitApp(): Promise<void> | void;
  minimizeApp?(): Promise<void> | void;
  getInfo?(): Promise<{ version: string; build: string }>;
}

/**
 * Sends Android's back button to a `BackStack`. Capacitor's own default (the web view going back in its history,
 * then closing the app) is replaced as soon as a listener is added, so the stack decides everything. Resolves to
 * the uninstall.
 */
export async function installBackButton(app: AppLike, stack: BackStack): Promise<() => void> {
  const handle = await app.addListener('backButton', () => {
    stack.press();
  });
  return () => void handle.remove();
}

/**
 * The app's native build as a number, for `pickWebUpdate`'s `nativeBuild`: Android's versionCode, iOS's
 * CFBundleVersion (its first number, for "508.1"). `Infinity` where there is no native layer (a browser), so every
 * web update fits; 0 when the build cannot be read, so none that needs native code does.
 */
export async function nativeBuildOf(app: Pick<AppLike, 'getInfo'> | null | undefined): Promise<number> {
  if (!app?.getInfo) return Infinity;
  try {
    const n = parseInt((await app.getInfo()).build, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    // the web build of the App plugin throws: a browser has no native build
    return Infinity;
  }
}

/** Options for `capacitorConfig`: what differs between games. */
export interface MobileConfigOptions {
  /** Reverse-domain id, as the stores know it ("com.example.mygame"). */
  appId: string;
  appName: string;
  /** The built web, relative to the project (default 'dist'). */
  webDir?: string;
  /** Behind the web view while it loads, and under the safe-area bands (default black). */
  backgroundColor?: string;
  /** Let Chrome's and Safari's inspectors attach (default false: on for a debug build only). */
  debug?: boolean;
  /** Anything else, laid over the defaults (`plugins`, `server`, …). */
  extra?: Record<string, unknown>;
}

/**
 * A `capacitor.config.ts` for a game, with the defaults a game wants rather than a web page's:
 *
 * - the page is served from `https://localhost` (Android) so cookies, `crypto.subtle` and service workers behave as on
 *   the web, and nothing is fetched over plain http;
 * - the web view does not scroll, bounce or zoom on iOS, and draws edge to edge (`contentInset: 'never'`, mind the
 *   safe area: `safeAreaInsets`);
 * - the splash screen stays until the game hides it (`SplashScreen.hide()` once the first scene draws), so the player
 *   never sees a blank web view;
 * - `@capgo/capacitor-updater` does not update on its own: the engine's `pickWebUpdate` decides.
 *
 * ```ts
 * // capacitor.config.ts
 * import { capacitorConfig } from '1681-engine/mobile';
 * export default capacitorConfig({ appId: 'com.example.mygame', appName: 'My Game', debug: process.env.DEBUG === '1' });
 * ```
 */
export function capacitorConfig(options: MobileConfigOptions): Record<string, unknown> {
  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(options.appId)) {
    throw new Error(`capacitorConfig: appId must be reverse-domain, like com.example.game (got '${options.appId}')`);
  }
  const bg = options.backgroundColor ?? '#000000';
  const debug = options.debug ?? false;
  const base: Record<string, unknown> = {
    appId: options.appId,
    appName: options.appName,
    webDir: options.webDir ?? 'dist',
    backgroundColor: bg,
    server: { androidScheme: 'https', cleartext: false },
    android: { backgroundColor: bg, allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: debug },
    ios: { backgroundColor: bg, contentInset: 'never', scrollEnabled: false, webContentsDebuggingEnabled: debug },
    plugins: {
      SplashScreen: { launchAutoHide: false, backgroundColor: bg, showSpinner: false },
      CapacitorUpdater: { autoUpdate: false },
    },
  };
  return merge(base, options.extra ?? {});
}

function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const under = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && under && typeof under === 'object' && !Array.isArray(under)
        ? merge(under as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}
