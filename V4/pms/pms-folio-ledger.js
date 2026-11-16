// ==========================================================================
// pms/pms-folio-ledger.js - Financial Balance, Payments, Add-ons & Extensions
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { isOccupyingBooking } from '../core/occupancy.js';
import { toCanonicalPropId, resolveRoomCategory } from '../core/properties.js';
import { getCmStayQuote } from '../cm/cm-ripple.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --------------------------------------------------------------------------
// 1. FINANCIAL CALCULATIONS, NET OVERRIDE & CREDIT CARD STATUS
// --------------------------------------------------------------------------

export const toggleBadCC = () => {
    const b = $('bad-cc-box');
    if (!b) return;
    if (b.dataset.bad === 'true') {
        b.dataset.bad = 'false';
        b.innerHTML = '';
        b.classList.replace('bg-red-500', 'border-slate-300');
        b.classList.remove('border-red-600');
    } else {
        b.dataset.bad = 'true';
        b.innerHTML = '<span class="text-white text-[10px] font-black leading-none">✕</span>';
        b.classList.replace('border-slate-300', 'bg-red-500');
        b.classList.add('border-red-600');
    }
};

export const calcFinancials = () => {
    const tot = Number($('total-price')?.value) || 0;
    let pd = 0, cD = 0;
    $$('.payment-row').forEach(r => {
        const a = Number(r.querySelector('.pay-amt')?.value) || 0;
        pd += a;
        if (['hw-kp', 'airbnb-kp', 'bdc-kp', 'agoda-kp', 'expedia-kp', 'trip-kp'].includes(r.querySelector('.pay-method')?.value)) {
            cD += a;
        }
    });

    const due = roundCurrency(tot - pd);
    const dC = $('display-due');
    const tC = $('total-price')?.parentElement;
    const pax = parseInt($('pax-count')?.value, 10) || 1;

    if (dC) dC.innerText = `฿${due.toFixed(2)}`;
    const dispPaid = $('display-paid');
    if (dispPaid) dispPaid.innerText = `฿${pd.toFixed(2)}`;

    if (pax > 1) {
        if (dC) {
            dC.title = `Split: ฿${(due / pax).toFixed(2)} each`;
            dC.classList.add('cursor-help', 'border-b-2', 'border-dashed', 'border-red-300');
        }
        if (tC) {
            tC.title = `Split: ฿${(tot / pax).toFixed(2)} each`;
            tC.classList.add('cursor-help', 'border-b-2', 'border-dashed', 'border-slate-300');
        }
    } else {
        if (dC) {
            dC.title = '';
            dC.classList.remove('cursor-help', 'border-b-2', 'border-dashed', 'border-red-300');
        }
        if (tC) {
            tC.title = '';
            tC.classList.remove('cursor-help', 'border-b-2', 'border-dashed', 'border-slate-300');
        }
    }

    const nEl = $('net-price');
    if (nEl && nEl.dataset.override !== 'true') {
        const src = $('booking-source')?.value;
        nEl.value = (cD > 0 ? tot - cD : (src === 'booking.com' || src === 'agoda' ? tot * 0.815 : (src === 'airbnb' ? tot * 0.845 : tot))).toFixed(2);
    }
};

export const overrideNet = () => {
    const nEl = $('net-price');
    if (nEl) nEl.dataset.override = 'true';
};

// --------------------------------------------------------------------------
// 2. PAYMENT TRANSACTION ROW CONTROLLERS
// --------------------------------------------------------------------------

let pCount = 0;

export const addPaymentRow = (d = '', a = '', m = 'cash', loc = false) => {
    const id = `pay-${pCount++}`;
    const div = document.createElement('div');
    div.className = `payment-row flex gap-1 items-center bg-white p-1 rounded border border-slate-200 transition-opacity ${loc ? 'opacity-70' : ''}`;
    div.id = id;

    if (!d) d = getLocalYMD(new Date());

    if (a === '') {
        const currentTot = Number($('total-price')?.value) || 0;
        const currentPaid = Array.from($$('.payment-row')).reduce((s, r) => s + (Number(r.querySelector('.pay-amt')?.value) || 0), 0);
        const due = currentTot - currentPaid;
        if (due > 0) a = roundCurrency(due);
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

    div.innerHTML = `<input type="date" class="pay-date w-24 text-xs !p-1" value="${d}" ${loc ? 'disabled' : ''}><input type="number" class="pay-amt w-16 text-xs !p-1 font-black" value="${a}" placeholder="0" oninput="window.calcFinancials()" ${loc ? 'disabled' : ''}><select class="pay-method flex-1 text-xs !p-1 uppercase" onchange="window.calcFinancials()" ${loc ? 'disabled' : ''}>${paymentOptions.map(x => `<option value="${x}" ${m === x ? 'selected' : ''}>${x.replace(/-/g, ' ').toUpperCase()}</option>`).join('')}</select>${loc ? `<button type="button" onclick="window.unlockPayment('${id}')" class="p-1 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded flex-shrink-0 border border-slate-200 cursor-pointer" title="Edit Payment"><i data-lucide="edit" size="12"></i></button>` : `<button type="button" onclick="window.removePaymentRow('${id}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded flex-shrink-0 border border-red-200 cursor-pointer" title="Delete Payment"><i data-lucide="trash-2" size="12"></i></button>`}`;

    const pList = $('payments-list');
    if (pList) pList.appendChild(div);
    calcFinancials();
    if (window.lucide) window.lucide.createIcons();
};

export const unlockPayment = id => {
    const r = $(id);
    if (!r) return;
    r.classList.remove('opacity-70');
    r.querySelectorAll('input, select').forEach(el => el.disabled = false);
    r.lastElementChild.outerHTML = `<button type="button" onclick="window.removePaymentRow('${id}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded flex-shrink-0 border border-red-200 cursor-pointer" title="Delete Payment"><i data-lucide="trash-2" size="12"></i></button>`;
    if (window.lucide) window.lucide.createIcons();
};

export const removePaymentRow = id => {
    if (window.customAlert) {
        window.customAlert("Delete Payment", "Delete this payment entry?", true, () => {
            const el = $(id);
            if (el) el.remove();
            calcFinancials();
        });
    } else {
        const el = $(id);
        if (el) el.remove();
        calcFinancials();
    }
};

// --------------------------------------------------------------------------
// 3. DYNAMIC FOLIO ADD-ONS & EXTRA CHARGES
// --------------------------------------------------------------------------

export const openChargeModal = () => {
    const dEl = $('charge-desc');
    const aEl = $('charge-amount');
    const dtEl = $('charge-date');
    if (dEl) dEl.value = '';
    if (aEl) aEl.value = '';
    if (dtEl) dtEl.value = $('check-in')?.value || getLocalYMD(new Date());

    const presetsWrap = $('charge-presets-container') || $('charge-modal')?.querySelector('.preset-pill')?.parentElement;
    if (presetsWrap) {
        const propAddons = (window.currentPropertyConfig && Array.isArray(window.currentPropertyConfig.addons) && window.currentPropertyConfig.addons.length > 0)
            ? window.currentPropertyConfig.addons
            : [
                { name: 'Ferry Ticket', price: 400 },
                { name: 'Van Transfer', price: 300 },
                { name: 'Drink Package', price: 350 },
                { name: 'Tour Package', price: 1200 },
                { name: 'Laundry', price: 100 },
                { name: 'Late Checkout', price: 300 },
                { name: 'Scooter Rental', price: 250 }
            ];

        presetsWrap.innerHTML = propAddons.map(a => `
            <span class="preset-pill" onclick="window.applyChargePreset('${a.name}', ${a.price})">${a.name} ฿${a.price}</span>
        `).join('');
    }

    const m = $('charge-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
    setTimeout(() => $('charge-desc')?.focus(), 50);
    if (window.lucide) window.lucide.createIcons();
};

export const applyChargePreset = (desc, amt) => {
    const dEl = $('charge-desc');
    const aEl = $('charge-amount');
    if (dEl) dEl.value = desc;
    if (aEl) {
        aEl.value = amt;
        aEl.focus();
    }
};

export const confirmAddCharge = () => {
    const desc = $('charge-desc')?.value.trim();
    const amt = parseFloat($('charge-amount')?.value);
    const date = $('charge-date')?.value || getLocalYMD(new Date());

    if (!desc) return window.customAlert ? window.customAlert("Missing Info", "Please enter a description for the charge.") : null;
    if (isNaN(amt) || amt <= 0) return window.customAlert ? window.customAlert("Invalid Amount", "Please enter a valid charge amount.") : null;

    const chargeObj = {
        id: 'chg_' + Math.random().toString(36).substr(2, 9),
        desc: desc.toUpperCase(),
        amt: roundCurrency(amt),
        date
    };

    if (!Array.isArray(window.activeExtraCharges)) window.activeExtraCharges = [];
    window.activeExtraCharges.push(chargeObj);

    const curTot = Number($('total-price')?.value) || 0;
    const totEl = $('total-price');
    if (totEl) totEl.value = (curTot + chargeObj.amt).toFixed(2);

    renderExtraCharges();
    calcFinancials();
    if (window.closeModal) window.closeModal('charge-modal');
};

export const removeCharge = chargeId => {
    if (!Array.isArray(window.activeExtraCharges)) return;
    const idx = window.activeExtraCharges.findIndex(c => c.id === chargeId);
    if (idx > -1) {
        const removed = window.activeExtraCharges.splice(idx, 1)[0];
        const curTot = Number($('total-price')?.value) || 0;
        const totEl = $('total-price');
        if (totEl) totEl.value = Math.max(0, curTot - removed.amt).toFixed(2);
        renderExtraCharges();
        calcFinancials();
    }
};

export const renderExtraCharges = () => {
    const wrapper = $('extra-charges-wrapper');
    const list = $('extra-charges-list');
    const totalEl = $('extra-charges-total');
    if (!wrapper || !list) return;

    const charges = window.activeExtraCharges || [];
    if (charges.length === 0) {
        wrapper.classList.add('hidden');
        list.innerHTML = '';
        if (totalEl) totalEl.innerText = '+฿0';
        return;
    }

    wrapper.classList.remove('hidden');
    let sum = 0;
    list.innerHTML = charges.map(c => {
        sum += Number(c.amt);
        return `
            <div class="flex items-center justify-between bg-white px-2 py-1 rounded border border-amber-200 text-xs">
                <div class="flex items-center gap-1.5 truncate">
                    <span class="font-black text-slate-700 uppercase">${c.desc}</span>
                    <span class="text-[9px] font-bold text-slate-400">(${c.date ? c.date.substr(5) : ''})</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="font-black text-amber-700">+฿${Number(c.amt).toFixed(2)}</span>
                    <button type="button" onclick="window.removeCharge('${c.id}')" class="p-0.5 text-red-400 hover:text-red-600 rounded cursor-pointer" title="Delete Charge">
                        <i data-lucide="trash-2" size="12"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) totalEl.innerText = `+฿${sum.toFixed(2)}`;
    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 4. STAY EXTENSIONS & CM PRICE CHECK ENGINES
// --------------------------------------------------------------------------

function resolveExtensionCategories() {
    const hotelRooms = window.hotelRooms || [];
    const allRoomTypes = window.roomTypes || [];
    const assignedRooms = Array.from($$('.assigned-room-select')).map(sel => sel.value.trim()).filter(Boolean);

    if (assignedRooms.length > 0) {
        return assignedRooms.map(rid => {
            const hr = hotelRooms.find(r => r.id === rid || String(r.id).toUpperCase() === rid.toUpperCase());
            const rawCat = hr?.category || hr?.type || $('booked-type')?.value || '';
            return resolveRoomCategory(rawCat, allRoomTypes) || rawCat || allRoomTypes[0] || '';
        }).filter(Boolean);
    }

    const bookedRaw = $('booked-type')?.value || '';
    const cleanBooked = bookedRaw.includes('(') ? bookedRaw.split('(')[0].trim() : bookedRaw.trim();
    const matchedCat = resolveRoomCategory(cleanBooked, allRoomTypes)
        || allRoomTypes.find(rt => cleanBooked && (rt.toLowerCase().includes(cleanBooked.toLowerCase()) || cleanBooked.toLowerCase().includes(rt.toLowerCase())))
        || allRoomTypes[0]
        || '';

    if (!matchedCat) return [];

    const sampleRoom = hotelRooms.find(r => (r.category || r.type) === matchedCat && !r.inactive);
    const isDorm = sampleRoom && !sampleRoom.isPrivate && (sampleRoom.isDorm === true || (sampleRoom.rule && sampleRoom.rule !== 'private') || matchedCat.toLowerCase().includes('dorm'));
    const unitCount = isDorm ? (parseInt($('pax-count')?.value, 10) || 1) : 1;

    return Array(unitCount).fill(matchedCat);
}

/**
 * Auto-checks CM across the extension days for DIR Non-Ref and DEF Event Non-Ref,
 * and applies the lower of the two options.
 */
export const calcExtension = () => {
    const cI = $('check-in')?.value;
    const cO = $('check-out')?.value;
    const days = Math.max(1, parseInt($('ext-days')?.value, 10) || 1);

    const avgEl = $('ext-avg-rate');
    const prEl = $('ext-price');
    const srcLabelEl = $('ext-rate-source-label');
    const srcBtnEl = $('ext-rate-source-btn');

    const unitCategories = cO ? resolveExtensionCategories() : [];
    let dirTotal = 0;
    let dirAllFound = unitCategories.length > 0;
    let evtTotal = 0;
    let evtAllFound = unitCategories.length > 0;

    unitCategories.forEach(cat => {
        const dirQuote = getCmStayQuote({ checkIn: cO, nights: days, roomCategory: cat, planType: 'DIR_NON_REF' });
        if (dirQuote.complete && dirQuote.total !== null) dirTotal += dirQuote.total;
        else dirAllFound = false;

        const evtQuote = getCmStayQuote({ checkIn: cO, nights: days, roomCategory: cat, planType: 'DEF_EVT_NON_REF' });
        if (evtQuote.complete && evtQuote.total !== null) evtTotal += evtQuote.total;
        else evtAllFound = false;
    });

    let chosenTotal = null;
    let sourceTag = 'Fallback Avg';
    let isEventWinner = false;

    if (dirAllFound && evtAllFound) {
        if (evtTotal < dirTotal) {
            chosenTotal = roundCurrency(evtTotal);
            sourceTag = 'CM: DEF Event Non-Ref';
            isEventWinner = true;
        } else {
            chosenTotal = roundCurrency(dirTotal);
            sourceTag = 'CM: DIR Non-Ref';
        }
    } else if (dirAllFound) {
        chosenTotal = roundCurrency(dirTotal);
        sourceTag = 'CM: DIR Non-Ref';
    } else if (evtAllFound) {
        chosenTotal = roundCurrency(evtTotal);
        sourceTag = 'CM: DEF Event Non-Ref';
        isEventWinner = true;
    } else {
        const ms = parseYMD(cO) - parseYMD(cI);
        const stayNights = ms > 0 ? Math.max(1, Math.round(ms / 86400000)) : 1;
        const avgFallback = (Number($('total-price')?.value) || 0) / stayNights;
        chosenTotal = roundCurrency(avgFallback * days);
        sourceTag = 'CM: No Rate (Stay Avg)';
    }

    const avgDaily = roundCurrency(chosenTotal / days);

    if (avgEl) {
        avgEl.value = Math.round(avgDaily);
        avgEl.classList.toggle('text-pink-700', isEventWinner);
        avgEl.classList.toggle('bg-pink-50', isEventWinner);
    }
    if (prEl) {
        prEl.value = Math.round(chosenTotal);
        prEl.placeholder = '';
    }
    if (srcLabelEl) {
        srcLabelEl.innerText = sourceTag;
    }
    if (srcBtnEl) {
        srcBtnEl.className = isEventWinner
            ? 'flex-1 py-1 px-2 bg-pink-100 hover:bg-pink-200 text-pink-800 text-[9.5px] font-black uppercase rounded border border-pink-300 flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer truncate'
            : 'flex-1 py-1 px-2 bg-white hover:bg-slate-50 text-slate-600 text-[9.5px] font-black uppercase rounded border border-slate-300 flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer truncate';
    }
};

export const confirmExtension = async () => {
    const cO = $('check-out')?.value;
    if (!cO) return window.customAlert ? window.customAlert("Missing Date", "Please set a check-out date first.") : null;
    const aP = $('ext-price')?.value;
    if (aP === '') return window.customAlert ? window.customAlert("Missing Price", "Please enter the Extension Price first.") : null;
    const days = parseInt($('ext-days')?.value, 10) || 1;
    const d = new Date(cO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const nCo = d.toISOString().split('T')[0];

    $('check-out').value = nCo;
    const totEl = $('total-price');
    if (totEl) totEl.value = ((Number(totEl.value) || 0) + Number(aP)).toFixed(2);

    const extBtn = $('ext-btn');
    if (extBtn) {
        extBtn.dataset.state = 1;
        extBtn.innerText = 'EXTENDED';
        extBtn.className = 'flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border bg-blue-100 text-blue-700 border-blue-400';
    }

    const rateSource = $('ext-rate-source-label')?.innerText || 'CM';
    const todayStr = new Date().toLocaleDateString('en-GB').slice(0, 5);
    const extMsg = `\n[EXTENDED on ${todayStr}] Added ${days} day(s) (${rateSource}). Added ฿${aP} to total.`;
    const notesEl = $('guest-notes');
    if (notesEl) notesEl.value = (notesEl.value + extMsg).trim();

    if (window.updateNightsDisplay) window.updateNightsDisplay();
    if (window.updateAvailableRooms) window.updateAvailableRooms();
    calcFinancials();
    calcExtension();
    if (window.customAlert) window.customAlert("Extension Applied", `Booking extended by ${days} day(s).\n\nCheckout is now ${nCo}.\nAdded ฿${aP} to Total Price.`);
};

export const openPriceCheckModal = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const ciEl = $('pc-checkin');
    if (ciEl && !ciEl.value) ciEl.value = getLocalYMD(d);
    const m = $('price-check-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
    runPriceCheck();
};

export const runPriceCheck = () => {
    const cI = $('pc-checkin')?.value;
    const n = Math.max(1, parseInt($('pc-nights')?.value, 10) || 1);
    const pax = Math.max(1, parseInt($('pc-pax')?.value, 10) || 1);
    const resultsEl = $('pc-results');
    const datesLabel = $('pc-dates-label');
    if (!cI || !resultsEl) return;

    const inMs = parseYMD(cI);
    const outMs = inMs + (n * 86400000);
    const cO = new Date(outMs).toISOString().split('T')[0];

    if (datesLabel) {
        datesLabel.innerText = `${cI} → ${cO} (${n} Nt${n > 1 ? 's' : ''} • ${pax} PAX)`;
    }

    const curProp = toCanonicalPropId(window.currentPropertyId || '');
    const roomTypes = window.roomTypes || [];
    const hotelRooms = (window.hotelRooms || []).filter(r => !r.inactive);
    const staffList = (window.staff || []).filter(s => toCanonicalPropId(s.property) === curProp && isOccupyingBooking(s.status, true));

    if (roomTypes.length === 0) {
        resultsEl.innerHTML = `<div class="text-center py-4 text-slate-400 font-bold uppercase text-[11px]">No room categories configured.</div>`;
        return;
    }

    resultsEl.innerHTML = roomTypes.map(cat => {
        const quote = getCmStayQuote({ checkIn: cI, nights: n, roomCategory: cat, planType: 'DEF_NON_REF' });
        const catUnits = hotelRooms.filter(r => (r.category || r.type) === cat);
        const isDorm = catUnits.some(r => !r.isPrivate && (r.isDorm === true || (r.rule && r.rule !== 'private') || cat.toLowerCase().includes('dorm')));
        const maxPaxPerUnit = isDorm ? 1 : (parseInt(catUnits[0]?.maxOccupancy || catUnits[0]?.occAdults || 2, 10) || 2);
        const unitsNeeded = Math.max(1, Math.ceil(pax / maxPaxPerUnit));

        // Count minimum available units across the stay nights
        let minAvail = catUnits.length;
        for (let i = 0; i < n; i++) {
            const dMs = inMs + (i * 86400000);
            const occCount = catUnits.filter(u =>
                staffList.some(b => {
                    const bRooms = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
                    return bRooms.some(br => String(br).trim().toUpperCase() === String(u.id).trim().toUpperCase())
                        && dMs >= parseYMD(b.checkIn) && dMs < parseYMD(b.checkOut);
                })
            ).length;
            minAvail = Math.min(minAvail, Math.max(0, catUnits.length - occCount));
        }

        const badges = [];
        if (quote.restrictions.stop) badges.push(`<span class="px-1 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-300 text-[8.5px] font-black uppercase">STOP</span>`);
        if (quote.restrictions.cta) badges.push(`<span class="px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[8.5px] font-black uppercase">CTA</span>`);
        if (quote.restrictions.maxMinStay > n) badges.push(`<span class="px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 border border-indigo-300 text-[8.5px] font-black uppercase">Min ${quote.restrictions.maxMinStay}n</span>`);

        const availBadge = minAvail >= unitsNeeded
            ? `<span class="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded uppercase">${minAvail} avail</span>`
            : `<span class="text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded uppercase">${minAvail} avail (need ${unitsNeeded})</span>`;

        let priceHtml = `<span class="text-slate-400 font-bold text-xs">No CM Rate</span>`;
        if (quote.complete && quote.total !== null) {
            const singleUnitTotal = quote.total;
            const multiUnitTotal = roundCurrency(singleUnitTotal * unitsNeeded);
            priceHtml = `
                <div class="text-right leading-tight">
                    <div class="text-sm font-black text-indigo-700">฿${multiUnitTotal.toLocaleString()}</div>
                    <div class="text-[9.5px] font-bold text-slate-500">
                        ${unitsNeeded > 1 ? `${unitsNeeded}× ฿${singleUnitTotal.toLocaleString()} • ` : ''}฿${quote.avgNightly.toLocaleString()}/nt
                    </div>
                </div>
            `;
        }

        return `
            <div class="p-2 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="font-black text-xs text-slate-800 truncate">${cat}</div>
                    <div class="flex items-center gap-1 flex-wrap mt-0.5">
                        ${availBadge}
                        ${badges.join('')}
                    </div>
                </div>
                <div class="shrink-0">${priceHtml}</div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 5. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

window.toggleBadCC = toggleBadCC;
window.calcFinancials = calcFinancials;
window.overrideNet = overrideNet;
window.addPaymentRow = addPaymentRow;
window.unlockPayment = unlockPayment;
window.removePaymentRow = removePaymentRow;
window.openChargeModal = openChargeModal;
window.applyChargePreset = applyChargePreset;
window.confirmAddCharge = confirmAddCharge;
window.removeCharge = removeCharge;
window.renderExtraCharges = renderExtraCharges;
window.calcExtension = calcExtension;
window.confirmExtension = confirmExtension;
window.openPriceCheckModal = openPriceCheckModal;
window.runPriceCheck = runPriceCheck;
