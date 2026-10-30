// ==========================================================================
// cm/cm-bulk-drawer.js - Range Bulk Update Drawer Controller
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { rippleDay } from './cm-ripple.js';

export let bulkScopeMode = 'anchors'; // 'anchors' | 'all'

export function toggleQuickBulk(forceClose = false) {
    const panel = document.getElementById('quick-bulk-panel');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');

    if (!forceClose && isHidden) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        renderBulkGrid();
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}

export function setBulkScopeMode(mode) {
    bulkScopeMode = mode;
    const btnAnchors = document.getElementById('qb-scope-anchors');
    const btnAll = document.getElementById('qb-scope-all');
    if (btnAnchors && btnAll) {
        btnAnchors.className = mode === 'anchors' 
            ? "px-2 py-0.5 rounded cursor-pointer bg-indigo-600 text-white shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer text-slate-400 hover:text-white";
        btnAll.className = mode === 'all'
            ? "px-2 py-0.5 rounded cursor-pointer bg-indigo-600 text-white shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer text-slate-400 hover:text-white";
    }
    renderBulkGrid();
}

export function renderBulkGrid() {
    const qbBody = document.getElementById('qb-grid-body');
    if (!qbBody) return;

    const inptCls = "w-full text-center text-xs font-black bg-slate-900 border border-slate-700 text-white rounded p-1 outline-none";
    let html = '';

    const roomsToRender = (bulkScopeMode === 'anchors')
        ? (window.roomTypes || []).slice(0, 2)
        : (window.roomTypes || []);

    roomsToRender.forEach(r => {
        html += `
            <tr class="text-white border-b border-slate-800" data-room="${r}">
                <td class="p-2 font-bold truncate">${r}</td>
                <td class="p-1"><input type="number" class="qb-rate ${inptCls} text-emerald-400" placeholder="--"></td>
                <td class="p-1"><input type="number" class="qb-min ${inptCls}" placeholder="--"></td>
                <td class="p-1"><input type="number" class="qb-max ${inptCls}" placeholder="--"></td>
            </tr>
        `;
    });

    qbBody.innerHTML = html;
}

export function applyBulkGrid(isClear = false) {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e || s > e) return customAlert("Validation Error", "Please choose a valid Start and End date range.");

    const sU = parseYMD(s);
    const eU = parseYMD(e);
    const rows = document.querySelectorAll('#qb-grid-body tr');

    rows.forEach(tr => {
        const room = tr.dataset.room;
        const rateVal = tr.querySelector('.qb-rate')?.value;
        const minVal = tr.querySelector('.qb-min')?.value;
        const maxVal = tr.querySelector('.qb-max')?.value;

        for (let d = sU; d <= eU; d += 86400000) {
            const dateStr = getLocalYMD(new Date(d));
            window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
            window.masterPricing.timeline[dateStr][room] = window.masterPricing.timeline[dateStr][room] || { isOverride: {} };
            const rData = window.masterPricing.timeline[dateStr][room];

            if (isClear) {
                delete rData.std;
                delete rData.min;
                delete rData.max;
                rData.isOverride = {};
            } else {
                if (rateVal) {
                    rData.std = roundCurrency(parseFloat(rateVal));
                    rData.isOverride.std = true;
                    rippleDay(dateStr, room);
                }
                if (minVal) {
                    rData.min = parseInt(minVal, 10);
                    rData.isOverride.min = true;
                }
                if (maxVal) {
                    rData.max = parseInt(maxVal, 10);
                    rData.isOverride.max = true;
                }
            }

            window.dirtyDates = window.dirtyDates || new Set();
            window.dirtyDates.add(dateStr);
        }
    });

    window.markUnsavedChanges();
    renderRateMatrix();
    toggleQuickBulk(true);
    customAlert("Bulk Update", isClear ? "Overrides cleared." : `Applied updates from ${s} to ${e}.`);
}

if (typeof window !== 'undefined') {
    window.toggleQuickBulk = toggleQuickBulk;
    window.setBulkScopeMode = setBulkScopeMode;
    window.applyBulkGrid = applyBulkGrid;
}
