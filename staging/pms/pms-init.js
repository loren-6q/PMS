// ==========================================================================
// pms/pms-init.js - Front Desk PMS Core Frame Bootstrapper & Lifecycle
// Wild & Wandering Property Management System
// ==========================================================================

import { app, auth, db, appId, IS_STAGING } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { loadPropertiesCatalog, toCanonicalPropId, toDisplayPropKey } from '../core/properties.js';

import { viewStart, getDaysToShow, populateMonthSelect } from './pms-calendar-tape.js';
import { buildHeaderGrids } from './pms-calendar-grid.js';
import { renderReservationBar } from './pms-calendar-bars.js';
import { openGuestModal, initModalDrag, updateHeaderName } from './pms-folio-modal.js';
import { renderDashboard, dismissDashboardAlert } from './pms-dashboard.js';
import { renderDatabaseTable } from './pms-database.js';
import './pms-folio-actions.js';
import './pms-folio-ledger.js';
import './pms-folio-invoice.js';
import './pms-bulk-import.js';
import { processAndImportClipboard } from '../parser/parser-engine.js';

export let currentPropertyId = 'swims_resort';
export let staffBookings = [];
export let hotelRooms = [];
export let searchTerm = '';

export async function initPms() {
    const loader = document.getElementById('boot-loader');
    if (loader) loader.style.display = 'flex';

    try {
        await signInAnonymously(auth);

        // 1. Load dynamic properties dictionary
        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
        currentPropertyId = toCanonicalPropId(pParam);

        window.currentPropertyId = currentPropertyId;

        // Populate property switcher dropdown
        const switcher = document.getElementById('main-property-switcher');
        if (switcher && props.length > 0) {
            switcher.innerHTML = props.map(p => 
                `<option value="${p.id}" ${p.id === currentPropertyId ? 'selected' : ''}>${p.name.toUpperCase()}</option>`
            ).join('');
        }

        // Set active hotel rooms from catalog
        const activeProp = props.find(p => p.id === currentPropertyId) || props[0];
        hotelRooms = activeProp?.rooms || [];
        window.hotelRooms = hotelRooms;
        window.currentPropertyConfig = activeProp;

        initModalDrag();

        // 2. Attach Realtime Reservation Listener
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            staffBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.staff = staffBookings;

            renderCalendar();
            renderDashboard(staffBookings, currentPropertyId, openGuestModal);
            renderDatabaseTable();

            if (loader) loader.style.display = 'none';
        }, (err) => {
            console.error("[PMS Realtime Snapshot Error]:", err);
            if (loader) loader.style.display = 'none';
        });

    } catch (err) {
        console.error("[PMS Initialization Failed]:", err);
        if (loader) loader.style.display = 'none';
    }
}

export function renderCalendar() {
    const monthsContainer = document.getElementById('calendar-header-months');
    const daysContainer = document.getElementById('calendar-header-days');
    const body = document.getElementById('timeline-body');
    const monthSelect = document.getElementById('jump-month-select');

    if (!monthsContainer || !daysContainer || !body) return;

    populateMonthSelect(monthSelect);

    const daysToShow = getDaysToShow();
    document.documentElement.style.setProperty('--days', daysToShow);

    const todayStr = getLocalYMD(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalYMD(yesterday);

    const daysArray = Array.from({ length: daysToShow }, (_, i) => {
        return new Date(viewStart.getFullYear(), viewStart.getMonth(), viewStart.getDate() + i, 12, 0, 0);
    });

    buildHeaderGrids(monthsContainer, daysContainer, daysArray, todayStr);
    body.innerHTML = '';

    const getDayIndex = (dStr) => {
        const t = parseYMD(dStr);
        if (!t) return -1;
        const sTime = Date.UTC(viewStart.getFullYear(), viewStart.getMonth(), viewStart.getDate(), 12, 0, 0);
        return Math.round((t - sTime) / 86400000);
    };

    const propBookings = staffBookings.filter(b => {
        const p = (b.property || 'swims_resort').toLowerCase();
        return p === currentPropertyId.toLowerCase() && b.status !== 'cancelled';
    });

    // 1. Unassigned / Tray Bookings
    const unassignedList = propBookings.filter(b => {
        const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
        return rList.length === 0 || rList[0] === "" || ['unconfirmed', 'charged'].includes(b.status);
    });

    if (unassignedList.length > 0) {
        const trayHeader = document.createElement('div');
        trayHeader.className = "timeline-grid mt-2";
        trayHeader.innerHTML = `
            <div class="unassigned-header bg-amber-200 text-slate-800 p-1 text-[10px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30" style="grid-column: 1 / -1; min-width: 100vw;">
                <span>UNASSIGNED TRAY (${unassignedList.length})</span>
            </div>
        `;
        body.appendChild(trayHeader);

        const trayRow = document.createElement('div');
        trayRow.className = "timeline-grid bed-row bg-amber-50/40 relative";
        trayRow.innerHTML = `<div class="border-r border-slate-400 bg-amber-100 flex items-center justify-center font-black text-[10px] text-amber-800 uppercase sticky left-0 z-20 w-[var(--sidebar-w)]">TRAY</div>`;

        for (let i = 0; i < daysToShow; i++) {
            const col = document.createElement('div');
            col.className = "day-column";
            trayRow.appendChild(col);
        }

        unassignedList.forEach(b => {
            const bar = renderReservationBar(b, daysToShow, getDayIndex, todayStr, yesterdayStr, openGuestModal);
            if (bar) trayRow.appendChild(bar);
        });

        body.appendChild(trayRow);
    }

    // 2. Physical Rooms from Inventory
    hotelRooms.forEach(room => {
        const row = document.createElement('div');
        row.className = "timeline-grid bed-row relative";
        
        row.innerHTML = `
            <div class="border-r border-slate-400 bg-slate-50 flex items-center justify-between px-2 uppercase font-black text-xs text-slate-700 sticky left-0 z-20 shadow-xs w-[var(--sidebar-w)]">
                <span class="truncate">${room.id}</span>
                <span class="text-[9px] font-bold text-slate-400">${room.bed || ''}</span>
            </div>
        `;

        for (let i = 0; i < daysToShow; i++) {
            const col = document.createElement('div');
            const dIso = getLocalYMD(daysArray[i]);
            col.className = `day-column ${dIso === todayStr ? 'day-today' : ''}`;
            col.dataset.dateIso = dIso;
            col.onclick = () => {
                openGuestModal({
                    checkIn: dIso,
                    checkOut: getLocalYMD(new Date(daysArray[i].getTime() + 86400000)),
                    room: room.id,
                    rooms: [room.id]
                });
            };
            row.appendChild(col);
        }

        const roomBookings = propBookings.filter(b => {
            const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
            return rList.includes(room.id);
        });

        roomBookings.forEach(b => {
            const bar = renderReservationBar(b, daysToShow, getDayIndex, todayStr, yesterdayStr, openGuestModal);
            if (bar) row.appendChild(bar);
        });

        body.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function switchTab(tab) {
    ['calendar', 'dashboard', 'database'].forEach(t => {
        const view = document.getElementById(`${t}-view`);
        const btn = document.getElementById(`tab-${t === 'calendar' ? 'cal' : (t === 'dashboard' ? 'dash' : 'db')}`);
        if (view) view.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });

    if (tab === 'calendar') renderCalendar();
    else if (tab === 'dashboard') renderDashboard(staffBookings, currentPropertyId, openGuestModal);
    else if (tab === 'database') renderDatabaseTable();
}

export function handleSearch(term) {
    searchTerm = (term || '').trim().toUpperCase();
    renderCalendar();
    renderDatabaseTable();
}

// Window Bridge for HTML Attributes
if (typeof window !== 'undefined') {
    window.renderCalendar = renderCalendar;
    window.switchTab = switchTab;
    window.handleSearch = handleSearch;
    window.editStaff = (id) => {
        const b = (staffBookings || []).find(x => x.id === id);
        if (b) openGuestModal(b);
    };
    window.parseEmail = () => processAndImportClipboard();
    window.openEmailParserModal = () => {
        const m = document.getElementById('email-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
    };
}

document.addEventListener('DOMContentLoaded', initPms);
