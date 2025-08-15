/**
 * server.js
 * Backend simples para aprendizado: Express + better-sqlite3 (arquivo local)
 *
 * Endpoints:
 * POST /api/auth/register -> { name, email, password }
 * POST /api/auth/login -> { email, password } -> returns { token, user }
 *
 * Products:
 * GET  /api/products
 * GET  /api/products/:id
 * POST /api/products     (admin only)
 * PUT  /api/products/:id (admin only)
 * DELETE /api/products/:id (admin only)
 *
 * Orders:
 * POST /api/orders -> { items: [{ product_id, qty }], customer: {name,email,address}, total_cents }
 * GET /api/orders/:id -> order details (admin or owner)
 *
 * Uses JWT in Authorization: Bearer <token>
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// config
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'dev.sqlite3');

// ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// open DB
const db = new Database(DB_FILE);

// create tables if not exist
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  handle TEXT,
  description TEXT,
  category TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  stock INTEGER DEFAULT 0,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  customer_name TEXT,
  customer_email TEXT,
  customer_address TEXT,
  total_cents INTEGER,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  product_id INTEGER,
  price_cents INTEGER,
  qty INTEGER,
  title TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`).run();

// seed admin user if none exists
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const pw = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name,email,password,is_admin) VALUES (?,?,?,1)').run('Admin', 'admin@magictshirt.local', pw);
  console.log('Seeded admin user -> admin@magictshirt.local / admin123');
}

// seed sample products if none
const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (prodCount === 0) {
  const insert = db.prepare('INSERT INTO products (title,handle,description,category,price_cents,sku,stock,image_url) VALUES (?,?,?,?,?,?,?,?)');
  insert.run('Camiseta Retro', 'camiseta-retro', 'Estampa exclusiva inspirada nos anos 90', 'Camisetas', 6999, 'CR-001', 24, '/assets/images/camiseta-retro.jpg');
  insert.run('Moletom Oversize', 'moletom-oversize', 'Forro aconchegante e corte oversized', 'Moletom', 12990, 'MO-001', 18, '/assets/images/moletom-oversize.jpg');
  insert.run('Camiseta Eco', 'camiseta-eco', 'Algodão orgânico', 'Camisetas', 5999, 'CE-001', 30, '/assets/images/camiseta-eco.jpg');
  insert.run('Boné Classic', 'bone-classic', 'Boné clássico com ajuste traseiro', 'Acessórios', 3999, 'BC-001', 50, '/assets/images/bone-classic.jpg');
  console.log('Seeded sample products');
}

/* ---------------- helpers ---------------- */
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Sem token de autenticação' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Formato inválido' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Requer privilégios de administrador' });
  next();
}

/* ---------------- auth ---------------- */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });
  const hashed = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name,email,password) VALUES (?,?,?)').run(name, email, hashed);
  const user = db.prepare('SELECT id,name,email,is_admin,created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e password são obrigatórios' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
  const publicUser = { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin };
  const token = signToken(publicUser);
  res.json({ token, user: publicUser });
});

/* ---------------- products ---------------- */
app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(p);
});

app.post('/api/products', authMiddleware, adminOnly, (req, res) => {
  const { title, handle, description, category, price_cents, sku, stock, image_url } = req.body || {};
  if (!title || !price_cents) return res.status(400).json({ error: 'title e price_cents obrigatórios' });
  const info = db.prepare('INSERT INTO products (title,handle,description,category,price_cents,sku,stock,image_url) VALUES (?,?,?,?,?,?,?,?)')
    .run(title, handle || '', description || '', category || '', Number(price_cents), sku || '', Number(stock || 0), image_url || '');
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(p);
});

app.put('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Produto não encontrado' });
  const { title, handle, description, category, price_cents, sku, stock, image_url } = req.body || {};
  db.prepare(`UPDATE products SET
    title = COALESCE(?, title),
    handle = COALESCE(?, handle),
    description = COALESCE(?, description),
    category = COALESCE(?, category),
    price_cents = COALESCE(?, price_cents),
    sku = COALESCE(?, sku),
    stock = COALESCE(?, stock),
    image_url = COALESCE(?, image_url)
    WHERE id = ?`).run(title, handle, description, category, price_cents ? Number(price_cents) : null, sku, stock ? Number(stock) : null, image_url, id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(p);
});

app.delete('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json({ ok: true });
});

/* ---------------- orders ---------------- */
app.post('/api/orders', (req, res) => {
  const { items, customer, total_cents, user_token } = req.body || {};
  // customer: {name, email, address}
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items obrigatório' });
  if (!customer || !customer.name || !customer.email) return res.status(400).json({ error: 'customer (name,email) obrigatório' });

  // optional: if user_token provided, verify and attach user_id
  let user_id = null;
  if (user_token) {
    try {
      const data = jwt.verify(user_token, JWT_SECRET);
      user_id = data.id;
    } catch(e){}
  }

  const insertOrder = db.prepare('INSERT INTO orders (user_id, customer_name, customer_email, customer_address, total_cents, status) VALUES (?,?,?,?,?,?)');
  const info = insertOrder.run(user_id, customer.name, customer.email, customer.address || '', Number(total_cents || 0), 'pending');
  const orderId = info.lastInsertRowid;

  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, price_cents, qty, title) VALUES (?,?,?,?,?)');

  // store snapshot info for each item
  items.forEach(it => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
    const price = product ? product.price_cents : (it.price_cents || 0);
    const title = product ? product.title : (it.title || 'Produto');
    insertItem.run(orderId, it.product_id || null, price, it.qty || 1, title);
  });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  res.status(201).json({ order, items: orderItems });
});

// get order by id (admin or owner by email match)
app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  // allow admin
  if (req.user.is_admin) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    return res.json({ order, items });
  }

  // not admin: allow owner if user id matches or email matches
  if (req.user.id && order.user_id && Number(req.user.id) === Number(order.user_id)) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    return res.json({ order, items });
  }

  // otherwise deny
  return res.status(403).json({ error: 'Acesso negado' });
});

/* ---------------- simple search / filters ---------------- */
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const rows = db.prepare('SELECT * FROM products WHERE title LIKE ? OR description LIKE ? OR category LIKE ? LIMIT 50').all(like, like, like);
  res.json(rows);
});

/* ---------------- misc ---------------- */
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id,name,email,is_admin,created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// server static assets (optional - serve images from /assets folder while testing)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
