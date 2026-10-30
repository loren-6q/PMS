// ==========================================================================
// pms/pms-folio-modal.js - Reservation Modal Lifecycle, Form Populator & Pills
// Wild & Wandering Property Management System
// ==========================================================================

import { STATUS_CYCLE } from '../core/occupancy.js';
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { 
    activeExtraCharges, 
    setActiveExtraCharges, 
    addPaymentRow, 
    renderExtraCharges, 
    calcFinancials 
} from './pms-folio-ledger.js';

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

export function initModalDrag() {
    const modalContent = document.getElementById('guest-modal-content');
    const headerBtn = document.getElementById('modal-header-btn');
    if (!modalContent || !headerBtn) return;

    headerBtn.onmousedown = (e) => {
        if (e.target.closest('button, input, select, textarea, i')) return;
        isDragging = true;
        const rect = modalContent.getBoundingClientRect();
        if (modalContent.style.position !== 'fixed') {
            modalContent.style.position = 'fixed';
            modalContent.style.margin = '0';
            modalContent.style.left = rect.left + 'px';
            modalContent.style.top = rect.top + 'px';
        }
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
    };

    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !modalContent) return;
        let nextLeft = e.clientX - dragOffsetX;
        let nextTop = e.clientY - dragOffsetY;
        if (nextTop < 0) nextTop = 0;
        if (nextTop > window.innerHeight - 50) nextTop = window.innerHeight - 50;
        modalContent.style.left = nextLeft + 'px';
        modalContent.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

export function openGuestModal(booking = null) {
    const modal = document.getElementById('guest-modal');
    if (!modal) return;
    
    populateFolioForm(booking || {});
    modal.classList.add('active');
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
}

export function closeGuestModal() {
    const modal = document.getElementById('guest-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

export function updateHeaderName() {
    const fn = document.getElementById('first-name')?.value.trim().toUpperCase() || '';
    const ln = document.getElementById('last-name')?.value.trim().toUpperCase() || '';
    const disp = document.getElementById('modal-guest-name-display');
    if (disp) disp.innerText = `${fn} ${ln}`.trim() || "NEW BOOKING";
}

export function cycleStatus() {
    const sBtn = document.getElementById('status-cycle-btn');
    if (!sBtn) return;
    const currentVal = sBtn.dataset.value || 'future';
    let idx = STATUS_CYCLE.findIndex(x => x.val === currentVal);
    idx = (idx + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[idx];

    sBtn.dataset.value = nextStatus.val;
    sBtn.innerText = nextStatus.label;
    sBtn.style.background = nextStatus.bg;
    sBtn.style.color = nextStatus.txt;

    const hiddenInput = document.getElementById('guest-status-hidden');
    if (hiddenInput) hiddenInput.value = nextStatus.val;
}

export function setMultiState(id, state, labels, classes) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.state = state;
    el.innerText = labels[state];
    el.className = id.includes('email')
        ? `flex-1 min-w-[80px] unselectable multi-state-btn px-0.5 py-1 rounded text-[9px] font-black uppercase border text-center whitespace-nowrap ${classes[state]}`
        : `flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border ${classes[state]}`;
}

export function cycleMultiState(el, labels, classes) {
    if (!el) return;
    let cur = parseInt(el.dataset.state || 0, 10);
    cur = (cur + 1) % labels.length;
    setMultiState(el.id, cur, labels, classes);
}

export function calcNights() {
    const cI = document.getElementById('check-in')?.value;
    const cO = document.getElementById('check-out')?.value;
    if (!cI || !cO) return 1;
    const ms = parseYMD(cO) - parseYMD(cI);
    return Math.max(1, Math.round(ms / 86400000));
}

export function updateNightsDisplay() {
    const n = calcNights();
    const disp = document.getElementById('booking-nights-display');
    if (disp) {
        disp.dataset.nights = n;
        disp.innerText = `${n} Nt${n > 1 ? 's' : ''}`;
    }
}

export function nudgeDate(type, deltaDays) {
    const inEl = document.getElementById('check-in');
    const outEl = document.getElementById('check-out');
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
    updateAvailableRooms();
}

export function updateAvailableRooms() {
    const cI = document.getElementById('check-in')?.value;
    const cO = document.getElementById('check-out')?.value;
    const bookingId = document.getElementById('guest-id')?.value;
    if (!cI || !cO) return;

    const sU = parseYMD(cI);
    const eU = parseYMD(cO);
    const occupied = new Set();
    const curProp = window.currentPropertyId || 'swims_resort';

    (window.staff || []).forEach(s => {
        if (s.id === bookingId) return;
        const sProp = (s.property || 'swims_resort').toLowerCase();
        if (sProp !== curProp.toLowerCase()) return;
        if (['cancelled', 'noshow', 'unconfirmed', 'charged', 'vol'].includes(s.status)) return;

        if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
            const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
            rList.forEach(r => { if (r) occupied.add(r); });
        }
    });

    document.querySelectorAll('.assigned-room-select').forEach(sel => {
        const currentVal = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return;
            if (occupied.has(opt.value)) {
                opt.disabled = true;
                if (!opt.text.includes('(OCCUPIED)')) opt.text += ' (OCCUPIED)';
            } else {
                opt.disabled = false;
                opt.text = opt.text.replace(' (OCCUPIED)', '');
            }
        });
        sel.value = currentVal;
    });
}

export function addRoomSelect(initialVal = "") {
    const container = document.getElementById('assigned-rooms-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = "flex items-stretch gap-1 w-full";

    const sel = document.createElement('select');
    sel.className = "assigned-room-select flex-1 min-w-0 bg-white border border-blue-300 text-xs font-bold uppercase text-blue-800 rounded px-1 py-1 outline-none shadow-xs cursor-pointer";
    sel.innerHTML = `<option value="">-- UNASSIGNED --</option>`;
    sel.onchange = updateAvailableRooms;

    let currentGroup = '', optGroup = null;
    (window.hotelRooms || []).filter(r => !r.inactive).forEach(r => {
        const cat = r.category || r.type || 'Standard';
        if (cat !== currentGroup) {
            optGroup = document.createElement('optgroup');
            optGroup.label = `--- ${cat.toUpperCase()} ---`;
            sel.appendChild(optGroup);
            currentGroup = cat;
        }
        const opt = document.createElement('option');
        opt.value = r.id;
        const bunkArrow = (r.bunk === 'top' || r.bed === 'top') ? ' ↑' : ((r.bunk === 'bottom' || r.bed === 'bottom') ? ' ↓' : '');
        opt.innerText = `${r.id}${bunkArrow}`;
        if (optGroup) optGroup.appendChild(opt);
    });

    if (initialVal) {
        const exists = Array.from(sel.options).some(o => o.value === initialVal);
        if (!exists) {
            const preserved = document.createElement('option');
            preserved.value = initialVal;
            preserved.innerText = `${initialVal} (Preserved)`;
            sel.appendChild(preserved);
        }
    }

    sel.value = initialVal || "";

    const delBtn = document.createElement('button');
    delBtn.type = "button";
    delBtn.className = "w-6 flex justify-center items-center text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer";
    delBtn.innerHTML = `&times;`;
    delBtn.onclick = () => {
        wrap.remove();
        if (container.children.length === 0) addRoomSelect("");
        updateAvailableRooms();
    };

    wrap.appendChild(sel);
    wrap.appendChild(delBtn);
    container.appendChild(wrap);
    updateAvailableRooms();
}

export function populateFolioForm(b = {}) {
    const isNew = !b.id;
    const form = document.getElementById('guest-form');
    if (form) form.reset();

    const modalContent = document.getElementById('guest-modal-content');
    if (modalContent) {
        modalContent.style.position = 'relative';
        modalContent.style.left = 'auto';
        modalContent.style.top = 'auto';
        modalContent.style.margin = '0';
    }

    const bcc = document.getElementById('bad-cc-box');
    if (bcc) {
        bcc.dataset.bad = b.badCC ? 'true' : 'false';
        bcc.innerHTML = b.badCC ? '<span class="text-white text-[10px] font-black">X</span>' : '';
        bcc.className = `w-3.5 h-3.5 border-2 rounded mt-0.5 flex items-center justify-center cursor-pointer ${
            b.badCC ? 'bg-red-500 border-red-600' : 'border-slate-300'
        }`;
    }

    const fields = [
        ['guest-id', b.id], ['first-name', b.firstName], ['last-name', b.lastName],
        ['phone', b.phone], ['email', b.email], ['booked-type', b.bookedType],
        ['check-in', b.checkIn], ['check-out', b.checkOut], ['booking-date', b.bookDate],
        ['booking-id', b.bookId], ['link-code', b.linkedId], ['guest-country', b.country],
        ['pax-count', b.pax || 1], ['booking-source', b.source || 'direct'],
        ['guest-notes', b.notes], ['total-price', Number(b.totalPrice || 0).toFixed(2)],
        ['net-price', Number(b.netPrice || 0).toFixed(2)]
    ];

    fields.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    });

    const statusVal = b.status || (isNew ? 'new' : 'future');
    const sObj = STATUS_CYCLE.find(x => x.val === statusVal) || STATUS_CYCLE[0];
    const sBtn = document.getElementById('status-cycle-btn');
    if (sBtn) {
        sBtn.dataset.value = sObj.val;
        sBtn.innerText = sObj.label;
        sBtn.style.background = sObj.bg;
        sBtn.style.color = sObj.txt;
    }
    const hiddenStatus = document.getElementById('guest-status-hidden');
    if (hiddenStatus) hiddenStatus.value = sObj.val;

    // Assigned Rooms
    const rContainer = document.getElementById('assigned-rooms-container');
    if (rContainer) rContainer.innerHTML = '';
    const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
    if (rList.length > 0) {
        rList.forEach(r => addRoomSelect(r));
    } else {
        addRoomSelect("");
    }

    // Payments & Charges
    const payList = document.getElementById('payments-list');
    if (payList) payList.innerHTML = '';
    if (Array.isArray(b.payments)) {
        b.payments.forEach(p => addPaymentRow(p.date, Number(p.amt || 0).toFixed(2), p.method, true));
    }

    setActiveExtraCharges(b.extraCharges || []);
    renderExtraCharges();

    // Multi-state Pills
    setMultiState('email-confirm-btn', b.emailConfirm ? 1 : 0, ['CONFIRM: --', 'CONFIRM: SENT'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);
    setMultiState('email-prepost-btn', !b.emailPrePost ? 0 : (b.emailPrePost === 'sent' ? 1 : 2), ['PRE/POST: --', 'PRE/POST: SENT', 'PRE/POST: CONF'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
    setMultiState('email-special-btn', b.emailSpecial ? 1 : 0, ['SPECIAL: --', 'SPECIAL: SENT'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400']);
    setMultiState('refund-btn', b.refundability === 'non-ref' ? 1 : (b.refundability === 'ref' ? 2 : 0), ['REFUNDABILITY: ?', 'NON-REFUNDABLE', 'REFUNDABLE'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
    setMultiState('upgrade-btn', !b.upgrade || b.upgrade === 'none' ? 0 : (b.upgrade === 'free' ? 1 : 2), ['NO UPGRADE', 'FREE UPGRADE', 'PAID UPGRADE'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400', 'bg-green-100 text-green-700 border-green-400']);
    setMultiState('rating-btn', !b.rating || b.rating === 'none' ? 0 : (b.rating === 'good' ? 1 : 2), ['FEEDBACK: --', 'FEEDBACK: ✔ GOOD', 'FEEDBACK: ❌ BAD'], ['text-slate-400', 'bg-green-100 text-green-700 border-green-400', 'bg-red-100 text-red-700 border-red-400']);
    setMultiState('ext-btn', b.extended ? 1 : 0, ['NOT EXTENDED', 'EXTENDED'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);

    updateHeaderName();
    updateNightsDisplay();
    calcFinancials();

    // Toggle Tool buttons
    ['delete-btn', 'split-btn', 'merge-btn', 'dup-btn', 'invoice-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.visibility = isNew ? 'hidden' : 'visible';
    });

    if (window.lucide) window.lucide.createIcons();
}

if (typeof window !== 'undefined') {
    window.openGuestModal = openGuestModal;
    window.closeGuestModal = closeGuestModal;
    window.updateHeaderName = updateHeaderName;
    window.cycleStatus = cycleStatus;
    window.cycleMulti = (el, l, c) => cycleMultiState(el, l, c);
    window.nudgeDate = nudgeDate;
    window.calcNights = calcNights;
    window.updateNightsDisplay = updateNightsDisplay;
    window.addRoomSelect = addRoomSelect;
    window.populateFolioForm = populateFolioForm;
    window.populateStaffForm = populateFolioForm;
}
