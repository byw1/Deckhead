// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    // Build-time scripts run under Node, not in the app bundle.
    files: ['spec/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', require: 'readonly', module: 'writable' },
    },
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
            {
              name: 'zustand',
              // zustand/vanilla is pure, but the default entry pulls in React
              // via useSyncExternalStore. Stores live in /src/hooks.
              message: '/src/game holds rules, not state containers. Put the store in /src/hooks.',
            },
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
