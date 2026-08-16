// ==============================================
// MODULE: BATCH NUMBER TRACKING + WEIGHT-WISE / BAG-WISE / LOOSE SALE
// Self-contained. Uses the existing 'products' collection (adds unitType,
// bagWeightKg fields) and a new 'productBatches' collection for multiple
// batch/expiry lines per product. Offline-capable via Firestore local cache.
// ==============================================
import {
    collection, doc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where
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
    const root = document.getElementById('module-batch-weight-root');
    if (!root) return;

    let products = [];
    let batches = [];

    root.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-weight-hanging"></i> Batch Number & Weight / Bag-wise Sale</h1>
            <button class="btn-primary" id="bwOpenBatchBtn"><i class="fas fa-plus"></i> Add Batch Entry</button>
        </div>

        <div class="card settings-section">
            <h3><i class="fas fa-calculator"></i> Quick Weight Calculator</h3>
            <div class="form-grid-2">
                <div><label>Number of Bags</label><input type="number" id="bwCalcBags" min="0" step="0.01" placeholder="e.g. 20" /></div>
                <div><label>Weight per Bag (KG)</label><input type="number" id="bwCalcPerBag" min="0" step="0.01" placeholder="e.g. 50" /></div>
            </div>
            <p style="margin-top:8px;font-size:15px;">Total Weight: <b id="bwCalcResult">0 KG</b></p>
        </div>

        <div class="page-header" style="margin-top:16px;">
            <h1 style="font-size:18px;"><i class="fas fa-flask"></i> Set Sale Unit Type per Product</h1>
        </div>
        <div class="filter-bar">
            <input type="text" id="bwProductSearch" placeholder="🔍 Search product..." />
        </div>
        <div class="table-container">
            <table>
                <thead><tr><th>#</th><th>Product</th><th>Stock</th><th>Unit Type</th><th>Weight / Bag (KG)</th><th>Last Batch No</th><th>Actions</th></tr></thead>
                <tbody id="bwProductsTable"><tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
            </table>
        </div>

        <div class="page-header" style="margin-top:16px;">
            <h1 style="font-size:18px;"><i class="fas fa-boxes"></i> Batch / Lot Entries</h1>
        </div>
        <div class="table-container">
            <table>
                <thead><tr><th>Product</th><th>Batch No</th><th>Expiry</th><th>Qty</th><th>Unit</th><th>Actions</th></tr></thead>
                <tbody id="bwBatchesTable"><tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Loading...</td></tr></tbody>
            </table>
        </div>
    `;

    // Modal: batch entry
    if (!document.getElementById('bwBatchModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'bwBatchModal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" id="bwCloseModal">&times;</span>
                <h2>Add Batch / Lot Entry</h2>
                <form id="bwBatchForm">
                    <div class="form-group"><label>Product *</label><select id="bwBatchProduct" required></select></div>
                    <div class="form-row">
                        <div class="form-group"><label>Batch / Lot No *</label><input type="text" id="bwBatchNo" required /></div>
                        <div class="form-group"><label>Expiry Date</label><input type="date" id="bwBatchExpiry" /></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Quantity *</label><input type="number" id="bwBatchQty" min="0.01" step="0.01" required /></div>
                        <div class="form-group"><label>Unit</label>
                            <select id="bwBatchUnit">
                                <option value="bag">Bag</option>
                                <option value="kg">Weight (KG)</option>
                                <option value="loose">Loose</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="bwCancelBtn">Cancel</button>
                        <button type="submit" class="btn-primary">Save Batch</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('bwCloseModal').onclick = () => modal.style.display = 'none';
        document.getElementById('bwCancelBtn').onclick = () => modal.style.display = 'none';
    }

    // Modal: unit-type edit
    if (!document.getElementById('bwUnitModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'bwUnitModal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" id="bwUnitCloseModal">&times;</span>
                <h2>Set Sale Unit Type</h2>
                <form id="bwUnitForm">
                    <input type="hidden" id="bwUnitProductId" />
                    <div class="form-group"><label>Product</label><input type="text" id="bwUnitProductName" disabled /></div>
                    <div class="form-group"><label>Unit Type</label>
                        <select id="bwUnitType">
                            <option value="bag">Bag-wise</option>
                            <option value="kg">Weight-wise (KG)</option>
                            <option value="loose">Loose</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Weight per Bag (KG) — only if Bag-wise</label><input type="number" id="bwUnitBagWeight" min="0" step="0.01" /></div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="bwUnitCancelBtn">Cancel</button>
                        <button type="submit" class="btn-primary">Save</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('bwUnitCloseModal').onclick = () => modal.style.display = 'none';
        document.getElementById('bwUnitCancelBtn').onclick = () => modal.style.display = 'none';
    }

    // Weight calculator (pure client-side, auto)
    function recalc() {
        const bags = parseFloat(document.getElementById('bwCalcBags').value) || 0;
        const perBag = parseFloat(document.getElementById('bwCalcPerBag').value) || 0;
        document.getElementById('bwCalcResult').textContent = (bags * perBag).toLocaleString('en-PK') + ' KG';
    }
    document.getElementById('bwCalcBags').addEventListener('input', recalc);
    document.getElementById('bwCalcPerBag').addEventListener('input', recalc);

    document.getElementById('bwOpenBatchBtn').onclick = () => {
        document.getElementById('bwBatchForm').reset();
        const sel = document.getElementById('bwBatchProduct');
        sel.innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        document.getElementById('bwBatchModal').style.display = 'flex';
    };

    function lastBatchFor(productId) {
        const list = batches.filter(b => b.productId === productId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return list[0] ? list[0].batchNo : '-';
    }

    function renderProductsTable() {
        const tbody = document.getElementById('bwProductsTable');
        if (!tbody) return;
        const search = (document.getElementById('bwProductSearch')?.value || '').toLowerCase();
        const list = products.filter(p => (p.name || '').toLowerCase().includes(search));
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No products found</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${p.name}</td>
                <td>${p.stock_quantity ?? 0}</td>
                <td>${(p.unitType || 'bag').toUpperCase()}</td>
                <td>${p.bagWeightKg || '-'}</td>
                <td>${lastBatchFor(p.id)}</td>
                <td><button class="btn-sm" data-unit-edit="${p.id}"><i class="fas fa-edit"></i> Unit</button></td>
            </tr>
        `).join('');
        tbody.querySelectorAll('[data-unit-edit]').forEach(btn => {
            btn.onclick = () => {
                const p = products.find(x => x.id === btn.dataset.unitEdit);
                if (!p) return;
                document.getElementById('bwUnitProductId').value = p.id;
                document.getElementById('bwUnitProductName').value = p.name;
                document.getElementById('bwUnitType').value = p.unitType || 'bag';
                document.getElementById('bwUnitBagWeight').value = p.bagWeightKg || '';
                document.getElementById('bwUnitModal').style.display = 'flex';
            };
        });
    }

    function renderBatchesTable() {
        const tbody = document.getElementById('bwBatchesTable');
        if (!tbody) return;
        const list = batches.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 40);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No batch entries yet</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(b => `
            <tr>
                <td>${b.productName}</td>
                <td>${b.batchNo}</td>
                <td>${b.expiryDate || '-'}</td>
                <td>${b.qty}</td>
                <td>${(b.unit || 'bag').toUpperCase()}</td>
                <td><button class="btn-sm btn-danger" data-batch-del="${b.id}"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
        tbody.querySelectorAll('[data-batch-del]').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Remove this batch entry?')) return;
                await deleteDoc(doc(db, 'productBatches', btn.dataset.batchDel));
                if (window.showToast) window.showToast('✅ Batch entry removed', 'success');
            };
        });
    }

    onSnapshot(collection(db, 'products'), (snap) => {
        products = [];
        snap.forEach(d => products.push({ id: d.id, ...d.data() }));
        renderProductsTable();
        renderBatchesTable();
    });

    onSnapshot(collection(db, 'productBatches'), (snap) => {
        batches = [];
        snap.forEach(d => batches.push({ id: d.id, ...d.data() }));
        renderProductsTable();
        renderBatchesTable();
    });

    document.getElementById('bwProductSearch').addEventListener('keyup', renderProductsTable);

    document.getElementById('bwBatchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('bwBatchProduct').value;
        const product = products.find(p => p.id === productId);
        if (!product) return;
        try {
            await addDoc(collection(db, 'productBatches'), {
                productId,
                productName: product.name,
                batchNo: document.getElementById('bwBatchNo').value,
                expiryDate: document.getElementById('bwBatchExpiry').value || null,
                qty: parseFloat(document.getElementById('bwBatchQty').value) || 0,
                unit: document.getElementById('bwBatchUnit').value,
                createdAt: new Date().toISOString()
            });
            // Also keep the product's own lot/expiry fields in sync automatically (used elsewhere in the app)
            await updateDoc(doc(db, 'products', productId), {
                lot_number: document.getElementById('bwBatchNo').value,
                expiry_date: document.getElementById('bwBatchExpiry').value || null
            });
            if (window.logAudit) window.logAudit('Batch', `Batch ${document.getElementById('bwBatchNo').value} added for ${product.name}`);
            if (window.showToast) window.showToast('✅ Batch entry saved', 'success');
            document.getElementById('bwBatchModal').style.display = 'none';
        } catch (err) {
            if (window.showToast) window.showToast('❌ Error: ' + err.message, 'error');
        }
    });

    document.getElementById('bwUnitForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('bwUnitProductId').value;
        try {
            await updateDoc(doc(db, 'products', id), {
                unitType: document.getElementById('bwUnitType').value,
                bagWeightKg: parseFloat(document.getElementById('bwUnitBagWeight').value) || null
            });
            if (window.showToast) window.showToast('✅ Unit type updated', 'success');
            document.getElementById('bwUnitModal').style.display = 'none';
        } catch (err) {
            if (window.showToast) window.showToast('❌ Error: ' + err.message, 'error');
        }
    });
})();
