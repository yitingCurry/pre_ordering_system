const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');


const app = express();
const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'restaurant.db');

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function parseOrder(order) {
  if (!order) return null;
  return { ...order, items: JSON.parse(order.items) };
}

function parseOrderHistoryRecord(record) {
  if (!record) return null;
  return { ...record, items: JSON.parse(record.items) };
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    deviceToken TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queueId INTEGER NOT NULL,
    items TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (queueId) REFERENCES queue(id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queueId INTEGER,
    items TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn('queue', 'deviceToken', 'TEXT');
  await run("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('orderingEnabled', '1')");
}

async function getActiveQueueByDevice(deviceToken) {
  return get("SELECT * FROM queue WHERE deviceToken = ? AND status IN ('waiting','called','skipped','seated') ORDER BY id DESC LIMIT 1", [deviceToken]);
}

async function getQueueDetail(queueId) {
  const queue = await get('SELECT * FROM queue WHERE id = ?', [queueId]);
  if (!queue) return null;
  const order = await get('SELECT * FROM orders WHERE queueId = ?', [queueId]);
  return { queue, order: parseOrder(order) };
}

app.get('/', async (req, res) => {
  const active = await get("SELECT * FROM queue WHERE status='called' ORDER BY id DESC LIMIT 1").catch(() => null);
  res.send(`
    <html><body style="font-family:sans-serif;padding:24px">
      <h1>Restaurant MVP Backend</h1>
      <p>服務狀態正常。</p>
      <ul>
        <li>顧客端：<a href="http://localhost:3000">http://localhost:3000</a></li>
        <li>店員端：<a href="http://localhost:3001">http://localhost:3001</a></li>
        <li>Health：<a href="/health">/health</a></li>
      </ul>
      <p>目前叫號：${active ? active.number : '尚未叫號'}</p>
    </body></html>
  `);
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend' }));

app.get('/ordering-status', async (req, res) => {
  try {
    const row = await get("SELECT value FROM app_settings WHERE key = 'orderingEnabled'");
    res.json({ orderingEnabled: row?.value !== '0' });
  } catch (e) {
    res.status(500).json({ error: '取得點餐開關狀態失敗' });
  }
});

app.post('/ordering-status', async (req, res) => {
  try {
    const { orderingEnabled } = req.body || {};
    if (typeof orderingEnabled !== 'boolean') {
      return res.status(400).json({ error: 'orderingEnabled 必須是布林值' });
    }
    await run("INSERT INTO app_settings (key, value) VALUES ('orderingEnabled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [orderingEnabled ? '1' : '0']);
    res.json({ orderingEnabled });
  } catch (e) {
    res.status(500).json({ error: '更新點餐開關狀態失敗' });
  }
});

app.get('/customer-state/:deviceToken', async (req, res) => {
  try {
    const activeQueue = await getActiveQueueByDevice(req.params.deviceToken);
    if (!activeQueue) return res.json({ activeQueue: null, order: null });
    const order = await get('SELECT * FROM orders WHERE queueId = ?', [activeQueue.id]);
    res.json({ activeQueue, order: parseOrder(order) });
  } catch (e) {
    res.status(500).json({ error: '取得顧客狀態失敗' });
  }
});

app.get('/queue/:id/detail', async (req, res) => {
  try {
    const detail = await getQueueDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: '找不到號碼' });
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: '取得號碼詳情失敗' });
  }
});

app.post('/queue', async (req, res) => {
  try {
    const { deviceToken } = req.body;
    if (!deviceToken) return res.status(400).json({ error: '缺少裝置識別' });

    // 註：測試模式下暫時取消同一裝置只能有一個未完成號碼的限制。
    // const existing = await getActiveQueueByDevice(deviceToken);
    // if (existing) {
    //   return res.status(409).json({ error: '此裝置目前已有尚未完成的號碼。', queue: existing });
    // }

    const row = await get('SELECT MAX(number) AS maxNumber FROM queue');
    const nextNumber = (row?.maxNumber || 0) + 1;
    const result = await run('INSERT INTO queue (number, status, deviceToken) VALUES (?, ?, ?)', [nextNumber, 'waiting', deviceToken]);
    const created = await get('SELECT * FROM queue WHERE id = ?', [result.lastID]);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: '建立號碼失敗' });
  }
});

app.get('/queue', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM queue ORDER BY id ASC');
    const current = rows.find((r) => r.status === 'called') || null;
    const waitingCount = rows.filter((r) => r.status === 'waiting').length;
    res.json({ current, waitingCount, queue: rows });
  } catch (e) {
    res.status(500).json({ error: '取得隊列失敗' });
  }
});

app.post('/queue/next', async (req, res) => {
  try {
    await run("UPDATE queue SET status = 'done' WHERE status = 'called'");
    const next = await get("SELECT * FROM queue WHERE status='waiting' ORDER BY id ASC LIMIT 1");
    if (!next) return res.json({ message: '目前沒有等待中的號碼', current: null });
    await run("UPDATE queue SET status='called' WHERE id=?", [next.id]);
    const called = await get('SELECT * FROM queue WHERE id = ?', [next.id]);
    res.json(called);
  } catch (e) {
    res.status(500).json({ error: '叫號失敗' });
  }
});

app.post('/queue/:id/skip', async (req, res) => {
  try {
    const queue = await get('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    if (!queue) return res.status(404).json({ error: '找不到號碼' });
    if (queue.status === 'done') return res.status(400).json({ error: '號碼已完成，無法過號' });
    await run("UPDATE queue SET status = 'skipped' WHERE id = ?", [req.params.id]);
    const updated = await get('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: '過號操作失敗' });
  }
});

app.post('/queue/:id/seat', async (req, res) => {
  try {
    const queue = await get('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    if (!queue) return res.status(404).json({ error: '找不到號碼' });
    if (queue.status === 'done') return res.status(400).json({ error: '號碼已完成，無法確認入座' });
    await run("UPDATE queue SET status = 'seated' WHERE id = ?", [req.params.id]);
    const updated = await get('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: '確認入座失敗' });
  }
});

app.post('/queue/clear', async (req, res) => {
  try {
    await run('DELETE FROM orders');
    await run('DELETE FROM queue');
    res.json({ success: true, message: '今日列隊清單與預點餐草稿已清空。' });
  } catch (e) {
    res.status(500).json({ error: '清空 queue 失敗' });
  }
});

app.post('/order', async (req, res) => {
  try {
    const { queueId, items, note = '' } = req.body;
    if (!queueId || !Array.isArray(items)) return res.status(400).json({ error: '資料格式錯誤' });
    const exists = await get('SELECT id FROM queue WHERE id=?', [queueId]);
    if (!exists) return res.status(404).json({ error: '找不到對應號碼' });
    const active = await get('SELECT id FROM orders WHERE queueId=?', [queueId]);
    if (active) {
      await run('UPDATE orders SET items=?, note=? WHERE queueId=?', [JSON.stringify(items), note, queueId]);
    } else {
      await run('INSERT INTO orders (queueId, items, note) VALUES (?, ?, ?)', [queueId, JSON.stringify(items), note]);
    }
    await run('INSERT INTO order_history (queueId, items, note) VALUES (?, ?, ?)', [queueId, JSON.stringify(items), note]);
    const order = await get('SELECT * FROM orders WHERE queueId=?', [queueId]);
    res.status(201).json(parseOrder(order));
  } catch (e) {
    res.status(500).json({ error: '儲存預點餐失敗' });
  }
});

app.get('/order-history', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM order_history ORDER BY created_at DESC, id DESC');
    res.json(rows.map(parseOrderHistoryRecord));
  } catch (e) {
    res.status(500).json({ error: '取得點餐紀錄失敗' });
  }
});

app.get('/order-summary/today', async (req, res) => {
  try {
    const rows = await all("SELECT items FROM order_history WHERE date(created_at, 'localtime') = date('now', 'localtime')");
    const summaryMap = new Map();
    rows.forEach((row) => {
      let items = [];
      try {
        items = JSON.parse(row.items);
      } catch {
        items = [];
      }
      items.forEach((item) => {
        const key = item.id || item.name;
        if (!key) return;
        const current = summaryMap.get(key) || { id: item.id || null, name: item.name || '未命名餐點', quantity: 0 };
        current.quantity += item.quantity || 1;
        summaryMap.set(key, current);
      });
    });
    const summary = Array.from(summaryMap.values()).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'zh-Hant'));
    res.json({ date: new Date().toISOString().slice(0, 10), items: summary });
  } catch (e) {
    res.status(500).json({ error: '取得今日點餐數量失敗' });
  }
});

app.get('/order/:queueId', async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE queueId=?', [req.params.queueId]);
    if (!order) return res.status(404).json({ error: '找不到預點餐資料' });
    res.json(parseOrder(order));
  } catch (e) {
    res.status(500).json({ error: '取得預點餐失敗' });
  }
});

app.listen(PORT, async () => {
  await initDb();
  console.log(`backend running on ${PORT}`);
});
