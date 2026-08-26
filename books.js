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

  const APP_VERSION = 'v72-phase12';
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
