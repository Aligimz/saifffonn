// قاعدة البيانات: SQLite بملف واحد داخل مجلد data
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'store.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'device',
  description TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand TEXT,
  condition TEXT NOT NULL DEFAULT 'new',
  condition_note TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  description TEXT,
  specs TEXT NOT NULL DEFAULT '[]',
  options TEXT NOT NULL DEFAULT '[]',
  compatible TEXT,
  duration_days INTEGER,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sold_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  tg_token TEXT UNIQUE,
  tg_chat_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  governorate TEXT,
  address TEXT,
  notes TEXT,
  telegram_username TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  payment TEXT NOT NULL DEFAULT 'cod',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name TEXT NOT NULL,
  options_text TEXT,
  kind TEXT,
  duration_days INTEGER,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT,
  note TEXT,
  admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  reply TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'custom',
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  target TEXT NOT NULL DEFAULT 'customer',
  channel TEXT NOT NULL DEFAULT 'all',
  title TEXT,
  body TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  target TEXT,
  body TEXT,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);
`);

// ---------- الإعدادات ----------
const DEFAULT_SETTINGS = {
  store_name: 'ركن الهاتف',
  store_tagline: 'هواتف جديدة ومستعملة، كفرات، اشتراكات وبطاقات',
  store_phone: '07701234567',
  store_whatsapp: '9647701234567',
  store_address: 'بغداد، الكرادة داخل، قرب ساحة الحرية',
  store_hours: 'يومياً من 10 الصبح إلى 11 بالليل',
  announcement: 'توصيل لجميع المحافظات خلال 24 إلى 48 ساعة · الدفع عند الاستلام',
  hero_title: 'كل اللي يحتاجه تلفونك، بمكان واحد',
  hero_image: 'https://images.unsplash.com/photo-1726587912121-ea21fcc57ff8?auto=format&fit=crop&w=1400&q=80',
  hero_subtitle: 'أجهزة جديدة بكارتونها ومستعملة مفحوصة، كفرات لكل الموديلات، واشتراكات وبطاقات تنشحن خلال دقائق.',
  delivery_baghdad: '0',
  delivery_other: '5000',
  free_delivery_over: '1000000',
  telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
  telegram_bot_username: '',
  telegram_admin_chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  whatsapp_token: process.env.WHATSAPP_TOKEN || '',
  whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID || '',
  whatsapp_admin_number: process.env.WHATSAPP_ADMIN_NUMBER || '',
  whatsapp_template_name: '',
  whatsapp_template_lang: 'ar',
  notify_admin_new_order: '1',
  notify_admin_new_message: '1',
  notify_customer_status: '1',
  remind_pending_minutes: '60',
  remind_review_days: '3',
  remind_sub_before_days: '3',
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (!getSettingStmt.get(k)) setSettingStmt.run(k, v);
}

function getSetting(key) {
  const row = getSettingStmt.get(key);
  return row ? row.value : (DEFAULT_SETTINGS[key] ?? '');
}
function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function setSettings(obj) {
  const tx = db.transaction((o) => {
    for (const [k, v] of Object.entries(o)) {
      if (k in DEFAULT_SETTINGS) setSettingStmt.run(k, v == null ? '' : String(v));
    }
  });
  tx(obj);
}

// ---------- بيانات أولية (تنضاف أول تشغيل فقط وتكدر تعدلها أو تحذفها من لوحة الإدارة) ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (count > 0) return;

  const cats = [
    ['phones-new', 'أجهزة جديدة', 'device', 'أجهزة أصلية بكارتونها مع ضمان الوكيل', 1],
    ['phones-used', 'أجهزة مستعملة', 'device', 'مفحوصة بالكامل مع ضمان المحل', 2],
    ['cases', 'كفرات وحمايات', 'case', 'كفرات وشاشات حماية لكل الموديلات', 3],
    ['subscriptions', 'اشتراكات', 'subscription', 'تليكرام بريميوم، شاهد، نتفلكس وغيرها', 4],
    ['cards', 'بطاقات شحن', 'card', 'بطاقات آيتونز، كوكل بلي، ببجي، رصيد', 5],
    ['accessories', 'إكسسوارات', 'accessory', 'شواحن، سماعات، كيبلات', 6],
  ];
  const insCat = db.prepare('INSERT INTO categories(slug, name, kind, description, sort) VALUES (?,?,?,?,?)');
  const catId = {};
  for (const c of cats) catId[c[0]] = insCat.run(...c).lastInsertRowid;

  const ins = db.prepare(`INSERT INTO products
    (category_id, name, brand, condition, condition_note, price, old_price, stock, description, specs, options, compatible, duration_days, featured)
    VALUES (@category_id, @name, @brand, @condition, @condition_note, @price, @old_price, @stock, @description, @specs, @options, @compatible, @duration_days, @featured)`);
  // صور المنتجات الأولية من Unsplash (رخصة مجانية للاستخدام التجاري). بدلها بصور بضاعتك الحقيقية من لوحة الإدارة.
  const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
  const insImg = db.prepare('INSERT INTO product_images(product_id, path, sort) VALUES (?,?,?)');
  const P = (o) => {
    const { images = [], ...rest } = o;
    const id = ins.run({
      condition: 'new', condition_note: null, old_price: null, stock: 10, description: '', compatible: null, duration_days: null, featured: 0,
      ...rest, specs: JSON.stringify(o.specs || []), options: JSON.stringify(o.options || []),
    }).lastInsertRowid;
    images.forEach((img, i) => insImg.run(id, U(img), i));
    return id;
  };
  const storage = (vals) => ({ name: 'السعة', values: vals.map(([label, delta]) => ({ label, delta })) });
  const color = (vals) => ({ name: 'اللون', values: vals.map((label) => ({ label, delta: 0 })) });

  P({ category_id: catId['phones-new'], name: 'iPhone 17 Pro Max', images: ['1758327059164-396c3602b8f5', '1770238586572-3f3887b0dfd6', '1758348844351-48e1ec64cd96'], brand: 'Apple', price: 2150000, old_price: 2300000, featured: 1,
    specs: ['شاشة 6.9 إنچ', 'معالج A19 Pro', 'ثلاث كاميرات 48MP', '5G'], options: [storage([['256GB', 0], ['512GB', 400000], ['1TB', 800000]]), color(['برتقالي', 'أزرق غامق', 'فضي'])],
    description: 'جهاز جديد بكارتونه مع ضمان سنة كاملة. نسخة الشرق الأوسط، يدعم شريحتين.' });
  P({ category_id: catId['phones-new'], name: 'Galaxy S26 Ultra', images: ['1678911820864-e2c567c655d7', '1709744722656-9b850470293f'], brand: 'Samsung', price: 1950000, featured: 1,
    specs: ['شاشة 6.9 إنچ', 'قلم S Pen', 'كاميرا 200MP', 'بطارية 5000mAh'], options: [storage([['256GB', 0], ['512GB', 300000]]), color(['أسود', 'فضي', 'أخضر'])],
    description: 'أحدث جهاز من سامسونج مع ضمان الوكيل.' });
  P({ category_id: catId['phones-new'], name: 'Redmi Note 15 Pro', images: ['1598327105666-5b89351aff97', '1702451462735-3f0ba7679641'], brand: 'Xiaomi', price: 420000,
    specs: ['شاشة 6.67 إنچ', 'كاميرا 200MP', 'بطارية 5110mAh', 'مقاومة IP68'], options: [storage([['256GB', 0], ['512GB', 75000]])] });
  P({ category_id: catId['phones-new'], name: 'Galaxy A56', images: ['1707438095940-1eee18e85400', '1644501618169-bab16b6e6efb'], brand: 'Samsung', price: 520000,
    specs: ['شاشة 6.7 إنچ', 'Super AMOLED', 'شحن 45W'], options: [storage([['128GB', 0], ['256GB', 90000]])] });

  P({ category_id: catId['phones-used'], name: 'iPhone 15 Pro', images: ['1592750475338-74b7b21085ab', '1759588071814-f960ed8f7ee8'], brand: 'Apple', condition: 'used', condition_note: 'نظافة 95%، بطارية 89%، بدون صيانة', price: 1050000, stock: 1, featured: 1,
    specs: ['256GB', 'تيتانيوم طبيعي', 'مع الكارتون والشاحن'], description: 'جهاز مستعمل نظيف جداً، مفحوص بالكامل مع ضمان المحل 3 أشهر.' });
  P({ category_id: catId['phones-used'], name: 'Galaxy S24', images: ['1705585174953-9b2aa8afc174', '1705585175110-d25f92c183aa'], brand: 'Samsung', condition: 'used', condition_note: 'نظافة 90%، خدش خفيف بالإطار', price: 620000, stock: 1,
    specs: ['256GB', 'أسود', 'بدون كارتون'] });
  P({ category_id: catId['phones-used'], name: 'iPhone 13', images: ['1678685888221-cda773a3dcdb', '1695822822491-d92cee704368'], brand: 'Apple', condition: 'used', condition_note: 'بطارية 84%، شاشة أصلية', price: 480000, stock: 2,
    specs: ['128GB', 'أزرق'] });

  P({ category_id: catId['cases'], name: 'كفر سيليكون أصلي مع MagSafe', images: ['1736173155811-e8142fd553ee', '1535157412991-2ef801c1748b'], brand: 'Apple', price: 35000, stock: 40, compatible: 'iPhone 17 Pro, iPhone 17 Pro Max, iPhone 16 Pro',
    options: [{ name: 'الموديل', values: [{ label: 'iPhone 17 Pro', delta: 0 }, { label: 'iPhone 17 Pro Max', delta: 3000 }] }, color(['أسود', 'رصاصي', 'كحلي'])] });
  P({ category_id: catId['cases'], name: 'كفر شفاف مضاد للصدمات', images: ['1606041011872-596597976b25', '1623393884989-cb3663e431c5'], brand: 'Spigen', price: 18000, stock: 60, compatible: 'Galaxy S26 Ultra, Galaxy S25 Ultra, iPhone 17',
    options: [{ name: 'الموديل', values: [{ label: 'Galaxy S26 Ultra', delta: 0 }, { label: 'Galaxy S25 Ultra', delta: 0 }, { label: 'iPhone 17', delta: 0 }] }] });
  P({ category_id: catId['cases'], name: 'شاشة حماية زجاج 9H', images: ['1583291023438-41cef6453b1f'], brand: 'Generic', price: 7000, stock: 200, compatible: 'أغلب الموديلات',
    description: 'نركبها مجاناً إذا استلمت من المحل.' });

  P({ category_id: catId['subscriptions'], name: 'تليكرام بريميوم', images: ['1751459422184-e0554bb8db0b', '1752218804026-aaa5a97a6c6c'], brand: 'Telegram', price: 9000, stock: 999, duration_days: 30, featured: 1,
    options: [{ name: 'المدة', values: [{ label: 'شهر', delta: 0 }, { label: '3 أشهر', delta: 16000 }, { label: 'سنة', delta: 51000 }] }],
    description: 'تفعيل على حسابك مباشرة بدون ما تعطي كلمة السر. اكتب معرف حسابك وقت الطلب.' });
  P({ category_id: catId['subscriptions'], name: 'نتفلكس بريميوم', images: ['1593359677879-a4bb92f829d1'], brand: 'Netflix', price: 15000, stock: 999, duration_days: 30,
    description: 'حساب بروفايل خاص بيك بجودة 4K. يوصلك على واتساب أو تليكرام.' });
  P({ category_id: catId['subscriptions'], name: 'شاهد VIP', images: ['1522869635100-9f4c5e86aa37'], brand: 'Shahid', price: 8000, stock: 999, duration_days: 30 });

  P({ category_id: catId['cards'], name: 'بطاقة آيتونز أمريكي', images: ['1545785028-23ee5937cf69'], brand: 'Apple', price: 15500, stock: 999,
    options: [{ name: 'الفئة', values: [{ label: '$10', delta: 0 }, { label: '$25', delta: 23000 }, { label: '$50', delta: 61000 }] }] });
  P({ category_id: catId['cards'], name: 'شدات ببجي UC', images: ['1564049489314-60d154ff107d'], brand: 'PUBG', price: 1500, stock: 999,
    options: [{ name: 'الكمية', values: [{ label: '60 UC', delta: 0 }, { label: '325 UC', delta: 5500 }, { label: '660 UC', delta: 12000 }] }], featured: 1 });
  P({ category_id: catId['cards'], name: 'رصيد زين / آسياسيل', images: ['1521931961826-fe48677230a5'], brand: 'رصيد', price: 5250, stock: 999,
    options: [{ name: 'الشبكة', values: [{ label: 'زين', delta: 0 }, { label: 'آسياسيل', delta: 0 }] }, { name: 'الفئة', values: [{ label: '5,000', delta: 0 }, { label: '10,000', delta: 5000 }, { label: '25,000', delta: 20000 }] }] });

  P({ category_id: catId['accessories'], name: 'شاحن سريع 25W', images: ['1725304382197-663ae3864750', '1557767382-97b28f5488e7'], brand: 'Samsung', price: 22000, stock: 50, specs: ['USB-C', 'أصلي'] });
  P({ category_id: catId['accessories'], name: 'AirPods Pro 3', images: ['1606841837239-c5a1a4a07af7', '1572569511254-d8f925fe2cbb', '1606741965326-cb990ae01bb2'], brand: 'Apple', price: 365000, stock: 8, featured: 1, specs: ['عزل ضوضاء', 'علبة MagSafe'] });
}
seed();

module.exports = { db, getSetting, getSettings, setSettings, DEFAULT_SETTINGS, DATA_DIR };
