// ==========================================================================
// pms/pms-calendar-grid.js - Master Calendar Assembly Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { mNames } from './pms-calendar-tape.js';
import { SVGS, renderReservationBar } from './pms-calendar-bars.js';
import { STATUS_CYCLE, isOccupyingBooking } from '../core/occupancy.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --- Master Group Accordion State ---
window.masterState = 0;

// --- State & Config Accessors ---
const getStaff = () => window.staff || (window.getStaff ? window.getStaff() : []);
const getHotelRooms = () => window.hotelRooms || (window.getHotelRooms ? window.getHotelRooms() : []);
const getPropId = () => {
    const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
    return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
};
const getFmpDates = () => window.fmpDates || [];
const getSearchTerm = () => (window.getSearchTerm ? window.getSearchTerm() : window.searchTerm) || "";
const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

// --------------------------------------------------------------------------
// 1. TIMELINE GROUPING & CATEGORY ACCORDION CONTROLLERS
// --------------------------------------------------------------------------

// --- Master Toggle All Room Categories ---
export const toggleAllGroups = () => {
    window.masterState = ((window.masterState || 0) + 1) % 4;
    const g = new Set();
    $$('.group-header').forEach(el => { if (el.dataset.group) g.add(el.dataset.group); });
    g.forEach(grp => window.toggleGroup(grp, window.masterState));
};

// --- Category Accordion State Switcher ---
export const toggleGroup = (grp, stateIdx = -1) => {
    const h = $(`icon-${grp}`);
    const rws = $$(`.group-${grp}`);
    const sL = $(`state-${grp}`);
    const aR = $$(`.avail-row-${grp}`);
    if (!h) return;

    // Dedicated Unassigned Tray Accordion Toggle
    if (grp === 'unassigned-unconfirmed') {
        window.isUnassignedTrayOpen = !window.isUnassignedTrayOpen;
        rws.forEach(r => {
            r.style.display = window.isUnassignedTrayOpen ? 'grid' : 'none';
        });
        h.style.transform = window.isUnassignedTrayOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        return;
    }

    let cS = stateIdx;
    if (cS === -1) {
        const txt = sL ? sL.innerText : 'ALL';
        cS = txt === 'ALL' ? 1 : (txt === 'OCC' ? 2 : (txt === 'EMP' ? 3 : 0));
    }
    const vM = {
        0: { lbl: 'ALL', showOcc: true, showEmp: true, showAvail: false, rot: '0deg' },
        1: { lbl: 'OCC', showOcc: true, showEmp: false, showAvail: false, rot: '-90deg' },
        2: { lbl: 'EMP', showOcc: false, showEmp: true, showAvail: false, rot: '90deg' },
        3: { lbl: 'HID', showOcc: false, showEmp: false, showAvail: true, rot: '180deg' }
    };
    const s = vM[cS];
    if (sL) sL.innerText = s.lbl;
    h.style.transform = `rotate(${s.rot})`;
    if (aR) aR.forEach(r => { r.style.display = s.showAvail ? 'grid' : 'none'; });
    rws.forEach(r => {
        if (r.classList.contains('sub-header-row')) {
            r.style.display = (cS === 3) ? 'none' : 'grid';
            return;
        }
        const isE = r.querySelectorAll('.staff-bar').length === 0;
        r.style.display = (isE ? s.showEmp : s.showOcc) ? 'grid' : 'none';
    });
};

// --------------------------------------------------------------------------
// 2. ROOM CLASSIFICATION, LABELS & ICON FORMATTERS
// --------------------------------------------------------------------------

export const getFloorIcon = f => {
    if (!f) return '';
    const fStr = String(f).toLowerCase().trim();
    if (fStr === '1' || fStr === 'down' || fStr === 'downstairs' || fStr === 'floor-down') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Downstairs"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    if (fStr === '2' || fStr === 'up' || fStr === 'upstairs' || fStr === 'floor-up') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Upstairs"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    if (fStr === '3' || fStr === 'double') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 shrink-0" title="Double Floor"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>`;
    }
    return '';
};

export const getBunkIcon = b => {
    if (!b) return '';
    const bStr = String(b).toLowerCase().trim();
    if (bStr === 'bottom' || bStr === 'bot' || bStr === 'bunk-bottom' || bStr.includes('btm') || bStr.includes('bottom')) {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Bottom Bunk"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
    }
    if (bStr === 'top' || bStr === 'bunk-top' || bStr.includes('top')) {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0" title="Top Bunk"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
    }
    return '';
};

export const classifyRoomForCalendar = r => {
    const cat = (r.category || r.type || '').toLowerCase();
    const bunk = (r.bunk || r.bed || '').toLowerCase();
    
    const isPrivate = bunk.includes('private') || 
                      cat.includes('private') || 
                      r.rule === 'private' || 
                      r.isDorm === false;

    const isDorm = !isPrivate && (
        r.isDorm === true ||
        (r.rule && r.rule !== 'private') ||
        cat.includes('dorm') ||
        bunk.includes('top') ||
        bunk.includes('bottom') ||
        bunk.includes('bot') ||
        (r.parentRoom && r.parentRoom !== r.id)
    );

    let baseRoom = '';
    if (isDorm) {
        if (r.parentRoom && r.parentRoom !== r.id) {
            baseRoom = r.parentRoom;
        } else if ((r.id || '').includes('№')) {
            baseRoom = r.id.split('№')[0].trim();
        } else if ((r.id || '').includes('-')) {
            baseRoom = r.id.split('-')[0].trim();
        } else {
            baseRoom = (r.id || '').replace(/\d+$/, '').trim();
        }
    }

    return { isDorm, baseRoom };
};

export const formatBedDisplayLabel = id => {
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
};

export const matchesRoom = (assignedRoom, targetRoomId) => {
    if (!assignedRoom || !targetRoomId) return false;
    if (String(assignedRoom).trim() === String(targetRoomId).trim()) return true;
    const cleanA = String(assignedRoom).replace(/[№#\-_:\s]/g, '').toUpperCase();
    const cleanB = String(targetRoomId).replace(/[№#\-_:\s]/g, '').toUpperCase();
    return cleanA === cleanB;
};

// --------------------------------------------------------------------------
// 3. MASTER CALENDAR ASSEMBLY & TIMELINE GRID RENDERER
// --------------------------------------------------------------------------

export const render = () => {
    if (!window.viewStart) {
        window.viewStart = new Date();
        window.viewStart.setDate(window.viewStart.getDate() - 3);
        window.viewStart.setHours(12, 0, 0, 0);
    }

    const vS = window.viewStart;
    const w = window.innerWidth;
    const dShow = w >= 1150 ? 35 : w >= 950 ? 28 : w >= 650 ? 21 : 14;
    document.documentElement.style.setProperty('--days', dShow);

    const mOpts = (() => {
        let h = '<option value="">ALL DATES</option>';
        const d = new Date(vS.getFullYear(), vS.getMonth() - 2, 1);
        for (let i = 0; i < 36; i++) {
            h += `<option value="${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}">${mNames[d.getMonth()]} ${d.getFullYear()}</option>`;
            d.setMonth(d.getMonth() + 1);
        }
        return h;
    })();

    const jm = $('jump-month-select');
    if (jm) {
        if (jm.options.length < 2) jm.innerHTML = mOpts;
        jm.value = `${vS.getFullYear()}-${String(vS.getMonth() + 1).padStart(2, '0')}`;
    }

    const mGrid = $('calendar-header-months');
    const dGrid = $('calendar-header-days');
    const body = $('timeline-body');
    if (!mGrid || !dGrid || !body) return;

    mGrid.innerHTML = `<div class="border-r border-slate-700 flex items-center justify-center h-full sticky left-0 z-[60] bg-slate-800 w-[var(--sidebar-w)]"></div>`;
    dGrid.innerHTML = `<div class="p-1 text-[12px] font-black text-slate-500 uppercase flex items-center justify-between border-r border-slate-400 bg-slate-100 h-full sticky left-0 z-[50] w-[var(--sidebar-w)]"><span>ROOM</span><div class="flex items-center gap-1"><button onclick="window.toggleAllGroups()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Master Toggle"><i data-lucide="layers" class="!w-[13px] !h-[13px]"></i></button><button onclick="window.toggleZoom()" class="hover:text-blue-500 transition-colors bg-slate-200 hover:bg-slate-300 p-0.5 rounded shadow-sm cursor-pointer" title="Toggle Zoom"><i data-lucide="zoom-in" class="!w-[13px] !h-[13px]"></i></button></div></div>`;
    body.innerHTML = '';

    const days = Array.from({ length: dShow }, (_, i) => new Date(vS.getFullYear(), vS.getMonth(), vS.getDate() + i, 12, 0, 0));
    let cMon = -1;
    let cSpan = 0;
    days.forEach((d, i) => {
        if (d.getMonth() !== cMon) {
            if (cMon !== -1) {
                mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${days[i - 1].getFullYear()}</div>`;
            }
            cMon = d.getMonth();
            cSpan = 1;
        } else {
            cSpan++;
        }
        if (i === days.length - 1) {
            mGrid.innerHTML += `<div style="grid-column: span ${cSpan}" class="unselectable flex items-center justify-center month-divider py-1 border-b border-slate-700 text-white text-[11px] font-bold uppercase tracking-widest">${mNames[cMon]} ${d.getFullYear()}</div>`;
        }
    });

    const todayStr = window.getLocalYMD ? window.getLocalYMD(new Date()) : '';
    const yD = new Date();
    yD.setDate(new Date().getDate() - 1);
    const yStr = window.getLocalYMD ? window.getLocalYMD(yD) : '';

    days.forEach(d => {
        const iT = (window.getLocalYMD ? window.getLocalYMD(d) : '') === todayStr;
        dGrid.innerHTML += `<div class="flex flex-col items-center justify-center border-r border-slate-400 ${iT ? 'bg-blue-100' : ''}"><div class="text-[10px] font-black text-slate-500 uppercase leading-none">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="text-[16px] font-black ${iT ? 'text-blue-600' : 'text-slate-800'} leading-tight">${d.getDate()}</div></div>`;
    });

    const curProp = getPropId();
    let hotelRooms = [...getHotelRooms()];
    const fmpDates = getFmpDates();
    const searchTerm = getSearchTerm();

    const actStaff = getStaff().filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return false;
        if (s.status === 'cancelled') {
            if (searchTerm && (((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(searchTerm) || (s.bookId || '').toUpperCase().includes(searchTerm))) {
                return true;
            }
            return false;
        }
        return true;
    });

    const vsUTC = window.parseYMD ? window.parseYMD(window.getLocalYMD(vS)) : 0;
    const veUTC = vsUTC + dShow * 86400000;
    const tRows = [];
    const uConf = [];

    actStaff.forEach(s => {
        if (s.status === 'cancelled') return;
        const rList = getRooms(s).filter(Boolean);
        const isUnassignedStatus = ['unconfirmed', 'charged', 'to-charge', 'tocharge', 'no-show', 'noshow', 'vol'].includes(s.status);
        const hasAssignedRoom = rList.length > 0 && rList[0] !== "" && rList.some(rName => hotelRooms.some(hr => matchesRoom(rName, hr.id)));
        const isUnassigned = isUnassignedStatus || !hasAssignedRoom;

        if (isUnassigned && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC) {
            uConf.push(s);
        }
    });

    if (window.isUnassignedTrayOpen === undefined) {
        window.isUnassignedTrayOpen = true;
    }

    if (uConf.length > 0) {
        tRows.push({ isDivider: true, label: "UNASSIGNED / UNCONFIRMED", isUnconfirmedZone: true });
        const rows = [];
        uConf.forEach(s => {
            let p = false;
            for (let r of rows) {
                if (!r.some(e => window.parseYMD(s.checkIn) < window.parseYMD(e.checkOut) && window.parseYMD(e.checkIn) < window.parseYMD(s.checkOut))) {
                    r.push(s);
                    p = true;
                    break;
                }
            }
            if (!p) rows.push([s]);
        });
        rows.forEach((r, idx) => tRows.push({ isUnassigned: true, label: `U-${idx + 1}`, bookings: r }));
    }

    const activeHotelRooms = hotelRooms.filter(r => !r.inactive);
    const archivedHotelRooms = hotelRooms.filter(r => {
        if (!r.inactive) return false;
        return actStaff.some(s => {
            if (s.status === 'cancelled' || s.status === 'no-show') return false;
            const inMs = window.parseYMD(s.checkIn);
            const outMs = window.parseYMD(s.checkOut);
            if (inMs > veUTC || outMs < vsUTC) return false;
            const rList = getRooms(s);
            return rList.some(rm => matchesRoom(rm, r.id));
        });
    });

    const categoriesMap = new Map();
    activeHotelRooms.forEach(r => {
        const cat = r.category || r.type || 'ROOMS';
        if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
        categoriesMap.get(cat).push(r);
    });

    categoriesMap.forEach((roomList, catName) => {
        tRows.push({ isDivider: true, label: catName });

        let lastBaseRoom = null;
        roomList.forEach(r => {
            const { isDorm, baseRoom } = classifyRoomForCalendar(r);

            const isAssignedToThisRoom = s => {
                if (['unconfirmed', 'charged', 'to-charge', 'tocharge', 'no-show', 'noshow', 'vol', 'cancelled'].includes(s.status)) return false;
                const rList = getRooms(s);
                return rList.some(rm => matchesRoom(rm, r.id)) && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC;
            };

            if (isDorm) {
                if (baseRoom && baseRoom !== lastBaseRoom) {
                    tRows.push({ isSubHeader: true, label: baseRoom, floor: r.floor });
                    lastBaseRoom = baseRoom;
                }

                tRows.push({
                    isRoom: true,
                    isBed: true,
                    id: r.id,
                    displayId: formatBedDisplayLabel(r.id),
                    type: catName,
                    bed: r.bed || r.bunk || '',
                    floor: '',
                    icon: r.icon || r.bunk || '',
                    bookings: actStaff.filter(isAssignedToThisRoom)
                });
            } else {
                lastBaseRoom = null;
                tRows.push({
                    isRoom: true,
                    isPrivate: true,
                    id: r.id,
                    displayId: r.name || r.id,
                    type: catName,
                    bed: r.bed || r.bunk || '',
                    floor: r.floor,
                    icon: r.icon || r.bunk || '',
                    bookings: actStaff.filter(isAssignedToThisRoom)
                });
            }
        });
    });

    if (archivedHotelRooms.length > 0) {
        tRows.push({ isDivider: true, label: "ARCHIVED / CLOSED ROOMS (PAST DATA)", isArchivedZone: true });
        archivedHotelRooms.forEach(r => {
            const isAssigned = s => {
                const rList = getRooms(s);
                return rList.some(rm => matchesRoom(rm, r.id)) && isOccupyingBooking(s.status, true) && window.parseYMD(s.checkIn) <= veUTC && window.parseYMD(s.checkOut) >= vsUTC;
            };

            tRows.push({
                isRoom: true,
                isArchived: true,
                id: r.id,
                displayId: `[CLOSED] ${r.id}`,
                type: r.type,
                bed: r.bed || '',
                floor: r.floor,
                bookings: actStaff.filter(isAssigned)
            });
        });
    }

    const tt = $('custom-tooltip');
    let cGrp = '';

    tRows.forEach(rD => {
        if (rD.isDivider) {
            cGrp = (rD.label || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
            const hRow = document.createElement('div');
            hRow.className = `timeline-grid ${rD.isUnconfirmedZone ? 'mt-4' : ''} cursor-pointer transition-colors unselectable group-header`;
            hRow.dataset.group = cGrp;

            if (rD.isUnconfirmedZone) {
                hRow.innerHTML = `<div class="unassigned-header bg-amber-200 hover:bg-amber-300 text-slate-800 p-0.5 text-[10px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-md" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;" onclick="window.toggleGroup('${cGrp}')"><span>${rD.label}</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}" style="transform: ${window.isUnassignedTrayOpen ? 'rotate(0deg)' : 'rotate(180deg)'};"></i></div>`;
                body.appendChild(hRow);
                return;
            }

            hRow.innerHTML = `<div class="bg-slate-800 hover:bg-slate-700 text-white border-t border-slate-600 p-0.5 text-[11px] font-black uppercase flex items-center justify-between px-2 sticky left-0 z-30 transition-colors shadow-[2px_0_4px_rgba(0,0,0,0.1)]" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;" onclick="window.toggleGroup('${cGrp}')"><span class="truncate pr-1">${rD.label}</span><div class="flex items-center gap-1 shrink-0"><span id="state-${cGrp}" class="text-[8px] bg-slate-600 px-1 rounded text-slate-300">ALL</span><i data-lucide="chevron-up" class="transition-transform duration-200 !w-[13px] !h-[13px]" id="icon-${cGrp}"></i></div></div>`;
            body.appendChild(hRow);

            const tRIds = hotelRooms.filter(hr => (hr.category || hr.type) === rD.label && !hr.inactive).map(hr => hr.id);
            const cap = tRIds.length;
            const aRow = document.createElement('div');
            aRow.className = `timeline-grid avail-row-${cGrp} h-[20px]`;
            aRow.style.display = 'none';

            let cHtml = `<div class="bg-slate-900 border-r border-slate-700 flex items-center justify-end pr-2 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] w-[var(--sidebar-w)] text-[9px] text-slate-400 font-black uppercase tracking-widest unselectable">AVAIL &rarr;</div>`;
            for (let i = 0; i < dShow; i++) {
                const dT = days[i].getTime();
                const occ = new Set();
                actStaff.forEach(s => {
                    if (!isOccupyingBooking(s.status, true)) return;
                    if (dT >= window.parseYMD(s.checkIn) && dT < window.parseYMD(s.checkOut)) {
                        getRooms(s).forEach(r => {
                            const uiR = window.dbToUiRoom ? window.dbToUiRoom(r) : r;
                            if (r && (tRIds.some(tId => matchesRoom(r, tId)) || tRIds.some(tId => matchesRoom(uiR, tId)))) occ.add(uiR || r);
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
            body.appendChild(aRow);
            return;
        }

        if (rD.isSubHeader) {
            const sRow = document.createElement('div');
            sRow.className = `timeline-grid group-${cGrp} sub-header-row h-[22px]`;
            const cleanSubLabel = rD.label || '';
            sRow.innerHTML = `
                <div class="bg-slate-200 border-y border-slate-300 flex items-center px-2 sticky left-0 z-20 shadow-sm unselectable" style="grid-column: 1 / -1; width: fit-content; min-width: 100vw; height: 100%;">
                    <div class="flex items-center gap-1 sticky left-0 bg-slate-200 pr-2">
                        <span class="text-[11px] font-black text-slate-700 uppercase tracking-widest">${cleanSubLabel}</span>
                        ${getFloorIcon(rD.floor)}
                    </div>
                </div>`;
            body.appendChild(sRow);
            return;
        }

        const row = document.createElement('div');
        row.className = `timeline-grid bed-row group-${cGrp} ${rD.isArchived ? 'opacity-60 bg-slate-100' : ''}`;
        if (cGrp === 'unassigned-unconfirmed') {
            const hasMatch = searchTerm && rD.bookings && rD.bookings.some(s =>
                ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(searchTerm) ||
                (s.bookId || '').toUpperCase().includes(searchTerm)
            );
            row.style.display = (window.isUnassignedTrayOpen || hasMatch) ? 'grid' : 'none';
        }

        let hHtml = '';
        if (rD.isUnassigned) {
            hHtml = `<span class="text-[11px] font-black text-amber-700">${rD.label}</span>`;
        } else if (rD.isBed) {
            hHtml = `
                <div class="flex items-center justify-between px-1 w-full gap-1 pl-3">
                    <div class="flex items-center gap-0.5 shrink-0">
                        <span class="text-[12px] font-bold text-slate-600">${rD.displayId}</span>
                        ${getBunkIcon(rD.icon)}
                    </div>
                    <span class="text-[9px] font-bold text-slate-500 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' ? '' : (rD.bed || '')}</span>
                </div>`;
        } else {
            hHtml = `
                <div class="flex items-center justify-between px-1 w-full gap-1">
                    <div class="flex items-center gap-0.5 shrink-0">
                        <span class="text-[13px] font-black text-slate-700">${rD.displayId}</span>
                        ${getFloorIcon(rD.floor)}
                        ${getBunkIcon(rD.icon)}
                    </div>
                    <span class="text-[10px] font-bold text-slate-600 tracking-tighter truncate">${(rD.bed || '').toUpperCase() === 'SINGLE' || (rD.bed || '').toUpperCase() === 'PRIVATE' ? '' : (rD.bed || '')}</span>
                </div>`;
        }

        row.innerHTML = `<div class="border-r border-slate-400 ${rD.isUnassigned ? 'bg-amber-100' : 'bg-slate-50'} flex items-center justify-center uppercase overflow-hidden shrink-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.05)] unselectable w-[var(--sidebar-w)]">${hHtml}</div>`;

        for (let i = 0; i < dShow; i++) {
            const c = document.createElement('div');
            const iT = (window.getLocalYMD ? window.getLocalYMD(days[i]) : '') === todayStr;
            let fmpShade = '';
            const dMs = days[i].getTime();
            for (let f of fmpDates) {
                const diff = Math.round((dMs - new Date(f + "T12:00:00").getTime()) / 86400000);
                if (diff === 0) { fmpShade = 'day-fmp-dark'; break; }
                if (diff >= -2 && diff <= 2) { fmpShade = 'day-fmp-medium'; break; }
            }
            c.className = `day-column ${fmpShade} ${iT ? 'day-today' : ''} ${rD.isUnassigned ? 'bg-amber-50/50' : ''}`;
            c.dataset.colIndex = i;
            c.dataset.dateNum = days[i].getDate();
            c.dataset.dateIso = window.getLocalYMD ? window.getLocalYMD(days[i]) : '';
            c.dataset.roomId = rD.isUnassigned ? "" : (rD.id || "");
            row.appendChild(c);
        }

        rD.bookings.forEach(s => {
            const bar = renderReservationBar(s, dShow, todayStr, yStr, searchTerm, tt);
            if (bar) row.appendChild(bar);
        });
        body.appendChild(row);
    });

    if (window.masterState && window.masterState !== 0) {
        const g = new Set();
        $$('.group-header').forEach(el => { if (el.dataset.group) g.add(el.dataset.group); });
        g.forEach(grp => window.toggleGroup(grp, window.masterState));
    }

    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// 4. CALENDAR LEGEND DRAWER & VECTOR KEY CONTROLLERS
// --------------------------------------------------------------------------

export const toggleLegendDrawer = () => {
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
    if (window.lucide) window.lucide.createIcons();
};

// --- Mount SVG Icons and Canonical Status Pills into Legend Drawer ---
export const mountLegendSvgs = () => {
    // 1. Mount Status Pills from Canonical Palette
    const pillContainer = document.getElementById('legend-status-pills');
    if (pillContainer) {
        pillContainer.innerHTML = STATUS_CYCLE.map(s => 
            `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-xs select-text ${s.strike ? 'line-through' : ''}" style="background:${s.bg}; color:${s.txt}; border: 1px solid ${s.border};">${s.label}</span>`
        ).join('');
    }

    // 2. Mount SVGs
    if (!SVGS) return false;
    const keys = ['upFree', 'upPaid', 'ext', 'link', 'mailConf', 'mailNotFmp', 'mailPre', 'mailPreConf', 'mailSpec', 'fbGood', 'fbBad'];
    keys.forEach(k => {
        const el = document.getElementById('leg-svg-' + k);
        if (el && SVGS[k]) {
            el.innerHTML = SVGS[k];
        }
    });
    return true;
};

// --------------------------------------------------------------------------
// 5. GLOBAL WINDOW EXPORTS & AUTO-BOOTSTRAPPER
// --------------------------------------------------------------------------

window.render = render;
window.toggleAllGroups = toggleAllGroups;
window.toggleGroup = toggleGroup;
window.toggleLegendDrawer = toggleLegendDrawer;
window.toggleMobileLegend = toggleLegendDrawer;
window.mountLegendSvgs = mountLegendSvgs;
window.classifyRoomForCalendar = classifyRoomForCalendar;
window.formatBedDisplayLabel = formatBedDisplayLabel;
window.matchesRoom = matchesRoom;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        mountLegendSvgs();
        render();
    });
} else {
    mountLegendSvgs();
    setTimeout(() => render(), 0);
}
