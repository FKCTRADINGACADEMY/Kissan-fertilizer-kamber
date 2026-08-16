// ==============================================
// MODULE: AUTO DAILY CLOSING + INTEREST CALCULATION
// Self-contained. Reads 'sales', 'purchases', 'expenses', 'transactions'
// (cash entries) and 'parties' collections that already exist, writes
// locked daily snapshots to a new 'dailyClosing' collection, and computes
// simple monthly interest on overdue customer balances (stored back onto
// the party as 'interestAccrued'). Runs automatically once a day and can
// also be triggered manually. Offline-capable via Firestore local cache.
// ==============================================
import {
    collection, doc, addDoc, updateDoc, getDoc, getDocs, setDoc, onSnapshot, query, where
} from "firebase/firestore";

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
    const root = document.getElementById('module-daily-closing-root');
    if (!root) return;

    let closings = [];
    let parties = [];

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-lock"></i> Auto Daily Closing & Interest Calculation</h1>
            <button class="btn-primary" id="dcCloseTodayBtn"><i class="fas fa-lock"></i> Close Today Now</button>
        </div>

        <div class="stats-grid" id="dcTodayStats"></div>

        <div class="card settings-section" style="margin-top:16px;">
            <h3><i class="fas fa-percentage"></i> Interest on Overdue Balances</h3>
            <div class="form-grid-2">
                <div><label>Monthly Interest Rate (%)</label><input type="number" id="dcInterestRate" min="0" step="0.1" value="0" /></div>
                <div><label>Overdue After (days)</label><input type="number" id="dcOverdueDays" min="1" value="30" /></div>
            </div>
            <div class="export-btns" style="margin-top:10px;">
                <button class="btn-secondary" id="dcRunInterestBtn"><i class="fas fa-sync"></i> Calculate Interest Now</button>
            </div>
            <div class="table-container" style="margin-top:12px;">
                <table>
                    <thead><tr><th>Customer</th><th>Balance</th><th>Interest Accrued</th></tr></thead>
                    <tbody id="dcInterestTable"><tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Set a rate and click Calculate</td></tr></tbody>
                </table>
            </div>
        </div>

        <div class="card settings-section" style="margin-top:16px;">
            <h3><i class="fas fa-calendar-day"></i> Daily Closing History</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Date</th><th>Sales</th><th>Purchases</th><th>Expenses</th><th>Cash In</th><th>Cash Out</th><th>Net Profit (est.)</th></tr></thead>
                    <tbody id="dcHistoryTable"><tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;

    function todayStr() { return new Date().toISOString().slice(0, 10); }

    async function computeDayTotals(dateStr) {
        const salesSnap = await getDocs(collection(db, 'sales'));
        const purchSnap = await getDocs(collection(db, 'purchases'));
        const expSnap = await getDocs(collection(db, 'expenses'));
        const transSnap = await getDocs(collection(db, 'transactions'));

        let salesTotal = 0, purchTotal = 0, expTotal = 0, cashIn = 0, cashOut = 0;
        salesSnap.forEach(d => {
            const s = d.data();
            if ((s.date || (s.createdAt || '').slice(0, 10)) === dateStr) salesTotal += Number(s.total || s.grandTotal || s.amount || 0);
        });
        purchSnap.forEach(d => {
            const p = d.data();
            if ((p.date || (p.createdAt || '').slice(0, 10)) === dateStr) purchTotal += Number(p.total || p.grandTotal || p.amount || 0);
        });
        expSnap.forEach(d => {
            const ex = d.data();
            if ((ex.date || (ex.createdAt || '').slice(0, 10)) === dateStr) expTotal += Number(ex.amount || 0);
        });
        transSnap.forEach(d => {
            const t = d.data();
            if ((t.date || (t.createdAt || '').slice(0, 10)) === dateStr) {
                const amt = Number(t.amount || 0);
                if ((t.type || '').toLowerCase().includes('in')) cashIn += amt;
                if ((t.type || '').toLowerCase().includes('out')) cashOut += amt;
            }
        });
        const netProfit = salesTotal - purchTotal - expTotal;
        return { date: dateStr, salesTotal, purchTotal, expTotal, cashIn, cashOut, netProfit };
    }

    async function closeDay(dateStr, silent) {
        const totals = await computeDayTotals(dateStr);
        await setDoc(doc(db, 'dailyClosing', dateStr), {
            ...totals,
            closedAt: new Date().toISOString(),
            locked: true
        });
        if (!silent && window.showToast) window.showToast(`✅ ${dateStr} closed — Sales: ${window.formatCurrency ? window.formatCurrency(totals.salesTotal) : totals.salesTotal}`, 'success');
        if (window.logAudit) window.logAudit('Daily Closing', `Day ${dateStr} closed automatically`);
        renderTodayStats(totals);
    }

    function renderTodayStats(totals) {
        const el = document.getElementById('dcTodayStats');
        if (!el) return;
        el.innerHTML = `
            <div class="stat-card green"><div>Today's Sales</div><h2>${window.formatCurrency ? window.formatCurrency(totals.salesTotal) : totals.salesTotal}</h2></div>
            <div class="stat-card blue"><div>Today's Purchases</div><h2>${window.formatCurrency ? window.formatCurrency(totals.purchTotal) : totals.purchTotal}</h2></div>
            <div class="stat-card orange"><div>Today's Expenses</div><h2>${window.formatCurrency ? window.formatCurrency(totals.expTotal) : totals.expTotal}</h2></div>
            <div class="stat-card purple"><div>Estimated Net Profit</div><h2>${window.formatCurrency ? window.formatCurrency(totals.netProfit) : totals.netProfit}</h2></div>
        `;
    }

    function renderHistory() {
        const tbody = document.getElementById('dcHistoryTable');
        if (!tbody) return;
        const list = closings.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No closings yet</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(c => `
            <tr>
                <td>${c.date}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.salesTotal) : c.salesTotal}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.purchTotal) : c.purchTotal}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.expTotal) : c.expTotal}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.cashIn) : c.cashIn}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.cashOut) : c.cashOut}</td>
                <td>${window.formatCurrency ? window.formatCurrency(c.netProfit) : c.netProfit}</td>
            </tr>
        `).join('');
    }

    onSnapshot(collection(db, 'dailyClosing'), (snap) => {
        closings = [];
        snap.forEach(d => closings.push({ id: d.id, ...d.data() }));
        renderHistory();
    });
    onSnapshot(collection(db, 'parties'), (snap) => {
        parties = [];
        snap.forEach(d => parties.push({ id: d.id, ...d.data() }));
    });

    // Auto-close: run once on load for "today" (idempotent — overwrites today's snapshot with latest numbers),
    // and auto re-run every hour so the closing stays current until the day actually ends.
    computeDayTotals(todayStr()).then(renderTodayStats);
    closeDay(todayStr(), true);
    setInterval(() => closeDay(todayStr(), true), 3600000);

    document.getElementById('dcCloseTodayBtn').addEventListener('click', () => closeDay(todayStr(), false));

    document.getElementById('dcRunInterestBtn').addEventListener('click', async () => {
        const rate = parseFloat(document.getElementById('dcInterestRate').value) || 0;
        const overdueDays = parseInt(document.getElementById('dcOverdueDays').value) || 30;
        const tbody = document.getElementById('dcInterestTable');
        const rows = [];
        for (const p of parties) {
            const balance = Number(p.udhaar_balance || 0);
            if (balance <= 0) continue;
            // Simple monthly-rate interest applied to any balance older than the overdue window,
            // using the party's last payment/update date as the reference point where available.
            const lastActivity = p.updatedAt || p.createdAt || null;
            let overdue = true;
            if (lastActivity) {
                const days = (Date.now() - new Date(lastActivity).getTime()) / 86400000;
                overdue = days >= overdueDays;
            }
            const interest = overdue ? balance * (rate / 100) : 0;
            if (interest > 0) {
                await updateDoc(doc(db, 'parties', p.id), { interestAccrued: interest });
            }
            rows.push({ name: p.name, balance, interest });
        }
        tbody.innerHTML = rows.length === 0
            ? '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">No overdue balances</td></tr>'
            : rows.map(r => `<tr><td>${r.name}</td><td>${window.formatCurrency ? window.formatCurrency(r.balance) : r.balance}</td><td>${window.formatCurrency ? window.formatCurrency(r.interest) : r.interest.toFixed(2)}</td></tr>`).join('');
        if (window.showToast) window.showToast('✅ Interest calculated for overdue balances', 'success');
        if (window.logAudit) window.logAudit('Interest', `Interest calculated at ${rate}% for balances overdue ${overdueDays}+ days`);
    });
})();
