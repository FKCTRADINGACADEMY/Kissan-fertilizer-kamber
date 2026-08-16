// ==============================================
// MODULE: AI / SMART INSIGHTS
// Self-contained, fully automatic, works offline. This is a rule-based
// insight engine (trend comparison, thresholds, ranking) computed from the
// app's own Firestore data — not a call to an external AI API, since a
// downloaded local app has no safe place to store an API key. If real
// generative-AI report writing is wanted later, this module is the place
// to plug it in.
// ==============================================
import { collection, onSnapshot } from "firebase/firestore";

function waitForDb() {
    return new Promise((resolve) => {
        (function check() {
            if (window.db) resolve(window.db);
            else setTimeout(check, 100);
        })();
    });
}

(async function init() {
    const db = await waitForDb();
    const root = document.getElementById('module-ai-insights-root');
    if (!root) return;

    let sales = [], products = [], parties = [], purchases = [], expenses = [];

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-robot"></i> AI / Smart Insights</h1>
        </div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Ye insights automatic, rule-based tarz mai aap ke apne data se nikalte hain — offline kaam karte hain, koi internet/API ki zaroorat nahi.</p>
        <div id="aiCards"></div>
    `;

    function card(title, icon, bodyHtml, color) {
        return `<div class="card settings-section" style="margin-bottom:14px;border-left:4px solid var(${color || '--primary'});">
            <h3><i class="fas ${icon}"></i> ${title}</h3>
            ${bodyHtml}
        </div>`;
    }

    function computeInsights() {
        const now = Date.now();
        const day = 86400000;
        const last30 = now - 30 * day, prev30 = now - 60 * day;

        // Sales trend per product
        const qtyByProduct = {}; // productName -> {recent, prior}
        sales.forEach(s => {
            const items = s.items || s.products || [];
            const ts = new Date(s.date || s.createdAt || 0).getTime();
            items.forEach(it => {
                const name = it.name || it.productName || 'Unknown';
                if (!qtyByProduct[name]) qtyByProduct[name] = { recent: 0, prior: 0 };
                const qty = Number(it.qty || it.quantity || 0);
                if (ts >= last30) qtyByProduct[name].recent += qty;
                else if (ts >= prev30) qtyByProduct[name].prior += qty;
            });
        });
        const trends = Object.entries(qtyByProduct).map(([name, v]) => ({
            name, recent: v.recent, prior: v.prior,
            change: v.prior > 0 ? ((v.recent - v.prior) / v.prior) * 100 : (v.recent > 0 ? 100 : 0)
        }));
        const growing = trends.filter(t => t.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
        const declining = trends.filter(t => t.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);

        // Slow-moving / dead stock: products with stock but no sale in last 30 days
        const soldRecently = new Set(Object.entries(qtyByProduct).filter(([, v]) => v.recent > 0).map(([n]) => n));
        const deadStock = products.filter(p => Number(p.stock_quantity || 0) > 0 && !soldRecently.has(p.name)).slice(0, 8);

        // Low stock
        const lowStock = products.filter(p => Number(p.stock_quantity || 0) > 0 && Number(p.stock_quantity || 0) <= (Number(p.min_stock || p.minStock || 10))).slice(0, 8);

        // Top overdue customers
        const overdue = parties.filter(p => Number(p.udhaar_balance || 0) > 0)
            .sort((a, b) => Number(b.udhaar_balance || 0) - Number(a.udhaar_balance || 0)).slice(0, 5);

        // Cash flow snapshot (last 30 days)
        const salesTotal30 = sales.filter(s => new Date(s.date || s.createdAt || 0).getTime() >= last30)
            .reduce((sum, s) => sum + Number(s.total || s.grandTotal || s.amount || 0), 0);
        const purchTotal30 = purchases.filter(p => new Date(p.date || p.createdAt || 0).getTime() >= last30)
            .reduce((sum, p) => sum + Number(p.total || p.grandTotal || p.amount || 0), 0);
        const expTotal30 = expenses.filter(e => new Date(e.date || e.createdAt || 0).getTime() >= last30)
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const netProfit30 = salesTotal30 - purchTotal30 - expTotal30;

        return { growing, declining, deadStock, lowStock, overdue, salesTotal30, purchTotal30, expTotal30, netProfit30 };
    }

    function fmt(n) { return window.formatCurrency ? window.formatCurrency(n) : Number(n || 0).toLocaleString('en-PK'); }

    function render() {
        const i = computeInsights();
        const cardsEl = document.getElementById('aiCards');
        if (!cardsEl) return;

        let html = '';

        html += card('30-Day Business Health', 'fa-heartbeat', `
            <div class="stats-grid">
                <div class="stat-card green"><div>Sales (30d)</div><h2>${fmt(i.salesTotal30)}</h2></div>
                <div class="stat-card blue"><div>Purchases (30d)</div><h2>${fmt(i.purchTotal30)}</h2></div>
                <div class="stat-card orange"><div>Expenses (30d)</div><h2>${fmt(i.expTotal30)}</h2></div>
                <div class="stat-card ${i.netProfit30 >= 0 ? 'purple' : 'red'}"><div>Estimated Net (30d)</div><h2>${fmt(i.netProfit30)}</h2></div>
            </div>
            <p style="margin-top:10px;">${i.netProfit30 >= 0
                ? '✅ Pichle 30 din munafa mai rahe hain.'
                : '⚠️ Pichle 30 din kharch aamdani se zyada raha — expenses ya purchases dekhein.'}</p>
        `, '--success');

        html += card('Growing Products', 'fa-arrow-trend-up', i.growing.length ? `
            <ul style="margin-left:18px;">${i.growing.map(t => `<li>${t.name} — ${t.change === 100 ? 'naya trend' : t.change.toFixed(0) + '% zyada sale'}</li>`).join('')}</ul>
        ` : '<p style="color:var(--text-muted);">Abhi kaafi data nahi hai.</p>', '--success');

        html += card('Declining Products', 'fa-arrow-trend-down', i.declining.length ? `
            <ul style="margin-left:18px;">${i.declining.map(t => `<li>${t.name} — ${Math.abs(t.change).toFixed(0)}% kam sale</li>`).join('')}</ul>
        ` : '<p style="color:var(--text-muted);">Koi qabl-e-zikar giravat nahi.</p>', '--danger');

        html += card('Slow-Moving / Dead Stock', 'fa-box-open', i.deadStock.length ? `
            <ul style="margin-left:18px;">${i.deadStock.map(p => `<li>${p.name} — Stock: ${p.stock_quantity}, 30 din mai koi sale nahi</li>`).join('')}</ul>
            <p style="margin-top:8px;color:var(--text-muted);font-size:13px;">Suggestion: discount ya bundle offer par ghor karein.</p>
        ` : '<p style="color:var(--text-muted);">Sab stock move ho raha hai.</p>', '--secondary');

        html += card('Low Stock Alert', 'fa-triangle-exclamation', i.lowStock.length ? `
            <ul style="margin-left:18px;">${i.lowStock.map(p => `<li>${p.name} — sirf ${p.stock_quantity} bacha hai</li>`).join('')}</ul>
        ` : '<p style="color:var(--text-muted);">Stock levels theek hain.</p>', '--danger');

        html += card('Top Overdue Customers', 'fa-user-clock', i.overdue.length ? `
            <ul style="margin-left:18px;">${i.overdue.map(p => `<li>${p.name} — ${fmt(p.udhaar_balance)}</li>`).join('')}</ul>
            <p style="margin-top:8px;color:var(--text-muted);font-size:13px;">Suggestion: Daily Call Sheet ya Credit & Advance page se recovery follow-up karein.</p>
        ` : '<p style="color:var(--text-muted);">Koi bara outstanding balance nahi.</p>', '--info');

        cardsEl.innerHTML = html;
    }

    onSnapshot(collection(db, 'sales'), s => { sales = []; s.forEach(d => sales.push(d.data())); render(); });
    onSnapshot(collection(db, 'products'), s => { products = []; s.forEach(d => products.push(d.data())); render(); });
    onSnapshot(collection(db, 'parties'), s => { parties = []; s.forEach(d => parties.push(d.data())); render(); });
    onSnapshot(collection(db, 'purchases'), s => { purchases = []; s.forEach(d => purchases.push(d.data())); render(); });
    onSnapshot(collection(db, 'expenses'), s => { expenses = []; s.forEach(d => expenses.push(d.data())); render(); });
})();
