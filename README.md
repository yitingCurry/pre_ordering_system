# restaurant-mvp

A working MVP for a traditional Hong Kong restaurant queue and pre-order system, with **LINE LIFF** entry and **LINE Push** notifications.

## Stack
- Customer Frontend: Next.js (Vercel) + LINE LIFF
- Staff Frontend: Next.js
- Backend: Node.js + Express (Render Free 或本機 Docker)
- Database: SQLite

## What this MVP does
- 顧客掃 **LIFF QR** 在 LINE 內取號、預點餐（草稿）
- **LINE Push**：快到號、叫號、過號、入座、用餐 10 分鐘前預警、60 分鐘到點 + 回饋按鈕
- **Rich Menu / 聊天**：查現場等候組數
- 店員端查看隊列與草稿，維持手寫點單流程

## LINE 設定（實作前請完成）

1. [LINE Developers Console](https://developers.line.biz/console/) 建立 **Messaging API** Channel
2. 記錄 `LINE_CHANNEL_SECRET`、**長期** `LINE_CHANNEL_ACCESS_TOKEN`
3. 建立 **LIFF** app：
   - Endpoint URL = 顧客 Vercel 網址（例如 `https://xxx.vercel.app/`）
   - Size: Full，Scope: `profile`
   - 門口 QR：`https://liff.line.me/{LIFF_ID}`
4. **Rich Menu**（建議三格）：
   - 線上取號 → LIFF 首頁 URL
   - 預點餐 → LIFF `{CUSTOMER_URL}/menu`
   - 現場等候 → Postback `action=waiting_count`
5. Webhook URL（後端部署後）：`https://<render-host>/line/webhook`，開啟 Use webhook

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
- `CORS_ORIGIN` = Vercel 顧客網域
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
