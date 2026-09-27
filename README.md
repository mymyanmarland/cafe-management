# ☕ Brew & Bean — Cafe Shop Management System

A full-stack cafe management app for Myanmar: **Node.js + Express + PostgreSQL** backend
with a **Glassmorphism** single-page frontend in **မြန်မာ + English**.

## Features

- **🔐 Login & user accounts** — secure password hashing (scrypt), token sessions (7 days)
- **👥 Role-based access** — admin (manage users/menu/orders) vs staff (POS, orders)
- **📊 Dashboard** — today's revenue (MMK), order count, active orders, top-selling items (Myanmar day)
- **🧾 POS** — bilingual menu grid, cart, dine-in/takeaway, customer name + Myanmar phone (09…)
- **🍜 Myanmar menu** — လက်ဖက်ရည်, မုန့်ဟင်းခါး, ရှမ်းခေါက်ဆွဲ, ဖာလူဒါ… priced in Kyats (Ks)
- **🌐 Bilingual UI** — မြန်မာ / English toggle, prices formatted as `1,500 Ks`
- **💾 Persistent PostgreSQL** — data survives restarts and redeploys

## Tech

- Backend: Node.js + Express + `pg`
- Database: PostgreSQL (`DATABASE_URL` env var, required)
- Frontend: vanilla HTML/CSS/JS — Glassmorphism design, no build step

## Run locally

```bash
npm install
# point at a Postgres database:
export DATABASE_URL="postgresql://user:pass@localhost:5432/cafe"
npm start
```

On first boot the app creates all tables, seeds the Myanmar menu,
and creates the default admin account:

- Username: `admin`
- Password: `admin123`

⚠️ **Change the admin password immediately** (Users tab → Reset PW).

## Deploy on Render (free)

1. Create a **PostgreSQL** database (Free plan) in the same region as the web service.
2. Create a **Web Service** from this repo (Free plan, build: `npm install`, start: `npm start`).
3. Add environment variable `DATABASE_URL` = the database's **Internal Database URL**.
4. Deploy — the app auto-creates tables and seeds data on first boot.

Free-plan notes: the web service sleeps when idle (first visit takes ~30–60s to wake).
PostgreSQL Free keeps data persistently; the database itself does not sleep your data away.
