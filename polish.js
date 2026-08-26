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

  const APP_VERSION = 'v70-phase10';
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
