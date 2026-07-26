import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { areTeamsReady, MAX_TEAMS, MIN_TEAMS } from '@/game/teams';
import { useHaptics } from '@/hooks/useHaptics';
import { useNewGameStore } from '@/hooks/useNewGameStore';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { StepHeader } from '@/ui/StepHeader';
import { Text } from '@/ui/Text';
import { color, radius, space, type as typeScale } from '@/ui/tokens';

/**
 * Step two of three: teams, or not.
 *
 * "Just play" comes first and is the default, because plenty of groups do not
 * want teams and making them set some up before playing is the friction that
 * gets an app deleted. It is still a team underneath, so scoring has one path.
 */
export default function NewGameTeamsScreen() {
  const router = useRouter();
  const haptics = useHaptics();

  const mode = useNewGameStore((s) => s.mode);
  const teams = useNewGameStore((s) => s.teams);
  const soloPlayers = useNewGameStore((s) => s.soloPlayers);
  const setMode = useNewGameStore((s) => s.setMode);
  const setTeamCount = useNewGameStore((s) => s.setTeamCount);
  const renameTeam = useNewGameStore((s) => s.renameTeam);
  const setTeamPlayers = useNewGameStore((s) => s.setTeamPlayers);
  const setSoloPlayers = useNewGameStore((s) => s.setSoloPlayers);

  const ready = mode === 'justPlay' || areTeamsReady(teams);

  return (
    <Screen>
      <StepHeader step={2} of={3} title="Players" subtitle="Teams are optional" />

      <ScrollView contentContainerStyle={styles.body} keyboardDismissMode="on-drag">
        <View style={styles.modeRow}>
          <Chip
            label="Just play"
            selected={mode === 'justPlay'}
            onPress={() => {
              haptics.select();
              setMode('justPlay');
            }}
            accessibilityLabel="Just play, no teams"
          />
          <Chip
            label="Teams"
            selected={mode === 'teams'}
            onPress={() => {
              haptics.select();
              setMode('teams');
            }}
          />
        </View>

        {mode === 'justPlay' ? (
          <View style={styles.section}>
            <Text variant="caption" tone="faint" style={styles.label}>
              WHO IS PLAYING
            </Text>
            <Text variant="caption" tone="muted" style={styles.help}>
              Optional. Add names and Deckhead will rotate who holds the phone and keep a score for
              each person.
            </Text>
            <PlayerList names={soloPlayers} onChange={setSoloPlayers} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text variant="caption" tone="faint" style={styles.label}>
              HOW MANY TEAMS
            </Text>
            <View style={styles.countRow}>
              {Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => i + MIN_TEAMS).map(
                (count) => (
                  <Chip
                    key={count}
                    label={String(count)}
                    selected={teams.length === count}
                    onPress={() => {
                      haptics.select();
                      setTeamCount(count);
                    }}
                    accessibilityLabel={`${count} ${count === 1 ? 'team' : 'teams'}`}
                  />
                ),
              )}
            </View>

            {teams.map((team) => (
              <View key={team.id} style={styles.team}>
                <View style={styles.teamHeader}>
                  <View style={[styles.teamDot, { backgroundColor: team.color }]} />
                  <TextInput
                    value={team.name}
                    onChangeText={(name) => renameTeam(team.id, name)}
                    placeholder="Team name"
                    placeholderTextColor={color.inkFaint}
                    accessibilityLabel="Team name"
                    style={styles.teamName}
                    maxLength={24}
                  />
                </View>
                <PlayerList
                  names={team.playerNames}
                  onChange={(names) => setTeamPlayers(team.id, names)}
                />
              </View>
            ))}

            {!ready ? (
              <Text variant="caption" tone="muted" style={styles.help}>
                Every team needs a name, and no two the same.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Next"
          variant="primary"
          disabled={!ready}
          onPress={() => router.push('/new/settings')}
        />
      </View>
    </Screen>
  );
}

/**
 * Names as free text, one per line.
 *
 * A row of add-a-name fields is more taps and more chrome. People setting this
 * up are usually reading names off a room, and a single box keeps up with them.
 */
function PlayerList({ names, onChange }: { names: string[]; onChange: (names: string[]) => void }) {
  const [draft, setDraft] = useState(names.join('\n'));

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        onChange(text.split('\n'));
      }}
      placeholder={'Sam\nAlex\nJo'}
      placeholderTextColor={color.inkFaint}
      accessibilityLabel="Player names, one per line"
      multiline
      autoCapitalize="words"
      autoCorrect={false}
      style={styles.players}
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.xl, gap: space.md },
  modeRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  section: { gap: space.sm },
  label: { paddingHorizontal: space.lg, paddingTop: space.sm, letterSpacing: 1.2 },
  help: { paddingHorizontal: space.lg },
  countRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, flexWrap: 'wrap' },
  team: { gap: space.sm, paddingTop: space.md },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  teamDot: { width: 16, height: 16, borderRadius: radius.pill },
  teamName: {
    ...typeScale.body,
    flex: 1,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  players: {
    ...typeScale.body,
    minHeight: 96,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginHorizontal: space.lg,
    textAlignVertical: 'top',
  },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
