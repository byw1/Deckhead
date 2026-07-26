import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeRoundId } from '@/game/ids';
import { whoseTurn } from '@/game/session';
import { useHaptics } from '@/hooks/useHaptics';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { useSessionStore } from '@/hooks/useSessionStore';
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
  const haptics = useHaptics();

  const session = useSessionStore((s) => s.session);
  const beginRound = useSessionStore((s) => s.beginRound);

  const [count, setCount] = useState(COUNT_FROM);

  useRoundScreenMode({ landscape: true });

  // Opens the round for whoever is up. Not persisted until the round
  // completes, so quitting here leaves the session where it was.
  useEffect(() => {
    beginRound(makeRoundId(), new Date().toISOString());
  }, [beginRound]);

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

  const turn = session ? whoseTurn(session) : null;
  const teamLabel = session && session.teams.length > 1 ? turn?.team.name : null;
  const who = turn?.playerName
    ? `${turn.playerName}, phone on your forehead`
    : 'Phone on your forehead';

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
        {teamLabel ? (
          <Text style={[styles.team, { color: turn?.team.color }]} allowFontScaling={false}>
            {teamLabel.toUpperCase()}
          </Text>
        ) : null}
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
  screen: { flex: 1, backgroundColor: color.ink },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  team: {
    fontFamily: font.card,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 2,
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
    fontSize: 110,
    lineHeight: 118,
    color: color.brand,
  },
});
