import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Deckhead</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14121A',
  },
  title: {
    color: '#F5F2EC',
    fontSize: 32,
  },
});
