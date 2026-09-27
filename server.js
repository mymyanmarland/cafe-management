const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database (PostgreSQL) ----------
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is not set.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_my TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Coffee',
      price INTEGER NOT NULL,
      description TEXT DEFAULT '',
      available INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_no TEXT NOT NULL DEFAULT '',
      order_type TEXT NOT NULL DEFAULT 'dine-in',
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      total INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      pw_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  // Seed Myanmar cafe menu if empty
  const { rows: mc } = await pool.query("SELECT COUNT(*)::int AS c FROM menu");
  if (mc[0].c === 0) {
    const seed = [
      // name, name_my, category, price (MMK), description
      ["Espresso", "အက်စပရက်ဆို", "Coffee", 2500, "Strong single shot espresso"],
      ["Cappuccino", "ကာပူချီနို", "Coffee", 3500, "Espresso with steamed milk and foam"],
      ["Caffe Latte", "လာ့တေး", "Coffee", 3500, "Smooth espresso with creamy milk"],
      ["Myanmar Milk Tea", "လက်ဖက်ရည်", "Coffee", 1500, "Traditional Burmese milk tea"],
      ["Iced Coffee", "ကော်ဖီအေး", "Coffee", 3000, "Chilled coffee over ice"],
      ["Green Tea", "လက်ဖက်စိမ်း", "Tea & Drinks", 2000, "Hot brewed green tea"],
      ["Falooda", "ဖာလူဒါ", "Tea & Drinks", 4000, "Sweet milk dessert drink"],
      ["Sugarcane Juice", "ကြံရည်", "Tea & Drinks", 2000, "Fresh pressed sugarcane"],
      ["Fresh Lime Juice", "သံပရာရည်", "Tea & Drinks", 2500, "Fresh lime with a hint of sweet"],
      ["Mohinga", "မုန့်ဟင်းခါး", "Food", 2500, "Myanmar's favourite fish noodle soup"],
      ["Shan Noodles", "ရှမ်းခေါက်ဆွဲ", "Food", 3000, "Shan-style rice noodles"],
      ["Chocolate Cake", "ချောကလက်ကိတ်", "Food", 4500, "Rich dark chocolate slice"],
      ["Croissant", "ခွာဆွန်", "Food", 3500, "Buttery flaky croissant"],
    ];
    for (const [name, name_my, category, price, description] of seed) {
      await pool.query(
        "INSERT INTO menu (name, name_my, category, price, description, available) VALUES ($1,$2,$3,$4,$5,1)",
        [name, name_my, category, price, description]
      );
    }
    console.log("Seeded Myanmar cafe menu.");
  }

  // Seed default admin if no users exist
  const { rows: uc } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  if (uc[0].c === 0) {
    await createUser("admin", "admin123", "admin");
    console.log("Seeded default admin user: admin / admin123 (please change the password!)");
  }
}

// ---------- Auth helpers ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
async function createUser(username, password, role = "staff") {
  if (!username || !password) throw new Error("username and password required");
  if (!["admin", "staff"].includes(role)) throw new Error("invalid role");
  const salt = crypto.randomBytes(16).toString("hex");
  const pw_hash = hashPassword(password, salt);
  const { rows } = await pool.query(
    "INSERT INTO users (username, pw_hash, salt, role) VALUES ($1,$2,$3,$4) RETURNING id, username, role, created_at",
    [username.trim(), pw_hash, salt, role]
  );
  return rows[0];
}
async function publicUser(id) {
  const { rows } = await pool.query(
    "SELECT id, username, role, created_at FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}
async function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "login required" });
  const { rows } = await pool.query("SELECT * FROM sessions WHERE token = $1", [token]);
  const s = rows[0];
  if (!s || new Date(s.expires_at) < new Date()) {
    if (s) await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    return res.status(401).json({ error: "session expired, please login again" });
  }
  const user = await publicUser(s.user_id);
  if (!user) return res.status(401).json({ error: "user not found" });
  req.user = user;
  next();
}
function adminRequired(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  next();
}

// Myanmar mobile: starts with 09 followed by 7-9 digits
function validMyanmarPhone(p) {
  return !p || /^09\d{7,9}$/.test(p);
}

// ---------- Auth API (public) ----------
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username.trim()]);
  const u = rows[0];
  if (!u || hashPassword(password, u.salt) !== u.pw_hash) {
    return res.status(401).json({ error: "invalid username or password" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await pool.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)", [
    token,
    u.id,
    expires,
  ]);
  res.json({ token, user: await publicUser(u.id) });
});

app.post("/api/auth/logout", authRequired, async (req, res) => {
  const token = (req.headers.authorization || "").slice(7);
  await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, async (req, res) => res.json(req.user));

// ---------- User management (admin only) ----------
app.get("/api/users", authRequired, adminRequired, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, role, created_at FROM users ORDER BY id"
  );
  res.json(rows);
});

app.post("/api/users", authRequired, adminRequired, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    res.status(201).json(await createUser(username, password, role || "staff"));
  } catch (e) {
    const msg = e.code === "23505" ? "username already exists" : e.message;
    res.status(400).json({ error: msg });
  }
});

app.put("/api/users/:id", authRequired, adminRequired, async (req, res) => {
  const { role, password } = req.body;
  const target = await publicUser(req.params.id);
  if (!target) return res.status(404).json({ error: "not found" });
  if (role) {
    if (!["admin", "staff"].includes(role)) return res.status(400).json({ error: "invalid role" });
    if (target.id === req.user.id && role !== "admin")
      return res.status(400).json({ error: "cannot demote yourself" });
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, target.id]);
  }
  if (password) {
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("UPDATE users SET pw_hash = $1, salt = $2 WHERE id = $3", [
      hashPassword(password, salt),
      salt,
      target.id,
    ]);
  }
  res.json(await publicUser(target.id));
});

app.delete("/api/users/:id", authRequired, adminRequired, async (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: "cannot delete yourself" });
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Menu API ----------
app.get("/api/menu", authRequired, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM menu ORDER BY category, name");
  res.json(rows);
});

app.post("/api/menu", authRequired, adminRequired, async (req, res) => {
  const { name, name_my, category, price, description, available } = req.body;
  if (!name || price == null) return res.status(400).json({ error: "name and price required" });
  const { rows } = await pool.query(
    "INSERT INTO menu (name, name_my, category, price, description, available) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [name, name_my || "", category || "Coffee", Math.round(Number(price)), description || "", available ? 1 : 0]
  );
  res.status(201).json(rows[0]);
});

app.put("/api/menu/:id", authRequired, adminRequired, async (req, res) => {
  const { name, name_my, category, price, description, available } = req.body;
  const { rows } = await pool.query(
    "UPDATE menu SET name=$1, name_my=$2, category=$3, price=$4, description=$5, available=$6 WHERE id=$7 RETURNING *",
    [name, name_my || "", category, Math.round(Number(price)), description || "", available ? 1 : 0, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

app.delete("/api/menu/:id", authRequired, adminRequired, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM menu WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Orders API ----------
async function getOrder(id) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  if (!rows[0]) return null;
  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [id]);
  return { ...rows[0], items };
}

app.get("/api/orders", authRequired, async (req, res) => {
  const { rows: orders } = await pool.query("SELECT * FROM orders ORDER BY id DESC LIMIT 200");
  const { rows: items } = await pool.query("SELECT * FROM order_items");
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] ||= []).push(it);
  res.json(orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })));
});

app.post("/api/orders", authRequired, async (req, res) => {
  const { table_no = "", order_type = "dine-in", customer_name = "", customer_phone = "", items = [] } = req.body;
  if (!items.length) return res.status(400).json({ error: "no items" });
  if (!validMyanmarPhone(customer_phone))
    return res.status(400).json({ error: "invalid Myanmar phone number (e.g. 09123456789)" });
  let total = 0;
  const lines = [];
  for (const { menu_id, qty } of items) {
    const { rows } = await pool.query("SELECT * FROM menu WHERE id = $1 AND available = 1", [menu_id]);
    const m = rows[0];
    if (!m) return res.status(400).json({ error: `menu item ${menu_id} not available` });
    const q = Math.max(1, parseInt(qty, 10) || 1);
    total += m.price * q;
    lines.push({ menu_id: m.id, name: m.name, price: m.price, qty: q });
  }
  const { rows: orows } = await pool.query(
    "INSERT INTO orders (table_no, order_type, customer_name, customer_phone, status, total) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [table_no, order_type, customer_name, customer_phone, "pending", total]
  );
  const orderId = orows[0].id;
  for (const l of lines) {
    await pool.query(
      "INSERT INTO order_items (order_id, menu_id, name, price, qty) VALUES ($1,$2,$3,$4,$5)",
      [orderId, l.menu_id, l.name, l.price, l.qty]
    );
  }
  res.status(201).json(await getOrder(orderId));
});

app.put("/api/orders/:id/status", authRequired, async (req, res) => {
  const ok = ["pending", "preparing", "served", "completed", "cancelled"];
  const { status } = req.body;
  if (!ok.includes(status)) return res.status(400).json({ error: "invalid status" });
  const { rowCount } = await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [
    status,
    req.params.id,
  ]);
  if (!rowCount) return res.status(404).json({ error: "not found" });
  res.json(await getOrder(req.params.id));
});

app.delete("/api/orders/:id", authRequired, adminRequired, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Stats (Myanmar day) ----------
app.get("/api/stats", authRequired, async (req, res) => {
  const { rows: s } = await pool.query(
    `SELECT COALESCE(SUM(total),0)::int AS revenue, COUNT(*)::int AS orders
     FROM orders
     WHERE (created_at AT TIME ZONE 'Asia/Yangon')::date = (NOW() AT TIME ZONE 'Asia/Yangon')::date
       AND status != 'cancelled'`
  );
  const { rows: a } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('pending','preparing','served')"
  );
  const { rows: top } = await pool.query(
    `SELECT name, SUM(qty)::int AS sold, SUM(price*qty)::int AS revenue
     FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status != 'cancelled')
     GROUP BY name ORDER BY sold DESC LIMIT 5`
  );
  res.json({ revenue: s[0].revenue, orders: s[0].orders, active: a[0].c, top });
});

// ---------- Boot ----------
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Cafe POS running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
