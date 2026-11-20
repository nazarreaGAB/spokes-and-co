// Product catalogue. One source of truth, used by BOTH:
//   - server.js (Node loads it with require)
//   - index.html (the browser loads it with a <script> tag for the browser-only preview)
// Prices are in centavos (4290000 = PHP 42,900.00). Stock here is the STARTING stock.
const CATALOG = [
  { id: 'roadster-pro',      name: 'Roadster Pro 700c',    category: 'Road',     priceCents: 3850000,  stock: 8 },
  { id: 'aero-carbon-r9',    name: 'Aero Carbon R9',       category: 'Road',     priceCents: 8990000,  stock: 3 },
  { id: 'trailblazer-29',    name: 'Trailblazer 29er',     category: 'Mountain', priceCents: 4290000,  stock: 6 },
  { id: 'summit-full-sus',   name: 'Summit Full-Sus 27.5', category: 'Mountain', priceCents: 7650000,  stock: 4 },
  { id: 'cityline-commuter', name: 'Cityline Commuter',    category: 'City',     priceCents: 1890000,  stock: 12 },
  { id: 'foldie-compact',    name: 'Foldie Compact 20in',  category: 'City',     priceCents: 2350000,  stock: 9 },
  { id: 'voltride-e-city',   name: 'Voltride E-City',      category: 'Electric', priceCents: 6990000,  stock: 5 },
  { id: 'e-trail-mid-drive', name: 'E-Trail Mid-Drive',    category: 'Electric', priceCents: 12490000, stock: 2 },
  { id: 'aero-helmet',       name: 'Aero Helmet',          category: 'Gear',     priceCents: 285000,   stock: 25 },
  { id: 'led-light-set',     name: 'LED Light Set (F+R)',  category: 'Gear',     priceCents: 125000,   stock: 40 },
  { id: 'u-lock',            name: 'Heavy-Duty U-Lock',    category: 'Gear',     priceCents: 165000,   stock: 30 },
  { id: 'padded-gloves',     name: 'Padded Gloves',        category: 'Gear',     priceCents: 89000,    stock: 35 },
  { id: 'inner-tube-700c',   name: 'Inner Tube 700c',      category: 'Parts',    priceCents: 28000,    stock: 90 },
  { id: 'chain-lube',        name: 'Chain Lube 120ml',     category: 'Parts',    priceCents: 42000,    stock: 60 },
  { id: 'floor-pump',        name: 'Floor Pump w/ Gauge',  category: 'Parts',    priceCents: 148000,   stock: 20 },
  { id: 'disc-brake-pads',   name: 'Disc Brake Pads',      category: 'Parts',    priceCents: 75000,    stock: 45 },
];

if (typeof module !== 'undefined') module.exports = CATALOG;
