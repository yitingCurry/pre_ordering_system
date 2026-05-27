'use strict';

const fs = require('fs');

module.exports = async function globalTeardown() {
  for (const key of ['__E2E_BACKEND__', '__E2E_CUSTOMER__', '__E2E_STAFF__']) {
    const proc = global[key];
    if (proc) {
      try { proc.kill(); } catch { /* ignore */ }
    }
  }
  const dbPath = process.env._E2E_DB_PATH;
  if (dbPath) {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  }
};
