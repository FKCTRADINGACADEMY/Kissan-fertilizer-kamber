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

  const APP_VERSION = 'v69-phase9';
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
