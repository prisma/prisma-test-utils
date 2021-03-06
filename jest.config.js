const path = require('path')

module.exports = {
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '/tests/.*test\\.tsx?$',
  testPathIgnorePatterns: ['/node_modules/', '/__fixtures__/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!src/generator.ts',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/generated/**',
    '!**/tests/**',
  ],
  verbose: true,
  coverageDirectory: './coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  globalSetup: path.join(__dirname, './tests/__setup__/setup.ts'),
  globalTeardown: path.join(__dirname, './tests/__setup__/teardown.ts'),
}
