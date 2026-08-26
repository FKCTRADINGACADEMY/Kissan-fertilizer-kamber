/**
 * Kissan Fertilizer — Phase 13
 * Cleanup + Global Search + Working Tools Hub
 * Removes dead weight from UX; keeps shop-critical features front.
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v73-phase13';

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
