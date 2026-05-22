const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, 'assets', 'richmenu.png');
const W = 2500;
const H = 1686;
const LABELS = ['線上取號', '預點餐', '現場等候', '我的號碼', '菜色評論'];
const COLORS = ['#E85D04', '#F48C06', '#2A9D8F', '#264653', '#6A4C93'];

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

function generateWithPython(outPath) {
  const pythonBin = ensureVenv();
  const py = `from PIL import Image, ImageDraw, ImageFont
w, h = ${W}, ${H}
img = Image.new('RGB', (w, h), '#FFFFFF')
draw = ImageDraw.Draw(img)
col_w = w // ${LABELS.length}
labels = ${JSON.stringify(LABELS)}
colors = ${JSON.stringify(COLORS)}
try:
    font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 72)
except Exception:
    font = ImageFont.load_default()
for i, label in enumerate(labels):
    x0 = i * col_w
    draw.rectangle([x0, 0, x0 + col_w - 2, h], fill=colors[i])
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x0 + (col_w - tw) // 2, (h - th) // 2), label, fill='white', font=font)
img.save(${JSON.stringify(outPath)})
print('ok')
`;
  fs.mkdirSync(path.dirname(PY_SCRIPT), { recursive: true });
  fs.writeFileSync(PY_SCRIPT, py, 'utf8');
  execSync(`"${pythonBin}" "${PY_SCRIPT}"`, { stdio: 'inherit' });
}

function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  try {
    generateWithPython(OUT);
    console.log(`已產生 ${OUT}`);
  } catch (e) {
    console.error('產生 Rich Menu 圖片失敗。請安裝 Pillow：pip3 install Pillow');
    console.error('或手動放置 2500×1686 PNG 至 backend/line/assets/richmenu.png');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { OUT };
