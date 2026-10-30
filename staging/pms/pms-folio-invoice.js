// ==========================================================================
// pms/pms-folio-invoice.js - Printable Branded Guest Folio & Invoice Generator
// Wild & Wandering Property Management System
// ==========================================================================

import { formatCurrency, roundCurrency } from '../core/money.js';
import { getLocalYMD } from '../core/dates.js';

export function generateGuestInvoice(booking = null) {
    let b = booking;
    if (!b) {
        const rList = Array.from(document.querySelectorAll('.assigned-room-select') || []).map(s => s.value).filter(Boolean);
        b = {
            id: document.getElementById('guest-id')?.value || 'INV-001',
            bookId: document.getElementById('booking-id')?.value || 'DIRECT',
            firstName: document.getElementById('first-name')?.value || '',
            lastName: document.getElementById('last-name')?.value || 'Guest',
            phone: document.getElementById('phone')?.value || '',
            email: document.getElementById('email')?.value || '',
            country: document.getElementById('guest-country')?.value || '',
            checkIn: document.getElementById('check-in')?.value || '',
            checkOut: document.getElementById('check-out')?.value || '',
            bookedType: document.getElementById('booked-type')?.value || 'Room',
            room: rList.join(', ') || 'Unassigned',
            totalPrice: parseFloat(document.getElementById('total-price')?.value) || 0,
            payments: []
        };
    }

    const curProp = window.currentPropertyConfig || {};
    const propName = curProp.name || 'Wild & Wandering Resort';
    const propAddress = curProp.address || '';
    const propContact = curProp.phone || curProp.email || '';
    const logoUrl = curProp.iconUrl || curProp.logoUrl || 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    const currency = curProp.currency || 'THB';

    let totalPaid = 0;
    (b.payments || []).forEach(p => totalPaid += (parseFloat(p.amt) || 0));
    const balanceDue = Math.max(0, b.totalPrice - totalPaid);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice - ${b.lastName}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2rem; color: #1e293b; font-size: 13px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
        .logo { height: 48px; object-fit: contain; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
        th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
        td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
        .total-box { text-align: right; margin-bottom: 1.5rem; }
        .due { color: #dc2626; font-size: 16px; font-weight: bold; }
        .btn-print { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 1rem; }
        @media print { .btn-print { display: none; } body { padding: 0; } }
    </style>
</head>
<body>
    <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
    <div class="header">
        <div>
            <img src="${logoUrl}" alt="${propName}" class="logo">
            <h2 style="margin: 4px 0 0 0;">${propName}</h2>
            <div style="font-size: 11px; color: #64748b;">${propAddress} • ${propContact}</div>
        </div>
        <div style="text-align: right;">
            <h1 style="margin: 0; color: #4f46e5;">FOLIO INVOICE</h1>
            <div style="font-size: 11px; font-weight: bold;">Ref: ${b.bookId}</div>
            <div style="font-size: 11px; color: #64748b;">Issued: ${getLocalYMD(new Date())}</div>
        </div>
    </div>
    <div class="grid">
        <div>
            <strong>Guest Name:</strong> ${b.firstName} ${b.lastName}<br>
            <strong>Phone / Email:</strong> ${b.phone || '--'} • ${b.email || '--'}<br>
            <strong>Nationality:</strong> ${b.country || '--'}
        </div>
        <div>
            <strong>Dates:</strong> ${b.checkIn} to ${b.checkOut}<br>
            <strong>Room Assigned:</strong> ${b.room}<br>
            <strong>Booked Category:</strong> ${b.bookedType}
        </div>
    </div>
    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th style="text-align: right;">Total (${currency})</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Accommodation Charges (${b.checkIn} → ${b.checkOut})</td>
                <td style="text-align: right; font-weight: bold;">${formatCurrency(b.totalPrice, currency)}</td>
            </tr>
        </tbody>
    </table>
    <div class="total-box">
        <div>Total Charges: <strong>${formatCurrency(b.totalPrice, currency)}</strong></div>
        <div>Total Paid: <strong style="color: #16a34a;">-${formatCurrency(totalPaid, currency)}</strong></div>
        <div class="due">Balance Due: ${formatCurrency(balanceDue, currency)}</div>
    </div>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
    }
}

if (typeof window !== 'undefined') {
    window.generateGuestInvoice = generateGuestInvoice;
}
