/**
 * Kissan Fertilizer — Phase 8
 * Traditional Bahi-Khata / Party Ledger (hath wali book style)
 * Columns: Date | Detail | Page | Dr | Cr | Balance
 */
(function (global) {
  'use strict';

  const APP_VERSION = 'v70-phase8-fixed';

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

  // Purani trips mein naam khali ho to product list se naam / unit nikalo
  function tripProd(id) {
    return (id && (global.STATE.products || []).find(function (p) { return p.id === id; })) || null;
  }
  function tripItemName(tr, pay) {
    var p = tripProd(tr && tr.productId);
    return (tr && tr.itemName) || (pay && pay.itemName) || (p && p.name) || '';
  }

  function rName(rec) {
    return typeof global.recProductName === 'function' ? global.recProductName(rec) : ((rec && (rec.productName || rec.itemName)) || '');
  }
  function rUnit(rec) {
    return typeof global.recUnit === 'function' ? global.recUnit(rec) : ((rec && rec.unit) || '');
  }
  function payTag(p) {
    return typeof global.payDetailTag === 'function' ? global.payDetailTag(p) : (p.mode && p.mode !== 'Cash' ? ' · ' + p.mode : '');
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

    // Opening balance — top row only; PAGE/SIFA number appears only here
    rows.push({
      date: '—',
      docNo: '',
      desc: 'Opening balance',
      takenBy: '',
      qty: '',
      rate: '',
      vehicle: '',
      safha: sifa || '',
      naam: isCustomer
        ? (opening > 0 ? opening : 0)
        : (opening < 0 ? Math.abs(opening) : 0),
      jama: isCustomer
        ? (opening < 0 ? Math.abs(opening) : 0)
        : (opening > 0 ? opening : 0),
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
          let desc = (rName(s) || 'Sale');
          try {
            if (typeof global.saleDetailLine === 'function') {
              const d2 = global.saleDetailLine(s);
              if (d2) {
                desc = String(d2)
                  .replace(/\s*·\s*taken by:\s*[^·]+/gi, '')
                  .replace(/\s*\([^)]*INV[^)]*\)/gi, '')
                  .replace(/^Sale\s*[—\-]\s*/i, '')
                  .trim() || desc;
              }
            }
          } catch (e) {}
          const sUnit = rUnit(s);
          if (sUnit && desc.toLowerCase().indexOf(sUnit.toLowerCase()) === -1) desc += ' (' + sUnit + ')';
          const tb = typeof global.saleTakenBy === 'function' ? global.saleTakenBy(s) : (s.takenBy || '');
          const rate = Number(s.rate || s.salePrice || 0) || '';
          const inv = s.docNo || s.invoiceNo || '';
          const veh = s.vehicleNo || s.vehicle || s.vehicleType || s.truckNo || '';
          
          rows.push({
            date: s.date || '',
            docNo: inv,
            desc: desc,
            takenBy: tb,
            qty: qty || '',
            rate: rate,
            vehicle: veh,
            safha: '',
            naam: tot,
            jama: 0,
            bags: qty || ''
          });
          if (paid > 0) {
            rows.push({
              date: s.date || '',
              docNo: inv,
              desc: desc + ' · Paid (' + (s.payMode || 'Cash') + ')',
              takenBy: tb,
              qty: '',
              rate: '',
              vehicle: '',
              safha: '',
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
            desc: 'Return — ' + (rName(r) || ''),
            docNo: r.docNo || '',
            qty: Number(r.qty) || '',
            safha: '',
            naam: 0,
            jama: Number(r.total || 0),
            bags: ''
          });
        });
    } else {
      // Purchases: credit → Cr (payable); cash purchase nets to zero
      (STATE.purchases || [])
        .filter((p) => p.supplierId === partyId)
        .forEach((p) => {
          const tot = Number(p.total || 0);
          if (tot <= 0) return;
          const isCash = typeof global.isCashPurchase === 'function'
            ? global.isCashPurchase(p)
            : ((p.payMode || '') === 'Cash' || !p.payMode);
          const pUnit = rUnit(p);
          const pTb = p.takenBy || p.driver || '';
          const desc = 'Purchase — ' + (rName(p) || '') + (pUnit ? ' (' + pUnit + ')' : '');
          if (isCash) {
            rows.push({
              date: p.date || '',
              desc: desc + ' · Cash',
              takenBy: pTb,
              safha: '',
              naam: 0,
              jama: tot,
              qty: Number(p.qty)||'', rate: Number(p.rate||p.purchasePrice||0)||'', docNo: p.docNo||'', vehicle: p.vehicleNo||p.vehicle||'', bags: p.qty || ''
            });
            rows.push({
              date: p.date || '',
              docNo: p.docNo || '',
              desc: desc + ' · Cash paid',
              takenBy: pTb,
              safha: '',
              naam: tot,
              jama: 0,
              bags: ''
            });
          } else {
            rows.push({
              date: p.date || '',
              desc: desc,
              takenBy: pTb,
              safha: '',
              naam: 0,
              jama: tot,
              qty: Number(p.qty)||'', rate: Number(p.rate||p.purchasePrice||0)||'', docNo: p.docNo||'', vehicle: p.vehicleNo||p.vehicle||'', bags: p.qty || ''
            });
          }
        });
      (STATE.purchaseReturns || [])
        .filter((r) => r.supplierId === partyId)
        .forEach((r) => {
          rows.push({
            date: r.date || '',
            desc: 'Return — ' + (rName(r) || ''),
            docNo: r.docNo || '',
            qty: Number(r.qty) || '',
            safha: '',
            naam: Number(r.total || 0),
            jama: 0,
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
      if ((STATE.payments || []).some(function (p) { return p.transportTripId === tr.id && !p.isTransportGoods && p.partyType === partyType && Number(p.amount) === fr; })) return;
      var veh = (tr.vehicleType || '') + (tr.vehicleNo ? ' ' + tr.vehicleNo : '');
      rows.push({
        date: tr.date || '',
        docNo: tr.docNo || '',
        desc: 'Transport freight' + (tripItemName(tr) ? ' · ' + tripItemName(tr) : ''),
        takenBy: tr.driver || '',
        qty: tr.qty || '',
        rate: '',
        vehicle: veh.trim(),
        isTransport: true,
        tripId: tr.id,
        tripKind: isCustomer ? 'party' : 'inbound',
        safha: '',
        naam: isCustomer ? fr : 0,
        jama: isCustomer ? 0 : fr,
        bags: tr.qty || ''
      });
    });

    // Payments — automatic tracking of all receipts / payments / freight / manual
    (STATE.payments || [])
      .filter((x) => x.partyType === partyType && x.partyId === partyId)
      .forEach((x) => {
        const amt = Number(x.amount || 0);
        if (amt <= 0) return;
        const payNote = (x.note || '') + payTag(x);
        const note = payNote.replace(/^\s*·\s*/, '');
        const pDoc = x.docNo || x.receiptNo || x.voucherNo || '';
        const pBy = x.receivedBy || x.givenBy || x.takenBy || x.by || '';
        if (isCustomer) {
          if (x.isGiven) {
            rows.push({
              date: x.date || '',
              desc: note || 'Given / advance',
              safha: '',
              naam: amt,
              jama: 0,
              docNo: pDoc,
              takenBy: pBy,
              payId: x.id,
              editable: true,
              bags: ''
            });
          } else {
            rows.push({
              date: x.date || '',
              desc: note || 'Payment received',
              safha: '',
              naam: 0,
              jama: amt,
              docNo: pDoc,
              takenBy: pBy,
              payId: x.id,
              editable: true,
              bags: ''
            });
          }
        } else {
          if (x.isGiven) {
            rows.push({
              date: x.date || '',
              desc: note || 'Payment to supplier',
              safha: '',
              naam: amt,
              jama: 0,
              docNo: pDoc,
              takenBy: pBy,
              payId: x.id,
              editable: true,
              bags: ''
            });
          } else {
            rows.push({
              date: x.date || '',
              desc: note || 'Bill / charge',
              safha: '',
              naam: 0,
              jama: amt,
              docNo: pDoc,
              takenBy: pBy,
              payId: x.id,
              editable: true,
              bags: ''
            });
          }
        }
      });

    // ✅ UPDATED: Transport payments → fill Invoice / Taken by (driver) / Qty / Rate / Vehicle from the trip
    rows.forEach(function (r) {
      if (!r.payId) return;
      var pay = (STATE.payments || []).find(function (p) { return p.id === r.payId; });
      if (!pay || !pay.transportTripId) return;
      var tr = (STATE.transportTrips || []).find(function (t) { return t.id === pay.transportTripId; }) || {};
      
      r.isTransport = true;
      r.tripId = pay.transportTripId;
      r.tripKind = isCustomer ? 'party' : 'inbound';
      r.docNo = tr.docNo || pay.docNo || '';
      r.takenBy = tr.driver || pay.driver || pay.takenBy || '';
      
      // Vehicle details (Loader, Gado, Truck, etc.)
      var vehType = tr.vehicleType || pay.vehicleType || '';
      var vehNo = tr.vehicleNo || pay.vehicleNo || '';
      r.vehicle = (vehType + (vehNo ? ' ' + vehNo : '')).trim();

      var items = (tr.items && tr.items.length) ? tr.items : ((pay.items && pay.items.length) ? pay.items : []);
      var totQty = items.reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0);

      if (pay.isTransportGoods) {
        if (items.length > 1) {
          // Multiple products: Show clean list
          var prodList = items.map(function (i) {
            var ip = tripProd(i.productId);
            var pName = i.itemName || (ip && ip.name) || 'Product';
            return pName + ' × ' + (i.qty || 0) + (i.unit ? ' ' + i.unit : '');
          });
          r.desc = prodList.join(', ');
          r.qty = totQty || '';
          r.rate = '';
        } else {
          // Single product: Show Product Name + Packaging (e.g., Zipp pkg)
          var singleItem = items[0] || {};
          var ip = tripProd(singleItem.productId);
          var pName = singleItem.itemName || (ip && ip.name) || 'Product';
          var unit = singleItem.unit || tr.unit || (ip && ip.unit) || '';
          
          // Check for Zipp packaging or specific unit mention
          var pkgInfo = '';
          if (pName.toLowerCase().indexOf('zipp') !== -1 || (singleItem.packageType && singleItem.packageType.toLowerCase().indexOf('zipp') !== -1) || (unit && unit.toLowerCase().indexOf('zipp') !== -1)) {
            pkgInfo = ' (Zipp pkg)';
          } else if (unit) {
            pkgInfo = ' (' + unit + ')';
          }
          
          r.desc = pName + pkgInfo;
          r.qty = singleItem.qty || tr.qty || pay.qty || '';
          r.rate = singleItem.rate || tr.rate || pay.rate || '';
          
          // Prevent false mismatch warnings for transport goods where amount might be a fixed freight charge
          var calcAmount = (Number(r.qty) || 0) * (Number(r.rate) || 0);
          var payAmount = Number(pay.amount || 0);
          if (payAmount > 0 && Math.abs(calcAmount - payAmount) > 1) {
            r.rateMismatch = false; // Disable warning as transport amount is often fixed/adjusted
          }
        }
      } else if (/Transport freight/i.test(pay.note || '')) {
        var prodList = items.map(function (i) {
          var ip = tripProd(i.productId);
          return (i.itemName || (ip && ip.name) || 'Product') + ' × ' + (i.qty || 0) + (i.unit ? ' ' + i.unit : '');
        });
        r.desc = 'Transport Freight' + (prodList.length > 0 ? ' — ' + prodList.join(', ') : '');
        r.qty = tr.qty || pay.qty || '';
        r.rate = '';
      }
    });

    rows.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
    var running = 0;
    rows = rows.map(function (r) {
      if (isCustomer) {
        running += (Number(r.naam) || 0) - (Number(r.jama) || 0);
      } else {
        running += (Number(r.jama) || 0) - (Number(r.naam) || 0);
      }
      var q = r.qty != null && r.qty !== '' ? r.qty : (r.bags != null && r.bags !== '' ? r.bags : '');
      return Object.assign({}, r, { bal: running, qty: q });
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

  var _ledgerInPlace = false;
  /** Traditional bahi-khata style ledger (matches hath wali book) */
  function openBahiLedger(partyType, partyId) {
    if (arguments.length === 1) {
      partyId = partyType;
      partyType = 'party';
    }
    const data = buildLedgerRows(partyType, partyId);
    const { name, sifa, phone, address, rows, closing, isCustomer } = data;
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
    const safeName = (name || '').replace(/'/g, "'");
    const pageTitle = isCustomer ? 'Customer Ledger' : 'Supplier Ledger';
    const totDr = rows.reduce(function (a, r) { return a + (Number(r.naam) || 0); }, 0);
    const totCr = rows.reduce(function (a, r) { return a + (Number(r.jama) || 0); }, 0);
    const closingSide = Math.abs(closing) < 0.01 ? '' : ((closing > 0) === isCustomer ? ' Dr' : ' Cr');
    const closingColor = closingSide === ' Dr' ? '#b91c1c' : (closingSide === ' Cr' ? '#1d4ed8' : '#000');

    const stmtTitle = isCustomer ? 'PARTY STATEMENT' : 'SUPPLIER STATEMENT';
    const partyMeta = [phone || '', address || ''].filter(Boolean).join(' · ');
    const letterhead = (typeof global.shopLetterheadHtml === 'function')
      ? global.shopLetterheadHtml({ partyName: name, statementTitle: stmtTitle, partyMeta: partyMeta, printed: true })
      : ('<div class="ledger-letterhead" style="text-align:center;border-bottom:2px solid #0f3d24;padding-bottom:10px;margin-bottom:12px">' +
         '<div style="font-size:18px;font-weight:800;color:#0f3d24">KISSAN FERTILIZER</div>' +
         '<div style="font-size:12px;color:#5a6656;margin-top:3px">Miro Khan Road, Kamber</div>' +
         '<div style="font-size:11px;color:#6b7a68;margin-top:2px">Fertilizer · Seed · Pesticide</div>' +
         '<div style="text-align:left;margin-top:10px;padding-top:8px;border-top:1.5px solid #0f3d24">' +
         '<div style="font-size:15px;font-weight:800">' + (name || '') + '</div>' +
         '<div style="font-size:11px;font-weight:700;color:#0f3d24;margin-top:2px">' + stmtTitle + '</div>' +
         (partyMeta ? '<div style="font-size:11px;color:#64748b;margin-top:3px">' + partyMeta + '</div>' : '') +
         '</div></div>');
    const html = `
${letterhead}
<style>
  #bahiLedgerPrint{min-width:1040px}
  #bahiLedgerPrint th,#bahiLedgerPrint td{white-space:nowrap;padding:6px 8px;font-size:12.5px}
  #bahiLedgerPrint td.xls-detail{white-space:normal;min-width:190px;max-width:260px;line-height:1.35}
  #bahiLedgerPrint td.xls-actions,#bahiLedgerPrint th.no-print{position:sticky;right:0;background:#fff;box-shadow:-3px 0 4px rgba(0,0,0,.06)}
  #bahiLedgerPrint th.no-print{background:#0b4a7d}
</style>
<div class="xls-meta" style="margin-bottom:8px">
  <strong>${pageTitle}</strong> — ${name}
  ${phone ? ' · ' + phone : ''}
  ${address ? ' · ' + address : ''}
</div>
<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;font-size:13px">
  <span style="display:inline-flex;justify-content:space-between;gap:12px;background:#cfcdea;border:1px solid #a9a7d3;color:#000;padding:6px 12px;font-weight:700">Closing Balance <b>${fmtRs(Math.abs(closing))} ${balLabel}</b></span>
  <span class="muted">${rows.length} rows</span>
</div>
<div class="xls-wrap">
  <table class="xls" id="bahiLedgerPrint">
    <thead>
      <tr>
        <th class="xls-row-num">#</th>
        <th>Date</th>
        <th>Invoice No.</th>
        <th>Detail</th>
        <th>Taken By / Driver</th>
        <th class="right">Qty</th>
        <th class="right">Rate</th>
        <th class="center">Page</th>
        <th>Vehicle</th>
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
                r.isTransport && r.tripId
                  ? '<button class="btn btn-outline btn-sm" onclick="window._returnLedgerPending={partyType:\'' + partyType + '\',partyId:\'' + partyId + '\'};openTransportModal(\'' + r.tripId + "','" + r.tripKind + "')\">Edit</button>"
                  : r.editable && r.payId
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
              var balIsZero = Math.abs(balN) < 0.01;
              var balIsDr = balN > 0 ? isCustomer : !isCustomer;
              var balCls = balIsZero ? 'xls-bal-0' : '';
              var balStyle = balIsZero
                ? ''
                : (balIsDr
                    ? 'color:#b91c1c;font-weight:800;'
                    : 'color:#1d4ed8;font-weight:800;');
              return (
                '<tr>' +
                '<td class="xls-row-num">' +
                (i + 1) +
                '</td>' +
                '<td class="mono">' +
                ((r.date && r.date !== '—' && typeof global.fmtDateDMY === 'function') ? global.fmtDateDMY(r.date) : (r.date || '—')) +
                '</td>' +
                '<td class="mono">' + (r.docNo || '') + '</td>' +
                '<td class="xls-detail">' + String(r.desc || '').replace(/\n/g, '<br>') + '</td>' +
                '<td>' + (r.takenBy || '') + '</td>' +
                '<td class="xls-num">' + (r.qty !== '' && r.qty != null && r.qty !== 0 ? r.qty : '') + '</td>' +
                '<td class="xls-num">' + (r.rate !== '' && r.rate != null && Number(r.rate) ? fmtNum(r.rate) : '') + (r.rateMismatch ? ' <span title="Qty × Rate amount se match nahi karta — Edit karke check karein" style="color:#b91c1c;font-weight:800">⚠</span>' : '') + '</td>' +
                '<td class="center mono">' +
                (r.safha || '') +
                '</td>' +
                '<td>' + (r.vehicle || '') + '</td>' +
                '<td class="xls-num" style="color:#000;font-weight:700">' +
                (r.naam ? fmtNum(r.naam) : '') +
                '</td>' +
                '<td class="xls-num xls-bal-cr">' +
                (r.jama ? fmtNum(r.jama) : '') +
                '</td>' +
                '<td class="xls-num ' +
                balCls +
                '" style="' + balStyle + '">' +
                (function(){
                  var bn = Number(r.bal)||0;
                  if(Math.abs(bn)<0.01) return fmtNum(0);
                  var side = isCustomer ? (bn>0?' Dr':' Cr') : (bn>0?' Cr':' Dr');
                  return fmtNum(Math.abs(bn)) + side;
                })() +
                '</td>' +
                '<td class="xls-actions no-print">' +
                editBtns +
                '</td>' +
                '</tr>'
              );
            }).join('')
          : '<tr><td colspan="13" style="text-align:center;padding:20px;color:#94a3b8">No entries</td></tr>'
      }
    </tbody>
    <tfoot>
      <tr style="background:#cfcdea;color:#000;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <td class="xls-row-num" style="background:#cfcdea !important"></td>
        <td colspan="8" style="background:#cfcdea !important;color:#000">TOTAL &nbsp;·&nbsp; CLOSING: ${balLabel}</td>
        <td class="xls-num" style="background:#cfcdea !important;color:#000;border-left:1px solid #a9a7d3">${fmtNum(totDr) || '0'}</td>
        <td class="xls-num" style="background:#cfcdea !important;color:#000;border-left:1px solid #a9a7d3">${fmtNum(totCr) || '0'}</td>
        <td class="xls-num" style="background:#cfcdea !important;color:${closingColor};border-left:1px solid #a9a7d3">${fmtNum(Math.abs(closing)) || '0'}${closingSide}</td>
        <td class="no-print"></td>
      </tr>
    </tfoot>
  </table>
</div>
`;

    global._bahiPrintCtx = { partyType: partyType, partyId: partyId, name: name, sifa: sifa, phone: phone, address: address, isCustomer: isCustomer };
    var _ledgerFoot = `
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
    `;
    if (_ledgerInPlace) {
      var mb = document.getElementById('modalBody');
      var mf = document.getElementById('modalFoot');
      var mt = document.getElementById('modalTitle');
      if (mb && mf) {
        var wrap = mb.querySelector('.xls-wrap');
        var sTop = mb.scrollTop, wTop = wrap ? wrap.scrollTop : 0, wLeft = wrap ? wrap.scrollLeft : 0;
        if (mt) mt.textContent = pageTitle + ' — ' + name;
        mb.innerHTML = html;
        mf.innerHTML = _ledgerFoot;
        mb.scrollTop = sTop;
        var wrap2 = mb.querySelector('.xls-wrap');
        if (wrap2) { wrap2.scrollTop = wTop; wrap2.scrollLeft = wLeft; }
      }
      return;
    }
    global.openModal(pageTitle + ' — ' + name, html, _ledgerFoot, true);
  }

  function refreshOpenLedger() {
    var ctx = global._bahiPrintCtx;
    var bd = document.getElementById('modalBackdrop');
    if (!ctx || !bd || !bd.classList.contains('show') || !document.getElementById('bahiLedgerPrint')) return;
    _ledgerInPlace = true;
    try {
      openBahiLedger(ctx.partyType, ctx.partyId);
    } catch (e) {
      console.warn('refreshOpenLedger', e);
    } finally {
      _ledgerInPlace = false;
    }
  }

  function printBahi() {
    const el = document.getElementById('bahiLedgerPrint');
    if (!el) {
      global.toast?.('Ledger not open', 'error');
      return;
    }
    if (typeof global.printPartyLedger === 'function' && global._bahiPrintCtx) {
      try {
        global.printPartyLedger(global._bahiPrintCtx.partyType, global._bahiPrintCtx.partyId);
        return;
      } catch (e) {}
    }
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    const sh = (typeof global.getShopLetterhead === 'function')
      ? global.getShopLetterhead()
      : { name: 'KISSAN FERTILIZER', address: 'Miro Khan Road, Kamber', tagline: 'Fertilizer · Seed · Pesticide', phone: '' };
    const ctx = global._bahiPrintCtx || {};
    const partyName = ctx.name || '';
    const stmtTitle = ctx.isCustomer === false ? 'SUPPLIER STATEMENT' : 'PARTY STATEMENT';
    const partyMeta = [ctx.phone || '', ctx.address || ''].filter(Boolean).join(' · ');
    const letterhead =
      '<div style="text-align:center;border-bottom:2px solid #0f3d24;padding-bottom:12px;margin-bottom:14px">' +
      '<div style="font-size:20px;font-weight:800;color:#0f3d24;letter-spacing:.04em">' + (sh.name || 'KISSAN FERTILIZER') + '</div>' +
      '<div style="font-size:12px;color:#5a6656;margin-top:3px">' + (sh.address || '') + (sh.phone ? ' · ' + sh.phone : '') + '</div>' +
      '<div style="font-size:11px;color:#6b7a68;margin-top:2px">' + (sh.tagline || '') + '</div>' +
      '<div style="font-size:10.5px;color:#64748b;margin-top:4px">Printed: ' + new Date().toLocaleString('en-PK') + '</div>' +
      (partyName
        ? ('<div style="text-align:left;margin-top:10px;padding-top:8px;border-top:1.5px solid #0f3d24">' +
           '<div style="font-size:16px;font-weight:700">' + partyName + '</div>' +
           '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f3d24;margin-top:2px">' + stmtTitle + '</div>' +
           (partyMeta ? '<div style="font-size:11px;color:#64748b;margin-top:3px">' + partyMeta + '</div>' : '') +
           '</div>')
        : '') +
      '</div>';
    const letterheadFinal = (typeof global.shopLetterheadHtml === 'function' && partyName)
      ? global.shopLetterheadHtml({ partyName: partyName, statementTitle: stmtTitle, partyMeta: partyMeta, printed: true })
      : letterhead;
    const table = el.cloneNode(true);
    table.querySelectorAll('.no-print, th.no-print, td.no-print').forEach(function (n) { n.remove(); });
    win.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ledger — ' + (partyName || 'Statement') + '</title>' +
      '<style>' +
      'body{font-family:Georgia,"Times New Roman",serif;padding:18px 22px;color:#1a2218;background:#fff;direction:ltr}' +
      'table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px}' +
      'th,td{border:1px solid #333;padding:5px 6px}' +
      'th{background:#cfcdea;color:#000;font-size:10.5px;text-transform:uppercase}' +
      '.right,td.right,th.right{text-align:right;font-family:"Courier New",monospace}' +
      '.center{text-align:center}' +
      'tfoot td{font-weight:800;background:#cfcdea !important;color:#000 !important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.foot{display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:16px;border-top:1px dashed #ccc;padding-top:8px}' +
      '@media print{body{padding:8px}}' +
      '</style></head><body>' +
      letterheadFinal +
      table.outerHTML +
      '<p class="foot"><span>Dr = Debit · Cr = Credit · Software by Fazul Khan Chandio · 03333909816</span>' +
      '<span style="font-weight:700">Kissan Fertilizer Kamber</span></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>' +
      '</body></html>'
    );
    win.document.close();
  }

  function install() {
    global.openLedger = openBahiLedger;
    global.refreshOpenLedger = refreshOpenLedger;
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
