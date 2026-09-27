# ☕ Brew & Bean — Cafe Shop Management System

A full-stack cafe management app: **Node.js + Express + SQLite** backend with a single-page frontend.
Now with **user accounts, login, and role-based access**.

## Features

- **🔐 Login & user accounts** — secure password hashing (scrypt), token sessions
- **👥 Admin dashboard** — create staff/admin accounts, change roles, reset passwords
- **📊 Dashboard** — today's revenue, order count, active orders, top-selling items
- **🧾 POS / New Order** — tap menu items to build an order, set table number, dine-in or takeaway
- **📦 Orders** — track order lifecycle: pending → preparing → served → completed (or cancelled)
- **🍰 Menu Management** — add, edit, delete menu items; toggle availability (admin only)

### Roles

| | Admin | Staff |
|---|---|---|
| Dashboard, POS, Orders | ✅ | ✅ |
| Edit menu | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Delete orders | ✅ | ❌ |

Default login: **admin** / **admin123** — change it after first login
(Admin → Users → Reset PW, or create a new admin and delete the default one).

## Run it

Requires Node.js 22+ (uses the built-in `node:sqlite` module — no native build needed).

```bash
cd cafe-management
npm install
npm start
```

Open **http://localhost:3000** in your browser and sign in.

Data is stored in `cafe.db` (SQLite, created automatically with seed menu + admin user).

## API

All `/api/*` endpoints require login (`Authorization: Bearer <token>`),
except `POST /api/auth/login`.

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | /api/auth/login | public | Sign in, returns token + user |
| POST | /api/auth/logout | auth | Sign out |
| GET | /api/auth/me | auth | Current user |
| GET / POST | /api/users | admin | List / create users |
| PUT / DELETE | /api/users/:id | admin | Change role or password / delete user |
| GET | /api/menu | auth | List menu items |
| POST / PUT / DELETE | /api/menu | admin | Manage menu |
| GET / POST | /api/orders | auth | List / create orders |
| PUT | /api/orders/:id/status | auth | Set status |
| DELETE | /api/orders/:id | admin | Delete an order |
| GET | /api/stats | auth | Today's revenue, counts, top sellers |

## Project structure

```
cafe-management/
├── server.js        # Express server + SQLite + auth + API
├── cafe.db          # SQLite database (auto-created on first run)
├── package.json
├── render.yaml      # Render deploy blueprint
└── public/
    └── index.html   # Frontend (login, dashboard, POS, orders, menu, users)
```
