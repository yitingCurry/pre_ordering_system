'use strict';

const express = require('express');
const cors = require('cors');
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
  const DB_PATH = dbPath || process.env.DB_PATH || path.join(__dirname, '..', 'database', 'restaurant.db');

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
        pushQueueTaken: () => Promise.resolve(),
        pushCalled: () => Promise.resolve(),
        pushSkipped: () => Promise.resolve(),
        pushSeatedWelcome: () => Promise.resolve(),
        pushFeedbackOnly: () => Promise.resolve(false)
      }
    : require('./line/notify');

  const { createLineWebhookHandler } = require('./line/webhook');
  const { startSeatTimerJob } = require('./line/seatedTimer');
  const { isLineConfigured } = require('./line/client');
  const { formatFeedbackItem } = require('./line/feedback');
  const { labelRating } = require('./line/feedbackLabels');
  const { countWaitingAhead } = require('./line/queueHelpers');

  // ---- App setup ----
  const app = express();

  function getCorsOrigins() {
    if (!process.env.CORS_ORIGIN) return true;
    const list = process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
    if (process.env.NODE_ENV !== 'production') {
      return [...new Set([...list, 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'])];
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

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend', line: isLineConfigured() }));

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
      if (created.lineUserId) {
        countWaitingAhead(dbApi, created.id)
          .then((ahead) => notify.pushQueueTaken(created, ahead))
          .catch((e) => console.error('pushQueueTaken', e));
      }
      res.status(201).json(created);
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
          feedbackSent = await notify.pushFeedbackOnly(updated);
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
      res.json({ items, count: items.length });
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
