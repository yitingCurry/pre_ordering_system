'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../../app');

/**
 * Creates an isolated app instance backed by a temp SQLite file.
 * Call setup() before tests, teardown() after.
 */
function makeTestApp() {
  let instance;
  let dbPath;

  async function setup() {
    dbPath = path.join(os.tmpdir(), `test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    instance = createApp({ dbPath, disableTimers: true, disableNotify: true });
    await instance.initDb();
    return instance.app;
  }

  async function teardown() {
    await instance.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  }

  return { setup, teardown };
}

module.exports = { makeTestApp };
