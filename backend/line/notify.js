const { getClient, isLineConfigured } = require('./client');
const {
  SKIP_RULE_SHORT,
  SKIP_RULE_CALLED,
  WAITING_STAY_HINT,
  SKIP_REASON_NOTE
} = require('./queueCopy');

const SEATED_DURATION = () => Number(process.env.SEATED_DURATION_MINUTES) || 60;

function formatLineError(err) {
  if (err?.body?.message) return String(err.body.message);
  if (err?.originalError?.response?.data?.message) return String(err.originalError.response.data.message);
  return err?.message || 'LINE push failed';
}

/** @returns {{ ok: boolean, skipped?: boolean, reason?: string, error?: string }} */
function pushResult(ok, { skipped, reason, error } = {}) {
  return { ok, skipped: !!skipped, reason: reason || null, error: error || null };
}

async function pushToUser(lineUserId, messages) {
  if (!lineUserId) return pushResult(false, { skipped: true, reason: 'no_line_user_id' });
  if (!isLineConfigured()) return pushResult(false, { skipped: true, reason: 'line_not_configured' });
  const client = getClient();
  try {
    await client.getProfile(lineUserId);
  } catch (err) {
    const error = `userId 無法用於此官方帳號推播（LIFF 可能綁在另一個 Provider 的 Channel）：${formatLineError(err)}`;
    console.error('LINE getProfile failed:', error);
    return pushResult(false, { error });
  }
  try {
    await client.pushMessage({ to: lineUserId, messages });
    return pushResult(true);
  } catch (err) {
    const error = formatLineError(err);
    console.error('LINE push failed:', error);
    return pushResult(false, { error });
  }
}

function formatOrderSummary(order) {
  if (!order?.items?.length) return '（尚未預點餐）';
  const items = order.items;
  const maxLines = 5;
  const lines = items.slice(0, maxLines).map((item) => {
    const qty = item.quantity > 0 ? item.quantity : 1;
    return `・${item.name} × ${qty}`;
  });
  if (items.length > maxLines) {
    lines.push(`…等 ${items.length} 項`);
  }
  return `預點摘要：\n${lines.join('\n')}`;
}

async function pushQueueTaken(queue, aheadCount) {
  if (!queue?.lineUserId) return pushResult(false, { skipped: true, reason: 'no_line_user_id' });
  const party = queue.partySize > 0 ? queue.partySize : 1;
  return pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `取號成功！\n你的號碼是 ${queue.number}（${party} 位）\n前方約 ${aheadCount} 組等候。\n\n輪到時會 LINE 通知。可輸入「我的號碼」或點選選單查詢狀態。\n\n${SKIP_RULE_SHORT}`
  }]);
}

async function pushCalled(queue, order = null) {
  if (!queue?.lineUserId) return;
  const party = queue.partySize > 0 ? queue.partySize : 1;
  const summary = formatOrderSummary(order);
  await pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `輪到你了！請前往櫃台。\n你的號碼是 ${queue.number}（${party} 位）。\n\n${SKIP_RULE_CALLED}\n\n${summary}`
  }]);
}

async function pushSkipped(queue) {
  if (!queue?.lineUserId) return;
  await pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `你的號碼 ${queue.number} 已過號（${SKIP_REASON_NOTE}）。\n若要繼續候位請重新取號，或向櫃台詢問。`
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
    text: `就快到了！你的號碼 ${queue.number} 前方約 ${aheadCount} 組，請留意叫號。\n${WAITING_STAY_HINT}\n${SKIP_RULE_SHORT}`
  }]);
}

async function pushSeatedWarn(queue, minutesLeft) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [{
    type: 'text',
    text: `用餐時間提醒：號碼 ${queue.number} 還剩約 ${minutesLeft} 分鐘。如需加點請洽店員。`
  }]);
}

function buildFeedbackIntroText(queue, { timeUp = false } = {}) {
  const prefix = timeUp
    ? `用餐時間已到，感謝光臨！你的號碼是 ${queue.number}。`
    : `感謝光臨！你的號碼是 ${queue.number}。`;
  return `${prefix}\n\n請協助我們改進，約 1 分鐘完成問卷：\n① 整體 ② 等候 ③ 餐點 ④ 服務\n點選下方按鈕評分，完成後可留言（可略過）。`;
}

function ratingButton(queueId, dim, rating, label, primary = false) {
  return {
    type: 'button',
    style: primary ? 'primary' : 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label,
      data: `action=feedback&queueId=${queueId}&dim=${dim}&rating=${rating}`,
      displayText: `${label}`
    }
  };
}

function buildDimensionRow(queueId, dim, dimLabel) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    spacing: 'xs',
    contents: [
      { type: 'text', text: dimLabel, size: 'sm', weight: 'bold', color: '#333333' },
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          ratingButton(queueId, dim, 'good', '滿意', dim === 'overall'),
          ratingButton(queueId, dim, 'ok', '普通'),
          ratingButton(queueId, dim, 'bad', '不滿意')
        ]
      }
    ]
  };
}

function buildFeedbackDimensionsFlex(queueId) {
  const footerContents = [
    buildDimensionRow(queueId, 'overall', '整體滿意度'),
    buildDimensionRow(queueId, 'wait', '等候體驗'),
    buildDimensionRow(queueId, 'food', '餐點'),
    buildDimensionRow(queueId, 'service', '服務')
  ];

  return {
    type: 'flex',
    altText: '用餐體驗問卷：請為整體、等候、餐點、服務評分',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '用餐體驗問卷', weight: 'bold', size: 'lg' },
          { type: 'text', text: '每項請點選一個', size: 'xs', color: '#888888', margin: 'sm' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerContents
      }
    }
  };
}

/** @deprecated 相容舊呼叫 */
function buildFeedbackFlex(queueId) {
  return buildFeedbackDimensionsFlex(queueId);
}

async function pushSeatedTimeUp(queue) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [
    { type: 'text', text: buildFeedbackIntroText(queue, { timeUp: true }) },
    buildFeedbackDimensionsFlex(queue.id)
  ]);
}

/** 提早離開：不發時間到／預警，只發回饋問卷 */
async function pushFeedbackOnly(queue) {
  if (!queue?.lineUserId) return false;
  return pushToUser(queue.lineUserId, [
    { type: 'text', text: buildFeedbackIntroText(queue) },
    buildFeedbackDimensionsFlex(queue.id)
  ]);
}

module.exports = {
  pushCalled,
  pushQueueTaken,
  pushSkipped,
  pushSeatedWelcome,
  pushAlmostCalled,
  pushSeatedWarn,
  pushSeatedTimeUp,
  pushFeedbackOnly,
  formatOrderSummary,
  buildFeedbackFlex,
  buildFeedbackIntroText,
  buildFeedbackDimensionsFlex,
  pushToUser
};
