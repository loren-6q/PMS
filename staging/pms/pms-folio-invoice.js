// ==========================================================================
// pms/pms-folio-invoice.js - Printable Branded Guest Folio & Invoice Generator
// Wild & Wandering Property Management System
// ==========================================================================

import { getLocalYMD, parseYMD } from '../core/dates.js';
import { formatCurrency } from '../core/money.js';

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

// --- 1. Master Printable Invoice Generator ---
export function generateGuestInvoice(booking = null) {
    let b = booking;

    // Fallback: If no booking object is provided, read live values from the open folio form
    if (!b) {
        const guestId = document.getElementById('guest-id')?.value;
        const staffList = window.staff || [];
        b = staffList.find(s => s.id === guestId);

        if (!b) {
            const total = parseFloat(document.getElementById('total-price')?.value) || 0;
            const rList = Array.from(document.querySelectorAll('.assigned-room-select') || [])
                .map(s => s.value)
                .filter(Boolean);
            const todayStr = getLocalYMD(new Date());

            b = {
                id: guestId || 'DRAFT',
                bookId: document.getElementById('booking-id')?.value || guestId || 'DIRECT',
                firstName: document.getElementById('first-name')?.value || 'Guest',
                lastName: document.getElementById('last-name')?.value || '',
                phone: document.getElementById('phone')?.value || '',
                email: document.getElementById('email')?.value || '',
                country: document.getElementById('guest-country')?.value || '',
                checkIn: document.getElementById('check-in')?.value || todayStr,
                checkOut: document.getElementById('check-out')?.value || todayStr,
                bookedType: document.getElementById('booked-type')?.value || 'Standard Room',
                room: rList[0] || 'Unassigned',
                rooms: rList,
                totalPrice: total,
                payments: Array.from(document.querySelectorAll('.payment-row') || []).map(r => ({
                    date: r.querySelector('.pay-date')?.value || todayStr,
                    amt: parseFloat(r.querySelector('.pay-amt')?.value) || 0,
                    method: r.querySelector('.pay-method')?.value || 'cash'
                })),
                extraCharges: window.activeExtraCharges || [],
                source: document.getElementById('booking-source')?.value || 'Direct',
                pax: parseInt(document.getElementById('pax-count')?.value, 10) || 1
            };
        }
    }

    // --- 2. Dynamic Property Branding & Contact Details ---
    const curProp = window.currentPropertyConfig || {};
    const curPropId = window.currentPropertyId || 'property';
    const propertyName = curProp.name || curProp.title || curPropId.toUpperCase();
    const propertySubtitle = curProp.subtitle || curProp.tagline || "";
    const propertyAddress = curProp.address || "";
    const currencySym = curProp.currencySymbol || (curProp.currency === 'USD' ? '$' : (curProp.currency === 'EUR' ? '€' : (curProp.currency === 'GBP' ? '£' : '฿')));
    const activeLogoUrl = curProp.iconUrl || curProp.logoUrl || DEFAULT_WW_ICON;

    const contactParts = [];
    if (curProp.email) contactParts.push(curProp.email);
    if (curProp.phone) contactParts.push(curProp.phone);
    if (curProp.website) contactParts.push(curProp.website);
    const propertyContact = contactParts.join(' • ');

    // --- 3. Stay Duration & Room Normalization ---
    const inMs = parseYMD(b.checkIn);
    const outMs = parseYMD(b.checkOut);
    const nights = Math.max(1, Math.round((outMs - inMs) / 86400000)) || 1;

    const hotelRooms = window.hotelRooms || [];
    const rList = (b.rooms && b.rooms.length > 0) ? b.rooms : [b.room].filter(Boolean);
    const roomListStr = rList.length > 0 ? rList.join(', ') : (b.room || 'Room / Bed Assigned');

    const resolvedTypes = [];
    rList.forEach(rid => {
        const hr = hotelRooms.find(r => r.id === rid);
        const cat = hr ? (hr.category || hr.type) : null;
        if (cat && !resolvedTypes.includes(cat)) resolvedTypes.push(cat);
    });

    let cleanCategory = resolvedTypes.join(', ');
    if (!cleanCategory) {
        cleanCategory = b.bookedType || 'Standard Room';
        if (cleanCategory.includes('(')) cleanCategory = cleanCategory.split('(')[0].trim();
    }

    // --- 4. Ledger Calculations & Itemized Line Items ---
    const rawPayments = Array.isArray(b.payments) ? b.payments : [];
    const extraCharges = Array.isArray(b.extraCharges) ? b.extraCharges : [];
    const totalExtra = extraCharges.reduce((sum, c) => sum + (parseFloat(c.amt || c.amount) || 0), 0);
    const accommodationTotal = Math.max(0, (parseFloat(b.totalPrice) || 0) - totalExtra);
    const grandTotal = parseFloat(b.totalPrice) || 0;
    const totalPaid = rawPayments.reduce((sum, p) => sum + (parseFloat(p.amt) || 0), 0);
    const balanceDue = Number((grandTotal - totalPaid).toFixed(2));

    const invoiceNumber = `INV-${(b.bookId || b.id || '0000').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
    const issueDate = getLocalYMD(new Date());

    // --- 5. Clean Classification of OTA vs Direct Payments ---
    const cleanPayments = [];
    const groupedOta = {};

    rawPayments.forEach(p => {
        const rawM = (p.method || 'payment').toLowerCase().trim();
        const amt = parseFloat(p.amt) || 0;
        const date = p.date || issueDate;

        if (rawM.includes('bdc') || rawM.includes('booking')) {
            if (!groupedOta['Booking.com']) groupedOta['Booking.com'] = { date, method: 'Booking.com (Prepaid Online)', amt: 0 };
            groupedOta['Booking.com'].amt += amt;
        } else if (rawM.includes('agoda')) {
            if (!groupedOta['Agoda']) groupedOta['Agoda'] = { date, method: 'Agoda (Prepaid Online)', amt: 0 };
            groupedOta['Agoda'].amt += amt;
        } else if (rawM.includes('hw') || rawM.includes('hostelworld')) {
            if (!groupedOta['Hostelworld']) groupedOta['Hostelworld'] = { date, method: 'Hostelworld Deposit (Online)', amt: 0 };
            groupedOta['Hostelworld'].amt += amt;
        } else if (rawM.includes('expedia')) {
            if (!groupedOta['Expedia']) groupedOta['Expedia'] = { date, method: 'Expedia (Prepaid Online)', amt: 0 };
            groupedOta['Expedia'].amt += amt;
        } else if (rawM.includes('airbnb')) {
            if (!groupedOta['Airbnb']) groupedOta['Airbnb'] = { date, method: 'Airbnb (Prepaid Online)', amt: 0 };
            groupedOta['Airbnb'].amt += amt;
        } else {
            let friendlyMethod = 'Payment';
            if (rawM.includes('cash')) friendlyMethod = 'Cash';
            else if (rawM.includes('card') || rawM.includes('cc')) friendlyMethod = 'Credit / Debit Card';
            else if (rawM.includes('transfer') || rawM.includes('bank') || rawM.includes('promptpay') || rawM.includes('qr') || rawM.includes('scan')) friendlyMethod = 'Bank Transfer / QR Scan';
            else friendlyMethod = p.method ? p.method.toUpperCase() : 'Settlement';

            cleanPayments.push({ date, method: friendlyMethod, amt });
        }
    });

    Object.values(groupedOta).forEach(item => {
        cleanPayments.unshift({
            date: item.date,
            method: item.method,
            amt: Number(item.amt.toFixed(2))
        });
    });

    // --- 6. HTML & CSS Document Template ---
    const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice - ${b.firstName} ${b.lastName} (${invoiceNumber})</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background: #f8fafc; color: #1e293b; padding: 24px; font-size: 13px; line-height: 1.4; }
        .invoice-card { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
        .logo-wrap { display: flex; align-items: center; gap: 14px; max-width: 500px; }
        .logo { height: 56px; max-width: 180px; object-fit: contain; }
        .prop-name { font-size: 20px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; }
        .prop-sub { font-size: 11px; font-weight: 700; color: #64748b; margin-top: 2px; }
        .prop-addr { font-size: 10px; color: #94a3b8; margin-top: 4px; max-width: 340px; }
        .inv-title-wrap { text-align: right; }
        .inv-title { font-size: 24px; font-weight: 900; text-transform: uppercase; color: #4338ca; letter-spacing: 1px; }
        .inv-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-top: 6px; }
        .badge-paid { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .badge-due { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #edf2f7; }
        .meta-block h4 { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px; }
        .meta-block p { font-size: 12px; font-weight: 700; color: #0f172a; }
        .meta-block span { font-size: 11px; font-weight: 500; color: #475569; display: block; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #cbd5e1; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .item-name { font-weight: 800; color: #0f172a; }
        .item-desc { font-size: 11px; color: #64748b; margin-top: 2px; }
        .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
        .totals-table { width: 280px; }
        .totals-table tr td { padding: 6px 0; border: none; font-size: 12px; }
        .grand-total { font-size: 16px; font-weight: 900; color: #0f172a; border-top: 2px solid #e2e8f0 !important; padding-top: 8px !important; }
        .payments-section { border-top: 1px dashed #cbd5e1; padding-top: 16px; margin-bottom: 24px; }
        .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 10px; }
        .footer { text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8; }
        .btn-print-bar { max-width: 800px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; }
        .btn-print { background: #4338ca; color: #ffffff; padding: 10px 20px; font-size: 12px; font-weight: 800; text-transform: uppercase; border-radius: 6px; border: none; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn-print:hover { background: #3730a3; }
        @media print {
            body { background: #ffffff; padding: 0; }
            .invoice-card { box-shadow: none; border: none; padding: 0; }
            .btn-print-bar { display: none; }
        }
    </style>
</head>
<body>
    <div class="btn-print-bar">
        <span style="font-weight: 700; color: #64748b; font-size: 12px;">Invoice Ready</span>
        <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
    </div>

    <div class="invoice-card">
        <div class="header">
            <div class="logo-wrap">
                <img src="${activeLogoUrl}" alt="${propertyName}" class="logo" onerror="this.src='${DEFAULT_WW_ICON}'">
                <div>
                    <h1 class="prop-name">${propertyName}</h1>
                    ${propertySubtitle ? `<p class="prop-sub">${propertySubtitle}</p>` : ''}
                    ${propertyAddress ? `<p class="prop-addr">${propertyAddress}</p>` : ''}
                    ${propertyContact ? `<p class="prop-addr">${propertyContact}</p>` : ''}
                </div>
            </div>
            <div class="inv-title-wrap">
                <h2 class="inv-title">INVOICE</h2>
                <p style="font-size: 11px; font-weight: 800; color: #475569; margin-top: 4px;"># ${invoiceNumber}</p>
                <p style="font-size: 11px; color: #94a3b8;">Issued: ${issueDate}</p>
                <span class="inv-badge ${balanceDue <= 0 ? 'badge-paid' : 'badge-due'}">
                    ${balanceDue <= 0 ? 'PAID IN FULL' : `BALANCE DUE: ${currencySym}${balanceDue.toLocaleString()}`}
                </span>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-block">
                <h4>Billed To (Guest)</h4>
                <p>${b.firstName || ''} ${b.lastName || ''}</p>
                ${b.country ? `<span>Country: ${b.country}</span>` : ''}
                ${b.email ? `<span>Email: ${b.email}</span>` : ''}
                ${b.phone ? `<span>Phone: ${b.phone}</span>` : ''}
            </div>
            <div class="meta-block">
                <h4>Stay & Booking Details</h4>
                <p>Dates: ${b.checkIn} &rarr; ${b.checkOut} (${nights} Night${nights > 1 ? 's' : ''})</p>
                <span>Unit(s): ${roomListStr}</span>
                <span>Category: ${cleanCategory}</span>
                <span>Ref: ${b.bookId || b.id || 'Direct'} (${(b.source || 'Direct').toUpperCase()})</span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 50%;">Description</th>
                    <th class="text-center" style="width: 15%;">Qty / Nts</th>
                    <th class="text-right" style="width: 15%;">Unit Price</th>
                    <th class="text-right" style="width: 20%;">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <div class="item-name">Accommodation Charges</div>
                        <div class="item-desc">${cleanCategory} • ${roomListStr} (${nights} night${nights > 1 ? 's' : ''})</div>
                    </td>
                    <td class="text-center font-bold">${nights}</td>
                    <td class="text-right font-mono">${currencySym}${(accommodationTotal / nights).toFixed(2)}</td>
                    <td class="text-right font-black font-mono">${currencySym}${accommodationTotal.toFixed(2)}</td>
                </tr>
                ${extraCharges.map(c => `
                <tr>
                    <td>
                        <div class="item-name">${c.desc || 'Folio Service'}</div>
                        <div class="item-desc">Date: ${c.date || issueDate}</div>
                    </td>
                    <td class="text-center font-bold">1</td>
                    <td class="text-right font-mono">${currencySym}${Number(c.amt || c.amount || 0).toFixed(2)}</td>
                    <td class="text-right font-black font-mono">${currencySym}${Number(c.amt || c.amount || 0).toFixed(2)}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="totals-wrap">
            <table class="totals-table">
                <tr>
                    <td style="color: #64748b;">Subtotal:</td>
                    <td class="text-right font-mono font-bold">${currencySym}${grandTotal.toFixed(2)}</td>
                </tr>
                <tr class="grand-total">
                    <td>Total Amount:</td>
                    <td class="text-right font-mono">${currencySym}${grandTotal.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="color: #15803d; font-weight: 700;">Total Payments:</td>
                    <td class="text-right font-mono font-bold" style="color: #15803d;">-${currencySym}${totalPaid.toFixed(2)}</td>
                </tr>
                <tr style="border-top: 1px solid #e2e8f0; font-weight: 900;">
                    <td style="color: ${balanceDue > 0 ? '#b91c1c' : '#0f172a'};">Outstanding Due:</td>
                    <td class="text-right font-mono" style="color: ${balanceDue > 0 ? '#b91c1c' : '#0f172a'};">${currencySym}${balanceDue.toFixed(2)}</td>
                </tr>
            </table>
        </div>

        ${cleanPayments.length > 0 ? `
        <div class="payments-section">
            <div class="section-title">Payments & Settlements</div>
            <table>
                <thead>
                    <tr>
                        <th>Payment Date</th>
                        <th>Method / Channel</th>
                        <th>Status</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${cleanPayments.map(p => `
                    <tr>
                        <td class="font-mono">${p.date || issueDate}</td>
                        <td style="font-weight: 700;">${p.method}</td>
                        <td><span style="color: #15803d; font-weight: 800; font-size: 10px; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">SUCCESS</span></td>
                        <td class="text-right font-mono font-black" style="color: #15803d;">${currencySym}${Number(p.amt || 0).toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="footer">
            <p style="font-weight: 700; color: #475569; margin-bottom: 4px;">Thank you for staying at ${propertyName}!</p>
            ${propertyContact ? `<p>${propertyContact}</p>` : ''}
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
        };
    <\/script>
</body>
</html>`;

    // --- 7. Window Dispatcher & Popup Guard ---
    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.open();
        printWin.document.write(printHtml);
        printWin.document.close();
    } else {
        alert("Pop-up blocked. Please allow pop-ups for this website to print/export invoices.");
    }
}

// --- 8. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.generateGuestInvoice = generateGuestInvoice;
}
