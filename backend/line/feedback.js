const { getClient } = require('./client');
const { labelRating, labelDim } = require('./feedbackLabels');

const VALID_RATINGS = new Set(['good', 'ok', 'bad']);
const VALID_DIMS = new Set(['overall', 'wait', 'food', 'service']);
const DIM_COLUMN = {
  overall: 'rating',
  wait: 'rating_wait',
  food: 'rating_food',
  service: 'rating_service'
};

const DIM_FIELDS = [
  { key: 'overall', column: 'rating' },
  { key: 'wait', column: 'rating_wait' },
  { key: 'food', column: 'rating_food' },
  { key: 'service', column: 'rating_service' }
];

function emptyDimensionCounts(label) {
  return { label, good: 0, ok: 0, bad: 0, total: 0 };
}

function buildFeedbackSummary(rows) {
  const dimensions = {};
  for (const { key } of DIM_FIELDS) {
    dimensions[key] = emptyDimensionCounts(labelDim(key));
  }

  let completeCount = 0;
  let totalVotes = 0;

  for (const row of rows || []) {
    if (isFeedbackComplete(row)) completeCount += 1;

    for (const { key, column } of DIM_FIELDS) {
      const value = row[column];
      if (!VALID_RATINGS.has(value)) continue;
      dimensions[key][value] += 1;
      dimensions[key].total += 1;
      totalVotes += 1;
    }
  }

  const responseCount = rows?.length || 0;

  return {
    responseCount,
    completeCount,
    inProgressCount: responseCount - completeCount,
    dimensions,
    totalVotes
  };
}

const SKIP_COMMENT_WORDS = new Set(['略過', '跳过', '跳過', '不用', '無', '无']);

function parsePostbackData(data) {
  if (!data) return {};
  const params = {};
  for (const part of data.split('&')) {
    const [k, v] = part.split('=');
    if (k) params[k] = decodeURIComponent(v || '');
  }
  return params;
}

function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

function isFeedbackComplete(row) {
  if (!row) return false;
  return (
    hasValue(row.rating)
    && hasValue(row.rating_wait)
    && hasValue(row.rating_food)
    && hasValue(row.rating_service)
  );
}

function isFeedbackFinished(row) {
  return isFeedbackComplete(row) && !row.awaiting_comment;
}

async function getFeedbackByQueueId(db, queueId) {
  return db.get('SELECT * FROM feedback_responses WHERE queueId = ?', [queueId]);
}

async function getAwaitingCommentSession(db, lineUserId) {
  return db.get(
    `SELECT * FROM feedback_responses
     WHERE lineUserId = ? AND awaiting_comment = 1
     ORDER BY id DESC LIMIT 1`,
    [lineUserId]
  );
}

async function handleFeedbackPostback(db, { queueId, lineUserId, dim, rating }) {
  if (!VALID_DIMS.has(dim) || !VALID_RATINGS.has(rating)) {
    return { reply: '無效的評分選項，請重新點選問卷按鈕。' };
  }

  const queue = await db.get('SELECT * FROM queue WHERE id = ?', [queueId]);
  if (!queue) return { reply: '找不到對應的取號紀錄。' };
  if (queue.lineUserId && queue.lineUserId !== lineUserId) {
    return { reply: '此回饋與你的帳號不符。' };
  }

  let row = await getFeedbackByQueueId(db, queueId);
  if (row && isFeedbackFinished(row)) {
    return { reply: '已收到您的回饋，謝謝！' };
  }

  const col = DIM_COLUMN[dim];
  if (!row) {
    await db.run(
      `INSERT INTO feedback_responses (queueId, lineUserId, rating, rating_wait, rating_food, rating_service, awaiting_comment)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        queueId,
        lineUserId,
        dim === 'overall' ? rating : '',
        dim === 'wait' ? rating : null,
        dim === 'food' ? rating : null,
        dim === 'service' ? rating : null
      ]
    );
  } else {
    await db.run(`UPDATE feedback_responses SET ${col} = ? WHERE queueId = ?`, [rating, queueId]);
  }

  row = await getFeedbackByQueueId(db, queueId);

  if (!isFeedbackComplete(row)) {
    const missing = ['overall', 'wait', 'food', 'service'].filter((d) => !hasValue(row[DIM_COLUMN[d]]));
    const missingLabels = missing.map(labelDim).join('、');
    return {
      reply: `已記錄「${labelDim(dim)}」：${labelRating(rating)}。\n請繼續點選：${missingLabels}。`
    };
  }

  if (!row.awaiting_comment) {
    await db.run('UPDATE feedback_responses SET awaiting_comment = 1 WHERE queueId = ?', [queueId]);
    return {
      reply: '感謝評分！最後一步：請輸入意見或建議（直接打字即可），或回覆「略過」結束。'
    };
  }

  return { reply: '請輸入意見或回覆「略過」以完成回饋。' };
}

async function handleFeedbackComment(db, { lineUserId, text }) {
  const session = await getAwaitingCommentSession(db, lineUserId);
  if (!session) return null;

  const trimmed = text.trim();
  if (SKIP_COMMENT_WORDS.has(trimmed)) {
    await db.run(
      'UPDATE feedback_responses SET awaiting_comment = 0, comment = NULL WHERE id = ?',
      [session.id]
    );
    return { reply: '感謝您的回饋，期待再次光臨！' };
  }

  const comment = trimmed.slice(0, 500);
  await db.run(
    'UPDATE feedback_responses SET comment = ?, awaiting_comment = 0 WHERE id = ?',
    [comment, session.id]
  );
  return { reply: '感謝您的寶貴意見，我們會持續改進！' };
}

/** @deprecated 相容舊單一 postback */
async function saveFeedback(db, { queueId, lineUserId, rating }) {
  return handleFeedbackPostback(db, {
    queueId,
    lineUserId,
    dim: 'overall',
    rating
  });
}

function toMessages(payload) {
  if (Array.isArray(payload)) return payload;
  return [{ type: 'text', text: String(payload) }];
}

async function replyMessage(replyToken, payload) {
  const client = getClient();
  if (!client || !replyToken) return;
  const messages = toMessages(payload).slice(0, 5);
  if (!messages.length) return;
  try {
    await client.replyMessage({ replyToken, messages });
  } catch (err) {
    console.error('LINE reply failed:', err.message);
  }
}

function formatFeedbackItem(row) {
  const complete = isFeedbackComplete(row);
  return {
    id: row.id,
    queueId: row.queueId,
    queueNumber: row.queueNumber,
    lineUserId: row.lineUserId,
    rating: row.rating,
    rating_wait: row.rating_wait,
    rating_food: row.rating_food,
    rating_service: row.rating_service,
    comment: row.comment,
    created_at: row.created_at,
    complete,
    finished: isFeedbackFinished(row)
  };
}

module.exports = {
  parsePostbackData,
  handleFeedbackPostback,
  handleFeedbackComment,
  getAwaitingCommentSession,
  saveFeedback,
  replyMessage,
  formatFeedbackItem,
  buildFeedbackSummary,
  isFeedbackComplete,
  isFeedbackFinished,
  DIM_FIELDS,
  labelRating,
  labelDim
};
