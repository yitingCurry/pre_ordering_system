const fs = require('fs');
const path = require('path');
const { getClient, getBlobClient, isLineConfigured } = require('./client');

const MENU_WIDTH = 2500;
const MENU_HEIGHT = 1686;
const COLS = 5;
const COL_W = MENU_WIDTH / COLS;

function buildAreas(urls) {
  const { liffUrl, menuUrl } = urls;
  const specs = [
    { label: '線上取號', action: { type: 'uri', uri: liffUrl } },
    { label: '預點餐', action: { type: 'uri', uri: menuUrl } },
    { label: '現場等候', action: { type: 'postback', data: 'action=waiting_count', displayText: '現場等候' } },
    { label: '我的號碼', action: { type: 'postback', data: 'action=my_status', displayText: '我的號碼' } },
    { label: '菜色評論', action: { type: 'postback', data: 'action=dish_review_help', displayText: '菜色評論' } }
  ];

  return specs.map((spec, i) => ({
    bounds: { x: Math.floor(i * COL_W), y: 0, width: Math.floor(COL_W), height: MENU_HEIGHT },
    action: spec.action
  }));
}

async function createAndSetDefaultRichMenu({ imagePath, liffUrl, menuUrl }) {
  if (!isLineConfigured()) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET 未設定');
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`找不到 Rich Menu 圖片：${imagePath}`);
  }

  const client = getClient();
  const blobClient = getBlobClient();

  const richMenu = await client.createRichMenu({
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: 'restaurant-mvp-menu',
    chatBarText: '選單',
    areas: buildAreas({ liffUrl, menuUrl })
  });

  const richMenuId = richMenu.richMenuId;
  const imageBuffer = fs.readFileSync(imagePath);
  await blobClient.setRichMenuImage(richMenuId, new Blob([imageBuffer], { type: 'image/png' }));

  await client.setDefaultRichMenu(richMenuId);
  return richMenuId;
}

function getDefaultImagePath() {
  return process.env.RICH_MENU_IMAGE_PATH
    || path.join(__dirname, 'assets', 'richmenu.png');
}

function resolveUrls() {
  const liffId = process.env.LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID;
  const customerUrl = (process.env.CUSTOMER_URL || process.env.NEXT_PUBLIC_CUSTOMER_URL || '').replace(/\/$/, '');

  const liffUrl = process.env.CUSTOMER_LIFF_URL
    || (liffId ? `https://liff.line.me/${liffId}` : null);
  const menuUrl = customerUrl ? `${customerUrl}/menu` : null;

  if (!liffUrl) {
    throw new Error('請在 .env 設定 LIFF_ID 或 NEXT_PUBLIC_LIFF_ID（或 CUSTOMER_LIFF_URL）');
  }
  if (!menuUrl) {
    throw new Error(
      '請在 .env 設定 CUSTOMER_URL 或 NEXT_PUBLIC_CUSTOMER_URL（顧客 Vercel 網址，例如 https://pre-ordering-system.vercel.app）'
    );
  }

  return { liffUrl, menuUrl };
}

module.exports = {
  createAndSetDefaultRichMenu,
  getDefaultImagePath,
  resolveUrls,
  MENU_WIDTH,
  MENU_HEIGHT
};
