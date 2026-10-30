// ==========================================================================
// pms/pms-folio-ledger.js - Financial Calculations, Payments & Itemized Add-ons
// Wild & Wandering Property Management System
// ==========================================================================

import { getLocalYMD } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';

export let activeExtraCharges = [];

export function setActiveExtraCharges(charges) {
    activeExtraCharges = Array.isArray(charges) ? [...charges] : [];
}

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

    const due = Number((tot - paidTotal).toFixed(2));
    const dispDue = document.getElementById('display-due');
    const dispPaid = document.getElementById('display-paid');
    const pax = parseInt(document.getElementById('pax-count')?.value, 10) || 1;

    if (dispDue) {
        dispDue.innerText = `฿${due.toFixed(2)}`;
        if (pax > 1) {
            dispDue.title = `Split: ฿${(due / pax).toFixed(2)} each`;
            dispDue.classList.add('cursor-help', 'border-b-2', 'border-dashed', 'border-red-300');
        } else {
            dispDue.title = '';
            dispDue.classList.remove('cursor-help', 'border-b-2', 'border-dashed', 'border-red-300');
        }
    }

    if (dispPaid) {
        dispPaid.innerText = `฿${paidTotal.toFixed(2)}`;
    }

    const netEl = document.getElementById('net-price');
    if (netEl && netEl.dataset.override !== 'true') {
        const source = (document.getElementById('booking-source')?.value || 'direct').toLowerCase();
        let net = tot;
        if (commissionTotal > 0) {
            net = tot - commissionTotal;
        } else if (source === 'booking.com' || source === 'agoda') {
            net = tot * 0.815;
        } else if (source === 'airbnb') {
            net = tot * 0.845;
        }
        netEl.value = Number(net.toFixed(2));
    }
}

export function overrideNet() {
    const netEl = document.getElementById('net-price');
    if (netEl) netEl.dataset.override = 'true';
}

let paymentCounter = 0;
export function addPaymentRow(date = '', amt = '', method = 'cash', locked = false) {
    const container = document.getElementById('payments-list');
    if (!container) return;

    const rowId = `pay-row-${paymentCounter++}`;
    const row = document.createElement('div');
    row.className = `payment-row flex gap-1 items-center bg-white p-1 rounded border border-slate-200 transition-opacity ${locked ? 'opacity-70' : ''}`;
    row.id = rowId;

    const dVal = date || getLocalYMD(new Date());
    let aVal = amt;

    if (aVal === '') {
        const tot = parseFloat(document.getElementById('total-price')?.value) || 0;
        let currentPaid = 0;
        document.querySelectorAll('.payment-row .pay-amt').forEach(i => currentPaid += (parseFloat(i.value) || 0));
        const due = tot - currentPaid;
        if (due > 0) aVal = Number(due.toFixed(2));
    }

    const paymentOptions = [
        'cash', 'card', 'scan', 'cc-fee',
        'hw-kp',
        'bdc-kp', 'bdc-pay',
        'agoda-kp', 'agoda-pay',
        'airbnb-kp', 'airbnb-pay',
        'expedia-kp', 'expedia-pay',
        'trip-kp', 'trip-pay',
        'other'
    ];

    let optionsHtml = paymentOptions.map(m => 
        `<option value="${m}" ${m === method ? 'selected' : ''}>${m.replace(/-/g, ' ').toUpperCase()}</option>`
    ).join('');

    row.innerHTML = `
        <input type="date" class="pay-date w-24 text-[10px] font-bold p-1 bg-slate-50 border rounded" value="${dVal}" ${locked ? 'disabled' : ''}>
        <input type="number" step="any" class="pay-amt w-16 text-[11px] font-black p-1 bg-slate-50 border rounded text-right" value="${aVal}" oninput="window.calcFinancials()" ${locked ? 'disabled' : ''}>
        <select class="pay-method flex-1 text-[10px] font-bold p-1 bg-slate-50 border rounded uppercase" onchange="window.calcFinancials()" ${locked ? 'disabled' : ''}>
            ${optionsHtml}
        </select>
        ${locked ? `
            <button type="button" onclick="window.unlockPaymentRow('${rowId}')" class="p-1 text-slate-400 hover:text-blue-600 bg-slate-50 rounded border border-slate-200 cursor-pointer" title="Edit">
                <i data-lucide="edit" size="12"></i>
            </button>
        ` : `
            <button type="button" onclick="window.removePaymentRow('${rowId}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer" title="Delete">
                <i data-lucide="trash-2" size="12"></i>
            </button>
        `}
    `;

    container.appendChild(row);
    calcFinancials();
    if (window.lucide) window.lucide.createIcons();
}

export function unlockPaymentRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.classList.remove('opacity-70');
    row.querySelectorAll('input, select').forEach(el => el.disabled = false);
    row.lastElementChild.outerHTML = `
        <button type="button" onclick="window.removePaymentRow('${rowId}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer" title="Delete">
            <i data-lucide="trash-2" size="12"></i>
        </button>
    `;
    if (window.lucide) window.lucide.createIcons();
}

export function removePaymentRow(rowId) {
    customAlert("Delete Payment", "Remove this payment record?", true, () => {
        const row = document.getElementById(rowId);
        if (row) row.remove();
        calcFinancials();
    });
}

export function openAddChargeModal() {
    const modal = document.getElementById('charge-modal');
    if (!modal) return;
    document.getElementById('charge-desc').value = '';
    document.getElementById('charge-amount').value = '';
    document.getElementById('charge-date').value = document.getElementById('check-in')?.value || getLocalYMD(new Date());

    modal.classList.add('active');
    modal.style.display = 'flex';
}

export function confirmAddCharge() {
    const desc = document.getElementById('charge-desc')?.value.trim();
    const amt = parseFloat(document.getElementById('charge-amount')?.value);
    const date = document.getElementById('charge-date')?.value || getLocalYMD(new Date());

    if (!desc || isNaN(amt) || amt <= 0) {
        return customAlert("Invalid Entry", "Please enter a valid description and positive charge amount.");
    }

    activeExtraCharges.push({
        id: 'chg_' + Math.random().toString(36).substr(2, 7),
        desc: desc.toUpperCase(),
        amt: Number(amt.toFixed(2)),
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
        if (totalDisp) totalDisp.innerText = '+฿0';
        return;
    }

    wrap.classList.remove('hidden');
    let sum = 0;
    list.innerHTML = activeExtraCharges.map(c => {
        sum += Number(c.amt);
        return `
            <div class="flex items-center justify-between bg-white px-2 py-1 rounded border border-amber-200 text-xs">
                <div class="flex items-center gap-1.5 truncate">
                    <span class="font-black text-slate-700 uppercase">${c.desc}</span>
                    <span class="text-[9px] font-bold text-slate-400">(${c.date ? c.date.substr(5) : ''})</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="font-black text-amber-700">+฿${Number(c.amt).toFixed(2)}</span>
                    <button type="button" onclick="window.removeCharge('${c.id}')" class="p-0.5 text-red-400 hover:text-red-600 cursor-pointer" title="Delete Charge">
                        <i data-lucide="trash-2" size="12"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (totalDisp) totalDisp.innerText = `+฿${sum.toFixed(2)}`;
    if (window.lucide) window.lucide.createIcons();
}

export function removeCharge(chargeId) {
    const idx = activeExtraCharges.findIndex(c => c.id === chargeId);
    if (idx > -1) {
        const removed = activeExtraCharges.splice(idx, 1)[0];
        const totEl = document.getElementById('total-price');
        if (totEl) {
            totEl.value = Math.max(0, (parseFloat(totEl.value) || 0) - removed.amt).toFixed(2);
        }
    }
    renderExtraCharges();
    calcFinancials();
}

if (typeof window !== 'undefined') {
    window.toggleBadCC = toggleBadCC;
    window.calcFinancials = calcFinancials;
    window.overrideNet = overrideNet;
    window.addPaymentRow = addPaymentRow;
    window.unlockPaymentRow = unlockPaymentRow;
    window.removePaymentRow = removePaymentRow;
    window.openAddChargeModal = openAddChargeModal;
    window.confirmAddCharge = confirmAddCharge;
    window.renderExtraCharges = renderExtraCharges;
    window.removeCharge = removeCharge;
}
