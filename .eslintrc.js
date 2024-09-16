module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    greasemonkey: true,
    node: true,
    jquery: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
};
