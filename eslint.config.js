// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    // SPEC hard rule: everything in /src/game is pure TypeScript. Scoring, round
    // resolution and win-condition evaluation must be unit-testable without a
    // renderer, so the boundary is enforced here rather than by discipline.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: '/src/game must stay pure TypeScript. No React.' },
            { name: 'react-native', message: '/src/game must stay pure TypeScript. No React Native.' },
          ],
          patterns: [
            {
              group: ['react-native/*', 'react/*', 'expo', 'expo-*', '@expo/*', '@/ui/*', '@/hooks/*'],
              message: '/src/game must stay pure TypeScript. No React, React Native, Expo or UI imports.',
            },
          ],
        },
      ],
    },
  },
]);
