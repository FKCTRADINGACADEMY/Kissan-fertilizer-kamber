/**
 * Kissan Fertilizer — Phase 1 Foundation
 * English (default) + Arabic Sindhi (سنڌي)
 * + Popup Calculator (F10)
 * + Warning Alarms (Negative Stock / Min-Max-Reorder)
 * + User Access Rights (menu-level)
 * + Data Freezing (up to a given date)
 *
 * Include this file BEFORE the main module script.
 */
(function (global) {
  'use strict';

  /* ============================================================
     LANGUAGE — English default + Arabic Sindhi
     ============================================================ */
  const LANG_KEY = 'kissan_lang';
  let currentLang = localStorage.getItem(LANG_KEY) || 'en';

  const T = {
    en: {
      // App chrome
      appName: 'Kissan Fertilizer',
      branch: 'Kamber Branch',
      signIn: 'Sign in',
      signOut: 'Sign out',
      email: 'Email',
      password: 'Password',
      synced: 'Synced',
      offline: 'Offline — saved locally',
      installApp: 'Install app',
      place: 'Miro Khan Road, Kamber',
      // Nav sections
      secOverview: 'Overview',
      secInventory: 'Inventory',
      secEstimates: 'Estimates & Orders',
      secTransactions: 'Transactions',
      secPeople: 'People',
      secRecords: 'Records',
      // Nav items
      dashboard: 'Dashboard',
      products: 'Products',
      godams: 'Godams / Locations',
      quotations: 'Quotations',
      salesOrders: 'Sales Orders',
      purchaseOrders: 'Purchase Orders',
      purchases: 'Purchases',
      sales: 'Sales',
      salesReturns: 'Sales Returns',
      purchaseReturns: 'Purchase Returns',
      vouchers: 'Cash Book',
      expenses: 'Expenses',
      parties: 'All Party',
      suppliers: 'Suppliers',
      payroll: 'Staff Payroll',
      dailycashmemo: 'Daily Cash Memo',
      dailybalance: 'Daily Balance Sheet',
      dailyclosing: 'Daily Closing',
      reports: 'Reports',
      users: 'Staff & Users',
      audit: 'Audit Log',
      settings: 'Settings',
      // Common
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search…',
      today: 'Today',
      total: 'Total',
      qty: 'Qty',
      rate: 'Rate',
      date: 'Date',
      note: 'Note',
      actions: 'Actions',
      noData: 'No records yet.',
      confirm: 'Confirm',
      success: 'Success',
      error: 'Error',
      // Phase 1
      language: 'Language',
      langEn: 'English',
      langSd: 'سنڌي',
      calculator: 'Calculator',
      calcHint: 'Press F10 anywhere to open. Result can be pasted into the focused field.',
      warningAlarms: 'Warning Alarms',
      warnNegStock: 'Warn / block on negative stock',
      warnNegCash: 'Warn on negative cash',
      warnReorder: 'Warn when stock hits reorder / low level',
      blockOnAlarm: 'Block save when alarm triggers',
      dataFreezing: 'Data Freezing',
      freezeUntil: 'Freeze all transactions up to date',
      freezeHint: 'Documents on or before this date cannot be edited or deleted (Owner can change freeze date).',
      accessRights: 'Access Rights',
      accessHint: 'Choose which menus each role can open. Owner always has full access.',
      roleOwner: 'Owner',
      roleManager: 'Manager',
      roleCashier: 'Cashier',
      roleHelper: 'Helper',
      frozenMsg: 'This date is frozen. Only Owner can change freeze settings.',
      alarmNegStock: 'Not enough stock — this would make stock negative.',
      alarmReorder: 'Stock is at or below reorder / low level.',
      alarmBlocked: 'Save blocked by warning alarm settings.',
      calcTitle: 'Calculator',
      calcPaste: 'Paste to field',
      calcClear: 'Clear',
      settingsLang: 'Language & Phase-1 tools',
      saveSettings: 'Save settings',
      settingsSaved: 'Settings saved',
    },
    sd: {
      // App chrome — Arabic Sindhi
      appName: 'ڪسان فرٽيلائزر',
      branch: 'قمبر برانچ',
      signIn: 'سائن ان',
      signOut: 'سائن آئوٽ',
      email: 'اي ميل',
      password: 'پاسورڊ',
      synced: 'سنڪ ٿيل',
      offline: 'آف لائن — مقامي محفوظ',
      installApp: 'ايپ انسٽال ڪريو',
      place: 'ميرو خان روڊ، قمبر',
      // Nav sections
      secOverview: 'جائزو',
      secInventory: 'اسٽاڪ',
      secEstimates: 'تخمينو ۽ آرڊر',
      secTransactions: 'لڻائن',
      secPeople: 'ماڻهو',
      secRecords: 'رڪارڊ',
      // Nav items
      dashboard: 'ڊيش بورڊ',
      products: 'شئيون',
      godams: 'گودام / جڳھون',
      quotations: 'ڪوٽيشن',
      salesOrders: 'وڪري جا آرڊر',
      purchaseOrders: 'خريد جا آرڊر',
      purchases: 'خريداريون',
      sales: 'وڪريون',
      salesReturns: 'وڪري واپسي',
      purchaseReturns: 'خريد واپسي',
      vouchers: 'کيش بڪ',
      expenses: 'خرچ',
      parties: 'سڀ پارٽي',
      suppliers: 'سپلائرز',
      payroll: 'اسٽاف پگهار',
      dailycashmemo: 'روزاني ڪيش ميمو',
      dailybalance: 'روزاني بيلنس شيٽ',
      dailyclosing: 'روزاني بندش',
      reports: 'رپورٽون',
      users: 'اسٽاف ۽ يوزر',
      audit: 'آڊٽ لاگ',
      settings: 'سيٽنگون',
      // Common
      save: 'محفوظ',
      cancel: 'منسوخ',
      delete: 'مٽايو',
      edit: 'تبديل',
      add: 'شامل',
      search: 'ڳوليو…',
      today: 'اڄ',
      total: 'ڪل',
      qty: 'مقدار',
      rate: 'ريٽ',
      date: 'تاريخ',
      note: 'نوٽ',
      actions: 'عمل',
      noData: 'اڃا ڪو رڪارڊ ناهي.',
      confirm: 'تصديق',
      success: 'ڪامياب',
      error: 'غلط',
      // Phase 1
      language: 'ٻولي',
      langEn: 'English',
      langSd: 'سنڌي',
      calculator: 'ڪيلڪيوليٽر',
      calcHint: 'ڪٿي به F10 دٻايو. نتيجو فوڪس ٿيل فيلڊ ۾ پيسٽ ٿي سگهي ٿو.',
      warningAlarms: 'خبردار الارم',
      warnNegStock: 'منفي اسٽاڪ تي خبردار / روڪ',
      warnNegCash: 'منفي ڪيش تي خبردار',
      warnReorder: 'ري آرڊر / گهٽ سطح تي خبردار',
      blockOnAlarm: 'الارم تي محفوظ ڪرڻ روڪيو',
      dataFreezing: 'ڊيٽا منجمد',
      freezeUntil: 'هن تاريخ تائين سڀ لڻائن منجمد',
      freezeHint: 'هن تاريخ يا ان کان اڳ وارا دستاويز تبديل يا مٽائي نه سگهجن (صرف مالڪ منجمد تاريخ بدلائي سگهي ٿو).',
      accessRights: 'رسائي جا حق',
      accessHint: 'هر ڪردار لاءِ مينيو چونڊيو. مالڪ کي هميشه مڪمل رسائي آهي.',
      roleOwner: 'مالڪ',
      roleManager: 'مينيجر',
      roleCashier: 'ڪيشئر',
      roleHelper: 'مددگار',
      frozenMsg: 'هي تاريخ منجمد آهي. صرف مالڪ سيٽنگون بدلائي سگهي ٿو.',
      alarmNegStock: 'اسٽاڪ گهٽ آهي — اسٽاڪ منفي ٿي ويندو.',
      alarmReorder: 'اسٽاڪ ري آرڊر / گهٽ سطح تي يا ان کان گهٽ آهي.',
      alarmBlocked: 'خبردار الارم سيٽنگن سبب محفوظ روڪيو ويو.',
      calcTitle: 'ڪيلڪيوليٽر',
      calcPaste: 'فيلڊ ۾ پيسٽ',
      calcClear: 'صاف',
      settingsLang: 'ٻولي ۽ فيز-١ اوزار',
      saveSettings: 'سيٽنگون محفوظ',
      settingsSaved: 'سيٽنگون محفوظ ٿي ويون',
    }
  };

  function t(key) {
    const pack = T[currentLang] || T.en;
    return pack[key] != null ? pack[key] : (T.en[key] != null ? T.en[key] : key);
  }

  function getLang() { return currentLang; }

  function setLang(code) {
    if (!T[code]) code = 'en';
    currentLang = code;
    localStorage.setItem(LANG_KEY, code);
    document.documentElement.lang = code === 'sd' ? 'sd' : 'en';
    document.documentElement.dir = 'ltr'; // keep LTR layout; Sindhi text still renders RTL glyphs
    applyStaticLang();
    if (typeof global.renderNav === 'function') global.renderNav();
    if (typeof global.goPage === 'function' && typeof global.ACTIVE_PAGE !== 'undefined') {
      try { global.goPage(global.ACTIVE_PAGE); } catch (e) {}
    }
    if (typeof global.toast === 'function') {
      global.toast(code === 'sd' ? 'ٻولي: سنڌي' : 'Language: English', 'success');
    }
  }

  function applyStaticLang() {
    const set = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.textContent = t(key);
    };
    set('loginBtnLabel', 'signIn');
    set('crumbTitle', (global.PAGE_META && global.ACTIVE_PAGE && global.PAGE_META[global.ACTIVE_PAGE])
      ? global.PAGE_META[global.ACTIVE_PAGE][0] : 'dashboard');
    // Login labels
    const emailLabel = document.querySelector('#loginScreen .field label');
    if (emailLabel) emailLabel.textContent = t('email');
    const passLabel = document.querySelectorAll('#loginScreen .field label')[1];
    if (passLabel) passLabel.textContent = t('password');
    const sub = document.querySelector('#loginScreen .sub');
    if (sub) sub.textContent = t('place') + ' — ledger & store manager';
    const h1 = document.querySelector('#loginScreen h1');
    if (h1) h1.textContent = t('appName');
    const syncLabel = document.getElementById('syncLabel');
    if (syncLabel) syncLabel.textContent = navigator.onLine ? t('synced') : t('offline');
    const place = document.querySelector('.badge-place');
    if (place) place.textContent = '📍 ' + t('place');
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) logoutBtn.textContent = t('signOut');
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
      const icon = installBtn.querySelector('i');
      installBtn.innerHTML = '';
      if (icon) installBtn.appendChild(icon);
      installBtn.appendChild(document.createTextNode(' ' + t('installApp')));
    }
  }

  /* ============================================================
     WARNING ALARMS
     ============================================================ */
  const ALARM_KEY = 'kissan_alarms';
  function getAlarms() {
    try {
      return Object.assign({
        negStock: true,
        negCash: false,
        reorder: true,
        block: false
      }, JSON.parse(localStorage.getItem(ALARM_KEY) || '{}'));
    } catch (e) {
      return { negStock: true, negCash: false, reorder: true, block: false };
    }
  }
  function setAlarms(obj) {
    localStorage.setItem(ALARM_KEY, JSON.stringify(obj));
  }

  /**
   * Check stock alarms before applying a negative delta (sale / issue).
   * @returns {{ ok:boolean, messages:string[] }}
   */
  function checkStockAlarms(product, qtyAfter) {
    const a = getAlarms();
    const messages = [];
    if (!product) return { ok: true, messages };
    const after = Number(qtyAfter);
    if (a.negStock && after < 0) {
      messages.push(t('alarmNegStock'));
    }
    const low = Number(product.lowStock || product.reorderLevel || 0);
    if (a.reorder && low > 0 && after <= low) {
      messages.push(t('alarmReorder') + ` (${product.name}: ${after})`);
    }
    if (messages.length && a.block) {
      return { ok: false, messages };
    }
    return { ok: true, messages };
  }

  /* ============================================================
     DATA FREEZING
     ============================================================ */
  const FREEZE_KEY = 'kissan_freeze_until';
  function getFreezeUntil() {
    return localStorage.getItem(FREEZE_KEY) || '';
  }
  function setFreezeUntil(dateStr) {
    if (!dateStr) localStorage.removeItem(FREEZE_KEY);
    else localStorage.setItem(FREEZE_KEY, dateStr);
  }
  function isDateFrozen(dateStr) {
    const until = getFreezeUntil();
    if (!until || !dateStr) return false;
    return String(dateStr).slice(0, 10) <= until;
  }
  function assertNotFrozen(dateStr) {
    if (isDateFrozen(dateStr) && !isOwner()) {
      if (typeof global.toast === 'function') global.toast(t('frozenMsg'), 'error');
      return false;
    }
    // Even owner is warned but allowed
    if (isDateFrozen(dateStr) && isOwner()) {
      // allow
    }
    if (isDateFrozen(dateStr) && !isOwner()) return false;
    return true;
  }

  /* ============================================================
     ACCESS RIGHTS (menu-level by role)
     ============================================================ */
  const RIGHTS_KEY = 'kissan_access_rights';
  const ALL_PAGES = [
    'dashboard', 'products', 'godams', 'quotations', 'salesOrders', 'purchaseOrders',
    'purchases', 'sales', 'salesReturns', 'purchaseReturns', 'vouchers', 'expenses',
    'parties', 'suppliers', 'payroll', 'dailycashmemo', 'dailybalance', 'dailyclosing',
    'reports', 'users', 'audit', 'settings'
  ];
  const DEFAULT_RIGHTS = {
    Owner: ALL_PAGES.slice(),
    Manager: ALL_PAGES.filter(p => p !== 'users' && p !== 'settings'),
    Cashier: ['dashboard', 'sales', 'salesReturns', 'parties', 'products', 'dailycashmemo', 'quotations', 'salesOrders'],
    Helper: ['dashboard', 'sales', 'products', 'parties']
  };

  function getRights() {
    try {
      const saved = JSON.parse(localStorage.getItem(RIGHTS_KEY) || 'null');
      if (saved) return Object.assign({}, DEFAULT_RIGHTS, saved);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_RIGHTS));
  }
  function setRights(obj) {
    localStorage.setItem(RIGHTS_KEY, JSON.stringify(obj));
  }

  function currentUserRole() {
    // Match staff directory by login email
    const email = (global.CURRENT_USER && global.CURRENT_USER.email) || '';
    const staff = (global.STATE && global.STATE.users) || [];
    const me = staff.find(u => (u.loginEmail || '').toLowerCase() === email.toLowerCase());
    if (me && me.role) return me.role;
    // Fallback: first signed-in user treated as Owner
    return 'Owner';
  }
  function isOwner() {
    return currentUserRole() === 'Owner';
  }
  function canAccess(pageId) {
    if (isOwner()) return true;
    const rights = getRights();
    const role = currentUserRole();
    const list = rights[role] || DEFAULT_RIGHTS[role] || [];
    return list.indexOf(pageId) !== -1;
  }

  /* ============================================================
     POPUP CALCULATOR (F10)
     ============================================================ */
  let calcExpr = '';
  let lastFocusedInput = null;

  function buildCalcHtml() {
    return `
      <div id="kissanCalc" class="kissan-calc" style="display:none">
        <div class="kissan-calc-head">
          <strong id="calcTitleLabel">${t('calcTitle')}</strong>
          <button type="button" class="modal-close" onclick="window.KissanPhase1.closeCalc()">✕</button>
        </div>
        <input type="text" id="calcDisplay" readonly value="0" class="kissan-calc-display">
        <div class="kissan-calc-keys">
          ${['C','←','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','=','P'].map(k =>
            `<button type="button" data-k="${k}" class="kissan-calc-key ${'/*+-='.includes(k)?'op':''} ${k==='P'?'paste':''}">${k==='P'?t('calcPaste'):k}</button>`
          ).join('')}
        </div>
        <p class="hint" style="margin:8px 4px 0">${t('calcHint')}</p>
      </div>`;
  }

  function ensureCalcDom() {
    if (document.getElementById('kissanCalc')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = buildCalcHtml();
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('kissanCalc').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-k]');
      if (!btn) return;
      onCalcKey(btn.getAttribute('data-k'));
    });
  }

  function openCalc() {
    ensureCalcDom();
    const el = document.getElementById('kissanCalc');
    const title = document.getElementById('calcTitleLabel');
    if (title) title.textContent = t('calcTitle');
    el.style.display = 'block';
    calcExpr = '';
    document.getElementById('calcDisplay').value = '0';
  }
  function closeCalc() {
    const el = document.getElementById('kissanCalc');
    if (el) el.style.display = 'none';
  }
  function onCalcKey(k) {
    const disp = document.getElementById('calcDisplay');
    if (k === 'C') { calcExpr = ''; disp.value = '0'; return; }
    if (k === '←') { calcExpr = calcExpr.slice(0, -1); disp.value = calcExpr || '0'; return; }
    if (k === 'P') {
      const val = disp.value;
      closeCalc();
      if (lastFocusedInput && typeof lastFocusedInput.value !== 'undefined') {
        lastFocusedInput.value = val;
        lastFocusedInput.dispatchEvent(new Event('input', { bubbles: true }));
        lastFocusedInput.focus();
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(val).catch(() => {});
      }
      return;
    }
    if (k === '=') {
      try {
        // Safe-ish eval for simple arithmetic
        const safe = calcExpr.replace(/[^0-9+\-*/.%() ]/g, '');
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + safe + ')')();
        calcExpr = String(Number(result.toFixed(6)));
        disp.value = calcExpr;
      } catch (e) {
        disp.value = 'Error';
        calcExpr = '';
      }
      return;
    }
    if (k === '%') {
      try {
        const n = parseFloat(calcExpr);
        calcExpr = String(n / 100);
        disp.value = calcExpr;
      } catch (e) {}
      return;
    }
    calcExpr += k;
    disp.value = calcExpr;
  }

  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      lastFocusedInput = e.target;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      openCalc();
    }
    if (e.key === 'Escape') closeCalc();
  });

  /* ============================================================
     SETTINGS PANEL HTML (injected into pageSettings)
     ============================================================ */
  function phase1SettingsHtml() {
    const a = getAlarms();
    const freeze = getFreezeUntil();
    const rights = getRights();
    const roles = ['Owner', 'Manager', 'Cashier', 'Helper'];
    const roleLabels = { Owner: t('roleOwner'), Manager: t('roleManager'), Cashier: t('roleCashier'), Helper: t('roleHelper') };

    let rightsHtml = roles.map(role => {
      if (role === 'Owner') {
        return `<div class="field"><label>${roleLabels[role]}</label><p class="hint">Full access (cannot restrict)</p></div>`;
      }
      const checks = ALL_PAGES.map(p => {
        const on = (rights[role] || []).indexOf(p) !== -1;
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:12px">
          <input type="checkbox" data-role="${role}" data-page="${p}" ${on ? 'checked' : ''} style="width:auto"> ${t(p) || p}
        </label>`;
      }).join('');
      return `<div class="field"><label>${roleLabels[role]}</label><div style="max-height:120px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px">${checks}</div></div>`;
    }).join('');

    return `
    <div class="stitch panel">
      <div class="panel-head"><h3>${t('settingsLang')}</h3></div>
      <div class="field">
        <label>${t('language')}</label>
        <select id="phase1Lang">
          <option value="en" ${getLang() === 'en' ? 'selected' : ''}>${t('langEn')}</option>
          <option value="sd" ${getLang() === 'sd' ? 'selected' : ''}>${t('langSd')}</option>
        </select>
      </div>
      <p class="hint">${t('calcHint')}</p>
      <button class="btn btn-outline btn-sm" type="button" onclick="window.KissanPhase1.openCalc()">⌨ ${t('calculator')} (F10)</button>
    </div>

    <div class="stitch panel">
      <div class="panel-head"><h3>${t('warningAlarms')}</h3></div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="alarmNegStock" ${a.negStock ? 'checked' : ''} style="width:auto">
        <label for="alarmNegStock" style="margin:0">${t('warnNegStock')}</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="alarmReorder" ${a.reorder ? 'checked' : ''} style="width:auto">
        <label for="alarmReorder" style="margin:0">${t('warnReorder')}</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="alarmNegCash" ${a.negCash ? 'checked' : ''} style="width:auto">
        <label for="alarmNegCash" style="margin:0">${t('warnNegCash')}</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="alarmBlock" ${a.block ? 'checked' : ''} style="width:auto">
        <label for="alarmBlock" style="margin:0">${t('blockOnAlarm')}</label>
      </div>
    </div>

    <div class="stitch panel">
      <div class="panel-head"><h3>${t('dataFreezing')}</h3></div>
      <p class="hint" style="margin-bottom:10px">${t('freezeHint')}</p>
      <div class="field">
        <label>${t('freezeUntil')}</label>
        <input type="date" id="freezeUntil" value="${freeze || ''}">
      </div>
    </div>

    <div class="stitch panel">
      <div class="panel-head"><h3>${t('accessRights')}</h3></div>
      <p class="hint" style="margin-bottom:10px">${t('accessHint')}</p>
      ${rightsHtml}
    </div>

    <button class="btn btn-primary" type="button" onclick="window.KissanPhase1.savePhase1Settings()">${t('saveSettings')}</button>
    `;
  }

  function savePhase1Settings() {
    const lang = document.getElementById('phase1Lang')?.value || 'en';
    setAlarms({
      negStock: !!document.getElementById('alarmNegStock')?.checked,
      reorder: !!document.getElementById('alarmReorder')?.checked,
      negCash: !!document.getElementById('alarmNegCash')?.checked,
      block: !!document.getElementById('alarmBlock')?.checked
    });
    setFreezeUntil(document.getElementById('freezeUntil')?.value || '');
    const rights = getRights();
    ['Manager', 'Cashier', 'Helper'].forEach(role => {
      rights[role] = [];
      document.querySelectorAll(`input[data-role="${role}"]`).forEach(cb => {
        if (cb.checked) rights[role].push(cb.getAttribute('data-page'));
      });
    });
    rights.Owner = ALL_PAGES.slice();
    setRights(rights);
    setLang(lang);
    if (typeof global.toast === 'function') global.toast(t('settingsSaved'), 'success');
    if (typeof global.goPage === 'function') global.goPage('settings');
  }

  /* ============================================================
     CSS for calculator
     ============================================================ */
  function injectStyles() {
    if (document.getElementById('kissanPhase1Styles')) return;
    const s = document.createElement('style');
    s.id = 'kissanPhase1Styles';
    s.textContent = `
      .kissan-calc {
        position: fixed; bottom: 24px; right: 24px; z-index: 1200;
        width: 280px; background: var(--card, #fffcf6); border: 1px solid var(--line, #e4dcc8);
        border-radius: 16px; box-shadow: 0 12px 40px rgba(10,42,24,.2); padding: 12px;
      }
      .kissan-calc-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .kissan-calc-display {
        width:100%; padding:12px; font-size:22px; font-family: var(--mono, monospace);
        text-align:right; border:1.5px solid var(--line,#e4dcc8); border-radius:10px; margin-bottom:10px; background:#fff;
      }
      .kissan-calc-keys { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
      .kissan-calc-key {
        padding:12px 0; border:none; border-radius:10px; font-weight:700; font-size:15px;
        background: var(--field-soft, #e8f2ec); color: var(--ink, #1a2218); cursor:pointer;
      }
      .kissan-calc-key.op { background: var(--wheat-soft, #fbf0d4); color: #6b4423; }
      .kissan-calc-key.paste { background: linear-gradient(180deg, #1a5c38, #0f3d24); color:#fff; grid-column: span 1; font-size:11px; }
      .lang-switch {
        display:inline-flex; gap:0; border:1.5px solid var(--line,#e4dcc8); border-radius:8px; overflow:hidden; margin-right:8px;
      }
      .lang-switch button {
        border:none; background:transparent; padding:5px 10px; font-size:11.5px; font-weight:700; cursor:pointer; color:var(--ink-soft,#5a6656);
      }
      .lang-switch button.active { background: var(--field, #0f3d24); color:#fff; }
    `;
    document.head.appendChild(s);
  }

  function langSwitcherHtml() {
    return `<span class="lang-switch no-print" id="langSwitch">
      <button type="button" data-lang="en" class="${getLang()==='en'?'active':''}">EN</button>
      <button type="button" data-lang="sd" class="${getLang()==='sd'?'active':''}">سنڌي</button>
    </span>`;
  }

  function bindLangSwitcher() {
    const box = document.getElementById('langSwitch');
    if (!box) return;
    box.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => setLang(btn.getAttribute('data-lang'));
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  global.KissanPhase1 = {
    t, getLang, setLang, applyStaticLang,
    getAlarms, setAlarms, checkStockAlarms,
    getFreezeUntil, setFreezeUntil, isDateFrozen, assertNotFrozen,
    getRights, setRights, canAccess, currentUserRole, isOwner, ALL_PAGES,
    openCalc, closeCalc,
    phase1SettingsHtml, savePhase1Settings,
    langSwitcherHtml, bindLangSwitcher, injectStyles,
    // helpers for NAV labels
    navLabel(id) { return t(id); },
    secLabel(key) {
      const map = {
        Overview: 'secOverview', Inventory: 'secInventory',
        'Estimates & Orders': 'secEstimates', Transactions: 'secTransactions',
        People: 'secPeople', Records: 'secRecords'
      };
      return t(map[key] || key);
    }
  };

  // Boot styles early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

})(window);
