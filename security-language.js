// ==============================================
// MODULE: 2FA (LOCAL PIN) + MULTI-LANGUAGE (URDU/ENGLISH)
//
// 2FA note: true SMS/TOTP two-factor needs a paid SMS/auth backend which
// isn't part of this app. This module adds a genuine second local factor —
// a 4-6 digit PIN stored (SHA-256 hashed) on the user's own Firestore
// 'users' doc — required after normal Firebase login, entirely offline.
//
// Multi-language: toggles the sidebar, page headers, and table headers
// between English and Urdu using a translation dictionary, auto-applied
// and remembered (localStorage) across sessions.
// ==============================================
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

function waitForDb() {
    return new Promise((resolve) => {
        (function check() {
            if (window.db && window.auth) resolve();
            else setTimeout(check, 100);
        })();
    });
}

async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DICT = {
    'Dashboard': 'ڈیش بورڈ', 'Products': 'پروڈکٹس', 'Godam': 'گودام', 'Stock': 'اسٹاک',
    'Purchase': 'خریداری', 'Sales': 'فروخت', 'Sales Return': 'سیل ریٹرن', 'Purchase Return': 'خریداری ریٹرن',
    'Stock Transfer': 'اسٹاک ٹرانسفر', 'Parties': 'کسٹمرز', 'History': 'ہسٹری', 'Daily Call Sheet': 'روزانہ کال شیٹ',
    'Suppliers': 'سپلائرز', 'Cash & Accounts': 'نقدی و اکاؤنٹس', 'Vouchers': 'واؤچرز',
    'Party Ledger': 'کسٹمر لیجر', 'General Ledger': 'جنرل لیجر', 'Trial Balance': 'ٹرائل بیلنس',
    'Reports': 'رپورٹس', 'User Management': 'یوزر مینجمنٹ', 'Audit Log': 'آڈٹ لاگ', 'Settings': 'سیٹنگز',
    'Credit & Advance': 'کریڈٹ اور ایڈوانس', 'Batch & Weight Sale': 'بیچ اور وزن سیل',
    'Attendance & Commission': 'حاضری اور کمیشن', 'Daily Closing & Interest': 'روزانہ کلوزنگ اور سود',
    'Security & Language': 'سیکیورٹی اور زبان', 'AI Insights': 'اے آئی بصیرت',
    'Add Product': 'پروڈکٹ شامل کریں', 'Add Godam': 'گودام شامل کریں', 'Backup Now': 'ابھی بیک اپ کریں',
    'Restore': 'بحال کریں', 'Total Sales': 'کل فروخت', 'Total Purchases': 'کل خریداری',
    'Cash In': 'نقدی آمد', 'Cash Out': 'نقدی اخراج', 'Customer': 'کسٹمر', 'Amount': 'رقم',
    'Date': 'تاریخ', 'Actions': 'اعمال', 'Status': 'حیثیت', 'Balance': 'بیلنس'
};
const REVERSE = Object.fromEntries(Object.entries(DICT).map(([k, v]) => [v, k]));

function applyLanguage(lang) {
    document.querySelectorAll('.sidebar-nav a span, .page-header h1, table th').forEach(el => {
        // strip icons/whitespace-only nodes; only touch pure text
        const text = el.textContent.trim();
        if (!text) return;
        if (lang === 'ur') {
            const key = Object.keys(DICT).find(k => text.includes(k));
            if (key) {
                if (!el.dataset.origEn) el.dataset.origEn = text;
                el.textContent = text.replace(key, DICT[key]);
            }
        } else {
            if (el.dataset.origEn) {
                el.textContent = el.dataset.origEn;
            }
        }
    });
    document.documentElement.setAttribute('lang', lang === 'ur' ? 'ur' : 'en');
    localStorage.setItem('kissan_lang', lang);
}

(async function init() {
    await waitForDb();
    const root = document.getElementById('module-security-lang-root');
    if (!root) return;

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-shield-alt"></i> Security (PIN) & Language</h1>
        </div>

        <div class="card settings-section">
            <h3><i class="fas fa-key"></i> Two-Factor Login PIN</h3>
            <p style="font-size:13px;color:var(--text-muted);">Ye ek local dusra security layer hai — normal login ke baad ye PIN bhi maangi jayegi. Kaam offline hota hai, kisi SMS/internet service ki zaroorat nahi.</p>
            <div id="slPinStatus" style="margin:10px 0;font-weight:600;"></div>
            <div class="form-row">
                <div class="form-group"><label>New PIN (4-6 digits)</label><input type="password" id="slNewPin" maxlength="6" inputmode="numeric" /></div>
                <div class="form-group"><label>Confirm PIN</label><input type="password" id="slConfirmPin" maxlength="6" inputmode="numeric" /></div>
            </div>
            <div class="export-btns">
                <button class="btn-primary" id="slSetPinBtn"><i class="fas fa-save"></i> Set / Update PIN</button>
                <button class="btn-secondary" id="slRemovePinBtn"><i class="fas fa-trash"></i> Remove PIN (disable 2FA)</button>
            </div>
        </div>

        <div class="card settings-section" style="margin-top:16px;">
            <h3><i class="fas fa-language"></i> App Language</h3>
            <p style="font-size:13px;color:var(--text-muted);">Sidebar, page titles aur table headers ke liye. Poori app translate karne ke liye zyada waqt lagega — ye core navigation ko cover karta hai.</p>
            <div class="export-btns">
                <button class="btn-sm" id="slLangEn">English</button>
                <button class="btn-sm" id="slLangUr">اردو</button>
            </div>
        </div>
    `;

    const savedLang = localStorage.getItem('kissan_lang') || 'en';
    applyLanguage(savedLang);
    document.getElementById('slLangEn').onclick = () => applyLanguage('en');
    document.getElementById('slLangUr').onclick = () => applyLanguage('ur');

    // Reapply language whenever the user switches tabs (new DOM text becomes visible)
    document.querySelectorAll('[data-tab]').forEach(link => {
        link.addEventListener('click', () => setTimeout(() => applyLanguage(localStorage.getItem('kissan_lang') || 'en'), 50));
    });

    async function currentUserDocRef() {
        const email = window.auth.currentUser?.email;
        if (!email) return null;
        const snap = await getDocs(query(collection(window.db, 'users'), where('email', '==', email)));
        if (snap.empty) return null;
        return doc(window.db, 'users', snap.docs[0].id);
    }

    async function refreshPinStatus() {
        const ref = await currentUserDocRef();
        const statusEl = document.getElementById('slPinStatus');
        if (!ref) { statusEl.textContent = 'PIN status unavailable (no matching user record).'; return; }
        const d = await getDoc(ref);
        const hasPin = !!(d.exists() && d.data().pinHash);
        statusEl.innerHTML = hasPin
            ? '<span style="color:var(--success);"><i class="fas fa-check-circle"></i> 2FA PIN is ON</span>'
            : '<span style="color:var(--text-muted);"><i class="fas fa-times-circle"></i> 2FA PIN is OFF</span>';
    }
    refreshPinStatus();

    document.getElementById('slSetPinBtn').onclick = async () => {
        const pin = document.getElementById('slNewPin').value;
        const confirm2 = document.getElementById('slConfirmPin').value;
        if (!/^\d{4,6}$/.test(pin)) { window.showToast && window.showToast('❌ PIN 4-6 digits hona chahiye', 'error'); return; }
        if (pin !== confirm2) { window.showToast && window.showToast('❌ PIN match nahi karta', 'error'); return; }
        const ref = await currentUserDocRef();
        if (!ref) { window.showToast && window.showToast('❌ User record nahi mila', 'error'); return; }
        const pinHash = await sha256(pin);
        await updateDoc(ref, { pinHash, pinEnabledAt: new Date().toISOString() });
        localStorage.setItem('kissan_2fa_required', '1');
        window.showToast && window.showToast('✅ PIN set ho gayi — agli login pe ye bhi maangi jayegi', 'success');
        refreshPinStatus();
    };

    document.getElementById('slRemovePinBtn').onclick = async () => {
        const ref = await currentUserDocRef();
        if (!ref) return;
        await updateDoc(ref, { pinHash: null });
        localStorage.removeItem('kissan_2fa_required');
        window.showToast && window.showToast('✅ PIN removed, 2FA disabled', 'success');
        refreshPinStatus();
    };

    // Enforce PIN on this session if one is set for the logged-in user (checked once per load)
    (async () => {
        const ref = await currentUserDocRef();
        if (!ref) return;
        const d = await getDoc(ref);
        if (d.exists() && d.data().pinHash && !sessionStorage.getItem('kissan_pin_verified')) {
            const entered = prompt('🔒 2FA: Apna security PIN darj karein');
            if (entered) {
                const hash = await sha256(entered);
                if (hash === d.data().pinHash) {
                    sessionStorage.setItem('kissan_pin_verified', '1');
                } else {
                    alert('❌ Galat PIN! App mahfooz mode mai band ho rahi hai.');
                    window.location.href = 'login.html';
                }
            } else {
                window.location.href = 'login.html';
            }
        }
    })();
})();
