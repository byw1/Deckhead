import { Anton_400Regular, useFonts } from '@expo-google-fonts/anton';

/**
 * Loads the card typeface. UI type uses the system face and needs no loading.
 *
 * Returns true once the app can render. Font loading failures resolve rather
 * than reject: a missing card face is a legibility regression, not a reason to
 * refuse to start a party game.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ Anton_400Regular });
  return loaded || error !== null;
}
