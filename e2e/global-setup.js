'use strict';

const { execSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BACKEND_PORT = 18000;
const CUSTOMER_PORT = 13000;
const STAFF_PORT = 13001;
const TIMEOUT_MS = 60_000;

/**
 * Wait until an HTTP GET to url returns 200, or throw on timeout.
 */
function waitForServer(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function poll() {
      http.get(url, (res) => {
        if (res.statusCode === 200) return resolve();
        schedule();
      }).on('error', () => schedule());
    }
    function schedule() {
      if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(poll, 500);
    }
    poll();
  });
}

module.exports = async function globalSetup() {
  const dbPath = path.join(os.tmpdir(), `e2e_${Date.now()}.db`);
  process.env._E2E_DB_PATH = dbPath;

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    ALLOW_BROWSER_QUEUE: '1',
    PORT: String(BACKEND_PORT),
    DB_PATH: dbPath,
    CORS_ORIGIN: `http://localhost:${CUSTOMER_PORT},http://localhost:${STAFF_PORT}`
  };

  const backendProc = spawn('node', ['server.js'], {
    cwd: path.join(ROOT, 'backend'),
    env,
    stdio: 'ignore',
    detached: false
  });
  backendProc.unref();
  global.__E2E_BACKEND__ = backendProc;

  const customerEnv = {
    ...process.env,
    NODE_ENV: 'test',
    NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
    NEXT_PUBLIC_ALLOW_BROWSER_QUEUE: '1',
    PORT: String(CUSTOMER_PORT)
  };

  const customerProc = spawn(
    'npx', ['next', 'dev', '-p', String(CUSTOMER_PORT)],
    { cwd: path.join(ROOT, 'frontend-customer'), env: customerEnv, stdio: 'ignore', detached: false }
  );
  customerProc.unref();
  global.__E2E_CUSTOMER__ = customerProc;

  const staffEnv = {
    ...process.env,
    NODE_ENV: 'test',
    NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
    PORT: String(STAFF_PORT)
  };

  const staffProc = spawn(
    'npx', ['next', 'dev', '-p', String(STAFF_PORT)],
    { cwd: path.join(ROOT, 'frontend-staff'), env: staffEnv, stdio: 'ignore', detached: false }
  );
  staffProc.unref();
  global.__E2E_STAFF__ = staffProc;

  await Promise.all([
    waitForServer(`http://localhost:${BACKEND_PORT}/health`),
    waitForServer(`http://localhost:${CUSTOMER_PORT}`),
    waitForServer(`http://localhost:${STAFF_PORT}`)
  ]);
};
