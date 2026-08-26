/**
 * Kissan Fertilizer — Phase 8
 * Traditional Bahi-Khata / Party Ledger (hath wali book style)
 * Columns: تاریخ | تفصیل | صفحہ | نام | جمع | بقايا
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
    const name = party?.name || '—';
    const opening = Number(party?.openingBalance || 0);
    const sifa = party?.sifaNo || '';
    const phone = party?.phone || '';
    const address = party?.address || '';

    let rows = [];
    rows.push({
      date: '—',
      desc: 'ابتدائي بيلنس / Opening',
      safha: sifa || '',
      naam: opening > 0 ? opening : 0,
      jama: opening < 0 ? Math.abs(opening) : 0,
      bags: ''
    });

    if (isCustomer) {
      (STATE.sales || [])
        .filter((s) => s.partyId === partyId)
        .forEach((s) => {
          const qty = Number(s.qty || 0);
          const unit = s.unit || '';
          let desc = s.productName || 'Sale';
          if (qty) desc += ` — ${qty}${unit ? ' ' + unit : ''}`;
          if (s.docNo) desc += ` (${s.docNo})`;
          if (typeof global.saleDetailLine === 'function') {
            try {
              desc = global.saleDetailLine(s);
            } catch (e) {}
          }
          rows.push({
            date: s.date || '',
            desc,
            takenBy: typeof global.saleTakenBy === 'function' ? global.saleTakenBy(s) : s.takenBy || '',
            safha: s.safha || sifa || '',
            naam: Number(s.total || 0),
            jama: 0,
            bags: qty || ''
          });
        });
      (STATE.salesReturns || [])
        .filter((r) => r.partyId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: `واپسي / Return — ${r.productName || ''}`,
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    } else {
      (STATE.purchases || [])
        .filter((p) => p.supplierId === partyId)
        .forEach((p) => {
          rows.push({
            date: p.date || '',
            desc: `خريد / Purchase — ${p.productName || ''}${p.docNo ? ' (' + p.docNo + ')' : ''}`,
            safha: p.safha || sifa || '',
            naam: Number(p.total || 0),
            jama: 0,
            bags: p.qty || ''
          });
        });
      (STATE.purchaseReturns || [])
        .filter((r) => r.supplierId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: `واپسي — ${r.productName || ''}`,
            safha: r.safha || '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    }

    (STATE.payments || [])
      .filter((x) => x.partyType === partyType && x.partyId === partyId)
      .forEach((x) => {
        if (x.isGiven) {
          rows.push({
            date: x.date || '',
            desc: x.note || 'ڏنل / Given',
            safha: x.safha || '',
            naam: Number(x.amount || 0),
            jama: 0,
            payId: x.id,
            editable: true,
            bags: ''
          });
        } else {
          rows.push({
            date: x.date || '',
            desc: x.note || (isCustomer ? 'وصول / Wasool' : 'ادائگي / Payment'),
            safha: x.safha || '',
            naam: 0,
            jama: Number(x.amount || 0),
            payId: x.id,
            editable: true,
            bags: ''
          });
        }
      });

    rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let running = 0;
    rows = rows.map((r) => {
      running += (Number(r.naam) || 0) - (Number(r.jama) || 0);
      return { ...r, bal: running };
    });
    return { party, name, sifa, phone, address, opening, rows, closing: running, isCustomer };
  }

  /** Traditional bahi-khata style ledger (matches hath wali book) */
  function openBahiLedger(partyType, partyId) {
    if (arguments.length === 1) {
      partyId = partyType;
      partyType = 'party';
    }
    const data = buildLedgerRows(partyType, partyId);
    const { name, sifa, phone, address, rows, closing, isCustomer } = data;
    const balColor = closing > 0 ? '#b91c1c' : closing < 0 ? '#15803d' : '#1a2218';
    const balLabel =
      closing > 0
        ? isCustomer
          ? 'باقی وصول (Credit)'
          : 'باقی ادائگي (Debt)'
        : closing < 0
          ? isCustomer
            ? 'اضافي (Advance)'
            : 'اضافي (Credit)'
          : 'صاف (Clear)';
    const safeName = (name || '').replace(/'/g, "\\'");
    const pageTitle = isCustomer ? 'کھاتہ بنام' : 'سپلائر کھاتہ';

    const html = `
<style>
  .bahi-wrap{
    font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(180deg, #faf6eb 0%, #f3ecd8 100%);
    border: 2px solid #8b7355;
    border-radius: 4px;
    padding: 12px 10px 16px;
    direction: rtl;
  }
  .bahi-head{
    text-align: center;
    border-bottom: 2px double #5c4a32;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .bahi-head .title{
    font-size: 22px;
    font-weight: 800;
    color: #1a2218;
    letter-spacing: 0.02em;
  }
  .bahi-head .sub{
    font-size: 13px;
    color: #5c4a32;
    margin-top: 4px;
  }
  .bahi-head .party-name{
    font-size: 18px;
    font-weight: 800;
    color: #0f3d24;
    margin-top: 6px;
  }
  .bahi-meta{
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: #444;
    margin-top: 6px;
  }
  .bahi-table{
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    direction: rtl;
  }
  .bahi-table th{
    background: #e8dfc8;
    border: 1px solid #a89070;
    padding: 7px 5px;
    font-weight: 800;
    color: #2c2416;
    white-space: nowrap;
  }
  .bahi-table td{
    border: 1px solid #c4b498;
    padding: 6px 5px;
    vertical-align: middle;
  }
  .bahi-table tbody tr:nth-child(even){ background: #f7f1e3; }
  .bahi-table tbody tr:nth-child(odd){ background: #fffcf5; }
  .bahi-table .num{
    font-family: ui-monospace, 'Cascadia Mono', monospace;
    font-weight: 700;
    text-align: left;
    direction: ltr;
    unicode-bidi: embed;
  }
  .bahi-table .bal-cell{
    font-weight: 800;
    color: #9f1239;
    background: #fff1f2 !important;
  }
  .bahi-table .date-cell{ white-space: nowrap; direction: ltr; text-align: center; font-family: monospace; font-size: 11.5px; }
  .bahi-table .desc-cell{ text-align: right; max-width: 180px; }
  .bahi-foot{
    margin-top: 12px;
    text-align: center;
    padding: 10px;
    border: 2px solid #5c4a32;
    background: #fff;
    border-radius: 4px;
  }
  .bahi-foot .amt{
    font-size: 20px;
    font-weight: 800;
    font-family: ui-monospace, monospace;
    direction: ltr;
  }
  .bahi-note{ font-size: 11px; color: #6b5a40; margin-top: 8px; text-align: center; }
  @media print {
    .bahi-wrap{ border: none; background: #fff; }
    .no-print{ display: none !important; }
  }
</style>
<div class="bahi-wrap" id="bahiLedgerPrint">
  <div class="bahi-head">
    <div class="title">${pageTitle}</div>
    <div class="sub">کسان فرٹیلائزر · میرو خان روڈ، کمبر</div>
    <div class="party-name">${name}</div>
    <div class="bahi-meta">
      <span>${sifa ? 'صفحو / Sifa: <b>' + sifa + '</b>' : ''}</span>
      <span>${phone ? '📱 ' + phone : ''}</span>
      <span>${address || ''}</span>
    </div>
  </div>

  <div style="overflow-x:auto">
  <table class="bahi-table">
    <thead>
      <tr>
        <th>تاریخ<br><span style="font-weight:600;font-size:10px">Date</span></th>
        <th>تفصیل<br><span style="font-weight:600;font-size:10px">Detail</span></th>
        <th>صفحہ<br><span style="font-weight:600;font-size:10px">Page</span></th>
        <th>نام (روپے)<br><span style="font-weight:600;font-size:10px">Debit</span></th>
        <th>جمع (روپے)<br><span style="font-weight:600;font-size:10px">Credit</span></th>
        <th>بقايا<br><span style="font-weight:600;font-size:10px">Balance</span></th>
        <th class="no-print">Edit</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((r) => {
                const editBtns =
                  r.editable && r.payId
                    ? `<button class="btn btn-outline btn-sm" onclick="editLedgerPayment('${partyType}','${partyId}','${r.payId}')">Edit</button>
                       <button class="btn btn-danger btn-sm" onclick="deleteLedgerPayment('${partyType}','${partyId}','${r.payId}')">Del</button>`
                    : '—';
                return `<tr>
          <td class="date-cell">${r.date || '—'}</td>
          <td class="desc-cell">${r.desc || ''}${r.takenBy ? ' <span style="color:#5c4a32;font-size:11px">(' + r.takenBy + ')</span>' : ''}</td>
          <td class="num" style="text-align:center">${r.safha || ''}</td>
          <td class="num">${r.naam ? fmtNum(r.naam) : ''}</td>
          <td class="num">${r.jama ? fmtNum(r.jama) : ''}</td>
          <td class="num bal-cell">${fmtNum(r.bal)}</td>
          <td class="no-print" style="direction:ltr;text-align:center;white-space:nowrap">${editBtns}</td>
        </tr>`;
              })
              .join('')
          : `<tr><td colspan="7" style="text-align:center;padding:20px">کوئی اندراج نہیں</td></tr>`
      }
    </tbody>
  </table>
  </div>

  <div class="bahi-foot">
    <div style="font-size:13px;margin-bottom:4px">کل بقايا / Closing Balance</div>
    <div class="amt" style="color:${balColor}">${fmtRs(Math.abs(closing))}</div>
    <div style="font-weight:800;color:${balColor};margin-top:4px">${balLabel}</div>
  </div>
  <p class="bahi-note">نام = اُدھار / بل · جمع = وصولي · بقايا = چالو بيلنس · صفحہ = هٿ واري ڪتاب جو صفحو</p>
</div>`;

    global.openModal(
      `${pageTitle} — ${name}`,
      html,
      `
      <button class="btn btn-outline" onclick="closeModal()">بند / Close</button>
      <button class="btn btn-gold" onclick="openManualLedgerEntry('${partyType}','${partyId}','${safeName}')">+ نام / جمع</button>
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
