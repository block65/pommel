module.exports = {
  hooks: {
    // 'pre-commit': './bin/lint-staged.sh',
    'pre-commit': 'pretty-quick --staged',
    'commit-msg': 'commitlint -E HUSKY_GIT_PARAMS',
  },
};
