// ==========================================================================
// pms/pms-folio-modal.js - Modal Lifecycle, Drag, Accordions, Dates & Pax
// Wild & Wandering Property Management System
// ==========================================================================

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

export const startDrag = e => {
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

export const showAlert = (msg, isConfirm = false, onConfirm = null) => {
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
        b.onclick = () => { closeAlert(); if (onConfirm) onConfirm(); };
    } else {
        c.style.display = 'none';
        c.classList.add('hidden');
        b.className = 'btn-modal bg-blue-600 text-white px-10';
        b.innerText = 'Okay';
        b.onclick = closeAlert;
    }
    m.classList.add('active');
    m.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};

export const closeAlert = () => {
    const m = $('alert-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

export const closeGuestModal = () => {
    const m = $('guest-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

export const closeModal = id => {
    if (id === 'guest-modal') {
        closeGuestModal();
        return;
    }
    const el = $(id);
    if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
    }
};

export const openEmailParserModal = () => {
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

export const toggleSection = (sectionId, chevronId, forceState = null) => {
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

export const showAuditHistory = () => {
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
        bBtn.onclick = closeAlert;
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
export const saveGuest = async () => {
    if (typeof origSaveGuest === 'function') {
        try {
            await origSaveGuest();
            closeGuestModal();
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

        closeGuestModal();
        if (window.triggerAutoSync) window.triggerAutoSync(payload.checkIn, payload.checkOut, [payload.bookedType]);
        if (window.render) window.render();
        if (window.renderDashboard) window.renderDashboard();
        if (window.renderDatabase) window.renderDatabase();
    } catch (saveErr) {
        console.error("Direct save guest error:", saveErr);
        showAlert("Error saving booking: " + saveErr.message);
    }
};

// ----------------------------------------------------------------------
// 2. DATES, NIGHTS, ARROWS & PAX CONTROLLER
// ----------------------------------------------------------------------
export const calcNights = () => {
    const cI = $('check-in')?.value, cO = $('check-out')?.value;
    if (!cI || !cO) return 1;
    const parseFn = getParseYMD();
    const ms = parseFn(cO) - parseFn(cI);
    return Math.max(1, Math.round(ms / 86400000));
};

export const updateNightsDisplay = (forcedNights = null) => {
    const n = forcedNights !== null ? forcedNights : calcNights();
    const disp = $('booking-nights-display');
    if (disp) {
        disp.dataset.nights = n;
        disp.innerText = `${n} Nt${n > 1 ? 's' : ''}`;
    }
    return n;
};

export const getStoredNights = () => {
    const disp = $('booking-nights-display');
    const n = parseInt(disp?.dataset?.nights);
    if (!isNaN(n) && n >= 1) return n;
    return calcNights();
};

export const nudgeDate = (type, deltaDays) => {
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

    updateNightsDisplay();
    if (window.updateAvailableRooms) window.updateAvailableRooms();
    if (window.calcExtension) window.calcExtension();
};

export const handleCheckInPicker = newCheckIn => {
    if (!newCheckIn) return;
    const lockedNights = getStoredNights();
    const d = new Date(newCheckIn + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + lockedNights);
    $('check-out').value = d.toISOString().split('T')[0];
    updateNightsDisplay(lockedNights);
    if (window.updateAvailableRooms) window.updateAvailableRooms();
    if (window.calcExtension) window.calcExtension();
};

export const handleCheckOutPicker = newCheckOut => {
    if (!newCheckOut) return;
    const lockedNights = getStoredNights();
    const d = new Date(newCheckOut + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - lockedNights);
    $('check-in').value = d.toISOString().split('T')[0];
    updateNightsDisplay(lockedNights);
    if (window.updateAvailableRooms) window.updateAvailableRooms();
    if (window.calcExtension) window.calcExtension();
};

export const adjustPax = delta => {
    const el = $('pax-count');
    if (!el) return;
    let val = Math.max(1, (parseInt(el.value) || 1) + delta);
    el.value = val;
    if (window.calcFinancials) window.calcFinancials();
    if (window.calcExtension) window.calcExtension();
};

window.startDrag = startDrag;
window.showAlert = showAlert;
window.closeAlert = closeAlert;
window.closeGuestModal = closeGuestModal;
window.closeModal = closeModal;
window.openEmailParserModal = openEmailParserModal;
window.toggleSection = toggleSection;
window.showAuditHistory = showAuditHistory;
window.saveGuest = saveGuest;
window.calcNights = calcNights;
window.updateNightsDisplay = updateNightsDisplay;
window.getStoredNights = getStoredNights;
window.nudgeDate = nudgeDate;
window.handleCheckInPicker = handleCheckInPicker;
window.handleCheckOutPicker = handleCheckOutPicker;
window.adjustPax = adjustPax;
