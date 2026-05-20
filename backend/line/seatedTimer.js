const notify = require('./notify');

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function countWaitingAhead(db, queueId) {
  const row = await db.get(
    "SELECT COUNT(*) AS c FROM queue WHERE status = 'waiting' AND id < ?",
    [queueId]
  );
  return row?.c ?? 0;
}

async function runAlmostCalledJob(db) {
  const threshold = envInt('ALMOST_CALLED_AHEAD_COUNT', 2);
  const rows = await db.all(
    `SELECT * FROM queue
     WHERE status = 'waiting'
       AND lineUserId IS NOT NULL
       AND almostCalledSentAt IS NULL`
  );
  for (const row of rows) {
    const ahead = await countWaitingAhead(db, row.id);
    if (ahead > threshold) continue;
    const ok = await notify.pushAlmostCalled(row, ahead);
    if (ok) {
      await db.run('UPDATE queue SET almostCalledSentAt = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    }
  }
}

async function runSeatedWarnJob(db) {
  const duration = envInt('SEATED_DURATION_MINUTES', 60);
  const warnBefore = envInt('SEATED_WARN_BEFORE_MINUTES', 10);
  const warnAt = Math.max(0, duration - warnBefore);
  const rows = await db.all(
    `SELECT * FROM queue
     WHERE status = 'seated'
       AND lineUserId IS NOT NULL
       AND seatedAt IS NOT NULL
       AND seatedWarn10SentAt IS NULL
       AND datetime(seatedAt, '+' || ? || ' minutes') <= datetime('now')`,
    [warnAt]
  );
  for (const row of rows) {
    const ok = await notify.pushSeatedWarn(row, warnBefore);
    if (ok) {
      await db.run('UPDATE queue SET seatedWarn10SentAt = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    }
  }
}

async function runSeatedEndJob(db) {
  const duration = envInt('SEATED_DURATION_MINUTES', 60);
  const rows = await db.all(
    `SELECT * FROM queue
     WHERE status = 'seated'
       AND lineUserId IS NOT NULL
       AND seatedAt IS NOT NULL
       AND seatedReminderSentAt IS NULL
       AND datetime(seatedAt, '+' || ? || ' minutes') <= datetime('now')`,
    [duration]
  );
  for (const row of rows) {
    const ok = await notify.pushSeatedTimeUp(row);
    if (ok) {
      await db.run(
        `UPDATE queue SET seatedReminderSentAt = CURRENT_TIMESTAMP,
         feedbackRequestedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [row.id]
      );
    }
  }
}

async function runScheduledJobs(db) {
  try {
    await runAlmostCalledJob(db);
    await runSeatedWarnJob(db);
    await runSeatedEndJob(db);
  } catch (err) {
    console.error('seat timer job error:', err);
  }
}

function startSeatTimerJob(db) {
  const intervalMs = 60 * 1000;
  runScheduledJobs(db);
  return setInterval(() => runScheduledJobs(db), intervalMs);
}

module.exports = { startSeatTimerJob, runScheduledJobs };
