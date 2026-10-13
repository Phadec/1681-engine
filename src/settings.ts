/**
 * The few player settings the engine itself reads. A game keeps its own settings store and mirrors these fields
 * into this one (`engineSettings.set`) whenever they change; the engine never reads the game's store.
 */
export interface EngineSettings {
  /** Fewer particles and lighter effects. */
  reducedFx: boolean;
  /** Turns off everything that only costs battery: transient lights, heavy particles. */
  batterySaver: boolean;
  /** Short-lived lights a fight throws into the dark (`pixel/lights.ts`). */
  combatLights: boolean;
  /** 0–1, the combat sounds' volume (`audio/SoundEngine.ts`). */
  sfxVolume: number;
  /** 0–1, the music's volume. */
  musicVolume: number;
}

export type SettingsListener = (s: EngineSettings) => void;

const DEFAULTS: EngineSettings = {
  reducedFx: false,
  batterySaver: false,
  combatLights: true,
  sfxVolume: 0.8,
  musicVolume: 0.6,
};

let state: EngineSettings = { ...DEFAULTS };
const listeners = new Set<SettingsListener>();

/** Same shape as the zustand stores the game used (`getState`, `subscribe`), so moved code reads it unchanged. */
export const engineSettings = {
  getState(): EngineSettings {
    return state;
  },
  set(patch: Partial<EngineSettings>): void {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l(state);
  },
  subscribe(listener: SettingsListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    engineSettings.set(DEFAULTS);
  },
};
