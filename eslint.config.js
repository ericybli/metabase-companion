// Flat ESLint config: Expo's recommended rules + Prettier compatibility.
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
  eslintConfigPrettier,
  {
    // i18next's default export IS the singleton instance; calling .use()/.changeLanguage()
    // on it is the intended API, so import/no-named-as-default-member is a false positive here.
    files: ['src/ui/i18n.ts'],
    rules: { 'import/no-named-as-default-member': 'off' },
  },
  {
    // googleAuth lazy-loads the native module via require() so password login runs
    // in Expo Go; the native dep must stay out of the startup module graph.
    files: ['src/auth/googleAuth.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'coverage/*', 'scripts/*'],
  },
];
