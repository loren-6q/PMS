// ==========================================================================
// PMS FOLIO, FINANCIALS & MODAL CONTROLLER (pms-folio.js)
// Wild & Wandering Property Management System
// Hosted at: https://loren-6q.github.io/PMS/pms-folio.js
// ==========================================================================

(function() {
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

    window.closeGuestModal = () => {
        const m = $('guest-modal');
        if (m) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    };

    window.closeModal = id => {
        if (id === 'guest-modal') {
            window.closeGuestModal();
            return;
        }
        const el = $(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    };

    window.openEmailParserModal = () => {
        const txt = $('email-textarea');
        if (txt) txt.value = '';
        const m = $('email-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
        setTimeout(() => $('email-textarea')?.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
    };

    window.toggleSection = (sectionId, chevronId, forceState = null) => {
        const sec = $(sectionId), icon = $(chevronId);
        if (!sec) return;
        const shouldShow = forceState !== null ? forceState : (sec.style.display === 'none' || sec.classList.contains('hidden'));
        if (shouldShow) {
            sec.style.display = 'block';
            sec.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            sec.style.display = 'none';
            sec.classList.add('hidden');
            if (icon) icon.style.transform = 'rotate(-90deg)';
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
    // 1B. BULLETPROOF GUEST SAVE HANDLER & FALLBACK
    // ----------------------------------------------------------------------
    const origSaveGuest = window.saveGuest;
    window.saveGuest = async () => {
        if (typeof origSaveGuest === 'function') {
            try {
                await origSaveGuest();
                window.closeGuestModal();
                return;
            } catch (err) {
                console.warn("pms-booking saveGuest failed, using direct save:", err);
            }
        }

        try {
            const id = $('guest-id')?.value || ('bk_' + Date.now());
            const curProp = window.getCurrentPropertyId ? window.getCurrentPropertyId() : (window.currentPropertyId || 'swims_resort');
            const rList = Array.from($$('.assigned-room-select') || []).map(s => s.value).filter(Boolean);

            const payments = [];
            $$('.payment-row').forEach(r => {
                payments.push({
                    date: r.querySelector('.pay-date')?.value || '',
                    amt: Number(r.querySelector('.pay-amt')?.value) || 0,
                    method: r.querySelector('.pay-method')?.value || 'cash'
                });
            });

            const payload = {
                firstName: ($('first-name')?.value || '').trim(),
                lastName: ($('last-name')?.value || '').trim() || 'Guest',
                phone: ($('phone')?.value || '').trim(),
                email: ($('email')?.value || '').trim(),
                country: ($('guest-country')?.value || '').trim(),
                checkIn: $('check-in')?.value || '',
                checkOut: $('check-out')?.value || '',
                pax: parseInt($('pax-count')?.value, 10) || 1,
                bookedType: $('booked-type')?.value || '',
                room: rList[0] || '',
                rooms: rList,
                totalPrice: parseFloat($('total-price')?.value) || 0,
                netPrice: parseFloat($('net-price')?.value) || 0,
                notes: $('guest-notes')?.value || '',
                source: $('booking-source')?.value || 'direct',
                bookingDate: $('booking-date')?.value || '',
                bookId: $('booking-id')?.value || '',
                linkCode: $('link-code')?.value || '',
                status: $('guest-status-hidden')?.value || 'new',
                badCC: $('bad-cc-box')?.dataset.bad === 'true',
                property: curProp,
                payments: payments,
                extraCharges: window.activeExtraCharges || [],
                updatedAt: new Date().toISOString()
            };

            const { doc, setDoc } = window.fs;
            await setDoc(doc(window.db, 'artifacts', window.appId, 'public', 'data', 'staff', id), payload, { merge: true });

            window.closeGuestModal();
            if (window.triggerAutoSync) window.triggerAutoSync(payload.checkIn, payload.checkOut, [payload.bookedType]);
            if (window.render) window.render();
            if (window.renderDashboard) window.renderDashboard();
            if (window.renderDatabase) window.renderDatabase();
        } catch (saveErr) {
            console.error("Direct save guest error:", saveErr);
            window.showAlert("Error saving booking: " + saveErr.message);
        }
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
    // 4. DYNAMIC FOLIO ADD-ONS CATALOGUE & ITEM CHARGES
    // ----------------------------------------------------------------------
    window.openChargeModal = () => {
        const dEl = $('charge-desc');
        const aEl = $('charge-amount');
        const dtEl = $('charge-date');
        if (dEl) dEl.value = '';
        if (aEl) aEl.value = '';
        const getYmdFn = getLocalYMD();
        if (dtEl) dtEl.value = $('check-in')?.value || getYmdFn(new Date());

        // DYNAMIC PRESETS: Pull from active property configuration
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
        const curProp = window.currentPropertyConfig || {};
        const bdcUrl = curProp.bdcUrl || curProp.website || "https://www.booking.com";
        window.open(`${bdcUrl}?checkin=${cO}&checkout=${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}&group_adults=${pax}&group_children=0&no_rooms=${roomCount}`, '_blank');
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
        const curProp = window.currentPropertyConfig || {};
        const bdcUrl = curProp.bdcUrl || curProp.website || "https://www.booking.com";
        window.open(`${bdcUrl}?checkin=${cI}&checkout=${cO}&group_adults=${p}&group_children=0&no_rooms=1`, '_blank');
        window.closeModal('price-check-modal');
    };

    // ----------------------------------------------------------------------
    // 6. GUEST FOLIO INVOICE & RECEIPT GENERATOR (DYNAMIC PROPERTY BRANDING)
    // ----------------------------------------------------------------------
    window.generateGuestInvoice = () => {
        const guestId = $('guest-id')?.value;
        const staffList = window.staff || [];
        let booking = staffList.find(s => s.id === guestId);

        if (!booking) {
            const total = parseFloat($('total-price')?.value) || 0;
            const rList = Array.from($$('.assigned-room-select') || []).map(s => s.value).filter(Boolean);
            const getYmdFn = getLocalYMD();
            booking = {
                id: guestId || 'DRAFT',
                bookId: $('booking-id')?.value || guestId || 'DIRECT',
                firstName: $('first-name')?.value || 'Guest',
                lastName: $('last-name')?.value || '',
                phone: $('phone')?.value || '',
                email: $('email')?.value || '',
                country: $('guest-country')?.value || '',
                checkIn: $('check-in')?.value || getYmdFn(new Date()),
                checkOut: $('check-out')?.value || getYmdFn(new Date()),
                bookedType: $('booked-type')?.value || 'Standard Room',
                room: rList[0] || 'Unassigned',
                rooms: rList,
                totalPrice: total,
                payments: window.activePayments || [],
                extraCharges: window.activeExtraCharges || [],
                source: $('booking-source')?.value || 'Direct',
                pax: parseInt($('pax-count')?.value, 10) || 1
            };
        }

        const curProp = window.currentPropertyConfig || {};
        const curPropId = window.getCurrentPropertyId ? window.getCurrentPropertyId() : (window.currentPropertyId || 'property');
        const propertyName = curProp.name || curProp.title || curPropId.toUpperCase();
        const propertySubtitle = curProp.subtitle || curProp.tagline || "";
        const propertyAddress = curProp.address || "";
        const currencySym = curProp.currencySymbol || (curProp.currency === 'USD' ? '$' : (curProp.currency === 'EUR' ? '€' : (curProp.currency === 'GBP' ? '£' : '฿')));

        // ACTIVE BRAND LOGO: Icon/Logo uploaded in Step 1, falling back to W&W logo
        const activeLogoUrl = curProp.iconUrl || curProp.logoUrl || DEFAULT_WW_ICON;

        const contactParts = [];
        if (curProp.email) contactParts.push(curProp.email);
        if (curProp.phone) contactParts.push(curProp.phone);
        if (curProp.website) contactParts.push(curProp.website);
        const propertyContact = contactParts.join(' • ');

        const parseFn = getParseYMD();
        const inMs = parseFn(booking.checkIn);
        const outMs = parseFn(booking.checkOut);
        const nights = Math.max(1, Math.round((outMs - inMs) / 86400000)) || 1;

        const hotelRooms = window.hotelRooms || [];
        const rList = (booking.rooms && booking.rooms.length > 0) ? booking.rooms : [booking.room].filter(Boolean);
        const roomListStr = rList.length > 0 ? rList.join(', ') : (booking.room || 'Room / Bed Assigned');

        const resolvedTypes = [];
        rList.forEach(rid => {
            const hr = hotelRooms.find(r => r.id === rid || (window.uiToDbRoom && r.id === window.uiToDbRoom(rid)) || (window.dbToUiRoom && r.id === window.dbToUiRoom(rid)));
            const cat = hr ? (hr.type || hr.category) : null;
            if (cat && !resolvedTypes.includes(cat)) resolvedTypes.push(cat);
        });

        let cleanCategory = resolvedTypes.join(', ');
        if (!cleanCategory) {
            cleanCategory = booking.bookedType || 'Standard Room';
            if (cleanCategory.includes('(')) cleanCategory = cleanCategory.split('(')[0].trim();
        }

        const rawPayments = Array.isArray(booking.payments) ? booking.payments : [];
        const extraCharges = Array.isArray(booking.extraCharges) ? booking.extraCharges : [];
        const totalExtra = extraCharges.reduce((sum, c) => sum + (parseFloat(c.amt || c.amount) || 0), 0);
        const accommodationTotal = Math.max(0, (parseFloat(booking.totalPrice) || 0) - totalExtra);
        const grandTotal = parseFloat(booking.totalPrice) || 0;
        const totalPaid = rawPayments.reduce((sum, p) => sum + (parseFloat(p.amt) || 0), 0);
        const balanceDue = Number((grandTotal - totalPaid).toFixed(2));

        const invoiceNumber = `INV-${(booking.bookId || booking.id || '0000').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
        const getYmdFn = getLocalYMD();
        const issueDate = getYmdFn(new Date());

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

        const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice - ${booking.firstName} ${booking.lastName} (${invoiceNumber})</title>
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
                <p>${booking.firstName || ''} ${booking.lastName || ''}</p>
                ${booking.country ? `<span>Country: ${booking.country}</span>` : ''}
                ${booking.email ? `<span>Email: ${booking.email}</span>` : ''}
                ${booking.phone ? `<span>Phone: ${booking.phone}</span>` : ''}
            </div>
            <div class="meta-block">
                <h4>Stay & Booking Details</h4>
                <p>Dates: ${booking.checkIn} &rarr; ${booking.checkOut} (${nights} Night${nights > 1 ? 's' : ''})</p>
                <span>Unit(s): ${roomListStr}</span>
                <span>Category: ${cleanCategory}</span>
                <span>Ref: ${booking.bookId || booking.id || 'Direct'} (${(booking.source || 'Direct').toUpperCase()})</span>
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

        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(printHtml);
            printWin.document.close();
        } else {
            window.showAlert("Pop-up blocked. Please allow pop-ups for this website to print/export invoices.");
        }
    };
})();
