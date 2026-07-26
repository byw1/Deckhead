import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { useHaptics } from '@/hooks/useHaptics';
import { color, font, space } from '@/ui/tokens';

const COUNT_FROM = 3;
const TICK_MS = 800;

/**
 * Who is up, then 3-2-1.
 *
 * The countdown is the moment the phone goes to the forehead, so it is large
 * enough to read while it is moving and each beat is a haptic — the holder will
 * not be looking at the screen by the time it hits one.
 */
export default function RoundIntroScreen() {
  const router = useRouter();
  const { playerName } = useLocalSearchParams<{ playerName?: string }>();
  const [count, setCount] = useState(COUNT_FROM);
  const haptics = useHaptics();

  useRoundScreenMode({ landscape: true });

  useEffect(() => {
    haptics.countdownTick();

    const id = setInterval(() => {
      setCount((current) => {
        if (current <= 1) {
          clearInterval(id);
          router.replace('/round/play');
          return 0;
        }
        haptics.countdownTick();
        return current - 1;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [haptics, router]);

  const who = playerName ? `${playerName}, phone on your forehead` : 'Phone on your forehead';

  return (
    <Pressable
      style={styles.screen}
      // Skipping is deliberate rather than accidental: some groups are ready
      // before the app is, and waiting out three seconds every round grates.
      onPress={() => router.replace('/round/play')}
      accessibilityRole="button"
      accessibilityLabel={`${who}. Starting in ${count}. Tap to start now.`}
    >
      <View style={styles.body}>
        <Text style={styles.who} allowFontScaling={false}>
          {who.toUpperCase()}
        </Text>
        <Text style={styles.count} allowFontScaling={false}>
          {count > 0 ? count : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ink,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  who: {
    fontFamily: font.card,
    fontSize: 34,
    lineHeight: 38,
    color: color.bone,
    textAlign: 'center',
    paddingHorizontal: space.xl,
  },
  count: {
    fontFamily: font.card,
    fontSize: 120,
    lineHeight: 128,
    color: color.brand,
  },
});
