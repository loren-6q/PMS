// ==========================================================================
// pms/pms-calendar-grid.js - Category Dividers, Folding, Availability & Beds
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';

// --- 1. Bed Display & Architecture Icon Formatters ---
export function formatBedDisplayLabel(id) {
    if (!id) return '';
    const str = String(id).trim();
    if (str.includes('№')) {
        const numPart = str.split('№')[1].trim();
        return `№ ${numPart}`;
    }
    const m = str.match(/[_\-\s]+(\d+)$/);
    if (m) return `№ ${m[1].padStart(2, '0')}`;
    const mLetter = str.match(/^[A-Za-z]+(\d+)$/);
    if (mLetter) return `№ ${mLetter[1].padStart(2, '0')}`;
    return str;
}

export function getFloorIcon(floor) {
    if (!floor) return '';
    const f = String(floor).toLowerCase().trim();
    if (f === '1' || f === 'down' || f === 'downstairs' || f === 'floor-down') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Downstairs"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    if (f === '2' || f === 'up' || f === 'upstairs' || f === 'floor-up') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Upstairs"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    if (f === '3' || f === 'double') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Double Floor"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>`;
    }
    return '';
}

export function getBunkIcon(bunk) {
    if (!bunk) return '';
    const b = String(bunk).toLowerCase().trim();
    if (b === 'bottom' || b === 'bot' || b === 'bunk-bottom' || b.includes('btm') || b.includes('bottom')) {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Bottom Bunk"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    if (b === 'top' || b === 'bunk-top' || b.includes('top')) {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Top Bunk"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    return '';
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
                <button onclick="window.toggleAllGroups()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-xs cursor-pointer" title="Master Toggle"><i data-lucide="layers" class="!w-[13px] !h-[13px]"></i></button>
                <button onclick="window.toggleZoom()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-xs cursor-pointer" title="Toggle Zoom"><i data-lucide="zoom-in" class="!w-[13px] !h-[13px]"></i></button>
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

// --- 3. Dynamic Category Availability Calculation & Thermal Tiers ---
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

    if (grp === 'unassigned-unconfirmed' || grp === 'unassigned-tray') {
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
        if (r.classList.contains('sub-header-row')) {
            r.style.display = (cS === 3) ? 'none' : 'grid';
            return;
        }
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

export function toggleLegendDrawer() {
    const leg = document.getElementById('calendar-legend');
    const chevron = document.getElementById('legend-toggle-chevron');
    const label = document.getElementById('legend-toggle-label');
    if (!leg) return;

    const isHidden = (leg.style.display === 'none' || leg.classList.contains('hidden'));
    if (isHidden) {
        leg.style.display = 'flex';
        leg.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        if (label) label.innerText = 'Hide Key';
    } else {
        leg.style.display = 'none';
        leg.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (label) label.innerText = 'Show Key';
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

export function mountLegendSvgs(svgSuite) {
    const keys = ['upFree', 'upPaid', 'ext', 'link', 'mailConf', 'mailNotFmp', 'mailPre', 'mailPreConf', 'mailSpec', 'fbGood', 'fbBad'];
    keys.forEach(k => {
        const el = document.getElementById('leg-svg-' + k);
        if (el && svgSuite && svgSuite[k]) {
            el.innerHTML = svgSuite[k];
        }
    });
}

// --- 5. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.toggleGroup = toggleGroup;
    window.toggleAllGroups = toggleAllGroups;
    window.toggleLegendDrawer = toggleLegendDrawer;
    window.toggleMobileLegend = toggleLegendDrawer;
    window.mountLegendSvgs = () => mountLegendSvgs(window.SVGS);
    window.formatBedDisplayLabel = formatBedDisplayLabel;
    window.classifyRoomForCalendar = classifyRoomForCalendar;
    window.renderCategoryAvailabilityRow = renderCategoryAvailabilityRow;
}
