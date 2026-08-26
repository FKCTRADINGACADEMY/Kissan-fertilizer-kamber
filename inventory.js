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
