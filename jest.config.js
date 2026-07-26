/**
 * Two projects, because the testing weight is deliberately lopsided.
 *
 * `logic` runs pure TypeScript — /src/game, /src/decks, /src/storage and the
 * pure parts of /src/ui — under plain node with no renderer and no native
 * mocks. That is where the spec says the bugs will be, and those tests should
 * stay fast enough to run on every save.
 *
 * `app` runs component smoke tests under the jest-expo preset.
 */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          { tsconfig: { module: 'commonjs', jsx: 'react-jsx', types: ['jest', 'node'] } },
        ],
      },
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/app/**/*.test.tsx'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
