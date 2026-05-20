const { line } = require('./client');
const { isLineConfigured } = require('./client');
const { getWaitingCount, formatWaitingReply, isWaitingCountMessage } = require('./waitingCount');
const { parsePostbackData, saveFeedback, replyMessage } = require('./feedback');

function createLineWebhookHandler(db) {
  return async (req, res) => {
    if (!isLineConfigured()) {
      return res.status(503).send('LINE not configured');
    }
    const signature = req.headers['x-line-signature'];
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      return res.status(400).send('Invalid body');
    }
    const raw = body.toString();
    try {
      if (!line.validateSignature(raw, process.env.LINE_CHANNEL_SECRET, signature)) {
        return res.status(401).send('Invalid signature');
      }
    } catch {
      return res.status(401).send('Invalid signature');
    }

    let events;
    try {
      events = JSON.parse(raw).events || [];
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    res.status(200).send('OK');

    for (const event of events) {
      try {
        await handleEvent(db, event);
      } catch (err) {
        console.error('LINE event error:', err);
      }
    }
  };
}

async function handleEvent(db, event) {
  const userId = event.source?.userId;
  if (event.type === 'follow' && userId) {
    const liffHint = process.env.NEXT_PUBLIC_LIFF_ID
      ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`
      : '門口 QR 碼';
    await replyMessage(event.replyToken,
      `歡迎光臨香港鑫華茶餐廳！\n請掃描門口 QR 線上取號：\n${liffHint}\n\n也可點選下方選單「現場等候」查詢等候組數。`);
    return;
  }

  if (event.type === 'postback' && userId) {
    const data = parsePostbackData(event.postback?.data);
    if (data.action === 'waiting_count') {
      const count = await getWaitingCount(db);
      await replyMessage(event.replyToken, formatWaitingReply(count));
      return;
    }
    if (data.action === 'feedback' && data.queueId && data.rating) {
      const result = await saveFeedback(db, {
        queueId: Number(data.queueId),
        lineUserId: userId,
        rating: data.rating
      });
      await replyMessage(event.replyToken, result.reply);
      return;
    }
  }

  if (event.type === 'message' && event.message?.type === 'text' && userId) {
    const text = event.message.text;
    if (isWaitingCountMessage(text)) {
      const count = await getWaitingCount(db);
      await replyMessage(event.replyToken, formatWaitingReply(count));
    }
  }
}

module.exports = { createLineWebhookHandler };
