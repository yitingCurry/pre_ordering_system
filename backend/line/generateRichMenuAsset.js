const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  MENU_WIDTH,
  MENU_HEIGHT,
  COLS,
  ROWS,
  CELL_W,
  CELL_H,
  MENU_ITEMS
} = require('./richMenuSpecs');

const OUT = path.join(__dirname, 'assets', 'richmenu.png');
const PY_SCRIPT = path.join(__dirname, 'assets', '_gen_richmenu.py');

function ensureVenv() {
  const venvDir = path.join(__dirname, 'assets', '.venv');
  const venvPy = path.join(venvDir, 'bin', 'python3');
  if (fs.existsSync(venvPy)) return venvPy;
  fs.mkdirSync(path.dirname(PY_SCRIPT), { recursive: true });
  execSync(`python3 -m venv "${venvDir}"`, { stdio: 'pipe' });
  execSync(`"${path.join(venvDir, 'bin', 'pip')}" install Pillow`, { stdio: 'pipe' });
  return venvPy;
}

function buildPythonScript() {
  const itemsJson = JSON.stringify(MENU_ITEMS);
  return `import json
import math
from PIL import Image, ImageDraw, ImageFont

W, H = ${MENU_WIDTH}, ${MENU_HEIGHT}
COLS, ROWS = ${COLS}, ${ROWS}
CELL_W, CELL_H = ${CELL_W}, ${CELL_H}
BG = '#2A2A2A'
ITEMS = json.loads('''${itemsJson}''')

def load_font(size):
    for path in (
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def draw_dual_circle(draw, cx, cy, r, color, color_light):
    bbox = [cx - r, cy - r, cx + r, cy + r]
    draw.ellipse(bbox, fill=color)
    light_rgb = hex_to_rgb(color_light)
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                continue
            if x - cx > -(y - cy):
                draw.point((x, y), fill=light_rgb)

def draw_icon_qr(draw, cx, cy, size, fill):
    s = size // 5
    ox, oy = cx - 2 * s, cy - 2 * s
    for row in range(5):
        for col in range(5):
            if row in (0, 4) or col in (0, 4) or (row == 2 and col == 2):
                draw.rectangle([ox + col*s, oy + row*s, ox + col*s + s - 2, oy + row*s + s - 2], fill=fill)

def draw_icon_menu(draw, cx, cy, size, fill):
    r = size // 3
    draw.ellipse([cx - r, cy - r//2, cx + r, cy + r], outline=fill, width=max(4, size//18))
    draw.line([cx - r//2, cy - size//3, cx - r//2, cy + size//4], fill=fill, width=max(4, size//18))
    draw.line([cx + r//3, cy - size//3, cx + r//3, cy + size//4], fill=fill, width=max(4, size//18))

def draw_icon_waiting(draw, cx, cy, size, fill):
    r = size // 3
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=fill, width=max(4, size//18))
    draw.line([cx, cy, cx, cy - r//2], fill=fill, width=max(5, size//16))
    draw.line([cx, cy, cx + r//2, cy], fill=fill, width=max(4, size//18))

def draw_icon_ticket(draw, cx, cy, size, fill):
    w, h = size // 2, size // 3
    draw.rounded_rectangle([cx - w, cy - h, cx + w, cy + h], radius=12, outline=fill, width=max(4, size//18))
    font = load_font(max(28, size // 4))
    draw.text((cx - w//3, cy - h//2), '#', fill=fill, font=font)

ICON_DRAWERS = {
    'qr': draw_icon_qr,
    'menu': draw_icon_menu,
    'waiting': draw_icon_waiting,
    'ticket': draw_icon_ticket,
}

img = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(img)
label_font = load_font(56)

for idx, item in enumerate(ITEMS):
    col = idx % COLS
    row = idx // COLS
    x0 = int(col * CELL_W)
    y0 = int(row * CELL_H)
    cx = x0 + CELL_W // 2
    cy = y0 + CELL_H // 2 - 50
    r = int(min(CELL_W, CELL_H) * 0.30)
    draw_dual_circle(draw, cx, cy, r, item['color'], item['colorLight'])
    icon_fn = ICON_DRAWERS.get(item['icon'], draw_icon_qr)
    icon_fn(draw, cx, cy, r, '#FFFFFF')
    label = item['label']
    bbox = draw.textbbox((0, 0), label, font=label_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw // 2
    ty = cy + r + 36
    draw.text((tx, ty), label, fill='#FFFFFF', font=label_font)

img.save(r'''${OUT.replace(/\\/g, '\\\\')}''')
print('ok')
`;
}

function generateWithPython(outPath) {
  const pythonBin = ensureVenv();
  fs.mkdirSync(path.dirname(PY_SCRIPT), { recursive: true });
  fs.writeFileSync(PY_SCRIPT, buildPythonScript(), 'utf8');
  execSync(`"${pythonBin}" "${PY_SCRIPT}"`, { stdio: 'inherit' });
}

function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  try {
    generateWithPython(OUT);
    console.log(`已產生 ${OUT}`);
  } catch (e) {
    console.error('產生 Rich Menu 圖片失敗。請確認 Pillow 已安裝（腳本會自動建立 venv）。');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { OUT };
