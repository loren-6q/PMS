// ==========================================================================
// cm/cm-bulk-drawer.js - Range Bulk Update & Event Curve Tuner Drawers
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';
import { db, appId } from '../core/config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { renderRateMatrix } from './cm-matrix-grid.js';
import { rippleDay } from './cm-ripple.js';

export let bulkScopeMode = 'anchors'; // 'anchors' | 'all'

// --- 1. QUICK BULK DRAWER CONTROLLERS ---

export function toggleQuickBulk(forceClose = false) {
    const panel = document.getElementById('quick-bulk-panel');
    if (!panel) return;

    if (!forceClose && panel.classList.contains('hidden')) {
        const curvePanel = document.getElementById('quick-curve-panel');
        if (curvePanel) {
            curvePanel.classList.add('hidden');
            curvePanel.classList.remove('flex');
        }

        panel.classList.remove('hidden');
        panel.classList.add('flex');

        const today = new Date();
        const qbStart = document.getElementById('qb-start');
        const qbEnd = document.getElementById('qb-end');
        if (qbStart && !qbStart.value) qbStart.value = getLocalYMD(today);
        if (qbEnd && !qbEnd.value) {
            const next30 = new Date(today);
            next30.setDate(today.getDate() + 30);
            qbEnd.value = getLocalYMD(next30);
        }

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

export function cycleBulkRowPill(btn) {
    if (!btn) return;
    const states = ['open', 'cta', 'ctd', 'both', 'stop'];
    const cur = btn.dataset.state || 'open';
    const next = states[(states.indexOf(cur) + 1) % states.length];
    btn.dataset.state = next;

    const labels = {
        open: 'Open',
        cta: 'CTA',
        ctd: 'CTD',
        both: 'CTB',
        stop: 'Stop Sell'
    };

    const classes = {
        open: 'bg-slate-800 text-slate-400 border-slate-700',
        cta: 'bg-amber-400/20 text-amber-300 border-amber-500',
        ctd: 'bg-sky-400/20 text-sky-300 border-sky-500',
        both: 'bg-purple-400/20 text-purple-300 border-purple-500',
        stop: 'bg-rose-600 text-white border-rose-500'
    };

    btn.className = `qb-val-pill w-full sm:w-36 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-xs ${classes[next]}`;
    btn.innerHTML = labels[next];
}

export function renderBulkGrid() {
    const qbBody = document.getElementById('qb-grid-body');
    if (!qbBody) return;

    const inptCls = "w-full text-center text-xs font-black bg-slate-900 border border-slate-700 text-white rounded p-1 outline-none";
    const pillBtn = `<button type="button" data-state="open" onclick="window.cycleBulkRowPill(this)" class="qb-val-pill w-full sm:w-36 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-xs bg-slate-800 text-slate-400 border-slate-700">Open</button>`;

    let html = '';

    // 1. GLOBAL Row (Restrictions Only)
    html += `
    <tr class="bg-slate-950/80 font-black text-slate-200" data-type="global" data-id="GLOBAL">
        <td class="p-2 border-r border-slate-800 font-black uppercase text-amber-400">
            🌍 GLOBAL (All Rooms)
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" disabled placeholder="--" class="${inptCls} !bg-slate-950 !text-slate-600 cursor-not-allowed">
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" class="${inptCls} qb-val-min text-amber-400" placeholder="e.g. 3 or 3▸">
        </td>
        <td class="p-1 border-r border-slate-800 text-center">
            <input type="text" class="${inptCls} qb-val-max text-slate-300" placeholder="e.g. 14">
        </td>
        <td class="p-1 text-center">
            ${pillBtn}
        </td>
    </tr>`;

    // 2. Room Rows
    let roomsToRender = [...(window.roomTypes || [])];
    const anchorP = window.pricingRules?.anchorPrivate;
    const anchorD = window.pricingRules?.anchorDorm;

    if (bulkScopeMode === 'anchors') {
        roomsToRender = [anchorP, anchorD].filter(Boolean);
        if (roomsToRender.length === 0 && (window.roomTypes || []).length > 0) {
            roomsToRender = [window.roomTypes[0]];
        }
    }

    roomsToRender.forEach(r => {
        const displayName = window.displayAbbrev?.[r] || r;
        const isAnchor = (r === anchorP || r === anchorD);

        html += `
        <tr class="bg-slate-900/40 hover:bg-slate-800/80 text-white transition-colors" data-type="room" data-id="${r}">
            <td class="p-2 border-r border-slate-800 font-bold text-slate-200 truncate">
                ${displayName} ${isAnchor ? '<span class="text-[8px] font-black uppercase bg-indigo-900/70 border border-indigo-700 text-indigo-300 px-1 py-0.2 rounded ml-1">ANCHOR</span>' : ''}
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="number" step="any" class="${inptCls} qb-val-rate !text-emerald-400" placeholder="--">
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="text" class="${inptCls} qb-val-min text-amber-400" placeholder="e.g. 3 or 3▸">
            </td>
            <td class="p-1 border-r border-slate-800 text-center">
                <input type="text" class="${inptCls} qb-val-max text-slate-300" placeholder="e.g. 14">
            </td>
            <td class="p-1 text-center">
                ${pillBtn}
            </td>
        </tr>`;
    });

    qbBody.innerHTML = html;
}

export function applyBulkGrid(isClear = false) {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e) return customAlert("Validation Error", "Please choose a valid Start and End date range.");
    if (s > e) return customAlert("Validation Error", "End date must be on or after Start date.");

    const sU = parseYMD(s);
    const eU = parseYMD(e);
    const rows = document.querySelectorAll('#qb-grid-body tr');

    const roomUpdates = [];
    let globalRule = null;

    rows.forEach(tr => {
        const type = tr.dataset.type;
        const id = tr.dataset.id;
        const rateInput = tr.querySelector('.qb-val-rate');
        const minInput = tr.querySelector('.qb-val-min');
        const maxInput = tr.querySelector('.qb-val-max');
        const pill = tr.querySelector('.qb-val-pill');

        const rate = (rateInput && rateInput.value.trim() !== "") ? parseFloat(rateInput.value) : undefined;
        let min = undefined;
        let min_arr = undefined;

        if (minInput && minInput.value.trim() !== "") {
            const rawMin = minInput.value.trim();
            if (/(\d+)\s*(a|>|▸)/i.test(rawMin)) {
                const match = rawMin.match(/(\d+)/);
                min_arr = match ? parseInt(match[1], 10) : undefined;
            } else {
                const match = rawMin.match(/(\d+)/);
                min = match ? parseInt(match[1], 10) : undefined;
            }
        }

        const max = (maxInput && maxInput.value.trim() !== "") ? parseInt(maxInput.value.trim(), 10) : undefined;
        const pillState = pill?.dataset.state || 'open';

        let cta = undefined, ctd = undefined, stop = undefined;
        if (pillState === 'cta') { cta = true; ctd = false; stop = false; }
        else if (pillState === 'ctd') { cta = false; ctd = true; stop = false; }
        else if (pillState === 'both') { cta = true; ctd = true; stop = false; }
        else if (pillState === 'stop') { cta = false; ctd = false; stop = true; }

        const rule = { id, rate, min, min_arr, max, cta, ctd, stop, pillState };
        if (type === 'global') globalRule = rule;
        else if (type === 'room') roomUpdates.push(rule);
    });

    for (let d = sU; d <= eU; d += 86400000) {
        const dateStr = getLocalYMD(new Date(d));
        window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
        const dObj = window.masterPricing.timeline[dateStr];

        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);

        if (globalRule) {
            dObj['GLOBAL'] = dObj['GLOBAL'] || { isOverride: {} };
            if (isClear) {
                delete dObj['GLOBAL'].min;
                delete dObj['GLOBAL'].max;
                delete dObj['GLOBAL'].min_arr;
                delete dObj['GLOBAL'].cta;
                delete dObj['GLOBAL'].ctd;
                delete dObj['GLOBAL'].stop;
                delete dObj['GLOBAL'].stopSell;
            } else {
                if (globalRule.min !== undefined) dObj['GLOBAL'].min = globalRule.min;
                if (globalRule.min_arr !== undefined) dObj['GLOBAL'].min_arr = globalRule.min_arr;
                if (globalRule.max !== undefined) dObj['GLOBAL'].max = globalRule.max;
                if (globalRule.pillState !== 'open') {
                    dObj['GLOBAL'].cta = globalRule.cta;
                    dObj['GLOBAL'].ctd = globalRule.ctd;
                    dObj['GLOBAL'].stop = globalRule.stop;
                }
            }
        }

        roomUpdates.forEach(r => {
            const rt = r.id;
            dObj[rt] = dObj[rt] || { isOverride: {} };
            const rData = dObj[rt];
            rData.isOverride = rData.isOverride || {};

            if (isClear) {
                delete rData.std;
                delete rData.min;
                delete rData.max;
                delete rData.min_arr;
                delete rData.cta;
                delete rData.ctd;
                delete rData.stop;
                rData.isOverride = {};
            } else {
                if (r.rate !== undefined) {
                    rData.std = roundCurrency(r.rate);
                    rData.isOverride.std = true;
                    rippleDay(dateStr, rt);
                }
                if (r.min !== undefined) { rData.min = r.min; delete rData.min_arr; rData.isOverride.min = true; }
                if (r.min_arr !== undefined) { rData.min_arr = r.min_arr; delete rData.min; rData.isOverride.min_arr = true; }
                if (r.max !== undefined) { rData.max = r.max; rData.isOverride.max = true; }
                if (r.pillState !== 'open') {
                    rData.cta = r.cta;
                    rData.ctd = r.ctd;
                    rData.stop = r.stop;
                    rData.isOverride.cta = true;
                    rData.isOverride.ctd = true;
                    rData.isOverride.stop = true;
                }
            }
        });
    }

    window.markUnsavedChanges();
    renderRateMatrix();
    toggleQuickBulk(true);
    customAlert("Bulk Update", isClear ? "Overrides cleared across the selected range." : `Applied updates from ${s} to ${e}.`);
}

// --- 2. QUICK EVENT CURVE TUNER CONTROLLERS ---

export function toggleCurveTuner(forceClose = false, targetDateStr = null) {
    const panel = document.getElementById('quick-curve-panel');
    if (!panel) return;

    if (!forceClose && panel.classList.contains('hidden')) {
        const bulkPanel = document.getElementById('quick-bulk-panel');
        if (bulkPanel) {
            bulkPanel.classList.add('hidden');
            bulkPanel.classList.remove('flex');
        }

        panel.classList.remove('hidden');
        panel.classList.add('flex');
        initCurveTuner(targetDateStr);
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}

export function openCurveTunerForDate(dateStr) {
    toggleCurveTuner(false, dateStr);
}

export function initCurveTuner(targetDateStr = null) {
    const select = document.getElementById('ct-event-select');
    if (!select) return;

    const events = (window.eventDates || []).slice().sort();
    if (events.length === 0) {
        select.innerHTML = `<option value="">No event dates configured</option>`;
        return;
    }

    const todayStr = getLocalYMD(new Date());
    let selectedDate = targetDateStr || events.find(d => d >= todayStr) || events[0];

    select.innerHTML = events.map(dStr => {
        const dObj = new Date(dStr + "T12:00:00Z");
        return `<option value="${dStr}" ${dStr === selectedDate ? 'selected' : ''}>${dObj.getUTCDate()} ${mNames[dObj.getUTCMonth()]} ${dObj.getUTCFullYear()} (${dStr})</option>`;
    }).join('');

    handleCurveEventSelect(selectedDate);
}

export function handleCurveEventSelect(selectedDateStr) {
    if (!selectedDateStr) return;
    const body = document.getElementById('ct-grid-body');
    if (!body) return;

    const peakMs = parseYMD(selectedDateStr);
    const offsets = [-2, -1, 0, 1, 2];

    offsets.forEach(off => {
        const curD = new Date(peakMs + (off * 86400000));
        const idMap = { [-2]: 'ct-th-m2', [-1]: 'ct-th-m1', [0]: 'ct-th-0', [1]: 'ct-th-p1', [2]: 'ct-th-p2' };
        const th = document.getElementById(idMap[off]);
        if (th) th.textContent = `${curD.getUTCDate()} ${mNames[curD.getUTCMonth()]} (${off === 0 ? 'PEAK' : (off > 0 ? `+${off}` : off)})`;
    });

    const anchorP = window.pricingRules?.anchorPrivate || 'Private Room';
    const anchorD = window.pricingRules?.anchorDorm || 'Dorm Bed';
    const b = window.savedAutofillBaselines || {};
    const timeline = window.masterPricing?.timeline || {};

    const getTimelineVal = (off, room, field, baselineKey, defaultVal) => {
        const dStr = getLocalYMD(new Date(peakMs + (off * 86400000)));
        const dayData = timeline[dStr]?.[room];
        if (dayData && dayData[field] !== undefined && dayData[field] !== "") {
            return dayData[field];
        }
        return b[baselineKey] !== undefined ? b[baselineKey] : defaultVal;
    };

    const inptCls = "w-full text-center text-xs font-black bg-slate-900 border border-slate-700 text-white rounded p-1 outline-none";
    const peakInptCls = "w-full text-center text-xs font-black bg-amber-950/60 border border-amber-500 text-amber-300 rounded p-1 outline-none";

    const labelP = window.displayAbbrev?.[anchorP] || anchorP;
    const labelD = window.displayAbbrev?.[anchorD] || anchorD;

    body.innerHTML = `
        <tr class="bg-indigo-950/20 text-white" data-segment="p" data-anchor="${anchorP}">
            <td class="p-2 text-left border-r border-slate-800 text-indigo-300 font-bold truncate" title="${anchorP}">${labelP}</td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-base" class="${inptCls}" value="${b.p_base || 899}" onchange="window.recalcCurveTunerShoulders('p')"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-pkg" class="${inptCls} !text-pink-400" value="${getTimelineVal(-1, anchorP, 'fmp', 'p_pkg', 1000)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-m2" class="${inptCls}" value="${getTimelineVal(-2, anchorP, 'std', 'p_m2', 1099)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-m1" class="${inptCls}" value="${getTimelineVal(-1, anchorP, 'std', 'p_m1', 1999)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-0" class="${peakInptCls}" value="${getTimelineVal(0, anchorP, 'std', 'p_0', 5999)}" oninput="window.recalcCurveTunerShoulders('p')"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-p-p1" class="${inptCls}" value="${getTimelineVal(1, anchorP, 'std', 'p_p1', 1999)}"></td>
            <td class="p-1"><input type="number" id="ct-p-p2" class="${inptCls}" value="${getTimelineVal(2, anchorP, 'std', 'p_p2', 1099)}"></td>
        </tr>
        <tr class="bg-orange-950/20 text-white" data-segment="d" data-anchor="${anchorD}">
            <td class="p-2 text-left border-r border-slate-800 text-orange-300 font-bold truncate" title="${anchorD}">${labelD}</td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-base" class="${inptCls}" value="${b.d_base || 199}" onchange="window.recalcCurveTunerShoulders('d')"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-pkg" class="${inptCls} !text-pink-400" value="${getTimelineVal(-1, anchorD, 'fmp', 'd_pkg', 200)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-m2" class="${inptCls}" value="${getTimelineVal(-2, anchorD, 'std', 'd_m2', 299)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-m1" class="${inptCls}" value="${getTimelineVal(-1, anchorD, 'std', 'd_m1', 799)}"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-0" class="${peakInptCls}" value="${getTimelineVal(0, anchorD, 'std', 'd_0', 2499)}" oninput="window.recalcCurveTunerShoulders('d')"></td>
            <td class="p-1 border-r border-slate-800"><input type="number" id="ct-d-p1" class="${inptCls}" value="${getTimelineVal(1, anchorD, 'std', 'd_p1', 799)}"></td>
            <td class="p-1"><input type="number" id="ct-d-p2" class="${inptCls}" value="${getTimelineVal(2, anchorD, 'std', 'd_p2', 299)}"></td>
        </tr>
    `;
}

export function adjustCurveTunerPeak(delta, isPct = false) {
    ['p', 'd'].forEach(seg => {
        const input = document.getElementById(`ct-${seg}-0`);
        if (!input) return;
        const cur = parseFloat(input.value) || 0;
        const nextVal = isPct ? Math.round(cur * (1 + delta)) : Math.round(cur + delta);
        input.value = Math.max(100, nextVal);
    });
    recalcCurveTunerShoulders('all');
}

export function recalcCurveTunerShoulders(segment = 'all') {
    const segments = (segment === 'all') ? ['p', 'd'] : [segment];
    segments.forEach(seg => {
        const baseEl = document.getElementById(`ct-${seg}-base`);
        const peakEl = document.getElementById(`ct-${seg}-0`);
        if (!baseEl || !peakEl) return;

        const baseVal = parseFloat(baseEl.value) || 200;
        const peakVal = parseFloat(peakEl.value) || 2000;
        const spread = Math.max(0, peakVal - baseVal);

        const setField = (id, ratio) => {
            const el = document.getElementById(id);
            if (el) el.value = Math.round(baseVal + (spread * ratio));
        };

        setField(`ct-${seg}-m2`, 0.20);
        setField(`ct-${seg}-m1`, 0.50);
        setField(`ct-${seg}-p1`, 0.50);
        setField(`ct-${seg}-p2`, 0.20);
    });
}

export function applyCurveTuner() {
    const select = document.getElementById('ct-event-select');
    const evtStr = select?.value;
    if (!evtStr) return customAlert("Input Required", "Please select an upcoming event date.");

    const peakMs = parseYMD(evtStr);
    const offsets = [-2, -1, 0, 1, 2];

    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;

    const p_pkg = getVal('ct-p-pkg') || 1000;
    const d_pkg = getVal('ct-d-pkg') || 200;

    const p_rates = { [-2]: getVal('ct-p-m2'), [-1]: getVal('ct-p-m1'), [0]: getVal('ct-p-0'), [1]: getVal('ct-p-p1'), [2]: getVal('ct-p-p2') };
    const d_rates = { [-2]: getVal('ct-d-m2'), [-1]: getVal('ct-d-m1'), [0]: getVal('ct-d-0'), [1]: getVal('ct-d-p1'), [2]: getVal('ct-d-p2') };

    const anchorP = window.pricingRules?.anchorPrivate;
    const anchorD = window.pricingRules?.anchorDorm;

    offsets.forEach(off => {
        const dStr = getLocalYMD(new Date(peakMs + (off * 86400000)));
        window.masterPricing.timeline[dStr] = window.masterPricing.timeline[dStr] || {};
        const isPeak = (off === 0);

        if (anchorP) {
            window.masterPricing.timeline[dStr][anchorP] = window.masterPricing.timeline[dStr][anchorP] || { isOverride: {} };
            window.masterPricing.timeline[dStr][anchorP].std = p_rates[off];
            window.masterPricing.timeline[dStr][anchorP].fmp = isPeak ? p_rates[off] : p_pkg;
            window.masterPricing.timeline[dStr][anchorP].isOverride.std = true;
            window.masterPricing.timeline[dStr][anchorP].isOverride.fmp = true;
            rippleDay(dStr, anchorP, true);
        }

        if (anchorD) {
            window.masterPricing.timeline[dStr][anchorD] = window.masterPricing.timeline[dStr][anchorD] || { isOverride: {} };
            window.masterPricing.timeline[dStr][anchorD].std = d_rates[off];
            window.masterPricing.timeline[dStr][anchorD].fmp = isPeak ? d_rates[off] : d_pkg;
            window.masterPricing.timeline[dStr][anchorD].isOverride.std = true;
            window.masterPricing.timeline[dStr][anchorD].isOverride.fmp = true;
            rippleDay(dStr, anchorD, true);
        }

        window.dirtyDates.add(dStr);
        window.syncedDates.delete(dStr);
    });

    window.markUnsavedChanges();
    renderRateMatrix();
    toggleCurveTuner(true);
    customAlert("Curve Applied", `Event curve updated for ${evtStr} (±2 days). Click "SAVE & SYNC" to push.`);
}

export async function saveCurveTunerAsDefault() {
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;

    const baselines = {
        p_base: getVal('ct-p-base'),
        p_pkg: getVal('ct-p-pkg'),
        p_m2: getVal('ct-p-m2'),
        p_m1: getVal('ct-p-m1'),
        p_0: getVal('ct-p-0'),
        p_p1: getVal('ct-p-p1'),
        p_p2: getVal('ct-p-p2'),
        d_base: getVal('ct-d-base'),
        d_pkg: getVal('ct-d-pkg'),
        d_m2: getVal('ct-d-m2'),
        d_m1: getVal('ct-d-m1'),
        d_0: getVal('ct-d-0'),
        d_p1: getVal('ct-d-p1'),
        d_p2: getVal('ct-d-p2')
    };

    window.savedAutofillBaselines = { ...(window.savedAutofillBaselines || {}), ...baselines };

    try {
        const canonId = window.toCanonicalPropId(window.currentPropertyId);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            autofillBaselines: window.savedAutofillBaselines,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        customAlert("Template Saved", "Default event pricing curve template saved to database.");
    } catch (err) {
        customAlert("Save Error", err.message);
    }
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.toggleQuickBulk = toggleQuickBulk;
    window.setBulkScopeMode = setBulkScopeMode;
    window.cycleBulkRowPill = cycleBulkRowPill;
    window.renderBulkGrid = renderBulkGrid;
    window.applyBulkGrid = applyBulkGrid;
    window.toggleCurveTuner = toggleCurveTuner;
    window.openCurveTunerForDate = openCurveTunerForDate;
    window.handleCurveEventSelect = handleCurveEventSelect;
    window.adjustCurveTunerPeak = adjustCurveTunerPeak;
    window.recalcCurveTunerShoulders = recalcCurveTunerShoulders;
    window.applyCurveTuner = applyCurveTuner;
    window.saveCurveTunerAsDefault = saveCurveTunerAsDefault;
}
