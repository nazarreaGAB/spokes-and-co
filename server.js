// Spokes & Co. - API layer (plain Node, no npm packages).
//
// Job of this file:
//   1. serve the UI,
//   2. check the SHAPE of each request,
//   3. hand the catalogue, current stock and the customer's quantities to the
//      compiled COBOL program (backend/shop) and read its answer,
//   4. update the in-memory stock ONLY after COBOL accepted the order.
//
// It never calculates a price. If the COBOL program is missing, the API says so
// (503) and does not fall back to JavaScript math.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const CATALOG = require('./catalog.js');

const PORT = process.env.PORT || 4173;
const HOST = '0.0.0.0';
const COBOL_BIN = process.env.COBOL_BIN ||
  path.join(__dirname, 'backend', process.platform === 'win32' ? 'shop.exe' : 'shop');
const BUILD_HELP = 'Run "npm run build:cobol". If cobc is missing, use Codespaces: Rebuild Container.';

// Stock lives in this running process and resets when the server restarts.
const freshStock = () => CATALOG.map(p => p.stock);
let stock = freshStock();
let orderCounter = 0;

const productsView = () => CATALOG.map((p, i) => ({
  id: p.id, name: p.name, category: p.category, priceCents: p.priceCents, stock: stock[i],
}));

// ---------- helpers ---------------------------------------------------
function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status; e.code = code;
  return e;
}

// Runs one job at a time so two checkouts can never read the same stock.
let chain = Promise.resolve();
function exclusive(fn) {
  const job = chain.then(fn);
  chain = job.catch(() => {});
  return job;
}

function spawnCobol(lines) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(COBOL_BIN)) {
      return reject(httpError(503, 'E98', 'The COBOL program is not built yet. ' + BUILD_HELP));
    }
    const child = spawn(COBOL_BIN, [], { cwd: __dirname });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.stdin.on('error', () => {}); // COBOL may stop reading after an error
    child.on('error', e => {
      clearTimeout(timer);
      reject(httpError(503, 'E98', 'Could not start the COBOL program: ' + e.message));
    });
    child.on('close', () => {
      clearTimeout(timer);
      const rows = out.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
      if (!rows.length) return reject(httpError(503, 'E97', 'COBOL returned no answer. ' + err.trim()));
      resolve(rows);
    });
    child.stdin.end(lines.join('\n') + '\n');
  });
}

// ---------- request -> COBOL input --------------------------------------
// One fixed-width record per catalogue product, 21 characters:
//   sign(1) quantity(6) unitPriceCents(8) stock(6)
function buildInput(command, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const promo = String(body.promo || '').trim();
  if (!/^[A-Za-z0-9]{0,12}$/.test(promo)) throw httpError(400, 'E08', 'Promo code not recognised');

  const qty = new Array(CATALOG.length).fill(0);
  const seen = new Set();
  for (const it of items) {
    const i = it && typeof it.id === 'string' ? CATALOG.findIndex(p => p.id === it.id) : -1;
    if (i < 0) throw httpError(400, 'E05', 'Unknown product in basket');
    if (!Number.isInteger(it.quantity) || Math.abs(it.quantity) > 999999) {
      throw httpError(400, 'E03', 'Quantity must be a whole number');
    }
    if (seen.has(i)) throw httpError(400, 'E07', 'Duplicate product in basket');
    seen.add(i);
    qty[i] = it.quantity;
  }

  const lines = [command, promo, String(CATALOG.length).padStart(2, '0')];
  CATALOG.forEach((p, i) => {
    lines.push(
      (qty[i] < 0 ? '-' : '+') + String(Math.abs(qty[i])).padStart(6, '0') +
      String(p.priceCents).padStart(8, '0') +
      String(stock[i]).padStart(6, '0'));
  });
  return lines;
}

// ---------- COBOL output -> JSON ------------------------------------------
function parseResult(rows) {
  const err = rows.find(r => r.startsWith('ERR|'));
  if (err) {
    const [, code, pos, ...msg] = err.split('|');
    const i = parseInt(pos, 10) - 1;
    let message = msg.join('|').trim();
    if (code === 'E06' && CATALOG[i]) {
      message = `Not enough stock for ${CATALOG[i].name}. Only ${stock[i]} left.`;
    }
    throw httpError(code === 'E06' ? 409 : 400, code, message);
  }
  const money = rows.find(r => r.startsWith('T|'));
  const lines = rows.filter(r => r.startsWith('R|'));
  if (!rows.includes('OK') || !money || lines.length !== CATALOG.length) {
    throw httpError(500, 'E96', 'Unexpected answer from the COBOL program');
  }
  const t = money.split('|').map(n => parseInt(n, 10));
  return {
    remaining: lines.map(l => parseInt(l.split('|')[1], 10)),
    items: lines.map((l, i) => {
      const p = l.split('|').map(n => parseInt(n, 10));
      return { i, quantity: p[2], unitPriceCents: p[3], discountCents: p[4], lineTotalCents: p[5] };
    }).filter(x => x.quantity > 0).map(x => ({
      id: CATALOG[x.i].id, name: CATALOG[x.i].name, quantity: x.quantity,
      unitPriceCents: x.unitPriceCents, discountCents: x.discountCents, lineTotalCents: x.lineTotalCents,
    })),
    summary: { subtotalCents: t[1], promoDiscountCents: t[2], vatCents: t[3], shippingCents: t[4] },
    totalCents: t[5],
  };
}

// QUOTE = price it, change nothing. CHECKOUT = price it, then commit stock.
function priceOrder(command, body) {
  return exclusive(async () => {
    const result = parseResult(await spawnCobol(buildInput(command, body)));
    const reply = { items: result.items, summary: result.summary, totalCents: result.totalCents };
    if (command === 'CHECKOUT') {
      stock = result.remaining;                       // only after COBOL said yes
      orderCounter += 1;
      reply.orderId = 'SC-' + Date.now().toString(36).toUpperCase() + '-' + orderCounter;
      reply.products = productsView();
    }
    return reply;
  });
}

// ---------- HTTP ---------------------------------------------------------
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 20000) { reject(httpError(400, 'E95', 'Request too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(httpError(400, 'E95', 'Request body is not valid JSON')); }
    });
  });
}

async function handleApi(req, res) {
  const route = req.method + ' ' + req.url.split('?')[0];
  try {
    if (route === 'GET /api/status') {
      try {
        const rows = await spawnCobol(['STATUS']);
        if (rows[0] !== 'COBOL|CONNECTED') throw httpError(503, 'E97', 'Unexpected answer from COBOL');
        return send(res, 200, { api: 'connected', cobolConnected: true });
      } catch (e) {
        return send(res, 503, { api: 'connected', cobolConnected: false, error: e.message, help: BUILD_HELP });
      }
    }
    if (route === 'GET /api/products') return send(res, 200, { products: productsView() });
    if (route === 'POST /api/quote') return send(res, 200, await priceOrder('QUOTE', await readBody(req)));
    if (route === 'POST /api/checkout') return send(res, 200, await priceOrder('CHECKOUT', await readBody(req)));
    if (route === 'POST /api/reset') {
      await exclusive(async () => { stock = freshStock(); });
      return send(res, 200, { products: productsView() });
    }
    return send(res, 404, { error: 'Not found', code: 'E404' });
  } catch (e) {
    return send(res, e.status || 500, { error: e.message, code: e.code || 'E99' });
  }
}

// Only these files are ever served, so server.js and backend/ stay private.
const STATIC = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/catalog.js': ['catalog.js', 'text/javascript'],
};

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  const hit = STATIC[req.url.split('?')[0]];
  if (!hit) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, hit[0]), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': hit[1] + '; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, HOST, () => console.log(`Spokes & Co. running on http://localhost:${PORT}`));
