const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'restaurant.db');
const CSV_PATH = process.argv[2] || path.join(__dirname, '..', 'xin_hua_reviews.csv');
const MENU_PATH = path.join(__dirname, '..', 'frontend-customer', 'pages', 'menu.js');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function loadMenuItems() {
  const source = fs.readFileSync(MENU_PATH, 'utf8');
  const items = [];
  const pattern = /\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    items.push({ id: match[1], name: match[2].trim() });
  }

  return items;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .replace(/乾/g, '干')
    .replace(/麵/g, '面')
    .replace(/三明治/g, '三文治')
    .replace(/菠蘿包/g, '菠蘿飽');
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`找不到 CSV 檔案：${CSV_PATH}`);
  }

  const menuItems = loadMenuItems();
  const csvText = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(csvText);
  const headers = rows.shift() || [];
  const reviewerIndex = headers.indexOf('評論者');
  const ratingIndex = headers.indexOf('星等');
  const contentIndex = headers.indexOf('評論內容');

  if (contentIndex === -1) {
    throw new Error('CSV 必須包含「評論內容」欄位');
  }

  const db = new sqlite3.Database(DB_PATH);
  await runSql(db, `CREATE TABLE IF NOT EXISTS dish_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menuItemId TEXT NOT NULL,
    dishName TEXT NOT NULL,
    reviewer TEXT,
    rating TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_dish_reviews_menu_item_id ON dish_reviews(menuItemId)');
  await runSql(db, 'DELETE FROM dish_reviews');

  let inserted = 0;
  let sourceReviews = 0;

  for (const row of rows) {
    const content = row[contentIndex]?.trim();
    if (!content) continue;

    sourceReviews += 1;
    const reviewer = reviewerIndex >= 0 ? row[reviewerIndex]?.trim() : '';
    const rating = ratingIndex >= 0 ? row[ratingIndex]?.trim() : '';
    const normalizedContent = normalizeText(content);
    const matched = new Set();

    for (const item of menuItems) {
      const normalizedName = normalizeText(item.name);
      if (normalizedName && normalizedContent.includes(normalizedName)) {
        matched.add(item.id);
        await runSql(
          db,
          'INSERT INTO dish_reviews (menuItemId, dishName, reviewer, rating, content) VALUES (?, ?, ?, ?, ?)',
          [item.id, item.name, reviewer, rating, content]
        );
        inserted += 1;
      }
    }
  }

  db.close();
  console.log(`讀取 ${sourceReviews} 則 Google 評論，配對並匯入 ${inserted} 筆菜色評論。`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
