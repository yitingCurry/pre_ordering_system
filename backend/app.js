'use strict';

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * createApp({ dbPath, disableTimers, disableNotify })
 *
 * Returns { app, db, close }
 *   - app           : Express instance (not yet listening)
 *   - db            : sqlite3 Database instance
 *   - close()       : gracefully closes DB (and timer if running)
 */
function createApp({ dbPath, disableTimers = false, disableNotify = false } = {}) {
  const configuredDbPath = dbPath || process.env.DB_PATH;
  const DB_PATH = (() => {
    if (!configuredDbPath) return path.join(__dirname, '..', 'database', 'restaurant.db');
    if (configuredDbPath === ':memory:' || configuredDbPath.startsWith('file:')) return configuredDbPath;
    if (path.isAbsolute(configuredDbPath)) return configuredDbPath;
    return path.resolve(__dirname, '..', configuredDbPath);
  })();

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new sqlite3.Database(DB_PATH);

  // ---- DB helpers ----
  function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
  function getSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }
  function allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  const dbApi = { run: runSql, get: getSql, all: allSql };

  // ---- External modules (notify / timer may be disabled for tests) ----
  const notify = disableNotify
    ? {
        pushQueueTaken: () => Promise.resolve({ ok: true }),
        pushCalled: () => Promise.resolve({ ok: true }),
        pushSkipped: () => Promise.resolve({ ok: true }),
        pushSeatedWelcome: () => Promise.resolve({ ok: true }),
        pushFeedbackOnly: () => Promise.resolve({ ok: true })
      }
    : require('./line/notify');

  const { createLineWebhookHandler } = require('./line/webhook');
  const { startSeatTimerJob } = require('./line/seatedTimer');
  const { isLineConfigured } = require('./line/client');
  const { formatFeedbackItem, buildFeedbackSummary } = require('./line/feedback');
  const { labelRating } = require('./line/feedbackLabels');
  const { countWaitingAhead } = require('./line/queueHelpers');
  const { loadMenuItems } = require('./line/menuItems');

  // ---- App setup ----
  const app = express();

  function getCorsOrigins() {
    if (!process.env.CORS_ORIGIN) return true;
    const list = process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
    if (process.env.NODE_ENV !== 'production') {
      return [...new Set([...list, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3080'])];
    }
    return list;
  }
  app.use(cors({ origin: getCorsOrigins() }));
  app.post('/line/webhook', express.raw({ type: '*/*' }), createLineWebhookHandler(dbApi));
  app.use(express.json());

  // ---- DB init ----
  async function ensureColumn(table, column, definition) {
    const columns = await allSql(`PRAGMA table_info(${table})`);
    if (!columns.some((c) => c.name === column)) {
      await runSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  async function initDb() {
    await runSql(`CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      deviceToken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await runSql(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queueId INTEGER NOT NULL,
      items TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (queueId) REFERENCES queue(id)
    )`);
    await runSql(`CREATE TABLE IF NOT EXISTS feedback_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queueId INTEGER NOT NULL,
      lineUserId TEXT NOT NULL,
      rating TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (queueId) REFERENCES queue(id)
    )`);
    await runSql(`CREATE TABLE IF NOT EXISTS dish_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menuItemId TEXT NOT NULL,
      dishName TEXT NOT NULL,
      reviewer TEXT,
      rating TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await runSql('CREATE INDEX IF NOT EXISTS idx_dish_reviews_menu_item_id ON dish_reviews(menuItemId)');
    await runSql(`CREATE TABLE IF NOT EXISTS dish_review_summaries (
      menuItemId TEXT PRIMARY KEY,
      dishName TEXT NOT NULL,
      summary TEXT NOT NULL,
      reviewCount INTEGER NOT NULL,
      reviewsHash TEXT NOT NULL,
      model TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await ensureColumn('queue', 'deviceToken', 'TEXT');
    await ensureColumn('queue', 'partySize', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('queue', 'lineUserId', 'TEXT');
    await ensureColumn('queue', 'seatedAt', 'DATETIME');
    await ensureColumn('queue', 'almostCalledSentAt', 'DATETIME');
    await ensureColumn('queue', 'seatedWarn10SentAt', 'DATETIME');
    await ensureColumn('queue', 'seatedReminderSentAt', 'DATETIME');
    await ensureColumn('queue', 'feedbackRequestedAt', 'DATETIME');
    await ensureColumn('feedback_responses', 'rating_wait', 'TEXT');
    await ensureColumn('feedback_responses', 'rating_food', 'TEXT');
    await ensureColumn('feedback_responses', 'rating_service', 'TEXT');
    await ensureColumn('feedback_responses', 'comment', 'TEXT');
    await ensureColumn('feedback_responses', 'awaiting_comment', 'INTEGER NOT NULL DEFAULT 0');
  }

  // ---- Pure helpers ----
  function parseOrder(order) {
    if (!order) return null;
    return { ...order, items: JSON.parse(order.items) };
  }

  function allowBrowserQueue() {
    return process.env.ALLOW_BROWSER_QUEUE === '1' || process.env.NODE_ENV !== 'production';
  }

  function getCategorySql(category) {
    switch (category) {
      case '1-2': return 'partySize <= 2';
      case '3-4': return 'partySize BETWEEN 3 AND 4';
      case '5-6': return 'partySize BETWEEN 5 AND 6';
      case '7+':  return 'partySize >= 7';
      default:    return null;
    }
  }

  function getCategoryLabel(category) {
    switch (category) {
      case '1-2': return '1-2位';
      case '3-4': return '3-4位';
      case '5-6': return '5-6位';
      case '7+':  return '7位以上';
      default:    return '未知類別';
    }
  }

  async function getNextWaitingByCategory(category) {
    const where = getCategorySql(category);
    if (!where) return null;
    return getSql(`SELECT * FROM queue WHERE status='waiting' AND ${where} ORDER BY id ASC LIMIT 1`);
  }

  async function getActiveQueueByDevice(deviceToken) {
    return getSql(
      "SELECT * FROM queue WHERE deviceToken = ? AND status IN ('waiting','called','skipped','seated') ORDER BY id DESC LIMIT 1",
      [deviceToken]
    );
  }

  async function getActiveQueueByLineUserId(lineUserId) {
    return getSql(
      "SELECT * FROM queue WHERE lineUserId = ? AND status IN ('waiting','called','skipped','seated') ORDER BY id DESC LIMIT 1",
      [lineUserId]
    );
  }

  async function getQueueDetail(queueId) {
    const queue = await getSql('SELECT * FROM queue WHERE id = ?', [queueId]);
    if (!queue) return null;
    const order = await getSql('SELECT * FROM orders WHERE queueId = ?', [queueId]);
    return { queue, order: parseOrder(order) };
  }

  async function callWaitingQueueRow(queueId) {
    const target = await getSql('SELECT * FROM queue WHERE id = ?', [queueId]);
    if (!target) return { error: '找不到號碼', status: 404 };
    if (target.status !== 'waiting') {
      return { error: '僅能對「等待中」的號碼叫號', status: 400 };
    }
    await runSql("UPDATE queue SET status = 'called' WHERE id = ?", [queueId]);
    const called = await getSql('SELECT * FROM queue WHERE id = ?', [queueId]);
    const orderRow = await getSql('SELECT * FROM orders WHERE queueId = ?', [queueId]);
    notify.pushCalled(called, parseOrder(orderRow)).catch((e) => console.error('pushCalled', e));
    return { called };
  }

  function normalizeOrderItems(items) {
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Math.max(0, Number(item.price) || 0),
      quantity: Math.max(1, Number(item.quantity) || 1),
      variant: item.variant || '',
      category: item.category || '',
      note: item.note || '',
      options: Array.isArray(item.options) ? item.options : []
    }));
  }

  function sumOrderItemsTotal(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const unit = Number(item.price) || 0;
      return sum + unit * (item.quantity || 1);
    }, 0);
  }

  function getGeminiConfig() {
    return {
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    };
  }

  function hashReviewsForCache(reviews) {
    const payload = reviews
      .slice(0, 20)
      .map((review) => `${review.id}|${review.rating || ''}|${review.content || ''}`)
      .sort()
      .join('\n');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  async function saveDishSummaryCache({ menuItemId, dishName, summary, reviewCount, reviewsHash, model }) {
    await runSql(
      `INSERT INTO dish_review_summaries (menuItemId, dishName, summary, reviewCount, reviewsHash, model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(menuItemId) DO UPDATE SET
         dishName = excluded.dishName,
         summary = excluded.summary,
         reviewCount = excluded.reviewCount,
         reviewsHash = excluded.reviewsHash,
         model = excluded.model,
         updated_at = CURRENT_TIMESTAMP`,
      [menuItemId, dishName, summary, reviewCount, reviewsHash, model]
    );
  }

  function countHanChars(text) {
    const matches = String(text || '').match(/\p{Script=Han}/gu);
    return matches ? matches.length : 0;
  }

  function cleanSummary(text) {
    return String(text || '')
      .replace(/^摘要[:：]\s*/, '')
      .replace(/["'`「」『』]/g, '')
      .split(/\n+/)[0]
      .replace(/[ \t\r\n]+/g, '')
      .trim();
  }

  function isPoorSummary(summary) {
    const han = countHanChars(summary);
    if (han < 12) return true;
    const chunks = String(summary || '')
      .split(/[\s,，、；;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (chunks.length >= 3 && chunks.every((part) => countHanChars(part) <= 5)) return true;
    return false;
  }

  function normalizeSummaryText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
  }

  function isDishNameOnlySummary(summary, dishName) {
    const s = normalizeSummaryText(summary);
    const name = normalizeSummaryText(dishName);
    if (!s) return true;
    if (s === name) return true;
    if (name.includes(s) && s.length <= Math.min(6, name.length)) return true;
    if (s.includes(name) && s.length <= name.length + 2) return true;
    return false;
  }

  function buildDishSummaryPrompt(menuItem, reviewText, retry) {
    const lines = [
      '你是餐廳店員，要把 Google 評論整理成「一句完整話」給同事快速閱讀。',
      `菜名：${menuItem.name}`,
      '',
      '規則：',
      '1. 只根據下方評論，不得捏造。',
      '2. 不要寫菜名，不要列關鍵詞，不要用空格或頓號串多個短詞。',
      '3. 只輸出一條通順的繁體中文句子，共 15 到 22 個中文字，句尾不要標點。',
      '4. 句子至少提到兩點，例如口味、口感、份量、鹹淡、油膩、推薦與否。',
      '',
      '正確範例（完整一句，不是關鍵詞）：',
      '外皮酥脆內餡多汁多數客人覺得份量很足夠',
      '醬汁偏鹹但很下飯很適合配白飯一起吃',
      '',
      '錯誤範例（禁止）：',
      '香酥多汁份量足',
      '清爽解 牛肉口感軟 千萬別',
      '',
      '評論：',
      reviewText
    ];
    if (retry) {
      lines.push('', '你上一輪回覆太短或像關鍵詞列表。請改寫成 15 到 22 個中文字的完整一句話。');
    }
    return lines.join('\n');
  }

  async function requestDishSummaryFromGemini({ apiKey, model, prompt }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    };
    const bodyWithThinking = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 256,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };
    const bodyPlain = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 256
      }
    };

    let response;
    try {
      response = await axios.post(url, bodyWithThinking, { headers, timeout: 20000 });
    } catch (e) {
      const status = e.response?.status;
      if (status !== 400 && status !== 422) throw e;
      response = await axios.post(url, bodyPlain, { headers, timeout: 20000 });
    }

    return response.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('') || '';
  }

  async function summarizeDishReviews(menuItem, reviews) {
    const { apiKey, model } = getGeminiConfig();
    if (!apiKey) {
      return { summary: '', aiAvailable: false, error: 'GEMINI_API_KEY is not configured' };
    }

    const reviewText = reviews
      .map((review, index) => `${index + 1}. ${review.rating ? `[${review.rating}] ` : ''}${review.content}`)
      .join('\n')
      .slice(0, 6000);

    if (!reviewText) {
      return { summary: '暫無評論', aiAvailable: true, error: null };
    }

    let lastSummary = '';
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = buildDishSummaryPrompt(menuItem, reviewText, attempt > 0);
        const text = await requestDishSummaryFromGemini({ apiKey, model, prompt });
        const summary = cleanSummary(text);
        lastSummary = summary;
        if (isDishNameOnlySummary(summary, menuItem.name)) continue;
        if (isPoorSummary(summary)) continue;
        return { summary, aiAvailable: true, error: null };
      }

      if (isDishNameOnlySummary(lastSummary, menuItem.name)) {
        return { summary: '', aiAvailable: true, error: 'AI returned dish name only' };
      }
      if (lastSummary) {
        return { summary: lastSummary, aiAvailable: true, error: null };
      }
      return { summary: '摘要產生失敗', aiAvailable: true, error: null };
    } catch (e) {
      console.error('summarizeDishReviews', e.response?.data || e.message || e);
      return { summary: '', aiAvailable: true, error: 'AI summary failed' };
    }
  }

  // ---- Routes ----
  app.get('/', async (req, res) => {
    const active = await getSql("SELECT * FROM queue WHERE status='called' ORDER BY id DESC LIMIT 1").catch(() => null);
    res.send(`
      <html><body style="font-family:sans-serif;padding:24px">
        <h1>Restaurant MVP Backend</h1>
        <p>服務狀態正常。LINE: ${isLineConfigured() ? '已設定' : '未設定'}</p>
        <ul>
          <li>Health：<a href="/health">/health</a></li>
          <li>Webhook：<code>POST /line/webhook</code></li>
        </ul>
        <p>目前叫號：${active ? active.number : '尚未叫號'}</p>
      </body></html>
    `);
  });

  app.get('/health', async (req, res) => {
    const payload = { status: 'ok', service: 'backend', line: isLineConfigured() };
    if (!isLineConfigured()) return res.json(payload);
    try {
      const client = require('./line/client').getClient();
      const bot = await client.getBotInfo();
      payload.lineBot = { displayName: bot.displayName, basicId: bot.basicId || null };
    } catch (e) {
      payload.lineBot = { error: e.message || 'LINE token 無效' };
    }
    res.json(payload);
  });

  app.get('/customer-state/:deviceToken', async (req, res) => {
    try {
      const activeQueue = await getActiveQueueByDevice(req.params.deviceToken);
      if (!activeQueue) return res.json({ activeQueue: null, order: null });
      const order = await getSql('SELECT * FROM orders WHERE queueId = ?', [activeQueue.id]);
      res.json({ activeQueue, order: parseOrder(order) });
    } catch {
      res.status(500).json({ error: '取得顧客狀態失敗' });
    }
  });

  app.get('/customer-state/line/:lineUserId', async (req, res) => {
    try {
      const activeQueue = await getActiveQueueByLineUserId(req.params.lineUserId);
      if (!activeQueue) return res.json({ activeQueue: null, order: null });
      const order = await getSql('SELECT * FROM orders WHERE queueId = ?', [activeQueue.id]);
      res.json({ activeQueue, order: parseOrder(order) });
    } catch {
      res.status(500).json({ error: '取得顧客狀態失敗' });
    }
  });

  app.get('/queue/:id/detail', async (req, res) => {
    try {
      const detail = await getQueueDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: '找不到號碼' });
      res.json(detail);
    } catch {
      res.status(500).json({ error: '取得號碼詳情失敗' });
    }
  });

  app.post('/queue', async (req, res) => {
    try {
      const { deviceToken, lineUserId, partySize: rawParty } = req.body;
      if (!lineUserId && !deviceToken) {
        return res.status(400).json({ error: '缺少身份識別（請使用 LINE 掃碼取號）' });
      }
      if (!lineUserId && deviceToken && !allowBrowserQueue()) {
        return res.status(400).json({ error: '請使用 LINE 掃描門口 QR 取號以接收通知' });
      }

      let partySize = 1;
      if (rawParty !== undefined && rawParty !== null && rawParty !== '') {
        const n = Number(rawParty);
        if (!Number.isInteger(n) || n < 1 || n > 20) {
          return res.status(400).json({ error: '用餐人數須為 1–20 的整數' });
        }
        partySize = n;
      }

      const token = deviceToken || (lineUserId ? `line_${lineUserId}` : null);
      const row = await getSql('SELECT MAX(number) AS maxNumber FROM queue');
      const nextNumber = (row?.maxNumber || 0) + 1;
      const result = await runSql(
        'INSERT INTO queue (number, status, deviceToken, partySize, lineUserId) VALUES (?, ?, ?, ?, ?)',
        [nextNumber, 'waiting', token, partySize, lineUserId || null]
      );
      const created = await getSql('SELECT * FROM queue WHERE id = ?', [result.lastID]);
      let lineNotify = { ok: false, skipped: true, reason: 'no_line_user_id', error: null };
      if (created.lineUserId) {
        try {
          const ahead = await countWaitingAhead(dbApi, created.id);
          lineNotify = await notify.pushQueueTaken(created, ahead);
        } catch (e) {
          console.error('pushQueueTaken', e);
          lineNotify = { ok: false, skipped: false, reason: null, error: e.message || 'push failed' };
        }
      }
      res.status(201).json({ ...created, lineNotify });
    } catch {
      res.status(500).json({ error: '建立號碼失敗' });
    }
  });

  app.get('/queue', async (req, res) => {
    try {
      const rows = await allSql(`
        SELECT
          q.*,
          EXISTS(SELECT 1 FROM orders o WHERE o.queueId = q.id) AS hasOrder
        FROM queue q
        ORDER BY q.id ASC
      `);
      const current = rows.find((r) => r.status === 'called') || null;
      const waitingCount = rows.filter((r) => r.status === 'waiting').length;
      res.json({ current, waitingCount, queue: rows });
    } catch {
      res.status(500).json({ error: '取得隊列失敗' });
    }
  });

  app.post('/queue/next', async (req, res) => {
    try {
      const category = req.query.category;
      let next;
      if (category) {
        next = await getNextWaitingByCategory(category);
        if (!next) return res.json({ message: `目前沒有 ${getCategoryLabel(category)} 的等待號碼`, current: null });
      } else {
        next = await getSql("SELECT * FROM queue WHERE status='waiting' ORDER BY id ASC LIMIT 1");
        if (!next) return res.json({ message: '目前沒有等待中的號碼', current: null });
      }
      const result = await callWaitingQueueRow(next.id);
      if (result.error) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      res.json(result.called);
    } catch {
      res.status(500).json({ error: '叫號失敗' });
    }
  });

  app.post('/queue/:id/call', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '無效的號碼 id' });
      const result = await callWaitingQueueRow(id);
      if (result.error) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      res.json(result.called);
    } catch {
      res.status(500).json({ error: '叫號失敗' });
    }
  });

  app.post('/queue/:id/skip', async (req, res) => {
    try {
      const queue = await getSql('SELECT * FROM queue WHERE id = ?', [req.params.id]);
      if (!queue) return res.status(404).json({ error: '找不到號碼' });
      if (queue.status === 'done') return res.status(400).json({ error: '號碼已完成，無法過號' });
      await runSql("UPDATE queue SET status = 'skipped' WHERE id = ?", [req.params.id]);
      const updated = await getSql('SELECT * FROM queue WHERE id = ?', [req.params.id]);
      notify.pushSkipped(updated).catch((e) => console.error('pushSkipped', e));
      res.json(updated);
    } catch {
      res.status(500).json({ error: '過號操作失敗' });
    }
  });

  app.post('/queue/:id/seat', async (req, res) => {
    try {
      const queue = await getSql('SELECT * FROM queue WHERE id = ?', [req.params.id]);
      if (!queue) return res.status(404).json({ error: '找不到號碼' });
      if (queue.status === 'done') return res.status(400).json({ error: '號碼已完成，無法確認入座' });
      await runSql(
        "UPDATE queue SET status = 'seated', seatedAt = COALESCE(seatedAt, CURRENT_TIMESTAMP) WHERE id = ?",
        [req.params.id]
      );
      const updated = await getSql('SELECT * FROM queue WHERE id = ?', [req.params.id]);
      notify.pushSeatedWelcome(updated).catch((e) => console.error('pushSeatedWelcome', e));
      res.json(updated);
    } catch {
      res.status(500).json({ error: '確認入座失敗' });
    }
  });

  app.post('/queue/:id/leave', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '無效的號碼 id' });
      const queue = await getSql('SELECT * FROM queue WHERE id = ?', [id]);
      if (!queue) return res.status(404).json({ error: '找不到號碼' });
      if (queue.status !== 'seated') {
        return res.status(400).json({ error: '僅能對「已入座」的號碼結束用餐' });
      }

      await runSql(
        `UPDATE queue SET status = 'done',
          seatedWarn10SentAt = COALESCE(seatedWarn10SentAt, CURRENT_TIMESTAMP),
          seatedReminderSentAt = COALESCE(seatedReminderSentAt, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [id]
      );
      const updated = await getSql('SELECT * FROM queue WHERE id = ?', [id]);

      let feedbackSent = false;
      let feedbackSkipped = false;
      if (updated.lineUserId) {
        const existing = await getSql('SELECT id FROM feedback_responses WHERE queueId = ?', [id]);
        if (existing) {
          feedbackSkipped = true;
          await runSql('UPDATE queue SET feedbackRequestedAt = COALESCE(feedbackRequestedAt, CURRENT_TIMESTAMP) WHERE id = ?', [id]);
        } else {
          const pushResult = await notify.pushFeedbackOnly(updated);
          feedbackSent = pushResult?.ok === true;
          if (feedbackSent) {
            await runSql('UPDATE queue SET feedbackRequestedAt = CURRENT_TIMESTAMP WHERE id = ?', [id]);
          }
        }
      }

      const finalRow = await getSql('SELECT * FROM queue WHERE id = ?', [id]);
      res.json({ ...finalRow, feedbackSent, feedbackSkipped });
    } catch (e) {
      console.error('leave', e);
      res.status(500).json({ error: '結束用餐失敗' });
    }
  });

  app.post('/queue/clear', async (req, res) => {
    try {
      await runSql('DELETE FROM feedback_responses');
      await runSql('DELETE FROM orders');
      await runSql('DELETE FROM queue');
      res.json({ success: true, message: '今日列隊清單與預點餐草稿已清空。' });
    } catch {
      res.status(500).json({ error: '清空 queue 失敗' });
    }
  });

  app.post('/order', async (req, res) => {
    try {
      const { queueId, items, note = '' } = req.body;
      if (!queueId || !Array.isArray(items)) return res.status(400).json({ error: '資料格式錯誤' });
      const normalizedItems = normalizeOrderItems(items);
      const exists = await getSql('SELECT id FROM queue WHERE id=?', [queueId]);
      if (!exists) return res.status(404).json({ error: '找不到對應號碼' });
      const active = await getSql('SELECT id FROM orders WHERE queueId=?', [queueId]);
      if (active) {
        await runSql('UPDATE orders SET items=?, note=? WHERE queueId=?', [JSON.stringify(normalizedItems), note, queueId]);
      } else {
        await runSql('INSERT INTO orders (queueId, items, note) VALUES (?, ?, ?)', [queueId, JSON.stringify(normalizedItems), note]);
      }
      const order = await getSql('SELECT * FROM orders WHERE queueId=?', [queueId]);
      res.status(201).json(parseOrder(order));
    } catch {
      res.status(500).json({ error: '儲存預點餐失敗' });
    }
  });

  app.get('/order/:queueId', async (req, res) => {
    try {
      const order = await getSql('SELECT * FROM orders WHERE queueId=?', [req.params.queueId]);
      if (!order) return res.status(404).json({ error: '找不到預點餐資料' });
      res.json(parseOrder(order));
    } catch {
      res.status(500).json({ error: '取得預點餐失敗' });
    }
  });

  app.get('/orders/today-total', async (req, res) => {
    try {
      const rows = await allSql(
        `SELECT items FROM orders WHERE date(created_at) = date('now', 'localtime')`
      );
      let total = 0;
      for (const row of rows) {
        total += sumOrderItemsTotal(JSON.parse(row.items));
      }
      res.json({ total, orderCount: rows.length });
    } catch (e) {
      console.error('orders/today-total', e);
      res.status(500).json({ error: '取得今日餐點金額總和失敗' });
    }
  });

  app.get('/orders/today-items', async (req, res) => {
    try {
      const rows = await allSql(`SELECT items FROM orders WHERE date(created_at) = date('now', 'localtime')`);
      const counts = {};
      for (const row of rows) {
        let items = [];
        try { items = JSON.parse(row.items); } catch (e) { items = []; }
        if (!Array.isArray(items)) continue;
        for (const it of items) {
          const key = it.id || it.name || JSON.stringify(it);
          const name = it.name || (it.id ? `#${it.id}` : '未知品項');
          const qty = Number(it.quantity) || 1;
          if (!counts[key]) counts[key] = { id: it.id || null, name, count: 0 };
          counts[key].count += qty;
        }
      }
      const list = Object.values(counts).filter((i) => i.count > 0).sort((a, b) => b.count - a.count);
      res.json({ items: list });
    } catch (e) {
      console.error('orders/today-items', e);
      res.status(500).json({ error: '取得今日餐點品項失敗' });
    }
  });

  app.get('/feedback/today', async (req, res) => {
    try {
      const rows = await allSql(
        `SELECT f.*, q.number AS queueNumber
         FROM feedback_responses f
         JOIN queue q ON q.id = f.queueId
         WHERE date(f.created_at) = date('now', 'localtime')
         ORDER BY f.created_at DESC`
      );
      const items = rows.map((row) => ({
        ...formatFeedbackItem(row),
        ratingLabel: labelRating(row.rating),
        ratingWaitLabel: labelRating(row.rating_wait),
        ratingFoodLabel: labelRating(row.rating_food),
        ratingServiceLabel: labelRating(row.rating_service)
      }));
      res.json({
        items,
        count: items.length,
        summary: buildFeedbackSummary(rows)
      });
    } catch (e) {
      console.error('feedback/today', e);
      res.status(500).json({ error: '取得今日回饋失敗' });
    }
  });

  app.get('/menu-items/:id/reviews', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const rows = await allSql(
        `SELECT reviewer, rating, content
         FROM dish_reviews
         WHERE menuItemId = ?
         ORDER BY id DESC
         LIMIT ?`,
        [req.params.id, limit]
      );
      res.json({ menuItemId: req.params.id, count: rows.length, reviews: rows });
    } catch {
      res.status(500).json({ error: '取得餐點評論失敗' });
    }
  });

  app.get('/menu-items/review-summaries', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const { model } = getGeminiConfig();
      const rows = await allSql(
        `SELECT id, menuItemId, dishName, reviewer, rating, content
         FROM dish_reviews
         ORDER BY id DESC`
      );
      const nameById = new Map();
      try {
        for (const item of loadMenuItems()) {
          nameById.set(item.id, item.name);
        }
      } catch (e) {
        console.warn('loadMenuItems fallback to dish_reviews', e.message || e);
      }
      const reviewsByItem = rows.reduce((acc, row) => {
        if (!acc[row.menuItemId]) acc[row.menuItemId] = [];
        if (acc[row.menuItemId].length < 20) acc[row.menuItemId].push(row);
        if (!nameById.has(row.menuItemId)) {
          nameById.set(row.menuItemId, row.dishName || row.menuItemId);
        }
        return acc;
      }, {});

      const itemIds = Object.keys(reviewsByItem);
      if (!itemIds.length) {
        return res.json({
          aiAvailable: Boolean(getGeminiConfig().apiKey),
          model,
          items: [],
          cachedCount: 0,
          generatedCount: 0
        });
      }

      const summaries = [];
      let cachedCount = 0;
      let generatedCount = 0;

      for (const menuItemId of itemIds) {
        const reviews = reviewsByItem[menuItemId];
        const dishName = nameById.get(menuItemId) || menuItemId;
        const reviewsHash = hashReviewsForCache(reviews);
        const menuItem = { id: menuItemId, name: dishName };

        if (!forceRefresh) {
          const cached = await getSql(
            `SELECT summary, reviewCount, reviewsHash, model
             FROM dish_review_summaries
             WHERE menuItemId = ?`,
            [menuItemId]
          );
          if (
            cached &&
            cached.reviewsHash === reviewsHash &&
            cached.model === model &&
            cached.summary &&
            cached.summary !== '摘要產生失敗'
          ) {
            summaries.push({
              id: menuItemId,
              name: dishName,
              reviewCount: cached.reviewCount,
              summary: cached.summary,
              error: null,
              fromCache: true
            });
            cachedCount += 1;
            continue;
          }
        }

        const result = await summarizeDishReviews(menuItem, reviews);
        if (result.summary && !result.error && result.summary !== '摘要產生失敗') {
          await saveDishSummaryCache({
            menuItemId,
            dishName,
            summary: result.summary,
            reviewCount: reviews.length,
            reviewsHash,
            model
          });
          generatedCount += 1;
        }
        summaries.push({
          id: menuItemId,
          name: dishName,
          reviewCount: reviews.length,
          summary: result.summary,
          error: result.error || null,
          fromCache: false
        });
      }

      summaries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

      res.json({
        aiAvailable: Boolean(getGeminiConfig().apiKey),
        model,
        items: summaries,
        cachedCount,
        generatedCount,
        refreshed: forceRefresh
      });
    } catch (e) {
      console.error('menu-items/review-summaries', e);
      res.status(500).json({ error: 'Unable to load dish review summaries' });
    }
  });

  // ---- Startup ----
  async function start(port) {
    await initDb();
    if (!disableTimers) {
      startSeatTimerJob(dbApi);
    }
    return new Promise((resolve) => {
      const server = app.listen(port, () => {
        console.log(`backend running on ${port} (LINE ${isLineConfigured() ? 'on' : 'off'})`);
        resolve(server);
      });
    });
  }

  function close() {
    return new Promise((resolve) => db.close(resolve));
  }

  return { app, db, initDb, start, close, _helpers: { normalizeOrderItems, sumOrderItemsTotal, getCategorySql, getCategoryLabel } };
}

module.exports = { createApp };
