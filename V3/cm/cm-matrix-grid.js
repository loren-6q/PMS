// ==========================================================================
// cm/cm-matrix-grid.js - Dense Rate Matrix Grid & Cell Controller
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { rippleDay } from './cm-ripple.js';

export let drillLevel = 'room'; // 'master' | 'room' | 'event' | 'rates'
export let viewDensity = 'full'; // 'avail' | 'price' | 'compact' | 'minmax' | 'full'
export let channelPreviewFilter = 'ALL';
export const expandedRooms = new Set();
export const daysToRender = 42;

export function setDrillLevel(level) {
    drillLevel = level;
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

export function handleCellPriceChange(dateStr, room, val) {
    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr][room] = window.masterPricing.timeline[dateStr][room] || { isOverride: {} };
    
    const rData = window.masterPricing.timeline[dateStr][room];
    rData.isOverride = rData.isOverride || {};

    if (val === "" || isNaN(parseFloat(val))) {
        delete rData.std;
        delete rData.isOverride.std;
    } else {
        rData.std = roundCurrency(parseFloat(val));
        rData.isOverride.std = true;

        if (window.editMode === 'ripple') {
            rippleDay(dateStr, room, true);
        }
    }

    window.dirtyDates = window.dirtyDates || new Set();
    window.dirtyDates.add(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function renderRateMatrix() {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) tapeInput.value = getLocalYMD(new Date());
    const startStr = tapeInput?.value || getLocalYMD(new Date());

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;

    head.innerHTML = '';
    body.innerHTML = '';

    const dObj = new Date(startStr + "T12:00:00Z");
    const roomTypes = window.roomTypes || [];
    const timeline = window.masterPricing?.timeline || {};

    // 1. Header Row
    let trHead = `<tr class="sticky-header">
        <th class="frozen-col-header z-30 border-r-2 border-slate-600 px-2 text-left" style="width: 140px; min-width: 140px; left: 0;">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">Room / Rate</span>
        </th>`;

    for (let i = 0; i < daysToRender; i++) {
        const cur = new Date(dObj);
        cur.setUTCDate(cur.getUTCDate() + i);
        const dateStr = getLocalYMD(cur);

        trHead += `<th class="px-0 py-0.5 border-b bg-slate-900 border-slate-700 text-white text-center" style="width: 32px; min-width: 32px;">
            <span class="block text-[8px] font-bold uppercase leading-none">${mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[11px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    // 2. Room Rows
    let allRowsHtml = '';
    roomTypes.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

        // Base STD Row
        let trRate = `<tr class="${groupClass} border-b border-slate-300">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 px-2">
                <div class="flex items-center justify-between text-[10px] font-black text-slate-800">
                    <span class="truncate">${room}</span>
                    <span class="text-[7px] bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded border border-indigo-200">STD</span>
                </div>
            </td>`;

        for (let i = 0; i < daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = getLocalYMD(cur);
            const rData = timeline[dateStr]?.[room] || {};
            const isPinned = !!rData.isOverride?.std;
            const price = rData.std !== undefined && rData.std !== "" ? rData.std : "";

            trRate += `<td class="p-0 border-r border-slate-200 text-center ${isPinned ? 'bg-amber-100' : ''}" style="width: 32px; min-width: 32px;">
                <input type="number" class="w-full text-center outline-none bg-transparent font-black text-[10px] ${isPinned ? 'text-amber-900' : 'text-slate-800'}" value="${price}" onfocus="this.select()" onchange="window.handleCellPriceChange('${dateStr}', '${room}', this.value)">
            </td>`;
        }
        trRate += `</tr>`;
        allRowsHtml += trRate;
    });

    body.innerHTML = allRowsHtml;
    if (window.lucide) window.lucide.createIcons();
}

if (typeof window !== 'undefined') {
    window.setDrillLevel = setDrillLevel;
    window.setViewDensity = setViewDensity;
    window.toggleRoomExpand = toggleRoomExpand;
    window.handleCellPriceChange = handleCellPriceChange;
    window.renderRateMatrix = renderRateMatrix;
}
