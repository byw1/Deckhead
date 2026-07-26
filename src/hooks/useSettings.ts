import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/**
 * App settings.
 *
 * Backed by expo-sqlite/kv-store rather than react-native-mmkv. MMKV v4 is a
 * Nitro module and cannot run in Expo Go, which would force a development build
 * for every review. kv-store fills the same role — synchronous reads, tiny
 * values — with no extra native dependency. See ROADMAP.md; this is the M3
 * decision the spec's stack list points at.
 *
 * Reads are synchronous so the first render already has the right values and
 * nothing flickers from a default to a stored setting.
 */

export type Settings = {
  haptics: boolean;
  /**
   * Off by default, deliberately. A ding for "correct" tells the guesser they
   * got it before anyone speaks, and it leaks across the room.
   */
  sound: boolean;
  /** Tap is the default. Tilt is opt-in and arrives in M6. */
  inputMode: 'tap' | 'tilt';
  boostBrightness: boolean;
};

export const defaultAppSettings: Settings = {
  haptics: true,
  sound: false,
  inputMode: 'tap',
  boostBrightness: true,
};

const STORAGE_KEY = 'settings.v1';

function load(): Settings {
  try {
    const raw = Storage.getItemSync(STORAGE_KEY);
    if (!raw) return defaultAppSettings;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultAppSettings;

    // Merged over defaults rather than trusted wholesale, so a settings blob
    // written by an older build gains new keys instead of leaving them
    // undefined.
    return { ...defaultAppSettings, ...(parsed as Partial<Settings>) };
  } catch {
    return defaultAppSettings;
  }
}

type SettingsStore = Settings & {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  resetAll(): void;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...load(),

  set(key, value) {
    set({ [key]: value } as Pick<Settings, typeof key>);
    persist(get());
  },

  resetAll() {
    set(defaultAppSettings);
    persist(defaultAppSettings);
  },
}));

function persist(settings: Settings): void {
  const { haptics, sound, inputMode, boostBrightness } = settings;
  void Storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ haptics, sound, inputMode, boostBrightness }),
  ).catch(() => undefined);
}

/**
 * The settings values alone, without the setters.
 *
 * useShallow is load bearing: zustand v5 compares with Object.is, so a selector
 * building a fresh object every call would re-render forever without it.
 */
export function useSettings(): Settings {
  return useSettingsStore(
    useShallow((s) => ({
      haptics: s.haptics,
      sound: s.sound,
      inputMode: s.inputMode,
      boostBrightness: s.boostBrightness,
    })),
  );
}
