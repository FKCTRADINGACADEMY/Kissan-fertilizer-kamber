/**
 * Kissan Fertilizer — Phase 5: Reports & Analysis
 * - Profitability (Bill / Item / Party)
 * - Sales & Purchase Analysis (Item + Party)
 * - Cash Flow / Funds Flow
 * - Ratio Analysis
 * - Daily / Monthly Summaries
 * - Columnar Cash Book
 * - Masters / Vouchers Statistics
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v65-phase5';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmt(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  }
  function range() {
    const from =
      global.REPORT_FROM ||
      new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = global.REPORT_TO || todayISO();
    return { from, to };
  }
  function inRange(date, from, to) {
    if (!date) return false;
    return date >= from && date <= to;
  }
  function productCost(s) {
    if (!s || s.isGeneric || !s.productId) return 0;
    const p = ((global.STATE && global.STATE.products) || []).find((x) => x.id === s.productId);
    return Number(p?.purchasePrice || 0) * Number(s.qty || 0);
  }
  function saleProfit(s) {
    const total = Number(s.total || 0);
    const agent = Number(s.agentPay || 0);
    const cost = productCost(s);
    if (agent > 0) return total - cost + (total - agent);
    return total - cost;
  }

  function dateRangeBar(pageId) {
    const { from, to } = range();
    return `
    <div class="stitch panel">
      <div class="panel-head"><h3>Date range</h3>
        <div class="toolbar">
          <input type="date" id="p5From" value="${from}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
          <input type="date" id="p5To" value="${to}" style="padding:8px 10px;border:1.5px solid var(--line);border-radius:9px">
          <button class="btn btn-primary btn-sm" onclick="window.KissanPhase5.applyRange('${pageId}')">Apply</button>
          <button class="btn btn-outline btn-sm" onclick="window.KissanPhase5.exportTableExcel('${pageId}')">Excel</button>
        </div>
      </div>
    </div>`;
  }
  function applyRange(pageId) {
    const f = document.getElementById('p5From')?.value;
    const t = document.getElementById('p5To')?.value;
    if (f) global.REPORT_FROM = f;
    if (t) global.REPORT_TO = t;
    if (typeof global.goPage === 'function') global.goPage(pageId || global.ACTIVE_PAGE);
  }

  /* ---------- Profitability ---------- */
  function pageProfitability() {
    const { from, to } = range();
    const sales = ((global.STATE && global.STATE.sales) || []).filter((s) => inRange(s.date, from, to));
    const exp = ((global.STATE && global.STATE.expenses) || [])
      .filter((e) => inRange(e.date, from, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);

    // Bill-wise
    const billRows = sales
      .map((s) => ({
        date: s.date,
        docNo: s.docNo,
        party: s.partyName || 'Walk-in',
        product: s.productName,
        total: Number(s.total || 0),
        cost: productCost(s),
        profit: saleProfit(s)
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Item-wise
    const byItem = {};
    sales.forEach((s) => {
      const k = s.productName || '—';
      if (!byItem[k]) byItem[k] = { name: k, qty: 0, sales: 0, cost: 0, profit: 0 };
      byItem[k].qty += Number(s.qty || 0);
      byItem[k].sales += Number(s.total || 0);
      byItem[k].cost += productCost(s);
      byItem[k].profit += saleProfit(s);
    });
    const itemRows = Object.values(byItem).sort((a, b) => b.profit - a.profit);

    // Party-wise
    const byParty = {};
    sales.forEach((s) => {
      const k = s.partyName || 'Walk-in';
      if (!byParty[k]) byParty[k] = { name: k, bills: 0, sales: 0, profit: 0 };
      byParty[k].bills += 1;
      byParty[k].sales += Number(s.total || 0);
      byParty[k].profit += saleProfit(s);
    });
    const partyRows = Object.values(byParty).sort((a, b) => b.profit - a.profit);

    const gross = billRows.reduce((a, r) => a + r.profit, 0);
    const net = gross - exp;
    const tab = global._p5ProfitTab || 'bill';

    return `
    <div class="page-head"><div><h2>Profitability</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('profitability')}
    <div class="stats">
      <div class="stitch stat ok"><div class="lbl">Gross profit</div><div class="val">${fmt(gross)}</div></div>
      <div class="stitch stat red"><div class="lbl">Expenses</div><div class="val">${fmt(exp)}</div></div>
      <div class="stitch stat ${net >= 0 ? 'ok' : 'red'}"><div class="lbl">Net profit</div><div class="val">${fmt(net)}</div></div>
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-sm ${tab === 'bill' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='bill';goPage('profitability')">Bill-wise</button>
      <button class="btn btn-sm ${tab === 'item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='item';goPage('profitability')">Item-wise</button>
      <button class="btn btn-sm ${tab === 'party' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5ProfitTab='party';goPage('profitability')">Party-wise</button>
    </div>
    <div class="stitch panel" id="p5TableWrap">
      ${
        tab === 'item'
          ? `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th><th class="right">Margin %</th></tr></thead>
        <tbody>${
          itemRows.length
            ? itemRows
                .map(
                  (r) =>
                    `<tr><td>${r.name}</td><td class="right mono">${r.qty}</td><td class="right mono">${fmt(r.sales)}</td><td class="right mono">${fmt(r.cost)}</td><td class="right mono" style="font-weight:700;color:${r.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.profit)}</td><td class="right mono">${r.sales ? ((r.profit / r.sales) * 100).toFixed(1) : 0}%</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="6">No data</td></tr>'
        }</tbody></table></div>`
          : tab === 'party'
            ? `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Party</th><th class="right">Bills</th><th class="right">Sales</th><th class="right">Profit</th><th class="right">Margin %</th></tr></thead>
        <tbody>${
          partyRows.length
            ? partyRows
                .map(
                  (r) =>
                    `<tr><td>${r.name}</td><td class="right mono">${r.bills}</td><td class="right mono">${fmt(r.sales)}</td><td class="right mono" style="font-weight:700">${fmt(r.profit)}</td><td class="right mono">${r.sales ? ((r.profit / r.sales) * 100).toFixed(1) : 0}%</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="5">No data</td></tr>'
        }</tbody></table></div>`
            : `<div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Date</th><th>Doc</th><th>Party</th><th>Product</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th></tr></thead>
        <tbody>${
          billRows.length
            ? billRows
                .map(
                  (r) =>
                    `<tr><td class="mono">${r.date}</td><td class="mono">${r.docNo || '—'}</td><td>${r.party}</td><td>${r.product}</td><td class="right mono">${fmt(r.total)}</td><td class="right mono">${fmt(r.cost)}</td><td class="right mono" style="font-weight:700;color:${r.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.profit)}</td></tr>`
                )
                .join('')
            : '<tr class="empty-row"><td colspan="7">No data</td></tr>'
        }</tbody></table></div>`
      }
    </div>`;
  }

  /* ---------- Sales / Purchase Analysis ---------- */
  function pageSalesAnalysis() {
    const { from, to } = range();
    const sales = ((global.STATE && global.STATE.sales) || []).filter((s) => inRange(s.date, from, to));
    const purch = ((global.STATE && global.STATE.purchases) || []).filter((p) => inRange(p.date, from, to));
    const mode = global._p5SaMode || 'sales-item';

    function group(rows, nameKey, qtyKey, amtKey) {
      const m = {};
      rows.forEach((r) => {
        const k = r[nameKey] || '—';
        if (!m[k]) m[k] = { name: k, qty: 0, amount: 0, count: 0 };
        m[k].qty += Number(r[qtyKey] || 0);
        m[k].amount += Number(r[amtKey] || 0);
        m[k].count += 1;
      });
      return Object.values(m).sort((a, b) => b.amount - a.amount);
    }

    let title = '';
    let data = [];
    if (mode === 'sales-item') {
      title = 'Sales — Item-wise';
      data = group(sales, 'productName', 'qty', 'total');
    } else if (mode === 'sales-party') {
      title = 'Sales — Party-wise';
      data = group(sales, 'partyName', 'qty', 'total');
    } else if (mode === 'purch-item') {
      title = 'Purchase — Item-wise';
      data = group(purch, 'productName', 'qty', 'total');
    } else {
      title = 'Purchase — Supplier-wise';
      data = group(purch, 'supplierName', 'qty', 'total');
    }

    return `
    <div class="page-head"><div><h2>Sales / Purchase Analysis</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('salesanalysis')}
    <div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-sm ${mode === 'sales-item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='sales-item';goPage('salesanalysis')">Sales × Item</button>
      <button class="btn btn-sm ${mode === 'sales-party' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='sales-party';goPage('salesanalysis')">Sales × Party</button>
      <button class="btn btn-sm ${mode === 'purch-item' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='purch-item';goPage('salesanalysis')">Purchase × Item</button>
      <button class="btn btn-sm ${mode === 'purch-sup' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SaMode='purch-sup';goPage('salesanalysis')">Purchase × Supplier</button>
    </div>
    <div class="stitch panel">
      <div class="panel-head"><h3>${title}</h3></div>
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Name</th><th class="right">Entries</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${
            data.length
              ? data
                  .map(
                    (r) =>
                      `<tr><td style="font-weight:600">${r.name}</td><td class="right mono">${r.count}</td><td class="right mono">${r.qty}</td><td class="right mono" style="font-weight:700">${fmt(r.amount)}</td></tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="4">No data in range</td></tr>'
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Cash / Funds Flow ---------- */
  function pageCashFlow() {
    const { from, to } = range();
    const STATE = global.STATE || {};
    const cashSales = (STATE.sales || [])
      .filter((s) => inRange(s.date, from, to) && (s.payMode === 'Cash' || !s.payMode || Number(s.payCash || 0) > 0))
      .reduce((a, s) => a + (Number(s.payCash) > 0 ? Number(s.payCash) : Number(s.total || 0)), 0);
    const bankSales = (STATE.sales || [])
      .filter((s) => inRange(s.date, from, to))
      .reduce((a, s) => a + Number(s.payBank || 0), 0);
    const vIn = (STATE.vouchers || [])
      .filter((v) => v.type === 'In' && inRange(v.date, from, to))
      .reduce((a, v) => a + Number(v.amount || 0), 0);
    const partyIn = (STATE.payments || [])
      .filter((p) => p.partyType === 'party' && !p.isGiven && inRange(p.date, from, to))
      .reduce((a, p) => a + Number(p.amount || 0), 0);
    const cashPurch = (STATE.purchases || [])
      .filter((p) => inRange(p.date, from, to) && p.payMode === 'Cash')
      .reduce((a, p) => a + Number(p.total || 0), 0);
    const exp = (STATE.expenses || [])
      .filter((e) => inRange(e.date, from, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);
    const vOut = (STATE.vouchers || [])
      .filter((v) => v.type === 'Out' && inRange(v.date, from, to))
      .reduce((a, v) => a + Number(v.amount || 0), 0);
    const supPay = (STATE.payments || [])
      .filter((p) => p.partyType === 'supplier' && !p.isGiven && inRange(p.date, from, to))
      .reduce((a, p) => a + Number(p.amount || 0), 0);

    const inflow = cashSales + bankSales + vIn + partyIn;
    const outflow = cashPurch + exp + vOut + supPay;
    const net = inflow - outflow;

    const lines = [
      { side: 'In', label: 'Cash sales', amount: cashSales },
      { side: 'In', label: 'Bank / online sales', amount: bankSales },
      { side: 'In', label: 'Cash vouchers (In)', amount: vIn },
      { side: 'In', label: 'Party wasool', amount: partyIn },
      { side: 'Out', label: 'Cash purchases', amount: cashPurch },
      { side: 'Out', label: 'Expenses', amount: exp },
      { side: 'Out', label: 'Cash vouchers (Out)', amount: vOut },
      { side: 'Out', label: 'Supplier payments', amount: supPay }
    ];

    return `
    <div class="page-head"><div><h2>Cash / Funds Flow</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('cashflow')}
    <div class="stats">
      <div class="stitch stat ok"><div class="lbl">Total inflow</div><div class="val">${fmt(inflow)}</div></div>
      <div class="stitch stat red"><div class="lbl">Total outflow</div><div class="val">${fmt(outflow)}</div></div>
      <div class="stitch stat ${net >= 0 ? 'ok' : 'red'}"><div class="lbl">Net cash flow</div><div class="val">${fmt(net)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Flow</th><th>Particulars</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${lines
            .map(
              (l) =>
                `<tr><td><span class="stamp ${l.side === 'In' ? 'ok' : 'bad'}">${l.side}</span></td><td>${l.label}</td><td class="right mono" style="font-weight:700">${fmt(l.amount)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Ratio Analysis ---------- */
  function pageRatios() {
    const STATE = global.STATE || {};
    const receivable = (STATE.parties || []).reduce(
      (s, p) => s + (typeof global.partyBalance === 'function' ? Math.max(0, global.partyBalance(p.id)) : 0),
      0
    );
    const payable = (STATE.suppliers || []).reduce(
      (s, p) => s + (typeof global.supplierBalance === 'function' ? Math.max(0, global.supplierBalance(p.id)) : 0),
      0
    );
    const stockValue = (STATE.products || []).reduce((a, p) => {
      const st =
        typeof global.productEffectiveStock === 'function'
          ? global.productEffectiveStock(p)
          : Number(p.stock || 0);
      return a + st * Number(p.purchasePrice || 0);
    }, 0);
    // Approximate cash from last 90 days net (simplified current asset proxy)
    const from90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = todayISO();
    const sales90 = (STATE.sales || [])
      .filter((s) => inRange(s.date, from90, to))
      .reduce((a, s) => a + Number(s.total || 0), 0);
    const purch90 = (STATE.purchases || [])
      .filter((p) => inRange(p.date, from90, to))
      .reduce((a, p) => a + Number(p.total || 0), 0);
    const exp90 = (STATE.expenses || [])
      .filter((e) => inRange(e.date, from90, to))
      .reduce((a, e) => a + Number(e.amount || 0), 0);
    const cogs = purch90; // approx
    const grossProfit = sales90 - cogs;
    const netProfit = grossProfit - exp90;
    const currentAssets = stockValue + receivable; // + cash unknown fully
    const currentLiab = payable || 1;
    const currentRatio = currentAssets / currentLiab;
    const quickRatio = receivable / currentLiab;
    const inventoryTurnover = cogs / (stockValue || 1);
    const avgCollection = receivable > 0 && sales90 > 0 ? (receivable / sales90) * 90 : 0;
    const recvTurnover = sales90 / (receivable || 1);
    const debtEquity = payable / (currentAssets - payable || 1);
    const grossMargin = sales90 ? (grossProfit / sales90) * 100 : 0;
    const netMargin = sales90 ? (netProfit / sales90) * 100 : 0;

    const ratios = [
      { group: 'Liquidity', name: 'Current Ratio', value: currentRatio.toFixed(2), note: 'CA / CL (stock+recv / payable)' },
      { group: 'Liquidity', name: 'Quick Ratio', value: quickRatio.toFixed(2), note: 'Receivable / Payable' },
      { group: 'Turnover', name: 'Inventory Turnover', value: inventoryTurnover.toFixed(2), note: 'COGS / Stock value (90d)' },
      { group: 'Turnover', name: 'Avg Collection Period (days)', value: avgCollection.toFixed(0), note: 'Receivable / Sales × 90' },
      { group: 'Turnover', name: 'Receivable Turnover', value: recvTurnover.toFixed(2), note: 'Sales / Receivable' },
      { group: 'Leverage', name: 'Debt / Equity (approx)', value: debtEquity.toFixed(2), note: 'Payable / (CA − Payable)' },
      { group: 'Profitability', name: 'Gross Margin %', value: grossMargin.toFixed(1) + '%', note: '90-day window' },
      { group: 'Profitability', name: 'Net Margin %', value: netMargin.toFixed(1) + '%', note: 'After expenses' }
    ];

    return `
    <div class="page-head"><div><h2>Ratio Analysis</h2><p>Based on live balances + last 90 days activity</p></div></div>
    <div class="stats">
      <div class="stitch stat"><div class="lbl">Stock value</div><div class="val">${fmt(stockValue)}</div></div>
      <div class="stitch stat red"><div class="lbl">Receivable</div><div class="val">${fmt(receivable)}</div></div>
      <div class="stitch stat info"><div class="lbl">Payable</div><div class="val">${fmt(payable)}</div></div>
      <div class="stitch stat"><div class="lbl">Sales (90d)</div><div class="val">${fmt(sales90)}</div></div>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Group</th><th>Ratio</th><th class="right">Value</th><th>Note</th></tr></thead>
        <tbody>
          ${ratios
            .map(
              (r) =>
                `<tr><td><span class="stamp mute">${r.group}</span></td><td style="font-weight:600">${r.name}</td><td class="right mono" style="font-weight:800">${r.value}</td><td class="muted">${r.note}</td></tr>`
            )
            .join('')}
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">Ye ratios approximation hain (cash-in-hand full balance sheet ke baghair). Decision support ke liye use karein.</p>
    </div>`;
  }

  /* ---------- Daily / Monthly Summaries ---------- */
  function pageSummaries() {
    const mode = global._p5SumMode || 'daily';
    const STATE = global.STATE || {};
    const map = {};

    function keyFromDate(d) {
      if (!d) return '';
      return mode === 'monthly' ? d.slice(0, 7) : d;
    }

    (STATE.sales || []).forEach((s) => {
      const k = keyFromDate(s.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].sales += Number(s.total || 0);
      map[k].profit += saleProfit(s);
      map[k].sc += 1;
    });
    (STATE.purchases || []).forEach((p) => {
      const k = keyFromDate(p.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].purch += Number(p.total || 0);
      map[k].pc += 1;
    });
    (STATE.expenses || []).forEach((e) => {
      const k = keyFromDate(e.date);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, sales: 0, purch: 0, exp: 0, profit: 0, sc: 0, pc: 0 };
      map[k].exp += Number(e.amount || 0);
    });

    const rows = Object.values(map)
      .map((r) => ({ ...r, net: r.profit - r.exp }))
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 60);

    return `
    <div class="page-head"><div><h2>Daily / Monthly Summaries</h2><p>Sales, purchase, expense, profit</p></div></div>
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-sm ${mode === 'daily' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SumMode='daily';goPage('summaries')">Daily</button>
      <button class="btn btn-sm ${mode === 'monthly' ? 'btn-primary' : 'btn-outline'}" onclick="window._p5SumMode='monthly';goPage('summaries')">Monthly</button>
      <button class="btn btn-outline btn-sm" onclick="window.KissanPhase5.exportTableExcel('summaries')">Excel</button>
    </div>
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>${mode === 'monthly' ? 'Month' : 'Date'}</th><th class="right">Sales</th><th class="right">Purchases</th><th class="right">Expenses</th><th class="right">Gross profit</th><th class="right">Net</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) =>
                      `<tr>
              <td class="mono" style="font-weight:600">${r.key}</td>
              <td class="right mono">${fmt(r.sales)} <span class="muted">(${r.sc})</span></td>
              <td class="right mono">${fmt(r.purch)} <span class="muted">(${r.pc})</span></td>
              <td class="right mono">${fmt(r.exp)}</td>
              <td class="right mono">${fmt(r.profit)}</td>
              <td class="right mono" style="font-weight:800;color:${r.net >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(r.net)}</td>
            </tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="6">No data</td></tr>'
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Columnar Cash Book ---------- */
  function pageCashBook() {
    const { from, to } = range();
    const STATE = global.STATE || {};
    const rows = [];

    (STATE.sales || []).forEach((s) => {
      if (!inRange(s.date, from, to)) return;
      const cash = Number(s.payCash) > 0 ? Number(s.payCash) : s.payMode === 'Cash' || !s.payMode ? Number(s.total || 0) : 0;
      if (cash > 0) rows.push({ date: s.date, particular: `Sale ${s.docNo || ''} · ${s.partyName || ''}`, debit: cash, credit: 0, ref: s.docNo });
    });
    (STATE.purchases || []).forEach((p) => {
      if (!inRange(p.date, from, to) || p.payMode !== 'Cash') return;
      rows.push({ date: p.date, particular: `Purchase ${p.docNo || ''} · ${p.supplierName || ''}`, debit: 0, credit: Number(p.total || 0), ref: p.docNo });
    });
    (STATE.expenses || []).forEach((e) => {
      if (!inRange(e.date, from, to)) return;
      rows.push({ date: e.date, particular: `Expense · ${e.category || ''}`, debit: 0, credit: Number(e.amount || 0), ref: '' });
    });
    (STATE.vouchers || []).forEach((v) => {
      if (!inRange(v.date, from, to)) return;
      if (v.type === 'In') rows.push({ date: v.date, particular: v.note || 'Cash In', debit: Number(v.amount || 0), credit: 0, ref: '' });
      else rows.push({ date: v.date, particular: v.note || 'Cash Out', debit: 0, credit: Number(v.amount || 0), ref: '' });
    });
    (STATE.payments || []).forEach((p) => {
      if (!inRange(p.date, from, to)) return;
      if (p.partyType === 'party' && !p.isGiven)
        rows.push({ date: p.date, particular: `Wasool · ${p.partyName || ''}`, debit: Number(p.amount || 0), credit: 0, ref: '' });
      if (p.partyType === 'supplier' && !p.isGiven)
        rows.push({ date: p.date, particular: `Supplier pay · ${p.partyName || ''}`, debit: 0, credit: Number(p.amount || 0), ref: '' });
    });

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.particular.localeCompare(b.particular));
    let bal = 0;
    const withBal = rows.map((r) => {
      bal += Number(r.debit || 0) - Number(r.credit || 0);
      return { ...r, bal };
    });
    const totD = withBal.reduce((a, r) => a + Number(r.debit || 0), 0);
    const totC = withBal.reduce((a, r) => a + Number(r.credit || 0), 0);

    return `
    <div class="page-head"><div><h2>Columnar Cash Book</h2><p>${from} → ${to}</p></div></div>
    ${dateRangeBar('cashbook')}
    <div class="stitch panel">
      <div class="tbl-wrap"><table class="tbl" id="p5DataTable">
        <thead><tr><th>Date</th><th>Particulars</th><th class="right">Debit (In)</th><th class="right">Credit (Out)</th><th class="right">Balance</th></tr></thead>
        <tbody>
          ${
            withBal.length
              ? withBal
                  .map(
                    (r) =>
                      `<tr>
              <td class="mono">${r.date}</td>
              <td>${r.particular}</td>
              <td class="right mono">${r.debit ? fmt(r.debit) : '—'}</td>
              <td class="right mono">${r.credit ? fmt(r.credit) : '—'}</td>
              <td class="right mono" style="font-weight:700">${fmt(r.bal)}</td>
            </tr>`
                  )
                  .join('')
              : '<tr class="empty-row"><td colspan="5">No cash entries in range</td></tr>'
          }
          ${
            withBal.length
              ? `<tr style="background:var(--field-soft)"><td colspan="2" style="font-weight:800">TOTAL</td><td class="right mono" style="font-weight:800">${fmt(totD)}</td><td class="right mono" style="font-weight:800">${fmt(totC)}</td><td class="right mono" style="font-weight:800">${fmt(bal)}</td></tr>`
              : ''
          }
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Statistics ---------- */
  function pageStatistics() {
    const S = global.STATE || {};
    const masters = [
      { name: 'Products', count: (S.products || []).length },
      { name: 'Parties', count: (S.parties || []).length },
      { name: 'Suppliers', count: (S.suppliers || []).length },
      { name: 'Godams', count: (S.godams || []).length },
      { name: 'Users / Staff', count: (S.users || []).length },
      { name: 'Batches', count: (S.batches || []).length }
    ];
    const vouchers = [
      { name: 'Sales', count: (S.sales || []).length },
      { name: 'Purchases', count: (S.purchases || []).length },
      { name: 'Sales Orders', count: (S.salesOrders || []).length },
      { name: 'Purchase Orders', count: (S.purchaseOrders || []).length },
      { name: 'Quotations', count: (S.quotations || []).length },
      { name: 'Sales Returns', count: (S.salesReturns || []).length },
      { name: 'Purchase Returns', count: (S.purchaseReturns || []).length },
      { name: 'Cash vouchers', count: (S.vouchers || []).length },
      { name: 'Payments', count: (S.payments || []).length },
      { name: 'Expenses', count: (S.expenses || []).length },
      { name: 'Payroll', count: (S.payroll || []).length },
      { name: 'Daily closings', count: (S.dailyClosings || []).length },
      { name: 'Stock moves', count: (S.stockMoves || []).length },
      { name: 'Audit log', count: (S.audit || []).length }
    ];
    const totalM = masters.reduce((a, x) => a + x.count, 0);
    const totalV = vouchers.reduce((a, x) => a + x.count, 0);

    return `
    <div class="page-head"><div><h2>Masters / Vouchers Statistics</h2><p>App version ${APP_VERSION}</p></div></div>
    <div class="stats">
      <div class="stitch stat"><div class="lbl">Master records</div><div class="val">${totalM}</div></div>
      <div class="stitch stat gold"><div class="lbl">Voucher / txn records</div><div class="val">${totalV}</div></div>
    </div>
    <div class="dash-grid">
      <div class="stitch panel">
        <div class="panel-head"><h3>Masters</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Master</th><th class="right">Count</th></tr></thead>
        <tbody>${masters.map((m) => `<tr><td>${m.name}</td><td class="right mono" style="font-weight:700">${m.count}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="stitch panel">
        <div class="panel-head"><h3>Vouchers / Transactions</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="right">Count</th></tr></thead>
        <tbody>${vouchers.map((m) => `<tr><td>${m.name}</td><td class="right mono" style="font-weight:700">${m.count}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;
  }

  /* ---------- Excel export ---------- */
  function exportTableExcel(pageId) {
    const table = document.getElementById('p5DataTable');
    if (!table || !window.XLSX) {
      global.toast('No table / Excel library missing', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, pageId || 'Report');
    XLSX.writeFile(wb, `kissan_${pageId || 'report'}_${todayISO()}.xlsx`);
    global.toast('Excel downloaded', 'success');
  }

  // Sync version for update banner
  if (global.KissanPhase4) {
    try {
      global.KissanPhase4.APP_VERSION = APP_VERSION;
    } catch (e) {}
  }
  localStorage.setItem('kissan_app_version', APP_VERSION);

  global.KissanPhase5 = {
    APP_VERSION,
    applyRange,
    exportTableExcel,
    pageProfitability,
    pageSalesAnalysis,
    pageCashFlow,
    pageRatios,
    pageSummaries,
    pageCashBook,
    pageStatistics
  };
})(window);
