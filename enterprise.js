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

  const APP_VERSION = 'v66-phase6';
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
