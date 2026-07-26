import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { color } from './tokens';

export type ScreenProps = {
  children: ReactNode;
  /** Which insets to respect. Round screens opt out entirely to go full bleed. */
  edges?: readonly Edge[];
  style?: ViewStyle;
};

/** Standard menu screen: ink background, safe-area aware. */
export function Screen({ children, edges = ['top', 'bottom'], style }: ScreenProps) {
  return (
    <SafeAreaView style={styles.fill} edges={edges}>
      <View style={[styles.fill, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: color.ink,
  },
});
