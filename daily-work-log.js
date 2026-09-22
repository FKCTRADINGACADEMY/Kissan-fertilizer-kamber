/* Kissan Fertilizer — Daily Work Log v1
 * ============================================================
 * Upload this file to repo root (same folder as index.html)
 * Then add ONE line in index.html (see bottom comment).
 *
 * Features:
 *  - Daily chronological activity list (sales, purchases, payments…)
 *  - Closing checklist (saved per date on this device)
 *  - CRM snapshot (top debtors, inactive parties, receivables)
 * ============================================================
 */
(function (global) {
  'use strict';

  const PAGE_ID = 'dailyworklog';
  const PAGE_TITLE = 'Daily Work Log';
  const PAGE_SUB = 'Aaj ki activities · closing checklist · CRM snapshot';
  const CHECK_KEY = 'kissan_dwl_checklist_';
  const NAV_LABEL = 'Daily Work Log';
  const NAV_ICON = '📋';

  const DEFAULT_CHECKS = [
    { id: 'open_cash', label: 'Opening cash counted & matched' },
    { id: 'sales_ok', label: 'All sales bills entered' },
    { id: 'purch_ok', label: 'All purchase invoices entered' },
    { id: 'payments_ok', label: 'Udhaar / wasool entries complete' },
    { id: 'expenses_ok', label: 'Expenses entered' },
    { id: 'stock_check', label: 'Critical stock physical check done' },
    { id: 'bank_ok', label: 'Bank deposit / transfer done (if any)' },
    { id: 'followups', label: 'Pending follow-ups noted' },
    { id: 'counter_match', label: 'Counter cash matched with system' },
    { id: 'day_locked', label: 'Day locked (Daily Closing)' }
  ];

  /* ---------- helpers (use app globals when available) ---------- */
  function todayISO() {
    if (typeof global.todayISO === 'function') return global.todayISO();
    return new Date().toISOString().slice(0, 10);
  }
  function normDate(d) {
    if (typeof global.normDate === 'function') return global.normDate(d);
    if (!d) return '';
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      const x = new Date(s);
      if (!isNaN(x)) return x.toISOString().slice(0, 10);
    } catch (e) {}
    return s.slice(0, 10);
  }
  function fmt(n) {
    if (typeof global.fmt === 'function') return global.fmt(n);
    return 'Rs. ' + Number(n || 0).toLocaleString('en-PK');
  }
  function getState() {
    return global.STATE || {};
  }
  function toast(msg, type) {
    if (typeof global.toast === 'function') global.toast(msg, type);
  }

  function getChecks(dateStr) {
    try {
      return JSON.parse(localStorage.getItem(CHECK_KEY + dateStr) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function setCheck(dateStr, id, checked) {
    const map = getChecks(dateStr);
    map[id] = !!checked;
    localStorage.setItem(CHECK_KEY + dateStr, JSON.stringify(map));
    renderIntoPage();
  }
  global.dwlSetCheck = setCheck;

  function buildActivities(dateStr) {
    const ST = getState();
    const d = normDate(dateStr) || todayISO();
    const items = [];
    const push = (time, type, detail, amount, who) => {
      items.push({
        time: time || d + 'T00:00:00',
        type: type,
        detail: detail || '—',
        amount: Number(amount) || 0,
        who: who || ''
      });
    };

    (ST.sales || [])
      .filter((s) => normDate(s.date) === d && !String(s.id || '').startsWith('_pending_'))
      .forEach((s) => {
        push(
          s.createdAt || s.atLocal || s.date,
          'Sale',
          (s.docNo || 'INV') +
            ' · ' +
            (s.customerName || s.partyName || 'Walk-in') +
            ' · ' +
            ((s.items && s.items.length) || 1) +
            ' item(s)',
          s.total,
          s.createdBy || s.user
        );
      });

    (ST.purchases || [])
      .filter((p) => normDate(p.date) === d)
      .forEach((p) => {
        push(
          p.createdAt || p.atLocal || p.date,
          'Purchase',
          (p.docNo || 'PUR') + ' · ' + (p.supplierName || 'Supplier'),
          p.total,
          p.createdBy || p.user
        );
      });

    (ST.payments || [])
      .filter((p) => normDate(p.date) === d)
      .forEach((p) => {
        const isParty = p.partyType === 'party';
        const dir = p.isGiven
          ? isParty
            ? 'Given to customer'
            : 'Paid to supplier'
          : isParty
            ? 'Wasool from customer'
            : 'Received from supplier';
        push(
          p.createdAt || p.atLocal || p.date,
          'Payment',
          dir + ' · ' + (p.partyName || p.supplierName || p.name || '—'),
          p.amount,
          p.createdBy || p.user
        );
      });

    (ST.expenses || [])
      .filter((e) => normDate(e.date) === d)
      .forEach((e) => {
        push(
          e.createdAt || e.atLocal || e.date,
          'Expense',
          e.category || e.note || e.title || 'Expense',
          e.amount,
          e.createdBy || e.user
        );
      });

    (ST.vouchers || [])
      .filter((v) => normDate(v.date) === d)
      .forEach((v) => {
        push(
          v.createdAt || v.atLocal || v.date,
          'Voucher ' + (v.type || ''),
          v.note || v.detail || 'Cash ' + (v.type || ''),
          v.amount,
          v.createdBy || v.user
        );
      });

    (ST.salesReturns || [])
      .filter((r) => normDate(r.date) === d)
      .forEach((r) => {
        push(
          r.createdAt || r.atLocal || r.date,
          'Sales Return',
          (r.docNo || 'SR') + ' · ' + (r.partyName || r.customerName || '—'),
          r.total,
          r.createdBy || r.user
        );
      });

    (ST.purchaseReturns || [])
      .filter((r) => normDate(r.date) === d)
      .forEach((r) => {
        push(
          r.createdAt || r.atLocal || r.date,
          'Purchase Return',
          (r.docNo || 'PR') + ' · ' + (r.supplierName || '—'),
          r.total,
          r.createdBy || r.user
        );
      });

    (ST.payroll || [])
      .filter((p) => normDate(p.date) === d)
      .forEach((p) => {
        push(
          p.createdAt || p.atLocal || p.date,
          'Payroll',
          (p.staffName || p.name || 'Staff') + ' · ' + (p.note || 'Salary/Advance'),
          p.amount,
          p.createdBy || p.user
        );
      });

    (ST.transportTrips || [])
      .filter((t) => normDate(t.date) === d)
      .forEach((t) => {
        push(
          t.createdAt || t.atLocal || t.date,
          'Transport',
          (t.vehicle || t.route || 'Trip') + (t.note ? ' · ' + t.note : ''),
          Number(t.expense || t.freightCharge || 0),
          t.createdBy || t.user
        );
      });

    (ST.stockMoves || [])
      .filter((m) => normDate(m.date || m.atLocal) === d)
      .forEach((m) => {
        const side = m.side === 'in' || m.type === 'in' ? 'In +' : 'Out −';
        push(
          m.createdAt || m.atLocal || m.date,
          'Stock',
          side + (m.qty || '') + ' · ' + (m.productName || m.name || ''),
          0,
          m.createdBy || m.user
        );
      });

    items.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    return items;
  }

  function crmSnapshot() {
    const ST = getState();
    const parties = ST.parties || [];
    const sales = ST.sales || [];
    const payments = ST.payments || [];
    const today = todayISO();
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    const d60 = new Date();
    d60.setDate(d60.getDate() - 60);
    const iso30 = d30.toISOString().slice(0, 10);
    const iso60 = d60.toISOString().slice(0, 10);

    const debtors = parties
      .map((p) => ({
        id: p.id,
        name: p.name || '—',
        phone: p.phone || '',
        bal: Number(p.balance || 0)
      }))
      .filter((p) => p.bal > 0)
      .sort((a, b) => b.bal - a.bal);

    const lastAct = {};
    sales.forEach((s) => {
      const id = s.customerId || s.partyId;
      if (!id) return;
      const nd = normDate(s.date);
      if (!lastAct[id] || nd > lastAct[id]) lastAct[id] = nd;
    });
    payments
      .filter((p) => p.partyType === 'party')
      .forEach((p) => {
        const id = p.partyId;
        if (!id) return;
        const nd = normDate(p.date);
        if (!lastAct[id] || nd > lastAct[id]) lastAct[id] = nd;
      });

    const inactive30 = parties.filter((p) => {
      const la = lastAct[p.id];
      return !la || la < iso30;
    }).length;
    const inactive60 = parties.filter((p) => {
      const la = lastAct[p.id];
      return !la || la < iso60;
    }).length;

    const salesToday = sales.filter((s) => normDate(s.date) === today);
    const newToday = salesToday.filter((s) => {
      const id = s.customerId || s.partyId;
      if (!id) return false;
      return !sales.some(
        (x) => (x.customerId || x.partyId) === id && normDate(x.date) < today
      );
    }).length;

    const suppliers = (ST.suppliers || [])
      .map((s) => ({ name: s.name || '—', bal: Number(s.balance || 0) }))
      .filter((s) => s.bal > 0)
      .sort((a, b) => b.bal - a.bal);

    return {
      totalParties: parties.length,
      totalReceivable: debtors.reduce((a, b) => a + b.bal, 0),
      topDebtors: debtors.slice(0, 8),
      inactive30,
      inactive60,
      newToday,
      totalPayable: suppliers.reduce((a, b) => a + b.bal, 0),
      topSuppliers: suppliers.slice(0, 5),
      salesTodayCount: salesToday.length,
      salesTodayAmt: salesToday.reduce((a, s) => a + Number(s.total || 0), 0)
    };
  }

  function pageDailyWorkLog() {
    const d =
      (global.DWL_VIEW_DATE && normDate(global.DWL_VIEW_DATE)) || todayISO();
    global.DWL_VIEW_DATE = d;

    const acts = buildActivities(d);
    const checks = getChecks(d);
    const crm = crmSnapshot();
    const ST = getState();

    let locked = null;
    try {
      if (typeof global.closingRecordFor === 'function') {
        locked = global.closingRecordFor(d);
      }
    } catch (e) {}

    const alerts = [];
    if (acts.filter((a) => a.type === 'Sale').length === 0) {
      alerts.push('⚠ Aaj koi sale entry nahi mili');
    }
    const lowStock = (ST.products || []).filter(
      (p) => Number(p.stock || 0) <= Number(p.minStock || 0)
    ).length;
    if (lowStock > 0) {
      alerts.push('⚠ ' + lowStock + ' critical / low stock item(s) — physical check karein');
    }
    if (crm.totalReceivable > 0) {
      alerts.push(
        'ℹ Total receivable: Rs. ' + crm.totalReceivable.toLocaleString('en-PK')
      );
    }
    if (!locked && d === todayISO()) {
      alerts.push(
        '🔒 Day abhi close nahi hua — closing se pehle checklist complete karein'
      );
    }

    const typeColor = {
      Sale: 'var(--ok)',
      Purchase: 'var(--wheat)',
      Payment: 'var(--info)',
      Expense: 'var(--danger)',
      'Sales Return': '#b45309',
      'Purchase Return': '#7c3aed',
      Payroll: '#0f766e',
      Transport: '#0369a1',
      Stock: '#64748b'
    };

    const actRows = acts.length
      ? acts
          .map((a) => {
            const t = (a.time || '').replace('T', ' ').slice(11, 16) || '—';
            const col = typeColor[a.type] || 'var(--ink-soft)';
            return (
              '<tr>' +
              '<td class="mono">' +
              t +
              '</td>' +
              '<td><span class="stamp" style="background:' +
              col +
              '22;color:' +
              col +
              ';font-weight:700">' +
              a.type +
              '</span></td>' +
              '<td style="white-space:normal;max-width:320px">' +
              a.detail +
              '</td>' +
              '<td class="mono" style="text-align:right">' +
              (a.amount
                ? 'Rs. ' + Number(a.amount).toLocaleString('en-PK')
                : '—') +
              '</td>' +
              '<td class="muted">' +
              ((a.who || '').split('@')[0] || '—') +
              '</td>' +
              '</tr>'
            );
          })
          .join('')
      : '<tr class="empty-row"><td colspan="5">Is din koi activity nahi mili.</td></tr>';

    const checkRows = DEFAULT_CHECKS.map((c) => {
      const done = !!checks[c.id];
      return (
        '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer">' +
        '<input type="checkbox" ' +
        (done ? 'checked' : '') +
        ' onchange="dwlSetCheck(\'' +
        d +
        '\',\'' +
        c.id +
        '\',this.checked)" style="width:18px;height:18px;accent-color:var(--field)">' +
        '<span style="' +
        (done ? 'text-decoration:line-through;opacity:.65' : '') +
        '">' +
        c.label +
        '</span></label>'
      );
    }).join('');

    const doneCount = DEFAULT_CHECKS.filter((c) => checks[c.id]).length;
    const pct = Math.round((doneCount / DEFAULT_CHECKS.length) * 100);

    const debtorRows = crm.topDebtors.length
      ? crm.topDebtors
          .map(
            (p) =>
              '<tr><td>' +
              p.name +
              '</td><td class="muted">' +
              (p.phone || '—') +
              '</td><td class="mono" style="text-align:right;color:var(--danger);font-weight:700">Rs. ' +
              p.bal.toLocaleString('en-PK') +
              '</td></tr>'
          )
          .join('')
      : '<tr class="empty-row"><td colspan="3">Koi receivable nahi.</td></tr>';

    return (
      '<div class="page-head">' +
      '<div><h2>Daily Work Log</h2><p>Aaj ki activities · closing checklist · CRM snapshot</p></div>' +
      '<div class="toolbar">' +
      '<input type="date" id="dwlDate" value="' +
      d +
      '" max="' +
      todayISO() +
      '" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">' +
      '<button class="btn btn-primary btn-sm" onclick="window.DWL_VIEW_DATE=document.getElementById(\'dwlDate\').value;window.goPage&&goPage(\'dailyworklog\')">Show</button>' +
      '<button class="btn btn-outline btn-sm" onclick="goPage(\'dailyclosing\')">🔒 Daily Closing</button>' +
      '<button class="btn btn-outline btn-sm" onclick="goPage(\'dailycallsheet\')">📞 Call Sheet</button>' +
      '</div></div>' +
      (alerts.length
        ? '<div class="stitch panel" style="border-left:4px solid var(--wheat);margin-bottom:16px"><div style="padding:4px 0">' +
          alerts
            .map(
              (a) =>
                '<div style="padding:4px 0;font-size:13px">' + a + '</div>'
            )
            .join('') +
          '</div></div>'
        : '') +
      '<div class="stats">' +
      '<div class="stitch stat"><div class="lbl">Activities today</div><div class="val">' +
      acts.length +
      '</div></div>' +
      '<div class="stitch stat ok"><div class="lbl">Sales today</div><div class="val">' +
      crm.salesTodayCount +
      '</div><div class="sub">Rs. ' +
      crm.salesTodayAmt.toLocaleString('en-PK') +
      '</div></div>' +
      '<div class="stitch stat"><div class="lbl">Checklist</div><div class="val">' +
      doneCount +
      '/' +
      DEFAULT_CHECKS.length +
      '</div><div class="sub">' +
      pct +
      '% complete</div></div>' +
      '<div class="stitch stat red"><div class="lbl">Total receivable</div><div class="val">Rs. ' +
      crm.totalReceivable.toLocaleString('en-PK') +
      '</div></div>' +
      '</div>' +
      '<div class="two-col" style="margin-bottom:16px">' +
      '<div class="stitch panel">' +
      '<div class="panel-head"><h3>Closing Checklist — ' +
      d +
      '</h3><span class="muted" style="font-size:12px">' +
      pct +
      '% done</span></div>' +
      '<div style="margin-bottom:10px;height:8px;background:var(--line);border-radius:6px;overflow:hidden">' +
      '<div style="height:100%;width:' +
      pct +
      '%;background:linear-gradient(90deg,var(--field),var(--ok));transition:width .3s"></div></div>' +
      checkRows +
      '<div style="padding:12px;margin-top:8px">' +
      '<button class="btn btn-gold btn-sm" onclick="goPage(\'dailyclosing\')">Day Close page kholen →</button>' +
      '</div></div>' +
      '<div class="stitch panel">' +
      '<div class="panel-head"><h3>CRM Snapshot</h3></div>' +
      '<div class="stats" style="grid-template-columns:1fr 1fr;margin-bottom:12px">' +
      '<div class="stitch stat"><div class="lbl">Total parties</div><div class="val">' +
      crm.totalParties +
      '</div></div>' +
      '<div class="stitch stat"><div class="lbl">New today</div><div class="val">' +
      crm.newToday +
      '</div></div>' +
      '<div class="stitch stat"><div class="lbl">Inactive 30d</div><div class="val">' +
      crm.inactive30 +
      '</div></div>' +
      '<div class="stitch stat"><div class="lbl">Inactive 60d</div><div class="val">' +
      crm.inactive60 +
      '</div></div>' +
      '</div>' +
      '<h4 style="font-size:13px;margin:8px 0 6px;color:var(--ink-soft)">Top debtors</h4>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Party</th><th>Phone</th><th style="text-align:right">Balance</th></tr></thead><tbody>' +
      debtorRows +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;font-size:12.5px;color:var(--ink-soft)">Supplier payables: <b style="color:var(--danger)">Rs. ' +
      crm.totalPayable.toLocaleString('en-PK') +
      '</b></div></div></div>' +
      '<div class="stitch panel">' +
      '<div class="panel-head"><h3>Today\'s Activities <span class="muted" style="font-weight:500;font-size:12px">(' +
      acts.length +
      ')</span></h3>' +
      '<button class="btn btn-outline btn-sm" onclick="window.KissanDailyWorkLog&&KissanDailyWorkLog.refresh()">Refresh</button>' +
      '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Type</th><th>Detail</th><th style="text-align:right">Amount</th><th>By</th></tr></thead><tbody>' +
      actRows +
      '</tbody></table></div></div>'
    );
  }

  function renderIntoPage() {
    const el = document.getElementById('pageContent');
    if (!el) return;
    try {
      el.innerHTML = pageDailyWorkLog();
      const ct = document.getElementById('crumbTitle');
      const cs = document.getElementById('crumbSub');
      if (ct) ct.textContent = PAGE_TITLE;
      if (cs) cs.textContent = PAGE_SUB;
      try {
        global.ACTIVE_PAGE = PAGE_ID;
      } catch (e) {}
    } catch (e) {
      console.error('DailyWorkLog render', e);
      el.innerHTML =
        '<div class="stitch panel"><h3>Daily Work Log error</h3><p>' +
        String(e.message || e) +
        '</p></div>';
    }
  }

  /* ---------- inject sidebar link under Team ---------- */
  function injectNavLink() {
    try {
      const nav = document.querySelector('.sidebar .nav') || document.querySelector('#sidebar .nav');
      if (!nav) return;
      if (nav.querySelector('[data-page="' + PAGE_ID + '"]')) return;

      // Prefer Team section (after Daily Call Sheet)
      const links = nav.querySelectorAll('a[data-page]');
      let insertAfter = null;
      links.forEach((a) => {
        if (a.getAttribute('data-page') === 'dailycallsheet') insertAfter = a;
      });
      if (!insertAfter) {
        links.forEach((a) => {
          if (a.getAttribute('data-page') === 'reminders') insertAfter = a;
        });
      }

      const a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-page', PAGE_ID);
      a.innerHTML = '<span class="ic">' + NAV_ICON + '</span>' + NAV_LABEL;
      a.onclick = function (e) {
        e.preventDefault();
        if (typeof global.goPage === 'function') global.goPage(PAGE_ID);
      };

      if (insertAfter && insertAfter.parentNode) {
        insertAfter.parentNode.insertBefore(a, insertAfter.nextSibling);
      } else {
        nav.appendChild(a);
      }
    } catch (e) {
      console.warn('DWL nav inject', e);
    }
  }

  /* ---------- hook goPage + softRefresh ---------- */
  function hookApp() {
    if (global.__dwlHooked) return;
    if (typeof global.goPage !== 'function') return;
    global.__dwlHooked = true;

    const origGo = global.goPage;
    global.goPage = function (page) {
      if (page === PAGE_ID) {
        try {
          global.ACTIVE_PAGE = PAGE_ID;
          if (typeof ACTIVE_PAGE !== 'undefined') {
            /* lexical ACTIVE_PAGE may exist in main script — best-effort */
          }
        } catch (e) {}
        try {
          sessionStorage.setItem('kissan_active_page', PAGE_ID);
        } catch (e) {}
        try {
          history.pushState({ kissanPage: PAGE_ID }, '', '#' + PAGE_ID);
        } catch (e) {}
        try {
          if (typeof global.renderNav === 'function') global.renderNav();
        } catch (e) {}
        injectNavLink();
        // mark active in sidebar
        try {
          document.querySelectorAll('.sidebar .nav a').forEach((el) => {
            el.classList.toggle(
              'active',
              el.getAttribute('data-page') === PAGE_ID
            );
          });
        } catch (e) {}
        renderIntoPage();
        try {
          global.closeSidebar && global.closeSidebar();
        } catch (e) {}
        return;
      }
      const ret = origGo.apply(this, arguments);
      // re-inject after other pages re-render nav
      setTimeout(injectNavLink, 50);
      return ret;
    };

    if (typeof global.softRefreshActivePage === 'function') {
      const origSoft = global.softRefreshActivePage;
      global.softRefreshActivePage = function () {
        if (
          global.ACTIVE_PAGE === PAGE_ID ||
          (typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem('kissan_active_page') === PAGE_ID)
        ) {
          renderIntoPage();
          return;
        }
        return origSoft.apply(this, arguments);
      };
    }

    injectNavLink();
    console.log('📋 Daily Work Log module loaded');
  }

  // Retry until app is ready
  let tries = 0;
  const timer = setInterval(function () {
    tries++;
    hookApp();
    injectNavLink();
    if (global.__dwlHooked && tries > 5) clearInterval(timer);
    if (tries > 80) clearInterval(timer);
  }, 250);

  global.KissanDailyWorkLog = {
    pageDailyWorkLog: pageDailyWorkLog,
    refresh: renderIntoPage,
    buildActivities: buildActivities,
    crmSnapshot: crmSnapshot,
    injectNavLink: injectNavLink
  };
  global.pageDailyWorkLog = pageDailyWorkLog;
})(window);

/*
 * ===================== INSTALL (1 step) =====================
 *
 * 1. Upload this file to GitHub repo root:
 *    https://github.com/FKCTRADINGACADEMY/Kissan-fertilizer-kamber
 *    (same folder as index.html)
 *
 * 2. index.html mein YE LINE add karein — ledger.js ke BAAD:
 *
 *    <script src="./daily-work-log.js?v=1"></script>
 *
 * 3. Commit + push. GitHub Pages auto deploy karega.
 *
 * Sidebar → Team section mein "Daily Work Log" dikhega.
 */
