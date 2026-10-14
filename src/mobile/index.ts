/*
 * `1681-engine/mobile`: shipping a game as a phone app on Capacitor. Capacitor is handed in, never imported: its
 * plugins' types here are structural subsets, so a build that is not a phone app never needs it installed.
 */
export { BackStack, doubleBackToExit, type BackHandler, type DoubleBackOptions } from './backButton';
export { installBackButton, nativeBuildOf, capacitorConfig, type AppLike, type ListenerHandle, type MobileConfigOptions } from './capacitor';
export { safeAreaInsets, keepScreenOn, type Insets, type WakeLockLike } from './screen';
