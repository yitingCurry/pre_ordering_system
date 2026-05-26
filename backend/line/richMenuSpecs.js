const MENU_WIDTH = 2500;
const MENU_HEIGHT = 1686;
const COLS = 2;
const ROWS = 2;
const CELL_W = MENU_WIDTH / COLS;
const CELL_H = MENU_HEIGHT / ROWS;

/** 2×2 順序：左上、右上、左下、右下 */
const MENU_ITEMS = [
  {
    key: 'queue',
    label: '線上取號',
    color: '#E67E22',
    colorLight: '#F39C12',
    icon: 'qr',
    actionType: 'uri',
    uriKey: 'liff'
  },
  {
    key: 'menu',
    label: '預點餐',
    color: '#8E44AD',
    colorLight: '#A569BD',
    icon: 'menu',
    actionType: 'uri',
    uriKey: 'menu'
  },
  {
    key: 'waiting',
    label: '現場等候',
    color: '#2980B9',
    colorLight: '#3498DB',
    icon: 'waiting',
    actionType: 'postback',
    postbackData: 'action=waiting_count',
    displayText: '現場等候'
  },
  {
    key: 'status',
    label: '我的號碼',
    color: '#27AE60',
    colorLight: '#2ECC71',
    icon: 'ticket',
    actionType: 'postback',
    postbackData: 'action=my_status',
    displayText: '我的號碼'
  }
];

function cellBounds(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: Math.floor(col * CELL_W),
    y: Math.floor(row * CELL_H),
    width: Math.floor(CELL_W),
    height: Math.floor(CELL_H)
  };
}

function buildItemAction(item, urls) {
  if (item.actionType === 'uri') {
    const uri = item.uriKey === 'liff' ? urls.liffUrl : urls.menuUrl;
    return { type: 'uri', uri };
  }
  return {
    type: 'postback',
    data: item.postbackData,
    displayText: item.displayText
  };
}

function buildRichMenuAreas(urls) {
  return MENU_ITEMS.map((item, index) => ({
    bounds: cellBounds(index),
    action: buildItemAction(item, urls)
  }));
}

module.exports = {
  MENU_WIDTH,
  MENU_HEIGHT,
  COLS,
  ROWS,
  CELL_W,
  CELL_H,
  MENU_ITEMS,
  cellBounds,
  buildRichMenuAreas
};
