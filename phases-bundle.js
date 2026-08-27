/* Kissan Fertilizer — ALL PHASES BUNDLE v83
 * Upload: index.html + sw.js + security-language.js + phases-bundle.js
 */

/* ==== phase2-orders.js ==== */
/**
 * Kissan Fertilizer — Phase 2: Sales & Order Processing
 * - Order Cancellation (SO / PO)
 * - Pending Orders views (Party / Item)
 * - Delivery Challan from Order
 * - Bill Settlement (Cash / Bank / Advance / Credit split)
 * - Multiple Price Lists
 * - Party-wise special rates
 * - Item Qty-wise discount slabs
 */
(function (global) {
  'use strict';

  const PRICE_LISTS_KEY = 'kissan_price_lists';
  const ACTIVE_PL_KEY = 'kissan_active_price_list';

  /* ---------- Price Lists (local + optional Firestore later) ---------- */
  function getPriceLists() {
    try {
      return JSON.parse(localStorage.getItem(PRICE_LISTS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setPriceLists(arr) {
    localStorage.setItem(PRICE_LISTS_KEY, JSON.stringify(arr || []));
  }
  function getActivePriceListId() {
    return localStorage.getItem(ACTIVE_PL_KEY) || '';
  }
  function setActivePriceListId(id) {
    if (!id) localStorage.removeItem(ACTIVE_PL_KEY);
    else localStorage.setItem(ACTIVE_PL_KEY, id);
  }

  /**
   * Resolve sale rate for product + party + qty.
   * Priority: party special rate → price list → qty slab discount on salePrice → salePrice
   */
  function resolveItemRate(product, party, qty) {
    if (!product) return 0;
    let rate = Number(product.salePrice || 0);

    // Party-wise special rates: product.partyRates = { [partyId]: rate }
    if (party && party.id && product.partyRates && product.partyRates[party.id] != null) {
      rate = Number(product.partyRates[party.id]);
    } else if (party && party.specialRates && party.specialRates[product.id] != null) {
      rate = Number(party.specialRates[product.id]);
    }

    // Active price list override
    const plId = getActivePriceListId();
    if (plId) {
      const lists = getPriceLists();
      const pl = lists.find((x) => x.id === plId);
      if (pl && pl.rates && pl.rates[product.id] != null) {
        rate = Number(pl.rates[product.id]);
      }
    }

    // Qty-wise discount slabs: product.qtySlabs = [{ minQty, discountPercent }]
    const slabs = product.qtySlabs || [];
    if (slabs.length && qty > 0) {
      const sorted = slabs.slice().sort((a, b) => Number(b.minQty || 0) - Number(a.minQty || 0));
      const hit = sorted.find((s) => qty >= Number(s.minQty || 0));
      if (hit && Number(hit.discountPercent) > 0) {
        rate = rate * (1 - Number(hit.discountPercent) / 100);
      }
    }

    return Math.round(rate * 100) / 100;
  }

  /* ---------- Order Cancel ---------- */
  async function cancelSalesOrder(id) {
    const STATE = global.STATE;
    const db = global.db;
    const o = (STATE.salesOrders || []).find((x) => x.id === id);
    if (!o) {
      global.toast('Order not found', 'error');
      return;
    }
    if (o.status === 'Cancelled') {
      global.toast('Already cancelled', 'info');
      return;
    }
    if (o.status === 'Billed' || o.saleId) {
      global.toast('Billed order cancel nahi — pehle linked sale handle karein', 'error');
      return;
    }
    if (global.KissanPhase1 && !global.KissanPhase1.assertNotFrozen(o.date)) return;
    if (!confirm(`Cancel sales order ${o.docNo || id}?`)) return;
    try {
      // Use globals already in module scope of index — call via window helpers
      await global.__phase2UpdateDoc('salesOrders', id, {
        status: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown'
      });
      const i = STATE.salesOrders.findIndex((x) => x.id === id);
      if (i >= 0) {
        STATE.salesOrders[i] = {
          ...STATE.salesOrders[i],
          status: 'Cancelled',
          cancelledAt: new Date().toISOString()
        };
      }
      if (typeof global.logAudit === 'function') {
        await global.logAudit('Cancel', `Sales order ${o.docNo} cancelled`);
      }
      global.toast('Order cancelled', 'success');
      if (global.ACTIVE_PAGE === 'salesOrders') global.goPage('salesOrders');
    } catch (e) {
      global.toast('Cancel failed: ' + e.message, 'error');
    }
  }

  async function cancelPurchaseOrder(id) {
    const STATE = global.STATE;
    const o = (STATE.purchaseOrders || []).find((x) => x.id === id);
    if (!o) {
      global.toast('Order not found', 'error');
      return;
    }
    if (o.status === 'Cancelled') {
      global.toast('Already cancelled', 'info');
      return;
    }
    if (o.status === 'Received') {
      global.toast('Received order cancel nahi ho sakta', 'error');
      return;
    }
    if (global.KissanPhase1 && !global.KissanPhase1.assertNotFrozen(o.date)) return;
    if (!confirm(`Cancel purchase order ${o.docNo || id}?`)) return;
    try {
      await global.__phase2UpdateDoc('purchaseOrders', id, {
        status: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown'
      });
      const i = STATE.purchaseOrders.findIndex((x) => x.id === id);
      if (i >= 0) {
        STATE.purchaseOrders[i] = { ...STATE.purchaseOrders[i], status: 'Cancelled' };
      }
      if (typeof global.logAudit === 'function') {
        await global.logAudit('Cancel', `Purchase order ${o.docNo} cancelled`);
      }
      global.toast('PO cancelled', 'success');
      if (global.ACTIVE_PAGE === 'purchaseOrders') global.goPage('purchaseOrders');
    } catch (e) {
      global.toast('Cancel failed: ' + e.message, 'error');
    }
  }

  /* ---------- Pending filters ---------- */
  function pendingSalesOrders(filter) {
    const rows = (global.STATE.salesOrders || []).filter(
      (r) => !r.status || r.status === 'Pending'
    );
    if (!filter || filter === 'all') return rows;
    if (filter.type === 'party') return rows.filter((r) => r.partyId === filter.id || r.partyName === filter.name);
    if (filter.type === 'item') return rows.filter((r) => r.productId === filter.id || r.productName === filter.name);
    return rows;
  }
  function pendingPurchaseOrders(filter) {
    const rows = (global.STATE.purchaseOrders || []).filter(
      (r) => !r.status || r.status === 'Pending'
    );
    if (!filter || filter === 'all') return rows;
    if (filter.type === 'supplier')
      return rows.filter((r) => r.supplierId === filter.id || r.supplierName === filter.name);
    if (filter.type === 'item') return rows.filter((r) => r.productId === filter.id || r.productName === filter.name);
    return rows;
  }

  /* ---------- Delivery Challan print ---------- */
  function printDeliveryChallan(orderId, kind) {
    const STATE = global.STATE;
    const r =
      kind === 'purchase'
        ? (STATE.purchaseOrders || []).find((x) => x.id === orderId)
        : (STATE.salesOrders || []).find((x) => x.id === orderId);
    if (!r) {
      global.toast('Order not found', 'error');
      return;
    }
    const title = kind === 'purchase' ? 'Goods Receipt Note / Challan' : 'Delivery Challan';
    const partyLabel = kind === 'purchase' ? 'Supplier' : 'Customer';
    const partyName = kind === 'purchase' ? r.supplierName || '—' : r.partyName || 'Walk-in';
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) {
      global.toast('Popup blocked', 'error');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#1a2218}
        h1{font-size:18px;margin:0 0 4px}
        .sub{color:#666;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
        th{background:#f5f1e6}
        .right{text-align:right}
        .stamp{display:inline-block;border:2px dashed #1a5c38;padding:4px 12px;font-weight:700;color:#1a5c38;margin-top:12px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>Kissan Fertilizer — ${title}</h1>
      <div class="sub">Miro Khan Road, Kamber · ${r.docNo || '—'} · ${r.date || ''}</div>
      <p><b>${partyLabel}:</b> ${partyName}</p>
      ${r.takenBy ? `<p><b>Taken by:</b> ${r.takenBy}</p>` : ''}
      <table>
        <thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${r.productName || '—'}</td>
            <td class="right">${r.qty || 0}</td>
            <td class="right">${Number(r.rate || 0).toLocaleString('en-PK')}</td>
            <td class="right">${Number(r.total || 0).toLocaleString('en-PK')}</td>
          </tr>
        </tbody>
      </table>
      <div class="stamp">${(r.status || 'Pending').toUpperCase()}</div>
      <p style="margin-top:28px;font-size:11px;color:#888">Software by Fazul Khan Chandio · 03333909816</p>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    win.document.close();
  }

  /* ---------- Bill settlement helpers ---------- */
  function settlementFromForm() {
    const cash = Number(document.getElementById('sPayCash')?.value) || 0;
    const bank = Number(document.getElementById('sPayBank')?.value) || 0;
    const advance = Number(document.getElementById('sPayAdvance')?.value) || 0;
    const total = (() => {
      const qty = Number(document.getElementById('sQty')?.value) || 0;
      const rate = Number(document.getElementById('sRate')?.value) || 0;
      const disc = Number(document.getElementById('sDiscPct')?.value) || 0;
      const sub = qty * rate;
      return sub - (sub * disc) / 100;
    })();
    const paid = cash + bank + advance;
    const credit = Math.max(0, Math.round((total - paid) * 100) / 100);
    return { cash, bank, advance, credit, paid, total };
  }

  function settlementHtml(base) {
    const b = base || {};
    return `
      <div class="field" style="grid-column:1/-1">
        <label style="font-weight:700">Bill Settlement</label>
        <p class="hint">Cash + Bank + Advance; baqi credit (udhaar) party ledger pe</p>
      </div>
      <div class="field"><label>Cash received</label>
        <input type="number" id="sPayCash" step="0.01" value="${b.payCash != null ? b.payCash : ''}" oninput="window.KissanPhase2.recalcSettlement()" placeholder="0">
      </div>
      <div class="field"><label>Bank / Online</label>
        <input type="number" id="sPayBank" step="0.01" value="${b.payBank != null ? b.payBank : ''}" oninput="window.KissanPhase2.recalcSettlement()" placeholder="0">
      </div>
      <div class="field"><label>Advance adjusted</label>
        <input type="number" id="sPayAdvance" step="0.01" value="${b.payAdvance != null ? b.payAdvance : ''}" oninput="window.KissanPhase2.recalcSettlement()" placeholder="0">
      </div>
      <div class="field"><label>Credit (udhaar) balance</label>
        <div class="mono" id="sPayCreditPreview" style="padding:11px 13px;background:var(--wheat-soft);border-radius:10px;font-weight:700">Rs. 0</div>
      </div>`;
  }

  function recalcSettlement() {
    const s = settlementFromForm();
    const el = document.getElementById('sPayCreditPreview');
    if (el) el.textContent = 'Rs. ' + s.credit.toLocaleString('en-PK');
    // Keep classic payMode in sync for reports
    const modeEl = document.getElementById('sPayMode');
    if (modeEl) {
      if (s.credit > 0 && s.paid > 0) modeEl.value = 'Partial';
      else if (s.credit > 0) modeEl.value = 'Credit';
      else if (s.bank > 0 && s.cash <= 0) modeEl.value = 'Bank';
      else modeEl.value = 'Cash';
    }
  }

  /* ---------- Price list UI (settings snippet) ---------- */
  function priceListSettingsHtml() {
    const lists = getPriceLists();
    const active = getActivePriceListId();
    const products = (global.STATE && global.STATE.products) || [];
    let rows = lists
      .map(
        (pl) => `
      <tr>
        <td>${pl.name}</td>
        <td class="mono">${Object.keys(pl.rates || {}).length} items</td>
        <td>${active === pl.id ? '<span class="stamp ok">Active</span>' : '—'}</td>
        <td class="right">
          <button class="btn btn-outline btn-sm" onclick="window.KissanPhase2.activatePriceList('${pl.id}')">Use</button>
          <button class="btn btn-danger btn-sm" onclick="window.KissanPhase2.deletePriceList('${pl.id}')">Delete</button>
        </td>
      </tr>`
      )
      .join('');
    if (!rows) rows = `<tr class="empty-row"><td colspan="4">No price lists yet.</td></tr>`;
    return `
    <div class="stitch panel">
      <div class="panel-head"><h3>Multiple Price Lists</h3>
        <button class="btn btn-primary btn-sm" onclick="window.KissanPhase2.openPriceListModal()">+ New list</button>
      </div>
      <p class="hint" style="margin-bottom:10px">Active list sale rate override karti hai (party special rate ke baad). Clear = product default sale price.</p>
      <div style="margin-bottom:10px">
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase2.activatePriceList('')">Clear active list</button>
        <span class="muted" style="margin-left:8px;font-size:12px">Active: <b>${active ? (lists.find((x) => x.id === active) || {}).name || active : 'None (default prices)'}</b></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Items</th><th>Status</th><th class="right">Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function openPriceListModal() {
    const products = (global.STATE && global.STATE.products) || [];
    const fields = products
      .map(
        (p) => `
      <div class="field">
        <label>${p.name} <span class="muted">(default ${Number(p.salePrice || 0)})</span></label>
        <input type="number" step="0.01" data-pid="${p.id}" class="pl-rate" placeholder="${p.salePrice || 0}">
      </div>`
      )
      .join('');
    global.openModal(
      'New Price List',
      `<div class="field"><label>List name *</label><input type="text" id="plName" placeholder="e.g. Wholesale / Retail / VIP"></div>
       <p class="hint">Sirf wo rates bharein jo default se alag hain.</p>
       <div style="max-height:280px;overflow:auto">${fields || '<p class="muted">No products</p>'}</div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase2.savePriceList()">Save list</button>`,
      true
    );
  }

  function savePriceList() {
    const name = (document.getElementById('plName')?.value || '').trim();
    if (!name) {
      global.toast('List name required', 'error');
      return;
    }
    const rates = {};
    document.querySelectorAll('.pl-rate').forEach((inp) => {
      const v = inp.value;
      if (v !== '' && !isNaN(Number(v))) rates[inp.getAttribute('data-pid')] = Number(v);
    });
    const lists = getPriceLists();
    const id = 'pl_' + Date.now();
    lists.push({ id, name, rates, createdAt: new Date().toISOString() });
    setPriceLists(lists);
    global.closeModal();
    global.toast('Price list saved', 'success');
    if (global.ACTIVE_PAGE === 'settings') global.goPage('settings');
  }

  function activatePriceList(id) {
    setActivePriceListId(id || '');
    global.toast(id ? 'Price list activated' : 'Using default prices', 'success');
    if (global.ACTIVE_PAGE === 'settings') global.goPage('settings');
  }

  function deletePriceList(id) {
    if (!confirm('Delete this price list?')) return;
    setPriceLists(getPriceLists().filter((x) => x.id !== id));
    if (getActivePriceListId() === id) setActivePriceListId('');
    global.toast('Deleted', 'success');
    if (global.ACTIVE_PAGE === 'settings') global.goPage('settings');
  }

  /* ---------- Apply rate on product pick ---------- */
  function applyResolvedRate(selectId, rateId, partySelectId, qtyId) {
    const sel = document.getElementById(selectId);
    const rateEl = document.getElementById(rateId);
    if (!sel || !rateEl || sel.value === '__generic__' || !sel.value) return;
    const product = ((global.STATE && global.STATE.products) || []).find((p) => p.id === sel.value);
    const partySel = partySelectId ? document.getElementById(partySelectId) : null;
    const party = partySel && partySel.value
      ? ((global.STATE && global.STATE.parties) || []).find((p) => p.id === partySel.value)
      : null;
    const qty = Number(document.getElementById(qtyId)?.value) || 0;
    const rate = resolveItemRate(product, party, qty);
    if (rate > 0) rateEl.value = rate;
    if (typeof global.recalcSaleTotal === 'function') global.recalcSaleTotal();
    recalcSettlement();
  }

  global.KissanPhase2 = {
    getPriceLists,
    setPriceLists,
    getActivePriceListId,
    resolveItemRate,
    cancelSalesOrder,
    cancelPurchaseOrder,
    pendingSalesOrders,
    pendingPurchaseOrders,
    printDeliveryChallan,
    settlementHtml,
    settlementFromForm,
    recalcSettlement,
    priceListSettingsHtml,
    openPriceListModal,
    savePriceList,
    activatePriceList,
    deletePriceList,
    applyResolvedRate
  };
})(window);


/* ==== phase3-inventory.js ==== */
/**
 * Kissan Fertilizer — Phase 3: Advanced Inventory
 * - Min / Max / Reorder levels
 * - Batch-wise stock (MFG + Expiry)
 * - Free Qty on vouchers
 * - Stock Ledger (movements)
 * - Critical Levels Report
 * - Primary + Alternate unit
 * - Stock Journal Entry
 * - Stock Ageing (FIFO-style by purchase date / batch)
 */
(function (global) {
  'use strict';

  const BATCHES_KEY = 'kissan_batches_local'; // fallback mirror; primary = Firestore `batches` if in STATE

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ---------- Levels helpers ---------- */
  function productLevels(p) {
    if (!p) return { min: 0, max: 0, reorder: 0, stock: 0 };
    const stock =
      typeof global.productEffectiveStock === 'function'
        ? global.productEffectiveStock(p)
        : Number(p.stock || 0);
    return {
      min: Number(p.minStock || 0),
      max: Number(p.maxStock || 0),
      reorder: Number(p.reorderLevel != null ? p.reorderLevel : p.lowStock || 0),
      stock
    };
  }

  function criticalProducts() {
    const list = (global.STATE && global.STATE.products) || [];
    return list
      .map((p) => {
        const L = productLevels(p);
        let status = 'ok';
        if (L.stock <= 0) status = 'out';
        else if (L.reorder > 0 && L.stock <= L.reorder) status = 'reorder';
        else if (L.min > 0 && L.stock < L.min) status = 'below_min';
        else if (L.max > 0 && L.stock > L.max) status = 'above_max';
        return { product: p, ...L, status };
      })
      .filter((x) => x.status !== 'ok');
  }

  /* ---------- Alternate unit ---------- */
  /** Convert qty in alt unit → primary. product.altUnit, product.altFactor (1 primary = factor alt) */
  function toPrimaryQty(product, qty, unitMode) {
    if (!product || unitMode !== 'alt') return Number(qty) || 0;
    const factor = Number(product.altFactor || 1) || 1;
    return Math.round((Number(qty) / factor) * 1000) / 1000;
  }
  function toAltQty(product, primaryQty) {
    const factor = Number(product.altFactor || 1) || 1;
    return Math.round(Number(primaryQty) * factor * 1000) / 1000;
  }

  /* ---------- Batches (in-memory + Firestore via STATE.batches) ---------- */
  function allBatches() {
    return (global.STATE && global.STATE.batches) || [];
  }

  function batchesForProduct(productId) {
    return allBatches().filter((b) => b.productId === productId && Number(b.qty || 0) > 0);
  }

  /** FIFO pick: oldest mfg/expiry/received first */
  function pickFifoBatches(productId, needQty) {
    const list = batchesForProduct(productId)
      .slice()
      .sort((a, b) => {
        const da = a.receivedDate || a.mfgDate || a.expiryDate || a.atLocal || '';
        const db_ = b.receivedDate || b.mfgDate || b.expiryDate || b.atLocal || '';
        return String(da).localeCompare(String(db_));
      });
    let left = Number(needQty) || 0;
    const picks = [];
    for (const b of list) {
      if (left <= 0) break;
      const take = Math.min(Number(b.qty || 0), left);
      if (take > 0) {
        picks.push({ batch: b, qty: take });
        left -= take;
      }
    }
    return { picks, shortfall: left };
  }

  function stockAgeingRows() {
    const rows = [];
    const today = todayISO();
    allBatches().forEach((b) => {
      if (Number(b.qty || 0) <= 0) return;
      const base = b.receivedDate || b.mfgDate || (b.atLocal || '').slice(0, 10) || today;
      const days = Math.max(0, Math.floor((new Date(today) - new Date(base)) / 86400000));
      let bucket = '0-30';
      if (days > 180) bucket = '180+';
      else if (days > 90) bucket = '91-180';
      else if (days > 60) bucket = '61-90';
      else if (days > 30) bucket = '31-60';
      const exp = b.expiryDate || '';
      const expired = exp && exp < today;
      const nearExpiry = exp && !expired && Math.floor((new Date(exp) - new Date(today)) / 86400000) <= 30;
      rows.push({
        ...b,
        days,
        bucket,
        expired,
        nearExpiry,
        productName:
          b.productName ||
          (((global.STATE && global.STATE.products) || []).find((p) => p.id === b.productId) || {}).name ||
          '—'
      });
    });
    return rows.sort((a, b) => b.days - a.days);
  }

  /* ---------- Stock ledger (movements) — local mirror + optional STATE.stockMoves ---------- */
  function stockMoves() {
    return (global.STATE && global.STATE.stockMoves) || [];
  }

  async function recordStockMove(entry) {
    const payload = {
      productId: entry.productId || '',
      productName: entry.productName || '',
      qty: Number(entry.qty) || 0, // signed: +in / −out
      freeQty: Number(entry.freeQty) || 0,
      type: entry.type || 'Adjust', // Purchase, Sale, Return, Journal, Transfer, Opening
      refDoc: entry.refDoc || '',
      godamId: entry.godamId || '',
      batchNo: entry.batchNo || '',
      note: entry.note || '',
      date: entry.date || todayISO(),
      atLocal: new Date().toISOString(),
      user: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown'
    };
    try {
      if (typeof global.__phase3AddDoc === 'function') {
        const id = await global.__phase3AddDoc('stockMoves', payload);
        if (global.STATE) {
          global.STATE.stockMoves = global.STATE.stockMoves || [];
          global.STATE.stockMoves = [{ id, ...payload }, ...global.STATE.stockMoves];
        }
        return id;
      }
    } catch (e) {
      console.warn('stock move record failed', e);
    }
    return null;
  }

  /* ---------- Stock Journal UI ---------- */
  function openStockJournalModal() {
    const products = (global.STATE && global.STATE.products) || [];
    const godams = (global.STATE && global.STATE.godams) || [];
    const pOpts = products
      .map((p) => {
        const st =
          typeof global.productEffectiveStock === 'function'
            ? global.productEffectiveStock(p)
            : p.stock || 0;
        return `<option value="${p.id}">${p.name} (${st} ${p.unit || ''})</option>`;
      })
      .join('');
    const gOpts =
      typeof global.godamOptionsHtml === 'function'
        ? global.godamOptionsHtml('', false)
        : godams.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
    global.openModal(
      'Stock Journal Entry',
      `<div class="grid2">
        <div class="field"><label>Product *</label><select id="sjProduct"><option value="">— Select —</option>${pOpts}</select></div>
        <div class="field"><label>Godam</label><select id="sjGodam">${gOpts}</select></div>
        <div class="field"><label>Type</label>
          <select id="sjType">
            <option value="In">Stock In (+)</option>
            <option value="Out">Stock Out (−)</option>
            <option value="Adjust">Adjust to exact qty</option>
          </select>
        </div>
        <div class="field"><label>Quantity *</label><input type="number" id="sjQty" step="0.01" min="0"></div>
        <div class="field"><label>Free qty (bonus)</label><input type="number" id="sjFree" step="0.01" min="0" value="0"></div>
        <div class="field"><label>Batch No.</label><input type="text" id="sjBatch" placeholder="optional"></div>
        <div class="field"><label>MFG date</label><input type="date" id="sjMfg"></div>
        <div class="field"><label>Expiry date</label><input type="date" id="sjExp"></div>
        <div class="field" style="grid-column:1/-1"><label>Note</label><input type="text" id="sjNote" placeholder="Reason / reference"></div>
        <div class="field"><label>Date</label><input type="date" id="sjDate" value="${todayISO()}"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase3.saveStockJournal()">Save journal</button>`
    );
  }

  async function saveStockJournal() {
    const productId = document.getElementById('sjProduct')?.value;
    const qty = Number(document.getElementById('sjQty')?.value) || 0;
    const freeQty = Number(document.getElementById('sjFree')?.value) || 0;
    const type = document.getElementById('sjType')?.value || 'In';
    const godamId = document.getElementById('sjGodam')?.value || '';
    const batchNo = (document.getElementById('sjBatch')?.value || '').trim();
    const mfgDate = document.getElementById('sjMfg')?.value || '';
    const expiryDate = document.getElementById('sjExp')?.value || '';
    const note = (document.getElementById('sjNote')?.value || '').trim();
    const date = document.getElementById('sjDate')?.value || todayISO();
    if (!productId || (qty <= 0 && type !== 'Adjust')) {
      global.toast('Product aur quantity chahiye', 'error');
      return;
    }
    if (global.KissanPhase1 && !global.KissanPhase1.assertNotFrozen(date)) return;
    const product = ((global.STATE && global.STATE.products) || []).find((p) => p.id === productId);
    if (!product) {
      global.toast('Product not found', 'error');
      return;
    }
    const current =
      typeof global.productEffectiveStock === 'function'
        ? global.productEffectiveStock(product)
        : Number(product.stock || 0);
    let delta = 0;
    if (type === 'In') delta = qty + freeQty;
    else if (type === 'Out') delta = -(qty + freeQty);
    else if (type === 'Adjust') delta = qty - current;

    try {
      if (typeof global.adjustProductStock === 'function') {
        await global.adjustProductStock(productId, delta, godamId || undefined);
      }
      // Batch layer
      if ((type === 'In' || (type === 'Adjust' && delta > 0)) && (batchNo || mfgDate || expiryDate)) {
        await addBatchRecord({
          productId,
          productName: product.name,
          batchNo: batchNo || 'J-' + Date.now(),
          qty: Math.abs(delta),
          mfgDate,
          expiryDate,
          receivedDate: date,
          godamId,
          note
        });
      }
      if (type === 'Out' && batchNo) {
        await consumeBatchQty(productId, batchNo, Math.abs(delta));
      }
      await recordStockMove({
        productId,
        productName: product.name,
        qty: delta,
        freeQty: type === 'In' ? freeQty : 0,
        type: 'Journal',
        refDoc: batchNo,
        godamId,
        batchNo,
        note,
        date
      });
      if (typeof global.logAudit === 'function') {
        await global.logAudit('Stock Journal', `${type} ${delta} x ${product.name}`);
      }
      global.toast('Stock journal saved', 'success');
      global.closeModal();
      if (global.ACTIVE_PAGE === 'products' || global.ACTIVE_PAGE === 'stockledger' || global.ACTIVE_PAGE === 'criticalstock') {
        global.goPage(global.ACTIVE_PAGE);
      }
    } catch (e) {
      global.toast('Failed: ' + e.message, 'error');
    }
  }

  async function addBatchRecord(b) {
    const payload = {
      productId: b.productId,
      productName: b.productName || '',
      batchNo: b.batchNo || '',
      qty: Number(b.qty) || 0,
      mfgDate: b.mfgDate || '',
      expiryDate: b.expiryDate || '',
      receivedDate: b.receivedDate || todayISO(),
      godamId: b.godamId || '',
      note: b.note || '',
      atLocal: new Date().toISOString()
    };
    if (typeof global.__phase3AddDoc === 'function') {
      const id = await global.__phase3AddDoc('batches', payload);
      if (global.STATE) {
        global.STATE.batches = global.STATE.batches || [];
        global.STATE.batches = [{ id, ...payload }, ...global.STATE.batches];
      }
      return id;
    }
    return null;
  }

  async function consumeBatchQty(productId, batchNo, qty) {
    const list = batchesForProduct(productId).filter((b) => b.batchNo === batchNo);
    let left = qty;
    for (const b of list) {
      if (left <= 0) break;
      const take = Math.min(Number(b.qty || 0), left);
      const newQty = Number(b.qty || 0) - take;
      left -= take;
      if (typeof global.__phase3UpdateDoc === 'function') {
        await global.__phase3UpdateDoc('batches', b.id, { qty: newQty });
      }
      if (global.STATE && global.STATE.batches) {
        const i = global.STATE.batches.findIndex((x) => x.id === b.id);
        if (i >= 0) global.STATE.batches[i] = { ...global.STATE.batches[i], qty: newQty };
      }
    }
  }

  /* ---------- Pages ---------- */
  function pageCriticalStock() {
    const rows = criticalProducts();
    const stamp = (s) => {
      if (s === 'out') return '<span class="stamp bad">OUT</span>';
      if (s === 'reorder' || s === 'below_min') return '<span class="stamp warn">REORDER</span>';
      if (s === 'above_max') return '<span class="stamp mute">OVER MAX</span>';
      return '';
    };
    return `
    <div class="page-head"><div><h2>Critical Levels</h2><p>Min / Reorder / Max thresholds</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase3.openStockJournalModal()">+ Stock Journal</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th class="right">Stock</th><th class="right">Min</th><th class="right">Reorder</th><th class="right">Max</th><th>Status</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr>
            <td style="font-weight:600">${r.product.name}</td>
            <td class="right mono">${r.stock} ${r.product.unit || ''}</td>
            <td class="right mono">${r.min || '—'}</td>
            <td class="right mono">${r.reorder || '—'}</td>
            <td class="right mono">${r.max || '—'}</td>
            <td>${stamp(r.status)}</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="6">All products within levels.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function pageStockLedger() {
    const moves = stockMoves().slice(0, 200);
    return `
    <div class="page-head"><div><h2>Stock Ledger</h2><p>In / Out movements</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase3.openStockJournalModal()">+ Journal Entry</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="right">Qty</th><th>Batch</th><th>Ref</th><th>Note</th><th>By</th></tr></thead>
        <tbody>
          ${
            moves.length
              ? moves
                  .map(
                    (m) => `<tr>
            <td class="mono">${m.date || ''}</td>
            <td>${m.productName || '—'}</td>
            <td><span class="stamp mute">${m.type || ''}</span></td>
            <td class="right mono" style="color:${Number(m.qty) < 0 ? 'var(--danger)' : 'var(--ok)'};font-weight:700">${m.qty}${m.freeQty ? ` (+${m.freeQty} free)` : ''}</td>
            <td class="mono">${m.batchNo || '—'}</td>
            <td class="mono">${m.refDoc || '—'}</td>
            <td>${m.note || ''}</td>
            <td class="muted">${m.user || ''}</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="8">No stock movements recorded yet. Use Stock Journal or purchases/sales will log here once hooked.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function pageStockAgeing() {
    const rows = stockAgeingRows();
    return `
    <div class="page-head"><div><h2>Stock Ageing (FIFO)</h2><p>By received / MFG date · Expiry alerts</p></div></div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Batch</th><th class="right">Qty</th><th>Received/MFG</th><th>Expiry</th><th class="right">Days</th><th>Bucket</th><th>Flag</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr>
            <td>${r.productName}</td>
            <td class="mono">${r.batchNo || '—'}</td>
            <td class="right mono">${r.qty}</td>
            <td class="mono">${r.receivedDate || r.mfgDate || '—'}</td>
            <td class="mono">${r.expiryDate || '—'}</td>
            <td class="right mono">${r.days}</td>
            <td>${r.bucket}</td>
            <td>${r.expired ? '<span class="stamp bad">EXPIRED</span>' : r.nearExpiry ? '<span class="stamp warn">NEAR EXP</span>' : '—'}</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="8">No batch records. Add via Stock Journal (batch/MFG/expiry) or purchase with batch.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function pageBatches() {
    const rows = allBatches().filter((b) => Number(b.qty || 0) > 0);
    return `
    <div class="page-head"><div><h2>Batches</h2><p>Batch-wise inventory with MFG &amp; Expiry</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase3.openStockJournalModal()">+ Receive batch</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Batch No.</th><th class="right">Qty</th><th>MFG</th><th>Expiry</th><th>Received</th><th>Note</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (b) => `<tr>
            <td>${b.productName || '—'}</td>
            <td class="mono">${b.batchNo || '—'}</td>
            <td class="right mono" style="font-weight:700">${b.qty}</td>
            <td class="mono">${b.mfgDate || '—'}</td>
            <td class="mono">${b.expiryDate || '—'}</td>
            <td class="mono">${b.receivedDate || '—'}</td>
            <td>${b.note || ''}</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No active batches.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Free qty field HTML for purchase/sale ---------- */
  function freeQtyFieldHtml(idPrefix, value) {
    return `<div class="field"><label>Free qty (scheme)</label>
      <input type="number" id="${idPrefix}FreeQty" step="0.01" min="0" value="${value != null ? value : 0}" placeholder="0">
      <p class="hint">Bonus / free quantity — stock mein add (purchase) ya kam (sale) without value</p>
    </div>`;
  }

  global.KissanPhase3 = {
    productLevels,
    criticalProducts,
    toPrimaryQty,
    toAltQty,
    batchesForProduct,
    pickFifoBatches,
    stockAgeingRows,
    recordStockMove,
    openStockJournalModal,
    saveStockJournal,
    addBatchRecord,
    consumeBatchQty,
    pageCriticalStock,
    pageStockLedger,
    pageStockAgeing,
    pageBatches,
    freeQtyFieldHtml
  };
})(window);


/* ==== phase4-accounts.js ==== */
/**
 * Kissan Fertilizer — Phase 4: Accounts & Outstanding
 * - Ageing Analysis (custom slabs, bill-date)
 * - Outstanding (Receivable / Payable)
 * - Statement of Account print
 * - Payment Reminder (WhatsApp / SMS link + print letter)
 * - Interest calculation (simple slabs)
 * - Credit Limits on parties
 * - Bank Reconciliation helper
 * - APP VERSION auto-update banner (works with SW)
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const AGEING_KEY = 'kissan_ageing_slabs';
  const INTEREST_KEY = 'kissan_interest_slabs';
  const BANK_KEY = 'kissan_bank_entries';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function daysBetween(from, to) {
    if (!from) return 0;
    const a = new Date(String(from).slice(0, 10));
    const b = new Date(String(to || todayISO()).slice(0, 10));
    return Math.max(0, Math.floor((b - a) / 86400000));
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }

  /* ---------- Ageing slabs ---------- */
  function getAgeingSlabs() {
    try {
      const s = JSON.parse(localStorage.getItem(AGEING_KEY) || 'null');
      if (Array.isArray(s) && s.length) return s;
    } catch (e) {}
    return [
      { label: '0-30', min: 0, max: 30 },
      { label: '31-60', min: 31, max: 60 },
      { label: '61-90', min: 61, max: 90 },
      { label: '91-180', min: 91, max: 180 },
      { label: '180+', min: 181, max: 99999 }
    ];
  }
  function setAgeingSlabs(arr) {
    localStorage.setItem(AGEING_KEY, JSON.stringify(arr));
  }
  function bucketForDays(days) {
    const slabs = getAgeingSlabs();
    for (const s of slabs) {
      if (days >= s.min && days <= s.max) return s.label;
    }
    return slabs[slabs.length - 1]?.label || 'Other';
  }

  /**
   * Outstanding sales for a party (credit portion still open — simplified:
   * uses total sales − returns − payments proportionally by bill date FIFO).
   */
  function partyBillRows(partyId) {
    const STATE = global.STATE || {};
    const sales = (STATE.sales || [])
      .filter((s) => s.partyId === partyId)
      .map((s) => {
        const credit =
          s.payCredit != null
            ? Number(s.payCredit)
            : s.payMode === 'Cash' || s.payMode === 'Bank'
              ? 0
              : Number(s.total || 0);
        return {
          id: s.id,
          docNo: s.docNo,
          date: s.date,
          total: Number(s.total || 0),
          open: credit > 0 ? credit : s.payMode === 'Credit' || s.payMode === 'Udhaar (credit)' || s.payMode === 'Partial' ? Number(s.total || 0) - Number(s.payCash || 0) - Number(s.payBank || 0) - Number(s.payAdvance || 0) : s.payMode === 'Cash' || s.payMode === 'Bank' ? 0 : Number(s.total || 0),
          productName: s.productName
        };
      })
      .filter((r) => r.open > 0.5);

    // Apply payments FIFO against open bills
    let payments = (STATE.payments || [])
      .filter((p) => p.partyType === 'party' && p.partyId === partyId && !p.isGiven)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let pool = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
    // Also subtract returns
    const returns = (STATE.salesReturns || [])
      .filter((r) => r.partyId === partyId)
      .reduce((a, r) => a + Number(r.total || 0), 0);
    pool += returns;

    const rows = sales
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const out = [];
    for (const bill of rows) {
      let open = bill.open;
      if (pool > 0) {
        const apply = Math.min(pool, open);
        open -= apply;
        pool -= apply;
      }
      if (open > 0.5) {
        const days = daysBetween(bill.date, todayISO());
        out.push({ ...bill, open, days, bucket: bucketForDays(days) });
      }
    }
    return out;
  }

  function supplierBillRows(supplierId) {
    const STATE = global.STATE || {};
    const purchases = (STATE.purchases || [])
      .filter((p) => p.supplierId === supplierId && p.payMode !== 'Cash')
      .map((p) => ({
        id: p.id,
        docNo: p.docNo,
        date: p.date,
        total: Number(p.total || 0),
        open: Number(p.total || 0),
        productName: p.productName
      }));
    let pool = (STATE.payments || [])
      .filter((p) => p.partyType === 'supplier' && p.partyId === supplierId && !p.isGiven)
      .reduce((a, p) => a + Number(p.amount || 0), 0);
    pool += (STATE.purchaseReturns || [])
      .filter((r) => r.supplierId === supplierId)
      .reduce((a, r) => a + Number(r.total || 0), 0);
    const rows = purchases.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const out = [];
    for (const bill of rows) {
      let open = bill.open;
      if (pool > 0) {
        const apply = Math.min(pool, open);
        open -= apply;
        pool -= apply;
      }
      if (open > 0.5) {
        const days = daysBetween(bill.date, todayISO());
        out.push({ ...bill, open, days, bucket: bucketForDays(days) });
      }
    }
    return out;
  }

  function ageingSummary(kind) {
    const slabs = getAgeingSlabs();
    const totals = {};
    slabs.forEach((s) => (totals[s.label] = 0));
    const parties = kind === 'payable' ? global.STATE?.suppliers || [] : global.STATE?.parties || [];
    const rows = [];
    parties.forEach((p) => {
      const bills =
        kind === 'payable' ? supplierBillRows(p.id) : partyBillRows(p.id);
      const byBucket = {};
      slabs.forEach((s) => (byBucket[s.label] = 0));
      let total = 0;
      bills.forEach((b) => {
        byBucket[b.bucket] = (byBucket[b.bucket] || 0) + b.open;
        totals[b.bucket] = (totals[b.bucket] || 0) + b.open;
        total += b.open;
      });
      if (total > 0.5) {
        rows.push({ id: p.id, name: p.name, phone: p.phone, byBucket, total, bills });
      }
    });
    rows.sort((a, b) => b.total - a.total);
    return { slabs, totals, rows };
  }

  /* ---------- Pages ---------- */
  function pageAgeing() {
    const kind = global._ageingKind || 'receivable';
    const data = ageingSummary(kind);
    const head = data.slabs.map((s) => `<th class="right">${s.label}</th>`).join('');
    const totalRow = data.slabs
      .map((s) => `<td class="right mono" style="font-weight:700">${fmt(data.totals[s.label] || 0)}</td>`)
      .join('');
    return `
    <div class="page-head">
      <div><h2>Ageing Analysis</h2><p>Bill-date based · customizable slabs</p></div>
      <div class="toolbar">
        <button class="btn btn-sm ${kind === 'receivable' ? 'btn-primary' : 'btn-outline'}" onclick="window._ageingKind='receivable';goPage('ageing')">Receivable</button>
        <button class="btn btn-sm ${kind === 'payable' ? 'btn-primary' : 'btn-outline'}" onclick="window._ageingKind='payable';goPage('ageing')">Payable</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4.editAgeingSlabs()">Slabs</button>
      </div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Party</th>${head}<th class="right">Total</th><th></th></tr></thead>
        <tbody>
          ${
            data.rows.length
              ? data.rows
                  .map((r) => {
                    const cells = data.slabs
                      .map(
                        (s) =>
                          `<td class="right mono">${r.byBucket[s.label] ? fmt(r.byBucket[s.label]) : '—'}</td>`
                      )
                      .join('');
                    return `<tr>
              <td style="font-weight:600">${r.name}</td>${cells}
              <td class="right mono" style="font-weight:800;color:var(--danger)">${fmt(r.total)}</td>
              <td class="right">
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4.printSOA('${kind === 'payable' ? 'supplier' : 'party'}','${r.id}')">SOA</button>
                <button class="btn btn-gold btn-sm" onclick="window.KissanPhase4.remindParty('${kind === 'payable' ? 'supplier' : 'party'}','${r.id}')">Remind</button>
              </td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="${data.slabs.length + 3}">No outstanding balances.</td></tr>`
          }
          ${
            data.rows.length
              ? `<tr style="background:var(--field-soft)"><td style="font-weight:800">TOTAL</td>${totalRow}<td class="right mono" style="font-weight:800">${fmt(
                  Object.values(data.totals).reduce((a, b) => a + b, 0)
                )}</td><td></td></tr>`
              : ''
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function pageOutstanding() {
    const kind = global._osKind || 'receivable';
    const data = ageingSummary(kind);
    return `
    <div class="page-head">
      <div><h2>Outstanding</h2><p>Nett outstanding by party</p></div>
      <div class="toolbar">
        <button class="btn btn-sm ${kind === 'receivable' ? 'btn-primary' : 'btn-outline'}" onclick="window._osKind='receivable';goPage('outstanding')">Receivable</button>
        <button class="btn btn-sm ${kind === 'payable' ? 'btn-primary' : 'btn-outline'}" onclick="window._osKind='payable';goPage('outstanding')">Payable</button>
      </div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Party</th><th>Phone</th><th class="right">Bills open</th><th class="right">Amount</th><th class="right">Oldest (days)</th><th></th></tr></thead>
        <tbody>
          ${
            data.rows.length
              ? data.rows
                  .map((r) => {
                    const oldest = r.bills.reduce((m, b) => Math.max(m, b.days), 0);
                    return `<tr>
              <td style="font-weight:600">${r.name}</td>
              <td>${r.phone || '—'}</td>
              <td class="right mono">${r.bills.length}</td>
              <td class="right mono" style="font-weight:800;color:var(--danger)">${fmt(r.total)}</td>
              <td class="right mono">${oldest}</td>
              <td class="right">
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4.printSOA('${kind === 'payable' ? 'supplier' : 'party'}','${r.id}')">SOA</button>
                <button class="btn btn-gold btn-sm" onclick="window.KissanPhase4.remindParty('${kind === 'payable' ? 'supplier' : 'party'}','${r.id}')">Remind</button>
              </td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="6">Clear — no outstanding.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function printSOA(partyType, partyId) {
    const STATE = global.STATE || {};
    const isSup = partyType === 'supplier';
    const party = isSup
      ? (STATE.suppliers || []).find((x) => x.id === partyId)
      : (STATE.parties || []).find((x) => x.id === partyId);
    if (!party) {
      global.toast('Not found', 'error');
      return;
    }
    const bal = isSup
      ? typeof global.supplierBalance === 'function'
        ? global.supplierBalance(partyId)
        : 0
      : typeof global.partyBalance === 'function'
        ? global.partyBalance(partyId)
        : 0;
    const bills = isSup ? supplierBillRows(partyId) : partyBillRows(partyId);
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) {
      global.toast('Popup blocked', 'error');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Statement of Account</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:28px;color:#1a2218}
        h1{font-size:20px;margin:0} .sub{color:#666;font-size:12px;margin:4px 0 18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}
        th{background:#f5f1e6} .right{text-align:right}
        .tot{font-weight:800;font-size:15px;margin-top:14px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>Kissan Fertilizer — Statement of Account</h1>
      <div class="sub">Miro Khan Road, Kamber · ${todayISO()}</div>
      <p><b>${isSup ? 'Supplier' : 'Customer'}:</b> ${party.name}<br>
      ${party.phone ? 'Phone: ' + party.phone + '<br>' : ''}
      ${party.address ? party.address : ''}</p>
      <table>
        <thead><tr><th>Date</th><th>Doc</th><th>Particulars</th><th class="right">Days</th><th class="right">Open</th></tr></thead>
        <tbody>
          ${
            bills.length
              ? bills
                  .map(
                    (b) =>
                      `<tr><td>${b.date || ''}</td><td>${b.docNo || '—'}</td><td>${b.productName || ''}</td><td class="right">${b.days}</td><td class="right">${Number(b.open).toLocaleString('en-PK')}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="5">No open bills (nett balance may include opening).</td></tr>'
          }
        </tbody>
      </table>
      <p class="tot">Closing balance: Rs. ${Math.abs(Number(bal) || 0).toLocaleString('en-PK')}
        ${bal > 0 ? (isSup ? '(Payable)' : '(Receivable)') : bal < 0 ? (isSup ? '(Advance/Credit)' : '(Advance)') : '(Clear)'}</p>
      <p style="font-size:11px;color:#888;margin-top:24px">Software by Fazul Khan Chandio · 03333909816</p>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    win.document.close();
  }

  function remindParty(partyType, partyId) {
    const STATE = global.STATE || {};
    const isSup = partyType === 'supplier';
    const party = isSup
      ? (STATE.suppliers || []).find((x) => x.id === partyId)
      : (STATE.parties || []).find((x) => x.id === partyId);
    if (!party) return;
    const bal = isSup
      ? typeof global.supplierBalance === 'function'
        ? global.supplierBalance(partyId)
        : 0
      : typeof global.partyBalance === 'function'
        ? global.partyBalance(partyId)
        : 0;
    const amount = Math.abs(Number(bal) || 0).toLocaleString('en-PK');
    const msg = encodeURIComponent(
      `Assalam o Alaikum ${party.name},\n\nKissan Fertilizer (Kamber) — apka outstanding balance Rs. ${amount} hai. Barah-e-karam jald wasool / payment kar dein.\n\nShukriya.\nMiro Khan Road, Kamber`
    );
    const phone = String(party.phone || '').replace(/\D/g, '');
    if (phone.length >= 10) {
      const wa = phone.startsWith('92') ? phone : phone.startsWith('0') ? '92' + phone.slice(1) : phone;
      window.open('https://wa.me/' + wa + '?text=' + msg, '_blank');
      global.toast('WhatsApp reminder opened', 'success');
    } else {
      // Print letter
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><body style="font-family:serif;padding:40px">
        <h2>Payment Reminder</h2>
        <p>Date: ${todayISO()}</p>
        <p>To: <b>${party.name}</b></p>
        <p>Assalam o Alaikum,</p>
        <p>Apka outstanding balance <b>Rs. ${amount}</b> hai. Barah-e-karam jald clear kar dein.</p>
        <p>Kissan Fertilizer · Miro Khan Road, Kamber</p>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
      win.document.close();
      global.toast('Reminder letter opened (no phone on file)', 'info');
    }
  }

  function editAgeingSlabs() {
    const slabs = getAgeingSlabs();
    global.openModal(
      'Ageing Slabs',
      `<p class="hint">Min / Max days for each bucket</p>
       ${slabs
         .map(
           (s, i) => `
         <div class="grid2">
           <div class="field"><label>Label</label><input type="text" id="asL${i}" value="${s.label}"></div>
           <div class="field"><label>Min days</label><input type="number" id="asMin${i}" value="${s.min}"></div>
           <div class="field"><label>Max days</label><input type="number" id="asMax${i}" value="${s.max}"></div>
         </div>`
         )
         .join('')}`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase4.saveAgeingSlabs(${slabs.length})">Save</button>`
    );
  }
  function saveAgeingSlabs(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        label: document.getElementById('asL' + i)?.value || 'S' + i,
        min: Number(document.getElementById('asMin' + i)?.value) || 0,
        max: Number(document.getElementById('asMax' + i)?.value) || 0
      });
    }
    setAgeingSlabs(arr);
    global.closeModal();
    global.toast('Slabs saved', 'success');
    if (global.ACTIVE_PAGE === 'ageing') global.goPage('ageing');
  }

  /* ---------- Interest ---------- */
  function getInterestSlabs() {
    try {
      return JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function calcInterest(principal, days) {
    const slabs = getInterestSlabs();
    if (!slabs.length) {
      // default 1.5% per month simple
      return Math.round(principal * (0.015 * (days / 30)) * 100) / 100;
    }
    let interest = 0;
    for (const s of slabs) {
      if (days >= Number(s.minDays || 0)) {
        interest = principal * (Number(s.ratePercent || 0) / 100) * (days / Number(s.perDays || 30));
      }
    }
    return Math.round(interest * 100) / 100;
  }

  function pageInterest() {
    const data = ageingSummary('receivable');
    return `
    <div class="page-head"><div><h2>Interest Calculation</h2><p>On overdue receivable (simple slabs)</p></div>
      <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4.editInterestSlabs()">Interest slabs</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Party</th><th class="right">Outstanding</th><th class="right">Oldest days</th><th class="right">Est. Interest</th></tr></thead>
        <tbody>
          ${
            data.rows.length
              ? data.rows
                  .map((r) => {
                    const oldest = r.bills.reduce((m, b) => Math.max(m, b.days), 0);
                    const interest = r.bills.reduce((sum, b) => sum + calcInterest(b.open, b.days), 0);
                    return `<tr>
              <td>${r.name}</td>
              <td class="right mono">${fmt(r.total)}</td>
              <td class="right mono">${oldest}</td>
              <td class="right mono" style="font-weight:700">${fmt(interest)}</td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="4">No overdue receivable.</td></tr>`
          }
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Default: 1.5% per 30 days if no custom slabs. Settings se slabs change karein.</p>
    </div>`;
  }

  function editInterestSlabs() {
    const slabs = getInterestSlabs().length
      ? getInterestSlabs()
      : [{ minDays: 30, ratePercent: 1.5, perDays: 30 }];
    global.openModal(
      'Interest Slabs',
      slabs
        .map(
          (s, i) => `
        <div class="grid2">
          <div class="field"><label>Min overdue days</label><input type="number" id="isMin${i}" value="${s.minDays || 0}"></div>
          <div class="field"><label>Rate %</label><input type="number" step="0.01" id="isRate${i}" value="${s.ratePercent || 0}"></div>
          <div class="field"><label>Per days</label><input type="number" id="isPer${i}" value="${s.perDays || 30}"></div>
        </div>`
        )
        .join('') +
        `<p class="hint">Last matching slab applies.</p>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase4.saveInterestSlabs(${slabs.length})">Save</button>`
    );
  }
  function saveInterestSlabs(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        minDays: Number(document.getElementById('isMin' + i)?.value) || 0,
        ratePercent: Number(document.getElementById('isRate' + i)?.value) || 0,
        perDays: Number(document.getElementById('isPer' + i)?.value) || 30
      });
    }
    localStorage.setItem(INTEREST_KEY, JSON.stringify(arr));
    global.closeModal();
    global.toast('Interest slabs saved', 'success');
    if (global.ACTIVE_PAGE === 'interest') global.goPage('interest');
  }

  /* ---------- Credit limits ---------- */
  function checkCreditLimit(partyId, additionalAmount) {
    const party = ((global.STATE && global.STATE.parties) || []).find((p) => p.id === partyId);
    if (!party || !party.creditLimit) return { ok: true };
    const bal =
      typeof global.partyBalance === 'function' ? global.partyBalance(partyId) : 0;
    const after = Number(bal) + Number(additionalAmount || 0);
    const limit = Number(party.creditLimit);
    if (after > limit) {
      return {
        ok: false,
        message: `Credit limit Rs. ${limit.toLocaleString('en-PK')} exceed — current ${bal.toLocaleString('en-PK')} + new`
      };
    }
    return { ok: true };
  }

  /* ---------- Bank reconciliation (simple local register) ---------- */
  function getBankEntries() {
    try {
      return JSON.parse(localStorage.getItem(BANK_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setBankEntries(arr) {
    localStorage.setItem(BANK_KEY, JSON.stringify(arr));
  }
  function pageBankRecon() {
    const entries = getBankEntries().slice().reverse();
    return `
    <div class="page-head"><div><h2>Bank Reconciliation</h2><p>Cleared / Uncleared register</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase4.openBankEntry()">+ Bank entry</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th class="right">Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${
            entries.length
              ? entries
                  .map(
                    (e, idx) => `<tr>
            <td class="mono">${e.date}</td>
            <td>${e.type}</td>
            <td class="mono">${e.ref || '—'}</td>
            <td class="right mono">${fmt(e.amount)}</td>
            <td><span class="stamp ${e.cleared ? 'ok' : 'warn'}">${e.cleared ? 'Cleared' : 'Uncleared'}</span></td>
            <td>${e.note || ''}</td>
            <td class="right"><button class="btn btn-outline btn-sm" onclick="window.KissanPhase4.toggleBankCleared('${e.id}')">${e.cleared ? 'Unclear' : 'Clear'}</button></td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No bank entries yet.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }
  function openBankEntry() {
    global.openModal(
      'Bank Entry',
      `<div class="grid2">
        <div class="field"><label>Date</label><input type="date" id="beDate" value="${todayISO()}"></div>
        <div class="field"><label>Type</label><select id="beType"><option>Deposit</option><option>Withdrawal</option><option>Cheque In</option><option>Cheque Out</option><option>Transfer</option></select></div>
        <div class="field"><label>Amount *</label><input type="number" id="beAmt" step="0.01"></div>
        <div class="field"><label>Ref / Cheque no.</label><input type="text" id="beRef"></div>
        <div class="field" style="grid-column:1/-1"><label>Note</label><input type="text" id="beNote"></div>
        <div class="field"><label><input type="checkbox" id="beCleared" style="width:auto"> Already cleared</label></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase4.saveBankEntry()">Save</button>`
    );
  }
  function saveBankEntry() {
    const amount = Number(document.getElementById('beAmt')?.value) || 0;
    if (amount <= 0) {
      global.toast('Amount required', 'error');
      return;
    }
    const list = getBankEntries();
    list.push({
      id: 'be_' + Date.now(),
      date: document.getElementById('beDate')?.value || todayISO(),
      type: document.getElementById('beType')?.value || 'Deposit',
      amount,
      ref: document.getElementById('beRef')?.value || '',
      note: document.getElementById('beNote')?.value || '',
      cleared: !!document.getElementById('beCleared')?.checked
    });
    setBankEntries(list);
    global.closeModal();
    global.toast('Bank entry saved', 'success');
    if (global.ACTIVE_PAGE === 'bankrecon') global.goPage('bankrecon');
  }
  function toggleBankCleared(id) {
    const list = getBankEntries();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list[i].cleared = !list[i].cleared;
      setBankEntries(list);
      if (global.ACTIVE_PAGE === 'bankrecon') global.goPage('bankrecon');
    }
  }

  /* ---------- APP VERSION / AUTO UPDATE ---------- */
  function setupUpdateWatcher() {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      showUpdateBanner(true);
    });
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(false);
          }
        });
      });
      // Periodic check every 5 min
      setInterval(() => {
        try {
          reg.update();
        } catch (e) {}
      }, 5 * 60 * 1000);
    });
    // Do NOT banner on localStorage mismatch (caused false v83-final banners).
    // Only service-worker updatefound shows banner.
    try {
      const latest = (global.KISSAN_BUILD) || (global.KissanPhase15 && global.KissanPhase15.APP_VERSION) || APP_VERSION;
      localStorage.setItem('kissan_app_version', latest);
      if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = latest;
    } catch (e) {
      localStorage.setItem('kissan_app_version', APP_VERSION);
    }
  }

  function showUpdateBanner(forceReload) {
    if (document.getElementById('kissanUpdateBanner')) return;
    const ver =
      (global.KISSAN_BUILD) ||
      (global.KissanPhase15 && global.KissanPhase15.APP_VERSION) ||
      (global.KissanPhase14 && global.KissanPhase14.APP_VERSION) ||
      APP_VERSION;
    const bar = document.createElement('div');
    bar.id = 'kissanUpdateBanner';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:10000;background:#0f3d24;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:13.5px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.2)';
    bar.innerHTML =
      '<span>🆕 New app version available (' + ver + ')</span>' +
      '<button type="button" style="background:#d4a017;color:#1a2218;border:none;padding:8px 16px;border-radius:8px;font-weight:800;cursor:pointer" onclick="window.KissanPhase4.applyUpdate()">Update now</button>' +
      '<button type="button" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:8px 12px;border-radius:8px;cursor:pointer" onclick="this.parentElement.remove()">Later</button>';
    document.body.appendChild(bar);
  }

  async function applyUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      }
    } catch (e) {}
    const ver =
      (global.KISSAN_BUILD) ||
      (global.KissanPhase15 && global.KissanPhase15.APP_VERSION) ||
      APP_VERSION;
    try { localStorage.setItem('kissan_app_version', ver); } catch (e) {}
    location.reload();
  }

  // Listen for skip waiting from page
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'RELOAD') location.reload();
    });
  }

  // Boot update watcher
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUpdateWatcher);
  } else {
    setTimeout(setupUpdateWatcher, 1500);
  }

  global.KissanPhase4 = {
    APP_VERSION,
    pageAgeing,
    pageOutstanding,
    pageInterest,
    pageBankRecon,
    printSOA,
    remindParty,
    editAgeingSlabs,
    saveAgeingSlabs,
    editInterestSlabs,
    saveInterestSlabs,
    checkCreditLimit,
    openBankEntry,
    saveBankEntry,
    toggleBankCleared,
    applyUpdate,
    setupUpdateWatcher,
    getAgeingSlabs,
    partyBillRows,
    supplierBillRows
  };
})(window);


/* ==== phase5-reports.js ==== */
/**
 * Kissan Fertilizer — Phase 5: Reports & Analysis
 * - Profitability (Bill / Item / Party)
 * - Sales & Purchase Analysis (Item + Party)
 * - Cash Flow / Funds Flow
 * - Ratio Analysis
 * - Daily / Monthly Summaries
 * - Columnar Cash Book
 * - Masters / Vouchers Statistics
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  }
  function range() {
    const from =
      global.REPORT_FROM ||
      new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = global.REPORT_TO || todayISO();
    return { from, to };
  }
  function inRange(date, from, to) {
    if (!date) return false;
    return date >= from && date <= to;
  }
  function productCost(s) {
    if (!s || s.isGeneric || !s.productId) return 0;
    const p = ((global.STATE && global.STATE.products) || []).find((x) => x.id === s.productId);
    return Number(p?.purchasePrice || 0) * Number(s.qty || 0);
  }
  function saleProfit(s) {
    const total = Number(s.total || 0);
    const agent = Number(s.agentPay || 0);
    const cost = productCost(s);
    if (agent > 0) return total - cost + (total - agent);
    return total - cost;
  }

  function dateRangeBar(pageId) {
    const { from, to } = range();
    return `
    <div class="stitch panel">
      <div class="panel-head"><h3>Date range</h3>
        <div class="toolbar">
          <input type="date" id="p5From" value="${from}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
          <input type="date" id="p5To" value="${to}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
          <button class="btn btn-primary btn-sm" onclick="window.KissanPhase5.applyRange('${pageId}')">Apply</button>
          <button class="btn btn-outline btn-sm" onclick="window.KissanPhase5.exportTableExcel('${pageId}')">Excel</button>
        </div>
      </div>
    </div>`;
  }
  function applyRange(pageId) {
    const f = document.getElementById('p5From')?.value;
    const t = document.getElementById('p5To')?.value;
    if (f) global.REPORT_FROM = f;
    if (t) global.REPORT_TO = t;
    if (typeof global.goPage === 'function') global.goPage(pageId || global.ACTIVE_PAGE);
  }

  /* ---------- Profitability ---------- */
  function pageProfitability() {
    const { from, to } = range();
    const sales = ((global.STATE && global.STATE.sales) || []).filter((s) => inRange(s.date, from, to));
    const exp = ((global.STATE && global.STATE.expenses) || [])
      .filter((e) => inRange(e.date, from, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);

    // Bill-wise
    const billRows = sales
      .map((s) => ({
        date: s.date,
        docNo: s.docNo,
        party: s.partyName || 'Walk-in',
        product: s.productName,
        total: Number(s.total || 0),
        cost: productCost(s),
        profit: saleProfit(s)
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Item-wise
    const byItem = {};
    sales.forEach((s) => {
      const k = s.productName || '—';
      if (!byItem[k]) byItem[k] = { name: k, qty: 0, sales: 0, cost: 0, profit: 0 };
      byItem[k].qty += Number(s.qty || 0);
      byItem[k].sales += Number(s.total || 0);
      byItem[k].cost += productCost(s);
      byItem[k].profit += saleProfit(s);
    });
    const itemRows = Object.values(byItem).sort((a, b) => b.profit - a.profit);

    // Party-wise
    const byParty = {};
    sales.forEach((s) => {
      const k = s.partyName || 'Walk-in';
      if (!byParty[k]) byParty[k] = { name: k, bills: 0, sales: 0, profit: 0 };
      byParty[k].bills += 1;
      byParty[k].sales += Number(s.total || 0);
      byParty[k].profit += saleProfit(s);
    });
    const partyRows = Object.values(byParty).sort((a, b) => b.profit - a.profit);

    const gross = billRows.reduce((a, r) => a + r.profit, 0);
    const net = gross - exp;
    const tab = global._p5ProfitTab || 'bill';

    return `
    <div class="page-head"><div><h2>Profitability</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('profitability')}
    <div class="stats">
      <div class="stitch stat ok"><div class="lbl">Gross profit</div><div class="val">${fmt(gross)}</div></div>
      <div class="stitch stat red"><div class="lbl">Expenses</div><div class="val">${fmt(exp)}</div></div>
      <div class="stitch stat ${net >= 0 ? 'ok' : 'red'}"><div class="lbl">Net profit</div><div class="val">${fmt(net)}</div></div>
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-sm ${tab === 'bill' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='bill';goPage('profitability')">Bill-wise</button>
      <button class="btn btn-sm ${tab === 'item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='item';goPage('profitability')">Item-wise</button>
      <button class="btn btn-sm ${tab === 'party' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='party';goPage('profitability')">Party-wise</button>
    </div>
    <div class="stitch panel" id="p5TableWrap">
      ${
        tab === 'item'
          ? `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th><th class="right">Margin %</th></tr></thead>
        <tbody>${
          itemRows.length
            ? itemRows
                .map(
                  (r) =>
                    `<tr><td>${r.name}</td><td class="right mono">${r.qty}</td><td class="right mono">${fmt(r.sales)}</td><td class="right mono">${fmt(r.cost)}</td><td class="right mono" style="font-weight:700;color:${r.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.profit)}</td><td class="right mono">${r.sales ? ((r.profit / r.sales) * 100).toFixed(1) : 0}%</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="6">No data</td></tr>'
        }</tbody></table></div>`
          : tab === 'party'
            ? `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Party</th><th class="right">Bills</th><th class="right">Sales</th><th class="right">Profit</th><th class="right">Margin %</th></tr></thead>
        <tbody>${
          partyRows.length
            ? partyRows
                .map(
                  (r) =>
                    `<tr><td>${r.name}</td><td class="right mono">${r.bills}</td><td class="right mono">${fmt(r.sales)}</td><td class="right mono" style="font-weight:700">${fmt(r.profit)}</td><td class="right mono">${r.sales ? ((r.profit / r.sales) * 100).toFixed(1) : 0}%</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="5">No data</td></tr>'
        }</tbody></table></div>`
            : `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Date</th><th>Doc</th><th>Party</th><th>Product</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th></tr></thead>
        <tbody>${
          billRows.length
            ? billRows
                .map(
                  (r) =>
                    `<tr><td class="mono">${r.date}</td><td class="mono">${r.docNo || '—'}</td><td>${r.party}</td><td>${r.product}</td><td class="right mono">${fmt(r.total)}</td><td class="right mono">${fmt(r.cost)}</td><td class="right mono" style="font-weight:700;color:${r.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.profit)}</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="7">No data</td></tr>'
        }</tbody></table></div>`
      }
    </div>`;
  }

  /* ---------- Sales / Purchase Analysis ---------- */
  function pageSalesAnalysis() {
    const { from, to } = range();
    const sales = ((global.STATE && global.STATE.sales) || []).filter((s) => inRange(s.date, from, to));
    const purch = ((global.STATE && global.STATE.purchases) || []).filter((p) => inRange(p.date, from, to));
    const mode = global._p5SaMode || 'sales-item';

    function group(rows, nameKey, qtyKey, amtKey) {
      const m = {};
      rows.forEach((r) => {
        const k = r[nameKey] || '—';
        if (!m[k]) m[k] = { name: k, qty: 0, amount: 0, count: 0 };
        m[k].qty += Number(r[qtyKey] || 0);
        m[k].amount += Number(r[amtKey] || 0);
        m[k].count += 1;
      });
      return Object.values(m).sort((a, b) => b.amount - a.amount);
    }

    let title = '';
    let data = [];
    if (mode === 'sales-item') {
      title = 'Sales — Item-wise';
      data = group(sales, 'productName', 'qty', 'total');
    } else if (mode === 'sales-party') {
      title = 'Sales — Party-wise';
      data = group(sales, 'partyName', 'qty', 'total');
    } else if (mode === 'purch-item') {
      title = 'Purchase — Item-wise';
      data = group(purch, 'productName', 'qty', 'total');
    } else {
      title = 'Purchase — Supplier-wise';
      data = group(purch, 'supplierName', 'qty', 'total');
    }

    return `
    <div class="page-head"><div><h2>Sales / Purchase Analysis</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('salesanalysis')}
    <div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-sm ${mode === 'sales-item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='sales-item';goPage('salesanalysis')">Sales × Item</button>
      <button class="btn btn-sm ${mode === 'sales-party' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='sales-party';goPage('salesanalysis')">Sales × Party</button>
      <button class="btn btn-sm ${mode === 'purch-item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='purch-item';goPage('salesanalysis')">Purchase × Item</button>
      <button class="btn btn-sm ${mode === 'purch-sup' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='purch-sup';goPage('salesanalysis')">Purchase × Supplier</button>
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>${title}</h3></div>
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Name</th><th class="right">Entries</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${
            data.length
              ? data
                  .map(
                    (r) =>
                      `<tr><td style="font-weight:600">${r.name}</td><td class="right mono">${r.count}</td><td class="right mono">${r.qty}</td><td class="right mono" style="font-weight:700">${fmt(r.amount)}</td></tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="4">No data in range</td></tr>'
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Cash / Funds Flow ---------- */
  function pageCashFlow() {
    const { from, to } = range();
    const STATE = global.STATE || {};
    const cashSales = (STATE.sales || [])
      .filter((s) => inRange(s.date, from, to) && (s.payMode === 'Cash' || !s.payMode || Number(s.payCash || 0) > 0))
      .reduce((a, s) => a + (Number(s.payCash) > 0 ? Number(s.payCash) : Number(s.total || 0)), 0);
    const bankSales = (STATE.sales || [])
      .filter((s) => inRange(s.date, from, to))
      .reduce((a, s) => a + Number(s.payBank || 0), 0);
    const vIn = (STATE.vouchers || [])
      .filter((v) => v.type === 'In' && inRange(v.date, from, to))
      .reduce((a, v) => a + Number(v.amount || 0), 0);
    const partyIn = (STATE.payments || [])
      .filter((p) => p.partyType === 'party' && !p.isGiven && inRange(p.date, from, to))
      .reduce((a, p) => a + Number(p.amount || 0), 0);
    const cashPurch = (STATE.purchases || [])
      .filter((p) => inRange(p.date, from, to) && p.payMode === 'Cash')
      .reduce((a, p) => a + Number(p.total || 0), 0);
    const exp = (STATE.expenses || [])
      .filter((e) => inRange(e.date, from, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);
    const vOut = (STATE.vouchers || [])
      .filter((v) => v.type === 'Out' && inRange(v.date, from, to))
      .reduce((a, v) => a + Number(v.amount || 0), 0);
    const supPay = (STATE.payments || [])
      .filter((p) => p.partyType === 'supplier' && !p.isGiven && inRange(p.date, from, to))
      .reduce((a, p) => a + Number(p.amount || 0), 0);

    const inflow = cashSales + bankSales + vIn + partyIn;
    const outflow = cashPurch + exp + vOut + supPay;
    const net = inflow - outflow;

    const lines = [
      { side: 'In', label: 'Cash sales', amount: cashSales },
      { side: 'In', label: 'Bank / online sales', amount: bankSales },
      { side: 'In', label: 'Cash vouchers (In)', amount: vIn },
      { side: 'In', label: 'Party wasool', amount: partyIn },
      { side: 'Out', label: 'Cash purchases', amount: cashPurch },
      { side: 'Out', label: 'Expenses', amount: exp },
      { side: 'Out', label: 'Cash vouchers (Out)', amount: vOut },
      { side: 'Out', label: 'Supplier payments', amount: supPay }
    ];

    return `
    <div class="page-head"><div><h2>Cash / Funds Flow</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('cashflow')}
    <div class="stats">
      <div class="stitch stat ok"><div class="lbl">Total inflow</div><div class="val">${fmt(inflow)}</div></div>
      <div class="stitch stat red"><div class="lbl">Total outflow</div><div class="val">${fmt(outflow)}</div></div>
      <div class="stitch stat ${net >= 0 ? 'ok' : 'red'}"><div class="lbl">Net cash flow</div><div class="val">${fmt(net)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Flow</th><th>Particulars</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${lines
            .map(
              (l) =>
                `<tr><td><span class="stamp ${l.side === 'In' ? 'ok' : 'bad'}">${l.side}</span></td><td>${l.label}</td><td class="right mono" style="font-weight:700">${fmt(l.amount)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Ratio Analysis ---------- */
  function pageRatios() {
    const STATE = global.STATE || {};
    const receivable = (STATE.parties || []).reduce(
      (s, p) => s + (typeof global.partyBalance === 'function' ? Math.max(0, global.partyBalance(p.id)) : 0),
      0
    );
    const payable = (STATE.suppliers || []).reduce(
      (s, p) => s + (typeof global.supplierBalance === 'function' ? Math.max(0, global.supplierBalance(p.id)) : 0),
      0
    );
    const stockValue = (STATE.products || []).reduce((a, p) => {
      const st =
        typeof global.productEffectiveStock === 'function'
          ? global.productEffectiveStock(p)
          : Number(p.stock || 0);
      return a + st * Number(p.purchasePrice || 0);
    }, 0);
    // Approximate cash from last 90 days net (simplified current asset proxy)
    const from90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = todayISO();
    const sales90 = (STATE.sales || [])
      .filter((s) => inRange(s.date, from90, to))
      .reduce((a, s) => a + Number(s.total || 0), 0);
    const purch90 = (STATE.purchases || [])
      .filter((p) => inRange(p.date, from90, to))
      .reduce((a, p) => a + Number(p.total || 0), 0);
    const exp90 = (STATE.expenses || [])
      .filter((e) => inRange(e.date, from90, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);
    const cogs = purch90; // approx
    const grossProfit = sales90 - cogs;
    const netProfit = grossProfit - exp90;
    const currentAssets = stockValue + receivable; // + cash unknown fully
    const currentLiab = payable || 1;
    const currentRatio = currentAssets / currentLiab;
    const quickRatio = receivable / currentLiab;
    const inventoryTurnover = cogs / (stockValue || 1);
    const avgCollection = receivable > 0 && sales90 > 0 ? (receivable / sales90) * 90 : 0;
    const recvTurnover = sales90 / (receivable || 1);
    const debtEquity = payable / (currentAssets - payable || 1);
    const grossMargin = sales90 ? (grossProfit / sales90) * 100 : 0;
    const netMargin = sales90 ? (netProfit / sales90) * 100 : 0;

    const ratios = [
      { group: 'Liquidity', name: 'Current Ratio', value: currentRatio.toFixed(2), note: 'CA / CL (stock+recv / payable)' },
      { group: 'Liquidity', name: 'Quick Ratio', value: quickRatio.toFixed(2), note: 'Receivable / Payable' },
      { group: 'Turnover', name: 'Inventory Turnover', value: inventoryTurnover.toFixed(2), note: 'COGS / Stock value (90d)' },
      { group: 'Turnover', name: 'Avg Collection Period (days)', value: avgCollection.toFixed(0), note: 'Receivable / Sales × 90' },
      { group: 'Turnover', name: 'Receivable Turnover', value: recvTurnover.toFixed(2), note: 'Sales / Receivable' },
      { group: 'Leverage', name: 'Debt / Equity (approx)', value: debtEquity.toFixed(2), note: 'Payable / (CA − Payable)' },
      { group: 'Profitability', name: 'Gross Margin %', value: grossMargin.toFixed(1) + '%', note: '90-day window' },
      { group: 'Profitability', name: 'Net Margin %', value: netMargin.toFixed(1) + '%', note: 'After expenses' }
    ];

    return `
    <div class="page-head"><div><h2>Ratio Analysis</h2><p>Based on live balances + last 90 days activity</p></div></div>
    <div class="stats">
      <div class="stitch stat"><div class="lbl">Stock value</div><div class="val">${fmt(stockValue)}</div></div>
      <div class="stitch stat red"><div class="lbl">Receivable</div><div class="val">${fmt(receivable)}</div></div>
      <div class="stitch stat info"><div class="lbl">Payable</div><div class="val">${fmt(payable)}</div></div>
      <div class="stitch stat"><div class="lbl">Sales (90d)</div><div class="val">${fmt(sales90)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Group</th><th>Ratio</th><th class="right">Value</th><th>Note</th></tr></thead>
        <tbody>
          ${ratios
            .map(
              (r) =>
                `<tr><td><span class="stamp mute">${r.group}</span></td><td style="font-weight:600">${r.name}</td><td class="right mono" style="font-weight:800">${r.value}</td><td class="muted">${r.note}</td></tr>`
            )
            .join('')}
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Ye ratios approximation hain (cash-in-hand full balance sheet ke baghair). Decision support ke liye use karein.</p>
    </div>`;
  }

  /* ---------- Daily / Monthly Summaries ---------- */
  function pageSummaries() {
    const mode = global._p5SumMode || 'daily';
    const STATE = global.STATE || {};
    const map = {};

    function keyFromDate(d) {
      if (!d) return '';
      return mode === 'monthly' ? d.slice(0, 7) : d;
    }

    (STATE.sales || []).forEach((s) => {
      const k = keyFromDate(s.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].sales += Number(s.total || 0);
      map[k].profit += saleProfit(s);
      map[k].sc += 1;
    });
    (STATE.purchases || []).forEach((p) => {
      const k = keyFromDate(p.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].purch += Number(p.total || 0);
      map[k].pc += 1;
    });
    (STATE.expenses || []).forEach((e) => {
      const k = keyFromDate(e.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].exp += Number(e.amount || 0);
    });

    const rows = Object.values(map)
      .map((r) => ({ ...r, net: r.profit - r.exp }))
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 60);

    return `
    <div class="page-head"><div><h2>Daily / Monthly Summaries</h2><p>Sales, purchase, expense, profit</p></div></div>
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-sm ${mode === 'daily' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SumMode='daily';goPage('summaries')">Daily</button>
      <button class="btn btn-sm ${mode === 'monthly' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SumMode='monthly';goPage('summaries')">Monthly</button>
      <button class="btn btn-outline btn-sm" onclick="window.KissanPhase5.exportTableExcel('summaries')">Excel</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>${mode === 'monthly' ? 'Month' : 'Date'}</th><th class="right">Sales</th><th class="right">Purchases</th><th class="right">Expenses</th><th class="right">Gross profit</th><th class="right">Net</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) =>
                      `<tr>
              <td class="mono" style="font-weight:600">${r.key}</td>
              <td class="right mono">${fmt(r.sales)} <span class="muted">(${r.sc})</span></td>
              <td class="right mono">${fmt(r.purch)} <span class="muted">(${r.pc})</span></td>
              <td class="right mono">${fmt(r.exp)}</td>
              <td class="right mono">${fmt(r.profit)}</td>
              <td class="right mono" style="font-weight:800;color:${r.net >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.net)}</td>
            </tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="6">No data</td></tr>'
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Columnar Cash Book ---------- */
  function pageCashBook() {
    const { from, to } = range();
    const STATE = global.STATE || {};
    const rows = [];

    (STATE.sales || []).forEach((s) => {
      if (!inRange(s.date, from, to)) return;
      const cash = Number(s.payCash) > 0 ? Number(s.payCash) : s.payMode === 'Cash' || !s.payMode ? Number(s.total || 0) : 0;
      if (cash > 0) rows.push({ date: s.date, particular: `Sale ${s.docNo || ''} · ${s.partyName || ''}`, debit: cash, credit: 0, ref: s.docNo });
    });
    (STATE.purchases || []).forEach((p) => {
      if (!inRange(p.date, from, to) || p.payMode !== 'Cash') return;
      rows.push({ date: p.date, particular: `Purchase ${p.docNo || ''} · ${p.supplierName || ''}`, debit: 0, credit: Number(p.total || 0), ref: p.docNo });
    });
    (STATE.expenses || []).forEach((e) => {
      if (!inRange(e.date, from, to)) return;
      rows.push({ date: e.date, particular: `Expense · ${e.category || ''}`, debit: 0, credit: Number(e.amount || 0), ref: '' });
    });
    (STATE.vouchers || []).forEach((v) => {
      if (!inRange(v.date, from, to)) return;
      if (v.type === 'In') rows.push({ date: v.date, particular: v.note || 'Cash In', debit: Number(v.amount || 0), credit: 0, ref: '' });
      else rows.push({ date: v.date, particular: v.note || 'Cash Out', debit: 0, credit: Number(v.amount || 0), ref: '' });
    });
    (STATE.payments || []).forEach((p) => {
      if (!inRange(p.date, from, to)) return;
      if (p.partyType === 'party' && !p.isGiven)
        rows.push({ date: p.date, particular: `Wasool · ${p.partyName || ''}`, debit: Number(p.amount || 0), credit: 0, ref: '' });
      if (p.partyType === 'supplier' && !p.isGiven)
        rows.push({ date: p.date, particular: `Supplier pay · ${p.partyName || ''}`, debit: 0, credit: Number(p.amount || 0), ref: '' });
    });

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.particular.localeCompare(b.particular));
    let bal = 0;
    const withBal = rows.map((r) => {
      bal += Number(r.debit || 0) - Number(r.credit || 0);
      return { ...r, bal };
    });
    const totD = withBal.reduce((a, r) => a + Number(r.debit || 0), 0);
    const totC = withBal.reduce((a, r) => a + Number(r.credit || 0), 0);

    return `
    <div class="page-head"><div><h2>Columnar Cash Book</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('cashbook')}
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Date</th><th>Particulars</th><th class="right">Debit (In)</th><th class="right">Credit (Out)</th><th class="right">Balance</th></tr></thead>
        <tbody>
          ${
            withBal.length
              ? withBal
                  .map(
                    (r) =>
                      `<tr>
              <td class="mono">${r.date}</td>
              <td>${r.particular}</td>
              <td class="right mono">${r.debit ? fmt(r.debit) : '—'}</td>
              <td class="right mono">${r.credit ? fmt(r.credit) : '—'}</td>
              <td class="right mono" style="font-weight:700">${fmt(r.bal)}</td>
            </tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="5">No cash entries in range</td></tr>'
          }
          ${
            withBal.length
              ? `<tr style="background:var(--field-soft)"><td colspan="2" style="font-weight:800">TOTAL</td><td class="right mono" style="font-weight:800">${fmt(totD)}</td><td class="right mono" style="font-weight:800">${fmt(totC)}</td><td class="right mono" style="font-weight:800">${fmt(bal)}</td></tr>`
              : ''
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Statistics ---------- */
  function pageStatistics() {
    const S = global.STATE || {};
    const masters = [
      { name: 'Products', count: (S.products || []).length },
      { name: 'Parties', count: (S.parties || []).length },
      { name: 'Suppliers', count: (S.suppliers || []).length },
      { name: 'Godams', count: (S.godams || []).length },
      { name: 'Users / Staff', count: (S.users || []).length },
      { name: 'Batches', count: (S.batches || []).length }
    ];
    const vouchers = [
      { name: 'Sales', count: (S.sales || []).length },
      { name: 'Purchases', count: (S.purchases || []).length },
      { name: 'Sales Orders', count: (S.salesOrders || []).length },
      { name: 'Purchase Orders', count: (S.purchaseOrders || []).length },
      { name: 'Quotations', count: (S.quotations || []).length },
      { name: 'Sales Returns', count: (S.salesReturns || []).length },
      { name: 'Purchase Returns', count: (S.purchaseReturns || []).length },
      { name: 'Cash vouchers', count: (S.vouchers || []).length },
      { name: 'Payments', count: (S.payments || []).length },
      { name: 'Expenses', count: (S.expenses || []).length },
      { name: 'Payroll', count: (S.payroll || []).length },
      { name: 'Daily closings', count: (S.dailyClosings || []).length },
      { name: 'Stock moves', count: (S.stockMoves || []).length },
      { name: 'Audit log', count: (S.audit || []).length }
    ];
    const totalM = masters.reduce((a, x) => a + x.count, 0);
    const totalV = vouchers.reduce((a, x) => a + x.count, 0);

    return `
    <div class="page-head"><div><h2>Masters / Vouchers Statistics</h2><p>App version ${APP_VERSION}</p></div></div>
    <div class="stats">
      <div class="stitch stat"><div class="lbl">Master records</div><div class="val">${totalM}</div></div>
      <div class="stitch stat gold"><div class="lbl">Voucher / txn records</div><div class="val">${totalV}</div></div>
    </div>
    <div class="dash-grid">
      <div class="stitch panel">
        <div class="panel-head"><h3>Masters</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Master</th><th class="right">Count</th></tr></thead>
        <tbody>${masters.map((m) => `<tr><td>${m.name}</td><td class="right mono" style="font-weight:700">${m.count}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="stitch panel">
        <div class="panel-head"><h3>Vouchers / Transactions</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="right">Count</th></tr></thead>
        <tbody>${vouchers.map((m) => `<tr><td>${m.name}</td><td class="right mono" style="font-weight:700">${m.count}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;
  }

  /* ---------- Excel export ---------- */
  function exportTableExcel(pageId) {
    const table = document.getElementById('p5DataTable');
    if (!table || !window.XLSX) {
      global.toast('No table / Excel library missing', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, pageId || 'Report');
    XLSX.writeFile(wb, `kissan_${pageId || 'report'}_${todayISO()}.xlsx`);
    global.toast('Excel downloaded', 'success');
  }

  // Sync version for update banner
  if (global.KissanPhase4) {
    try {
      global.KissanPhase4.APP_VERSION = APP_VERSION;
    } catch (e) {}
  }
  localStorage.setItem('kissan_app_version', APP_VERSION);

  global.KissanPhase5 = {
    APP_VERSION,
    applyRange,
    exportTableExcel,
    pageProfitability,
    pageSalesAnalysis,
    pageCashFlow,
    pageRatios,
    pageSummaries,
    pageCashBook,
    pageStatistics
  };
})(window);


/* ==== phase6-enterprise.js ==== */
/**
 * Kissan Fertilizer — Phase 6: Enterprise polish
 * - Voucher / Master Approval workflow
 * - Triggers (low stock, credit limit, overdue)
 * - Block / Unblock parties, suppliers, products
 * - Merge parties / items
 * - Notes / Task Manager
 * - Masters Excel Import helper
 * - Label print (party / product)
 * - Design helpers for All Party cards
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const NOTES_KEY = 'kissan_notes_tasks';
  const TRIGGERS_KEY = 'kissan_triggers_cfg';
  const APPROVAL_KEY = 'kissan_approval_on';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(msg, type) {
    if (typeof global.toast === 'function') global.toast(msg, type || 'info');
  }

  /* ========== APPROVAL ========== */
  function approvalEnabled() {
    return localStorage.getItem(APPROVAL_KEY) === '1';
  }
  function setApprovalEnabled(on) {
    localStorage.setItem(APPROVAL_KEY, on ? '1' : '0');
  }
  function needsApproval(record) {
    if (!approvalEnabled()) return false;
    if (!record) return false;
    return record.approvalStatus === 'Pending' || (!record.approvalStatus && record._needsApproval);
  }
  async function submitForApproval(col, id, extra) {
    if (!global.__phase3UpdateDoc) return;
    await global.__phase3UpdateDoc(col, id, {
      approvalStatus: 'Pending',
      submittedAt: new Date().toISOString(),
      submittedBy: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown',
      ...(extra || {})
    });
  }
  async function approveRecord(col, id) {
    if (!global.KissanPhase1 || !global.KissanPhase1.isOwner()) {
      toast('Only Owner can approve', 'error');
      return;
    }
    await global.__phase3UpdateDoc(col, id, {
      approvalStatus: 'Approved',
      approvedAt: new Date().toISOString(),
      approvedBy: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown'
    });
    toast('Approved', 'success');
    if (typeof global.softRefreshActivePage === 'function') global.softRefreshActivePage();
    else if (typeof global.goPage === 'function') global.goPage(global.ACTIVE_PAGE);
  }
  async function rejectRecord(col, id) {
    if (!global.KissanPhase1 || !global.KissanPhase1.isOwner()) {
      toast('Only Owner can reject', 'error');
      return;
    }
    await global.__phase3UpdateDoc(col, id, {
      approvalStatus: 'Rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: (global.CURRENT_USER && global.CURRENT_USER.email) || 'unknown'
    });
    toast('Rejected', 'success');
    if (typeof global.goPage === 'function') global.goPage(global.ACTIVE_PAGE);
  }

  function pageApprovals() {
    const S = global.STATE || {};
    const cols = [
      { key: 'sales', label: 'Sales' },
      { key: 'purchases', label: 'Purchases' },
      { key: 'vouchers', label: 'Cash vouchers' },
      { key: 'expenses', label: 'Expenses' },
      { key: 'payments', label: 'Payments' }
    ];
    const pending = [];
    cols.forEach((c) => {
      (S[c.key] || []).forEach((r) => {
        if (r.approvalStatus === 'Pending') pending.push({ col: c.key, label: c.label, ...r });
      });
    });
    return `
    <div class="page-head">
      <div><h2>Approvals</h2><p>Pending masters / vouchers</p></div>
      <div class="toolbar">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px">
          <input type="checkbox" id="apprOn" ${approvalEnabled() ? 'checked' : ''} style="width:auto"
            onchange="window.KissanPhase6.setApprovalEnabled(this.checked);toast(this.checked?'Approval ON':'Approval OFF','success')">
          Require approval on new critical entries
        </label>
      </div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Type</th><th>Date</th><th>Detail</th><th>By</th><th class="right">Actions</th></tr></thead>
        <tbody>
          ${
            pending.length
              ? pending
                  .map(
                    (r) => `<tr>
            <td><span class="stamp warn">${r.label}</span></td>
            <td class="mono">${r.date || ''}</td>
            <td>${r.partyName || r.supplierName || r.productName || r.note || r.category || r.docNo || r.id}</td>
            <td class="muted">${r.submittedBy || '—'}</td>
            <td class="right row-actions">
              <button class="btn btn-primary btn-sm" onclick="window.KissanPhase6.approveRecord('${r.col}','${r.id}')">Approve</button>
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase6.rejectRecord('${r.col}','${r.id}')">Reject</button>
            </td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="5">No pending approvals. Enable toggle above then mark entries Pending from save flow (Owner posts freely).</td></tr>`
          }
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Jab approval ON ho, non-Owner saves <b>Pending</b> status le sakte hain — Owner yahan approve/reject kare.</p>
    </div>`;
  }

  /* ========== TRIGGERS ========== */
  function getTriggers() {
    try {
      return Object.assign(
        {
          lowStock: true,
          creditLimit: true,
          overdueDays: 45,
          overdueAlert: true,
          showOnDashboard: true
        },
        JSON.parse(localStorage.getItem(TRIGGERS_KEY) || '{}')
      );
    } catch (e) {
      return { lowStock: true, creditLimit: true, overdueDays: 45, overdueAlert: true, showOnDashboard: true };
    }
  }
  function setTriggers(obj) {
    localStorage.setItem(TRIGGERS_KEY, JSON.stringify(obj));
  }
  function runTriggers() {
    const cfg = getTriggers();
    const alerts = [];
    const S = global.STATE || {};
    if (cfg.lowStock && global.KissanPhase3) {
      const crit = global.KissanPhase3.criticalProducts() || [];
      crit.slice(0, 8).forEach((c) => {
        alerts.push({
          type: 'stock',
          level: c.status === 'out' ? 'bad' : 'warn',
          text: `${c.product.name}: stock ${c.stock} (${c.status})`
        });
      });
    }
    if (cfg.overdueAlert && global.KissanPhase4) {
      try {
        const ageing = global.KissanPhase4.partyBillRows
          ? null
          : null;
        (S.parties || []).forEach((p) => {
          if (typeof global.partyBalance !== 'function') return;
          const bal = global.partyBalance(p.id);
          if (bal <= 0) return;
          const bills = global.KissanPhase4.partyBillRows(p.id) || [];
          const old = bills.filter((b) => b.days >= (cfg.overdueDays || 45));
          if (old.length) {
            alerts.push({
              type: 'overdue',
              level: 'warn',
              text: `${p.name}: ${old.length} bill(s) ≥ ${cfg.overdueDays}d · ${fmt(bal)}`
            });
          }
        });
      } catch (e) {}
    }
    if (cfg.creditLimit) {
      (S.parties || []).forEach((p) => {
        if (!p.creditLimit || typeof global.partyBalance !== 'function') return;
        const bal = global.partyBalance(p.id);
        if (bal >= Number(p.creditLimit)) {
          alerts.push({
            type: 'credit',
            level: 'bad',
            text: `${p.name}: at/over credit limit ${fmt(p.creditLimit)}`
          });
        }
      });
    }
    // Blocked entities reminder
    (S.parties || [])
      .filter((p) => p.blocked)
      .forEach((p) => alerts.push({ type: 'block', level: 'mute', text: `Blocked party: ${p.name}` }));
    (S.products || [])
      .filter((p) => p.blocked)
      .slice(0, 5)
      .forEach((p) => alerts.push({ type: 'block', level: 'mute', text: `Blocked item: ${p.name}` }));
    return alerts;
  }

  function triggersBannerHtml() {
    const cfg = getTriggers();
    if (!cfg.showOnDashboard) return '';
    const alerts = runTriggers();
    if (!alerts.length) return '';
    return `
    <div class="stitch panel" style="border-left:4px solid var(--wheat);margin-bottom:16px">
      <div class="panel-head"><h3>⚡ Triggers</h3>
        <span class="stamp warn">${alerts.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto">
        ${alerts
          .slice(0, 12)
          .map(
            (a) =>
              `<div style="font-size:13px;padding:6px 10px;background:var(--field-soft);border-radius:8px">
            <span class="stamp ${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : 'mute'}">${a.type}</span>
            ${a.text}
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function pageTriggers() {
    const cfg = getTriggers();
    const alerts = runTriggers();
    return `
    <div class="page-head"><div><h2>Triggers</h2><p>Condition-based alerts</p></div></div>
    <div class="stitch panel">
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="trLow" ${cfg.lowStock ? 'checked' : ''} style="width:auto">
        <label for="trLow" style="margin:0">Low / critical stock</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="trCred" ${cfg.creditLimit ? 'checked' : ''} style="width:auto">
        <label for="trCred" style="margin:0">Credit limit reached</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="trOd" ${cfg.overdueAlert ? 'checked' : ''} style="width:auto">
        <label for="trOd" style="margin:0">Overdue bills alert</label>
      </div>
      <div class="field"><label>Overdue after (days)</label>
        <input type="number" id="trDays" value="${cfg.overdueDays || 45}" style="max-width:120px">
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="trDash" ${cfg.showOnDashboard ? 'checked' : ''} style="width:auto">
        <label for="trDash" style="margin:0">Show on Dashboard</label>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase6.saveTriggers()">Save triggers</button>
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>Active alerts now</h3></div>
      ${
        alerts.length
          ? alerts.map((a) => `<div class="ledger-line"><span>${a.text}</span><span class="stamp ${a.level === 'bad' ? 'bad' : 'warn'}">${a.type}</span></div>`).join('')
          : '<p class="muted">All clear.</p>'
      }
    </div>`;
  }
  function saveTriggers() {
    setTriggers({
      lowStock: !!document.getElementById('trLow')?.checked,
      creditLimit: !!document.getElementById('trCred')?.checked,
      overdueAlert: !!document.getElementById('trOd')?.checked,
      overdueDays: Number(document.getElementById('trDays')?.value) || 45,
      showOnDashboard: !!document.getElementById('trDash')?.checked
    });
    toast('Triggers saved', 'success');
    if (global.ACTIVE_PAGE === 'triggers') global.goPage('triggers');
  }

  /* ========== BLOCK / UNBLOCK ========== */
  async function toggleBlock(col, id) {
    const list = (global.STATE && global.STATE[col]) || [];
    const row = list.find((x) => x.id === id);
    if (!row) return;
    const blocked = !row.blocked;
    await global.__phase3UpdateDoc(col, id, { blocked, blockedAt: blocked ? new Date().toISOString() : null });
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = { ...list[i], blocked };
    toast(blocked ? 'Blocked' : 'Unblocked', 'success');
    if (typeof global.softRefreshActivePage === 'function') global.softRefreshActivePage();
    else global.goPage(global.ACTIVE_PAGE);
  }
  function assertNotBlocked(col, id, label) {
    const row = ((global.STATE && global.STATE[col]) || []).find((x) => x.id === id);
    if (row && row.blocked) {
      toast((label || 'Record') + ' is blocked', 'error');
      return false;
    }
    return true;
  }

  /* ========== MERGE ========== */
  function openMergeModal(kind) {
    const list =
      kind === 'party'
        ? global.STATE?.parties || []
        : kind === 'supplier'
          ? global.STATE?.suppliers || []
          : global.STATE?.products || [];
    const opts = list.map((p) => `<option value="${p.id}">${p.name}${p.blocked ? ' (blocked)' : ''}</option>`).join('');
    global.openModal(
      `Merge ${kind}s`,
      `<p class="hint">Source entries move into <b>Target</b>. Source master is blocked (not deleted).</p>
      <div class="field"><label>Source (merge from) *</label><select id="mgFrom">${opts}</select></div>
      <div class="field"><label>Target (merge into) *</label><select id="mgTo">${opts}</select></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase6.runMerge('${kind}')">Merge</button>`
    );
  }
  async function runMerge(kind) {
    const fromId = document.getElementById('mgFrom')?.value;
    const toId = document.getElementById('mgTo')?.value;
    if (!fromId || !toId || fromId === toId) {
      toast('Select two different records', 'error');
      return;
    }
    if (!confirm('Merge cannot fully auto-rewrite every historical field. Continue? Source will be blocked.')) return;
    const S = global.STATE || {};
    try {
      if (kind === 'party') {
        const target = (S.parties || []).find((p) => p.id === toId);
        const name = target?.name || '';
        for (const s of (S.sales || []).filter((x) => x.partyId === fromId)) {
          await global.__phase3UpdateDoc('sales', s.id, { partyId: toId, partyName: name });
        }
        for (const p of (S.payments || []).filter((x) => x.partyType === 'party' && x.partyId === fromId)) {
          await global.__phase3UpdateDoc('payments', p.id, { partyId: toId, partyName: name });
        }
        await global.__phase3UpdateDoc('parties', fromId, { blocked: true, mergedInto: toId });
      } else if (kind === 'supplier') {
        const target = (S.suppliers || []).find((p) => p.id === toId);
        const name = target?.name || '';
        for (const s of (S.purchases || []).filter((x) => x.supplierId === fromId)) {
          await global.__phase3UpdateDoc('purchases', s.id, { supplierId: toId, supplierName: name });
        }
        for (const p of (S.payments || []).filter((x) => x.partyType === 'supplier' && x.partyId === fromId)) {
          await global.__phase3UpdateDoc('payments', p.id, { partyId: toId, partyName: name });
        }
        await global.__phase3UpdateDoc('suppliers', fromId, { blocked: true, mergedInto: toId });
      } else if (kind === 'product') {
        const target = (S.products || []).find((p) => p.id === toId);
        const name = target?.name || '';
        for (const s of (S.sales || []).filter((x) => x.productId === fromId)) {
          await global.__phase3UpdateDoc('sales', s.id, { productId: toId, productName: name });
        }
        for (const s of (S.purchases || []).filter((x) => x.productId === fromId)) {
          await global.__phase3UpdateDoc('purchases', s.id, { productId: toId, productName: name });
        }
        await global.__phase3UpdateDoc('products', fromId, { blocked: true, mergedInto: toId });
      }
      toast('Merge done — source blocked', 'success');
      global.closeModal();
      global.goPage(global.ACTIVE_PAGE);
    } catch (e) {
      toast('Merge failed: ' + e.message, 'error');
    }
  }

  /* ========== NOTES / TASKS ========== */
  function getNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setNotes(arr) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(arr));
  }
  function pageNotes() {
    const notes = getNotes().slice().reverse();
    return `
    <div class="page-head"><div><h2>Notes / Tasks</h2><p>Personal reminders on this device</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase6.openNoteModal()">+ Note</button>
    </div>
    <div class="stitch panel">
      ${
        notes.length
          ? notes
              .map(
                (n) => `
        <div class="ledger-line" style="align-items:flex-start">
          <div>
            <div style="font-weight:700">${n.title || 'Note'}</div>
            <div class="muted" style="font-size:12.5px;margin-top:2px">${n.body || ''}</div>
            <div class="hint">${n.category || 'General'} · ${n.due || ''} · ${n.done ? '✓ Done' : 'Open'}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.toggleNoteDone('${n.id}')">${n.done ? 'Reopen' : 'Done'}</button>
            <button class="btn btn-danger btn-sm" onclick="window.KissanPhase6.deleteNote('${n.id}')">Del</button>
          </div>
        </div>`
              )
              .join('')
          : '<p class="muted">No notes yet.</p>'
      }
    </div>`;
  }
  function openNoteModal() {
    global.openModal(
      'New Note / Task',
      `<div class="field"><label>Title</label><input type="text" id="ntTitle"></div>
       <div class="field"><label>Details</label><textarea id="ntBody"></textarea></div>
       <div class="grid2">
         <div class="field"><label>Category</label>
           <select id="ntCat"><option>General</option><option>Collection</option><option>Purchase</option><option>Staff</option><option>Other</option></select>
         </div>
         <div class="field"><label>Due date</label><input type="date" id="ntDue" value="${todayISO()}"></div>
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase6.saveNote()">Save</button>`
    );
  }
  function saveNote() {
    const title = (document.getElementById('ntTitle')?.value || '').trim();
    if (!title) {
      toast('Title required', 'error');
      return;
    }
    const list = getNotes();
    list.push({
      id: 'n_' + Date.now(),
      title,
      body: document.getElementById('ntBody')?.value || '',
      category: document.getElementById('ntCat')?.value || 'General',
      due: document.getElementById('ntDue')?.value || '',
      done: false,
      at: new Date().toISOString()
    });
    setNotes(list);
    global.closeModal();
    toast('Note saved', 'success');
    if (global.ACTIVE_PAGE === 'notes') global.goPage('notes');
  }
  function toggleNoteDone(id) {
    const list = getNotes();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list[i].done = !list[i].done;
      setNotes(list);
      global.goPage('notes');
    }
  }
  function deleteNote(id) {
    setNotes(getNotes().filter((x) => x.id !== id));
    global.goPage('notes');
  }

  /* ========== EXCEL IMPORT MASTERS ========== */
  function openImportMasters() {
    global.openModal(
      'Import Masters (Excel)',
      `<p class="hint">Excel columns: <b>name, phone, address, openingBalance</b> (parties/suppliers) or <b>name, category, unit, salePrice, purchasePrice, stock</b> (products).</p>
       <div class="field"><label>Import as</label>
         <select id="impKind"><option value="parties">Parties</option><option value="suppliers">Suppliers</option><option value="products">Products</option></select>
       </div>
       <div class="field"><label>Excel file (.xlsx)</label>
         <input type="file" id="impFile" accept=".xlsx,.xls,.csv">
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase6.runImportMasters()">Import</button>`
    );
  }
  async function runImportMasters() {
    const kind = document.getElementById('impKind')?.value || 'parties';
    const file = document.getElementById('impFile')?.files?.[0];
    if (!file || !window.XLSX) {
      toast('File / XLSX missing', 'error');
      return;
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    if (!rows.length) {
      toast('Empty sheet', 'error');
      return;
    }
    let n = 0;
    for (const row of rows) {
      const data = {};
      Object.keys(row).forEach((k) => {
        data[String(k).trim()] = row[k];
      });
      const payload = {};
      if (kind === 'products') {
        payload.name = data.name || data.Name || data.product || '';
        if (!payload.name) continue;
        payload.category = data.category || data.Category || 'Other';
        payload.unit = data.unit || data.Unit || 'Bag';
        payload.salePrice = Number(data.salePrice || data.Sale || data.sale || 0);
        payload.purchasePrice = Number(data.purchasePrice || data.Purchase || data.cost || 0);
        payload.stock = Number(data.stock || data.Stock || 0);
      } else {
        payload.name = data.name || data.Name || data.party || data.supplier || '';
        if (!payload.name) continue;
        payload.phone = String(data.phone || data.Phone || '');
        payload.address = data.address || data.Address || '';
        payload.openingBalance = Number(data.openingBalance || data.Opening || data.balance || 0);
      }
      payload.atLocal = new Date().toISOString();
      if (global.__phase3AddDoc) {
        await global.__phase3AddDoc(kind, payload);
        n++;
      }
    }
    toast(`Imported ${n} ${kind}`, 'success');
    global.closeModal();
    global.goPage(kind === 'products' ? 'products' : kind === 'suppliers' ? 'suppliers' : 'parties');
  }

  /* ========== LABEL PRINT ========== */
  function printLabel(kind, id) {
    const S = global.STATE || {};
    let row =
      kind === 'product'
        ? (S.products || []).find((x) => x.id === id)
        : kind === 'supplier'
          ? (S.suppliers || []).find((x) => x.id === id)
          : (S.parties || []).find((x) => x.id === id);
    if (!row) return;
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Label</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:16px}
        .label{border:2px solid #0f3d24;border-radius:8px;padding:16px;width:280px}
        h2{margin:0 0 4px;font-size:16px} .sub{font-size:12px;color:#555}
        .price{font-size:20px;font-weight:800;margin-top:8px;color:#0f3d24}
      </style></head><body>
      <div class="label">
        <h2>${row.name || ''}</h2>
        <div class="sub">${kind === 'product' ? (row.category || '') + ' · ' + (row.unit || '') : row.phone || ''}</div>
        <div class="sub">${row.address || ''}</div>
        ${kind === 'product' ? `<div class="price">Rs. ${Number(row.salePrice || 0).toLocaleString('en-PK')}</div>` : ''}
        <div class="sub" style="margin-top:10px">Kissan Fertilizer · Kamber</div>
      </div>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>`);
    win.document.close();
  }

  /* ========== ALL PARTY — card design ========== */
  function pagePartiesCards() {
    const q = (global._partySearch || '').toLowerCase();
    let list = (global.STATE && global.STATE.parties) || [];
    if (q) {
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.phone || '').includes(q) ||
          (p.sifaNo || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)
      );
    }
    const filter = global._partyFilter || 'all';
    if (filter === 'due') list = list.filter((p) => (typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0) > 0);
    if (filter === 'clear') list = list.filter((p) => (typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0) === 0);
    if (filter === 'blocked') list = list.filter((p) => p.blocked);

    const totalDue = list.reduce(
      (a, p) => a + Math.max(0, typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0),
      0
    );

    return `
    <div class="page-head">
      <div><h2>All Party</h2><p>${list.length} parties · Due ${fmt(totalDue)}</p></div>
      <div class="toolbar">
        <button class="btn btn-primary btn-sm" onclick="crudModalOpen(CRUD_MODULES['parties'])">+ Party</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.openMergeModal('party')">Merge</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.openImportMasters()">Import Excel</button>
      </div>
    </div>
    <div class="stitch panel" style="margin-bottom:14px">
      <div class="toolbar" style="width:100%">
        <div class="search-box"><input type="search" placeholder="Search name, phone, sifa…" value="${(global._partySearch || '').replace(/"/g, '&quot;')}" oninput="window._partySearch=this.value;goPage('parties')"></div>
        <button class="btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="window._partyFilter='all';goPage('parties')">All</button>
        <button class="btn btn-sm ${filter === 'due' ? 'btn-primary' : 'btn-outline'}" onclick="window._partyFilter='due';goPage('parties')">Due</button>
        <button class="btn btn-sm ${filter === 'clear' ? 'btn-primary' : 'btn-outline'}" onclick="window._partyFilter='clear';goPage('parties')">Clear</button>
        <button class="btn btn-sm ${filter === 'blocked' ? 'btn-primary' : 'btn-outline'}" onclick="window._partyFilter='blocked';goPage('parties')">Blocked</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${
        list.length
          ? list
              .map((p) => {
                const bal = typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0;
                const safe = (p.name || '').replace(/'/g, "\\'");
                return `
        <div class="stitch" style="padding:16px;${p.blocked ? 'opacity:.7;border-color:var(--danger)' : ''}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div>
              <div style="font-family:var(--serif);font-weight:700;font-size:17px;color:var(--field-dark)">${p.name || '—'}</div>
              <div class="hint" style="margin-top:2px">${p.phone || 'No phone'}${p.sifaNo ? ' · Sifa ' + p.sifaNo : ''}</div>
              <div class="hint">${p.address || ''}</div>
            </div>
            ${p.blocked ? '<span class="stamp bad">BLOCKED</span>' : bal > 0 ? '<span class="stamp warn">DUE</span>' : '<span class="stamp ok">CLEAR</span>'}
          </div>
          <div style="margin:14px 0 10px;padding:12px;background:var(--field-soft);border-radius:12px;display:flex;justify-content:space-between;align-items:center">
            <span class="muted" style="font-size:11px;font-weight:700;letter-spacing:.04em">BALANCE</span>
            <span class="mono" style="font-size:18px;font-weight:800;color:${bal > 0 ? 'var(--danger)' : bal < 0 ? 'var(--ok)' : 'var(--ink)'}">${fmt(Math.abs(bal))}</span>
          </div>
          ${p.creditLimit ? `<div class="hint" style="margin-bottom:8px">Credit limit ${fmt(p.creditLimit)}</div>` : ''}
          <div class="row-actions" style="flex-wrap:wrap">
            <button class="btn btn-gold btn-sm" onclick="openPaymentModal('party','${p.id}','${safe}')">Payment</button>
            <button class="btn btn-outline btn-sm" onclick="openLedger('party','${p.id}')">Ledger</button>
            <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4&&KissanPhase4.printSOA('party','${p.id}')">SOA</button>
            <button class="btn btn-outline btn-sm" onclick="window.KissanPhase4&&KissanPhase4.remindParty('party','${p.id}')">Remind</button>
            <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.printLabel('party','${p.id}')">Label</button>
            <button class="btn btn-outline btn-sm" onclick="crudModalOpen(CRUD_MODULES.parties,'${p.id}')">Edit</button>
            <button class="btn btn-sm ${p.blocked ? 'btn-primary' : 'btn-danger'}" onclick="window.KissanPhase6.toggleBlock('parties','${p.id}')">${p.blocked ? 'Unblock' : 'Block'}</button>
          </div>
        </div>`;
              })
              .join('')
          : `<div class="stitch panel" style="grid-column:1/-1;text-align:center;padding:40px" class="muted">No parties found.</div>`
      }
    </div>`;
  }

  /* Settings block for phase 6 tools */
  function phase6SettingsHtml() {
    return `
    <div class="stitch panel">
      <div class="panel-head"><h3>Enterprise tools</h3></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="goPage('approvals')">Approvals</button>
        <button class="btn btn-outline btn-sm" onclick="goPage('triggers')">Triggers</button>
        <button class="btn btn-outline btn-sm" onclick="goPage('notes')">Notes / Tasks</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.openImportMasters()">Import masters Excel</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.openMergeModal('party')">Merge parties</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase6.openMergeModal('product')">Merge products</button>
      </div>
      <p class="hint" style="margin-top:10px">App version ${APP_VERSION}</p>
    </div>`;
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  if (global.KissanPhase4) {
    try {
      global.KissanPhase4.APP_VERSION = APP_VERSION;
    } catch (e) {}
  }

  global.KissanPhase6 = {
    APP_VERSION,
    approvalEnabled,
    setApprovalEnabled,
    needsApproval,
    submitForApproval,
    approveRecord,
    rejectRecord,
    pageApprovals,
    getTriggers,
    setTriggers,
    runTriggers,
    triggersBannerHtml,
    pageTriggers,
    saveTriggers,
    toggleBlock,
    assertNotBlocked,
    openMergeModal,
    runMerge,
    pageNotes,
    openNoteModal,
    saveNote,
    toggleNoteDone,
    deleteNote,
    openImportMasters,
    runImportMasters,
    printLabel,
    pagePartiesCards,
    phase6SettingsHtml
  };
})(window);


/* ==== phase7-advanced.js ==== */
/**
 * Kissan Fertilizer — Phase 7
 * - Broker / Salesman commission report
 * - PDC (Post-dated cheques) register
 * - Simple POS quick-sale mode
 * - Cost centers (expense tagging)
 * - Multi-currency display factor (optional)
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const PDC_KEY = 'kissan_pdc';
  const CC_KEY = 'kissan_cost_centers';
  const FX_KEY = 'kissan_fx_rate'; // 1 foreign = N PKR (display only)

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ========== COMMISSION / SALESMAN ========== */
  function pageCommission() {
    const { from, to } = range();
    const sales = ((global.STATE && global.STATE.sales) || []).filter(
      (s) => s.date >= from && s.date <= to && (s.takenBy || Number(s.agentPay) > 0)
    );
    const byAgent = {};
    sales.forEach((s) => {
      const name = (s.takenBy || '—').trim() || '—';
      if (!byAgent[name]) byAgent[name] = { name, bills: 0, sales: 0, commission: 0, qty: 0 };
      byAgent[name].bills += 1;
      byAgent[name].sales += Number(s.total || 0);
      byAgent[name].commission += Number(s.agentPay || 0);
      byAgent[name].qty += Number(s.qty || 0);
    });
    const rows = Object.values(byAgent).sort((a, b) => b.commission - a.commission);
    const totC = rows.reduce((a, r) => a + r.commission, 0);
    const totS = rows.reduce((a, r) => a + r.sales, 0);

    return `
    <div class="page-head"><div><h2>Broker / Salesman Commission</h2><p>${from} → ${to}</p></div></div>
    ${dateBar('commission')}
    <div class="stats">
      <div class="stitch stat"><div class="lbl">Agents</div><div class="val">${rows.length}</div></div>
      <div class="stitch stat gold"><div class="lbl">Sales tagged</div><div class="val">${fmt(totS)}</div></div>
      <div class="stitch stat ok"><div class="lbl">Commission / agent pay</div><div class="val">${fmt(totC)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Salesman / Broker</th><th class="right">Bills</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">Commission</th><th class="right">% of sales</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr>
            <td style="font-weight:700">${r.name}</td>
            <td class="right mono">${r.bills}</td>
            <td class="right mono">${r.qty}</td>
            <td class="right mono">${fmt(r.sales)}</td>
            <td class="right mono" style="font-weight:800;color:var(--field)">${fmt(r.commission)}</td>
            <td class="right mono">${r.sales ? ((r.commission / r.sales) * 100).toFixed(1) : 0}%</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="6">Is range mein agent / takenBy wali sales nahi.</td></tr>`
          }
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Sale pe “Mall lene wala / Reseller” + “Agent ko payment” se data aata hai.</p>
    </div>`;
  }

  function range() {
    const from =
      global.REPORT_FROM ||
      new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const to = global.REPORT_TO || todayISO();
    return { from, to };
  }
  function dateBar(page) {
    const { from, to } = range();
    return `<div class="stitch panel"><div class="panel-head"><h3>Date range</h3>
      <div class="toolbar">
        <input type="date" id="p7From" value="${from}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
        <input type="date" id="p7To" value="${to}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
        <button class="btn btn-primary btn-sm" onclick="window.KissanPhase7.applyRange('${page}')">Apply</button>
      </div></div></div>`;
  }
  function applyRange(page) {
    const f = document.getElementById('p7From')?.value;
    const t = document.getElementById('p7To')?.value;
    if (f) {
      global.REPORT_FROM = f;
      window.REPORT_FROM = f;
    }
    if (t) {
      global.REPORT_TO = t;
      window.REPORT_TO = t;
    }
    if (typeof global.goPage === 'function') global.goPage(page || global.ACTIVE_PAGE);
  }

  /* ========== PDC ========== */
  function getPdc() {
    try {
      return JSON.parse(localStorage.getItem(PDC_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setPdc(arr) {
    localStorage.setItem(PDC_KEY, JSON.stringify(arr));
  }
  function pagePdc() {
    const list = getPdc().slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const today = todayISO();
    const dueSoon = list.filter((p) => !p.cleared && p.dueDate && p.dueDate <= today).length;
    return `
    <div class="page-head"><div><h2>Post-dated Cheques (PDC)</h2><p>${dueSoon ? dueSoon + ' due/overdue' : 'Register'}</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase7.openPdcModal()">+ PDC</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Due date</th><th>Type</th><th>Party</th><th>Bank / Cheque</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map((p) => {
                    const overdue = !p.cleared && p.dueDate && p.dueDate <= today;
                    return `<tr>
            <td class="mono">${p.dueDate || '—'}</td>
            <td>${p.type || 'In'}</td>
            <td>${p.partyName || '—'}</td>
            <td class="mono">${p.bank || ''} ${p.chequeNo || ''}</td>
            <td class="right mono" style="font-weight:700">${fmt(p.amount)}</td>
            <td><span class="stamp ${p.cleared ? 'ok' : overdue ? 'bad' : 'warn'}">${p.cleared ? 'Cleared' : overdue ? 'Due' : 'Pending'}</span></td>
            <td class="right">
              ${!p.cleared ? `<button class="btn btn-primary btn-sm" onclick="window.KissanPhase7.clearPdc('${p.id}')">Clear</button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase7.deletePdc('${p.id}')">Del</button>
            </td>
          </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No PDC entries.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }
  function openPdcModal() {
    global.openModal(
      'Add PDC',
      `<div class="grid2">
        <div class="field"><label>Type</label><select id="pdcType"><option>In (receive)</option><option>Out (issue)</option></select></div>
        <div class="field"><label>Due date *</label><input type="date" id="pdcDue" value="${todayISO()}"></div>
        <div class="field"><label>Party / name *</label><input type="text" id="pdcParty"></div>
        <div class="field"><label>Amount *</label><input type="number" id="pdcAmt" step="0.01"></div>
        <div class="field"><label>Bank</label><input type="text" id="pdcBank"></div>
        <div class="field"><label>Cheque no.</label><input type="text" id="pdcChq"></div>
        <div class="field" style="grid-column:1/-1"><label>Note</label><input type="text" id="pdcNote"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase7.savePdc()">Save</button>`
    );
  }
  function savePdc() {
    const amount = Number(document.getElementById('pdcAmt')?.value) || 0;
    const partyName = (document.getElementById('pdcParty')?.value || '').trim();
    const dueDate = document.getElementById('pdcDue')?.value;
    if (!amount || !partyName || !dueDate) {
      toast('Party, amount, due date required', 'error');
      return;
    }
    const list = getPdc();
    list.push({
      id: 'pdc_' + Date.now(),
      type: document.getElementById('pdcType')?.value || 'In',
      dueDate,
      partyName,
      amount,
      bank: document.getElementById('pdcBank')?.value || '',
      chequeNo: document.getElementById('pdcChq')?.value || '',
      note: document.getElementById('pdcNote')?.value || '',
      cleared: false,
      at: new Date().toISOString()
    });
    setPdc(list);
    global.closeModal();
    toast('PDC saved', 'success');
    if (global.ACTIVE_PAGE === 'pdc') global.goPage('pdc');
  }
  function clearPdc(id) {
    const list = getPdc();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list[i].cleared = true;
      list[i].clearedAt = new Date().toISOString();
      setPdc(list);
      global.goPage('pdc');
    }
  }
  function deletePdc(id) {
    if (!confirm('Delete PDC?')) return;
    setPdc(getPdc().filter((x) => x.id !== id));
    global.goPage('pdc');
  }

  /* ========== POS QUICK SALE ========== */
  function pagePos() {
    const products = ((global.STATE && global.STATE.products) || []).filter((p) => !p.blocked);
    const parties = (global.STATE && global.STATE.parties) || [];
    const partyOpts = parties
      .filter((p) => !p.blocked)
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');
    return `
    <div class="page-head"><div><h2>POS Quick Sale</h2><p>Fast counter billing</p></div></div>
    <div class="stitch panel">
      <div class="grid2">
        <div class="field"><label>Customer</label>
          <select id="posParty"><option value="">Walk-in</option>${partyOpts}</select>
        </div>
        <div class="field"><label>Pay mode</label>
          <select id="posPay"><option>Cash</option><option>Bank</option><option>Credit</option></select>
        </div>
        <div class="field" style="grid-column:1/-1"><label>Product</label>
          <select id="posProduct" onchange="window.KissanPhase7.posPick()">
            <option value="">— Select —</option>
            ${products
              .map((p) => {
                const st =
                  typeof global.productEffectiveStock === 'function'
                    ? global.productEffectiveStock(p)
                    : p.stock || 0;
                return `<option value="${p.id}" data-rate="${p.salePrice || 0}">${p.name} (${st})</option>`;
              })
              .join('')}
          </select>
        </div>
        <div class="field"><label>Qty</label><input type="number" id="posQty" value="1" min="1" step="1" oninput="window.KissanPhase7.posTotal()"></div>
        <div class="field"><label>Rate</label><input type="number" id="posRate" step="0.01" oninput="window.KissanPhase7.posTotal()"></div>
        <div class="field"><label>Total</label>
          <div class="mono" id="posTotal" style="padding:11px;background:var(--field-soft);border-radius:10px;font-weight:800;font-size:18px">Rs. 0</div>
        </div>
        <div class="field"><label>Godam</label>
          <select id="posGodam">${typeof global.godamOptionsHtml === 'function' ? global.godamOptionsHtml('', false) : ''}</select>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" style="flex:1;min-width:140px;padding:14px" onclick="window.KissanPhase7.posSave()">Save &amp; print path ready</button>
        <button class="btn btn-outline" onclick="window.KissanPhase7.posReset()">Clear</button>
      </div>
    </div>
    <p class="hint">POS full sale ledger mein likhta hai (same sales collection). Stock cut + party balance update.</p>`;
  }
  function posPick() {
    const o = document.getElementById('posProduct')?.selectedOptions?.[0];
    if (o && document.getElementById('posRate')) document.getElementById('posRate').value = o.dataset.rate || 0;
    posTotal();
  }
  function posTotal() {
    const q = Number(document.getElementById('posQty')?.value) || 0;
    const r = Number(document.getElementById('posRate')?.value) || 0;
    const el = document.getElementById('posTotal');
    if (el) el.textContent = fmt(q * r);
  }
  function posReset() {
    if (document.getElementById('posQty')) document.getElementById('posQty').value = 1;
    if (document.getElementById('posRate')) document.getElementById('posRate').value = '';
    if (document.getElementById('posProduct')) document.getElementById('posProduct').value = '';
    posTotal();
  }
  async function posSave() {
    if (window._saveLocks && window._saveLocks.pos) {
      toast('Wait…', 'info');
      return;
    }
    window._saveLocks = window._saveLocks || {};
    window._saveLocks.pos = true;
    try {
      const productId = document.getElementById('posProduct')?.value;
      const qty = Number(document.getElementById('posQty')?.value) || 0;
      const rate = Number(document.getElementById('posRate')?.value) || 0;
      const partyId = document.getElementById('posParty')?.value || '';
      const payMode = document.getElementById('posPay')?.value || 'Cash';
      const godamId = document.getElementById('posGodam')?.value || '';
      if (!productId || qty <= 0 || rate <= 0) {
        toast('Product, qty, rate required', 'error');
        return;
      }
      const product = ((global.STATE && global.STATE.products) || []).find((p) => p.id === productId);
      if (!product) {
        toast('Product missing', 'error');
        return;
      }
      if (global.KissanPhase6 && !global.KissanPhase6.assertNotBlocked('products', productId, 'Product')) return;
      if (partyId && global.KissanPhase6 && !global.KissanPhase6.assertNotBlocked('parties', partyId, 'Party')) return;
      const stock =
        typeof global.productEffectiveStock === 'function'
          ? global.productEffectiveStock(product)
          : Number(product.stock || 0);
      if (qty > stock) {
        toast('Not enough stock', 'error');
        return;
      }
      const party = partyId
        ? ((global.STATE && global.STATE.parties) || []).find((p) => p.id === partyId)
        : null;
      const total = qty * rate;
      if (partyId && global.KissanPhase4) {
        const lim = global.KissanPhase4.checkCreditLimit(partyId, payMode === 'Credit' ? total : 0);
        if (!lim.ok) {
          toast(lim.message, 'error');
          return;
        }
      }
      const date = todayISO();
      let docNo =
        typeof global.nextDocNo === 'function' ? global.nextDocNo('sales') : 'POS-' + Date.now();
      const payload = {
        docNo,
        productId,
        productName: product.name,
        isGeneric: false,
        partyId: party?.id || '',
        partyName: party?.name || 'Walk-in',
        qty,
        rate,
        subtotal: total,
        discountPercent: 0,
        discountAmount: 0,
        total,
        payMode: payMode === 'Credit' ? 'Credit' : payMode,
        payCash: payMode === 'Cash' ? total : 0,
        payBank: payMode === 'Bank' ? total : 0,
        payAdvance: 0,
        payCredit: payMode === 'Credit' ? total : 0,
        date,
        godamId,
        holdStock: false,
        atLocal: new Date().toISOString(),
        source: 'POS'
      };
      if (!global.__phase3AddDoc) {
        toast('Save bridge missing', 'error');
        return;
      }
      const id = await global.__phase3AddDoc('sales', payload);
      if (global.STATE) {
        global.STATE.sales = [{ id, ...payload }, ...(global.STATE.sales || [])];
      }
      if (typeof global.adjustProductStock === 'function') {
        await global.adjustProductStock(productId, -qty, godamId || undefined);
      }
      if (global.KissanPhase3) {
        await global.KissanPhase3.recordStockMove({
          productId,
          productName: product.name,
          qty: -qty,
          type: 'Sale',
          refDoc: docNo,
          godamId,
          date
        });
      }
      toast('POS sale saved · ' + docNo, 'success');
      posReset();
      if (typeof global.printDoc === 'function') {
        try {
          global.printDoc('sales', id);
        } catch (e) {}
      }
    } catch (e) {
      toast('POS failed: ' + e.message, 'error');
    } finally {
      window._saveLocks.pos = false;
    }
  }

  /* ========== COST CENTERS ========== */
  function getCostCenters() {
    try {
      return JSON.parse(localStorage.getItem(CC_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setCostCenters(arr) {
    localStorage.setItem(CC_KEY, JSON.stringify(arr));
  }
  function pageCostCenters() {
    const list = getCostCenters();
    const exp = (global.STATE && global.STATE.expenses) || [];
    const byCc = {};
    exp.forEach((e) => {
      const k = e.costCenter || 'Unassigned';
      byCc[k] = (byCc[k] || 0) + Number(e.amount || 0);
    });
    return `
    <div class="page-head"><div><h2>Cost Centers</h2><p>Tag expenses for project-wise cost</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase7.addCostCenter()">+ Center</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Cost center</th><th class="right">Expenses (all time)</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (c) => `<tr>
            <td style="font-weight:600">${c.name}</td>
            <td class="right mono">${fmt(byCc[c.name] || 0)}</td>
            <td class="right"><button class="btn btn-danger btn-sm" onclick="window.KissanPhase7.delCostCenter('${c.id}')">Del</button></td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="3">No cost centers. Expense pe optional field baad mein map ho sakta hai.</td></tr>`
          }
          <tr style="background:var(--field-soft)"><td>Unassigned</td><td class="right mono">${fmt(byCc['Unassigned'] || 0)}</td><td></td></tr>
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Expense save pe <code>costCenter</code> field set karein (manual edit / future form).</p>
    </div>`;
  }
  function addCostCenter() {
    const name = prompt('Cost center name');
    if (!name || !name.trim()) return;
    const list = getCostCenters();
    list.push({ id: 'cc_' + Date.now(), name: name.trim() });
    setCostCenters(list);
    global.goPage('costcenters');
  }
  function delCostCenter(id) {
    setCostCenters(getCostCenters().filter((x) => x.id !== id));
    global.goPage('costcenters');
  }

  /* ========== FX (display) ========== */
  function getFx() {
    return Number(localStorage.getItem(FX_KEY) || 0) || 0;
  }
  function setFx(n) {
    localStorage.setItem(FX_KEY, String(n || 0));
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase7 = {
    APP_VERSION,
    applyRange,
    pageCommission,
    pagePdc,
    openPdcModal,
    savePdc,
    clearPdc,
    deletePdc,
    pagePos,
    posPick,
    posTotal,
    posReset,
    posSave,
    pageCostCenters,
    addCostCenter,
    delCostCenter,
    getFx,
    setFx
  };
})(window);


/* ==== phase8-ledger.js ==== */
/**
 * Kissan Fertilizer — Phase 8
 * Traditional Bahi-Khata / Party Ledger (hath wali book style)
 * Columns: تاریخ | تفصیل | صفحہ | نام | جمع | بقايا
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';

  function fmtNum(n) {
    const x = Math.abs(Number(n) || 0);
    if (!x) return '';
    return x.toLocaleString('en-PK');
  }
  function fmtRs(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }

  function buildLedgerRows(partyType, partyId) {
    const STATE = global.STATE || {};
    const isCustomer = partyType === 'party';
    const party = isCustomer
      ? (STATE.parties || []).find((x) => x.id === partyId)
      : (STATE.suppliers || []).find((x) => x.id === partyId);
    const name = party?.name || '—';
    const opening = Number(party?.openingBalance || 0);
    const sifa = party?.sifaNo || '';
    const phone = party?.phone || '';
    const address = party?.address || '';

    let rows = [];
    rows.push({
      date: '—',
      desc: 'ابتدائي بيلنس / Opening',
      safha: sifa || '',
      naam: opening > 0 ? opening : 0,
      jama: opening < 0 ? Math.abs(opening) : 0,
      bags: ''
    });

    if (isCustomer) {
      (STATE.sales || [])
        .filter((s) => s.partyId === partyId)
        .forEach((s) => {
          const qty = Number(s.qty || 0);
          const unit = s.unit || '';
          let desc = s.productName || 'Sale';
          if (qty) desc += ` — ${qty}${unit ? ' ' + unit : ''}`;
          if (s.docNo) desc += ` (${s.docNo})`;
          if (typeof global.saleDetailLine === 'function') {
            try {
              desc = global.saleDetailLine(s);
            } catch (e) {}
          }
          rows.push({
            date: s.date || '',
            desc,
            takenBy: typeof global.saleTakenBy === 'function' ? global.saleTakenBy(s) : s.takenBy || '',
            safha: s.safha || sifa || '',
            naam: Number(s.total || 0),
            jama: 0,
            bags: qty || ''
          });
        });
      (STATE.salesReturns || [])
        .filter((r) => r.partyId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: `واپسي / Return — ${r.productName || ''}`,
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    } else {
      (STATE.purchases || [])
        .filter((p) => p.supplierId === partyId)
        .forEach((p) => {
          rows.push({
            date: p.date || '',
            desc: `خريد / Purchase — ${p.productName || ''}${p.docNo ? ' (' + p.docNo + ')' : ''}`,
            safha: p.safha || sifa || '',
            naam: Number(p.total || 0),
            jama: 0,
            bags: p.qty || ''
          });
        });
      (STATE.purchaseReturns || [])
        .filter((r) => r.supplierId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: `واپسي — ${r.productName || ''}`,
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    }

    (STATE.payments || [])
      .filter((x) => x.partyType === partyType && x.partyId === partyId)
      .forEach((x) => {
        if (x.isGiven) {
          rows.push({
            date: x.date || '',
            desc: x.note || 'ڏنل / Given',
            safha: x.safha || '',
            naam: Number(x.amount || 0),
            jama: 0,
            payId: x.id,
            editable: true,
            bags: ''
          });
        } else {
          rows.push({
            date: x.date || '',
            desc: x.note || (isCustomer ? 'وصول / Wasool' : 'ادائگي / Payment'),
            safha: x.safha || '',
            naam: 0,
            jama: Number(x.amount || 0),
            payId: x.id,
            editable: true,
            bags: ''
          });
        }
      });

    rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let running = 0;
    rows = rows.map((r) => {
      running += (Number(r.naam) || 0) - (Number(r.jama) || 0);
      return { ...r, bal: running };
    });
    return { party, name, sifa, phone, address, opening, rows, closing: running, isCustomer };
  }

  /** Traditional bahi-khata style ledger (matches hath wali book) */
  function openBahiLedger(partyType, partyId) {
    if (arguments.length === 1) {
      partyId = partyType;
      partyType = 'party';
    }
    const data = buildLedgerRows(partyType, partyId);
    const { name, sifa, phone, address, rows, closing, isCustomer } = data;
    const balColor = closing > 0 ? '#b91c1c' : closing < 0 ? '#15803d' : '#1a2218';
    const balLabel =
      closing > 0
        ? isCustomer
          ? 'باقی وصول (Credit)'
          : 'باقی ادائگي (Debt)'
        : closing < 0
          ? isCustomer
            ? 'اضافي (Advance)'
            : 'اضافي (Credit)'
          : 'صاف (Clear)';
    const safeName = (name || '').replace(/'/g, "\\'");
    const pageTitle = isCustomer ? 'کھاتہ بنام' : 'سپلائر کھاتہ';

    const html = `
<style>
  .bahi-wrap{
    font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(180deg, #faf6eb 0%, #f3ecd8 100%);
    border: 2px solid #8b7355;
    border-radius: 4px;
    padding: 12px 10px 16px;
    direction: rtl;
  }
  .bahi-head{
    text-align: center;
    border-bottom: 2px double #5c4a32;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .bahi-head .title{
    font-size: 22px;
    font-weight: 800;
    color: #1a2218;
    letter-spacing: 0.02em;
  }
  .bahi-head .sub{
    font-size: 13px;
    color: #5c4a32;
    margin-top: 4px;
  }
  .bahi-head .party-name{
    font-size: 18px;
    font-weight: 800;
    color: #0f3d24;
    margin-top: 6px;
  }
  .bahi-meta{
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: #444;
    margin-top: 6px;
  }
  .bahi-table{
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    direction: rtl;
  }
  .bahi-table th{
    background: #e8dfc8;
    border: 1px solid #a89070;
    padding: 7px 5px;
    font-weight: 800;
    color: #2c2416;
    white-space: nowrap;
  }
  .bahi-table td{
    border: 1px solid #c4b498;
    padding: 6px 5px;
    vertical-align: middle;
  }
  .bahi-table tbody tr:nth-child(even){ background: #f7f1e3; }
  .bahi-table tbody tr:nth-child(odd){ background: #fffcf5; }
  .bahi-table .num{
    font-family: ui-monospace, 'Cascadia Mono', monospace;
    font-weight: 700;
    text-align: left;
    direction: ltr;
    unicode-bidi: embed;
  }
  .bahi-table .bal-cell{
    font-weight: 800;
    color: #9f1239;
    background: #fff1f2 !important;
  }
  .bahi-table .date-cell{ white-space: nowrap; direction: ltr; text-align: center; font-family: monospace; font-size: 11.5px; }
  .bahi-table .desc-cell{ text-align: right; max-width: 180px; }
  .bahi-foot{
    margin-top: 12px;
    text-align: center;
    padding: 10px;
    border: 2px solid #5c4a32;
    background: #fff;
    border-radius: 4px;
  }
  .bahi-foot .amt{
    font-size: 20px;
    font-weight: 800;
    font-family: ui-monospace, monospace;
    direction: ltr;
  }
  .bahi-note{ font-size: 11px; color: #6b5a40; margin-top: 8px; text-align: center; }
  @media print {
    .bahi-wrap{ border: none; background: #fff; }
    .no-print{ display: none !important; }
  }
</style>
<div class="bahi-wrap" id="bahiLedgerPrint">
  <div class="bahi-head">
    <div class="title">${pageTitle}</div>
    <div class="sub">کسان فرٹیلائزر · میرو خان روڈ، کمبر</div>
    <div class="party-name">${name}</div>
    <div class="bahi-meta">
      <span>${sifa ? 'صفحو / Sifa: <b>' + sifa + '</b>' : ''}</span>
      <span>${phone ? '📱 ' + phone : ''}</span>
      <span>${address || ''}</span>
    </div>
  </div>

  <div style="overflow-x:auto">
  <table class="bahi-table">
    <thead>
      <tr>
        <th>تاریخ<br><span style="font-weight:600;font-size:10px">Date</span></th>
        <th>تفصیل<br><span style="font-weight:600;font-size:10px">Detail</span></th>
        <th>صفحہ<br><span style="font-weight:600;font-size:10px">Page</span></th>
        <th>نام (روپے)<br><span style="font-weight:600;font-size:10px">Debit</span></th>
        <th>جمع (روپے)<br><span style="font-weight:600;font-size:10px">Credit</span></th>
        <th>بقايا<br><span style="font-weight:600;font-size:10px">Balance</span></th>
        <th class="no-print">Edit</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((r) => {
                const editBtns =
                  r.editable && r.payId
                    ? `<button class="btn btn-outline btn-sm" onclick="editLedgerPayment('${partyType}','${partyId}','${r.payId}')">Edit</button>
                       <button class="btn btn-danger btn-sm" onclick="deleteLedgerPayment('${partyType}','${partyId}','${r.payId}')">Del</button>`
                    : '—';
                return `<tr>
          <td class="date-cell">${r.date || '—'}</td>
          <td class="desc-cell">${r.desc || ''}${r.takenBy ? ' <span style="color:#5c4a32;font-size:11px">(' + r.takenBy + ')</span>' : ''}</td>
          <td class="num" style="text-align:center">${r.safha || ''}</td>
          <td class="num">${r.naam ? fmtNum(r.naam) : ''}</td>
          <td class="num">${r.jama ? fmtNum(r.jama) : ''}</td>
          <td class="num bal-cell">${fmtNum(r.bal)}</td>
          <td class="no-print" style="direction:ltr;text-align:center;white-space:nowrap">${editBtns}</td>
        </tr>`;
              })
              .join('')
          : `<tr><td colspan="7" style="text-align:center;padding:20px">کوئی اندراج نہیں</td></tr>`
      }
    </tbody>
  </table>
  </div>

  <div class="bahi-foot">
    <div style="font-size:13px;margin-bottom:4px">کل بقايا / Closing Balance</div>
    <div class="amt" style="color:${balColor}">${fmtRs(Math.abs(closing))}</div>
    <div style="font-weight:800;color:${balColor};margin-top:4px">${balLabel}</div>
  </div>
  <p class="bahi-note">نام = اُدھار / بل · جمع = وصولي · بقايا = چالو بيلنس · صفحہ = هٿ واري ڪتاب جو صفحو</p>
</div>`;

    global.openModal(
      `${pageTitle} — ${name}`,
      html,
      `
      <button class="btn btn-outline" onclick="closeModal()">بند / Close</button>
      <button class="btn btn-gold" onclick="openManualLedgerEntry('${partyType}','${partyId}','${safeName}')">+ نام / جمع</button>
      <button class="btn btn-outline" onclick="window.KissanPhase8.printBahi()">Print</button>
      <button class="btn btn-primary" onclick="downloadPartyLedgerPdf('${partyType}','${partyId}')">PDF</button>
    `,
      true
    );
  }

  function printBahi() {
    const el = document.getElementById('bahiLedgerPrint');
    if (!el) {
      global.toast?.('Ledger not open', 'error');
      return;
    }
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>کھاتہ</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body{margin:16px;font-family:'Noto Nastaliq Urdu',system-ui,sans-serif;background:#fff}
        ${document.querySelector('#bahiLedgerPrint') ? '' : ''}
      </style>
      </head><body>${el.outerHTML}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    // inject styles from page
    const styleNodes = document.querySelectorAll('style');
    let css = '';
    styleNodes.forEach((s) => {
      if (s.textContent.includes('bahi-')) css += s.textContent;
    });
    win.document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
    win.document.close();
  }

  // Override global openLedger
  function install() {
    global.openLedger = openBahiLedger;
    global.KissanPhase8 = {
      APP_VERSION,
      openBahiLedger,
      buildLedgerRows,
      printBahi
    };
    localStorage.setItem('kissan_app_version', APP_VERSION);
    try {
      if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})(window);


/* ==== phase9-year.js ==== */
/**
 * Kissan Fertilizer — Phase 9
 * - Financial Year setup
 * - Year Closing (lock old year, carry balances)
 * - Opening Balances wizard
 * - Backup Center (local / download / Drive hooks)
 * - Bulk WhatsApp reminders for overdue parties
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const FY_KEY = 'kissan_financial_year';
  const CLOSED_YEARS_KEY = 'kissan_closed_years';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ---------- Financial year ---------- */
  function defaultFY() {
    const y = new Date().getFullYear();
    // Pakistan typical Jul–Jun optional; default calendar year
    return {
      label: String(y),
      from: y + '-01-01',
      to: y + '-12-31',
      locked: false
    };
  }
  function getFY() {
    try {
      const s = JSON.parse(localStorage.getItem(FY_KEY) || 'null');
      if (s && s.from && s.to) return s;
    } catch (e) {}
    return defaultFY();
  }
  function setFY(obj) {
    localStorage.setItem(FY_KEY, JSON.stringify(obj));
  }
  function getClosedYears() {
    try {
      return JSON.parse(localStorage.getItem(CLOSED_YEARS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setClosedYears(arr) {
    localStorage.setItem(CLOSED_YEARS_KEY, JSON.stringify(arr));
  }

  function pageFinancialYear() {
    const fy = getFY();
    const closed = getClosedYears();
    return `
    <div class="page-head"><div><h2>Financial Year</h2><p>Active year &amp; year closing</p></div></div>
    <div class="stitch panel">
      <div class="grid2">
        <div class="field"><label>Year label</label>
          <input type="text" id="fyLabel" value="${(fy.label || '').replace(/"/g, '&quot;')}" placeholder="e.g. 2026">
        </div>
        <div class="field"><label>Status</label>
          <div style="padding:10px 0"><span class="stamp ${fy.locked ? 'bad' : 'ok'}">${fy.locked ? 'LOCKED' : 'OPEN'}</span></div>
        </div>
        <div class="field"><label>From date</label>
          <input type="date" id="fyFrom" value="${fy.from || ''}">
        </div>
        <div class="field"><label>To date</label>
          <input type="date" id="fyTo" value="${fy.to || ''}">
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="window.KissanPhase9.saveFY()">Save year</button>
        <button class="btn btn-gold btn-sm" onclick="window.KissanPhase9.openYearClosing()">Year Closing…</button>
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase9.openOpeningWizard()">Opening balances</button>
      </div>
      <p class="hint" style="margin-top:10px">Year closing: party/supplier balances carry forward as opening; optional lock on old range.</p>
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>Closed years history</h3></div>
      ${
        closed.length
          ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Label</th><th>From</th><th>To</th><th>Closed at</th></tr></thead>
            <tbody>${closed
              .map(
                (c) =>
                  `<tr><td>${c.label || '—'}</td><td class="mono">${c.from || ''}</td><td class="mono">${c.to || ''}</td><td class="mono">${(c.closedAt || '').slice(0, 16).replace('T', ' ')}</td></tr>`
              )
              .join('')}</tbody></table></div>`
          : '<p class="muted">No closed years yet.</p>'
      }
    </div>`;
  }

  function saveFY() {
    const label = (document.getElementById('fyLabel')?.value || '').trim() || defaultFY().label;
    const from = document.getElementById('fyFrom')?.value || defaultFY().from;
    const to = document.getElementById('fyTo')?.value || defaultFY().to;
    const prev = getFY();
    setFY({ ...prev, label, from, to });
    toast('Financial year saved', 'success');
    if (global.ACTIVE_PAGE === 'financialyear') global.goPage('financialyear');
  }

  function openYearClosing() {
    const fy = getFY();
    const parties = (global.STATE && global.STATE.parties) || [];
    const suppliers = (global.STATE && global.STATE.suppliers) || [];
    let recv = 0;
    let pay = 0;
    parties.forEach((p) => {
      if (typeof global.partyBalance === 'function') recv += Math.max(0, global.partyBalance(p.id));
    });
    suppliers.forEach((s) => {
      if (typeof global.supplierBalance === 'function') pay += Math.max(0, global.supplierBalance(s.id));
    });
    global.openModal(
      'Year Closing',
      `<p>Active year: <b>${fy.label}</b> (${fy.from} → ${fy.to})</p>
       <div class="stats" style="margin:12px 0">
         <div class="stitch stat red"><div class="lbl">Receivable</div><div class="val">${fmt(recv)}</div></div>
         <div class="stitch stat"><div class="lbl">Payable</div><div class="val">${fmt(pay)}</div></div>
       </div>
       <div class="field"><label>New year label</label>
         <input type="text" id="ycNewLabel" value="${Number(fy.label) ? Number(fy.label) + 1 : fy.label + '-next'}">
       </div>
       <div class="grid2">
         <div class="field"><label>New year from</label><input type="date" id="ycNewFrom" value="${fy.to ? nextDay(fy.to) : todayISO()}"></div>
         <div class="field"><label>New year to</label><input type="date" id="ycNewTo" value=""></div>
       </div>
       <div class="field" style="display:flex;align-items:center;gap:8px">
         <input type="checkbox" id="ycCarry" checked style="width:auto">
         <label for="ycCarry" style="margin:0">Carry party/supplier balances as opening</label>
       </div>
       <div class="field" style="display:flex;align-items:center;gap:8px">
         <input type="checkbox" id="ycLock" checked style="width:auto">
         <label for="ycLock" style="margin:0">Mark old year closed (history)</label>
       </div>
       <p class="hint">Data delete nahi hoti — balances new opening ban jati hain.</p>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase9.runYearClosing()">Close year</button>`
    );
  }

  function nextDay(iso) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function runYearClosing() {
    const fy = getFY();
    const carry = !!document.getElementById('ycCarry')?.checked;
    const lock = !!document.getElementById('ycLock')?.checked;
    const newLabel = (document.getElementById('ycNewLabel')?.value || '').trim() || String(new Date().getFullYear());
    const newFrom = document.getElementById('ycNewFrom')?.value || todayISO();
    let newTo = document.getElementById('ycNewTo')?.value;
    if (!newTo) {
      const y = Number(newFrom.slice(0, 4)) || new Date().getFullYear();
      newTo = y + '-12-31';
    }
    if (!confirm('Year closing run karein? Balances update honge.')) return;

    try {
      if (carry && global.__phase3UpdateDoc) {
        const parties = (global.STATE && global.STATE.parties) || [];
        for (const p of parties) {
          const bal = typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0;
          await global.__phase3UpdateDoc('parties', p.id, { openingBalance: bal });
          const i = parties.findIndex((x) => x.id === p.id);
          if (i >= 0) parties[i] = { ...parties[i], openingBalance: bal };
        }
        const suppliers = (global.STATE && global.STATE.suppliers) || [];
        for (const s of suppliers) {
          const bal = typeof global.supplierBalance === 'function' ? global.supplierBalance(s.id) : 0;
          await global.__phase3UpdateDoc('suppliers', s.id, { openingBalance: bal });
          const i = suppliers.findIndex((x) => x.id === s.id);
          if (i >= 0) suppliers[i] = { ...suppliers[i], openingBalance: bal };
        }
      }
      if (lock) {
        const hist = getClosedYears();
        hist.unshift({
          label: fy.label,
          from: fy.from,
          to: fy.to,
          closedAt: new Date().toISOString()
        });
        setClosedYears(hist.slice(0, 20));
      }
      setFY({ label: newLabel, from: newFrom, to: newTo, locked: false });
      global.closeModal();
      toast('Year closed · new year ' + newLabel, 'success');
      if (typeof global.logAudit === 'function') {
        await global.logAudit('Year Closing', `Closed ${fy.label} → ${newLabel}`);
      }
      if (global.ACTIVE_PAGE === 'financialyear') global.goPage('financialyear');
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  /* ---------- Opening balances wizard ---------- */
  function openOpeningWizard() {
    const parties = (global.STATE && global.STATE.parties) || [];
    const rows = parties
      .slice(0, 40)
      .map(
        (p) => `
      <tr>
        <td>${p.name}</td>
        <td><input type="number" step="0.01" id="ob_${p.id}" value="${Number(p.openingBalance || 0)}" style="width:110px;padding:6px;border:1px solid var(--line);border-radius:8px"></td>
      </tr>`
      )
      .join('');
    global.openModal(
      'Opening balances (Parties)',
      `<p class="hint">Pehle 40 parties — save se Firestore update.</p>
       <div class="tbl-wrap" style="max-height:360px;overflow:auto"><table class="tbl">
         <thead><tr><th>Party</th><th>Opening (Rs.)</th></tr></thead>
         <tbody>${rows || '<tr><td colspan="2">No parties</td></tr>'}</tbody>
       </table></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase9.saveOpeningWizard()">Save openings</button>`,
      true
    );
  }

  async function saveOpeningWizard() {
    const parties = (global.STATE && global.STATE.parties) || [];
    let n = 0;
    try {
      for (const p of parties.slice(0, 40)) {
        const el = document.getElementById('ob_' + p.id);
        if (!el) continue;
        const val = Number(el.value) || 0;
        if (global.__phase3UpdateDoc) {
          await global.__phase3UpdateDoc('parties', p.id, { openingBalance: val });
          const i = parties.findIndex((x) => x.id === p.id);
          if (i >= 0) parties[i] = { ...parties[i], openingBalance: val };
          n++;
        }
      }
      toast(`Updated ${n} openings`, 'success');
      global.closeModal();
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  /* ---------- Backup Center ---------- */
  function pageBackupCenter() {
    return `
    <div class="page-head"><div><h2>Backup Center</h2><p>Local · Download · Drive (if configured)</p></div></div>
    <div class="stats">
      <div class="stitch stat"><div class="lbl">App version</div><div class="val" style="font-size:16px">${APP_VERSION}</div></div>
      <div class="stitch stat"><div class="lbl">FY</div><div class="val" style="font-size:16px">${getFY().label}</div></div>
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>Actions</h3></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <button class="btn btn-primary" onclick="window.KissanPhase9.downloadFullBackup()">Download JSON backup</button>
        <button class="btn btn-outline" onclick="typeof exportAllData==='function'&&exportAllData()">Export (existing)</button>
        <button class="btn btn-outline" onclick="typeof doLocalBackup==='function'&&doLocalBackup()">Local snapshot</button>
        <button class="btn btn-outline" onclick="typeof backupToGdrive==='function'?backupToGdrive():toast('Drive not configured','info')">Google Drive</button>
        <button class="btn btn-gold" onclick="window.KissanPhase9.triggerFileRestore()">Restore from JSON file</button>
      </div>
      <input type="file" id="p9RestoreFile" accept=".json" style="display:none" onchange="window.KissanPhase9.handleRestoreFile(event)">
      <p class="hint" style="margin-top:12px">JSON backup mein products, parties, sales, purchases, payments, settings summary hoti hai.</p>
    </div>`;
  }

  function downloadFullBackup() {
    const S = global.STATE || {};
    const payload = {
      app: 'Kissan Fertilizer',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      fy: getFY(),
      products: S.products || [],
      parties: S.parties || [],
      suppliers: S.suppliers || [],
      godams: S.godams || [],
      sales: S.sales || [],
      purchases: S.purchases || [],
      payments: S.payments || [],
      expenses: S.expenses || [],
      vouchers: S.vouchers || [],
      salesOrders: S.salesOrders || [],
      purchaseOrders: S.purchaseOrders || [],
      quotations: S.quotations || [],
      salesReturns: S.salesReturns || [],
      purchaseReturns: S.purchaseReturns || [],
      batches: S.batches || [],
      stockMoves: S.stockMoves || [],
      payroll: S.payroll || [],
      dailyClosings: S.dailyClosings || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kissan_backup_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded', 'success');
  }

  function triggerFileRestore() {
    document.getElementById('p9RestoreFile')?.click();
  }

  async function handleRestoreFile(ev) {
    const file = ev.target?.files?.[0];
    if (!file) return;
    if (!confirm('Restore will ADD docs from file (merge). Continue?')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const keys = [
        'products',
        'parties',
        'suppliers',
        'godams',
        'sales',
        'purchases',
        'payments',
        'expenses',
        'vouchers'
      ];
      let n = 0;
      for (const k of keys) {
        const arr = data[k];
        if (!Array.isArray(arr) || !global.__phase3AddDoc) continue;
        for (const row of arr.slice(0, 200)) {
          const { id, ...rest } = row;
          await global.__phase3AddDoc(k, { ...rest, restoredAt: new Date().toISOString() });
          n++;
        }
      }
      toast(`Restored ~${n} rows (capped per collection)`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
    ev.target.value = '';
  }

  /* ---------- Bulk WhatsApp reminders ---------- */
  function pageBulkRemind() {
    const parties = (global.STATE && global.STATE.parties) || [];
    const due = parties
      .map((p) => {
        const bal = typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0;
        return { p, bal };
      })
      .filter((x) => x.bal > 0)
      .sort((a, b) => b.bal - a.bal);

    return `
    <div class="page-head"><div><h2>Bulk Payment Reminders</h2><p>WhatsApp links for overdue parties</p></div>
      <button class="btn btn-outline btn-sm" onclick="window.KissanPhase9.copyAllReminders()">Copy all messages</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Party</th><th>Phone</th><th class="right">Due</th><th></th></tr></thead>
        <tbody>
          ${
            due.length
              ? due
                  .map(({ p, bal }) => {
                    const phone = String(p.phone || '').replace(/\D/g, '');
                    const msg = encodeURIComponent(
                      `Assalam o Alaikum ${p.name},\n\nKissan Fertilizer (Kamber) — apka outstanding Rs. ${Math.abs(bal).toLocaleString('en-PK')} hai. Barah-e-karam wasool kar dein.\n\nShukriya.`
                    );
                    const wa =
                      phone.length >= 10
                        ? 'https://wa.me/' +
                          (phone.startsWith('92') ? phone : phone.startsWith('0') ? '92' + phone.slice(1) : phone) +
                          '?text=' +
                          msg
                        : '';
                    return `<tr>
              <td style="font-weight:600">${p.name}</td>
              <td class="mono">${p.phone || '—'}</td>
              <td class="right mono" style="color:var(--danger);font-weight:800">${fmt(bal)}</td>
              <td class="right">${
                wa
                  ? `<a class="btn btn-gold btn-sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>`
                  : '<span class="muted">No phone</span>'
              }</td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="4">No dues.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function copyAllReminders() {
    const parties = (global.STATE && global.STATE.parties) || [];
    const lines = [];
    parties.forEach((p) => {
      const bal = typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0;
      if (bal <= 0) return;
      lines.push(`${p.name} (${p.phone || '—'}): Rs. ${Math.abs(bal).toLocaleString('en-PK')}`);
    });
    if (!lines.length) {
      toast('Nothing to copy', 'info');
      return;
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(
      () => toast('Copied', 'success'),
      () => toast('Clipboard failed', 'error')
    );
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase9 = {
    APP_VERSION,
    getFY,
    setFY,
    pageFinancialYear,
    saveFY,
    openYearClosing,
    runYearClosing,
    openOpeningWizard,
    saveOpeningWizard,
    pageBackupCenter,
    downloadFullBackup,
    triggerFileRestore,
    handleRestoreFile,
    pageBulkRemind,
    copyAllReminders
  };
})(window);


/* ==== phase10-polish.js ==== */
/**
 * Kissan Fertilizer — Phase 10
 * - Product SKU / Barcode + quick find
 * - Invoice terms & footer settings
 * - Recurring expenses
 * - Duplicate party finder
 * - Keyboard shortcuts help
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const INV_KEY = 'kissan_invoice_settings';
  const RECUR_KEY = 'kissan_recurring_expenses';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ---------- Invoice settings ---------- */
  function getInvoiceSettings() {
    try {
      return Object.assign(
        {
          title: 'Kissan Fertilizer',
          address: 'Miro Khan Road, Kamber',
          phone: '03333909816',
          terms: 'مال وصول کرتے وقت چیک کریں۔ شکایت 24 گھنٹے میں۔',
          footer: 'Software by Fazul Khan Chandio',
          showSifa: true
        },
        JSON.parse(localStorage.getItem(INV_KEY) || '{}')
      );
    } catch (e) {
      return {
        title: 'Kissan Fertilizer',
        address: 'Miro Khan Road, Kamber',
        phone: '',
        terms: '',
        footer: '',
        showSifa: true
      };
    }
  }
  function setInvoiceSettings(obj) {
    localStorage.setItem(INV_KEY, JSON.stringify(obj));
  }

  function pageInvoiceSettings() {
    const s = getInvoiceSettings();
    return `
    <div class="page-head"><div><h2>Invoice Settings</h2><p>Print header, terms, footer</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase10.saveInvoiceSettings()">Save</button>
    </div>
    <div class="stitch panel">
      <div class="field"><label>Business title</label>
        <input type="text" id="invTitle" value="${esc(s.title)}">
      </div>
      <div class="field"><label>Address</label>
        <input type="text" id="invAddr" value="${esc(s.address)}">
      </div>
      <div class="field"><label>Phone</label>
        <input type="text" id="invPhone" value="${esc(s.phone)}">
      </div>
      <div class="field"><label>Terms (invoice pe)</label>
        <textarea id="invTerms" rows="3">${esc(s.terms)}</textarea>
      </div>
      <div class="field"><label>Footer</label>
        <input type="text" id="invFooter" value="${esc(s.footer)}">
      </div>
      <div class="field" style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="invSifa" ${s.showSifa ? 'checked' : ''} style="width:auto">
        <label for="invSifa" style="margin:0">Show Sifa / page no. on prints</label>
      </div>
    </div>`;
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }
  function saveInvoiceSettings() {
    setInvoiceSettings({
      title: document.getElementById('invTitle')?.value || '',
      address: document.getElementById('invAddr')?.value || '',
      phone: document.getElementById('invPhone')?.value || '',
      terms: document.getElementById('invTerms')?.value || '',
      footer: document.getElementById('invFooter')?.value || '',
      showSifa: !!document.getElementById('invSifa')?.checked
    });
    toast('Invoice settings saved', 'success');
  }

  /* ---------- Barcode / SKU find ---------- */
  function findProductByCode(code) {
    const q = String(code || '').trim().toLowerCase();
    if (!q) return null;
    const list = (global.STATE && global.STATE.products) || [];
    return (
      list.find((p) => String(p.sku || '').toLowerCase() === q) ||
      list.find((p) => String(p.barcode || '').toLowerCase() === q) ||
      list.find((p) => (p.name || '').toLowerCase() === q) ||
      list.find((p) => (p.name || '').toLowerCase().includes(q))
    );
  }

  function pageBarcode() {
    return `
    <div class="page-head"><div><h2>Barcode / SKU Find</h2><p>Scan or type code → product</p></div></div>
    <div class="stitch panel">
      <div class="field"><label>Code / SKU / Name</label>
        <input type="text" id="bcInput" placeholder="Scan barcode or type SKU…" autofocus
          style="font-size:18px;padding:14px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window.KissanPhase10.lookupBarcode();}">
      </div>
      <button class="btn btn-primary" onclick="window.KissanPhase10.lookupBarcode()">Find</button>
      <div id="bcResult" style="margin-top:16px"></div>
      <p class="hint" style="margin-top:12px">Product form pe <b>SKU</b> aur <b>Barcode</b> fields add ho chuki hain (CRUD). POS / sale se pehle set karo.</p>
    </div>`;
  }

  function lookupBarcode() {
    const code = document.getElementById('bcInput')?.value || '';
    const p = findProductByCode(code);
    const box = document.getElementById('bcResult');
    if (!box) return;
    if (!p) {
      box.innerHTML = `<div class="stitch" style="padding:16px;color:var(--danger)">Product nahi mila: <b>${esc(code)}</b></div>`;
      return;
    }
    const st =
      typeof global.productEffectiveStock === 'function'
        ? global.productEffectiveStock(p)
        : p.stock || 0;
    box.innerHTML = `
      <div class="stitch" style="padding:16px">
        <div style="font-size:18px;font-weight:800;color:var(--field-dark)">${esc(p.name)}</div>
        <div class="hint">${esc(p.category || '')} · ${esc(p.unit || '')} · SKU ${esc(p.sku || '—')} · BC ${esc(p.barcode || '—')}</div>
        <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap">
          <div><span class="muted">Sale</span><div class="mono" style="font-weight:800;font-size:18px">${fmt(p.salePrice)}</div></div>
          <div><span class="muted">Purchase</span><div class="mono" style="font-weight:700">${fmt(p.purchasePrice)}</div></div>
          <div><span class="muted">Stock</span><div class="mono" style="font-weight:800">${st}</div></div>
        </div>
        <div style="margin-top:12px" class="row-actions">
          <button class="btn btn-gold btn-sm" onclick="goPage('pos');setTimeout(function(){var s=document.getElementById('posProduct');if(s){s.value='${p.id}';window.KissanPhase7&&KissanPhase7.posPick();}},300)">Open in POS</button>
          <button class="btn btn-outline btn-sm" onclick="crudModalOpen(CRUD_MODULES.products,'${p.id}')">Edit product</button>
        </div>
      </div>`;
  }

  /* ---------- Recurring expenses ---------- */
  function getRecurring() {
    try {
      return JSON.parse(localStorage.getItem(RECUR_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setRecurring(arr) {
    localStorage.setItem(RECUR_KEY, JSON.stringify(arr));
  }

  function pageRecurring() {
    const list = getRecurring();
    return `
    <div class="page-head"><div><h2>Recurring Expenses</h2><p>Templates — one click post</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase10.openRecurringModal()">+ Template</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Title</th><th>Category</th><th class="right">Amount</th><th>Every</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (r) => `<tr>
            <td style="font-weight:600">${esc(r.title)}</td>
            <td>${esc(r.category || '')}</td>
            <td class="right mono">${fmt(r.amount)}</td>
            <td>${esc(r.every || 'Monthly')}</td>
            <td class="right row-actions">
              <button class="btn btn-gold btn-sm" onclick="window.KissanPhase10.postRecurring('${r.id}')">Post today</button>
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase10.delRecurring('${r.id}')">Del</button>
            </td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="5">No templates.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function openRecurringModal() {
    global.openModal(
      'Recurring expense template',
      `<div class="field"><label>Title *</label><input type="text" id="reTitle" placeholder="e.g. Shop rent"></div>
       <div class="grid2">
         <div class="field"><label>Amount *</label><input type="number" id="reAmt" step="0.01"></div>
         <div class="field"><label>Category</label>
           <select id="reCat"><option>Rent</option><option>Utilities</option><option>Salary</option><option>Transport</option><option>Other</option></select>
         </div>
         <div class="field"><label>Every</label>
           <select id="reEvery"><option>Monthly</option><option>Weekly</option><option>Yearly</option></select>
         </div>
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase10.saveRecurring()">Save</button>`
    );
  }

  function saveRecurring() {
    const title = (document.getElementById('reTitle')?.value || '').trim();
    const amount = Number(document.getElementById('reAmt')?.value) || 0;
    if (!title || amount <= 0) {
      toast('Title & amount required', 'error');
      return;
    }
    const list = getRecurring();
    list.push({
      id: 're_' + Date.now(),
      title,
      amount,
      category: document.getElementById('reCat')?.value || 'Other',
      every: document.getElementById('reEvery')?.value || 'Monthly'
    });
    setRecurring(list);
    global.closeModal();
    toast('Template saved', 'success');
    if (global.ACTIVE_PAGE === 'recurring') global.goPage('recurring');
  }

  async function postRecurring(id) {
    const r = getRecurring().find((x) => x.id === id);
    if (!r || !global.__phase3AddDoc) return;
    try {
      await global.__phase3AddDoc('expenses', {
        category: r.category || r.title,
        amount: r.amount,
        date: todayISO(),
        note: 'Recurring: ' + r.title,
        atLocal: new Date().toISOString()
      });
      if (global.STATE) {
        global.STATE.expenses = global.STATE.expenses || [];
      }
      toast('Expense posted · ' + r.title, 'success');
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  function delRecurring(id) {
    setRecurring(getRecurring().filter((x) => x.id !== id));
    if (global.ACTIVE_PAGE === 'recurring') global.goPage('recurring');
  }

  /* ---------- Duplicate parties ---------- */
  function pageDuplicates() {
    const parties = (global.STATE && global.STATE.parties) || [];
    const byPhone = {};
    const byName = {};
    parties.forEach((p) => {
      const ph = String(p.phone || '').replace(/\D/g, '');
      if (ph.length >= 10) {
        byPhone[ph] = byPhone[ph] || [];
        byPhone[ph].push(p);
      }
      const nm = (p.name || '').trim().toLowerCase();
      if (nm) {
        byName[nm] = byName[nm] || [];
        byName[nm].push(p);
      }
    });
    const phoneDups = Object.values(byPhone).filter((a) => a.length > 1);
    const nameDups = Object.values(byName).filter((a) => a.length > 1);

    function block(title, groups) {
      if (!groups.length) return `<p class="muted">No ${title} duplicates.</p>`;
      return groups
        .map(
          (g) => `
        <div class="stitch" style="padding:12px;margin-bottom:10px">
          <div style="font-weight:700;margin-bottom:6px">${esc(g[0].name)} · ${g.length} records</div>
          ${g
            .map(
              (p) =>
                `<div class="ledger-line"><span>${esc(p.name)} · ${esc(p.phone || '—')} · ${esc(p.address || '')}</span>
                <button class="btn btn-outline btn-sm" onclick="crudModalOpen(CRUD_MODULES.parties,'${p.id}')">Edit</button></div>`
            )
            .join('')}
          <button class="btn btn-gold btn-sm" onclick="window.KissanPhase6&&KissanPhase6.openMergeModal('party')">Merge parties…</button>
        </div>`
        )
        .join('');
    }

    return `
    <div class="page-head"><div><h2>Duplicate Parties</h2><p>Same phone or same name</p></div></div>
    <div class="stitch panel">
      <div class="panel-head"><h3>By phone</h3></div>
      ${block('phone', phoneDups)}
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>By name</h3></div>
      ${block('name', nameDups)}
    </div>`;
  }

  /* ---------- Shortcuts help ---------- */
  function pageShortcuts() {
    const rows = [
      ['F10', 'Popup calculator'],
      ['Enter on barcode page', 'Find product'],
      ['Dashboard', 'Triggers + daily stats'],
      ['POS', 'Fast counter sale'],
      ['All Party → Ledger', 'Bahi-khata style'],
      ['Bulk Reminders', 'WhatsApp dues']
    ];
    return `
    <div class="page-head"><div><h2>Shortcuts & Tips</h2><p>App version ${APP_VERSION}</p></div></div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Action</th><th>Where</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td class="mono" style="font-weight:700">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase10 = {
    APP_VERSION,
    getInvoiceSettings,
    pageInvoiceSettings,
    saveInvoiceSettings,
    findProductByCode,
    pageBarcode,
    lookupBarcode,
    pageRecurring,
    openRecurringModal,
    saveRecurring,
    postRecurring,
    delRecurring,
    pageDuplicates,
    pageShortcuts
  };
})(window);


/* ==== phase11-ops.js ==== */
/**
 * Kissan Fertilizer — Phase 11
 * - Staff attendance
 * - Transport / trip sheet
 * - GST / tax on sales (optional %)
 * - Dark mode
 * - Sync / online status chip
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const ATT_KEY = 'kissan_attendance';
  const TRIP_KEY = 'kissan_trips';
  const TAX_KEY = 'kissan_default_tax';
  const THEME_KEY = 'kissan_theme';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ---------- Attendance ---------- */
  function getAttendance() {
    try {
      return JSON.parse(localStorage.getItem(ATT_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setAttendance(arr) {
    localStorage.setItem(ATT_KEY, JSON.stringify(arr));
  }

  function pageAttendance() {
    const date = global._attDate || todayISO();
    const users = ((global.STATE && global.STATE.users) || []).filter((u) => u.name || u.email);
    const staffNames = users.map((u) => u.name || u.email);
    // Also allow free names from payroll
    ((global.STATE && global.STATE.payroll) || []).forEach((p) => {
      if (p.staffName && !staffNames.includes(p.staffName)) staffNames.push(p.staffName);
    });
    const dayRows = getAttendance().filter((a) => a.date === date);
    const byName = {};
    dayRows.forEach((a) => {
      byName[a.name] = a;
    });

    return `
    <div class="page-head"><div><h2>Staff Attendance</h2><p>${date}</p></div>
      <div class="toolbar">
        <input type="date" id="attDate" value="${date}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px"
          onchange="window._attDate=this.value;goPage('attendance')">
        <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.markAllPresent()">All Present</button>
      </div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Staff</th><th>Status</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${
            staffNames.length
              ? staffNames
                  .map((name) => {
                    const row = byName[name];
                    const st = row?.status || '—';
                    return `<tr>
              <td style="font-weight:600">${name}</td>
              <td><span class="stamp ${st === 'Present' ? 'ok' : st === 'Absent' ? 'bad' : st === 'Leave' ? 'warn' : 'mute'}">${st}</span></td>
              <td class="muted">${row?.note || ''}</td>
              <td class="right row-actions">
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Present')">P</button>
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Absent')">A</button>
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Leave')">L</button>
              </td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="4">Staff Users / Payroll se names aate hain.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function setAtt(name, status) {
    const date = global._attDate || todayISO();
    const list = getAttendance().filter((a) => !(a.date === date && a.name === name));
    list.push({ id: 'att_' + Date.now(), date, name, status, note: '', at: new Date().toISOString() });
    setAttendance(list);
    if (global.ACTIVE_PAGE === 'attendance') global.goPage('attendance');
  }

  function markAllPresent() {
    const users = ((global.STATE && global.STATE.users) || []).map((u) => u.name || u.email).filter(Boolean);
    users.forEach((n) => setAtt(n, 'Present'));
    toast('All marked Present', 'success');
  }

  /* ---------- Transport trips ---------- */
  function getTrips() {
    try {
      return JSON.parse(localStorage.getItem(TRIP_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setTrips(arr) {
    localStorage.setItem(TRIP_KEY, JSON.stringify(arr));
  }

  function pageTrips() {
    const list = getTrips().slice().reverse();
    return `
    <div class="page-head"><div><h2>Transport / Trips</h2><p>Delivery vehicle sheet</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.openTripModal()">+ Trip</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Route</th><th class="right">Expense</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (t) => `<tr>
            <td class="mono">${t.date || ''}</td>
            <td>${t.vehicle || '—'}</td>
            <td>${t.driver || '—'}</td>
            <td>${t.route || '—'}</td>
            <td class="right mono">${fmt(t.expense)}</td>
            <td class="muted">${t.note || ''}</td>
            <td class="right">
              <button class="btn btn-gold btn-sm" onclick="window.KissanPhase11.postTripExpense('${t.id}')">→ Expense</button>
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase11.delTrip('${t.id}')">Del</button>
            </td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No trips.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function openTripModal() {
    global.openModal(
      'New Trip',
      `<div class="grid2">
        <div class="field"><label>Date</label><input type="date" id="trDate" value="${todayISO()}"></div>
        <div class="field"><label>Vehicle</label><input type="text" id="trVeh" placeholder="e.g. Mazda / Loader"></div>
        <div class="field"><label>Driver</label><input type="text" id="trDrv"></div>
        <div class="field"><label>Route / area</label><input type="text" id="trRoute"></div>
        <div class="field"><label>Expense (fuel etc.)</label><input type="number" id="trExp" step="0.01" value="0"></div>
        <div class="field"><label>Note</label><input type="text" id="trNote"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase11.saveTrip()">Save</button>`
    );
  }

  function saveTrip() {
    const list = getTrips();
    list.push({
      id: 'trip_' + Date.now(),
      date: document.getElementById('trDate')?.value || todayISO(),
      vehicle: document.getElementById('trVeh')?.value || '',
      driver: document.getElementById('trDrv')?.value || '',
      route: document.getElementById('trRoute')?.value || '',
      expense: Number(document.getElementById('trExp')?.value) || 0,
      note: document.getElementById('trNote')?.value || '',
      posted: false
    });
    setTrips(list);
    global.closeModal();
    toast('Trip saved', 'success');
    if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
  }

  async function postTripExpense(id) {
    const list = getTrips();
    const t = list.find((x) => x.id === id);
    if (!t || !t.expense) {
      toast('No expense amount', 'error');
      return;
    }
    if (t.posted) {
      toast('Already posted', 'info');
      return;
    }
    if (!global.__phase3AddDoc) return;
    try {
      await global.__phase3AddDoc('expenses', {
        category: 'Transport',
        amount: t.expense,
        date: t.date || todayISO(),
        note: `Trip ${t.vehicle || ''} ${t.route || ''} ${t.driver || ''}`.trim(),
        atLocal: new Date().toISOString()
      });
      t.posted = true;
      setTrips(list);
      toast('Expense posted', 'success');
      if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  function delTrip(id) {
    setTrips(getTrips().filter((x) => x.id !== id));
    if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
  }

  /* ---------- Tax / GST default ---------- */
  function getDefaultTax() {
    return Number(localStorage.getItem(TAX_KEY) || 0) || 0;
  }
  function setDefaultTax(n) {
    localStorage.setItem(TAX_KEY, String(Number(n) || 0));
  }

  function pageTaxSettings() {
    return `
    <div class="page-head"><div><h2>Tax / GST</h2><p>Default % on sales (optional)</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.saveTax()">Save</button>
    </div>
    <div class="stitch panel">
      <div class="field"><label>Default tax %</label>
        <input type="number" id="taxPct" step="0.01" min="0" value="${getDefaultTax()}" style="max-width:140px">
      </div>
      <p class="hint">Sale modal pe tax field baad mein use ho sakta hai. Abhi default yahan store hota hai; amount = subtotal × %.</p>
      <p class="hint">Example: 18% GST → rate pe alag ya bill pe add — shop policy ke mutabiq.</p>
    </div>`;
  }
  function saveTax() {
    setDefaultTax(document.getElementById('taxPct')?.value);
    toast('Tax % saved', 'success');
  }

  /* ---------- Dark mode ---------- */
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    let style = document.getElementById('kissanDarkStyle');
    if (t === 'dark') {
      if (!style) {
        style = document.createElement('style');
        style.id = 'kissanDarkStyle';
        document.head.appendChild(style);
      }
      style.textContent = `
        html[data-theme="dark"] body,
        html[data-theme="dark"] #app{
          --paper:#1a1f1c; --ink:#e8efe6; --ink-faint:#9aab9a;
          --field:#3d7a52; --field-dark:#8fd4a8; --field-mid:#5a9a70;
          --line:#2e3832; --wheat:#c9a227; --danger:#f87171; --ok:#4ade80;
          background:#121612 !important; color:#e8efe6 !important;
        }
        html[data-theme="dark"] .stitch,
        html[data-theme="dark"] .panel,
        html[data-theme="dark"] .stat,
        html[data-theme="dark"] .modal-card{
          background:#1e2620 !important; border-color:#2e3832 !important; color:#e8efe6 !important;
        }
        html[data-theme="dark"] .tbl th{ background:#252d28 !important; color:#c5d4c5 !important; }
        html[data-theme="dark"] input, html[data-theme="dark"] select, html[data-theme="dark"] textarea{
          background:#151a16 !important; color:#e8efe6 !important; border-color:#3a453c !important;
        }
        html[data-theme="dark"] .sidebar{ background:#151a16 !important; }
        html[data-theme="dark"] .nav-item:hover, html[data-theme="dark"] .nav-item.active{
          background:#252d28 !important;
        }
      `;
    } else if (style) {
      style.textContent = '';
    }
  }

  function toggleDark() {
    const cur = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
    toast((localStorage.getItem(THEME_KEY) === 'dark' ? 'Dark' : 'Light') + ' mode', 'success');
  }

  function pageAppearance() {
    const cur = localStorage.getItem(THEME_KEY) || 'light';
    return `
    <div class="page-head"><div><h2>Appearance</h2><p>Theme</p></div></div>
    <div class="stitch panel">
      <p>Current: <b>${cur}</b></p>
      <button class="btn btn-primary" onclick="window.KissanPhase11.toggleDark()">Toggle Dark / Light</button>
    </div>`;
  }

  /* ---------- Online / sync chip ---------- */
  function ensureStatusChip() {
    if (document.getElementById('kissanSyncChip')) return;
    const chip = document.createElement('div');
    chip.id = 'kissanSyncChip';
    chip.style.cssText =
      'position:fixed;bottom:14px;right:14px;z-index:9998;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:default';
    document.body.appendChild(chip);
    function update() {
      const on = navigator.onLine;
      chip.textContent = on ? '● Online' : '● Offline';
      chip.style.background = on ? '#dcfce7' : '#fee2e2';
      chip.style.color = on ? '#166534' : '#991b1b';
    }
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }

  // boot
  function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    setTimeout(ensureStatusChip, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase11 = {
    APP_VERSION,
    pageAttendance,
    setAtt,
    markAllPresent,
    pageTrips,
    openTripModal,
    saveTrip,
    postTripExpense,
    delTrip,
    pageTaxSettings,
    saveTax,
    getDefaultTax,
    toggleDark,
    pageAppearance,
    applyTheme
  };
})(window);


/* ==== phase12-books.js ==== */
/**
 * Kissan Fertilizer — Phase 12
 * - Day Book (saari entries ek din)
 * - Trial Balance (simple)
 * - WhatsApp / SMS message templates
 * - Product rate list print
 * - Cheque book register
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const MSG_KEY = 'kissan_msg_templates';
  const CHQ_KEY = 'kissan_cheque_book';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ---------- Day Book ---------- */
  function pageDayBook() {
    const d = global._dayBookDate || todayISO();
    const S = global.STATE || {};
    const rows = [];

    (S.sales || [])
      .filter((x) => x.date === d)
      .forEach((s) =>
        rows.push({
          time: (s.atLocal || '').slice(11, 16),
          type: 'Sale',
          detail: `${s.partyName || 'Walk-in'} · ${s.productName || ''} × ${s.qty || ''}`,
          inAmt: Number(s.total || 0),
          outAmt: 0,
          ref: s.docNo || ''
        })
      );
    (S.purchases || [])
      .filter((x) => x.date === d)
      .forEach((p) =>
        rows.push({
          time: (p.atLocal || '').slice(11, 16),
          type: 'Purchase',
          detail: `${p.supplierName || ''} · ${p.productName || ''}`,
          inAmt: 0,
          outAmt: Number(p.total || 0),
          ref: p.docNo || ''
        })
      );
    (S.payments || [])
      .filter((x) => x.date === d)
      .forEach((p) => {
        const isIn = p.partyType === 'party' && !p.isGiven;
        const isOut = p.partyType === 'supplier' && !p.isGiven;
        rows.push({
          time: (p.atLocal || '').slice(11, 16),
          type: 'Payment',
          detail: p.partyName || p.note || '',
          inAmt: isIn ? Number(p.amount || 0) : 0,
          outAmt: isOut || p.isGiven ? Number(p.amount || 0) : 0,
          ref: ''
        });
      });
    (S.expenses || [])
      .filter((x) => x.date === d)
      .forEach((e) =>
        rows.push({
          time: '',
          type: 'Expense',
          detail: e.category || e.note || '',
          inAmt: 0,
          outAmt: Number(e.amount || 0),
          ref: ''
        })
      );
    (S.vouchers || [])
      .filter((x) => x.date === d)
      .forEach((v) =>
        rows.push({
          time: '',
          type: 'Voucher',
          detail: v.note || v.type,
          inAmt: v.type === 'In' ? Number(v.amount || 0) : 0,
          outAmt: v.type === 'Out' ? Number(v.amount || 0) : 0,
          ref: ''
        })
      );

    rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const totIn = rows.reduce((a, r) => a + r.inAmt, 0);
    const totOut = rows.reduce((a, r) => a + r.outAmt, 0);

    return `
    <div class="page-head"><div><h2>Day Book</h2><p>Har entry — ek din</p></div>
      <div class="toolbar">
        <input type="date" value="${d}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px"
          onchange="window._dayBookDate=this.value;goPage('daybook')">
      </div>
    </div>
    <div class="stats">
      <div class="stitch stat ok"><div class="lbl">In</div><div class="val">${fmt(totIn)}</div></div>
      <div class="stitch stat red"><div class="lbl">Out</div><div class="val">${fmt(totOut)}</div></div>
      <div class="stitch stat"><div class="lbl">Net</div><div class="val">${fmt(totIn - totOut)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Time</th><th>Type</th><th>Detail</th><th>Ref</th><th class="right">In</th><th class="right">Out</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr>
            <td class="mono">${r.time || '—'}</td>
            <td><span class="stamp mute">${r.type}</span></td>
            <td>${r.detail}</td>
            <td class="mono">${r.ref || ''}</td>
            <td class="right mono" style="color:var(--ok)">${r.inAmt ? fmt(r.inAmt) : ''}</td>
            <td class="right mono" style="color:var(--danger)">${r.outAmt ? fmt(r.outAmt) : ''}</td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="6">Is din koi entry nahi.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Trial Balance ---------- */
  function pageTrialBalance() {
    const S = global.STATE || {};
    let cashIn = 0,
      cashOut = 0;
    (S.sales || []).forEach((s) => {
      if (s.payMode === 'Cash' || Number(s.payCash) > 0) cashIn += Number(s.payCash) || Number(s.total) || 0;
      else if (!s.payMode) cashIn += Number(s.total || 0);
    });
    (S.purchases || []).forEach((p) => {
      if (p.payMode === 'Cash') cashOut += Number(p.total || 0);
    });
    (S.expenses || []).forEach((e) => {
      cashOut += Number(e.amount || 0);
    });
    (S.vouchers || []).forEach((v) => {
      if (v.type === 'In') cashIn += Number(v.amount || 0);
      else cashOut += Number(v.amount || 0);
    });
    (S.payments || []).forEach((p) => {
      if (p.partyType === 'party' && !p.isGiven) cashIn += Number(p.amount || 0);
      if (p.partyType === 'supplier' && !p.isGiven) cashOut += Number(p.amount || 0);
    });

    let receivable = 0,
      payable = 0;
    (S.parties || []).forEach((p) => {
      if (typeof global.partyBalance === 'function') receivable += Math.max(0, global.partyBalance(p.id));
    });
    (S.suppliers || []).forEach((s) => {
      if (typeof global.supplierBalance === 'function') payable += Math.max(0, global.supplierBalance(s.id));
    });

    const stockValue = (S.products || []).reduce((a, p) => {
      const st =
        typeof global.productEffectiveStock === 'function'
          ? global.productEffectiveStock(p)
          : Number(p.stock || 0);
      return a + st * Number(p.purchasePrice || 0);
    }, 0);

    const salesTotal = (S.sales || []).reduce((a, s) => a + Number(s.total || 0), 0);
    const purchTotal = (S.purchases || []).reduce((a, p) => a + Number(p.total || 0), 0);
    const expTotal = (S.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0);

    // Simple TB lines: Debit | Credit
    const lines = [
      { name: 'Stock (inventory value)', dr: stockValue, cr: 0 },
      { name: 'Receivable (parties)', dr: receivable, cr: 0 },
      { name: 'Cash movement (net in proxy)', dr: Math.max(0, cashIn - cashOut), cr: Math.max(0, cashOut - cashIn) },
      { name: 'Payable (suppliers)', dr: 0, cr: payable },
      { name: 'Sales (credit side income)', dr: 0, cr: salesTotal },
      { name: 'Purchases', dr: purchTotal, cr: 0 },
      { name: 'Expenses', dr: expTotal, cr: 0 }
    ];
    const totDr = lines.reduce((a, l) => a + l.dr, 0);
    const totCr = lines.reduce((a, l) => a + l.cr, 0);

    return `
    <div class="page-head"><div><h2>Trial Balance</h2><p>Simplified snapshot (not full double-entry)</p></div></div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Particulars</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
        <tbody>
          ${lines
            .map(
              (l) =>
                `<tr><td>${l.name}</td><td class="right mono">${l.dr ? fmt(l.dr) : '—'}</td><td class="right mono">${l.cr ? fmt(l.cr) : '—'}</td></tr>`
            )
            .join('')}
          <tr style="background:var(--field-soft)">
            <td style="font-weight:800">TOTAL</td>
            <td class="right mono" style="font-weight:800">${fmt(totDr)}</td>
            <td class="right mono" style="font-weight:800">${fmt(totCr)}</td>
          </tr>
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Ye shop-level approximation hai — formal audit TB nahi. Decision support ke liye.</p>
    </div>`;
  }

  /* ---------- Message templates ---------- */
  function getTemplates() {
    try {
      const t = JSON.parse(localStorage.getItem(MSG_KEY) || 'null');
      if (Array.isArray(t) && t.length) return t;
    } catch (e) {}
    return [
      {
        id: 't1',
        name: 'Payment reminder',
        body: 'Assalam o Alaikum {name},\n\nKissan Fertilizer — apka outstanding Rs. {amount} hai. Barah-e-karam wasool kar dein.\n\nShukriya.'
      },
      {
        id: 't2',
        name: 'Order ready',
        body: 'Assalam o Alaikum {name},\n\nAapka order tayyar hai. Shop se le jayein.\nKissan Fertilizer, Kamber'
      }
    ];
  }
  function setTemplates(arr) {
    localStorage.setItem(MSG_KEY, JSON.stringify(arr));
  }

  function pageMsgTemplates() {
    const list = getTemplates();
    return `
    <div class="page-head"><div><h2>Message Templates</h2><p>{name} {amount} placeholders</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase12.openTemplateModal()">+ Template</button>
    </div>
    <div class="stitch panel">
      ${list
        .map(
          (t) => `
        <div class="stitch" style="padding:12px;margin-bottom:10px">
          <div style="font-weight:800">${t.name}</div>
          <pre style="white-space:pre-wrap;font-size:12.5px;margin:8px 0;color:var(--ink-faint)">${t.body}</pre>
          <button class="btn btn-danger btn-sm" onclick="window.KissanPhase12.delTemplate('${t.id}')">Delete</button>
        </div>`
        )
        .join('') || '<p class="muted">No templates</p>'}
    </div>`;
  }

  function openTemplateModal() {
    global.openModal(
      'New template',
      `<div class="field"><label>Name</label><input type="text" id="mtName"></div>
       <div class="field"><label>Body</label><textarea id="mtBody" rows="5" placeholder="Use {name} and {amount}"></textarea></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase12.saveTemplate()">Save</button>`
    );
  }
  function saveTemplate() {
    const name = (document.getElementById('mtName')?.value || '').trim();
    const body = document.getElementById('mtBody')?.value || '';
    if (!name || !body) {
      toast('Name & body required', 'error');
      return;
    }
    const list = getTemplates();
    list.push({ id: 't_' + Date.now(), name, body });
    setTemplates(list);
    global.closeModal();
    if (global.ACTIVE_PAGE === 'msgtemplates') global.goPage('msgtemplates');
  }
  function delTemplate(id) {
    setTemplates(getTemplates().filter((x) => x.id !== id));
    if (global.ACTIVE_PAGE === 'msgtemplates') global.goPage('msgtemplates');
  }

  /* ---------- Rate list print ---------- */
  function pageRateList() {
    const products = ((global.STATE && global.STATE.products) || []).filter((p) => !p.blocked);
    return `
    <div class="page-head"><div><h2>Rate List</h2><p>${products.length} products</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase12.printRateList()">Print</button>
    </div>
    <div class="stitch panel" id="rateListPrint">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-family:var(--serif);font-size:20px;font-weight:800">Kissan Fertilizer — Rate List</div>
        <div class="muted">${todayISO()} · Miro Khan Road, Kamber</div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>Product</th><th>Unit</th><th class="right">Sale rate</th><th class="right">Stock</th></tr></thead>
        <tbody>
          ${products
            .map((p, i) => {
              const st =
                typeof global.productEffectiveStock === 'function'
                  ? global.productEffectiveStock(p)
                  : p.stock || 0;
              return `<tr>
              <td>${i + 1}</td>
              <td style="font-weight:600">${p.name}</td>
              <td>${p.unit || ''}</td>
              <td class="right mono" style="font-weight:800">${fmt(p.salePrice)}</td>
              <td class="right mono">${st}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function printRateList() {
    const el = document.getElementById('rateListPrint');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>Rate List</title>
      <style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}.right{text-align:right}
      th{background:#f0ebe0}</style></head><body>${el.innerHTML}
      <script>window.onload=function(){window.print()}<\/script></body></html>`
    );
    win.document.close();
  }

  /* ---------- Cheque book ---------- */
  function getCheques() {
    try {
      return JSON.parse(localStorage.getItem(CHQ_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setCheques(arr) {
    localStorage.setItem(CHQ_KEY, JSON.stringify(arr));
  }

  function pageChequeBook() {
    const list = getCheques().slice().reverse();
    return `
    <div class="page-head"><div><h2>Cheque Book</h2><p>Issued / received cheques</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase12.openChequeModal()">+ Cheque</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Dir</th><th>Cheque #</th><th>Bank</th><th>Party</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (c) => `<tr>
            <td class="mono">${c.date}</td>
            <td>${c.dir}</td>
            <td class="mono">${c.number || ''}</td>
            <td>${c.bank || ''}</td>
            <td>${c.party || ''}</td>
            <td class="right mono">${fmt(c.amount)}</td>
            <td><span class="stamp ${c.status === 'Cleared' ? 'ok' : c.status === 'Bounced' ? 'bad' : 'warn'}">${c.status}</span></td>
            <td class="right">
              <button class="btn btn-outline btn-sm" onclick="window.KissanPhase12.setChequeStatus('${c.id}','Cleared')">Clear</button>
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase12.delCheque('${c.id}')">Del</button>
            </td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="8">No cheques.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function openChequeModal() {
    global.openModal(
      'Cheque entry',
      `<div class="grid2">
        <div class="field"><label>Direction</label>
          <select id="cqDir"><option>Received</option><option>Issued</option></select>
        </div>
        <div class="field"><label>Date</label><input type="date" id="cqDate" value="${todayISO()}"></div>
        <div class="field"><label>Cheque number</label><input type="text" id="cqNo"></div>
        <div class="field"><label>Bank</label><input type="text" id="cqBank"></div>
        <div class="field"><label>Party</label><input type="text" id="cqParty"></div>
        <div class="field"><label>Amount</label><input type="number" id="cqAmt" step="0.01"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase12.saveCheque()">Save</button>`
    );
  }

  function saveCheque() {
    const amount = Number(document.getElementById('cqAmt')?.value) || 0;
    if (amount <= 0) {
      toast('Amount required', 'error');
      return;
    }
    const list = getCheques();
    list.push({
      id: 'cq_' + Date.now(),
      dir: document.getElementById('cqDir')?.value || 'Received',
      date: document.getElementById('cqDate')?.value || todayISO(),
      number: document.getElementById('cqNo')?.value || '',
      bank: document.getElementById('cqBank')?.value || '',
      party: document.getElementById('cqParty')?.value || '',
      amount,
      status: 'Pending'
    });
    setCheques(list);
    global.closeModal();
    if (global.ACTIVE_PAGE === 'chequebook') global.goPage('chequebook');
  }

  function setChequeStatus(id, status) {
    const list = getCheques();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list[i].status = status;
      setCheques(list);
      if (global.ACTIVE_PAGE === 'chequebook') global.goPage('chequebook');
    }
  }

  function delCheque(id) {
    setCheques(getCheques().filter((x) => x.id !== id));
    if (global.ACTIVE_PAGE === 'chequebook') global.goPage('chequebook');
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase12 = {
    APP_VERSION,
    pageDayBook,
    pageTrialBalance,
    pageMsgTemplates,
    openTemplateModal,
    saveTemplate,
    delTemplate,
    pageRateList,
    printRateList,
    pageChequeBook,
    openChequeModal,
    saveCheque,
    setChequeStatus,
    delCheque
  };
})(window);


/* ==== phase13-cleanup.js ==== */
/**
 * Kissan Fertilizer — Phase 13
 * Cleanup + Global Search + Working Tools Hub
 * Removes dead weight from UX; keeps shop-critical features front.
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';

  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  /* ---------- Global search (products + parties + suppliers) ---------- */
  function pageSearch() {
    const q = (global._globalQ || '').trim().toLowerCase();
    const S = global.STATE || {};
    let products = [],
      parties = [],
      suppliers = [];
    if (q.length >= 1) {
      products = (S.products || [])
        .filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q)
        )
        .slice(0, 20);
      parties = (S.parties || [])
        .filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.phone || '').includes(q) ||
            (p.sifaNo || '').toLowerCase().includes(q)
        )
        .slice(0, 15);
      suppliers = (S.suppliers || [])
        .filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)
        )
        .slice(0, 10);
    }

    return `
    <div class="page-head"><div><h2>Search</h2><p>Products · Parties · Suppliers</p></div></div>
    <div class="stitch panel">
      <div class="field">
        <input type="search" id="gSearch" value="${(global._globalQ || '').replace(/"/g, '&quot;')}"
          placeholder="Type name, phone, SKU, barcode…"
          style="font-size:16px;padding:12px 14px"
          oninput="window._globalQ=this.value;goPage('search')"
          autofocus>
      </div>
    </div>
    ${
      !q
        ? '<p class="muted" style="padding:12px">2+ letters type karein…</p>'
        : `
    <div class="dash-grid">
      <div class="stitch panel">
        <div class="panel-head"><h3>Products (${products.length})</h3></div>
        ${
          products.length
            ? products
                .map((p) => {
                  const st =
                    typeof global.productEffectiveStock === 'function'
                      ? global.productEffectiveStock(p)
                      : p.stock || 0;
                  return `<div class="ledger-line">
            <span><b>${p.name}</b><br><span class="hint">Stock ${st} · ${typeof global.fmt === 'function' ? global.fmt(p.salePrice) : p.salePrice}</span></span>
            <button class="btn btn-outline btn-sm" onclick="crudModalOpen(CRUD_MODULES.products,'${p.id}')">Open</button>
          </div>`;
                })
                .join('')
            : '<p class="muted">None</p>'
        }
      </div>
      <div class="stitch panel">
        <div class="panel-head"><h3>Parties (${parties.length})</h3></div>
        ${
          parties.length
            ? parties
                .map((p) => {
                  const bal =
                    typeof global.partyBalance === 'function' ? global.partyBalance(p.id) : 0;
                  return `<div class="ledger-line">
            <span><b>${p.name}</b><br><span class="hint">${p.phone || ''} · Bal ${typeof global.fmt === 'function' ? global.fmt(bal) : bal}</span></span>
            <button class="btn btn-outline btn-sm" onclick="openLedger('party','${p.id}')">Ledger</button>
          </div>`;
                })
                .join('')
            : '<p class="muted">None</p>'
        }
      </div>
      <div class="stitch panel">
        <div class="panel-head"><h3>Suppliers (${suppliers.length})</h3></div>
        ${
          suppliers.length
            ? suppliers
                .map(
                  (p) => `<div class="ledger-line">
            <span><b>${p.name}</b><br><span class="hint">${p.phone || ''}</span></span>
            <button class="btn btn-outline btn-sm" onclick="openLedger('supplier','${p.id}')">Ledger</button>
          </div>`
                )
                .join('')
            : '<p class="muted">None</p>'
        }
      </div>
    </div>`
    }`;
  }

  /* ---------- Working tools hub (only solid features) ---------- */
  function pageToolsHub() {
    const groups = [
      {
        title: 'Daily shop',
        items: [
          { id: 'pos', label: 'POS Quick Sale' },
          { id: 'sales', label: 'Sales' },
          { id: 'purchases', label: 'Purchases' },
          { id: 'parties', label: 'All Party' },
          { id: 'daybook', label: 'Day Book' },
          { id: 'dailyclosing', label: 'Daily Closing' }
        ]
      },
      {
        title: 'Money due',
        items: [
          { id: 'outstanding', label: 'Outstanding' },
          { id: 'ageing', label: 'Ageing' },
          { id: 'bulkremind', label: 'WhatsApp Reminders' },
          { id: 'pdc', label: 'PDC Cheques' }
        ]
      },
      {
        title: 'Stock',
        items: [
          { id: 'products', label: 'Products' },
          { id: 'criticalstock', label: 'Critical Levels' },
          { id: 'batches', label: 'Batches' },
          { id: 'stockledger', label: 'Stock Ledger' },
          { id: 'barcode', label: 'Barcode / SKU' }
        ]
      },
      {
        title: 'Reports',
        items: [
          { id: 'profitability', label: 'Profitability' },
          { id: 'salesanalysis', label: 'Sales Analysis' },
          { id: 'cashflow', label: 'Cash Flow' },
          { id: 'summaries', label: 'Daily / Monthly' },
          { id: 'ratelist', label: 'Rate List Print' },
          { id: 'reports', label: 'Date-range Reports' }
        ]
      },
      {
        title: 'Setup & backup',
        items: [
          { id: 'backupcenter', label: 'Backup Center' },
          { id: 'financialyear', label: 'Financial Year' },
          { id: 'invoicesettings', label: 'Invoice Settings' },
          { id: 'appearance', label: 'Dark / Light' },
          { id: 'settings', label: 'Settings' }
        ]
      }
    ];

    return `
    <div class="page-head"><div><h2>Tools Hub</h2><p>Sirf working features · ${APP_VERSION}</p></div>
      <button class="btn btn-outline btn-sm" onclick="goPage('search')">🔍 Search</button>
    </div>
    <div class="dash-grid">
      ${groups
        .map(
          (g) => `
        <div class="stitch panel">
          <div class="panel-head"><h3>${g.title}</h3></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${g.items
              .map(
                (it) =>
                  `<button class="btn btn-outline btn-sm" onclick="goPage('${it.id}')">${it.label}</button>`
              )
              .join('')}
          </div>
        </div>`
        )
        .join('')}
    </div>
    <div class="stitch panel" style="margin-top:12px">
      <div class="panel-head"><h3>Hataaye gaye / kam-use (menu se)</h3></div>
      <p class="hint" style="margin:0">Interest estimate, Trial Balance (approx), Cost Centers, Tax % (sale pe apply nahi), Msg Templates, Cheque Book (PDC hai), Shortcuts page, Ratios, Statistics — clutter kam karne ke liye sidebar se hata diye. Code file mein reh sakta hai; zaroori ho to Settings se baad mein wapas la sakte ho.</p>
    </div>`;
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase13 = {
    APP_VERSION,
    pageSearch,
    pageToolsHub
  };
})(window);


/* ==== phase14-health.js ==== */
/**
 * Kissan Fertilizer — Phase 14
 * - Module health (kaunsi phase load hui)
 * - Favorites (quick pins)
 * - Recent activity strip
 * - One-tap soft repair (stock sync + clear bad session page)
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const FAV_KEY = 'kissan_favorites';
  const ACT_KEY = 'kissan_recent_activity';

  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  function moduleList() {
    return [
      ['KissanPhase1', 'Language / rights / freeze'],
      ['KissanPhase2', 'Orders / settlement / price'],
      ['KissanPhase3', 'Inventory / batches / ledger'],
      ['KissanPhase4', 'Outstanding / ageing / SOA'],
      ['KissanPhase5', 'Reports / profitability'],
      ['KissanPhase6', 'Parties cards / block / merge'],
      ['KissanPhase7', 'POS / PDC / commission'],
      ['KissanPhase8', 'Bahi-khata ledger'],
      ['KissanPhase9', 'FY / backup / bulk remind'],
      ['KissanPhase10', 'Barcode / invoice / recurring'],
      ['KissanPhase11', 'Attendance / trips / dark'],
      ['KissanPhase12', 'Day book / rate list'],
      ['KissanPhase13', 'Search / tools hub'],
      ['KissanPhase14', 'Health / favorites']
    ];
  }

  function pageHealth() {
    const rows = moduleList().map(([name, desc]) => {
      const ok = !!(global[name] && typeof global[name] === 'object');
      return `<tr>
        <td class="mono" style="font-weight:700">${name}</td>
        <td>${desc}</td>
        <td>${ok ? '<span class="stamp ok">OK</span>' : '<span class="stamp bad">MISSING</span>'}</td>
      </tr>`;
    });
    const missing = moduleList().filter(([n]) => !global[n]).length;
    return `
    <div class="page-head"><div><h2>Module Health</h2><p>${APP_VERSION}</p></div>
      <button class="btn btn-primary btn-sm" onclick="location.reload()">Reload app</button>
    </div>
    <div class="stats">
      <div class="stitch stat ${missing ? 'red' : 'ok'}"><div class="lbl">Missing modules</div><div class="val">${missing}</div></div>
      <div class="stitch stat"><div class="lbl">Bundle</div><div class="val" style="font-size:14px">phases-bundle.js</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Module</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>
      ${
        missing
          ? `<p style="color:var(--danger);font-weight:700;margin-top:12px">phases-bundle.js GitHub root pe upload karo (index.html ke sath), phir Update now.</p>`
          : `<p class="hint" style="margin-top:12px">Sab modules load hain — pages kaam karne chahiye.</p>`
      }
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>Soft repair</h3></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="window.KissanPhase14.clearStuckPage()">Clear stuck page</button>
        <button class="btn btn-outline btn-sm" onclick="typeof repairAllProductStockSync==='function'&&repairAllProductStockSync().then(n=>toast('Stock repaired: '+(n||0),'success'))">Repair stock totals</button>
        <button class="btn btn-gold btn-sm" onclick="goPage('toolshub')">Tools Hub</button>
        <button class="btn btn-outline btn-sm" onclick="goPage('search')">Search</button>
      </div>
    </div>`;
  }

  function clearStuckPage() {
    try {
      sessionStorage.removeItem('kissan_active_page');
    } catch (e) {}
    if (typeof global.goPage === 'function') global.goPage('dashboard');
    toast('Back to Dashboard', 'success');
  }

  /* ---------- Favorites ---------- */
  function getFavs() {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setFavs(arr) {
    localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 12)));
  }
  function toggleFav(pageId) {
    let f = getFavs();
    if (f.includes(pageId)) f = f.filter((x) => x !== pageId);
    else f.push(pageId);
    setFavs(f);
    toast(f.includes(pageId) ? 'Pinned' : 'Unpinned', 'success');
    if (global.ACTIVE_PAGE === 'favorites') global.goPage('favorites');
  }
  function pageFavorites() {
    const f = getFavs();
    const labels = {
      sales: 'Sales',
      purchases: 'Purchases',
      parties: 'All Party',
      pos: 'POS',
      outstanding: 'Outstanding',
      products: 'Products',
      daybook: 'Day Book',
      dailyclosing: 'Daily Closing',
      bulkremind: 'Reminders',
      search: 'Search',
      toolshub: 'Tools Hub',
      health: 'Module Health'
    };
    return `
    <div class="page-head"><div><h2>Favorites</h2><p>Quick pins</p></div></div>
    <div class="stitch panel">
      ${
        f.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${f
              .map(
                (id) =>
                  `<button class="btn btn-primary btn-sm" onclick="goPage('${id}')">${labels[id] || id}</button>
             <button class="btn btn-outline btn-sm" onclick="window.KissanPhase14.toggleFav('${id}')">×</button>`
              )
              .join('')}</div>`
          : '<p class="muted">Abhi koi pin nahi. Neeche se add karo.</p>'
      }
      <hr style="border:none;border-top:1px dashed var(--line);margin:14px 0">
      <p class="hint">Add:</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${['sales', 'purchases', 'parties', 'pos', 'outstanding', 'products', 'daybook', 'dailyclosing', 'bulkremind', 'search']
          .map(
            (id) =>
              `<button class="btn btn-outline btn-sm" onclick="window.KissanPhase14.toggleFav('${id}')">${f.includes(id) ? '✓ ' : ''}${labels[id]}</button>`
          )
          .join('')}
      </div>
    </div>`;
  }

  /* ---------- Activity log (local) ---------- */
  function pushActivity(text) {
    try {
      const arr = JSON.parse(localStorage.getItem(ACT_KEY) || '[]');
      arr.unshift({ t: new Date().toISOString(), text: String(text || '').slice(0, 120) });
      localStorage.setItem(ACT_KEY, JSON.stringify(arr.slice(0, 40)));
    } catch (e) {}
  }
  function pageActivity() {
    let arr = [];
    try {
      arr = JSON.parse(localStorage.getItem(ACT_KEY) || '[]');
    } catch (e) {}
    return `
    <div class="page-head"><div><h2>Recent Activity</h2><p>This device</p></div>
      <button class="btn btn-outline btn-sm" onclick="localStorage.removeItem('${ACT_KEY}');goPage('activity')">Clear</button>
    </div>
    <div class="stitch panel">
      ${
        arr.length
          ? arr
              .map(
                (a) =>
                  `<div class="ledger-line"><span>${a.text}</span><span class="mono muted">${(a.t || '').replace('T', ' ').slice(0, 16)}</span></div>`
              )
              .join('')
          : '<p class="muted">No local activity yet.</p>'
      }
    </div>`;
  }

  // Hook goPage lightly
  const _origGo = global.goPage;
  if (typeof _origGo === 'function' && !global.__phase14GoHooked) {
    global.__phase14GoHooked = true;
    global.goPage = function (page) {
      try {
        pushActivity('Open: ' + page);
      } catch (e) {}
      return _origGo.apply(this, arguments);
    };
  }

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase14 = {
    APP_VERSION,
    pageHealth,
    clearStuckPage,
    pageFavorites,
    toggleFav,
    getFavs,
    pageActivity,
    pushActivity
  };
})(window);


/* ==== phase15-cart.js ==== */
/**
 * Kissan Fertilizer — Phase 15 Cart Sale (final build)
 * Reliable add-to-cart, form meta persist, stock checks, unified version
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v83-final';
  const CART_KEY = 'kissan_sale_cart';
  const CART_META_KEY = 'kissan_sale_cart_meta';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }
  function toast(m, t) {
    if (typeof global.toast === 'function') global.toast(m, t || 'info');
  }

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY) || sessionStorage.getItem(CART_KEY) || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function setCart(arr) {
    const json = JSON.stringify(arr || []);
    try { localStorage.setItem(CART_KEY, json); } catch (e) {}
    try { sessionStorage.setItem(CART_KEY, json); } catch (e) {}
  }

  function getMeta() {
    try {
      return Object.assign(
        { partyId: '', payMode: 'Cash', godamId: '', date: todayISO() },
        JSON.parse(localStorage.getItem(CART_META_KEY) || '{}')
      );
    } catch (e) {
      return { partyId: '', payMode: 'Cash', godamId: '', date: todayISO() };
    }
  }
  function saveMetaFromDom() {
    const meta = {
      partyId: (document.getElementById('cartParty') && document.getElementById('cartParty').value) || '',
      payMode: (document.getElementById('cartPay') && document.getElementById('cartPay').value) || 'Cash',
      godamId: (document.getElementById('cartGodam') && document.getElementById('cartGodam').value) || '',
      date: (document.getElementById('cartDate') && document.getElementById('cartDate').value) || todayISO()
    };
    try { localStorage.setItem(CART_META_KEY, JSON.stringify(meta)); } catch (e) {}
    return meta;
  }

  function cartTotal() {
    return getCart().reduce(function (a, l) {
      return a + Number(l.qty || 0) * Number(l.rate || 0);
    }, 0);
  }

  function pageCartSale() {
    var cart = getCart();
    var meta = getMeta();
    var products = ((global.STATE && global.STATE.products) || []).filter(function (p) { return !p.blocked; });
    var parties = ((global.STATE && global.STATE.parties) || []).filter(function (p) { return !p.blocked; });
    var partyOpts = parties.map(function (p) {
      return '<option value="' + p.id + '"' + (meta.partyId === p.id ? ' selected' : '') + '>' + p.name + '</option>';
    }).join('');
    var prodOpts = products.map(function (p) {
      var st = typeof global.productEffectiveStock === 'function'
        ? global.productEffectiveStock(p)
        : Number(p.stock || 0);
      var rate = Number(p.salePrice != null ? p.salePrice : (p.rate || 0));
      return '<option value="' + p.id + '" data-rate="' + rate + '" data-stock="' + st + '">' +
        p.name + ' (stk ' + st + ')</option>';
    }).join('');
    var gOpts = typeof global.godamOptionsHtml === 'function'
      ? global.godamOptionsHtml(meta.godamId || '', false)
      : '<option value="">—</option>';
    if (!gOpts) gOpts = '<option value="">—</option>';

    var rows = cart.length
      ? cart.map(function (l, i) {
          return '<tr><td>' + (l.productName || '—') + '</td>' +
            '<td class="right mono">' + l.qty + '</td>' +
            '<td class="right mono">' + fmt(l.rate) + '</td>' +
            '<td class="right mono" style="font-weight:700">' + fmt(Number(l.qty) * Number(l.rate)) + '</td>' +
            '<td class="right"><button type="button" class="btn btn-danger btn-sm" onclick="window.KissanPhase15.removeLine(' + i + ')">×</button></td></tr>';
        }).join('')
      : '<tr class="empty-row"><td colspan="5">Cart khali — neeche product add karo</td></tr>';

    var payOpts = ['Cash', 'Bank', 'Credit'].map(function (m) {
      return '<option value="' + m + '"' + (meta.payMode === m ? ' selected' : '') + '>' + m + '</option>';
    }).join('');

    return (
      '<div class="page-head"><div><h2>🛒 Multi-item Cart Sale</h2>' +
      '<p>Kai items → Save all · ' + APP_VERSION + '</p></div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="window.KissanPhase15.clearCart()">Clear cart</button></div>' +
      '<div class="stitch panel"><div class="grid2">' +
      '<div class="field"><label>Customer</label><select id="cartParty" onchange="window.KissanPhase15.saveMetaFromDom()">' +
      '<option value="">Walk-in</option>' + partyOpts + '</select></div>' +
      '<div class="field"><label>Pay mode</label><select id="cartPay" onchange="window.KissanPhase15.saveMetaFromDom()">' +
      payOpts + '</select></div>' +
      '<div class="field"><label>Godam</label><select id="cartGodam" onchange="window.KissanPhase15.saveMetaFromDom()">' +
      gOpts + '</select></div>' +
      '<div class="field"><label>Date</label><input type="date" id="cartDate" value="' +
      (meta.date || todayISO()) + '" onchange="window.KissanPhase15.saveMetaFromDom()"></div>' +
      '</div></div>' +
      '<div class="stitch panel"><div class="panel-head"><h3>Add line</h3></div><div class="grid2">' +
      '<div class="field" style="grid-column:1/-1"><label>Product *</label>' +
      '<select id="cartProduct" onchange="window.KissanPhase15.onPick()">' +
      '<option value="">— Select product —</option>' + prodOpts + '</select></div>' +
      '<div class="field"><label>Qty *</label><input type="number" id="cartQty" value="1" min="0.01" step="any" inputmode="decimal"></div>' +
      '<div class="field"><label>Rate *</label><input type="number" id="cartRate" step="0.01" inputmode="decimal" placeholder="Sale rate"></div>' +
      '</div><button type="button" class="btn btn-gold" style="margin-top:12px;padding:12px 20px;font-size:14px" ' +
      'onclick="window.KissanPhase15.addLine()">+ Add to cart</button>' +
      '<p class="hint" style="margin-top:8px">Product → rate auto → Qty → Add → Save all</p></div>' +
      '<div class="stitch panel"><div class="panel-head"><h3>Cart (' + cart.length + ')</h3>' +
      '<span class="mono" style="font-weight:800">' + fmt(cartTotal()) + '</span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="right">Qty</th>' +
      '<th class="right">Rate</th><th class="right">Amount</th><th></th></tr></thead><tbody>' + rows +
      '</tbody></table></div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" style="flex:1;min-width:160px;padding:14px" ' +
      'onclick="window.KissanPhase15.saveCart()"' + (cart.length ? '' : ' disabled') +
      '>Save all sales (' + cart.length + ')</button></div>' +
      '<p class="hint" style="margin-top:10px">Har line alag sale + stock. Credit = udhaar.</p></div>'
    );
  }

  function onPick() {
    try {
      var sel = document.getElementById('cartProduct');
      var o = sel && sel.selectedOptions && sel.selectedOptions[0];
      var rateEl = document.getElementById('cartRate');
      if (o && rateEl) {
        var r = o.getAttribute('data-rate');
        if (r !== null && r !== '' && !isNaN(Number(r))) rateEl.value = Number(r);
      }
    } catch (e) {}
  }

  function addLine() {
    try {
      saveMetaFromDom();
      var productId = ((document.getElementById('cartProduct') && document.getElementById('cartProduct').value) || '').trim();
      var qty = Number(document.getElementById('cartQty') && document.getElementById('cartQty').value);
      var rate = Number(document.getElementById('cartRate') && document.getElementById('cartRate').value);

      if (!productId) { toast('Pehle product select karein', 'error'); return; }
      if (!isFinite(qty) || qty <= 0) { toast('Qty sahi likho (0 se zyada)', 'error'); return; }

      var product = ((global.STATE && global.STATE.products) || []).find(function (p) { return p.id === productId; });
      if (!product) { toast('Product nahi mila', 'error'); return; }

      if (!isFinite(rate) || rate <= 0) {
        rate = Number(product.salePrice != null ? product.salePrice : (product.rate || 0));
        var re = document.getElementById('cartRate');
        if (re && rate > 0) re.value = rate;
      }
      if (!isFinite(rate) || rate <= 0) { toast('Rate likho (sale price 0 hai)', 'error'); return; }

      if (global.KissanPhase6 && typeof global.KissanPhase6.assertNotBlocked === 'function') {
        if (!global.KissanPhase6.assertNotBlocked('products', productId, 'Product')) return;
      }

      var stock = typeof global.productEffectiveStock === 'function'
        ? Number(global.productEffectiveStock(product))
        : Number(product.stock || 0);
      var already = getCart().filter(function (l) { return l.productId === productId; })
        .reduce(function (a, l) { return a + Number(l.qty || 0); }, 0);

      if (qty + already > stock + 1e-9) {
        var msg = 'Stock kam — available ' + stock + ', cart mein ' + already;
        var block = true;
        try {
          if (global.KissanPhase1 && global.KissanPhase1.getAlarms) {
            var a = global.KissanPhase1.getAlarms();
            if (a && a.negStock === false) block = false;
          }
        } catch (e) {}
        if (block) { toast(msg, 'error'); return; }
        toast(msg + ' — warning', 'info');
      }

      var cart = getCart();
      var same = -1;
      for (var i = 0; i < cart.length; i++) {
        if (cart[i].productId === productId && Number(cart[i].rate) === Number(rate)) { same = i; break; }
      }
      if (same >= 0) cart[same].qty = Number(cart[same].qty) + qty;
      else cart.push({ productId: productId, productName: product.name, qty: qty, rate: rate, unit: product.unit || '' });
      setCart(cart);
      toast('Cart mein add ho gaya ✓', 'success');

      var qe = document.getElementById('cartQty'); if (qe) qe.value = '1';
      var pe = document.getElementById('cartProduct'); if (pe) pe.value = '';
      var re2 = document.getElementById('cartRate'); if (re2) re2.value = '';

      if (global.ACTIVE_PAGE === 'cartsale' && typeof global.goPage === 'function') global.goPage('cartsale');
    } catch (e) {
      console.error('addLine', e);
      toast('Add failed: ' + (e.message || e), 'error');
    }
  }

  function removeLine(i) {
    var cart = getCart();
    cart.splice(i, 1);
    setCart(cart);
    if (global.ACTIVE_PAGE === 'cartsale' && typeof global.goPage === 'function') global.goPage('cartsale');
  }

  function clearCart() {
    setCart([]);
    try { localStorage.removeItem(CART_META_KEY); } catch (e) {}
    if (global.ACTIVE_PAGE === 'cartsale' && typeof global.goPage === 'function') global.goPage('cartsale');
    toast('Cart clear', 'success');
  }

  async function saveCart() {
    var cart = getCart();
    if (!cart.length) { toast('Cart empty', 'error'); return; }
    if (window._saveLocks && window._saveLocks.cart) { toast('Wait…', 'info'); return; }
    window._saveLocks = window._saveLocks || {};
    window._saveLocks.cart = true;

    saveMetaFromDom();
    var partyId = (document.getElementById('cartParty') && document.getElementById('cartParty').value) || '';
    var payMode = (document.getElementById('cartPay') && document.getElementById('cartPay').value) || 'Cash';
    var godamId = (document.getElementById('cartGodam') && document.getElementById('cartGodam').value) || '';
    var date = (document.getElementById('cartDate') && document.getElementById('cartDate').value) || todayISO();

    if (global.KissanPhase1 && !global.KissanPhase1.assertNotFrozen(date)) {
      window._saveLocks.cart = false; return;
    }
    if (partyId && global.KissanPhase6 && !global.KissanPhase6.assertNotBlocked('parties', partyId, 'Party')) {
      window._saveLocks.cart = false; return;
    }

    var party = partyId
      ? ((global.STATE && global.STATE.parties) || []).find(function (p) { return p.id === partyId; })
      : null;
    var grand = cartTotal();
    if (partyId && payMode === 'Credit' && global.KissanPhase4 && global.KissanPhase4.checkCreditLimit) {
      var lim = global.KissanPhase4.checkCreditLimit(partyId, grand);
      if (!lim.ok) { toast(lim.message, 'error'); window._saveLocks.cart = false; return; }
    }

    if (!global.__phase3AddDoc) {
      toast('Save bridge missing — Update now karein', 'error');
      window._saveLocks.cart = false; return;
    }

    var ok = 0;
    try {
      for (var li = 0; li < cart.length; li++) {
        var line = cart[li];
        var total = Number(line.qty) * Number(line.rate);
        var docNo = typeof global.nextDocNo === 'function'
          ? global.nextDocNo('sales')
          : 'C-' + Date.now() + '-' + ok;
        var payload = {
          docNo: docNo,
          productId: line.productId,
          productName: line.productName,
          isGeneric: false,
          partyId: (party && party.id) || '',
          partyName: (party && party.name) || 'Walk-in',
          qty: Number(line.qty),
          rate: Number(line.rate),
          subtotal: total,
          discountPercent: 0,
          discountAmount: 0,
          total: total,
          payMode: payMode === 'Credit' ? 'Credit' : payMode,
          payCash: payMode === 'Cash' ? total : 0,
          payBank: payMode === 'Bank' ? total : 0,
          payAdvance: 0,
          payCredit: payMode === 'Credit' ? total : 0,
          date: date,
          godamId: godamId || '',
          holdStock: false,
          atLocal: new Date().toISOString(),
          source: 'Cart'
        };
        var id = await global.__phase3AddDoc('sales', payload);
        if (global.STATE) {
          var copy = Object.assign({ id: id }, payload);
          global.STATE.sales = [copy].concat(global.STATE.sales || []);
        }
        if (typeof global.adjustProductStock === 'function') {
          await global.adjustProductStock(line.productId, -Number(line.qty), godamId || undefined);
        }
        if (global.KissanPhase3 && global.KissanPhase3.recordStockMove) {
          await global.KissanPhase3.recordStockMove({
            productId: line.productId,
            productName: line.productName,
            qty: -Number(line.qty),
            type: 'Sale',
            refDoc: docNo,
            godamId: godamId,
            date: date
          });
        }
        ok++;
      }
      setCart([]);
      toast(ok + ' sale(s) saved · ' + fmt(grand), 'success');
      if (typeof global.logAudit === 'function') {
        await global.logAudit('Cart Sale', ok + ' lines · ' + ((party && party.name) || 'Walk-in') + ' · ' + grand);
      }
      if (global.ACTIVE_PAGE === 'cartsale' && typeof global.goPage === 'function') global.goPage('cartsale');
    } catch (e) {
      toast('Cart save failed after ' + ok + ': ' + (e.message || e), 'error');
    } finally {
      window._saveLocks.cart = false;
    }
  }

  // Unified build id — last module wins; stops false version banners
  global.KISSAN_BUILD = APP_VERSION;
  try { localStorage.setItem('kissan_app_version', APP_VERSION); } catch (e) {}
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase15 = {
    APP_VERSION: APP_VERSION,
    pageCartSale: pageCartSale,
    onPick: onPick,
    addLine: addLine,
    removeLine: removeLine,
    clearCart: clearCart,
    saveCart: saveCart,
    getCart: getCart,
    cartTotal: cartTotal,
    saveMetaFromDom: saveMetaFromDom
  };

  console.log('🛒 KissanPhase15 cart ready', APP_VERSION);
})(window);
