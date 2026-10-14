/**
 * `1681-engine/updates`: file-by-file web updates from a release store, the pure half — the feed's shapes, which web
 * to take, and what to copy or download to build it. No Node, DOM or Electron: shared by the desktop shell
 * (`1681-engine/electron`), a browser build and the phone apps.
 */
export {
  isNewer,
  safePath,
  isSha256,
  validManifest,
  fileUrl,
  type WebFile,
  type WebManifest,
  type LatestJson,
  type ReleaseFile,
} from './manifest';
export { planWeb, type WebPlan } from './webPlan';
export { pickWebUpdate, apkUpdateOf, pluginEntries, heldBundle, type WebBundle, type NewerRelease, type PluginEntry } from './pickUpdate';
