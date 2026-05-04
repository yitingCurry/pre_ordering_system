# restaurant-mvp

A working MVP for a traditional Hong Kong restaurant queue and pre-order system.

## Stack
- Customer Frontend: Next.js
- Staff Frontend: Next.js
- Backend: Node.js + Express
- Database: SQLite

## What this MVP does
- 顧客端取號
- 顧客端預點餐（只存草稿）
- 店員端查看隊列與草稿
- 店家維持原本手寫流程，不送單到廚房

## Project Structure
```bash
restaurant-mvp/
├── frontend-customer/
├── frontend-staff/
├── backend/
├── database/
├── README.md
└── docker-compose.yml
```

## Access
- 顧客端：http://localhost:3000
- 店員端：http://localhost:3001
- 後端：http://localhost:8000

## Run locally
```bash
cd restaurant-mvp
docker compose up --build
```

## Notes
- 無付款
- 無 POS 串接
- 無登入系統
- 無列印
- 預點餐只存為 draft order
