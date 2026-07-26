import { Stack } from 'expo-router';

/**
 * Round screens are landscape and full bleed.
 *
 * Gestures are disabled throughout: a swipe-back mid-round would be a disaster
 * with the phone against a forehead, and the recap is reached by finishing,
 * not by going back.
 */
export default function RoundLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
      }}
    />
  );
}
