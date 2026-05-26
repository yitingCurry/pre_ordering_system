const { countWaitingAhead } = require('./queueHelpers');
const { SKIP_RULE_SHORT, SKIP_RULE_CALLED } = require('./queueCopy');

const STATUS_LABELS = {
  waiting: '等待叫號中',
  called: '輪到你了，請前往櫃台',
  skipped: '已過號',
  seated: '已入座'
};

function getLiffUrl() {
  const id = process.env.NEXT_PUBLIC_LIFF_ID || process.env.LIFF_ID;
  return id ? `https://liff.line.me/${id}` : null;
}

async function getActiveQueueByLineUserId(db, lineUserId) {
  return db.get(
    "SELECT * FROM queue WHERE lineUserId = ? AND status IN ('waiting','called','skipped','seated') ORDER BY id DESC LIMIT 1",
    [lineUserId]
  );
}

async function getMyStatusReply(db, lineUserId) {
  const queue = await getActiveQueueByLineUserId(db, lineUserId);
  const liffUrl = getLiffUrl();

  if (!queue) {
    const hint = liffUrl ? `\n請掃描門口 QR 取號：\n${liffUrl}` : '\n請掃描門口 QR 線上取號。';
    return `目前沒有進行中的候位。${hint}`;
  }

  const party = queue.partySize > 0 ? queue.partySize : 1;
  const statusLabel = STATUS_LABELS[queue.status] || queue.status;
  let text = `你的號碼：${queue.number}\n用餐人數：${party} 位\n狀態：${statusLabel}`;

  if (queue.status === 'waiting') {
    const ahead = await countWaitingAhead(db, queue.id);
    text += `\n前方約 ${ahead} 組\n\n${SKIP_RULE_SHORT}`;
  }

  if (queue.status === 'called') {
    text += `\n\n${SKIP_RULE_CALLED}`;
  }

  if (queue.status === 'skipped') {
    text += '\n若要繼續候位請重新取號或洽櫃台。';
  }

  return text;
}

const MY_STATUS_KEYWORDS = ['我的號碼', '候位', '號碼狀態', '排隊狀態', '我的排隊'];

function isMyStatusMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  return MY_STATUS_KEYWORDS.some((kw) => t.includes(kw));
}

module.exports = { getMyStatusReply, isMyStatusMessage };
