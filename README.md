<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=220&section=header&text=Brew%20%26%20Bean&fontSize=64&fontColor=fff8ec&animation=fadeIn&fontAlignY=38&desc=Cafe%20Shop%20Management%20System&descAlignY=58&descAlign=50" />

<div align="center">

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&size=22&pause=1000&color=C9763F&center=true&vCenter=true&width=650&lines=%E1%80%BB%E1%80%99%E1%80%94%E1%80%B9%E1%80%99%E1%80%AC%E1%80%B7English+%E1%80%94%E1%80%BE%E1%80%85%E1%80%BA%E1%80%98%E1%80%AC%E1%80%9E%E1%80%AC;PostgreSQL+%2B+Express+%2B+Vanilla+JS;Glassmorphism+UI+%E2%9C%A8;Live+on+Render+%F0%9F%9A%80)](https://git.io/typing-svg)

<br/>

<a href="https://cafe-management-r6td.onrender.com">
  <img src="https://img.shields.io/badge/🚀_Live_Demo-Visit_Now-c9763f?style=for-the-badge&logoColor=white" />
</a>

<br/><br/>

<img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-f5b453?style=flat-square" />

</div>

---

## ✨ Features

| | |
|---|---|
| 🔐 | **Login & user accounts** — scrypt password hashing, 7-day token sessions |
| 👥 | **Role-based access** — *admin* (users / menu / orders) vs *staff* (POS / orders) |
| 📊 | **Dashboard** — today's revenue (MMK), orders, active orders, top sellers _(Myanmar day)_ |
| 🧾 | **POS** — bilingual menu grid, cart, dine-in / takeaway, customer name + Myanmar phone `09…` validation |
| 🍜 | **Myanmar-ready menu** — လက်ဖက်ရည် · မုန့်ဟင်းခါး · ရှမ်းခေါက်ဆွဲ · ဖာလူဒါ… priced in **Ks** |
| 🌐 | **Bilingual UI** — မြန်မာ / English toggle, `1,500 Ks` formatting |
| 💾 | **Persistent PostgreSQL** — data survives restarts & redeploys |

---

## 🛠️ Tech Stack

<div align="center">
  <img src="https://skillicons.dev/icons?i=nodejs,express,postgres,js,html,css,github&theme=light" />
</div>

- **Backend** — Node.js + Express + `pg`
- **Database** — PostgreSQL (via `DATABASE_URL`)
- **Frontend** — vanilla HTML / CSS / JS, Glassmorphism, no build step
- **Auth** — scrypt hashing + Bearer-token sessions

---

## 🚀 Run locally

```bash
npm install
export DATABASE_URL="postgresql://user:pass@localhost:5432/cafe"
npm start
```

First boot creates all tables, seeds the Myanmar menu and a default admin:

> **Username:** `admin` &nbsp;·&nbsp; **Password:** `admin123`
>
> ⚠️ Change the password immediately after login *(Users → Reset PW)*.

## ☁️ Deploy on Render (free)

1. Create a **PostgreSQL** database (Free) in the same region as the web service
2. Create a **Web Service** from this repo — build: `npm install`, start: `npm start`
3. Set env var `DATABASE_URL` = the database's **Internal Database URL**
4. Deploy 🎉 — tables & seed data are created automatically on first boot

> Free web services sleep when idle — first visit after idle takes ~30–60s to wake.

---

## 📁 Project structure

```
├── server.js            # Express API + PostgreSQL
├── public/
│   └── index.html       # Glassmorphism SPA (my/en)
├── package.json
└── render.yaml          # Render Blueprint
```

---

<div align="center">

*Made with ☕ for Myanmar cafes*

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=120&section=footer" />

</div>
