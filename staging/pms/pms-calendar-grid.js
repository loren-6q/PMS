// ==========================================================================
// pms/pms-calendar-grid.js - Category Dividers, Folding, Availability & Beds
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';

export function formatBedDisplayLabel(id) {
    if (!id) return '';
    const str = String(id).trim();
    if (str.includes('№')) {
        return `№ ${str.split('№')[1].trim()}`;
    }
    const m = str.match(/[_\-\s]+(\d+)$/);
    if (m) return `№ ${m[1].padStart(2, '0')}`;
    return str;
}

export function getFloorIcon(floor) {
    if (!floor) return '';
    const f = String(floor).toLowerCase().trim();
    if (f === '1' || f === 'down') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Downstairs"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    if (f === '2' || f === 'up') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Upstairs"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    if (f === '3' || f === 'double') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-purple-500 shrink-0" title="Double Floor"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>`;
    }
    return '';
}

export function getBunkIcon(bunk) {
    if (!bunk) return '';
    const b = String(bunk).toLowerCase().trim();
    if (b === 'top') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Top Bunk"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    if (b === 'bottom' || b === 'bot') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Bottom Bunk"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    return '';
}

export function buildHeaderGrids(monthsContainer, daysContainer, daysArray, todayStr) {
    if (!monthsContainer || !daysContainer) return;

    monthsContainer.innerHTML = `<div class="border-r border-slate-700 flex items-center justify-center h-full sticky left-0 z-[60] bg-slate-800 w-[var(--sidebar-w)]"></div>`;
    daysContainer.innerHTML = `
        <div class="p-1 text-[11px] font-black text-slate-500 uppercase flex items-center justify-between border-r border-slate-400 bg-slate-100 h-full sticky left-0 z-[50] w-[var(--sidebar-w)]">
            <span>ROOM</span>
            <div class="flex items-center gap-1">
                <button onclick="window.toggleAllGroups()" class="hover:text-blue-500 p-0.5 rounded cursor-pointer" title="Toggle Categories"><i data-lucide="layers" class="!w-3.5 !h-3.5"></i></button>
                <button onclick="window.toggleZoom()" class="hover:text-blue-500 p-0.5 rounded cursor-pointer" title="Zoom"><i data-lucide="zoom-in" class="!w-3.5 !h-3.5"></i></button>
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
                <div class="text-[9px] font-black text-slate-500 uppercase leading-none">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div class="text-[14px] font-black ${isToday ? 'text-blue-600' : 'text-slate-800'} leading-tight mt-0.5">${d.getDate()}</div>
            </div>
        `;
    });
}

export function toggleGroup(grp, stateIdx = -1) {
    const icon = document.getElementById(`icon-${grp}`);
    const rows = document.querySelectorAll(`.group-${grp}`);
    const stateLabel = document.getElementById(`state-${grp}`);
    const availRows = document.querySelectorAll(`.avail-row-${grp}`);
    if (!icon) return;

    if (grp === 'unassigned-tray') {
        window.isUnassignedTrayOpen = !window.isUnassignedTrayOpen;
        rows.forEach(r => r.style.display = window.isUnassignedTrayOpen ? 'grid' : 'none');
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
        availRows.forEach(r => r.style.display = s.showAvail ? 'grid' : 'none');
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

if (typeof window !== 'undefined') {
    window.toggleGroup = toggleGroup;
    window.toggleAllGroups = toggleAllGroups;
}
