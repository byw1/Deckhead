import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '@/hooks/useAppFonts';
import { color } from '@/ui/tokens';

export default function RootLayout() {
  const fontsReady = useAppFonts();

  // Holding the splash rather than flashing unstyled text. The card face is
  // the identity of the app; rendering a frame without it looks broken.
  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.ink },
        }}
      />
    </SafeAreaProvider>
  );
}
