const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database ----------
const db = new DatabaseSync(path.join(__dirname, "cafe.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Coffee',
    price REAL NOT NULL,
    description TEXT DEFAULT '',
    available INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_no TEXT NOT NULL DEFAULT '',
    order_type TEXT NOT NULL DEFAULT 'dine-in',
    status TEXT NOT NULL DEFAULT 'pending',
    total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pw_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
`);

// ---------- Auth helpers ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function createUser(username, password, role = "staff") {
  if (!username || !password) throw new Error("username and password required");
  if (!["admin", "staff"].includes(role)) throw new Error("invalid role");
  const salt = crypto.randomBytes(16).toString("hex");
  const pw_hash = hashPassword(password, salt);
  const r = db
    .prepare("INSERT INTO users (username, pw_hash, salt, role) VALUES (?,?,?,?)")
    .run(username.trim(), pw_hash, salt, role);
  return publicUser(r.lastInsertRowid);
}
function publicUser(id) {
  return db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?").get(id);
}
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "login required" });
  const s = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!s || new Date(s.expires_at) < new Date()) {
    if (s) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "session expired, please login again" });
  }
  const user = publicUser(s.user_id);
  if (!user) return res.status(401).json({ error: "user not found" });
  req.user = user;
  next();
}
function adminRequired(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  next();
}

// Seed menu if empty
const menuCount = db.prepare("SELECT COUNT(*) AS c FROM menu").get().c;
if (menuCount === 0) {
  const seed = [
    ["Espresso", "Coffee", 3.5, "Strong single shot espresso", 1],
    ["Cappuccino", "Coffee", 4.5, "Espresso with steamed milk and foam", 1],
    ["Caffe Latte", "Coffee", 5.0, "Smooth espresso with creamy milk", 1],
    ["Mocha", "Coffee", 5.5, "Espresso, chocolate and steamed milk", 1],
    ["Iced Americano", "Coffee", 4.0, "Chilled espresso over ice", 1],
    ["Green Tea", "Tea", 3.0, "Hot brewed green tea", 1],
    ["Milk Tea", "Tea", 4.0, "Creamy milk tea with boba option", 1],
    ["Chocolate Cake", "Dessert", 4.5, "Rich dark chocolate slice", 1],
    ["Croissant", "Dessert", 3.5, "Buttery flaky croissant", 1],
    ["Tiramisu", "Dessert", 6.0, "Classic Italian coffee dessert", 1],
  ];
  const ins = db.prepare(
    "INSERT INTO menu (name, category, price, description, available) VALUES (?,?,?,?,?)"
  );
  for (const row of seed) ins.run(...row);
  console.log("Seeded menu with sample items.");
}

// Seed default admin if no users exist
if (db.prepare("SELECT COUNT(*) AS c FROM users").get().c === 0) {
  createUser("admin", "admin123", "admin");
  console.log("Seeded default admin user: admin / admin123 (please change the password!)");
}

// ---------- Auth API (public) ----------
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const u = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
  if (!u || hashPassword(password, u.salt) !== u.pw_hash) {
    return res.status(401).json({ error: "invalid username or password" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, u.id, expires);
  res.json({ token, user: publicUser(u.id) });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  const token = (req.headers.authorization || "").slice(7);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, (req, res) => res.json(req.user));

// ---------- User management (admin only) ----------
app.get("/api/users", authRequired, adminRequired, (req, res) => {
  res.json(db.prepare("SELECT id, username, role, created_at FROM users ORDER BY id").all());
});

app.post("/api/users", authRequired, adminRequired, (req, res) => {
  try {
    const { username, password, role } = req.body;
    res.status(201).json(createUser(username, password, role || "staff"));
  } catch (e) {
    res.status(400).json({ error: e.message.includes("UNIQUE") ? "username already exists" : e.message });
  }
});

app.put("/api/users/:id", authRequired, adminRequired, (req, res) => {
  const { role, password } = req.body;
  const target = publicUser(req.params.id);
  if (!target) return res.status(404).json({ error: "not found" });
  if (role) {
    if (!["admin", "staff"].includes(role)) return res.status(400).json({ error: "invalid role" });
    if (target.id === req.user.id && role !== "admin")
      return res.status(400).json({ error: "cannot demote yourself" });
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, target.id);
  }
  if (password) {
    const salt = crypto.randomBytes(16).toString("hex");
    db.prepare("UPDATE users SET pw_hash = ?, salt = ? WHERE id = ?")
      .run(hashPassword(password, salt), salt, target.id);
  }
  res.json(publicUser(target.id));
});

app.delete("/api/users/:id", authRequired, adminRequired, (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: "cannot delete yourself" });
  const r = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Menu API ----------
app.get("/api/menu", authRequired, (req, res) => {
  res.json(db.prepare("SELECT * FROM menu ORDER BY category, name").all());
});

app.post("/api/menu", authRequired, adminRequired, (req, res) => {
  const { name, category, price, description, available } = req.body;
  if (!name || price == null) return res.status(400).json({ error: "name and price required" });
  const r = db
    .prepare("INSERT INTO menu (name, category, price, description, available) VALUES (?,?,?,?,?)")
    .run(name, category || "Coffee", price, description || "", available ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM menu WHERE id = ?").get(r.lastInsertRowid));
});

app.put("/api/menu/:id", authRequired, adminRequired, (req, res) => {
  const { name, category, price, description, available } = req.body;
  const r = db
    .prepare("UPDATE menu SET name=?, category=?, price=?, description=?, available=? WHERE id=?")
    .run(name, category, price, description || "", available ? 1 : 0, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json(db.prepare("SELECT * FROM menu WHERE id = ?").get(req.params.id));
});

app.delete("/api/menu/:id", authRequired, adminRequired, (req, res) => {
  const r = db.prepare("DELETE FROM menu WHERE id = ?").run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Orders API ----------
const getOrder = (id) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) return null;
  order.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id);
  return order;
};

app.get("/api/orders", authRequired, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all();
  const items = db.prepare("SELECT * FROM order_items").all();
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] ||= []).push(it);
  res.json(orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })));
});

app.post("/api/orders", authRequired, (req, res) => {
  const { table_no = "", order_type = "dine-in", items = [] } = req.body;
  if (!items.length) return res.status(400).json({ error: "no items" });
  let total = 0;
  const lines = [];
  for (const { menu_id, qty } of items) {
    const m = db.prepare("SELECT * FROM menu WHERE id = ? AND available = 1").get(menu_id);
    if (!m) return res.status(400).json({ error: `menu item ${menu_id} not available` });
    const q = Math.max(1, parseInt(qty, 10) || 1);
    total += m.price * q;
    lines.push({ menu_id: m.id, name: m.name, price: m.price, qty: q });
  }
  const orderId = db
    .prepare("INSERT INTO orders (table_no, order_type, status, total) VALUES (?,?,?,?)")
    .run(table_no, order_type, "pending", total).lastInsertRowid;
  const ins = db.prepare(
    "INSERT INTO order_items (order_id, menu_id, name, price, qty) VALUES (?,?,?,?,?)"
  );
  for (const l of lines) ins.run(orderId, l.menu_id, l.name, l.price, l.qty);
  res.status(201).json(getOrder(orderId));
});

app.put("/api/orders/:id/status", authRequired, (req, res) => {
  const ok = ["pending", "preparing", "served", "completed", "cancelled"];
  const { status } = req.body;
  if (!ok.includes(status)) return res.status(400).json({ error: "invalid status" });
  const r = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json(getOrder(req.params.id));
});

app.delete("/api/orders/:id", authRequired, adminRequired, (req, res) => {
  const r = db.prepare("DELETE FROM orders WHERE id = ?").run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Stats ----------
app.get("/api/stats", authRequired, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const sales = db
    .prepare(
      "SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders FROM orders WHERE date(created_at) = ? AND status != 'cancelled'"
    )
    .get(today);
  const active = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','preparing','served')")
    .get().c;
  const top = db
    .prepare(
      `SELECT name, SUM(qty) AS sold, SUM(price*qty) AS revenue
       FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status != 'cancelled')
       GROUP BY name ORDER BY sold DESC LIMIT 5`
    )
    .all();
  res.json({ revenue: sales.revenue, orders: sales.orders, active, top });
});

app.listen(PORT, () => console.log(`Cafe POS running at http://localhost:${PORT}`));
