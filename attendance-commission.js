// ==============================================
// MODULE: EMPLOYEE ATTENDANCE + COMMISSION
// Self-contained. Reuses the existing 'users' collection as the employee
// list, adds a 'commissionPercent' field to it, and a new 'attendance'
// collection for daily attendance marking. Commission auto-calculates from
// the 'sales' collection (each sale's soldBy / staff name, if present).
// Offline-capable via Firestore local cache.
// ==============================================
import {
    collection, doc, addDoc, updateDoc, setDoc, getDoc, getDocs, onSnapshot, query, where
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
    const root = document.getElementById('module-attendance-root');
    if (!root) return;

    let users = [];
    let attendance = [];
    let sales = [];

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-user-clock"></i> Employee Attendance & Commission</h1>
            <div>
                <input type="date" id="atDate" style="margin-right:8px;" />
                <button class="btn-primary" id="atMarkAllPresent"><i class="fas fa-check-double"></i> Mark All Present</button>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead><tr><th>#</th><th>Employee</th><th>Role</th><th>Status Today</th><th>Commission %</th><th>Commission This Month</th></tr></thead>
                <tbody id="atTable"><tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
            </table>
        </div>

        <div class="card settings-section" style="margin-top:16px;">
            <h3><i class="fas fa-calendar-check"></i> Attendance History (last 30 days)</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Date</th><th>Employee</th><th>Status</th></tr></thead>
                    <tbody id="atHistoryTable"><tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('atDate').value = new Date().toISOString().slice(0, 10);

    function attendanceKey(userId, date) { return userId + '_' + date; }

    function statusFor(userId, date) {
        const rec = attendance.find(a => a.userId === userId && a.date === date);
        return rec ? rec.status : 'not-marked';
    }

    function commissionThisMonth(user) {
        const rate = Number(user.commissionPercent || 0);
        if (rate <= 0) return 0;
        const ym = new Date().toISOString().slice(0, 7);
        let total = 0;
        sales.forEach(s => {
            const soldBy = s.soldBy || s.staffName || s.createdBy || '';
            const dateStr = (s.date || s.createdAt || '').slice(0, 7);
            if (soldBy === user.name && dateStr === ym) {
                total += Number(s.total || s.grandTotal || s.amount || 0) * (rate / 100);
            }
        });
        return total;
    }

    async function setStatus(userId, userName, date, status) {
        const id = attendanceKey(userId, date);
        await setDoc(doc(db, 'attendance', id), {
            userId, userName, date, status, updatedAt: new Date().toISOString()
        });
    }

    function renderTable() {
        const tbody = document.getElementById('atTable');
        if (!tbody) return;
        const date = document.getElementById('atDate').value;
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No employees found. Add users in User Management first.</td></tr>';
            return;
        }
        tbody.innerHTML = users.map((u, i) => {
            const st = statusFor(u.id, date);
            const commission = commissionThisMonth(u);
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${u.name}</td>
                    <td>${u.role || '-'}</td>
                    <td>
                        <select data-att-select="${u.id}" style="padding:4px 8px;border-radius:6px;">
                            <option value="not-marked" ${st === 'not-marked' ? 'selected' : ''}>Not Marked</option>
                            <option value="present" ${st === 'present' ? 'selected' : ''}>Present</option>
                            <option value="absent" ${st === 'absent' ? 'selected' : ''}>Absent</option>
                            <option value="leave" ${st === 'leave' ? 'selected' : ''}>Leave</option>
                            <option value="half-day" ${st === 'half-day' ? 'selected' : ''}>Half Day</option>
                        </select>
                    </td>
                    <td><input type="number" data-comm-input="${u.id}" value="${u.commissionPercent || 0}" min="0" max="100" step="0.1" style="width:80px;padding:4px;border-radius:6px;" /></td>
                    <td>${window.formatCurrency ? window.formatCurrency(commission) : commission.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-att-select]').forEach(sel => {
            sel.onchange = async () => {
                const u = users.find(x => x.id === sel.dataset.attSelect);
                await setStatus(u.id, u.name, date, sel.value);
                if (window.logAudit) window.logAudit('Attendance', `${u.name} marked ${sel.value} on ${date}`);
                if (window.showToast) window.showToast('✅ Attendance updated', 'success');
            };
        });
        tbody.querySelectorAll('[data-comm-input]').forEach(inp => {
            inp.onchange = async () => {
                await updateDoc(doc(db, 'users', inp.dataset.commInput), { commissionPercent: parseFloat(inp.value) || 0 });
                if (window.showToast) window.showToast('✅ Commission rate updated', 'success');
            };
        });
    }

    function renderHistory() {
        const tbody = document.getElementById('atHistoryTable');
        if (!tbody) return;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const list = attendance.filter(a => a.date >= cutoffStr).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">No attendance history yet</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(a => `
            <tr><td>${a.date}</td><td>${a.userName}</td><td>${(a.status || '').replace('-', ' ')}</td></tr>
        `).join('');
    }

    onSnapshot(collection(db, 'users'), (snap) => {
        users = [];
        snap.forEach(d => users.push({ id: d.id, ...d.data() }));
        renderTable();
    });
    onSnapshot(collection(db, 'attendance'), (snap) => {
        attendance = [];
        snap.forEach(d => attendance.push({ id: d.id, ...d.data() }));
        renderTable();
        renderHistory();
    });
    onSnapshot(collection(db, 'sales'), (snap) => {
        sales = [];
        snap.forEach(d => sales.push({ id: d.id, ...d.data() }));
        renderTable();
    });

    document.getElementById('atDate').addEventListener('change', renderTable);
    document.getElementById('atMarkAllPresent').addEventListener('click', async () => {
        const date = document.getElementById('atDate').value;
        for (const u of users) {
            await setStatus(u.id, u.name, date, 'present');
        }
        if (window.showToast) window.showToast('✅ All employees marked present', 'success');
    });
})();
