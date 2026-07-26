import { useMemo } from 'react';
import { createHaptics, type AppHaptics } from '@/ui/haptics';
import { useSettingsStore } from './useSettings';

/**
 * Haptics bound to the current setting.
 *
 * Memoised on the setting rather than held in a ref, so turning haptics off
 * takes effect immediately instead of at the next mount.
 */
export function useHaptics(): AppHaptics {
  const enabled = useSettingsStore((s) => s.haptics);
  return useMemo(() => createHaptics({ enabled }), [enabled]);
}
