# Spokes & Co. Bike Shop

The working shop follows this path:

**Browser UI → Node.js API → compiled GnuCOBOL checkout**

This is a demo only. It has no payment processing, customer accounts, or personal data. Inventory is held in the running Node process and resets when the server restarts.

## Start Here

You do not need to install Node.js or COBOL on your computer. Work in GitHub Codespaces in your browser.

1. Open the project repository.
2. Click **Fork** near the top-right, then **Create fork**. You now have your own copy.
3. Open your fork. Click **Code → Codespaces → Create codespace on main**. Make sure you are on your fork, not the original repository.
4. Wait for setup to finish. It installs GnuCOBOL and compiles the COBOL program automatically.
5. In the Codespaces terminal, type `npm start` and press Enter.
6. Open port **4173** when Codespaces offers it, or select port 4173 in the **Ports** tab.

### Share the running site

While your Codespace is running, open the **Ports** tab, right-click port 4173, choose **Port Visibility → Public**, and copy the link. Anyone with the link can use the shop until the Codespace stops.

### Optional: browser-only preview (GitHub Pages)

In the repo go to **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. GitHub gives you a public link to the storefront. GitHub Pages cannot run the Node API or COBOL, so the page shows a labelled **browser-only preview** with checkout disabled. Use your Codespace for the real checkout.

## If You Edit COBOL

After changing `backend/shop.cbl`, rebuild it before testing:

```
npm run build:cobol
```

Then restart the app with `npm start`. Check `GET /api/status` to confirm the compiled COBOL program is connected. If `cobc` is missing, use Codespaces: **Rebuild Container** from the Command Palette.

## How the Three Layers Work

- **UI** (`index.html`, `styles.css`, `app.js`): loads products from the API, keeps basket changes local, and calls the API for a live quote. The browser never calculates money.
- **API** (`server.js`): binds to `0.0.0.0:4173`, serves the UI, validates the request shape, and passes the catalogue, current stock, and quantities to the COBOL executable. It updates stock only after COBOL accepts the order. If the executable is missing it returns 503 and never replaces COBOL with JavaScript math.
- **COBOL** (`backend/shop.cbl`): validates quantities against stock, rejects overselling, applies discounts, promo codes, VAT and shipping, and returns the remaining stock and totals.

## Business Rules (all in `backend/shop.cbl`)

| Rule | Value |
|---|---|
| Bulk discount | 3+ of the same item: 5% off that line. 5+: 10% off that line |
| Promo `RIDE10` | 10% off the subtotal |
| Promo `WELCOME500` | ₱500 off, only if the subtotal is at least ₱5,000 |
| VAT | 12% on the discounted amount |
| Shipping | ₱250, free when the discounted amount is ₱5,000 or more |
| Quantity per item | 0 to 50, whole numbers, never negative |
| Stock | An order can never exceed available stock |
| Basket | Must contain at least one item |

## API Contract

- `GET /api/status` runs the compiled COBOL health check. Connected response: `{"api":"connected","cobolConnected":true}`. If the executable is missing or fails, the API returns 503 with build instructions.
- `GET /api/products` returns `{ "products": [{ "id", "name", "category", "priceCents", "stock" }] }`.
- `POST /api/quote` accepts `{ "items": [{ "id": "led-light-set", "quantity": 3 }], "promo": "RIDE10" }` and returns COBOL's calculation without changing stock.
- `POST /api/checkout` accepts the same body, calculates through COBOL, deducts stock, and returns `orderId`, receipt `items`, a `summary`, `totalCents`, and the updated `products`.
- `POST /api/reset` restores the starting stock and returns the refreshed product list.

Invalid requests return 400, stock conflicts return 409, and an unavailable COBOL executable returns 503. Failed orders do not update stock. All money is whole centavos (`4290000` = ₱42,900.00).

### The Node ↔ COBOL record format

Node writes these lines to COBOL's stdin:

```
CHECKOUT                  command (STATUS, QUOTE or CHECKOUT)
RIDE10                    promo code (blank = none)
16                        number of products
+000003000125000000040    one record per product: sign, quantity(6), unit price in centavos(8), stock(6)
+000000000028000000090
...
```

COBOL answers with either `ERR|code|product position|message`, or:

```
OK
R|remaining stock|quantity|unit price|discount|line total     one per product
T|subtotal|promo discount|VAT|shipping|total
```

## Project Map

- UI: `index.html`, `styles.css`, `app.js`, `catalog.js`
- API: `server.js`
- COBOL checkout: `backend/shop.cbl`
- Build script: `scripts/build-cobol.js`
- Codespaces setup: `.devcontainer/`

`catalog.js` holds the product list once. `server.js` loads it for the API, and the browser loads it for the preview.
