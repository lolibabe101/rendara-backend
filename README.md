# Rendara Backend API

FIRS-compliant e-invoicing and bookkeeping platform — REST API built with **Node.js (Express) + PostgreSQL**.

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set up environment
cp .env.example .env
# → Edit .env with your DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Run database migration
npm run migrate

# 4. Start (development)
npm run dev

# 5. Start (production)
npm start
```

**Health check:** `GET http://localhost:3000/health`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Full PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Access token signing key (64+ random chars) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing key (64+ random chars) |
| `PORT` | — | Server port (default: 3000) |
| `NODE_ENV` | — | `development` or `production` |
| `FIRS_SANDBOX` | — | `true` = simulate FIRS (default). Set `false` for live. |
| `FIRS_API_KEY` | — | FIRS API key (live mode only) |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS origins |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Deployment (Railway — recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

railway login
railway init
railway add --database postgresql
railway up

# Set env vars
railway variables set JWT_SECRET=... JWT_REFRESH_SECRET=...

# Run migration once
railway run npm run migrate
```

Works on **Render**, **Fly.io**, **Heroku**, or any Node host.

---

## API Reference

All protected routes require: `Authorization: Bearer <accessToken>`

### Authentication `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account |
| POST | `/login` | — | Login → returns tokens |
| POST | `/refresh` | — | Refresh access token |
| POST | `/logout` | — | Invalidate refresh token |
| GET | `/me` | ✅ | Get profile + businesses |
| PATCH | `/me` | ✅ | Update profile |
| POST | `/change-password` | ✅ | Change password |

**Login response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." },
  "businesses": [{ "id": "...", "name": "...", "role": "owner" }]
}
```

---

### Businesses `/api/businesses`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/` | any | Create business |
| GET | `/` | any | List my businesses |
| GET | `/:id` | member | Get business details |
| PATCH | `/:id` | owner/accountant | Update business |
| GET | `/:id/members` | member | List team members |
| POST | `/:id/members` | owner | Invite member |
| DELETE | `/:id/members/:userId` | owner | Remove member |

**Roles:** `owner` > `accountant` > `viewer`

---

### Customers `/api/businesses/:businessId/customers`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | viewer+ | List customers (paginated, searchable) |
| POST | `/` | accountant+ | Create customer |
| GET | `/:id` | viewer+ | Get customer |
| PATCH | `/:id` | accountant+ | Update customer |
| DELETE | `/:id` | owner | Delete customer |

---

### Products `/api/businesses/:businessId/products`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | viewer+ | List products |
| POST | `/` | accountant+ | Create product/service |
| GET | `/:id` | viewer+ | Get product |
| PATCH | `/:id` | accountant+ | Update product |
| DELETE | `/:id` | owner | Soft-deactivate product |

---

### Invoices `/api/businesses/:businessId/invoices`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | viewer+ | List invoices (filter by status, date, customer) |
| POST | `/` | accountant+ | Create draft invoice |
| GET | `/:id` | viewer+ | Get invoice with line items |
| PATCH | `/:id` | accountant+ | Edit draft invoice |
| POST | `/:id/issue` | accountant+ | **Issue invoice → generates IRN** |
| POST | `/:id/submit-firs` | accountant+ | **Submit to FIRS** |
| POST | `/:id/mark-paid` | accountant+ | Mark invoice as paid |
| POST | `/:id/cancel` | accountant+ | Cancel invoice |

**Public (no auth):**
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/invoices/verify/:irn` | Buyer IRN verification |

**Create invoice body:**
```json
{
  "customerId": "uuid",
  "invoiceDate": "2025-01-15",
  "dueDate": "2025-02-15",
  "currency": "NGN",
  "notes": "30 days payment terms",
  "items": [
    {
      "description": "IT Consulting Services",
      "productId": "uuid (optional)",
      "quantity": 10,
      "unitPrice": 50000,
      "vatRate": 7.5,
      "vatApplicable": true,
      "whtRate": 5,
      "whtApplicable": true
    }
  ]
}
```

**IRN format:** `RND-{TIN}-{YYYYMM}-{InvoiceNo}-{HASH}`

When an invoice is **issued**:
- IRN is generated and stored
- VAT entry (payable) auto-created in tax ledger
- WHT entry (receivable) auto-created in tax ledger
- Income bookkeeping entry auto-created

---

### Taxes `/api/businesses/:businessId/taxes`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List WHT/VAT entries (filter by type, period, direction, status) |
| GET | `/summary` | Grouped tax summary by type + period |
| POST | `/` | Create manual tax entry |
| PATCH | `/remit` | Mark entries as remitted (bulk) |

**Query params:** `taxType=VAT|WHT`, `direction=payable|receivable`, `status=pending|remitted`, `period=YYYY-MM`

---

### Bookkeeping `/api/businesses/:businessId/bookkeeping`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/categories` | List income/expense categories |
| GET | `/` | List entries (filter by type, category, date) |
| POST | `/` | Create income or expense entry |
| GET | `/:id` | Get entry |
| PATCH | `/:id` | Update entry |
| DELETE | `/:id` | Delete entry (non-invoice-linked only) |

---

### Reports `/api/businesses/:businessId/reports`

| Method | Endpoint | Query Params | Description |
|---|---|---|---|
| GET | `/dashboard` | — | KPIs, stats, recent invoices |
| GET | `/profit-loss` | `from`, `to` (YYYY-MM-DD) | P&L breakdown by category |
| GET | `/tax-summary` | `period` (YYYY-MM) | VAT/WHT obligations summary |
| GET | `/invoices-trend` | `months` (default: 6) | Monthly invoice volume + value |

---

## Database Schema (Summary)

```
users → user_businesses ← businesses
businesses → customers, products, invoices, tax_entries, bookkeeping_entries, firs_submissions
invoices → invoice_items, tax_entries, bookkeeping_entries, firs_submissions
```

---

## FIRS Integration

Currently runs in **sandbox mode** (simulates FIRS responses with 95% acceptance rate).

To go live:
1. Set `FIRS_SANDBOX=false` in `.env`
2. Set `FIRS_API_KEY` with your FIRS API credentials
3. Update `FIRS_API_URL` to the official FIRS endpoint
4. The submission logic in `src/utils/firs.js` is already wired — no code changes needed

---

## Project Structure

```
rendara-backend/
├── src/
│   ├── app.js                    # Express app + route mounting
│   ├── config/
│   │   ├── db.js                 # PostgreSQL pool
│   │   └── env.js                # Validated env config
│   ├── middleware/
│   │   ├── auth.js               # JWT + RBAC + business context
│   │   ├── errorHandler.js       # Global error handler
│   │   └── validate.js           # express-validator wrapper
│   ├── utils/
│   │   ├── firs.js               # FIRS API service (sandbox + live)
│   │   ├── irn.js                # IRN generation + validation
│   │   ├── logger.js             # Winston logger
│   │   └── response.js           # Standardised API responses
│   └── modules/
│       ├── auth/                 # Register, Login, JWT, Profile
│       ├── businesses/           # Multi-tenant business + RBAC
│       ├── customers/            # Customer management
│       ├── products/             # Products & services catalog
│       ├── invoices/             # Full invoice lifecycle + IRN + FIRS
│       ├── taxes/                # WHT/VAT ledger
│       ├── bookkeeping/          # Income/Expense entries
│       └── reports/              # Dashboard, P&L, Tax summary, Trend
├── migrations/
│   └── 001_initial.sql           # Full schema + indexes + triggers
├── .env.example
├── package.json
└── README.md
```

---

## License

Proprietary — Rendara © 2025
