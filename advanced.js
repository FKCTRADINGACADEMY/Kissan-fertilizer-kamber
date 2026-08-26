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

  const APP_VERSION = 'v67-phase7';
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
