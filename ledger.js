/**
 * Kissan Fertilizer — Phase 8
 * Traditional Bahi-Khata / Party Ledger (hath wali book style)
 * Columns: Date | Detail | Page | Dr | Cr | Balance
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v68-phase8';

  function fmtNum(n) {
    const x = Math.abs(Number(n) || 0);
    if (!x) return '';
    return x.toLocaleString('en-PK');
  }
  function fmtRs(n) {
    return typeof global.fmt === 'function'
      ? global.fmt(n)
      : 'Rs. ' + (Number(n) || 0).toLocaleString('en-PK');
  }

  function buildLedgerRows(partyType, partyId) {
    const STATE = global.STATE || {};
    const isCustomer = partyType === 'party';
    const party = isCustomer
      ? (STATE.parties || []).find((x) => x.id === partyId)
      : (STATE.suppliers || []).find((x) => x.id === partyId);
    const name = (party && party.name) || '—';
    const opening = Number((party && party.openingBalance) || 0);
    const sifa = (party && party.sifaNo) || '';
    const phone = (party && party.phone) || '';
    const address = (party && party.address) || '';

    let rows = [];

    // Opening — positive = receivable (party) / payable (supplier) → Dr (naam)
    rows.push({
      date: '—',
      desc: 'Opening balance',
      safha: sifa || '',
      naam: opening > 0 ? opening : 0,
      jama: opening < 0 ? Math.abs(opening) : 0,
      bags: ''
    });

    if (isCustomer) {
      // Sales: credit portion → Dr (naam); cash/bank paid → Cr (jama) so only due remains
      (STATE.sales || [])
        .filter((s) => s.partyId === partyId && !String(s.id || '').startsWith('_pending_'))
        .forEach((s) => {
          const tot = Number(s.total || 0);
          if (tot <= 0) return;
          let cash = 0;
          if (typeof global.saleCashAmount === 'function') {
            try { cash = Number(global.saleCashAmount(s) || 0); } catch (e) { cash = 0; }
          } else {
            const mode = s.payMode || 'Cash';
            if (mode === 'Cash' || !s.payMode) cash = tot;
            else if (mode === 'Partial') cash = Number(s.payCash || 0);
          }
          let bank = 0;
          const mode = s.payMode || 'Cash';
          if (mode === 'Partial') bank = Number(s.payBank || 0) + Number(s.payAdvance || 0);
          else if (mode === 'Bank' || mode === 'Online') bank = tot;
          const paid = Math.min(tot, cash + bank);
          const credit = Math.max(0, Math.round((tot - paid) * 100) / 100);
          const qty = Number(s.qty || 0);
          const unit = s.unit || '';
          let desc = s.productName || 'Sale';
          if (qty) desc += ' — ' + qty + (unit ? ' ' + unit : '');
          if (s.docNo) desc += ' (' + s.docNo + ')';
          if (typeof global.saleDetailLine === 'function') {
            try { desc = global.saleDetailLine(s); } catch (e) {}
          }
          const tb = typeof global.saleTakenBy === 'function' ? global.saleTakenBy(s) : s.takenBy || '';
          if (credit > 0) {
            rows.push({
              date: s.date || '',
              desc: desc + (paid > 0 ? ' · Credit' : ''),
              takenBy: tb,
              safha: s.safha || sifa || '',
              naam: credit,
              jama: 0,
              bags: qty || ''
            });
          }
          if (paid > 0) {
            rows.push({
              date: s.date || '',
              desc: desc + ' · Paid (' + (mode || 'Cash') + ')',
              takenBy: tb,
              safha: s.safha || sifa || '',
              naam: 0,
              jama: paid,
              bags: ''
            });
          }
        });
      (STATE.salesReturns || [])
        .filter((r) => r.partyId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: 'Return — ' + (r.productName || ''),
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    } else {
      // Purchases: credit → Dr (we owe); cash purchase net zero
      (STATE.purchases || [])
        .filter((p) => p.supplierId === partyId)
        .forEach((p) => {
          const tot = Number(p.total || 0);
          if (tot <= 0) return;
          const isCash = typeof global.isCashPurchase === 'function'
            ? global.isCashPurchase(p)
            : ((p.payMode || '') === 'Cash' || !p.payMode);
          const desc =
            'Purchase — ' +
            (p.productName || '') +
            (p.docNo ? ' (' + p.docNo + ')' : '');
          if (isCash) {
            // Cash purchase: Dr bill + Cr payment same day → balance unchanged
            rows.push({
              date: p.date || '',
              desc: desc + ' · Cash',
              safha: p.safha || sifa || '',
              naam: tot,
              jama: 0,
              bags: p.qty || ''
            });
            rows.push({
              date: p.date || '',
              desc: desc + ' · Cash paid',
              safha: p.safha || sifa || '',
              naam: 0,
              jama: tot,
              bags: ''
            });
          } else {
            rows.push({
              date: p.date || '',
              desc: desc + ' · Credit',
              safha: p.safha || sifa || '',
              naam: tot,
              jama: 0,
              bags: p.qty || ''
            });
          }
        });
      (STATE.purchaseReturns || [])
        .filter((r) => r.supplierId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: 'Return — ' + (r.productName || ''),
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    }

    // Transport freight charged to this party/supplier ledger
    (STATE.transportTrips || []).forEach(function (tr) {
      const fr = Number(tr.freightCharge || 0);
      if (fr <= 0) return;
      var match = false;
      if (isCustomer) {
        if (tr.partyId && tr.partyId === partyId) match = true;
        else if (!tr.partyId && party && tr.partyName && String(tr.partyName).trim() === String(party.name || '').trim()) match = true;
      } else {
        if (tr.supplierId && tr.supplierId === partyId) match = true;
        else if (!tr.supplierId && party && tr.supplierName && String(tr.supplierName).trim() === String(party.name || '').trim()) match = true;
      }
      if (!match) return;
      var veh = (tr.vehicleType || '') + (tr.vehicleNo ? ' ' + tr.vehicleNo : '');
      rows.push({
        date: tr.date || '',
        desc: 'Transport freight · ' + veh + (tr.itemName ? ' · ' + tr.itemName : ''),
        safha: tr.safha || sifa || '',
        naam: fr,
        jama: 0,
        bags: tr.qty || ''
      });
    });

    // Payments — automatic tracking of all receipts / payments / freight / manual
    (STATE.payments || [])
      .filter((x) => x.partyType === partyType && x.partyId === partyId)
      .forEach((x) => {
        const amt = Number(x.amount || 0);
        if (amt <= 0) return;
        const modeTag = x.mode && x.mode !== 'Cash' ? (' · ' + x.mode) : '';
        const bankTag = x.bankAccountId ? ' · Bank' : '';
        const note = (x.note || '') + modeTag + bankTag;
        if (isCustomer) {
          // isGiven = money given TO party → Dr (naam) balance up
          // !isGiven = received FROM party → Cr (jama) balance down
          if (x.isGiven) {
            rows.push({
              date: x.date || '',
              desc: note || 'Given / advance',
              safha: x.safha || '',
              naam: amt,
              jama: 0,
              payId: x.id,
              editable: true,
              bags: ''
            });
          } else {
            rows.push({
              date: x.date || '',
              desc: note || 'Payment received',
              safha: x.safha || '',
              naam: 0,
              jama: amt,
              payId: x.id,
              editable: true,
              bags: ''
            });
          }
        } else {
          // Supplier: isGiven = we paid them → Cr (jama) payable down
          // !isGiven = bill/extra charge → Dr (naam) payable up
          if (x.isGiven) {
            rows.push({
              date: x.date || '',
              desc: note || 'Payment to supplier',
              safha: x.safha || '',
              naam: 0,
              jama: amt,
              payId: x.id,
              editable: true,
              bags: ''
            });
          } else {
            rows.push({
              date: x.date || '',
              desc: note || 'Bill / charge',
              safha: x.safha || '',
              naam: amt,
              jama: 0,
              payId: x.id,
              editable: true,
              bags: ''
            });
          }
        }
      });

    rows.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
    var running = 0;
    rows = rows.map(function (r) {
      // Same formula for party & supplier after column mapping above:
      // +naam (Dr) − jama (Cr)
      running += (Number(r.naam) || 0) - (Number(r.jama) || 0);
      return Object.assign({}, r, { bal: running });
    });
    return {
      party: party,
      name: name,
      sifa: sifa,
      phone: phone,
      address: address,
      opening: opening,
      rows: rows,
      closing: running,
      isCustomer: isCustomer
    };
  }

  /** Traditional bahi-khata style ledger (matches hath wali book) */
  function openBahiLedger(partyType, partyId) {
    if (arguments.length === 1) {
      partyId = partyType;
      partyType = 'party';
    }
    const data = buildLedgerRows(partyType, partyId);
    const { name, sifa, phone, address, rows, closing, isCustomer } = data;
    // Party: + = Dr red (receivable) · − = Cr blue (advance)
    // Supplier: + = Cr blue (payable) · − = Dr red (advance)
    const balColor = Math.abs(closing) < 0.01
      ? 'var(--ink)'
      : (closing > 0
          ? (isCustomer ? '#b91c1c' : '#1d4ed8')
          : (isCustomer ? '#1d4ed8' : '#b91c1c'));
    const balLabel =
      Math.abs(closing) < 0.01
        ? 'Clear'
        : closing > 0
          ? (isCustomer ? 'Receivable (Dr)' : 'Payable (Cr)')
          : (isCustomer ? 'Advance (Cr)' : 'Advance paid (Dr)');
    const safeName = (name || '').replace(/'/g, "\\'");
    const pageTitle = isCustomer ? 'Customer Ledger' : 'Supplier Ledger';

    const html = `
<div class="xls-meta" style="margin-bottom:8px">
  <strong>${pageTitle}</strong> — ${name}
  ${sifa ? ' · Sifa p.' + sifa : ''}
  ${phone ? ' · ' + phone : ''}
  ${address ? ' · ' + address : ''}
</div>
<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;font-size:13px">
  <span>Closing: <b style="color:${balColor}">${fmtRs(Math.abs(closing))} ${balLabel}</b></span>
  <span class="muted">${rows.length} rows</span>
</div>
<div class="xls-wrap">
  <table class="xls" id="bahiLedgerPrint">
    <thead>
      <tr>
        <th class="xls-row-num">#</th>
        <th>Date</th>
        <th>Detail</th>
        <th class="center">Page</th>
        <th class="right">Debit (Dr)</th>
        <th class="right">Credit (Cr)</th>
        <th class="right">Balance</th>
        <th class="right no-print">Edit</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows.map(function (r, i) {
              var editBtns =
                r.editable && r.payId
                  ? '<button class="btn btn-outline btn-sm" onclick="editLedgerPayment(\'' +
                    partyType +
                    "','" +
                    partyId +
                    "','" +
                    r.payId +
                    "')\">Edit</button> " +
                    '<button class="btn btn-danger btn-sm" onclick="deleteLedgerPayment(\'' +
                    partyType +
                    "','" +
                    partyId +
                    "','" +
                    r.payId +
                    "')\">Del</button>"
                  : '—';
              var balN = Number(r.bal) || 0;
              var balCls =
                Math.abs(balN) < 0.01
                  ? 'xls-bal-0'
                  : balN > 0
                    ? (isCustomer ? 'xls-bal-dr' : 'xls-bal-cr')
                    : (isCustomer ? 'xls-bal-cr' : 'xls-bal-dr');
              return (
                '<tr>' +
                '<td class="xls-row-num">' +
                (i + 1) +
                '</td>' +
                '<td class="mono">' +
                (r.date || '—') +
                '</td>' +
                '<td class="xls-detail">' +
                (r.desc || '') +
                (r.takenBy
                  ? ' <span style="color:#64748b;font-size:11px">(' + r.takenBy + ')</span>'
                  : '') +
                '</td>' +
                '<td class="center mono">' +
                (r.safha || '') +
                '</td>' +
                '<td class="xls-num xls-bal-dr">' +
                (r.naam ? fmtNum(r.naam) : '') +
                '</td>' +
                '<td class="xls-num xls-bal-cr">' +
                (r.jama ? fmtNum(r.jama) : '') +
                '</td>' +
                '<td class="xls-num ' +
                balCls +
                '">' +
                fmtNum(r.bal) +
                '</td>' +
                '<td class="xls-actions no-print">' +
                editBtns +
                '</td>' +
                '</tr>'
              );
            }).join('')
          : '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No entries</td></tr>'
      }
    </tbody>
    <tfoot>
      <tr style="background:#e8f0fe;font-weight:700">
        <td class="xls-row-num"></td>
        <td colspan="3">CLOSING BALANCE</td>
        <td></td><td></td>
        <td class="xls-num" style="color:${balColor}">${fmtNum(Math.abs(closing))} ${balLabel}</td>
        <td class="no-print"></td>
      </tr>
    </tfoot>
  </table>
</div>
<p class="hint" style="margin-top:8px">Dr = Debit · Cr = Credit · Balance runs top → bottom · Excel-style rows</p>
`;

    global.openModal(
      pageTitle + ' — ' + name,
      html,
      `
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
      <button class="btn btn-gold" onclick="openManualLedgerEntry('${partyType}','${partyId}','${safeName}')">+ Dr / Cr</button>
      ${
        Math.abs(closing) < 0.01
          ? isCustomer
            ? `<button class="btn btn-danger" onclick="deletePartyIfClear('${partyId}')">Delete party</button>`
            : `<button class="btn btn-danger" onclick="deleteSupplierIfClear('${partyId}')">Delete supplier</button>`
          : ''
      }
      <button class="btn btn-outline" onclick="window.KissanPhase8.printBahi()">Print</button>
      <button class="btn btn-primary" onclick="downloadPartyLedgerPdf('${partyType}','${partyId}')">PDF</button>
    `,
      true
    );
  }

  function printBahi() {
    const el = document.getElementById('bahiLedgerPrint');
    if (!el) {
      global.toast?.('Ledger not open', 'error');
      return;
    }
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>کھاتہ</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body{margin:16px;font-family:'Noto Nastaliq Urdu',system-ui,sans-serif;background:#fff}
        ${document.querySelector('#bahiLedgerPrint') ? '' : ''}
      </style>
      </head><body>${el.outerHTML}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    // inject styles from page
    const styleNodes = document.querySelectorAll('style');
    let css = '';
    styleNodes.forEach((s) => {
      if (s.textContent.includes('bahi-')) css += s.textContent;
    });
    win.document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
    win.document.close();
  }

  // Override global openLedger
  function install() {
    global.openLedger = openBahiLedger;
    global.KissanPhase8 = {
      APP_VERSION,
      openBahiLedger,
      buildLedgerRows,
      printBahi
    };
    localStorage.setItem('kissan_app_version', APP_VERSION);
    try {
      if (global.KissanPhase4) global.KissanPhase4.APP_VERSION = APP_VERSION;
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})(window);
