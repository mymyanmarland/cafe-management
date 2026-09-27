const express = require("express");
const { DatabaseSync } = require("node:sqlite");
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
`);

// Seed menu if empty
const count = db.prepare("SELECT COUNT(*) AS c FROM menu").get().c;
if (count === 0) {
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

// ---------- Menu API ----------
app.get("/api/menu", (req, res) => {
  res.json(db.prepare("SELECT * FROM menu ORDER BY category, name").all());
});

app.post("/api/menu", (req, res) => {
  const { name, category, price, description, available } = req.body;
  if (!name || price == null) return res.status(400).json({ error: "name and price required" });
  const r = db
    .prepare("INSERT INTO menu (name, category, price, description, available) VALUES (?,?,?,?,?)")
    .run(name, category || "Coffee", price, description || "", available ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM menu WHERE id = ?").get(r.lastInsertRowid));
});

app.put("/api/menu/:id", (req, res) => {
  const { name, category, price, description, available } = req.body;
  const r = db
    .prepare("UPDATE menu SET name=?, category=?, price=?, description=?, available=? WHERE id=?")
    .run(name, category, price, description || "", available ? 1 : 0, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json(db.prepare("SELECT * FROM menu WHERE id = ?").get(req.params.id));
});

app.delete("/api/menu/:id", (req, res) => {
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

app.get("/api/orders", (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200")
    .all();
  const items = db.prepare("SELECT * FROM order_items").all();
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] ||= []).push(it);
  res.json(orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })));
});

app.post("/api/orders", (req, res) => {
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

app.put("/api/orders/:id/status", (req, res) => {
  const ok = ["pending", "preparing", "served", "completed", "cancelled"];
  const { status } = req.body;
  if (!ok.includes(status)) return res.status(400).json({ error: "invalid status" });
  const r = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json(getOrder(req.params.id));
});

app.delete("/api/orders/:id", (req, res) => {
  const r = db.prepare("DELETE FROM orders WHERE id = ?").run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------- Stats ----------
app.get("/api/stats", (req, res) => {
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
