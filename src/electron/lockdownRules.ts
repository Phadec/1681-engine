import type { InputLike } from './electronLike';

/**
 * The links a locked-down window may open in the system browser: https only, no credentials in the URL, to one of
 * `hosts` or a subdomain of it — or, for a host where anyone can publish a page (a code host), only under one of its
 * `paths`.
 */
export interface ExternalPolicy {
  /** Hosts allowed whole, each with its subdomains (`example.com` allows `www.example.com`). */
  hosts: readonly string[];
  /** Hosts allowed only under a path prefix (exact host, prefix compared case-insensitively), e.g. one owner's repositories. */
  paths?: readonly { host: string; prefix: string }[];
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Whether `url` is a link {@link ExternalPolicy} lets out to the system browser. */
export function isAllowedExternal(url: string, policy: ExternalPolicy): boolean {
  const u = parse(url);
  if (!u || u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  const scoped = (policy.paths ?? []).filter((p) => p.host.toLowerCase() === host);
  if (scoped.length) return scoped.some((p) => u.pathname.toLowerCase().startsWith(p.prefix.toLowerCase()));
  return policy.hosts.some((h) => {
    const want = h.toLowerCase();
    return host === want || host.endsWith(`.${want}`);
  });
}

/**
 * The game's own page: the bundled `file://` build, or the dev server's origin in a dev run. Anything else followed
 * inside the window would replace the game with a web page that has the shell's preload API.
 */
export function isAllowedNavigation(url: string, devServerUrl?: string): boolean {
  const u = parse(url);
  if (!u) return false;
  if (devServerUrl) {
    const dev = parse(devServerUrl);
    return !!dev && u.origin === dev.origin;
  }
  return u.protocol === 'file:';
}

/** The keys that open DevTools (F12, Ctrl/Cmd+Shift/Alt+I/J/C), refused in a packaged build. */
export function isDevToolsKey(input: InputLike): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.key === 'F12') return true;
  const key = input.key.toLowerCase();
  const mod = input.control || input.meta;
  return mod && (input.shift || input.alt) && (key === 'i' || key === 'j' || key === 'c');
}

/** Chromium and Node switches that attach a debugger to a running app. */
export const DEBUG_SWITCHES: readonly string[] = ['--inspect', '--remote-debugging-port', '--remote-debugging-pipe', '--remote-debugging-address'];
const DEBUG_SWITCH_NAMES = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'];

/** Whether the command line (`argv`, or a switch Chromium parsed: `hasSwitch`) asks for a debugger. */
export function debuggerRequested(argv: readonly string[], hasSwitch: (name: string) => boolean = () => false): boolean {
  const flagged = argv.some((arg) => DEBUG_SWITCHES.some((s) => arg === s || arg.startsWith(`${s}=`) || arg.startsWith(`${s}-`)));
  return flagged || DEBUG_SWITCH_NAMES.some((s) => hasSwitch(s));
}
