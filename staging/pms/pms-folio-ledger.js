// ==========================================================================
// pms/pms-folio-ledger.js - Financial Calculations, Payments & Charge Line Items
// Wild & Wandering Property Management System
// ==========================================================================

import { getLocalYMD } from '../core/dates.js';
import { roundCurrency, getDue, getPaid } from '../core/money.js';

export let activeExtraCharges = [];

export function toggleBadCC() {
    const box = document.getElementById('bad-cc-box');
    if (!box) return;
    const isBad = box.dataset.bad === 'true';
    box.dataset.bad = isBad ? 'false' : 'true';
    box.innerHTML = isBad ? '' : '<span class="text-white text-[10px] font-black">X</span>';
    box.className = `w-3.5 h-3.5 border-2 rounded mt-0.5 flex items-center justify-center cursor-pointer ${
        isBad ? 'border-slate-300' : 'bg-red-500 border-red-600'
    }`;
}

export function calcFinancials() {
    const totInput = document.getElementById('total-price');
    const tot = parseFloat(totInput?.value) || 0;
    
    let paidTotal = 0;
    let commissionTotal = 0;

    document.querySelectorAll('.payment-row').forEach(row => {
        const amt = parseFloat(row.querySelector('.pay-amt')?.value) || 0;
        const method = row.querySelector('.pay-method')?.value || '';
        paidTotal += amt;
        if (['hw-kp', 'airbnb-kp', 'bdc-kp', 'agoda-kp', 'expedia-kp', 'trip-kp', 'cc-fee'].includes(method)) {
            commissionTotal += amt;
        }
    });

    const due = Math.max(0, tot - paidTotal);
    const dispDue = document.getElementById('display-due');
    const dispPaid = document.getElementById('display-paid');

    if (dispDue) dispDue.innerText = `฿${roundCurrency(due).toLocaleString()}`;
    if (dispPaid) dispPaid.innerText = `฿${roundCurrency(paidTotal).toLocaleString()}`;

    const netEl = document.getElementById('net-price');
    if (netEl && netEl.dataset.override !== 'true') {
        const source = document.getElementById('booking-source')?.value || 'direct';
        let estimatedNet = tot;
        if (commissionTotal > 0) estimatedNet = tot - commissionTotal;
        else if (source === 'booking.com' || source === 'agoda') estimatedNet = tot * 0.82;
        else if (source === 'airbnb') estimatedNet = tot * 0.85;
        netEl.value = roundCurrency(estimatedNet).toFixed(2);
    }
}

export function addPaymentRow(date = '', amt = '', method = 'cash', locked = false) {
    const container = document.getElementById('payments-list');
    if (!container) return;

    const row = document.createElement('div');
    row.className = `payment-row flex gap-1 items-center bg-white p-1 rounded border border-slate-200 ${locked ? 'opacity-75' : ''}`;
    
    const dVal = date || getLocalYMD(new Date());
    let aVal = amt;
    if (aVal === '') {
        const tot = parseFloat(document.getElementById('total-price')?.value) || 0;
        let currentPaid = 0;
        document.querySelectorAll('.payment-row .pay-amt').forEach(i => currentPaid += (parseFloat(i.value) || 0));
        aVal = Math.max(0, tot - currentPaid);
    }

    const paymentMethods = [
        { key: 'cash', label: 'CASH' },
        { key: 'card', label: 'CARD' },
        { key: 'scan', label: 'SCAN' },
        { key: 'transfer', label: 'TRANSFER' },
        { key: 'bdc-pay', label: 'BDC PAY' },
        { key: 'bdc-kp', label: 'BDC KP' },
        { key: 'hw-kp', label: 'HW KP' },
        { key: 'agoda-pay', label: 'AGODA PAY' },
        { key: 'agoda-kp', label: 'AGODA KP' },
        { key: 'airbnb-pay', label: 'AIRBNB PAY' },
        { key: 'airbnb-kp', label: 'AIRBNB KP' }
    ];

    let optionsHtml = paymentMethods.map(m => 
        `<option value="${m.key}" ${m.key === method ? 'selected' : ''}>${m.label}</option>`
    ).join('');

    row.innerHTML = `
        <input type="date" class="pay-date w-24 text-[10px] font-bold p-1 bg-slate-50 border rounded" value="${dVal}" ${locked ? 'disabled' : ''}>
        <input type="number" step="any" class="pay-amt w-16 text-[11px] font-black p-1 bg-slate-50 border rounded text-right" value="${aVal}" oninput="window.calcFinancials()" ${locked ? 'disabled' : ''}>
        <select class="pay-method flex-1 text-[10px] font-bold p-1 bg-slate-50 border rounded uppercase" ${locked ? 'disabled' : ''}>
            ${optionsHtml}
        </select>
        <button type="button" onclick="this.closest('.payment-row').remove(); window.calcFinancials();" class="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer">
            &times;
        </button>
    `;

    container.appendChild(row);
    calcFinancials();
}

export function openAddChargeModal() {
    const modal = document.getElementById('charge-modal');
    if (!modal) return;
    document.getElementById('charge-desc').value = '';
    document.getElementById('charge-amount').value = '';
    document.getElementById('charge-date').value = getLocalYMD(new Date());

    modal.classList.add('active');
    modal.style.display = 'flex';
}

export function confirmAddCharge() {
    const desc = document.getElementById('charge-desc')?.value.trim();
    const amt = parseFloat(document.getElementById('charge-amount')?.value) || 0;
    const date = document.getElementById('charge-date')?.value || getLocalYMD(new Date());

    if (!desc || amt <= 0) return;

    activeExtraCharges.push({
        id: 'chg_' + Math.random().toString(36).substr(2, 7),
        desc: desc.toUpperCase(),
        amt: amt,
        date: date
    });

    const totEl = document.getElementById('total-price');
    if (totEl) {
        totEl.value = (parseFloat(totEl.value || 0) + amt).toFixed(2);
    }

    renderExtraCharges();
    calcFinancials();

    const modal = document.getElementById('charge-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

export function renderExtraCharges() {
    const wrap = document.getElementById('extra-charges-wrapper');
    const list = document.getElementById('extra-charges-list');
    const totalDisp = document.getElementById('extra-charges-total');
    if (!wrap || !list) return;

    if (activeExtraCharges.length === 0) {
        wrap.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    wrap.classList.remove('hidden');
    let sum = 0;
    list.innerHTML = activeExtraCharges.map((c, idx) => {
        sum += c.amt;
        return `
            <div class="flex items-center justify-between text-[11px] bg-white px-2 py-1 rounded border border-amber-200">
                <span class="font-bold text-slate-700">${c.desc} (${c.date})</span>
                <div class="flex items-center gap-1.5">
                    <span class="font-black text-amber-800">+฿${c.amt}</span>
                    <button type="button" onclick="window.removeCharge(${idx})" class="text-slate-400 hover:text-red-500 cursor-pointer">&times;</button>
                </div>
            </div>
        `;
    }).join('');

    if (totalDisp) totalDisp.innerText = `+฿${sum}`;
}

export function removeCharge(index) {
    const item = activeExtraCharges.splice(index, 1)[0];
    if (item) {
        const totEl = document.getElementById('total-price');
        if (totEl) {
            totEl.value = Math.max(0, parseFloat(totEl.value || 0) - item.amt).toFixed(2);
        }
    }
    renderExtraCharges();
    calcFinancials();
}

if (typeof window !== 'undefined') {
    window.toggleBadCC = toggleBadCC;
    window.calcFinancials = calcFinancials;
    window.addPaymentRow = addPaymentRow;
    window.openAddChargeModal = openAddChargeModal;
    window.confirmAddCharge = confirmAddCharge;
    window.removeCharge = removeCharge;
}
