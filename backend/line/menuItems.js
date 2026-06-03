const fs = require('fs');
const path = require('path');

const MENU_PATH = path.join(__dirname, '..', '..', 'frontend-customer', 'pages', 'menu.js');

let cachedItems = null;

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

function loadMenuItems() {
  if (cachedItems) return cachedItems;
  if (!fs.existsSync(MENU_PATH)) {
    console.warn(`Menu source not found: ${MENU_PATH}`);
    cachedItems = [];
    return cachedItems;
  }
  const source = fs.readFileSync(MENU_PATH, 'utf8');
  const items = [];
  const pattern = /\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    items.push({ id: match[1], name: match[2].trim() });
  }
  cachedItems = items;
  return items;
}

function findMenuItemsByQuery(query) {
  const q = normalizeText(query);
  if (!q) return [];
  const items = loadMenuItems();
  const exact = items.filter((item) => normalizeText(item.name) === q);
  if (exact.length) return exact;
  return items.filter((item) => normalizeText(item.name).includes(q));
}

module.exports = { loadMenuItems, findMenuItemsByQuery, normalizeText };
