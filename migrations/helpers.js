function isDevNetwork(network) {
  return network === 'development'
          || network === 'test'
          || network === 'develop'
          || network === 'dev'
          || network === 'docker'
          || network === 'coverage';
}

module.exports = {
  isDevNetwork
};
