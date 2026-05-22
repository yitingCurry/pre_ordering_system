async function countWaitingAhead(db, queueId) {
  const row = await db.get(
    "SELECT COUNT(*) AS c FROM queue WHERE status = 'waiting' AND id < ?",
    [queueId]
  );
  return row?.c ?? 0;
}

module.exports = { countWaitingAhead };
