'use strict';

const { defineConfig, devices } = require('@playwright/test');

const BACKEND_PORT = 18000;
const CUSTOMER_PORT = 13000;
const STAFF_PORT = 13001;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],

  use: {
    headless: true,
    video: 'off',
    screenshot: 'only-on-failure'
  },

  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});

// Export ports for use in tests
module.exports.BACKEND_PORT = BACKEND_PORT;
module.exports.CUSTOMER_PORT = CUSTOMER_PORT;
module.exports.STAFF_PORT = STAFF_PORT;
