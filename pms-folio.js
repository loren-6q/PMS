// ==========================================================================
// PMS FOLIO, FINANCIALS & MODAL CONTROLLER (pms-folio.js)
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    const $ = id => document.getElementById(id);
    const $$ = s => document.querySelectorAll(s);

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
    // 1. MODAL DRAG & DIALOG CONTROLLERS
    // ----------------------------------------------------------------------
    let isDragging = false, dragOffsetX, dragOffsetY;

    window.startDrag = e => {
        if (e.target.closest('button, input, select, i, textarea, .multi-state-btn')) return;
        isDragging = true;
        const m = $('guest-modal-content'), r = m.getBoundingClientRect();
        if (m.style.position !== 'fixed') {
            m.style.position = 'fixed';
            m.style.margin = '0';
            m.style.left = r.left + 'px';
            m.style.top = r.top + 'px';
        }
        dragOffsetX = e.clientX - r.left;
        dragOffsetY = e.clientY - r.top;
    };

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const m = $('guest-modal-content');
        if (!m) return;
        let nL = e.clientX - dragOffsetX, nT = e.clientY - dragOffsetY;
        if (nT < 0) nT = 0;
        if (nT > window.innerHeight - 50) nT = window.innerHeight - 50;
        m.style.left = nL + 'px';
        m.style.top = nT + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) isDragging = false;
    });

    window.showAlert = (msg, isConfirm = false, onConfirm = null) => {
        const m = $('alert-modal'), c = $('alert-cancel'), b = $('alert-confirm');
        if (!m) return;
        const headerTitle = $('alert-header-title');
        if (headerTitle) headerTitle.innerText = "Attention";
        const msgEl = $('alert-message');
        if (msgEl) msgEl.innerText = msg;

        if (isConfirm) {
            c.style.display = 'block';
            c.classList.remove('hidden');
            b.className = 'btn-modal bg-blue-600 text-white px-10';
            b.innerText = 'Confirm';
            b.onclick = () => { window.closeAlert(); if (onConfirm) onConfirm(); };
        } else {
            c.style.display = 'none';
            c.classList.add('hidden');
            b.className = 'btn-modal bg-blue-600 text-white px-10';
            b.innerText = 'Okay';
            b.onclick = window.closeAlert;
        }
        m.classList.add('active');
        m.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    };

    window.closeAlert = () => {
        const m = $('alert-modal');
        if (m) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    };

    window.closeModal = id => {
        const el = $(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    };

    window.showAuditHistory = () => {
        const id = $('guest-id')?.value;
        const staffList = window.staff || [];
        const s = staffList.find(x => x.id === id);
        if (!s) return;
        const logs = s.auditLog || [];
        let html = logs.length === 0 
            ? '<p class="text-slate-400 italic">No history recorded yet.</p>' 
            : logs.slice().reverse().map(l => `<div class="text-left text-xs border-b border-slate-200 pb-2 mb-2"><div class="font-black text-slate-800">${new Date(l.ts).toLocaleString('en-GB')} by ${l.user}</div><div class="text-slate-600">${l.msg}</div></div>`).join('');
        
        const titleEl = $('alert-header-title');
        if (titleEl) titleEl.innerText = `Audit History: ${s.lastName}`;
        const msgEl = $('alert-message');
        if (msgEl) msgEl.innerHTML = `<div class="max-h-[300px] overflow-y-auto no-scrollbar">${html}</div>`;
        const cBtn = $('alert-cancel');
        if (cBtn) cBtn.style.display = 'none';
        const bBtn = $('alert-confirm');
        if (bBtn) {
            bBtn.innerText = 'Close';
            bBtn.className = 'btn-modal bg-slate-800 hover:bg-slate-700 text-white px-10';
            bBtn.onclick = window.closeAlert;
        }
        const m = $('alert-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    // ----------------------------------------------------------------------
    // 2. DATES, NIGHTS, ARROWS & PAX CONTROLLER
    // ----------------------------------------------------------------------
    window.calcNights = () => {
        const cI = $('check-in')?.value, cO = $('check-out')?.value;
        if (!cI || !cO) return 1;
        const parseFn = getParseYMD();
        const ms = parseFn(cO) - parseFn(cI);
        return Math.max(1, Math.round(ms / 86400000));
    };

    window.updateNightsDisplay = (forcedNights = null) => {
        const n = forcedNights !== null ? forcedNights : window.calcNights();
        const disp = $('booking-nights-display');
        if (disp) {
            disp.dataset.nights = n;
            disp.innerText = `${n} Nt${n > 1 ? 's' : ''}`;
        }
        return n;
    };

    window.getStoredNights = () => {
        const disp = $('booking-nights-display');
        const n = parseInt(disp?.dataset?.nights);
        if (!isNaN(n) && n >= 1) return n;
        return window.calcNights();
    };

    window.nudgeDate = (type, deltaDays) => {
        const inEl = $('check-in'), outEl = $('check-out');
        if (!inEl?.value || !outEl?.value) return;

        if (type === 'in') {
            const dIn = new Date(inEl.value + "T12:00:00Z");
            dIn.setUTCDate(dIn.getUTCDate() + deltaDays);
            const newInStr = dIn.toISOString().split('T')[0];
            if (newInStr >= outEl.value) return;
            inEl.value = newInStr;
        } else if (type === 'out') {
            const dOut = new Date(outEl.value + "T12:00:00Z");
            dOut.setUTCDate(dOut.getUTCDate() + deltaDays);
            const newOutStr = dOut.toISOString().split('T')[0];
            if (newOutStr <= inEl.value) return;
            outEl.value = newOutStr;
        }

        window.updateNightsDisplay();
        if (window.updateAvailableRooms) window.updateAvailableRooms();
        if (window.calcExtension) window.calcExtension();
    };

    window.handleCheckInPicker = newCheckIn => {
        if (!newCheckIn) return;
        const lockedNights = window.getStoredNights();
        const d = new Date(newCheckIn + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + lockedNights);
        $('check-out').value = d.toISOString().split('T')[0];
        window.updateNightsDisplay(lockedNights);
        if (window.updateAvailableRooms) window.updateAvailableRooms();
        if (window.calcExtension) window.calcExtension();
    };

    window.handleCheckOutPicker = newCheckOut => {
        if (!newCheckOut) return;
        const lockedNights = window.getStoredNights();
        const d = new Date(newCheckOut + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - lockedNights);
        $('check-in').value = d.toISOString().split('T')[0];
        window.updateNightsDisplay(lockedNights);
        if (window.updateAvailableRooms) window.updateAvailableRooms();
        if (window.calcExtension) window.calcExtension();
    };

    window.adjustPax = delta => {
        const el = $('pax-count');
        if (!el) return;
        let val = Math.max(1, (parseInt(el.value) || 1) + delta);
        el.value = val;
        window.calcFinancials();
        if (window.calcExtension) window.calcExtension();
    };

    // ----------------------------------------------------------------------
    // 3. FINANCIALS, PAYMENTS & BAD CC CONTROLLER
    // ----------------------------------------------------------------------
    window.toggleBadCC = () => {
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

    window.calcFinancials = () => {
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

    window.overrideNet = () => {
        const nEl = $('net-price');
        if (nEl) nEl.dataset.override = 'true';
    };

    let pCount = 0;
    window.addPaymentRow = (d = '', a = '', m = 'cash', loc = false) => {
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
        window.calcFinancials();
        if (window.lucide) window.lucide.createIcons();
    };

    window.unlockPayment = id => {
        const r = $(id);
        if (!r) return;
        r.classList.remove('opacity-70');
        r.querySelectorAll('input, select').forEach(el => el.disabled = false);
        r.lastElementChild.outerHTML = `<button type="button" onclick="window.removePaymentRow('${id}')" class="p-1 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded flex-shrink-0 border border-red-200 cursor-pointer" title="Delete Payment"><i data-lucide="trash-2" size="12"></i></button>`;
        if (window.lucide) window.lucide.createIcons();
    };

    window.removePaymentRow = id => {
        window.showAlert("Delete this payment entry?", true, () => {
            const el = $(id);
            if (el) el.remove();
            window.calcFinancials();
        });
    };

    // ----------------------------------------------------------------------
    // 4. ITEMIZED EXTRA CHARGES CONTROLLER
    // ----------------------------------------------------------------------
    window.openChargeModal = () => {
        const dEl = $('charge-desc');
        const aEl = $('charge-amount');
        const dtEl = $('charge-date');
        if (dEl) dEl.value = '';
        if (aEl) aEl.value = '';
        const getYmdFn = getLocalYMD();
        if (dtEl) dtEl.value = $('check-in')?.value || getYmdFn(new Date());

        const m = $('charge-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
        setTimeout(() => $('charge-desc')?.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
    };

    window.applyChargePreset = (desc, amt) => {
        const dEl = $('charge-desc');
        const aEl = $('charge-amount');
        if (dEl) dEl.value = desc;
        if (aEl) {
            aEl.value = amt;
            aEl.focus();
        }
    };

    window.confirmAddCharge = () => {
        const desc = $('charge-desc')?.value.trim();
        const amt = parseFloat($('charge-amount')?.value);
        const getYmdFn = getLocalYMD();
        const date = $('charge-date')?.value || getYmdFn(new Date());

        if (!desc) return window.showAlert("Please enter a description for the charge.");
        if (isNaN(amt) || amt <= 0) return window.showAlert("Please enter a valid charge amount.");

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

        window.renderExtraCharges();
        window.calcFinancials();
        window.closeModal('charge-modal');
    };

    window.removeCharge = chargeId => {
        if (!Array.isArray(window.activeExtraCharges)) return;
        const idx = window.activeExtraCharges.findIndex(c => c.id === chargeId);
        if (idx > -1) {
            const removed = window.activeExtraCharges.splice(idx, 1)[0];
            const curTot = Number($('total-price')?.value) || 0;
            const totEl = $('total-price');
            if (totEl) totEl.value = Math.max(0, curTot - removed.amt).toFixed(2);
            window.renderExtraCharges();
            window.calcFinancials();
        }
    };

    window.renderExtraCharges = () => {
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
    window.calcExtension = () => {
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

    window.checkBdcPrice = () => {
        const cO = $('check-out')?.value;
        if (!cO) return window.showAlert("Please set a check-out date first.");
        const d = new Date(cO + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + (parseInt($('ext-days')?.value) || 1));
        const roomCount = Array.from($$('.assigned-room-select')).filter(sel => sel.value !== "").length || 1;
        const pax = $('pax-count')?.value || 1;
        window.open(`https://www.booking.com/hotel/th/swims-a-social-beach-resort.html?checkin=${cO}&checkout=${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}&group_adults=${pax}&group_children=0&no_rooms=${roomCount}`, '_blank');
    };

    window.confirmExtension = async () => {
        const cO = $('check-out')?.value;
        if (!cO) return window.showAlert("Please set a check-out date first.");
        const aP = $('ext-price')?.value;
        if (aP === '') return window.showAlert("Please enter the Extension Price first.");
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

        window.updateNightsDisplay();
        if (window.updateAvailableRooms) window.updateAvailableRooms();
        window.calcFinancials();
        window.calcExtension();
        window.showAlert(`Booking extended by ${days} day(s).\n\nCheckout is now ${nCo}.\nAdded ฿${aP} to Total Price.`);
    };

    window.openPriceCheckModal = () => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        const getYmdFn = getLocalYMD();
        const ciEl = $('pc-checkin');
        if (ciEl) ciEl.value = getYmdFn(d);
        const m = $('price-check-modal');
        if (m) m.style.display = 'flex';
    };

    window.runPriceCheck = () => {
        const cI = $('pc-checkin')?.value;
        const n = parseInt($('pc-nights')?.value) || 1;
        const p = parseInt($('pc-pax')?.value) || 1;
        if (!cI) return;
        const d = new Date(cI + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + n);
        const cO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        window.open(`https://www.booking.com/hotel/th/swims-a-social-beach-resort.html?checkin=${cI}&checkout=${cO}&group_adults=${p}&group_children=0&no_rooms=1`, '_blank');
        window.closeModal('price-check-modal');
    };
})();
