// ==========================================================================
// pms/pms-folio-modal.js - Modal Lifecycle, Drag, Accordions, Dates, Rooms & Form
// Wild & Wandering Property Management System
// ==========================================================================

import { STATUS_CYCLE, getStatusObj, getNextStatus, applyStatusStyle } from '../core/occupancy.js';
import { parseYMD, getLocalYMD } from '../core/dates.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --- State & Config Accessors ---
const getStaff = () => window.staff || (window.getStaff ? window.getStaff() : []);
const getHotelRooms = () => window.hotelRooms || (window.getHotelRooms ? window.getHotelRooms() : []);
const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

// --- Active Property ID Resolver ---
const getPropId = () => {
    const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
    return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
};

// --------------------------------------------------------------------------
// 1. MODAL WINDOW DRAGGING & DIALOG CONTROLLERS
// --------------------------------------------------------------------------

let isDragging = false, dragOffsetX, dragOffsetY;

// --- Modal Drag Initiator ---
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

// --- Modal Drag Move Listener ---
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

// --- Modal Drag Release Listener ---
document.addEventListener('mouseup', () => {
    if (isDragging) isDragging = false;
});

// --- Close Main Guest Modal ---
export const closeGuestModal = () => {
    const m = $('guest-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

// --- Universal Modal Closer ---
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

// --- Open Reservation Import Modal ---
export const openExtractModal = () => {
    const txt = $('parse-textarea');
    if (txt) txt.value = '';
    const m = $('import-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
    setTimeout(() => $('parse-textarea')?.focus(), 50);
    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 2. MODAL UI STATE, ACCORDIONS & MULTI-STATE CONTROLLERS
// --------------------------------------------------------------------------

// --- Accordion Section Toggle ---
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

// --- Audit History Modal Display ---
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
        bBtn.className = 'btn-modal bg-slate-800 hover:bg-slate-700 text-white px-10 cursor-pointer';
        bBtn.onclick = () => {
            const m = $('alert-modal');
            if (m) {
                m.classList.remove('active');
                m.style.display = 'none';
            }
            if (typeof window.closeAlert === 'function') window.closeAlert();
        };
    }
    const m = $('alert-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
    if (window.lucide) window.lucide.createIcons();
};

export const closeAlert = () => {
    const m = $('alert-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

// --- Modal Header Name Sync ---
export const updateHeaderName = () => {
    const fn = $('first-name')?.value.trim().toUpperCase() || '';
    const ln = $('last-name')?.value.trim().toUpperCase() || '';
    const disp = $('modal-guest-name-display');
    if (disp) disp.innerText = `${fn} ${ln}`.trim() || "NEW BOOKING";
};

// --- OTA Proxy Email Detection & Formatting ---
export const checkEmailProxy = val => {
    const el = $('email');
    if (!el) return;
    const v = val.toLowerCase();
    const isOTA = v.includes('booking.com') || v.includes('agoda');
    el.classList.remove('text-red-600', 'text-green-600', 'font-black');
    if (isOTA) el.classList.add('text-red-600', 'font-black');
    else if (v.includes('@')) el.classList.add('text-green-600', 'font-black');
};

// --- Folio Status Cycle Handler ---
export const cycleStatus = () => {
    const sBtn = $('status-cycle-btn');
    if (!sBtn) return;
    const cV = sBtn.dataset.value || 'future';
    let idx = STATUS_CYCLE.findIndex(x => x.val === cV);
    idx = (idx + 1) % STATUS_CYCLE.length;
    const nO = STATUS_CYCLE[idx];
    sBtn.dataset.value = nO.val;
    sBtn.innerText = nO.label || nO.val.toUpperCase();
    sBtn.style.background = nO.bg;
    sBtn.style.color = nO.txt;
    const hiddenInput = $('guest-status-hidden');
    if (hiddenInput) hiddenInput.value = nO.val;
};

// --- Multi-State Lifecycle Button State Setter ---
export const setMulti = (id, state, labels, classes) => {
    const el = $(id);
    if (!el) return;
    el.dataset.state = state;
    el.innerText = labels[state];
    el.className = id.includes('email')
        ? `flex-1 min-w-[80px] unselectable multi-state-btn px-0.5 py-1 rounded text-[9px] font-black uppercase border text-center whitespace-nowrap ${classes[state]}`
        : `flex-1 unselectable multi-state-btn px-1 py-1.5 rounded text-[10px] font-black uppercase border ${classes[state]}`;
};

// --- Multi-State Lifecycle Button Cycle Initiator ---
export const cycleMulti = (el, labels, classes) => {
    if (!el) return;
    let cur = parseInt(el.dataset.state || 0, 10);
    cur = (cur + 1) % labels.length;
    setMulti(el.id, cur, labels, classes);
};

// --- Linked Stay Multi-Leg Navigation Stripe ---
export const renderItineraryStripe = s => {
    const stripe = $('itinerary-stripe');
    if (!stripe) return;
    if (!s || !s.linkedId) {
        stripe.classList.add('hidden');
        stripe.innerHTML = '';
        return;
    }

    const curProp = getPropId();
    const legs = getStaff().filter(x => {
        const xProp = window.toCanonicalPropId ? window.toCanonicalPropId(x.property) : x.property;
        return xProp === curProp && x.linkedId === s.linkedId && x.status !== 'cancelled' && x.status !== 'noshow';
    }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

    if (legs.length <= 1) {
        stripe.classList.add('hidden');
        stripe.innerHTML = '';
        return;
    }

    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const formatCompactDate = (dIn, dOut) => {
        if (!dIn || !dOut) return '--';
        const iD = new Date(dIn + "T12:00:00Z"), oD = new Date(dOut + "T12:00:00Z");
        const iM = months[iD.getUTCMonth()], oM = months[oD.getUTCMonth()];
        const iDay = String(iD.getUTCDate()).padStart(2, '0');
        const oDay = String(oD.getUTCDate()).padStart(2, '0');
        return iM === oM ? `${iDay}-${oDay}${iM}` : `${iDay}${iM}-${oDay}${oM}`;
    };

    let html = `<div class="flex items-center gap-1.5 flex-wrap">`;
    html += `<i data-lucide="link" class="!w-3.5 !h-3.5 text-slate-400 shrink-0 mr-0.5"></i>`;

    legs.forEach((leg, idx) => {
        const isCurrent = leg.id === s.id;
        const rList = getRooms(leg).filter(Boolean);
        const rStr = rList.join(',') || 'Unassigned';
        const dateStr = formatCompactDate(leg.checkIn, leg.checkOut);

        if (idx > 0) html += `<span class="text-slate-600 font-black text-xs select-none">|</span>`;

        html += `
            <button type="button" onclick="window.editStaff('${leg.id}')" class="px-2 py-0.5 rounded text-xs font-black uppercase transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${isCurrent ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'}" title="Switch to Leg ${idx + 1}">
                ${isCurrent ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>' : ''}
                <span>${dateStr} ${rStr}</span>
            </button>
        `;
    });

    html += `</div>`;
    stripe.innerHTML = html;
    stripe.classList.remove('hidden');
    stripe.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 3. DATES, NIGHTS DURATION & PAX CONTROLLER
// --------------------------------------------------------------------------

// --- Calculate Stay Duration in Nights ---
export const calcNights = () => {
    const cI = $('check-in')?.value, cO = $('check-out')?.value;
    if (!cI || !cO) return 1;
    const ms = parseYMD(cO) - parseYMD(cI);
    return Math.max(1, Math.round(ms / 86400000));
};

// --- Stay Duration Nights Counter Display ---
export const updateNightsDisplay = (forcedNights = null) => {
    const n = forcedNights !== null ? forcedNights : calcNights();
    const txtEl = $('nights-count-text');
    const container = $('booking-nights-display');
    if (container) container.dataset.nights = n;
    if (txtEl) {
        txtEl.innerText = `${n} Nt${n > 1 ? 's' : ''}`;
    }
    return n;
};

// --- Retrieve Locked Stay Duration ---
export const getStoredNights = () => {
    const container = $('booking-nights-display');
    const n = parseInt(container?.dataset?.nights);
    if (!isNaN(n) && n >= 1) return n;
    return calcNights();
};

// --- Date Step Arrow Nudger (-1d / +1d) ---
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

// --- Check-in Picker with Duration Preservation ---
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

// --- Check-out Picker with Duration Preservation ---
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

// --- Guest Count Adjuster (PAX +/-) ---
export const adjustPax = delta => {
    const el = $('pax-count');
    if (!el) return;
    let val = Math.max(1, (parseInt(el.value) || 1) + delta);
    el.value = val;
    if (window.calcFinancials) window.calcFinancials();
    if (window.calcExtension) window.calcExtension();
};

// --------------------------------------------------------------------------
// 4. ROOM AVAILABILITY & BED SELECTION CONTROLLER
// --------------------------------------------------------------------------

// --- Occupied Room Set Evaluator for Target Date Range ---
export const getOccupiedRooms = (checkInStr, checkOutStr, excludeBookingId = null) => {
    const occ = new Set();
    const sU = parseYMD(checkInStr), eU = parseYMD(checkOutStr);
    if (!sU || !eU) return occ;
    const curProp = getPropId();

    getStaff().forEach(s => {
        if (s.id === excludeBookingId) return;
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return;

        const rList = getRooms(s);
        const isUnassigned = rList.length === 0 || rList[0] === "";
        const isOccupying = window.isOccupyingBooking 
            ? window.isOccupyingBooking(s.status, isUnassigned)
            : (s.status !== 'cancelled' && s.status !== 'noshow');

        if (!isOccupying) return;

        if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
            rList.forEach(r => {
                if (r) occ.add(String(r).trim().toUpperCase());
            });
        }
    });
    return occ;
};

// --- Refresh Dropdown Options with (OCCUPIED) Status ---
export const updateAvailableRooms = () => {
    const cI = $('check-in')?.value, cO = $('check-out')?.value, cId = $('guest-id')?.value;
    if (!cI || !cO) return;
    const occ = getOccupiedRooms(cI, cO, cId);

    $$('.assigned-room-select').forEach(sel => {
        const cur = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return;
            if (occ.has(String(opt.value).trim().toUpperCase())) {
                opt.disabled = true;
                if (!opt.text.includes('(OCCUPIED)')) {
                    opt.text = opt.text + ' (OCCUPIED)';
                }
            } else {
                opt.disabled = false;
                opt.text = opt.text.replace(' (OCCUPIED)', '');
            }
        });
        sel.value = cur;
    });
};

// --- Add Assigned Room Selector Row with Dorm Dividers ---
export function addRoomSelect(val = "", isManualAdd = false) {
    if (arguments.length === 0) isManualAdd = true;
    
    const c = $('assigned-rooms-container');
    if (!c) return;
    const w = document.createElement('div');
    const sel = document.createElement('select');
    w.className = "flex items-stretch gap-1 w-full";
    sel.className = "assigned-room-select flex-1 min-w-0 bg-white border border-blue-300 text-xs font-bold uppercase text-blue-800 rounded px-1 py-1 outline-none shadow-sm cursor-pointer focus:ring-2 focus:ring-blue-500 text-ellipsis";
    sel.innerHTML = `<option value="">-- UNASSIGNED TRAY --</option>`;
    sel.onchange = updateAvailableRooms;

    let cg = '', og = null;
    let lastBaseRoom = null;

    getHotelRooms().filter(r => !r.inactive).forEach(r => {
        const cat = r.type || r.category || 'ROOMS';
        if (cat !== cg) {
            og = document.createElement('optgroup');
            og.label = `━━━ ${cat.toUpperCase()} ━━━`;
            sel.appendChild(og);
            cg = cat;
            lastBaseRoom = null;
        }

        const classifyFn = window.classifyRoomForCalendar || (rm => {
            const isDorm = !rm.isPrivate && (rm.isDorm === true || (rm.rule && rm.rule !== 'private') || (rm.category || '').toLowerCase().includes('dorm'));
            let baseRoom = rm.parentRoom || (rm.id.includes('№') ? rm.id.split('№')[0].trim() : rm.id.replace(/\d+$/, '').trim());
            return { isDorm, baseRoom };
        });

        const { isDorm, baseRoom } = classifyFn(r);
        if (isDorm && baseRoom && baseRoom !== lastBaseRoom) {
            const dormDiv = document.createElement('option');
            dormDiv.disabled = true;
            dormDiv.value = "";
            dormDiv.innerText = `  ── ${baseRoom.toUpperCase()} ──`;
            dormDiv.className = "text-slate-400 font-bold bg-slate-100 select-none";
            og.appendChild(dormDiv);
            lastBaseRoom = baseRoom;
        }

        const opt = document.createElement('option');
        opt.value = r.id;
        const bunkArrow = (r.bunk === 'top' || r.bed === 'top') ? ' ↑' : ((r.bunk === 'bottom' || r.bunk === 'bot' || r.bed === 'bottom' || r.bed === 'bot') ? ' ↓' : '');
        opt.innerText = isDorm ? `    ${r.id}${bunkArrow}` : `${r.id}${bunkArrow}`;
        og.appendChild(opt);
    });

    if (val) {
        const exists = Array.from(sel.options).some(o => o.value === val);
        if (!exists) {
            const legacyOpt = document.createElement('option');
            legacyOpt.value = val;
            legacyOpt.innerText = `⚠️ ${val} (Historical / Preserved)`;
            sel.appendChild(legacyOpt);
        }
    }

    sel.value = val || "";
    const del = document.createElement('button');
    del.type = "button";
    del.className = "w-6 flex justify-center items-center text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 flex-shrink-0 shadow-sm transition-colors cursor-pointer";
    del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>`;
    
    del.onclick = () => {
        w.remove();
        if (c.children.length === 0) {
            addRoomSelect("", false);
        }
        updateAvailableRooms();
    };

    w.appendChild(sel);
    w.appendChild(del);
    c.appendChild(w);
    updateAvailableRooms();
}

// --------------------------------------------------------------------------
// 5. GUEST FOLIO MODAL INGESTION & DISPLAY ENGINE
// --------------------------------------------------------------------------

// --- Populate & Open Guest Folio Modal ---
export const openGuestModal = (s = {}) => {
    const isN = !s.id;
    const f = $('guest-form');
    if (f) f.reset();
    const mC = $('guest-modal-content');
    if (mC) {
        mC.style.position = 'relative';
        mC.style.left = 'auto';
        mC.style.top = 'auto';
        mC.style.margin = '0';
    }

    const bcc = $('bad-cc-box');
    if (bcc) {
        bcc.dataset.bad = s.badCC ? 'true' : 'false';
        bcc.innerHTML = s.badCC ? '<span class="text-white text-[10px] font-black">X</span>' : '';
        bcc.className = `w-3.5 h-3.5 border-2 border-slate-300 rounded mt-0.5 flex items-center justify-center ${s.badCC ? 'bg-red-500 border-red-600' : ''}`;
    }

    [
        ['guest-id', s.id], ['first-name', s.firstName], ['last-name', s.lastName], ['phone', s.phone],
        ['email', s.email], ['booked-type', s.bookedType], ['check-in', s.checkIn], ['check-out', s.checkOut],
        ['booking-date', s.bookDate], ['booking-id', s.bookId], ['link-code', s.linkedId], ['guest-country', s.country],
        ['pax-count', s.pax || 1], ['booking-source', s.source || 'direct'], ['guest-notes', s.notes],
        ['total-price', Number(s.totalPrice || 0).toFixed(2)], ['net-price', Number(s.netPrice || 0).toFixed(2)]
    ].forEach(([id, val]) => {
        const el = $(id);
        if (el) el.value = val || "";
    });

    const totPriceEl = $('total-price');
    if (totPriceEl) {
        if (s.isAverageRate) {
            totPriceEl.classList.add('text-amber-600');
            totPriceEl.title = "Average daily rate applied (OTA did not send nightly rate breakdown)";
        } else {
            totPriceEl.classList.remove('text-amber-600');
            totPriceEl.title = "";
        }
    }

    let pSt = s.status || "future";
    if ($('guest-status-hidden')) $('guest-status-hidden').value = pSt;
    const cycle = window.STATUS_CYCLE || [];
    const sObj = cycle.find(x => x.val === pSt) || cycle[1] || { val: 'future', bg: '#7fc6f5', txt: '#1e293b' };
    const sBtn = $('status-cycle-btn');
    if (sBtn) {
        sBtn.dataset.value = sObj.val;
        sBtn.innerText = sObj.label || sObj.val.toUpperCase();
        sBtn.style.background = sObj.bg;
        sBtn.style.color = sObj.txt;
    }

    if ($('net-price')) $('net-price').dataset.override = s.netOverride ? 'true' : 'false';
    if ($('assigned-rooms-container')) $('assigned-rooms-container').innerHTML = '';
    
    const rL = getRooms(s).length ? getRooms(s) : (isN ? [] : [""]);
    if (rL.length > 0) { 
        rL.forEach(r => addRoomSelect(r, false)); 
    } else { 
        addRoomSelect("", false); 
    }

    if ($('payments-list')) $('payments-list').innerHTML = '';
    if (s.payments && window.addPaymentRow) {
        s.payments.forEach(p => window.addPaymentRow(p.date, Number(p.amt || 0).toFixed(2), p.method, true));
    }

    window.activeExtraCharges = Array.isArray(s.extraCharges) ? [...s.extraCharges] : [];
    if (window.renderExtraCharges) window.renderExtraCharges();

    setMulti('email-confirm-btn', s.emailConfirm ? 1 : 0, ['CONFIRM: --', 'CONFIRM: SENT'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);
    setMulti('email-prepost-btn', !s.emailPrePost ? 0 : (s.emailPrePost === 'sent' ? 1 : 2), ['PRE/POST: --', 'PRE/POST: SENT', 'PRE/POST: CONF'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
    setMulti('email-special-btn', s.emailSpecial ? 1 : 0, ['SPECIAL: --', 'SPECIAL: SENT'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400']);
    setMulti('refund-btn', s.refundability === 'non-ref' ? 1 : (s.refundability === 'ref' ? 2 : 0), ['REFUNDABILITY: ?', 'NON-REFUNDABLE', 'REFUNDABLE'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
    setMulti('upgrade-btn', !s.upgrade || s.upgrade === 'none' ? 0 : (s.upgrade === 'free' ? 1 : 2), ['NO UPGRADE', 'FREE UPGRADE', 'PAID UPGRADE'], ['text-slate-400', 'bg-yellow-100 text-yellow-700 border-yellow-400', 'bg-green-100 text-green-700 border-green-400']);
    setMulti('rating-btn', !s.rating || s.rating === 'none' ? 0 : (s.rating === 'good' ? 1 : 2), ['FEEDBACK: --', 'FEEDBACK: ✔ GOOD', 'FEEDBACK: ❌ BAD'], ['text-slate-400', 'bg-green-100 text-green-700 border-green-400', 'bg-red-100 text-red-700 border-red-400']);
    setMulti('ext-btn', s.extended ? 1 : 0, ['NOT EXTENDED', 'EXTENDED'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400']);

    if ($('ext-days')) $('ext-days').value = 1;
    if ($('ext-avg-rate')) { $('ext-avg-rate').value = ''; $('ext-avg-rate').classList.remove('text-pink-600', 'bg-pink-100'); }
    if ($('ext-price')) $('ext-price').value = '';

    updateHeaderName();
    checkEmailProxy(s.email || "");
    if (window.calcFinancials) window.calcFinancials();
    updateAvailableRooms();
    updateNightsDisplay();
    if (window.calcExtension) window.calcExtension();

    toggleSection('guest-profile-section', 'profile-chevron', true);
    toggleSection('ext-section', 'ext-chevron', false);
    toggleSection('fin-section', 'fin-chevron', true);
    toggleSection('meta-section', 'meta-chevron', true);

    renderItineraryStripe(s);

['delete-btn', 'split-btn', 'merge-btn', 'dup-btn', 'hist-btn', 'invoice-btn'].forEach(id => {
        const el = $(id);
        if (el) el.style.visibility = isN ? 'hidden' : 'visible';
    });
    
    // --- Early Checkout Action Button Controller in #NTS Box ---
    const earlyBtn = $('early-out-btn');
    const todayStr = getLocalYMD(new Date());
    if (earlyBtn) {
        if (!isN && s.earlyCheckout) {
            earlyBtn.title = "Revert Early Checkout";
            earlyBtn.className = "absolute right-1 px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-[9px] uppercase shadow-xs flex items-center gap-0.5 cursor-pointer";
            earlyBtn.innerHTML = `<i data-lucide="rotate-ccw" class="!w-2.5 !h-2.5"></i><span>UNDO</span>`;
            earlyBtn.style.display = 'flex';
            earlyBtn.onclick = () => window.undoEarlyCheckout && window.undoEarlyCheckout();
        } else if (!isN && s.checkOut > todayStr && window.isOccupyingBooking && window.isOccupyingBooking(s.status, true)) {
            earlyBtn.title = "Check Out Early";
            earlyBtn.className = "absolute right-1 px-1.5 py-0.5 bg-amber-700 hover:bg-amber-800 text-white rounded font-black text-[9px] uppercase shadow-xs flex items-center gap-0.5 cursor-pointer";
            earlyBtn.innerHTML = `<i data-lucide="log-out" class="!w-2.5 !h-2.5"></i><span>OUT</span>`;
            earlyBtn.style.display = 'flex';
            earlyBtn.onclick = () => window.requestEarlyCheckout && window.requestEarlyCheckout();
        } else {
            earlyBtn.className = "hidden";
            earlyBtn.style.display = 'none';
        }
    }
    
    const userEmail = (window.currentUserEmail || 'admin').toUpperCase();
    if ($('audit-log')) {
        $('audit-log').innerText = isN ? `NEW RECORD | CREATING AS ${userEmail}` : `CREATED BY ${s.createdBy || 'UNKNOWN'} ON ${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB').slice(0, 5) : '--'}` + (s.lastEditedBy ? ` | LAST EDIT: ${s.lastEditedBy} ON ${new Date(s.lastEditedAt).toLocaleDateString('en-GB').slice(0, 5)}` : '');
    }

    if (window.currentUserRole === 'staff') {
        ['delete-btn', 'split-btn', 'merge-btn'].forEach(id => { if ($(id)) $(id).style.visibility = 'hidden'; });
        if ($('save-btn')) $('save-btn').style.display = 'none';
    }

    const modal = $('guest-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
    if (window.lucide) window.lucide.createIcons();
};

// --- Edit Booking Entry Point ---
export const editStaff = id => {
    const s = getStaff().find(x => x.id === id);
    if (s) openGuestModal(s);
};

// --- Quick Add from Timeline Cell Click ---
export const quickAdd = (r, d) => {
    openGuestModal({});
    if ($('check-in')) $('check-in').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const o = new Date(d);
    o.setDate(d.getDate() + 1);
    if ($('check-out')) $('check-out').value = `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`;
    updateNightsDisplay();
    if ($('assigned-rooms-container')) $('assigned-rooms-container').innerHTML = '';
    addRoomSelect(r, false);

    const curProp = getPropId();
    const pCode = window.toDisplayPropKey ? window.toDisplayPropKey(curProp) : 'SWIMS';
    const directBookings = getStaff().filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        return sProp === curProp && s.bookId && s.bookId.startsWith(pCode);
    }).sort((a, b) => {
        const numA = parseInt(a.bookId.replace(pCode, ''), 10) || 0;
        const numB = parseInt(b.bookId.replace(pCode, ''), 10) || 0;
        return numB - numA;
    });
    let nextNum = 1;
    if (directBookings.length > 0) {
        nextNum = (parseInt(directBookings[0].bookId.replace(pCode, ''), 10) || 0) + 1;
    }
    if ($('booking-id')) $('booking-id').value = `${pCode}${String(nextNum).padStart(5, '0')}`;
    if ($('booking-date')) $('booking-date').value = getLocalYMD(new Date());
    updateAvailableRooms();
    if (window.calcExtension) window.calcExtension();
};


// --- Property Picker Dropdown Controller for Top Brand Logo ---
export const togglePropertyPicker = () => {
    const dropdown = document.getElementById('property-picker-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (!isHidden) {
        dropdown.classList.add('hidden');
        return;
    }

    const switcher = document.getElementById('main-property-switcher');
    const options = switcher ? Array.from(switcher.options) : [];
    const curVal = switcher ? switcher.value : (window.currentPropertyId || '');

    if (options.length === 0) {
        dropdown.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold">No properties loaded.</div>`;
    } else {
        let html = `
            <div class="bg-slate-900 text-white text-[10px] font-black uppercase px-3 py-2 flex justify-between items-center">
                <span>Switch Property</span>
                <button type="button" onclick="window.togglePropertyPicker()" class="text-slate-400 hover:text-white cursor-pointer"><i data-lucide="x" class="!w-3.5 !h-3.5"></i></button>
            </div>
            <div class="p-1 space-y-0.5 max-h-64 overflow-y-auto">
        `;
        options.forEach(opt => {
            const isSelected = opt.value === curVal;
            html += `
                <button type="button" onclick="if(window.handlePropertySwitch) window.handlePropertySwitch('${opt.value}'); window.togglePropertyPicker();" class="w-full text-left px-3 py-2 rounded text-xs font-bold uppercase transition-colors flex items-center justify-between cursor-pointer ${isSelected ? 'bg-blue-600 text-white font-black shadow-sm' : 'text-slate-700 hover:bg-slate-100'}">
                    <span>${opt.text}</span>
                    ${isSelected ? '<span class="text-xs font-black">✓</span>' : ''}
                </button>
            `;
        });
        html += `</div>`;
        dropdown.innerHTML = html;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }
    dropdown.classList.remove('hidden');
};

// Auto-close property picker when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('property-picker-dropdown');
    const logoBtn = document.getElementById('main-brand-logo')?.closest('button');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(e.target) && (!logoBtn || !logoBtn.contains(e.target))) {
            dropdown.classList.add('hidden');
        }
    }
});

// --------------------------------------------------------------------------
// 6. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

window.startDrag = startDrag;
window.closeGuestModal = closeGuestModal;
window.closeModal = closeModal;
window.openExtractModal = openExtractModal;
window.toggleSection = toggleSection;
window.showAuditHistory = showAuditHistory;
window.updateHeaderName = updateHeaderName;
window.checkEmailProxy = checkEmailProxy;
window.cycleStatus = cycleStatus;
window.calcNights = calcNights;
window.updateNightsDisplay = updateNightsDisplay;
window.getStoredNights = getStoredNights;
window.nudgeDate = nudgeDate;
window.handleCheckInPicker = handleCheckInPicker;
window.handleCheckOutPicker = handleCheckOutPicker;
window.adjustPax = adjustPax;
window.getOccupiedRooms = getOccupiedRooms;
window.updateAvailableRooms = updateAvailableRooms;
window.addRoomSelect = addRoomSelect;
window.setMulti = setMulti;
window.cycleMulti = cycleMulti;
window.renderItineraryStripe = renderItineraryStripe;
window.openGuestModal = openGuestModal;
window.editStaff = editStaff;
window.quickAdd = quickAdd;
window.togglePropertyPicker = togglePropertyPicker;


