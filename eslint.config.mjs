export default [
  {
    ignores: ['dist/**', '.next/**', '.vinext/**', '.wrangler/**', '.sites-runtime/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-unsafe-finally': 'error',
      'no-unused-labels': 'error',
      'valid-typeof': 'error',
    },
  },
];
