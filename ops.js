/**
 * Kissan Fertilizer — Phase 11
 * - Staff attendance
 * - Transport / trip sheet
 * - GST / tax on sales (optional %)
 * - Dark mode
 * - Sync / online status chip
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v71-phase11';
  const ATT_KEY = 'kissan_attendance';
  const TRIP_KEY = 'kissan_trips';
  const TAX_KEY = 'kissan_default_tax';
  const THEME_KEY = 'kissan_theme';

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

  /* ---------- Attendance ---------- */
  function getAttendance() {
    try {
      return JSON.parse(localStorage.getItem(ATT_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setAttendance(arr) {
    localStorage.setItem(ATT_KEY, JSON.stringify(arr));
  }

  function pageAttendance() {
    const date = global._attDate || todayISO();
    const users = ((global.STATE && global.STATE.users) || []).filter((u) => u.name || u.email);
    const staffNames = users.map((u) => u.name || u.email);
    // Also allow free names from payroll
    ((global.STATE && global.STATE.payroll) || []).forEach((p) => {
      if (p.staffName && !staffNames.includes(p.staffName)) staffNames.push(p.staffName);
    });
    const dayRows = getAttendance().filter((a) => a.date === date);
    const byName = {};
    dayRows.forEach((a) => {
      byName[a.name] = a;
    });

    return `
    <div class="page-head"><div><h2>Staff Attendance</h2><p>${date}</p></div>
      <div class="toolbar">
        <input type="date" id="attDate" value="${date}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px"
          onchange="window._attDate=this.value;goPage('attendance')">
        <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.markAllPresent()">All Present</button>
      </div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Staff</th><th>Status</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${
            staffNames.length
              ? staffNames
                  .map((name) => {
                    const row = byName[name];
                    const st = row?.status || '—';
                    return `<tr>
              <td style="font-weight:600">${name}</td>
              <td><span class="stamp ${st === 'Present' ? 'ok' : st === 'Absent' ? 'bad' : st === 'Leave' ? 'warn' : 'mute'}">${st}</span></td>
              <td class="muted">${row?.note || ''}</td>
              <td class="right row-actions">
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Present')">P</button>
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Absent')">A</button>
                <button class="btn btn-outline btn-sm" onclick="window.KissanPhase11.setAtt('${name.replace(/'/g, "\\'")}','Leave')">L</button>
              </td>
            </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="4">Staff Users / Payroll se names aate hain.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function setAtt(name, status) {
    const date = global._attDate || todayISO();
    const list = getAttendance().filter((a) => !(a.date === date && a.name === name));
    list.push({ id: 'att_' + Date.now(), date, name, status, note: '', at: new Date().toISOString() });
    setAttendance(list);
    if (global.ACTIVE_PAGE === 'attendance') global.goPage('attendance');
  }

  function markAllPresent() {
    const users = ((global.STATE && global.STATE.users) || []).map((u) => u.name || u.email).filter(Boolean);
    users.forEach((n) => setAtt(n, 'Present'));
    toast('All marked Present', 'success');
  }

  /* ---------- Transport trips ---------- */
  function getTrips() {
    try {
      return JSON.parse(localStorage.getItem(TRIP_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function setTrips(arr) {
    localStorage.setItem(TRIP_KEY, JSON.stringify(arr));
  }

  function pageTrips() {
    const list = getTrips().slice().reverse();
    return `
    <div class="page-head"><div><h2>Transport / Trips</h2><p>Delivery vehicle sheet</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.openTripModal()">+ Trip</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Route</th><th class="right">Expense</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (t) => `<tr>
            <td class="mono">${t.date || ''}</td>
            <td>${t.vehicle || '—'}</td>
            <td>${t.driver || '—'}</td>
            <td>${t.route || '—'}</td>
            <td class="right mono">${fmt(t.expense)}</td>
            <td class="muted">${t.note || ''}</td>
            <td class="right">
              <button class="btn btn-gold btn-sm" onclick="window.KissanPhase11.postTripExpense('${t.id}')">→ Expense</button>
              <button class="btn btn-danger btn-sm" onclick="window.KissanPhase11.delTrip('${t.id}')">Del</button>
            </td>
          </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No trips.</td></tr>`
          }
        </tbody>
      </table></div>
    </div>`;
  }

  function openTripModal() {
    global.openModal(
      'New Trip',
      `<div class="grid2">
        <div class="field"><label>Date</label><input type="date" id="trDate" value="${todayISO()}"></div>
        <div class="field"><label>Vehicle</label><input type="text" id="trVeh" placeholder="e.g. Mazda / Loader"></div>
        <div class="field"><label>Driver</label><input type="text" id="trDrv"></div>
        <div class="field"><label>Route / area</label><input type="text" id="trRoute"></div>
        <div class="field"><label>Expense (fuel etc.)</label><input type="number" id="trExp" step="0.01" value="0"></div>
        <div class="field"><label>Note</label><input type="text" id="trNote"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.KissanPhase11.saveTrip()">Save</button>`
    );
  }

  function saveTrip() {
    const list = getTrips();
    list.push({
      id: 'trip_' + Date.now(),
      date: document.getElementById('trDate')?.value || todayISO(),
      vehicle: document.getElementById('trVeh')?.value || '',
      driver: document.getElementById('trDrv')?.value || '',
      route: document.getElementById('trRoute')?.value || '',
      expense: Number(document.getElementById('trExp')?.value) || 0,
      note: document.getElementById('trNote')?.value || '',
      posted: false
    });
    setTrips(list);
    global.closeModal();
    toast('Trip saved', 'success');
    if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
  }

  async function postTripExpense(id) {
    const list = getTrips();
    const t = list.find((x) => x.id === id);
    if (!t || !t.expense) {
      toast('No expense amount', 'error');
      return;
    }
    if (t.posted) {
      toast('Already posted', 'info');
      return;
    }
    if (!global.__phase3AddDoc) return;
    try {
      await global.__phase3AddDoc('expenses', {
        category: 'Transport',
        amount: t.expense,
        date: t.date || todayISO(),
        note: `Trip ${t.vehicle || ''} ${t.route || ''} ${t.driver || ''}`.trim(),
        atLocal: new Date().toISOString()
      });
      t.posted = true;
      setTrips(list);
      toast('Expense posted', 'success');
      if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  function delTrip(id) {
    setTrips(getTrips().filter((x) => x.id !== id));
    if (global.ACTIVE_PAGE === 'trips') global.goPage('trips');
  }

  /* ---------- Tax / GST default ---------- */
  function getDefaultTax() {
    return Number(localStorage.getItem(TAX_KEY) || 0) || 0;
  }
  function setDefaultTax(n) {
    localStorage.setItem(TAX_KEY, String(Number(n) || 0));
  }

  function pageTaxSettings() {
    return `
    <div class="page-head"><div><h2>Tax / GST</h2><p>Default % on sales (optional)</p></div>
      <button class="btn btn-primary btn-sm" onclick="window.KissanPhase11.saveTax()">Save</button>
    </div>
    <div class="stitch panel">
      <div class="field"><label>Default tax %</label>
        <input type="number" id="taxPct" step="0.01" min="0" value="${getDefaultTax()}" style="max-width:140px">
      </div>
      <p class="hint">Sale modal pe tax field baad mein use ho sakta hai. Abhi default yahan store hota hai; amount = subtotal × %.</p>
      <p class="hint">Example: 18% GST → rate pe alag ya bill pe add — shop policy ke mutabiq.</p>
    </div>`;
  }
  function saveTax() {
    setDefaultTax(document.getElementById('taxPct')?.value);
    toast('Tax % saved', 'success');
  }

  /* ---------- Dark mode ---------- */
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    let style = document.getElementById('kissanDarkStyle');
    if (t === 'dark') {
      if (!style) {
        style = document.createElement('style');
        style.id = 'kissanDarkStyle';
        document.head.appendChild(style);
      }
      style.textContent = `
        html[data-theme="dark"] body,
        html[data-theme="dark"] #app{
          --paper:#1a1f1c; --ink:#e8efe6; --ink-faint:#9aab9a;
          --field:#3d7a52; --field-dark:#8fd4a8; --field-mid:#5a9a70;
          --line:#2e3832; --wheat:#c9a227; --danger:#f87171; --ok:#4ade80;
          background:#121612 !important; color:#e8efe6 !important;
        }
        html[data-theme="dark"] .stitch,
        html[data-theme="dark"] .panel,
        html[data-theme="dark"] .stat,
        html[data-theme="dark"] .modal-card{
          background:#1e2620 !important; border-color:#2e3832 !important; color:#e8efe6 !important;
        }
        html[data-theme="dark"] .tbl th{ background:#252d28 !important; color:#c5d4c5 !important; }
        html[data-theme="dark"] input, html[data-theme="dark"] select, html[data-theme="dark"] textarea{
          background:#151a16 !important; color:#e8efe6 !important; border-color:#3a453c !important;
        }
        html[data-theme="dark"] .sidebar{ background:#151a16 !important; }
        html[data-theme="dark"] .nav-item:hover, html[data-theme="dark"] .nav-item.active{
          background:#252d28 !important;
        }
      `;
    } else if (style) {
      style.textContent = '';
    }
  }

  function toggleDark() {
    const cur = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
    toast((localStorage.getItem(THEME_KEY) === 'dark' ? 'Dark' : 'Light') + ' mode', 'success');
  }

  function pageAppearance() {
    const cur = localStorage.getItem(THEME_KEY) || 'light';
    return `
    <div class="page-head"><div><h2>Appearance</h2><p>Theme</p></div></div>
    <div class="stitch panel">
      <p>Current: <b>${cur}</b></p>
      <button class="btn btn-primary" onclick="window.KissanPhase11.toggleDark()">Toggle Dark / Light</button>
    </div>`;
  }

  /* ---------- Online / sync chip ---------- */
  function ensureStatusChip() {
    if (document.getElementById('kissanSyncChip')) return;
    const chip = document.createElement('div');
    chip.id = 'kissanSyncChip';
    chip.style.cssText =
      'position:fixed;bottom:14px;right:14px;z-index:9998;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:default';
    document.body.appendChild(chip);
    function update() {
      const on = navigator.onLine;
      chip.textContent = on ? '● Online' : '● Offline';
      chip.style.background = on ? '#dcfce7' : '#fee2e2';
      chip.style.color = on ? '#166534' : '#991b1b';
    }
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }

  // boot
  function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    setTimeout(ensureStatusChip, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  localStorage.setItem('kissan_app_version', APP_VERSION);
  try {
    if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
  } catch (e) {}

  global.KissanPhase11 = {
    APP_VERSION,
    pageAttendance,
    setAtt,
    markAllPresent,
    pageTrips,
    openTripModal,
    saveTrip,
    postTripExpense,
    delTrip,
    pageTaxSettings,
    saveTax,
    getDefaultTax,
    toggleDark,
    pageAppearance,
    applyTheme
  };
})(window);
