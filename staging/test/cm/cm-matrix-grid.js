// ==========================================================================
// cm/cm-matrix-grid.js - Dense Rate Matrix Grid & Cell Controller
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { isOccupyingBooking } from '../core/occupancy.js';
import { rippleDay, computeDynamicPlanRate, getNearestEvent } from './cm-ripple.js';

export let drillLevel = 'room'; // 'master' | 'room' | 'event' | 'rates'
export let viewDensity = 'full'; // 'avail' | 'price' | 'compact' | 'minmax' | 'full'
export let channelPreviewFilter = 'ALL';
export const expandedRooms = new Set();
export const daysToRender = 42;

export function formatMinStayInput(val) {
    if (!val) return "";
    const clean = String(val).trim();
    if (!clean || clean === "-") return "";
    if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
        const match = clean.match(/(\d+)/);
        return match ? `${match[1]}▸` : clean;
    }
    const match = clean.match(/(\d+)/);
    return match ? match[1] : clean;
}

export function calculateLiveInventory() {
    window.liveInventory = window.liveInventory || {};
    const curProp = window.currentPropertyId;
    const staffList = window.staff || [];
    const roomTypes = window.roomTypes || [];
    const totalRoomsByType = window.totalRoomsByType || {};

    const startInput = document.getElementById('tape-start')?.value || getLocalYMD(new Date());
    const startMs = parseYMD(startInput) || Date.now();

    for (let i = -7; i < 90; i++) {
        const curD = new Date(startMs + (i * 86400000));
        const dStr = getLocalYMD(curD);
        window.liveInventory[dStr] = window.liveInventory[dStr] || {};

        const occupied = {};
        roomTypes.forEach(rt => { occupied[rt] = 0; });

        if (Array.isArray(staffList)) {
            for (let j = 0; j < staffList.length; j++) {
                const s = staffList[j];
                if (!s) continue;

                const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                if (sProp && curProp && sProp !== curProp) continue;

                const rList = s.rooms?.length ? s.rooms : (s.room ? [s.room] : []);
                const isUnassigned = rList.length === 0 || rList[0] === "";

                if (typeof isOccupyingBooking === 'function' && !isOccupyingBooking(s.status, isUnassigned)) continue;

                const cIn = s.checkIn;
                const cOut = s.checkOut;

                if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                    let cat = null;
                    if (!isUnassigned && rList.length > 0) {
                        const hRoom = (window.hotelRooms || []).find(hr => hr.id === rList[0]);
                        if (hRoom && hRoom.type) cat = hRoom.type;
                    }
                    if (!cat) cat = s.bookedType || s.category || s.roomType;

                    if (cat) {
                        const matchedRt = roomTypes.find(rt => rt.toLowerCase() === cat.toLowerCase());
                        if (matchedRt) {
                            if (matchedRt.toLowerCase().includes('dorm')) {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + parseInt(s.pax || s.bedCount || 1, 10);
                            } else {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + Math.max(1, rList.length);
                            }
                        }
                    }
                }
            }
        }

        roomTypes.forEach(rt => {
            const cap = totalRoomsByType[rt] || 1;
            const occ = occupied[rt] || 0;
            window.liveInventory[dStr][rt] = Math.max(0, cap - occ);
        });
    }
}

export function handleAvailEdit(dateStr, room, val) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    if (val === "" || isNaN(parseInt(val, 10))) {
        delete window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`];
    } else {
        window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`] = parseInt(val, 10);
    }
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleCellPriceChange(e, dateStr, room) {
    const input = e ? (e.target || e) : null;
    if (!input) return;
    const val = String(input.value || '').trim();

    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    if (rData._syncedStd === undefined && rData.std !== undefined && rData.std !== "") {
        rData._syncedStd = rData.std;
    }

    if (val === "" || isNaN(parseFloat(val))) {
        delete rData.isOverride.std;
        if (rData._syncedStd !== undefined && rData._syncedStd !== "" && !isNaN(rData._syncedStd)) {
            rData.std = rData._syncedStd;
        } else {
            delete rData.std;
        }

        if (window.editMode === 'ripple') {
            const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor));
            anchors.forEach(a => { if (a && a !== 'unlinked') rippleDay(dateStr, a, true); });
        }
    } else {
        rData.std = roundCurrency(parseFloat(val));
        rData.isOverride.std = true;

        if (window.editMode === 'ripple') {
            rippleDay(dateStr, room, true);
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleCellEdit(dateStr, room, field, val, isEvt = false) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    const pfx = isEvt ? 'evt_' : '';

    if (field === 'min_hybrid') {
        const clean = String(val).trim();
        if (!clean || clean === "-" || clean === "0") {
            delete rData[`${pfx}min`];
            delete rData[`${pfx}min_arr`];
            delete rData.isOverride[`${pfx}min`];
            delete rData.isOverride[`${pfx}min_arr`];
        } else if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
            const match = clean.match(/(\d+)/);
            rData[`${pfx}min_arr`] = match ? parseInt(match[1], 10) : "";
            delete rData[`${pfx}min`];
            rData.isOverride[`${pfx}min_arr`] = true;
            delete rData.isOverride[`${pfx}min`];
        } else {
            const match = clean.match(/(\d+)/);
            rData[`${pfx}min`] = match ? parseInt(match[1], 10) : "";
            delete rData[`${pfx}min_arr`];
            rData.isOverride[`${pfx}min`] = true;
            delete rData.isOverride[`${pfx}min_arr`];
        }
    } else if (field === 'max') {
        if (!val || val === "-") {
            delete rData[`${pfx}max`];
            delete rData.isOverride[`${pfx}max`];
        } else {
            rData[`${pfx}max`] = parseInt(val, 10);
            rData.isOverride[`${pfx}max`] = true;
        }
    } else if (field === 'fmp') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete rData.fmp;
            delete rData.isOverride.fmp;
        } else {
            rData.fmp = roundCurrency(parseFloat(val));
            rData.isOverride.fmp = true;
        }
    } else if (field === 'fmp_ref') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete rData.fmp_ref;
            delete rData.isOverride.fmp_ref;
        } else {
            rData.fmp_ref = roundCurrency(parseFloat(val));
            rData.isOverride.fmp_ref = true;
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleOtaEdit(dateStr, ratePlanId, room, ruleType, ruleVal, field, val, rateSource = 'std') {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    const overrides = window.masterPricing.timeline[dateStr].otaOverrides;

    if (field === 'rate') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete overrides[ratePlanId];
        } else {
            overrides[ratePlanId] = roundCurrency(parseFloat(val));
        }
    } else if (field === 'min') {
        if (val === "" || val === "-") delete overrides[`${ratePlanId}_min`];
        else overrides[`${ratePlanId}_min`] = parseInt(val, 10);
    } else if (field === 'max') {
        if (val === "" || val === "-") delete overrides[`${ratePlanId}_max`];
        else overrides[`${ratePlanId}_max`] = parseInt(val, 10);
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function cycleUnifiedRestriction(dateStr, room, ratePlanId = null, isEvt = false) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];

    if (ratePlanId) {
        dObj.otaOverrides = dObj.otaOverrides || {};
        const cta = !!dObj.otaOverrides[`${ratePlanId}_cta`];
        const ctd = !!dObj.otaOverrides[`${ratePlanId}_ctd`];
        const stop = !!dObj.otaOverrides[`${ratePlanId}_stop`];

        if (!cta && !ctd && !stop) {
            dObj.otaOverrides[`${ratePlanId}_cta`] = true;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (cta && !ctd && !stop) {
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = true;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (!cta && ctd && !stop) {
            dObj.otaOverrides[`${ratePlanId}_cta`] = true;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = true;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        } else if (cta && ctd && !stop) {
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = true;
        } else {
            dObj.otaOverrides[`${ratePlanId}_cta`] = false;
            dObj.otaOverrides[`${ratePlanId}_ctd`] = false;
            dObj.otaOverrides[`${ratePlanId}_stop`] = false;
        }
    } else {
        dObj[room] = dObj[room] || { isOverride: {} };
        const rData = dObj[room];
        rData.isOverride = rData.isOverride || {};
        const pfx = isEvt ? 'evt_' : '';

        const cta = isEvt ? !!rData.evt_cta : !!rData.cta;
        const ctd = isEvt ? !!rData.evt_ctd : !!rData.ctd;
        const stop = isEvt ? !!(rData.evt_stop || rData.evt_stopSell) : !!(rData.stop || rData.stopSell);

        if (!cta && !ctd && !stop) {
            rData[`${pfx}cta`] = true; rData[`${pfx}ctd`] = false; rData[`${pfx}stop`] = false;
            rData.isOverride[`${pfx}cta`] = true;
        } else if (cta && !ctd && !stop) {
            rData[`${pfx}cta`] = false; rData[`${pfx}ctd`] = true; rData[`${pfx}stop`] = false;
            rData.isOverride[`${pfx}ctd`] = true;
        } else if (!cta && ctd && !stop) {
            rData[`${pfx}cta`] = true; rData[`${pfx}ctd`] = true; rData[`${pfx}stop`] = false;
            rData.isOverride[`${pfx}cta`] = true; rData.isOverride[`${pfx}ctd`] = true;
        } else if (cta && ctd && !stop) {
            rData[`${pfx}cta`] = false; rData[`${pfx}ctd`] = false; rData[`${pfx}stop`] = true;
            rData.isOverride[`${pfx}stop`] = true;
        } else {
            rData[`${pfx}cta`] = false; rData[`${pfx}ctd`] = false; rData[`${pfx}stop`] = false;
            delete rData.isOverride[`${pfx}cta`]; delete rData.isOverride[`${pfx}ctd`]; delete rData.isOverride[`${pfx}stop`];
        }
    }

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function getUnifiedRestrictionBadgeHtml(cta, ctd, stop) {
    if (stop) return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-rose-600 text-white leading-none">STOP</span>';
    if (cta && ctd) return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-purple-200 text-purple-900 leading-none">CTB</span>';
    if (cta) return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-amber-200 text-amber-900 leading-none">CTA</span>';
    if (ctd) return '<span class="w-full text-center py-0.2 rounded text-[8px] font-black bg-sky-200 text-sky-900 leading-none">CTD</span>';
    return '<span class="w-1.5 h-1.5 rounded-full bg-slate-300 hover:bg-slate-400 inline-block transition-colors"></span>';
}

export function unlockCellOverride(dateStr, room, ratePlanId = null) {
    if (ratePlanId) {
        if (window.masterPricing.timeline[dateStr]?.otaOverrides) {
            delete window.masterPricing.timeline[dateStr].otaOverrides[ratePlanId];
        }
    } else {
        const rData = window.masterPricing.timeline[dateStr]?.[room];
        if (rData) {
            if (rData.isOverride) {
                delete rData.isOverride.std;
                delete rData.isOverride.fmp;
            }
            if (rData._syncedStd !== undefined && rData._syncedStd !== "" && !isNaN(rData._syncedStd)) {
                rData.std = rData._syncedStd;
            } else {
                delete rData.std;
            }
            if (window.rippleDay) {
                const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor));
                anchors.forEach(a => { if (a && a !== 'unlinked') rippleDay(dateStr, a, true); });
            }
        }
    }
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function setDrillLevel(level) {
    drillLevel = level;
    window.drillLevel = level;
    ['master', 'room', 'event', 'rates'].forEach(l => {
        const btn = document.getElementById(`depth-${l}`);
        if (btn) btn.className = l === level 
            ? "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
    });
    renderRateMatrix();
}

export function setViewDensity(density) {
    viewDensity = density;
    window.viewDensity = density;
    ['avail', 'price', 'compact', 'minmax', 'full'].forEach(d => {
        const btn = document.getElementById(`density-${d}`);
        if (btn) btn.className = d === density 
            ? "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
    });
    renderRateMatrix();
}

export function toggleRoomExpand(room) {
    if (expandedRooms.has(room)) expandedRooms.delete(room);
    else expandedRooms.add(room);
    renderRateMatrix();
}

export function renderRateMatrix() {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) tapeInput.value = getLocalYMD(new Date());
    const startStr = tapeInput?.value || getLocalYMD(new Date());

    calculateLiveInventory();

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    const dObj = new Date(startStr + "T12:00:00Z");
    const isEvents = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : false;
    const density = viewDensity || 'full';

    // 1. Header Row
    let trHead = `<tr class="sticky-header">
        <th class="frozen-col-header z-30 border-r-2 border-slate-600 px-2 text-left" style="width: 140px; min-width: 140px; left: 0;">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">Room / Rate</span>
        </th>`;

    for (let i = 0; i < daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = getLocalYMD(cur);
        const dMs = parseYMD(dateStr);
        const minDiff = getNearestEvent ? getNearestEvent(dMs) : 999;

        let highlight = 'bg-slate-900 border-slate-700 text-white';
        if (isEvents && minDiff === 0) highlight = 'evt-peak !bg-amber-500 text-slate-900';
        else if (isEvents && Math.abs(minDiff) <= 2) highlight = 'bg-amber-400 text-amber-900 border-amber-500';

        trHead += `<th class="px-0 py-0.5 border-b ${highlight} text-center cursor-pointer" style="width: 31px; min-width: 31px; max-width: 31px;" onclick="window.cycleUnifiedRestriction('${dateStr}', 'GLOBAL')">
            <span class="block text-[8px] font-bold uppercase leading-none">${mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[11px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    // 2. Room Category Iteration
    let targetRooms = [...(window.roomTypes || [])];
    const anchorP = window.pricingRules?.anchorPrivate;
    const anchorD = window.pricingRules?.anchorDorm;

    if (drillLevel === 'master') {
        targetRooms = [anchorP, anchorD].filter(Boolean);
        if (targetRooms.length === 0 && (window.roomTypes || []).length > 0) targetRooms = [window.roomTypes[0]];
    }

    let allRowsHtml = '';

    targetRooms.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        const displayName = window.displayAbbrev?.[room] || room;
        const allMappedRates = (window.channexRateMap || []).filter(m => m.pmsCategory === room);

        const isExpanded = (drillLevel === 'rates') || expandedRooms.has(room);

        // A. Availability Row
        if (density !== 'price') {
            let trAvail = `<tr class="${groupClass} border-b border-slate-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full font-black text-slate-800 text-[11px]">
                        <span class="truncate">${displayName}</span>
                        <div class="flex items-center gap-1">
                            ${allMappedRates.length > 0 && drillLevel !== 'rates' ? `
                            <button onclick="window.toggleRoomExpand('${room}')" class="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer">
                                <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" size="12"></i>
                            </button>` : ''}
                            <span class="text-[8px] font-bold text-slate-400">AVL</span>
                        </div>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const live = window.liveInventory?.[dateStr]?.[room] !== undefined ? window.liveInventory[dateStr][room] : 0;
                const otaAvail = window.masterPricing?.timeline?.[dateStr]?.otaOverrides?.[`${room}_avail`];
                const displayVal = otaAvail !== undefined ? otaAvail : live;
                const availColor = displayVal === 0 ? 'text-rose-600 font-black' : (displayVal <= 2 ? 'text-amber-600 font-bold' : 'text-emerald-700 font-bold');

                trAvail += `<td class="p-0 border-r border-slate-200 ${otaAvail !== undefined ? '!bg-amber-100' : 'bg-slate-50/80'} text-center" style="width: 31px; min-width: 31px; max-width: 31px;">
                    <input type="number" class="w-full text-center outline-none bg-transparent text-[10px] ${availColor} font-bold px-0 py-1" value="${displayVal}" onfocus="this.select()" onchange="window.handleAvailEdit('${dateStr}', '${room}', this.value)">
                </td>`;
            }
            trAvail += `</tr>`;
            allRowsHtml += trAvail;
        }

        if (density === 'avail') return;

        // B. Base Rate Row
        let trRate = `<tr class="${groupClass} border-b border-slate-300">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                    <span class="text-[10px] font-black text-slate-700 truncate">Base Rate</span>
                    <span class="text-[7px] font-black uppercase text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-200">STD</span>
                </div>
            </td>`;

        for (let i = 0; i < daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = getLocalYMD(cur);
            const rData = window.masterPricing?.timeline?.[dateStr]?.[room] || {};
            const isPinned = !!rData.isOverride?.std;
            const displayPrice = rData.std !== undefined && rData.std !== "" ? rData.std : "";

            const minVal = rData.min !== undefined && rData.min !== "" ? rData.min : (rData.min_arr ? `${rData.min_arr}▸` : "");
            const maxVal = rData.max !== undefined && rData.max !== "" ? rData.max : "";

            const showTop = density === 'minmax' || density === 'full';
            const showBottom = density === 'full';
            const pillHtml = getUnifiedRestrictionBadgeHtml(rData.cta, rData.ctd, rData.stop || rData.stopSell);

            let cellClass = `p-0 border-r border-slate-200 text-center relative ${isPinned ? 'rate-cell-pinned !bg-amber-100' : ''}`;

            trRate += `<td class="${cellClass}" style="width: 31px; min-width: 31px; max-width: 31px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}')">
                ${showTop ? `
                <div class="flex items-center w-full h-[14px] border-b border-slate-200/70 overflow-hidden leading-none">
                    <input type="text" class="w-1/2 text-center bg-transparent border-none text-[8px] font-black text-slate-600 outline-none p-0" value="${minVal}" placeholder="-" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value)">
                    <input type="text" class="w-1/2 text-center bg-transparent border-none text-[8px] text-slate-400 outline-none p-0 border-l border-slate-200" value="${maxVal}" placeholder="-" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value)">
                </div>` : ''}

                <div class="${(density === 'compact' || density === 'price') ? 'h-[24px]' : 'h-[17px]'} flex items-center justify-center">
                    <input type="number" class="w-full text-center outline-none bg-transparent font-black text-[10px] ${isPinned ? '!text-amber-900' : 'text-slate-800'} px-0" value="${displayPrice}" onfocus="this.select()" onchange="window.handleCellPriceChange(event, '${dateStr}', '${room}')">
                </div>

                ${showBottom ? `
                <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[11px] pb-0.5">
                    <button type="button" onclick="window.cycleUnifiedRestriction('${dateStr}', '${room}')" class="cursor-pointer w-full flex items-center justify-center">
                        ${pillHtml}
                    </button>
                </div>` : ''}
            </td>`;
        }
        trRate += `</tr>`;
        allRowsHtml += trRate;

        // C. Dual Event Rates (Rendered ONLY if event pricing is active)
        if (isEvents && density !== 'avail') {
            let trEvt = `<tr class="${groupClass} border-b border-pink-200 bg-pink-50/40">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 bg-pink-50/80">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-pink-800 truncate">EVT Non-Ref</span>
                        <span class="text-[7px] font-black uppercase text-pink-700 bg-pink-100 px-1 py-0.5 rounded border border-pink-300">EVT BASE</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const rData = window.masterPricing?.timeline?.[dateStr]?.[room] || {};
                const displayFmp = rData.fmp !== undefined && rData.fmp !== "" ? rData.fmp : "";
                const isPinnedFmp = !!rData.isOverride?.fmp;

                trEvt += `<td class="p-0 border-r border-pink-200 text-center relative ${isPinnedFmp ? 'rate-cell-pinned !bg-amber-100' : ''}" style="width: 31px; min-width: 31px; max-width: 31px;">
                    <div class="h-[22px] flex items-center justify-center">
                        <input type="number" class="w-full text-center outline-none bg-transparent font-black text-[10px] text-pink-800 px-0" value="${displayFmp}" onfocus="this.select()" onchange="window.handleCellEdit('${dateStr}', '${room}', 'fmp', this.value, true)">
                    </div>
                </td>`;
            }
            trEvt += `</tr>`;
            allRowsHtml += trEvt;
        }

        // D. Mapped OTA Rate Plans (When expanded)
        if (isExpanded && allMappedRates.length > 0 && density !== 'avail') {
            allMappedRates.forEach(rate => {
                let trOta = `<tr class="bg-indigo-50/40 border-b border-indigo-100">
                    <td class="frozen-col !p-0 z-20 border-r-2 border-slate-400 bg-indigo-50/70">
                        <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left truncate">
                            <span class="text-[9px] font-black text-indigo-950 truncate">${rate.ratePlanTitle}</span>
                            <span class="text-[7px] font-black uppercase text-indigo-600 bg-indigo-100 px-1 py-0.2 rounded shrink-0">OTA</span>
                        </div>
                    </td>`;

                for (let i = 0; i < daysToRender; i++) {
                    const cur = new Date(dObj);
                    cur.setUTCDate(cur.getUTCDate() + i);
                    const dateStr = getLocalYMD(cur);
                    const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                    const otaOverride = dayObj.otaOverrides?.[rate.ratePlanId];
                    const computed = otaOverride !== undefined ? otaOverride : (computeDynamicPlanRate ? computeDynamicPlanRate(dateStr, room, rate) : "");

                    trOta += `<td class="p-0 border-r border-indigo-100 text-center relative ${otaOverride !== undefined ? 'rate-cell-pinned !bg-amber-100' : ''}" style="width: 31px; min-width: 31px; max-width: 31px;">
                        <input type="number" class="w-full text-center outline-none bg-transparent font-bold text-[10px] ${otaOverride !== undefined ? '!text-pink-600 font-black' : 'text-indigo-900'} px-0" value="${computed}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '=', 0, 'rate', this.value)">
                    </td>`;
                }
                trOta += `</tr>`;
                allRowsHtml += trOta;
            });
        }
    });

    body.innerHTML = allRowsHtml;
    if (window.lucide) window.lucide.createIcons();
}

// Global Aliases & Bridges
if (typeof window !== 'undefined') {
    window.renderRateMatrix = renderRateMatrix;
    window.renderGrid = renderRateMatrix;
    window.formatMinStayInput = formatMinStayInput;
    window.calculateLiveInventory = calculateLiveInventory;
    window.handleAvailEdit = handleAvailEdit;
    window.handleCellPriceChange = handleCellPriceChange;
    window.handleCellEdit = handleCellEdit;
    window.handleOtaEdit = handleOtaEdit;
    window.cycleUnifiedRestriction = cycleUnifiedRestriction;
    window.unlockCellOverride = unlockCellOverride;
    window.setDrillLevel = setDrillLevel;
    window.setViewDensity = setViewDensity;
    window.toggleRoomExpand = toggleRoomExpand;
}
