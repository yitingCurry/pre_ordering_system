const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const {
  createAndSetDefaultRichMenu,
  getDefaultImagePath,
  resolveUrls
} = require('./richMenu');

async function main() {
  let imagePath = getDefaultImagePath();
  if (!fs.existsSync(imagePath)) {
    console.log('Rich Menu 圖片不存在，嘗試自動產生…');
    require('child_process').execSync(`node "${path.join(__dirname, 'generateRichMenuAsset.js')}"`, {
      stdio: 'inherit'
    });
  }
  imagePath = getDefaultImagePath();
  if (!fs.existsSync(imagePath)) {
    throw new Error(`仍找不到圖片：${imagePath}`);
  }

  const urls = resolveUrls();
  console.log('LIFF URL:', urls.liffUrl);
  console.log('Menu URL:', urls.menuUrl);
  console.log('Image:', imagePath);

  const richMenuId = await createAndSetDefaultRichMenu({
    imagePath,
    liffUrl: urls.liffUrl,
    menuUrl: urls.menuUrl
  });

  console.log(`Rich Menu 已建立並設為預設：${richMenuId}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
