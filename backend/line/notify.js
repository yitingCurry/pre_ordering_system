const { getClient, isLineConfigured } = require('./client');

const SEATED_DURATION = () => Number(process.env.SEATED_DURATION_MINUTES) || 60;

async function pushToUser(lineUserId, messages) {
  if (!lineUserId || !isLineConfigured()) return false;
  const client = getClient();
  try {
    await client.pushMessage({ to: lineUserId, messages });
    return true;
  } catch (err) {
    console.error('LINE push failed:', err.message);
    return false;
  }
}

async function pushCalled(queue) {
  if (!queue?.lineUserId) return;
  const party = queue.partySize > 0 ? queue.partySize : 1;
  await pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `輪到你了！請前往櫃台。\n你的號碼是 ${queue.number}（${party} 位）。`
  }]);
}

async function pushSkipped(queue) {
  if (!queue?.lineUserId) return;
  await pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `你的號碼 ${queue.number} 已過號。\n若要繼續候位請重新取號，或向櫃台詢問。`
  }]);
}

async function pushSeatedWelcome(queue) {
  if (!queue?.lineUserId) return;
  const duration = SEATED_DURATION();
  await pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `已為你安排入座（號碼 ${queue.number}）。\n用餐時間約 ${duration} 分鐘，請留意 LINE 提醒。`
  }]);
}

async function pushAlmostCalled(queue, aheadCount) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `就快到了！你的號碼 ${queue.number} 前方約 ${aheadCount} 組，請留意叫號。`
  }]);
}

async function pushSeatedWarn(queue, minutesLeft) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `用餐時間提醒：號碼 ${queue.number} 還剩約 ${minutesLeft} 分鐘。如需加點請洽店員。`
  }]);
}

function buildFeedbackFlex(queueId) {
  const ratings = [
    { rating: 'good', label: '滿意' },
    { rating: 'ok', label: '普通' },
    { rating: 'bad', label: '不滿意' }
  ];
  return {
    type: 'flex',
    altText: '用餐體驗回饋',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '用餐體驗回饋', weight: 'bold', size: 'md' },
          { type: 'text', text: '請為本次用餐評分', size: 'sm', color: '#666666', margin: 'md' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: ratings.map(({ rating, label }) => ({
          type: 'button',
          style: rating === 'good' ? 'primary' : 'secondary',
          action: {
            type: 'postback',
            label,
            data: `action=feedback&queueId=${queueId}&rating=${rating}`,
            displayText: label
          }
        }))
      }
    }
  };
}

async function pushSeatedTimeUp(queue) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [
    {
      type: 'text',
      text: `用餐時間已到，感謝光臨！\n你的號碼是 ${queue.number}。如需加點請洽店員。`
    },
    buildFeedbackFlex(queue.id)
  ]);
}

/** 提早離開：不發時間到／預警，只發回饋問卷 */
async function pushFeedbackOnly(queue) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [
    {
      type: 'text',
      text: `感謝光臨！你的號碼是 ${queue.number}，歡迎為本次用餐評分。`
    },
    buildFeedbackFlex(queue.id)
  ]);
}

module.exports = {
  pushCalled,
  pushSkipped,
  pushSeatedWelcome,
  pushAlmostCalled,
  pushSeatedWarn,
  pushSeatedTimeUp,
  pushFeedbackOnly,
  buildFeedbackFlex,
  pushToUser
};
