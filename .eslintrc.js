module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['unused-imports'],
  rules: {
    // Defer unused-var reporting to the plugin (below) so it isn't double-reported as an error.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    // Auto-removable dead imports; unused vars warn (allow _-prefixed throwaways).
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    // Route logging through src/infrastructure/logging/logger instead of raw console.
    'no-console': 'error',
  },
  overrides: [
    {
      // The logger is the one sanctioned place that touches console.
      files: ['src/infrastructure/logging/logger.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
