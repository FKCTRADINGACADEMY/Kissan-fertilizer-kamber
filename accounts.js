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

  const APP_VERSION = 'v64-phase4';
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
    // Also compare meta version in localStorage
    const prev = localStorage.getItem('kissan_app_version');
    if (prev && prev !== APP_VERSION) {
      showUpdateBanner(true);
    }
    localStorage.setItem('kissan_app_version', APP_VERSION);
  }

  function showUpdateBanner(forceReload) {
    if (document.getElementById('kissanUpdateBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'kissanUpdateBanner';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:10000;background:#0f3d24;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:13.5px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.2)';
    bar.innerHTML = `
      <span>🆕 New app version available (${APP_VERSION})</span>
      <button type="button" style="background:#d4a017;color:#1a2218;border:none;padding:8px 16px;border-radius:8px;font-weight:800;cursor:pointer"
        onclick="window.KissanPhase4.applyUpdate()">Update now</button>
      <button type="button" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:8px 12px;border-radius:8px;cursor:pointer"
        onclick="this.parentElement.remove()">Later</button>`;
    document.body.appendChild(bar);
    if (forceReload) {
      // auto soft hint only
    }
  }

  async function applyUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        // Clear caches for shell
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      }
    } catch (e) {}
    localStorage.setItem('kissan_app_version', APP_VERSION);
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
