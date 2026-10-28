// Single provider instance for the process. Replace with a real AWS provider for production use.
const { MockCloudProvider } = require('./provider');
module.exports = new MockCloudProvider();
