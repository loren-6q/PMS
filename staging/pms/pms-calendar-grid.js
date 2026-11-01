// ==========================================================================
// pms/pms-calendar-grid.js - Category Dividers, Availability & Master Grid
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { viewStart, getDaysToShow, populateMonthSelect } from './pms-calendar-tape.js';
import { renderReservationBar } from './pms-calendar-bars.js';
import { openGuestModal } from './pms-folio-modal.js';

// --- 1. Bed & Room Display Formatters ---
export function formatBedDisplayLabel(id) {
    if (!id) return '';
    const str = String(id).trim();
    if (str.includes('№')) {
        const parts = str.split('№');
        return {
            roomName: parts[0].trim(),
            bedNum: `№ ${parts[1].trim()}`
        };
    }
    const m = str.match(/^(.*?)[\s\-_]+(\d+)\$/);
    if (m) {
        return {
            roomName: m[1].trim(),
            bedNum: `№ ${m[2].padStart(2, '0')}`
        };
    }
    return {
        roomName: str,
        bedNum: ''
    };
}

export function classifyRoomForCalendar(r) {
    const isPrivate = (r.rule === 'private') || (r.isDorm === false);
    const isDorm = !isPrivate && (
        r.isDorm === true ||
        (r.rule && r.rule !== 'private') ||
        (r.category || r.type || '').toLowerCase().includes('dorm') ||
        (r.parentRoom && r.parentRoom !== r.id) ||
        (r.id || '').includes('№')
    );

    let baseRoom = '';
    if (isDorm) {
        if (r.parentRoom && r.parentRoom !== r.id) {
            baseRoom = r.parentRoom;
        } else if ((r.id || '').includes('№')) {
            baseRoom = r.id.split('№')[0].trim();
        } else {
            baseRoom = r.id.trim();
        }
    }

    return { isDorm, baseRoom };
}

// --- 2. Header Months & Days Grid Builder ---
export function buildHeaderGrids(monthsContainer, daysContainer, daysArray, todayStr) {
    if (!monthsContainer || !daysContainer) return;

    monthsContainer.innerHTML = `<div class="border-r border-slate-700 flex items-center justify-center h-full sticky left-0 z-[60] bg-slate-800 w-[var(--sidebar-w)]"></div>`;
    daysContainer.innerHTML = `
        <div class="p-1 text-[12px] font-black text-slate-500 uppercase flex items-center justify-between border-r border-slate-400 bg-slate-100 h-full sticky left-0 z-[50] w-[var(--sidebar-w)]">
            <span>ROOM</span>
            <div class="flex items-center gap-1">
                <button type="button" onclick="window.toggleAllGroups()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-xs cursor-pointer" title="Master Toggle"><i data-lucide="layers" class="!w-[13px] !h-[13px]"></i></button>
                <button type="button" onclick="window.toggleZoom()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-xs cursor-pointer" title="Toggle Zoom"><i data-lucide="zoom-in" id="zoom-toggle-icon" class="!w-[13px] !h-[13px]"></i></button>
            </div>
        </div>
    `;

    let cMon = -1;
    let cSpan = 0;
    daysArray.forEach((d, i) => {
        if (d.getMonth() !== cMon) {
            if (cMon !== -1) {
                monthsContainer.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${daysArray[i - 1].getFullYear()}</div>`;
            }
            cMon = d.getMonth();
            cSpan = 1;
        } else {
            cSpan++;
        }
        if (i === daysArray.length - 1) {
            monthsContainer.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${d.getFullYear()}</div>`;
        }

        const isToday = getLocalYMD(d) === todayStr;
        daysContainer.innerHTML += `
            <div class="flex flex-col items-center justify-center border-r border-slate-400 ${isToday ? 'bg-blue-100' : ''}">
                <div class="text-[10px] font-black text-slate-500 uppercase leading-none">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div class="text-[16px] font-black ${isToday ? 'text-blue-600' : 'text-slate-800'} leading-tight">${d.getDate()}</div>
            </div>
        `;
    });
}

// --- 3. Thermal Availability Calculation ---
export function renderCategoryAvailabilityRow(catName, grpKey, roomList, daysArray, bookings, daysToShow) {
    const tRIds = roomList.map(hr => hr.id);
    const cap = tRIds.length;
    const aRow = document.createElement('div');
    aRow.className = `timeline-grid avail-row-${grpKey} h-[20px]`;
    aRow.style.display = 'none';

    let cHtml = `<div class="bg-slate-900 border-r border-slate-700 flex items-center justify-end pr-2 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-[var(--sidebar-w)] text-[9px] text-slate-400 font-black uppercase tracking-widest unselectable">AVAIL &rarr;</div>`;

    for (let i = 0; i < daysToShow; i++) {
        const dT = daysArray[i].getTime();
        const occ = new Set();

        bookings.forEach(s => {
            if (['unconfirmed', 'charged', 'cancelled', 'noshow', 'vol'].includes(s.status)) return;
            if (dT >= parseYMD(s.checkIn) && dT < parseYMD(s.checkOut)) {
                const rList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
                rList.forEach(r => {
                    if (r && tRIds.includes(r)) occ.add(r);
                });
            }
        });

        const av = cap - occ.size;
        const pct = cap > 0 ? av / cap : 0;
        let cCls = '';

        if (av === cap) cCls = 'bg-[#4ade80] text-black';
        else if (pct >= 0.75) cCls = 'bg-black text-[#4ade80]';
        else if (pct >= 0.50) cCls = 'bg-black text-white';
        else if (pct >= 0.25) cCls = 'bg-[#7f1d1d] text-white';
        else if (av > 0) cCls = 'bg-[#dc2626] text-white';
        else cCls = 'bg-[#ef4444] text-black font-black';

        cHtml += `<div class="flex items-center justify-center border-r border-slate-800 text-[10px] font-black ${cCls}">${av}</div>`;
    }

    aRow.innerHTML = cHtml;
    return aRow;
}

// --- 4. Collapsible Category & Accordion Controllers ---
export function toggleGroup(grp, stateIdx = -1) {
    const icon = document.getElementById(`icon-${grp}`);
    const rows = document.querySelectorAll(`.group-${grp}`);
    const stateLabel = document.getElementById(`state-${grp}`);
    const availRows = document.querySelectorAll(`.avail-row-${grp}`);
    if (!icon) return;

    if (grp === 'unassigned-tray') {
        window.isUnassignedTrayOpen = !window.isUnassignedTrayOpen;
        rows.forEach(r => {
            r.style.display = window.isUnassignedTrayOpen ? 'grid' : 'none';
        });
        icon.style.transform = window.isUnassignedTrayOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        return;
    }

    let cS = stateIdx;
    if (cS === -1) {
        const txt = stateLabel ? stateLabel.innerText : 'ALL';
        cS = txt === 'ALL' ? 1 : (txt === 'OCC' ? 2 : (txt === 'EMP' ? 3 : 0));
    }

    const stateMap = {
        0: { lbl: 'ALL', showOcc: true, showEmp: true, showAvail: false, rot: '0deg' },
        1: { lbl: 'OCC', showOcc: true, showEmp: false, showAvail: false, rot: '-90deg' },
        2: { lbl: 'EMP', showOcc: false, showEmp: true, showAvail: false, rot: '90deg' },
        3: { lbl: 'HID', showOcc: false, showEmp: false, showAvail: true, rot: '180deg' }
    };

    const s = stateMap[cS];
    if (stateLabel) stateLabel.innerText = s.lbl;
    icon.style.transform = `rotate(${s.rot})`;

    if (availRows) {
        availRows.forEach(r => {
            r.style.display = s.showAvail ? 'grid' : 'none';
        });
    }

    rows.forEach(r => {
        const isEmpty = r.querySelectorAll('.staff-bar').length === 0;
        r.style.display = (isEmpty ? s.showEmp : s.showOcc) ? 'grid' : 'none';
    });
}

export function toggleAllGroups() {
    window.masterGroupState = ((window.masterGroupState || 0) + 1) % 4;
    const groups = new Set();
    document.querySelectorAll('.group-header').forEach(el => {
        if (el.dataset.group) groups.add(el.dataset.group);
    });
    groups.forEach(grp => toggleGroup(grp, window.masterGroupState));
}

// --- 5. Legend Drawer Controller ---
export function toggleLegendDrawer() {
    const legend = document.getElementById('calendar-legend');
    const chevron = document.getElementById('legend-toggle-chevron');
    const label = document.getElementById('legend-toggle-label');
    if (!legend) return;

    const isHidden = legend.style.display === 'none' || legend.classList.contains('hidden');
    if (isHidden) {
        legend.style.display = 'flex';
        legend.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        if (label) label.innerText = 'Hide Key';
    } else {
        legend.style.display = 'none';
        legend.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (label) label.innerText = 'Show Key';
    }
}

// --- 6. Master Calendar Assembly Engine ---
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

    const curProp = window.currentPropertyId;
    const propBookings = (window.staff || []).filter(b => {
        return b.property === curProp && b.status !== 'cancelled';
    });

    // 1. Unassigned Tray: Render if ANY unassigned booking exists
    const unassignedList = propBookings.filter(b => {
        const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
        const hasValidRoom = rList.some(r => r && r.trim() !== "");
        return !hasValidRoom || ['unconfirmed', 'charged'].includes(b.status);
    });

    if (unassignedList.length > 0) {
        const trayHeader = document.createElement('div');
        trayHeader.className = "timeline-grid mt-2 group-header cursor-pointer";
        trayHeader.dataset.group = "unassigned-tray";
        trayHeader.onclick = () => toggleGroup('unassigned-tray');
        trayHeader.innerHTML = `
            <div class="unassigned-header bg-amber-200 text-slate-800 p-1 text-[10px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30" style="grid-column: 1 / -1; min-width: 100vw;">
                <span>UNASSIGNED TRAY (${unassignedList.length})</span>
                <i data-lucide="chevron-up" id="icon-unassigned-tray" size="13"></i>
            </div>
        `;
        body.appendChild(trayHeader);

        const trayRow = document.createElement('div');
        trayRow.className = "timeline-grid bed-row bg-amber-50/40 relative group-unassigned-tray";
        trayRow.innerHTML = `<div class="border-r border-slate-400 bg-amber-100 flex items-center justify-center font-black text-[10px] text-amber-800 uppercase sticky left-0 z-20 w-[var(--sidebar-w)]">TRAY</div>`;

        for (let i = 0; i < daysToShow; i++) {
            const col = document.createElement('div');
            col.className = "day-column";
            trayRow.appendChild(col);
        }

        unassignedList.forEach(b => {
            const bar = renderReservationBar(b, daysToShow, getDayIndex, todayStr, yesterdayStr, openGuestModal, window.searchTerm || '');
            if (bar) trayRow.appendChild(bar);
        });

        body.appendChild(trayRow);
    }

    // 2. Physical Rooms Grouped by Category
    const hotelRooms = window.hotelRooms || [];
    const categoriesMap = new Map();
    hotelRooms.filter(r => !r.inactive).forEach(r => {
        const cat = r.category || r.type || 'Standard';
        if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
        categoriesMap.get(cat).push(r);
    });

    categoriesMap.forEach((roomList, catName) => {
        const grpKey = catName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

        // Category Spanning Header Row
        const hRow = document.createElement('div');
        hRow.className = "timeline-grid cursor-pointer unselectable group-header";
        hRow.dataset.group = grpKey;
        hRow.innerHTML = `
            <div class="bg-slate-800 hover:bg-slate-700 text-white border-t border-slate-600 p-0.5 text-[11px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 shadow-xs" style="grid-column: 1 / -1; min-width: 100vw;" onclick="window.toggleGroup('${grpKey}')">
                <span class="truncate pr-1">${catName} (${roomList.length})</span>
                <div class="flex items-center gap-1 shrink-0">
                    <span id="state-${grpKey}" class="text-[8px] bg-slate-600 px-1 rounded text-slate-300">ALL</span>
                    <i data-lucide="chevron-up" id="icon-${grpKey}" size="13"></i>
                </div>
            </div>
        `;
        body.appendChild(hRow);

        // Availability Row
        const aRow = renderCategoryAvailabilityRow(catName, grpKey, roomList, daysArray, propBookings, daysToShow);
        body.appendChild(aRow);

        // Bed Rows: Displays Room Name + Bed Label
        roomList.forEach(room => {
            const row = document.createElement('div');
            row.className = `timeline-grid bed-row relative group-${grpKey}`;
            
            const parsed = formatBedDisplayLabel(room.id);
            const rName = room.parentRoom || room.roomName || parsed.roomName || room.id;
            const bNum = parsed.bedNum || room.bed || '';

            row.innerHTML = `
                <div class="border-r border-slate-400 bg-slate-50 flex items-center justify-between px-2 uppercase font-black text-xs text-slate-700 sticky left-0 z-20 shadow-xs w-[var(--sidebar-w)]">
                    <span class="truncate font-black text-slate-800 text-[11px]" title="${room.id}">${rName}</span>
                    <span class="text-[10px] font-black text-indigo-600 ml-1 shrink-0 font-mono">${bNum}</span>
                </div>
            `;

            for (let i = 0; i < daysToShow; i++) {
                const col = document.createElement('div');
                const dIso = getLocalYMD(daysArray[i]);
                col.className = `day-column ${dIso === todayStr ? 'day-today' : ''}`;
                col.dataset.dateIso = dIso;
                col.dataset.dateNum = daysArray[i].getDate();

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
                const bar = renderReservationBar(b, daysToShow, getDayIndex, todayStr, yesterdayStr, openGuestModal, window.searchTerm || '');
                if (bar) row.appendChild(bar);
            });

            body.appendChild(row);
        });
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- 7. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.renderCalendar = renderCalendar;
    window.toggleGroup = toggleGroup;
    window.toggleAllGroups = toggleAllGroups;
    window.toggleLegendDrawer = toggleLegendDrawer;
    window.formatBedDisplayLabel = formatBedDisplayLabel;
    window.classifyRoomForCalendar = classifyRoomForCalendar;
}
