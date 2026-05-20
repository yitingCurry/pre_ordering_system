async function getWaitingCount(db) {
  const row = await db.get("SELECT COUNT(*) AS c FROM queue WHERE status = 'waiting'");
  return row?.c ?? 0;
}

function formatWaitingReply(count) {
  return `目前全店等候約 ${count} 組。掃描門口 QR 可線上取號。`;
}

const WAITING_KEYWORDS = ['等候', '候位', '幾組', '等待', '排隊', 'queue'];

function isWaitingCountMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  return WAITING_KEYWORDS.some((kw) => t.includes(kw));
}

module.exports = { getWaitingCount, formatWaitingReply, isWaitingCountMessage };
