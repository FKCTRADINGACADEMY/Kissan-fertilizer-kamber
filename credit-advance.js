// ==============================================
// MODULE: CREDIT LIMIT + ADVANCE / PARTIAL PAYMENT
// Self-contained. Connects to the same Firebase project as the main app
// via window.db (already initialized in index.html). Works offline through
// Firestore's shared persistent local cache.
// ==============================================
import {
    collection, doc, addDoc, updateDoc, getDocs, onSnapshot, query, where, orderBy
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
    const root = document.getElementById('module-credit-advance-root');
    if (!root) return;

    let parties = [];
    let payments = [];

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-hand-holding-usd"></i> Credit Limit & Advance / Partial Payment</h1>
            <button class="btn-primary" id="caOpenPaymentBtn"><i class="fas fa-plus"></i> Record Advance / Partial Payment</button>
        </div>

        <div class="filter-bar">
            <input type="text" id="caSearch" placeholder="🔍 Search customer..." />
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr><th>#</th><th>Customer</th><th>Current Balance</th><th>Credit Limit</th><th>Advance Balance</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody id="caTable"><tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
            </table>
        </div>

        <div class="card settings-section" style="margin-top:16px;">
            <h3><i class="fas fa-history"></i> Recent Advance / Partial Payments</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead>
                    <tbody id="caPaymentsTable"><tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;

    // Modal (appended once to body, reused)
    if (!document.getElementById('caPaymentModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'caPaymentModal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" id="caCloseModal">&times;</span>
                <h2>Record Advance / Partial Payment</h2>
                <form id="caPaymentForm">
                    <div class="form-group">
                        <label>Customer *</label>
                        <select id="caPartyId" required></select>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Type *</label>
                            <select id="caType" required>
                                <option value="advance">Advance Received (future adjustable)</option>
                                <option value="partial">Partial Payment (against existing balance)</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Amount (Rs.) *</label><input type="number" id="caAmount" min="0.01" step="0.01" required /></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Date</label><input type="date" id="caDate" /></div>
                        <div class="form-group"><label>Set / Update Credit Limit (Rs.)</label><input type="number" id="caCreditLimit" min="0" step="0.01" placeholder="Leave blank to keep as-is" /></div>
                    </div>
                    <div class="form-group"><label>Note</label><input type="text" id="caNote" /></div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="caCancelBtn">Cancel</button>
                        <button type="submit" class="btn-primary">Save</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('caCloseModal').onclick = () => modal.style.display = 'none';
        document.getElementById('caCancelBtn').onclick = () => modal.style.display = 'none';
    }

    document.getElementById('caOpenPaymentBtn').onclick = () => {
        document.getElementById('caPaymentForm').reset();
        document.getElementById('caDate').value = new Date().toISOString().slice(0, 10);
        populatePartyDropdown();
        document.getElementById('caPaymentModal').style.display = 'flex';
    };

    function populatePartyDropdown() {
        const sel = document.getElementById('caPartyId');
        sel.innerHTML = parties.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    function advanceBalanceFor(partyId) {
        // Advance received minus advance already used (used tracked via type 'advance-used')
        let received = 0, used = 0;
        payments.filter(p => p.partyId === partyId).forEach(p => {
            if (p.type === 'advance') received += Number(p.amount || 0);
            if (p.type === 'advance-used') used += Number(p.amount || 0);
        });
        return received - used;
    }

    function renderPartiesTable() {
        const tbody = document.getElementById('caTable');
        if (!tbody) return;
        const search = (document.getElementById('caSearch')?.value || '').toLowerCase();
        const list = parties.filter(p => p.name.toLowerCase().includes(search));
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No customers found</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((p, i) => {
            const balance = Number(p.udhaar_balance || 0);
            const limit = Number(p.creditLimit || 0);
            const adv = advanceBalanceFor(p.id);
            const overLimit = limit > 0 && balance > limit;
            return `
                <tr style="${overLimit ? 'background:rgba(239,68,68,0.08);' : ''}">
                    <td>${i + 1}</td>
                    <td>${p.name}</td>
                    <td>${window.formatCurrency ? window.formatCurrency(balance) : balance}</td>
                    <td>${limit > 0 ? (window.formatCurrency ? window.formatCurrency(limit) : limit) : '<span style="color:var(--text-muted);">Not set</span>'}</td>
                    <td>${adv > 0 ? (window.formatCurrency ? window.formatCurrency(adv) : adv) : '-'}</td>
                    <td>${overLimit ? '<span style="color:var(--danger);font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Over Limit</span>' : '<span style="color:var(--success);">OK</span>'}</td>
                    <td><button class="btn-sm" data-quick-pay="${p.id}"><i class="fas fa-plus"></i> Payment</button></td>
                </tr>
            `;
        }).join('');
        tbody.querySelectorAll('[data-quick-pay]').forEach(btn => {
            btn.onclick = () => {
                document.getElementById('caOpenPaymentBtn').click();
                document.getElementById('caPartyId').value = btn.dataset.quickPay;
            };
        });
    }

    function renderPaymentsTable() {
        const tbody = document.getElementById('caPaymentsTable');
        if (!tbody) return;
        const list = payments
            .filter(p => p.type === 'advance' || p.type === 'partial')
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .slice(0, 25);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No entries yet</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(p => `
            <tr>
                <td>${p.date || '-'}</td>
                <td>${p.partyName || '-'}</td>
                <td>${p.type === 'advance' ? 'Advance' : 'Partial'}</td>
                <td>${window.formatCurrency ? window.formatCurrency(p.amount) : p.amount}</td>
                <td>${p.note || '-'}</td>
            </tr>
        `).join('');
    }

    // Live listeners (offline-capable)
    onSnapshot(collection(db, 'parties'), (snap) => {
        parties = [];
        snap.forEach(d => parties.push({ id: d.id, ...d.data() }));
        renderPartiesTable();
        checkCreditLimitAlerts();
    });

    onSnapshot(query(collection(db, 'partyPayments'), orderBy('createdAt', 'desc')), (snap) => {
        payments = [];
        snap.forEach(d => payments.push({ id: d.id, ...d.data() }));
        renderPaymentsTable();
        renderPartiesTable();
    });

    document.getElementById('caSearch').addEventListener('keyup', renderPartiesTable);

    let alertedParties = new Set();
    function checkCreditLimitAlerts() {
        parties.forEach(p => {
            const balance = Number(p.udhaar_balance || 0);
            const limit = Number(p.creditLimit || 0);
            if (limit > 0 && balance > limit && !alertedParties.has(p.id)) {
                alertedParties.add(p.id);
                if (window.showToast) {
                    window.showToast(`⚠️ ${p.name} apni credit limit se ${window.formatCurrency ? window.formatCurrency(balance - limit) : (balance - limit)} zyada le chuka hai!`, 'error');
                }
            }
            if (!(limit > 0 && balance > limit)) alertedParties.delete(p.id);
        });
    }

    document.getElementById('caPaymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const partyId = document.getElementById('caPartyId').value;
        const type = document.getElementById('caType').value;
        const amount = parseFloat(document.getElementById('caAmount').value) || 0;
        const newLimit = document.getElementById('caCreditLimit').value;
        const party = parties.find(p => p.id === partyId);
        if (!party || amount <= 0) return;

        try {
            const data = {
                partyId,
                partyName: party.name,
                type, // 'advance' or 'partial'
                amount,
                method: 'cash',
                date: document.getElementById('caDate').value || new Date().toISOString().slice(0, 10),
                note: document.getElementById('caNote').value,
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(db, 'partyPayments'), data);

            // Both advance and partial reduce the customer's outstanding balance
            const newBalance = Number(party.udhaar_balance || 0) - amount;
            const updates = { udhaar_balance: newBalance };
            if (newLimit !== '' && newLimit !== null) updates.creditLimit = parseFloat(newLimit) || 0;
            await updateDoc(doc(db, 'parties', partyId), updates);

            if (window.logAudit) window.logAudit('Payment', `${type === 'advance' ? 'Advance' : 'Partial'} payment of ${amount} recorded for ${party.name}`);
            if (window.showToast) window.showToast('✅ Payment recorded', 'success');
            document.getElementById('caPaymentModal').style.display = 'none';
        } catch (err) {
            if (window.showToast) window.showToast('❌ Error: ' + err.message, 'error');
        }
    });
})();
