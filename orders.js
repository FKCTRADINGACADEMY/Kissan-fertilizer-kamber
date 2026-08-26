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
      const { updateDoc, doc, collection, addDoc, serverTimestamp } = await importFirestore
        'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js'
      );
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
