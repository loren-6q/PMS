// ==========================================================================
// pms/pms-folio-ledger.js - Folio Financials, Payments & Extra Charges
// Wild & Wandering Property Management System
// ==========================================================================

import { getLocalYMD, parseYMD } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';

// --- 1. Ledger State ---
export let activeExtraCharges = [];

export function setActiveExtraCharges(charges) {
    activeExtraCharges = Array.isArray(charges) ? [...charges] : [];
}

// --- 2. Bad Credit Card Flag Toggle ---
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

// --- 3. Master Financial Balance & Net Price Calculator ---
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
    const totWrap = totInput?.parentElement;
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

    if (totWrap) {
        if (pax > 1) {
            totWrap.title = `Split: ฿${(tot / pax).toFixed(2)} each`;
            totWrap.classList.add('cursor-help', 'border-b-2', 'border-dashed', 'border-slate-300');
        } else {
            totWrap.title = '';
            totWrap.classList.remove('cursor-help', 'border-b-2', 'border-dashed', 'border-slate-300');
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
        } else {
            const commConfig = window.currentPropertyConfig?.commissions || {};
            const bdcComm = parseFloat(commConfig.booking) || 18.5;
            const agodaComm = parseFloat(commConfig.agoda) || 18.5;
            const airbnbComm = parseFloat(commConfig.airbnb) || 15.5;
            const expediaComm = parseFloat(commConfig.expedia) || 18.0;

            if (source === 'booking.com') net = tot * (1 - (bdcComm / 100));
            else if (source === 'agoda') net = tot * (1 - (agodaComm / 100));
            else if (source === 'airbnb') net = tot * (1 - (airbnbComm / 100));
            else if (source === 'expedia') net = tot * (1 - (expediaComm / 100));
        }
        netEl.value = Number(net.toFixed(2));
    }
}

export function overrideNet() {
    const netEl = document.getElementById('net-price');
    if (netEl) netEl.dataset.override = 'true';
}

// --- 4. Payment Rows Management (Add, Unlock, Delete) ---
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
            <button type="button" onclick="window.unlockPaymentRow('${rowId}')" class="p-1 text-slate-400 hover:text-blue-600 bg-slate-50 rounded border border-slate-200 cursor-pointer" title="Edit Payment">
                <i data-lucide="edit" size="12"></i>
            </button>
        ` : `
            <button type="button" onclick="window.removePaymentRow('${rowId}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer" title="Delete Payment">
                <i data-lucide="trash-2" size="12"></i>
            </button>
        `}
    `;

    container.appendChild(row);
    calcFinancials();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function unlockPaymentRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.classList.remove('opacity-70');
    row.querySelectorAll('input, select').forEach(el => el.disabled = false);
    row.lastElementChild.outerHTML = `
        <button type="button" onclick="window.removePaymentRow('${rowId}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer" title="Delete Payment">
            <i data-lucide="trash-2" size="12"></i>
        </button>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function removePaymentRow(rowId) {
    customAlert("Delete Payment", "Remove this payment record?", true, () => {
        const row = document.getElementById(rowId);
        if (row) row.remove();
        calcFinancials();
    });
}

// --- 5. Itemized Add-ons & Extra Charges ---
export function openAddChargeModal() {
    const modal = document.getElementById('charge-modal');
    if (!modal) return;

    document.getElementById('charge-desc').value = '';
    document.getElementById('charge-amount').value = '';
    document.getElementById('charge-date').value = document.getElementById('check-in')?.value || getLocalYMD(new Date());

    const presetsContainer = document.getElementById('charge-presets-container');
    if (presetsContainer) {
        const configuredAddons = (window.currentPropertyConfig?.addons && window.currentPropertyConfig.addons.length > 0)
            ? window.currentPropertyConfig.addons
            : [
                { name: 'Extension', price: '' },
                { name: 'Upgrade', price: '' },
                { name: 'Late Checkout', price: 100 },
                { name: 'Early Checkin', price: 100 },
                { name: 'Transfer', price: 200 }
            ];

        presetsContainer.innerHTML = configuredAddons.map(item => `
            <button type="button" onclick="window.applyChargePreset('${item.name}', '${item.price || ''}')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-[10px] font-bold cursor-pointer">
                ${item.name} ${item.price ? '฿' + item.price : ''}
            </button>
        `).join('');
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
}

export function applyChargePreset(desc, price) {
    const descEl = document.getElementById('charge-desc');
    const amtEl = document.getElementById('charge-amount');
    if (descEl) descEl.value = desc;
    if (amtEl) {
        amtEl.value = price;
        amtEl.focus();
    }
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
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
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

// --- 6. Stay Extension Calculation & Smart Rate Engine ---
export function calcExtension() {
    const cI = document.getElementById('check-in')?.value;
    const cO = document.getElementById('check-out')?.value;
    if (!cI || !cO) return;

    const ms = parseYMD(cO) - parseYMD(cI);
    const nights = Math.max(1, Math.round(ms / 86400000));
    const avg = nights > 0 ? (Number(document.getElementById('total-price')?.value) || 0) / nights : 0;
    const days = parseInt(document.getElementById('ext-days')?.value, 10) || 1;
    
    const avgEl = document.getElementById('ext-avg-rate');
    const prEl = document.getElementById('ext-price');
    const checkBtn = document.getElementById('btn-check-bdc');

    if (avgEl) {
        avgEl.value = Math.round(avg);
    }
    if (prEl) {
        prEl.value = Math.round(avg * days);
    }
    if (checkBtn) {
        checkBtn.classList.remove('animate-pulse');
    }
}

export function checkExtensionRate() {
    const cI = document.getElementById('check-in')?.value;
    const cO = document.getElementById('check-out')?.value;
    if (!cO || !cI) return customAlert("Input Error", "Please ensure check-in and check-out dates are set.");
    
    const days = parseInt(document.getElementById('ext-days')?.value, 10) || 1;
    const source = (document.getElementById('booking-source')?.value || 'direct').toLowerCase();
    
    let roomCategory = document.getElementById('booked-type')?.value;
    if (!roomCategory) {
        const rList = Array.from(document.querySelectorAll('.assigned-room-select') || []).map(s => s.value).filter(Boolean);
        if (rList.length > 0 && window.hotelRooms) {
            const hr = window.hotelRooms.find(r => r.id === rList[0]);
            if (hr) roomCategory = hr.category || hr.type;
        }
    }
    roomCategory = roomCategory || 'Standard';

    if (!window.masterPricing || !window.masterPricing.timeline) {
        return customAlert("Rates Not Loaded", "Live pricing matrix is not currently loaded in the PMS view.\n\nPlease open the Channel Manager tab briefly to sync rates.");
    }

    const startMs = parseYMD(cO);
    const extDates = [];
    for (let i = 0; i < days; i++) {
        extDates.push(getLocalYMD(new Date(startMs + (i * 86400000))));
    }
    const extEndDateStr = getLocalYMD(new Date(startMs + (days * 86400000)));

    // Total stay nights: original stayed nights + extension nights
    const totalStayNights = Math.max(1, Math.round((parseYMD(extEndDateStr) - parseYMD(cI)) / 86400000));

    let nightlyBreakdown = [];
    let totalExtensionPrice = 0;

    for (let i = 0; i < extDates.length; i++) {
        const dStr = extDates[i];
        const isLastExtNight = (i === extDates.length - 1);
        const dayObj = window.masterPricing.timeline[dStr];
        
        if (!dayObj) {
            return customAlert("Missing Rate Data", `No rate matrix found for ${dStr}.`);
        }

        const roomObj = dayObj[roomCategory] || {};
        const globObj = dayObj['GLOBAL'] || {};

        const resolveRestr = (planId, field) => {
            if (planId) {
                const otaVal = dayObj.otaOverrides?.[`${planId}_${field}`];
                if (otaVal !== undefined && otaVal !== "") return otaVal;
                if (dayObj[planId]?.[field] !== undefined && dayObj[planId]?.[field] !== "") return dayObj[planId][field];
            }
            if (roomObj[field] !== undefined && roomObj[field] !== "") return roomObj[field];
            if (globObj[field] !== undefined && globObj[field] !== "") return globObj[field];
            return null;
        };

        const candidates = [];

        // 1. Evaluate Primary Base Rate Plan
        const basePrice = roomObj.std || roomObj.rate || 0;
        if (basePrice > 0) {
            const isStopped = !!(resolveRestr(null, 'stop') || resolveRestr(null, 'stopSell'));
            const ctd = !!resolveRestr(null, 'ctd');
            const minThrough = parseInt(resolveRestr(null, 'min') || 1, 10);
            const maxStay = parseInt(resolveRestr(null, 'max') || 0, 10);

            let eligible = !isStopped;

            // CTD applies ONLY on the final departure checkout date
            if (eligible && isLastExtNight && ctd) eligible = false;
            // Min stay evaluated against total stay duration
            if (eligible && minThrough > 1 && totalStayNights < minThrough) eligible = false;
            // Max stay evaluated against total stay duration
            if (eligible && maxStay > 0 && totalStayNights > maxStay) eligible = false;

            if (eligible) {
                candidates.push({
                    name: 'Standard Rate',
                    rate: basePrice
                });
            }
        }

        // 2. Evaluate Additional / Linked Rate Plans
        if (Array.isArray(window.masterPricing.ratePlans)) {
            window.masterPricing.ratePlans.forEach(plan => {
                if (plan.category && plan.category !== roomCategory && plan.pmsCategory !== roomCategory) return;
                
                const planId = plan.id || plan.ratePlanId;
                let planPrice = dayObj.otaOverrides?.[planId];
                if (planPrice === undefined || planPrice === "") {
                    planPrice = dayObj[planId]?.rate;
                }
                if (planPrice === undefined || planPrice === "" || isNaN(Number(planPrice)) || Number(planPrice) <= 0) {
                    return;
                }

                const isStopped = !!(resolveRestr(planId, 'stop') || resolveRestr(planId, 'stopSell'));
                const ctd = !!resolveRestr(planId, 'ctd');
                const minThrough = parseInt(resolveRestr(planId, 'min') || plan.minStay || 1, 10);
                const maxStay = parseInt(resolveRestr(planId, 'max') || plan.maxStay || 0, 10);

                let eligible = !isStopped;

                if (eligible && isLastExtNight && ctd) eligible = false;
                if (eligible && minThrough > 1 && totalStayNights < minThrough) eligible = false;
                if (eligible && maxStay > 0 && totalStayNights > maxStay) eligible = false;

                if (eligible) {
                    candidates.push({
                        name: plan.name || planId,
                        rate: Number(planPrice)
                    });
                }
            });
        }

        if (candidates.length === 0) {
            candidates.push({
                name: 'Standard Rate (Fallback)',
                rate: basePrice
            });
        }

        // Choose Best Available Rate (Lowest qualifying price)
        candidates.sort((a, b) => a.rate - b.rate);
        const chosen = candidates[0];

        nightlyBreakdown.push({
            date: dStr,
            planName: chosen.name,
            rate: chosen.rate
        });
        totalExtensionPrice += chosen.rate;
    }

    // Apply Direct Channel Discount if applicable
    let discountPct = 0;
    let discountAmt = 0;
    if (source === 'direct' && window.currentPropertyConfig?.directDiscount) {
        discountPct = parseFloat(window.currentPropertyConfig.directDiscount) || 0;
        if (discountPct > 0) {
            discountAmt = totalExtensionPrice * (discountPct / 100);
            totalExtensionPrice = totalExtensionPrice - discountAmt;
        }
    }

    const finalPrice = Math.round(totalExtensionPrice);
    const extPriceEl = document.getElementById('ext-price');
    if (extPriceEl) {
        extPriceEl.value = finalPrice;
    }

    let breakdownMsg = nightlyBreakdown.map(n => 
        `• ${n.date}: ฿${n.rate.toLocaleString()} (${n.planName})`
    ).join('\n');

    if (discountAmt > 0) {
        breakdownMsg += `\n• Direct Booking Discount (-${discountPct}%): -฿${Math.round(discountAmt).toLocaleString()}`;
    }
    breakdownMsg += `\n\nTotal Extension Price: ฿${finalPrice.toLocaleString()}`;

    customAlert("Extension Rate Calculated", breakdownMsg);
}

export function confirmExtension() {
    const cO = document.getElementById('check-out')?.value;
    if (!cO) return customAlert("Input Error", "Please set a check-out date first.");
    const aP = document.getElementById('ext-price')?.value;
    if (aP === '') return customAlert("Input Error", "Please enter the Extension Price first.");
    
    const days = parseInt(document.getElementById('ext-days')?.value, 10) || 1;
    const d = new Date(cO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const nCo = d.toISOString().split('T')[0];

    document.getElementById('check-out').value = nCo;
    const totEl = document.getElementById('total-price');
    if (totEl) {
        totEl.value = ((Number(totEl.value) || 0) + Number(aP)).toFixed(2);
    }

    const extBtn = document.getElementById('ext-btn');
    if (extBtn) {
        extBtn.dataset.state = 1;
        extBtn.innerText = 'EXTENDED';
        extBtn.className = 'flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border bg-blue-100 text-blue-700 border-blue-400';
    }

    const todayStr = new Date().toLocaleDateString('en-GB').slice(0, 5);
    const extMsg = `\n[EXTENDED on ${todayStr}] Added ${days} day(s). Added ฿${aP} to total.`;
    const notesEl = document.getElementById('guest-notes');
    if (notesEl) notesEl.value = (notesEl.value + extMsg).trim();

    if (typeof window.updateNightsDisplay === 'function') window.updateNightsDisplay();
    if (typeof window.updateAvailableRooms === 'function') window.updateAvailableRooms();
    calcFinancials();
    calcExtension();
    customAlert("Stay Extended", `Checkout is now ${nCo}.\nAdded ฿${aP} to Total Price.`);
}

// --- 7. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.toggleBadCC = toggleBadCC;
    window.calcFinancials = calcFinancials;
    window.overrideNet = overrideNet;
    window.addPaymentRow = addPaymentRow;
    window.unlockPaymentRow = unlockPaymentRow;
    window.removePaymentRow = removePaymentRow;
    window.openAddChargeModal = openAddChargeModal;
    window.applyChargePreset = applyChargePreset;
    window.confirmAddCharge = confirmAddCharge;
    window.renderExtraCharges = renderExtraCharges;
    window.removeCharge = removeCharge;
    window.calcExtension = calcExtension;
    window.checkExtensionRate = checkExtensionRate;
    window.confirmExtension = confirmExtension;
}
