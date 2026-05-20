const { getClient } = require('./client');

function parsePostbackData(data) {
  if (!data) return {};
  const params = {};
  for (const part of data.split('&')) {
    const [k, v] = part.split('=');
    if (k) params[k] = decodeURIComponent(v || '');
  }
  return params;
}

async function saveFeedback(db, { queueId, lineUserId, rating }) {
  const queue = await db.get('SELECT * FROM queue WHERE id = ?', [queueId]);
  if (!queue) return { ok: false, reply: '找不到對應的取號紀錄。' };
  if (queue.lineUserId && queue.lineUserId !== lineUserId) {
    return { ok: false, reply: '此回饋與你的帳號不符。' };
  }
  const existing = await db.get('SELECT id FROM feedback_responses WHERE queueId = ?', [queueId]);
  if (existing) return { ok: true, duplicate: true, reply: '已收到您的回饋，謝謝！' };

  await db.run(
    'INSERT INTO feedback_responses (queueId, lineUserId, rating) VALUES (?, ?, ?)',
    [queueId, lineUserId, rating]
  );
  return { ok: true, reply: '感謝您的回饋！' };
}

async function replyMessage(replyToken, text) {
  const client = getClient();
  if (!client || !replyToken) return;
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }]
    });
  } catch (err) {
    console.error('LINE reply failed:', err.message);
  }
}

module.exports = { parsePostbackData, saveFeedback, replyMessage };
