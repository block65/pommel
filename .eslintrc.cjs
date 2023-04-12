module.exports = {
  root: true,
  extends: ['@block65/eslint-config'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json', './__tests__/tsconfig.json'],
  },
};
