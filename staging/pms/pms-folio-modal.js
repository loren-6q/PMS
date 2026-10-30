// ==========================================================================
// pms/pms-folio-modal.js - Reservation Modal Lifecycle & Form Populator
// Wild & Wandering Property Management System
// ==========================================================================

import { STATUS_CYCLE } from '../core/occupancy.js';
import { getLocalYMD } from '../core/dates.js';

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

export function addRoomSelect(initialVal = "") {
    const container = document.getElementById('assigned-rooms-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = "flex items-stretch gap-1 w-full";

    const sel = document.createElement('select');
    sel.className = "assigned-room-select flex-1 min-w-0 bg-white border border-blue-300 text-xs font-bold uppercase text-blue-800 rounded px-1 py-1 outline-none shadow-xs cursor-pointer";
    sel.innerHTML = `<option value="">-- UNASSIGNED --</option>`;

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

    sel.value = initialVal || "";

    const delBtn = document.createElement('button');
    delBtn.type = "button";
    delBtn.className = "w-6 flex justify-center items-center text-red-500 hover:text-red-700 bg-red-50 rounded border border-red-200 cursor-pointer";
    delBtn.innerHTML = `&times;`;
    delBtn.onclick = () => {
        wrap.remove();
        if (container.children.length === 0) addRoomSelect("");
    };

    wrap.appendChild(sel);
    wrap.appendChild(delBtn);
    container.appendChild(wrap);
}

export function populateFolioForm(b = {}) {
    const isNew = !b.id;
    const form = document.getElementById('guest-form');
    if (form) form.reset();

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

    // Populate assigned rooms
    const rContainer = document.getElementById('assigned-rooms-container');
    if (rContainer) rContainer.innerHTML = '';
    const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
    if (rList.length > 0) {
        rList.forEach(r => addRoomSelect(r));
    } else {
        addRoomSelect("");
    }

    updateHeaderName();
}

if (typeof window !== 'undefined') {
    window.openGuestModal = openGuestModal;
    window.closeGuestModal = closeGuestModal;
    window.updateHeaderName = updateHeaderName;
    window.cycleStatus = cycleStatus;
    window.addRoomSelect = addRoomSelect;
    window.populateFolioForm = populateFolioForm;
}
