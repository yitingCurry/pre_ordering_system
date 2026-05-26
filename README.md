# restaurant-mvp

A working MVP for a traditional Hong Kong restaurant queue and pre-order system, with **LINE LIFF** entry and **LINE Push** notifications.

## Stack
- Customer Frontend: Next.js (Vercel) + LINE LIFF
- Staff Frontend: Next.js
- Backend: Node.js + Express (Render Free 或本機 Docker)
- Database: SQLite

## What this MVP does
- 顧客掃 **LIFF QR** 在 LINE 內取號、預點餐（草稿）
- **LINE Push**：取號成功、快到號、叫號（附預點摘要）、過號、入座、用餐 10 分鐘前預警、60 分鐘到點 + 詳細回饋問卷
- **Rich Menu / 聊天**：查等候組數、我的號碼、菜色評論
- **用餐回饋**：整體／等候／餐點／服務四項評分 + 可選文字留言（LINE）；店員端「今日回饋」列表
- 店員端查看隊列與草稿，維持手寫點單流程

## 候位規則

- 叫號後請盡快到櫃台報到
- 若叫號時未在現場，店員會將號碼標記為**過號**
- 過號後請重新取號或洽櫃台
- 規則文案會出現在：取號／快到號／叫號 LINE Push、顧客 LIFF 取號頁、聊天「我的號碼」

## LINE 設定（實作前請完成）

1. [LINE Developers Console](https://developers.line.biz/console/) 建立 **Messaging API** Channel
2. 記錄 `LINE_CHANNEL_SECRET`、**長期** `LINE_CHANNEL_ACCESS_TOKEN`
3. 建立 **LIFF** app：
   - Endpoint URL = 顧客 Vercel 網址（例如 `https://xxx.vercel.app/`）
   - Size: Full，Scope: `profile`
   - 門口 QR：`https://liff.line.me/{LIFF_ID}`
4. **Rich Menu**（2×2 四格，深灰底 + 彩色圓形圖示，可用腳本自動建立）：
   - 左上：線上取號 → LIFF 首頁
   - 右上：預點餐 → `{CUSTOMER_URL}/menu`
   - 左下：現場等候 → Postback `action=waiting_count`
   - 右下：我的號碼 → Postback `action=my_status`
   - 菜色評論不在選單內，請在聊天輸入 `評論 菜名` 查詢
   ```bash
   cd backend && npm install
   # .env 需有 LINE token、LIFF_ID、CUSTOMER_URL
   npm run line:richmenu:image   # 產生 2500×1686 圖（與點擊區同源 richMenuSpecs）
   npm run line:richmenu         # 上傳並設為預設 Rich Menu（會覆蓋 LINE 上既有預設）
   ```
5. Webhook URL（後端部署後）：`https://<render-host>/line/webhook`，開啟 Use webhook

**聊天關鍵字（Webhook Reply）**
- 等候／候位／幾組 → 全店等候組數
- 我的號碼／候位／號碼狀態 → 個人候位狀態
- `評論 菜名` 或 `菜名 評論` → 菜色評論摘要

**用餐回饋（Push 問卷）**
- 觸發：店員按「客人已離開」或用餐 60 分鐘到點
- 客人依序點選：整體、等候、餐點、服務（各：滿意／普通／不滿意）
- 四項完成後可輸入文字意見，或回覆「略過」
- 店員端：頁面下方「今日回饋」（四維度滿意／普通／不滿意票數總覽 + 逐筆明細與留言）；API：`GET /feedback/today`（含 `summary`）

## 部署架構

| 元件 | 建議平台 |
|------|----------|
| 顧客前端 | Vercel |
| 後端 API + Webhook | Render Free Web Service |
| SQLite | 容器內 `/var/data/restaurant.db`（**無持久碟**，deploy/休眠可能清空資料） |

可選：用 Uptime 每 10 分鐘 ping `GET /health` 降低 Render 休眠導致排程漏發。

## 環境變數

見 [.env.example](.env.example)。

**Backend（Render）**
- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
- `CORS_ORIGIN` = Vercel 顧客 + 店員網域
- Rich Menu 腳本：`LIFF_ID`, `CUSTOMER_URL`（見 `.env.example`）
- `SEATED_DURATION_MINUTES=60`, `SEATED_WARN_BEFORE_MINUTES=10`, `ALMOST_CALLED_AHEAD_COUNT=2`

**Customer（Vercel）**
- `NEXT_PUBLIC_API_URL` = Render 後端 URL
- `NEXT_PUBLIC_LIFF_ID`
- `NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL`

本機開發可設 `ALLOW_BROWSER_QUEUE=1`（backend）與 `NEXT_PUBLIC_ALLOW_BROWSER_QUEUE=1`（customer）允許非 LINE 瀏覽器取號（無 Push）。

## Project Structure
```bash
restaurant-mvp/
├── frontend-customer/   # LIFF + 取號/預點
├── frontend-staff/
├── backend/
│   └── line/            # LINE webhook、Push、排程
├── database/
├── render.yaml
├── .env.example
└── docker-compose.yml
```

## Run locally
```bash
docker compose up --build
```

或分別啟動：
```bash
cd backend && npm install && npm start
cd frontend-customer && npm install && npm run dev
cd frontend-staff && npm install && npm run dev -p 3001
```

本機 LIFF 測試需將 LIFF Endpoint 暫改為 ngrok 指向 `localhost:3000`，或使用 `ALLOW_BROWSER_QUEUE` 略過 LIFF。

## Access
- 顧客端：http://localhost:3000
- 店員端：http://localhost:3001
- 後端：http://localhost:8000
- Health：http://localhost:8000/health

## Notes
- 無付款、無 POS、無列印；預點餐只存草稿
- 正式營業前建議 Render 持久碟或 VPS，避免 SQLite 被清空
- 瀏覽器直接開 Vercel **不會**收到 LINE Push（需 LINE 掃 LIFF QR）
