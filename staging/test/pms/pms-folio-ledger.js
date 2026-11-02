// ==========================================================================
// pms/pms-folio-ledger.js - Financial Balance, Payments, Add-ons & Extensions
// Wild & Wandering Property Management System
// ==========================================================================

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

const getParseYMD = () => window.parseYMD || (str => {
    if (!str || typeof str !== 'string') return 0;
    const p = str.split('-');
    return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
});

const getLocalYMD = () => window.getLocalYMD || (d => {
    if (!d) d = new Date();
    const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
    return o.toISOString().split('T')[0];
});

// ----------------------------------------------------------------------
// 3. FINANCIALS, PAYMENTS & BAD CC CONTROLLER
// ----------------------------------------------------------------------
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
        b.innerHTML = '<span class="text-white text-[10px] font-black">X</span>';
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

    const due = Number((tot - pd).toFixed(2));
    const dC = $('display-due');
    const tC = $('total-price')?.parentElement;
    const pax = parseInt($('pax-count')?.value) || 1;

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

let pCount = 0;
export const addPaymentRow = (d = '', a = '', m = 'cash', loc = false) => {
    const id = `pay-${pCount++}`;
    const div = document.createElement('div');
    div.className = `payment-row flex gap-1 items-center bg-white p-1 rounded border border-slate-200 transition-opacity ${loc ? 'opacity-70' : ''}`;
    div.id = id;

    const getYmdFn = getLocalYMD();
    if (!d) d = getYmdFn(new Date());

    if (a === '') {
        const currentTot = Number($('total-price')?.value) || 0;
        const currentPaid = Array.from($$('.payment-row')).reduce((s, r) => s + (Number(r.querySelector('.pay-amt')?.value) || 0), 0);
        const due = currentTot - currentPaid;
        if (due > 0) a = Number(due.toFixed(2));
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
    if (window.showAlert) {
        window.showAlert("Delete this payment entry?", true, () => {
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

// ----------------------------------------------------------------------
// 4. DYNAMIC FOLIO ADD-ONS CATALOGUE & ITEM CHARGES
// ----------------------------------------------------------------------
export const openChargeModal = () => {
    const dEl = $('charge-desc');
    const aEl = $('charge-amount');
    const dtEl = $('charge-date');
    if (dEl) dEl.value = '';
    if (aEl) aEl.value = '';
    const getYmdFn = getLocalYMD();
    if (dtEl) dtEl.value = $('check-in')?.value || getYmdFn(new Date());

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
    const getYmdFn = getLocalYMD();
    const date = $('charge-date')?.value || getYmdFn(new Date());

    if (!desc) return window.showAlert ? window.showAlert("Please enter a description for the charge.") : null;
    if (isNaN(amt) || amt <= 0) return window.showAlert ? window.showAlert("Please enter a valid charge amount.") : null;

    const chargeObj = {
        id: 'chg_' + Math.random().toString(36).substr(2, 9),
        desc: desc.toUpperCase(),
        amt: Number(amt.toFixed(2)),
        date: date
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

// ----------------------------------------------------------------------
// 5. EXTENSIONS & RATE CHECK CONTROLLER
// ----------------------------------------------------------------------
export const calcExtension = () => {
    const cI = $('check-in')?.value, cO = $('check-out')?.value;
    const parseFn = getParseYMD();
    const ms = parseFn(cO) - parseFn(cI);
    const avg = ms > 0 ? (Number($('total-price')?.value) || 0) / Math.round(ms / 86400000) : 0;
    const days = parseInt($('ext-days')?.value) || 1;
    let xFMP = false;

    const fmpList = window.fmpDates || [];
    if (cO) {
        const sD = parseFn(cO), eD = sD + (days * 86400000);
        for (let f of fmpList) {
            const fT = new Date(f + "T12:00:00").getTime();
            if ((sD <= fT && eD >= fT) || (Math.abs(sD - fT) <= 3 * 86400000) || (Math.abs(eD - fT) <= 3 * 86400000)) {
                xFMP = true;
                break;
            }
        }
    }

    const avgEl = $('ext-avg-rate');
    const prEl = $('ext-price');
    const bdcBtn = $('btn-check-bdc');

    if (xFMP) {
        if (avgEl) {
            avgEl.value = 'FMP!';
            avgEl.classList.add('text-pink-600', 'bg-pink-100');
        }
        if (prEl) {
            prEl.value = '';
            prEl.placeholder = 'CHECK RATE ->';
        }
        if (bdcBtn) {
            bdcBtn.classList.replace('bg-slate-200', 'bg-pink-500');
            bdcBtn.classList.replace('text-slate-700', 'text-white');
            bdcBtn.classList.add('animate-pulse');
        }
    } else {
        if (avgEl) {
            avgEl.value = Math.round(avg);
            avgEl.classList.remove('text-pink-600', 'bg-pink-100');
        }
        if (prEl) {
            prEl.value = Math.round(avg * days);
            prEl.placeholder = '';
        }
        if (bdcBtn) {
            bdcBtn.classList.replace('bg-pink-500', 'bg-slate-200');
            bdcBtn.classList.replace('text-white', 'text-slate-700');
            bdcBtn.classList.remove('animate-pulse');
        }
    }
};

export const checkBdcPrice = () => {
    const cO = $('check-out')?.value;
    if (!cO) return window.showAlert ? window.showAlert("Please set a check-out date first.") : null;
    const d = new Date(cO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + (parseInt($('ext-days')?.value) || 1));
    const roomCount = Array.from($$('.assigned-room-select')).filter(sel => sel.value !== "").length || 1;
    const pax = $('pax-count')?.value || 1;
    const curProp = window.currentPropertyConfig || {};
    const bdcUrl = curProp.bdcUrl || curProp.website || "https://www.booking.com";
    window.open(`${bdcUrl}?checkin=${cO}&checkout=${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}&group_adults=${pax}&group_children=0&no_rooms=${roomCount}`, '_blank');
};

export const confirmExtension = async () => {
    const cO = $('check-out')?.value;
    if (!cO) return window.showAlert ? window.showAlert("Please set a check-out date first.") : null;
    const aP = $('ext-price')?.value;
    if (aP === '') return window.showAlert ? window.showAlert("Please enter the Extension Price first.") : null;
    const days = parseInt($('ext-days')?.value) || 1;
    const d = new Date(cO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const nCo = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    $('check-out').value = nCo;
    const totEl = $('total-price');
    if (totEl) totEl.value = ((Number(totEl.value) || 0) + Number(aP)).toFixed(2);

    const extBtn = $('ext-btn');
    if (extBtn) {
        extBtn.dataset.state = 1;
        extBtn.innerText = 'EXTENDED';
        extBtn.className = 'flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border bg-blue-100 text-blue-700 border-blue-400';
    }

    const todayStr = new Date().toLocaleDateString('en-GB').slice(0, 5);
    const extMsg = `\n[EXTENDED on ${todayStr}] Added ${days} day(s). Added ฿${aP} to total.`;
    const notesEl = $('guest-notes');
    if (notesEl) notesEl.value = (notesEl.value + extMsg).trim();

    if (window.updateNightsDisplay) window.updateNightsDisplay();
    if (window.updateAvailableRooms) window.updateAvailableRooms();
    calcFinancials();
    calcExtension();
    if (window.showAlert) window.showAlert(`Booking extended by ${days} day(s).\n\nCheckout is now ${nCo}.\nAdded ฿${aP} to Total Price.`);
};

export const openPriceCheckModal = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const getYmdFn = getLocalYMD();
    const ciEl = $('pc-checkin');
    if (ciEl) ciEl.value = getYmdFn(d);
    const m = $('price-check-modal');
    if (m) m.style.display = 'flex';
};

export const runPriceCheck = () => {
    const cI = $('pc-checkin')?.value;
    const n = parseInt($('pc-nights')?.value) || 1;
    const p = parseInt($('pc-pax')?.value) || 1;
    if (!cI) return;
    const d = new Date(cI + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    const cO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const curProp = window.currentPropertyConfig || {};
    const bdcUrl = curProp.bdcUrl || curProp.website || "https://www.booking.com";
    window.open(`${bdcUrl}?checkin=${cI}&checkout=${cO}&group_adults=${p}&group_children=0&no_rooms=1`, '_blank');
    if (window.closeModal) window.closeModal('price-check-modal');
};

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
window.checkBdcPrice = checkBdcPrice;
window.confirmExtension = confirmExtension;
window.openPriceCheckModal = openPriceCheckModal;
window.runPriceCheck = runPriceCheck;
