# 🐘 LiveMunshi API Backend (PostgreSQL)

> **Production-grade Digital Khata Book & Daily Ledger API** built with **Express.js**, **TypeScript**, **Handler Pattern**, and **PostgreSQL**.

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js**: v20+ / v24+
- **PostgreSQL**: v14+ (running locally or remote RDS)

### 2. Configuration (`.env`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://zitadel:zitadel_password@localhost:5432/zitadel
JWT_SECRET=livemunshi_super_secret_jwt_key_2026
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

### 3. Run Development Server
```bash
cd /home/saurabh-mishra/Desktop/livemunshi

# Start dev server with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Verify PostgreSQL connection & demo data
npm run test:db
```

The server will start on **`http://localhost:5000`** with PostgreSQL!

---

## 🏗️ Architecture & Handler Pattern

```text
src/
├── handlers/                     # 👈 Pure business logic & request execution
│   ├── auth.handler.ts           # Login, Register, Send OTP, Verify OTP, Me
│   ├── khata.handler.ts          # List Khatas, Create, Stats, Delete
│   ├── party.handler.ts          # List Parties, Create, Update, Balances
│   ├── transaction.handler.ts    # Lena/Dena ledger engine & running balance
│   ├── crossEntry.handler.ts     # Party-to-party credit/debit transfer
│   ├── mondayFinal.handler.ts    # Weekly settlement freeze lock
│   ├── recycleBin.handler.ts     # Soft-delete restore & purge
│   ├── report.handler.ts         # Statement generator & WhatsApp share
│   └── index.ts                  # Master export of all handlers
├── routes/                       # 👈 1-line route mappings
├── db/                           # PostgreSQL Pool connection & schema migrations
├── middleware/                   # JWT & Error handlers
└── index.ts                      # Express app startup
```

---

## 🔑 Pre-Seeded Test Credentials

| Field | Value |
|---|---|
| **Phone Number** | `9876543210` |
| **4-Digit PIN** | `1234` |
| **Active Khata** | `Main Shop Khata` (`b003cfee-f01a-4304-b62b-f1f32597dafd`) |
| **Stats** | 🟢 You Will Get: **₹45,250.00** \| 🔴 You Will Give: **₹12,400.00** |

---

## 🧪 Testing the API

1. **VS Code REST Client**: Open [`api.http`](./api.http) and click **"Send Request"**.
2. **Postman**: Import [`livemunshi_postman_collection.json`](./livemunshi_postman_collection.json) directly.
# munshi
