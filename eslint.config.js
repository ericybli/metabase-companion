// Flat ESLint config: Expo's recommended rules + Prettier compatibility.
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
  eslintConfigPrettier,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'coverage/*', 'scripts/*'],
  },
];
