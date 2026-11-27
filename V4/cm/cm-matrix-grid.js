// ==========================================================================
// cm/cm-matrix-grid.js - Dense Rate Matrix Grid & Cell Controller
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { isOccupyingBooking, getRestrictionBadgeHtml } from '../core/occupancy.js';
import { CHANNELS, resolveChannelCode, isEventRatePlan } from '../core/channels.js';
import { getClassifiedRooms } from '../core/properties.js';
import { rippleDay, applyMath, computeDynamicPlanRate, getNearestEvent } from './cm-ripple.js';

const SOURCE_RATE_KEYS = ['def', 'direct', 'ota', 'ghost'];
const TIER_RATE_KEYS = ['std', 'event'];
const ALL_RATE_KEYS = [...SOURCE_RATE_KEYS, ...TIER_RATE_KEYS];
const ALL_VIEW_KEYS = ['avail', 'price', 'minmax', 'restrictions'];

const _prefs = JSON.parse(localStorage.getItem('cm_ui_prefs_v2') || '{}');
export let roomLevel = _prefs.roomLevel || 'all';
export let highlightGaps = _prefs.highlightGaps !== undefined ? _prefs.highlightGaps : false;
export let channelPreviewFilter = _prefs.channelPreviewFilter || 'ALL';

function normalizeSavedRateFilters(rawList) {
    const valid = new Set(ALL_RATE_KEYS);
    const out = new Set();
    if (Array.isArray(rawList) && rawList.length) {
        rawList.forEach(k => {
            if (k === 'other') out.add('ota');
            else if (valid.has(k)) out.add(k);
        });
    }
    if (!SOURCE_RATE_KEYS.some(k => out.has(k))) out.add('def');
    if (!TIER_RATE_KEYS.some(k => out.has(k))) out.add('std');
    return out;
}

export const rateFilters = normalizeSavedRateFilters(_prefs.rateFilters);
export const viewFields = new Set(Array.isArray(_prefs.viewFields) && _prefs.viewFields.length ? _prefs.viewFields : ALL_VIEW_KEYS);
export const expandedRooms = new Set(JSON.parse(localStorage.getItem('cm_ui_expanded') || '[]'));
export const daysToRender = 42;

function saveGridPrefs() {
    localStorage.setItem('cm_ui_prefs_v2', JSON.stringify({
        roomLevel,
        highlightGaps,
        channelPreviewFilter,
        rateFilters: Array.from(rateFilters),
        viewFields: Array.from(viewFields)
    }));
}

function classifyRatePlanSource(r, ghostRoomLookup = null) {
    if (r?.isGhost || (ghostRoomLookup && ghostRoomLookup.has(r?.channexRoomId))) return 'ghost';
    const chanCode = resolveChannelCode(r?.channel || r?.ratePlanTitle);
    if (chanCode === 'DEF') return 'def';
    if (chanCode === 'WEB') return 'direct';
    return 'ota';
}

function isRefundableRatePlan(r) {
    const pol = String(r?.policy || r?.rateType || '').toLowerCase();
    if (pol === 'ref' || pol === 'event-ref') return true;
    if (pol === 'non-ref' || pol === 'event' || pol === 'event-non-ref') return false;
    const title = String(r?.ratePlanTitle || '');
    return /\bref(undable)?\b/i.test(title) && !/\bnon[-\s]?ref(undable)?\b/i.test(title);
}

function formatCmRateDisplayTitle(rawTitle) {
    return String(rawTitle || '')
        .replace(/\bnon[-\s]?refundable\b/gi, 'Non-Ref')
        .replace(/\brefundable\b/gi, 'Ref')
        .replace(/\s+rooms?$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function syncRateFilterDropdownUI() {
    const dropdown = document.getElementById('grid-rates-dropdown');
    const labelEl = document.getElementById('grid-rates-label');
    if (dropdown) {
        dropdown.querySelectorAll('input[data-grid-rate]').forEach(cb => {
            cb.checked = rateFilters.has(cb.dataset.gridRate);
        });
    }
    if (labelEl) {
        const srcNames = { def: 'DEF', direct: 'DIR', ota: 'OTA', ghost: 'GHOST' };
        const activeSources = SOURCE_RATE_KEYS.filter(k => rateFilters.has(k));
        const hasStd = rateFilters.has('std');
        const hasEvt = rateFilters.has('event');

        if (activeSources.length === SOURCE_RATE_KEYS.length && hasStd && hasEvt) {
            labelEl.innerText = 'All Rates';
        } else {
            const parts = activeSources.map(k => srcNames[k] || k.toUpperCase());
            if (hasEvt && hasStd) parts.push('EVT');
            else if (hasEvt && !hasStd) parts.push('EVT ONLY');
            labelEl.innerText = parts.join(' + ') || 'DEF';
        }
    }
}

function syncViewDropdownUI() {
    const dropdown = document.getElementById('grid-view-dropdown');
    const labelEl = document.getElementById('grid-view-label');
    if (dropdown) {
        dropdown.querySelectorAll('input[data-grid-view]').forEach(cb => {
            cb.checked = viewFields.has(cb.dataset.gridView);
        });
    }
    if (labelEl) {
        if (viewFields.size === ALL_VIEW_KEYS.length) {
            labelEl.innerText = 'Full';
        } else if (viewFields.size === 1 && viewFields.has('avail')) {
            labelEl.innerText = 'Avail';
        } else if (viewFields.size === 1 && viewFields.has('price')) {
            labelEl.innerText = 'Price';
        } else if (viewFields.size === 2 && viewFields.has('avail') && viewFields.has('price')) {
            labelEl.innerText = 'Compact';
        } else if (viewFields.size === 3 && !viewFields.has('restrictions')) {
            labelEl.innerText = 'Min/Max';
        } else {
            const names = { avail: 'Avl', price: 'Price', minmax: 'Min/Max', restrictions: 'Restr' };
            labelEl.innerText = Array.from(viewFields).map(k => names[k] || k).join(' + ');
        }
    }
}

export function toggleGridRatesDropdown(e) {
    if (e) e.stopPropagation();
    document.getElementById('grid-view-dropdown')?.classList.add('hidden');
    const dd = document.getElementById('grid-rates-dropdown');
    if (!dd) return;
    syncRateFilterDropdownUI();
    dd.classList.toggle('hidden');
}

export function toggleGridViewDropdown(e) {
    if (e) e.stopPropagation();
    document.getElementById('grid-rates-dropdown')?.classList.add('hidden');
    const dd = document.getElementById('grid-view-dropdown');
    if (!dd) return;
    syncViewDropdownUI();
    dd.classList.toggle('hidden');
}

export function toggleGridRateFilter(key, checked) {
    if (!ALL_RATE_KEYS.includes(key)) return;
    if (checked) {
        rateFilters.add(key);
    } else {
        const group = SOURCE_RATE_KEYS.includes(key) ? SOURCE_RATE_KEYS : TIER_RATE_KEYS;
        const activeInGroup = group.filter(k => rateFilters.has(k));
        if (activeInGroup.length > 1) {
            rateFilters.delete(key);
        }
    }
    window.showEventRows = rateFilters.has('event');
    saveGridPrefs();
    syncRateFilterDropdownUI();
    renderRateMatrix();
}

export function setAllGridRateFilters(selectAll) {
    rateFilters.clear();
    if (selectAll) {
        ALL_RATE_KEYS.forEach(k => rateFilters.add(k));
    } else {
        rateFilters.add('def');
        rateFilters.add('std');
    }
    window.showEventRows = rateFilters.has('event');
    saveGridPrefs();
    syncRateFilterDropdownUI();
    renderRateMatrix();
}

export function toggleGridViewField(key, checked) {
    if (checked) {
        viewFields.add(key);
    } else if (viewFields.size > 1) {
        viewFields.delete(key);
    }
    saveGridPrefs();
    syncViewDropdownUI();
    renderRateMatrix();
}

export function setAllGridViewFields(selectAll) {
    viewFields.clear();
    if (selectAll) {
        ALL_VIEW_KEYS.forEach(k => viewFields.add(k));
    } else {
        viewFields.add('avail');
        viewFields.add('price');
    }
    saveGridPrefs();
    syncViewDropdownUI();
    renderRateMatrix();
}

export function setGridViewPresetCompact() {
    setAllGridViewFields(false);
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        if (e.target && e.target.isConnected) {
            if (!e.target.closest('#grid-rates-wrap')) document.getElementById('grid-rates-dropdown')?.classList.add('hidden');
            if (!e.target.closest('#grid-view-wrap')) document.getElementById('grid-view-dropdown')?.classList.add('hidden');
        }
    });
}

export function initGridUI() {
    window.roomLevel = roomLevel;
    const hasSavedRateFilters = Array.isArray(_prefs.rateFilters) && _prefs.rateFilters.length > 0;
    const isEventsEnabled = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : !!window.enableEventRates;
    if (!hasSavedRateFilters && isEventsEnabled && !rateFilters.has('event')) {
        rateFilters.add('event');
        saveGridPrefs();
    }
    window.showEventRows = rateFilters.has('event');
    window.channelPreviewFilter = channelPreviewFilter;

    setRoomLevel(roomLevel, true);
    syncRateFilterDropdownUI();
    syncViewDropdownUI();

    const gapBtn = document.getElementById('btn-toggle-gaps');
    if (gapBtn) {
        gapBtn.className = highlightGaps
            ? "view-btn !bg-rose-600 !text-white !border-rose-600 cursor-pointer font-black text-xs px-2 py-1 rounded flex items-center gap-1 shadow-2xs"
            : "view-btn !bg-slate-100 text-slate-600 cursor-pointer font-black text-xs px-2 py-1 rounded border border-slate-300 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1";
    }
}

export function toggleHighlightGaps() {
    highlightGaps = !highlightGaps;
    saveGridPrefs();
    const btn = document.getElementById('btn-toggle-gaps');
    if (btn) {
        btn.className = highlightGaps
            ? "view-btn !bg-rose-600 !text-white !border-rose-600 cursor-pointer font-black text-xs px-2 py-1 rounded flex items-center gap-1 shadow-2xs"
            : "view-btn !bg-slate-100 text-slate-600 cursor-pointer font-black text-xs px-2 py-1 rounded border border-slate-300 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1";
    }
    renderRateMatrix();
}

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

export function showCmTooltip(e, text) {
    const tt = document.getElementById('cm-tooltip');
    if (!tt || !text) return;
    tt.innerText = text;
    tt.classList.remove('hidden');

    const pad = 12;
    let left = e.clientX + pad;
    let top = e.clientY + pad;

    if (left + 220 > window.innerWidth) left = e.clientX - 230;
    if (top + 60 > window.innerHeight) top = e.clientY - 70;

    tt.style.left = `${Math.max(10, left)}px`;
    tt.style.top = `${Math.max(10, top)}px`;
}

export function hideCmTooltip() {
    const tt = document.getElementById('cm-tooltip');
    if (tt) tt.classList.add('hidden');
}

const cleanBedId = id => String(id || '').trim().toUpperCase().replace(/[№#\-_:\s]/g, '');

export function calculateLiveInventory() {
    window.liveInventory = window.liveInventory || {};
    const curProp = window.currentPropertyId;
    const staffList = window.staff || [];
    const roomTypes = window.roomTypes || [];
    const totalRoomsByType = window.totalRoomsByType || {};

    const roomLookup = new Map();
    (window.hotelRooms || []).forEach(hr => {
        if (!hr || !hr.id) return;
        const cat = hr.category || hr.type;
        if (cat) {
            roomLookup.set(String(hr.id).trim().toUpperCase(), cat);
            roomLookup.set(cleanBedId(hr.id), cat);
        }
    });

    const todayMs = parseYMD(getLocalYMD(new Date()));
    const startInput = document.getElementById('tape-start')?.value || getLocalYMD(new Date());
    const tapeMs = parseYMD(startInput) || todayMs;
    const rangeStartMs = Math.min(todayMs, tapeMs) - (7 * 86400000);
    const rangeEndMs = Math.max(tapeMs + (90 * 86400000), todayMs + (250 * 86400000));

    for (let curMs = rangeStartMs; curMs <= rangeEndMs; curMs += 86400000) {
        const dStr = getLocalYMD(new Date(curMs));
        window.liveInventory[dStr] = window.liveInventory[dStr] || {};

        const occupied = {};
        roomTypes.forEach(rt => { occupied[rt] = 0; });

        if (Array.isArray(staffList)) {
            for (let j = 0; j < staffList.length; j++) {
                const s = staffList[j];
                if (!s) continue;

                const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                if (sProp && curProp && sProp !== curProp) continue;

                const rawSlots = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : [""]);
                const assignedSlots = rawSlots.filter(Boolean);
                const isUnassigned = assignedSlots.length === 0;

                if (typeof isOccupyingBooking === 'function' && !isOccupyingBooking(s.status, !isUnassigned)) continue;

                const cIn = s.checkIn;
                const cOut = s.checkOut;

                if (cIn && cOut && dStr >= cIn && dStr < cOut) {
                    assignedSlots.forEach(rId => {
                        const up = String(rId).trim().toUpperCase();
                        const cat = roomLookup.get(up) || roomLookup.get(cleanBedId(up)) || s.bookedType || s.category || s.roomType;
                        if (cat) {
                            const matchedRt = roomTypes.find(rt => rt.toLowerCase() === String(cat).toLowerCase());
                            if (matchedRt) {
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + 1;
                            }
                        }
                    });

                    const unassignedCount = Math.max(0, rawSlots.length - assignedSlots.length);
                    if (unassignedCount > 0) {
                        const fallbackCat = s.bookedType || s.category || s.roomType;
                        if (fallbackCat) {
                            const matchedRt = roomTypes.find(rt => rt.toLowerCase() === String(fallbackCat).toLowerCase());
                            if (matchedRt) {
                                const isDoubleDorm = /\b(double|queen|king|couple|2\s*pax)\b/i.test(`${matchedRt} ${fallbackCat}`);
                                const perBedCap = isDoubleDorm ? 2 : 1;
                                const unitDed = matchedRt.toLowerCase().includes('dorm')
                                    ? Math.max(unassignedCount, Math.ceil((parseInt(s.pax || 1, 10) || 1) / perBedCap))
                                    : unassignedCount;
                                occupied[matchedRt] = (occupied[matchedRt] || 0) + unitDed;
                            }
                        }
                    }
                }
            }
        }

        roomTypes.forEach(rt => {
            const cap = totalRoomsByType[rt] || 0;
            const occ = occupied[rt] || 0;
            window.liveInventory[dStr][rt] = Math.max(0, cap - occ);
        });
    }
}

export function markCellDirty(dateStr, room) {
    if (!dateStr || !room) return;
    window.dirtyCellKeys = window.dirtyCellKeys || new Set();
    window.justSyncedCellKeys = window.justSyncedCellKeys || new Set();
    const key = `${dateStr}|${room}`;
    window.dirtyCellKeys.add(key);
    window.justSyncedCellKeys.delete(key);
}

function isCellDirty(dateStr, room) {
    return !!(window.dirtyCellKeys && window.dirtyCellKeys.has(`${dateStr}|${room}`));
}

function isCellJustSynced(dateStr, room) {
    return !!(window.justSyncedCellKeys && window.justSyncedCellKeys.has(`${dateStr}|${room}`));
}

export function handleAvailEdit(dateStr, room, val) {
    markCellDirty(dateStr, `${room}_avail`);
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    if (val === "" || isNaN(parseFloat(val))) {
        delete window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`];
    } else {
        window.masterPricing.timeline[dateStr].otaOverrides[`${room}_avail`] = parseInt(val, 10);
    }
    if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'avail', `ROOM:${room}`);
    else window.dirtyDates.add(dateStr);
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleCellPriceLive(input, dateStr, room, field = 'std') {
    if (!input) return;
    const val = String(input.value || '').trim();

    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    if (val === "" || isNaN(parseFloat(val))) {
        delete rData[field];
        delete rData.isOverride[field];
    } else {
        rData[field] = roundCurrency(parseFloat(val));
        rData.isOverride[field] = true;
    }

    markCellDirty(dateStr, room);
    if (typeof window.markCmDirty === 'function') {
        window.markCmDirty(dateStr, 'rate', window.editMode === 'ripple' ? '*' : `ROOM:${room}`);
    } else {
        window.dirtyDates = window.dirtyDates || new Set();
        window.syncedDates = window.syncedDates || new Set();
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
    }
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
}

export function toggleMinStayMode(dateStr, room) {
    markCellDirty(dateStr, room);
    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    const gData = (room !== 'GLOBAL') ? (dObj.GLOBAL || {}) : {};

    if (rData.min !== undefined && rData.min !== "") {
        rData.min_arr = rData.min;
        delete rData.min;
        rData.isOverride.min_arr = true;
        delete rData.isOverride.min;
    } else if (rData.min_arr !== undefined && rData.min_arr !== "") {
        rData.min = rData.min_arr;
        delete rData.min_arr;
        rData.isOverride.min = true;
        delete rData.isOverride.min_arr;
    } else if (gData.min !== undefined && gData.min !== "") {
        rData.min_arr = gData.min;
        rData.isOverride.min_arr = true;
    } else if (gData.min_arr !== undefined && gData.min_arr !== "") {
        rData.min = gData.min_arr;
        rData.isOverride.min = true;
    } else {
        return;
    }

    if (typeof window.markCmDirty === 'function') {
        window.markCmDirty(dateStr, 'rate', room === 'GLOBAL' ? '*' : `ROOM:${room}`);
    } else {
        window.dirtyDates = window.dirtyDates || new Set();
        window.dirtyDates.add(dateStr);
    }
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
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
            const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor || r.source || r.from));
            anchors.forEach(a => { if (a && a !== 'unlinked') rippleDay(dateStr, a, true, 'rates'); });
        }
    } else {
        rData.std = roundCurrency(parseFloat(val));
        rData.isOverride.std = true;

        if (window.editMode === 'ripple') {
            rippleDay(dateStr, room, true, 'rates');
        }
    }

    markCellDirty(dateStr, room);
    if (typeof window.markCmDirty === 'function') {
        window.markCmDirty(dateStr, 'rate', window.editMode === 'ripple' ? '*' : `ROOM:${room}`);
    }
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleCellEdit(dateStr, room, field, val, isEvt = false) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

    const pfx = isEvt ? 'evt_' : '';

    if (field === 'min_hybrid' || field === 'min') {
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
            if (window.editMode === 'ripple') {
                rippleDay(dateStr, room, true, 'rates');
            }
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

    markCellDirty(dateStr, room);
    if (typeof window.markCmDirty === 'function') {
        const isRippledFmp = field === 'fmp' && window.editMode === 'ripple';
        window.markCmDirty(dateStr, 'rate', (room === 'GLOBAL' || isRippledFmp) ? '*' : `ROOM:${room}`);
    } else {
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
    }
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function handleOtaEdit(dateStr, ratePlanId, room, ruleType, ruleVal, field, val, rateSource = 'std') {
    markCellDirty(dateStr, `${room}|${ratePlanId}`);
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    window.masterPricing.timeline[dateStr].otaOverrides = window.masterPricing.timeline[dateStr].otaOverrides || {};
    const overrides = window.masterPricing.timeline[dateStr].otaOverrides;

    if (field === 'rate') {
        if (val === "" || isNaN(parseFloat(val))) {
            delete overrides[ratePlanId];
        } else {
            overrides[ratePlanId] = roundCurrency(parseFloat(val));
        }
    } else if (field === 'min' || field === 'min_hybrid') {
        const clean = String(val).trim();
        if (!clean || clean === "-" || clean === "0") {
            delete overrides[`${ratePlanId}_min`];
            delete overrides[`${ratePlanId}_min_arr`];
        } else if (/(\d+)\s*(a|>|▸)/i.test(clean)) {
            const match = clean.match(/(\d+)/);
            overrides[`${ratePlanId}_min_arr`] = match ? parseInt(match[1], 10) : 1;
            delete overrides[`${ratePlanId}_min`];
        } else {
            const match = clean.match(/(\d+)/);
            overrides[`${ratePlanId}_min`] = match ? parseInt(match[1], 10) : 1;
            delete overrides[`${ratePlanId}_min_arr`];
        }
    } else if (field === 'max') {
        if (val === "" || val === "-") delete overrides[`${ratePlanId}_max`];
        else overrides[`${ratePlanId}_max`] = parseInt(val, 10);
    }

    if (typeof window.markCmDirty === 'function') {
        window.markCmDirty(dateStr, 'rate', `PLAN:${ratePlanId}`);
    } else {
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
    }
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

            if (!isEvt && room !== 'GLOBAL') {
                delete rData.evt_stop;
                delete rData.evt_stopSell;
                delete rData.dir_stop;
                delete rData.dir_stopSell;
                if (dObj.otaOverrides) {
                    const roomLower = room.trim().toLowerCase();
                    (window.channexRateMap || []).forEach(rp => {
                        if (String(rp.pmsCategory || '').trim().toLowerCase() === roomLower) {
                            delete dObj.otaOverrides[`${rp.ratePlanId}_stop`];
                        }
                    });
                }
            }
        }
    }

    markCellDirty(dateStr, ratePlanId ? `${room}|${ratePlanId}` : room);
    if (typeof window.markCmDirty === 'function') {
        const target = ratePlanId ? `PLAN:${ratePlanId}` : (room === 'GLOBAL' ? '*' : `ROOM:${room}`);
        window.markCmDirty(dateStr, 'rate', target);
    } else {
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
    }
    window.markUnsavedChanges();
    renderRateMatrix();
}

export const getUnifiedRestrictionBadgeHtml = getRestrictionBadgeHtml;

function getCanonicalChannelBadgeHtml(code) {
    const c = resolveChannelCode(code);
    const colors = {
        BDC: 'bg-[#003580] text-white',
        HWL: 'bg-[#F15A24] text-white',
        AGO: 'bg-[#87B2D6] text-white',
        EXP: 'bg-[#facc15] text-[#003580]',
        ABB: 'bg-[#FF5A5F] text-white',
        TRP: 'bg-[#287DFA] text-white',
        WEB: 'bg-indigo-600 text-white'
    };
    const cls = colors[c] || 'bg-emerald-600 text-white';
    return `<span class="${cls} px-1 py-0.2 text-[8px] font-black rounded shrink-0">${c}</span>`;
}

export function unlockCellOverride(dateStr, room, ratePlanId = null) {
    if (ratePlanId) {
        if (window.masterPricing.timeline[dateStr]?.otaOverrides) {
            delete window.masterPricing.timeline[dateStr].otaOverrides[ratePlanId];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_min`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_min_arr`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_max`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_cta`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_ctd`];
            delete window.masterPricing.timeline[dateStr].otaOverrides[`${ratePlanId}_stop`];
        }
    } else {
        const rData = window.masterPricing.timeline[dateStr]?.[room];
        if (rData) {
            if (rData.isOverride) {
                delete rData.isOverride.std;
                delete rData.isOverride.fmp;
                delete rData.isOverride.fmp_ref;
            }
            if (rData._syncedStd !== undefined && rData._syncedStd !== "" && !isNaN(rData._syncedStd)) {
                rData.std = rData._syncedStd;
            } else {
                delete rData.std;
            }
            if (window.rippleDay) {
                const anchors = new Set((window.masterPricing.relationships || []).map(r => r.anchor || r.source || r.from));
                anchors.forEach(a => { if (a && a !== 'unlinked') rippleDay(dateStr, a, true, 'rates'); });
            }
        }
    }
    markCellDirty(dateStr, ratePlanId ? `${room}|${ratePlanId}` : room);
    if (typeof window.markCmDirty === 'function') {
        window.markCmDirty(dateStr, 'rate', ratePlanId ? `PLAN:${ratePlanId}` : '*');
    } else {
        window.dirtyDates.add(dateStr);
        window.syncedDates.delete(dateStr);
    }
    window.markUnsavedChanges();
    renderRateMatrix();
}

export function setRoomLevel(level, skipRender = false) {
    roomLevel = level;
    window.roomLevel = level;
    saveGridPrefs();
    ['anchors', 'all', 'dorms', 'privates'].forEach(l => {
        const btn = document.getElementById(`rlevel-${l}`);
        if (btn) {
            const isHidden = btn.classList.contains('hidden');
            btn.className = `${isHidden ? 'hidden ' : ''}px-2 py-0.5 rounded cursor-pointer transition-colors ${l === level ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-white'}`;
        }
    });
    if (!skipRender) renderRateMatrix();
}

export function setChannelPreviewFilter(val, skipRender = false) {
    channelPreviewFilter = val;
    window.channelPreviewFilter = val;
    saveGridPrefs();
    if (!skipRender) renderRateMatrix();
}

export function toggleRoomExpand(room) {
    if (expandedRooms.has(room)) expandedRooms.delete(room);
    else expandedRooms.add(room);
    localStorage.setItem('cm_ui_expanded', JSON.stringify(Array.from(expandedRooms)));
    renderRateMatrix();
}

export function restoreGridFocus(focusReq) {
    if (!focusReq) return;
    const body = document.getElementById('grid-body');
    if (!body) return;

    let elToFocus = focusReq.id ? document.getElementById(focusReq.id) : null;
    if (!elToFocus && focusReq.rowIdx !== undefined && focusReq.colIdx !== undefined) {
        const tr = body.children[focusReq.rowIdx];
        const td = tr?.children[focusReq.colIdx];
        if (td) {
            elToFocus = (focusReq.selector && td.querySelector(focusReq.selector)) || td.querySelector('input:not([disabled])');
        }
    }
    if (elToFocus) {
        elToFocus.focus({ preventScroll: true });
        if (typeof elToFocus.select === 'function') elToFocus.select();
    }
}

export function renderRateMatrix() {
    const tapeInput = document.getElementById('tape-start');
    if (tapeInput && !tapeInput.value) tapeInput.value = getLocalYMD(new Date());
    const startStr = tapeInput?.value || getLocalYMD(new Date());

    // Sync if external caller (e.g. Event Curve Tuner) enabled window.showEventRows
    if (window.showEventRows === true && !rateFilters.has('event')) {
        rateFilters.add('event');
        saveGridPrefs();
        syncRateFilterDropdownUI();
    }

    calculateLiveInventory();

    const head = document.getElementById('grid-head');
    const body = document.getElementById('grid-body');
    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    const dObj = new Date(startStr + "T12:00:00Z");
    const isEvents = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : false;

    const showAvail = viewFields.has('avail');
    const showPrice = viewFields.has('price');
    const showTop = viewFields.has('minmax');
    const showBottom = viewFields.has('restrictions');
    const showAnyRateLayer = showPrice || showTop || showBottom;
    const bandCount = (showTop ? 1 : 0) + (showPrice ? 1 : 0) + (showBottom ? 1 : 0);
    const isSingleBandRow = bandCount <= 1;

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

        const headerClick = (isEvents && minDiff === 0)
            ? `window.openCurveTunerForDate('${dateStr}')`
            : `window.cycleUnifiedRestriction('${dateStr}', 'GLOBAL')`;
        const headerTitle = (isEvents && minDiff === 0)
            ? 'Peak Event Date — Click to open Event Curve Tuner'
            : 'Click to cycle GLOBAL CTA/CTD/STOP';

        trHead += `<th class="px-0 py-0.5 border-b ${highlight} text-center cursor-pointer" style="width: 42px; min-width: 42px; max-width: 42px;" onclick="${headerClick}" title="${headerTitle}">
            <span class="block text-[8px] font-bold uppercase leading-none">${mNames[cur.getUTCMonth()]}</span>
            <span class="block text-[11px] font-black leading-tight mt-0.5">${cur.getUTCDate()}</span>
        </th>`;
    }
    trHead += `</tr>`;
    head.innerHTML = trHead;

    const { all: allRoomCats, dorms: dormCats, privates: privCats } = getClassifiedRooms();
    const hasMixedCategories = dormCats.length > 0 && privCats.length > 0;
    const dormBtn = document.getElementById('rlevel-dorms');
    const privBtn = document.getElementById('rlevel-privates');
    if (dormBtn) dormBtn.classList.toggle('hidden', !hasMixedCategories);
    if (privBtn) privBtn.classList.toggle('hidden', !hasMixedCategories);
    if (!hasMixedCategories && (roomLevel === 'dorms' || roomLevel === 'privates')) {
        roomLevel = 'all';
    }

    // 2. Room Category Iteration
    let targetRooms = [...allRoomCats];
    const anchorP = window.pricingRules?.anchorPrivate;
    const anchorD = window.pricingRules?.anchorDorm;

    if (roomLevel === 'anchors') {
        targetRooms = Array.from(new Set([anchorP, anchorD].filter(Boolean)));
        if (targetRooms.length === 0 && allRoomCats.length > 0) targetRooms = [allRoomCats[0]];
    } else if (roomLevel === 'dorms') {
        targetRooms = dormCats;
    } else if (roomLevel === 'privates') {
        targetRooms = privCats;
    }

    const activePreviewFilter = window.channelPreviewFilter || channelPreviewFilter || 'ALL';
    const linkedTargetSet = new Set(
        (window.masterPricing?.relationships || [])
            .filter(rel => (rel.anchor || rel.source || rel.from) && (rel.anchor || rel.source || rel.from) !== 'unlinked')
            .map(rel => String(rel.target || rel.to || rel.roomB || '').trim().toLowerCase())
            .filter(Boolean)
    );
    let allRowsHtml = '';

    targetRooms.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        const displayName = window.displayAbbrev?.[room] || room;
        const roomLower = room.trim().toLowerCase();
        const isLinkedTargetRoom = linkedTargetSet.has(roomLower);
        const allMappedRates = (window.channexRateMap || []).filter(m => String(m.pmsCategory || '').trim().toLowerCase() === roomLower);

        const isRoomManuallyExpanded = expandedRooms.has(room);
        const activeBuckets = isRoomManuallyExpanded ? new Set(ALL_RATE_KEYS) : rateFilters;

        const showMasterDef = activeBuckets.has('def') && activeBuckets.has('std');
        const showMasterDirect = activeBuckets.has('direct') && activeBuckets.has('std');
        const showMasterEvent = isEvents && activeBuckets.has('def') && activeBuckets.has('event');

        const ghostRoomLookup = new Map(
            (window.channexMap || [])
                .filter(m => m && m.isGhost && m.channexId)
                .map(m => [m.channexId, m])
        );

        let mappedRates = allMappedRates.filter(r => {
            const chanCode = resolveChannelCode(r.channel || r.ratePlanTitle);
            const srcBucket = classifyRatePlanSource(r, ghostRoomLookup);
            const isEvt = isEventRatePlan(r);
            const isRefPlan = isRefundableRatePlan(r);

            if (isEvt && !isEvents) return false;
            if (srcBucket === 'def' && !isEvt && !isRefPlan) return false;
            if (activePreviewFilter !== 'ALL' && chanCode !== activePreviewFilter) return false;

            const matchesTier = isEvt ? activeBuckets.has('event') : activeBuckets.has('std');
            return activeBuckets.has(srcBucket) && matchesTier;
        });

        const hasHiddenPlans = allMappedRates.some(r => {
            const srcBucket = classifyRatePlanSource(r, ghostRoomLookup);
            const isEvt = isEventRatePlan(r);
            if (isEvt && !isEvents) return false;
            const matchesTier = isEvt ? rateFilters.has('event') : rateFilters.has('std');
            return !(rateFilters.has(srcBucket) && matchesTier);
        }) || !rateFilters.has('direct') || (isEvents && (!rateFilters.has('def') || !rateFilters.has('event')));

        const safeRoom = room.replace(/'/g, "\\'");
        const sourceRank = { def: 0, direct: 1, ota: 2, ghost: 3 };
        mappedRates.sort((a, b) => {
            const srcA = classifyRatePlanSource(a, ghostRoomLookup);
            const srcB = classifyRatePlanSource(b, ghostRoomLookup);
            if (sourceRank[srcA] !== sourceRank[srcB]) return sourceRank[srcA] - sourceRank[srcB];
            const chanA = resolveChannelCode(a.channel || a.ratePlanTitle);
            const chanB = resolveChannelCode(b.channel || b.ratePlanTitle);
            if (chanA !== chanB) return chanA.localeCompare(chanB);
            const evtA = isEventRatePlan(a) ? 1 : 0;
            const evtB = isEventRatePlan(b) ? 1 : 0;
            if (evtA !== evtB) return evtA - evtB;
            const refA = isRefundableRatePlan(a) ? 1 : 0;
            const refB = isRefundableRatePlan(b) ? 1 : 0;
            if (refA !== refB) return refA - refB;
            return String(a.ratePlanTitle || '').localeCompare(String(b.ratePlanTitle || ''));
        });

        const expandBtnHtml = (hasHiddenPlans && showAnyRateLayer)
            ? `<button type="button" onclick="window.toggleRoomExpand('${safeRoom}')" class="text-slate-500 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-300 rounded px-1 py-0.2 cursor-pointer flex items-center gap-0.5 text-[9px] font-black uppercase" title="Expand/Collapse all rate layers for this room">
                    <i data-lucide="${isRoomManuallyExpanded ? 'chevron-down' : 'chevron-right'}" size="11"></i>
                    <span>${isRoomManuallyExpanded ? 'Hide' : 'Rates'}</span>
               </button>`
            : '';

        allRowsHtml += `<tr class="bg-white border-t-[3px] border-slate-900 border-b border-slate-300">
            <td colspan="${daysToRender + 1}" class="!text-left p-0 bg-white" style="text-align: left;">
                <div class="sticky left-0 z-20 inline-flex items-center gap-2 px-2 py-1 bg-white text-left" style="left: 0;">
                    <span class="font-black text-xs uppercase tracking-wide text-slate-950 whitespace-nowrap">${room}</span>
                    ${expandBtnHtml}
                </div>
            </td>
        </tr>`;

        // Availability Row
        if (showAvail) {
            let trAvail = `<tr class="${groupClass} border-b border-slate-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full font-bold text-slate-600 text-[10px]">
                        <span class="truncate">Availability</span>
                        <span class="text-[8px] font-bold text-slate-400">AVL</span>
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

                trAvail += `<td class="p-0 border-r border-slate-200 ${otaAvail !== undefined ? '!bg-amber-100' : 'bg-slate-50/80'} text-center" style="width: 42px; min-width: 42px; max-width: 42px;">
                    <input type="number" class="cell-avail-input w-full text-center outline-none bg-transparent text-[10px] ${availColor} font-bold px-0 py-1" value="${displayVal}" onfocus="this.select()" onchange="window.handleAvailEdit('${dateStr}', '${safeRoom}', this.value)">
                </td>`;
            }
            trAvail += `</tr>`;
            allRowsHtml += trAvail;
        }

        if (!showAnyRateLayer) return;

        // Master DEF Non-Ref Row
        if (showMasterDef) {
            let trRate = `<tr class="${groupClass} border-b border-slate-300">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 border-l-[3px] border-l-slate-500 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                    <div class="w-[140px] ${isSingleBandRow ? 'h-[22px]' : 'py-1'} flex items-center justify-between gap-1 px-1.5 text-left">
                        <span class="text-[10px] font-black text-slate-800 truncate">DEF Non-Ref</span>
                        <span class="text-[7px] font-black uppercase text-slate-700 bg-slate-200/80 px-1 py-0.5 rounded border border-slate-300 shrink-0">DEF</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const rData = dayObj[room] || {};
                const gData = dayObj.GLOBAL || {};
                const isPinned = !!rData.isOverride?.std;
                const rawStd = rData.std !== undefined && rData.std !== "" ? rData.std : "";
                const displayPrice = rawStd !== "" && !isNaN(parseFloat(rawStd)) ? Math.round(parseFloat(rawStd)) : "";

                const hasRoomMin = (rData.min !== undefined && rData.min !== "") || (rData.min_arr !== undefined && rData.min_arr !== "");
                const minVal = hasRoomMin
                    ? (rData.min !== undefined && rData.min !== "" ? rData.min : `${rData.min_arr}▸`)
                    : (gData.min !== undefined && gData.min !== "" ? gData.min : (gData.min_arr ? `${gData.min_arr}▸` : ""));
                const isGlobalMin = !hasRoomMin && minVal !== "";

                const hasRoomMax = rData.max !== undefined && rData.max !== "";
                const maxVal = hasRoomMax ? rData.max : (gData.max !== undefined && gData.max !== "" ? gData.max : "");
                const isGlobalMax = !hasRoomMax && maxVal !== "";

                const effCta = rData.cta !== undefined ? !!rData.cta : !!gData.cta;
                const effCtd = rData.ctd !== undefined ? !!rData.ctd : !!gData.ctd;
                const isStopped = (rData.stop !== undefined || rData.stopSell !== undefined)
                    ? !!(rData.stop || rData.stopSell)
                    : !!(gData.stop || gData.stopSell);
                const pillHtml = getUnifiedRestrictionBadgeHtml(effCta, effCtd, isStopped);

                const isDirty = isCellDirty(dateStr, room);
                const isSynced = isCellJustSynced(dateStr, room);
                const isBrokenRipple = isLinkedTargetRoom && isPinned;
                const isGap = highlightGaps && (displayPrice === "" || displayPrice === null || displayPrice === undefined);

                let stateBgClass = '';
                if (isStopped) stateBgClass = 'rate-cell-stopped';
                else if (isDirty) stateBgClass = '!bg-amber-100 ring-1 ring-inset ring-amber-400';
                else if (isSynced) stateBgClass = '!bg-emerald-50 ring-1 ring-inset ring-emerald-300';
                else if (isGap) stateBgClass = 'gap-cell-highlight';

                let cellClass = `p-0 border-r border-slate-200 text-center relative ${stateBgClass}`;
                const pinCornerHtml = isBrokenRipple
                    ? `<span class="pointer-events-none absolute top-0 right-0 w-0 h-0 border-t-[7px] border-l-[7px] border-t-orange-500 border-l-transparent z-10" title="Pinned Override (breaks ripple — double-click to re-link)"></span>`
                    : '';
                const stateNote = isDirty ? ' • Unsaved' : (isSynced ? ' • Just Synced' : '');
                const pinNote = isBrokenRipple ? ' • Pinned (Double-click to re-link)' : '';
                const minTip = minVal ? `${minVal}${isGlobalMin ? ' (Global)' : ''}` : '--';
                const maxTip = maxVal ? `${maxVal}${isGlobalMax ? ' (Global)' : ''}` : '--';

                trRate += `<td class="${cellClass}" style="width: 42px; min-width: 42px; max-width: 42px;" ondblclick="window.unlockCellOverride('${dateStr}', '${safeRoom}')" onmouseenter="window.showCmTooltip(event, '${displayName} | ${dateStr}\\nDEF Non-Ref: ฿${displayPrice || '--'}${stateNote}${pinNote}\\nMin: ${minTip}, Max: ${maxTip}')" onmouseleave="window.hideCmTooltip()">
                    ${pinCornerHtml}
                    ${showTop ? `
                    <div class="flex items-center w-full h-[15px] ${showPrice || showBottom ? 'border-b' : ''} ${isStopped ? 'border-rose-700 bg-transparent' : 'border-slate-200 bg-slate-50/70'} overflow-hidden leading-none">
                        <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black ${isGlobalMin && !isStopped ? 'text-indigo-600/80' : 'text-slate-700'} outline-none p-0" value="${minVal}" placeholder="Min" title="Min Stay (e.g. 3 or 3▸ for Arrival; double-click to toggle)" ondblclick="event.stopPropagation(); window.toggleMinStayMode('${dateStr}', '${safeRoom}')" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${safeRoom}', 'min_hybrid', this.value)">
                        <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none ${isGlobalMax && !isStopped ? 'text-indigo-500/80' : 'text-slate-500'} outline-none p-0 border-l ${isStopped ? 'border-rose-700' : 'border-slate-200'}" value="${maxVal}" placeholder="Max" title="Max Stay" onchange="window.handleCellEdit('${dateStr}', '${safeRoom}', 'max', this.value)">
                    </div>` : ''}

                    ${showPrice ? `
                    <div class="${(!showTop && !showBottom) ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                        <input type="number" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_std" data-fill-room="${room}" data-fill-field="std" data-fill-date="${dateStr}" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[11px] ${isDirty && !isStopped ? '!text-amber-950' : 'text-slate-800'} px-0" value="${displayPrice}" onfocus="this.select()" oninput="window.handleCellPriceLive(this, '${dateStr}', '${safeRoom}', 'std')" onchange="window.handleCellPriceChange(event, '${dateStr}', '${safeRoom}')">
                    </div>` : ''}

                    ${showBottom ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none ${(!showTop && !showPrice) ? 'h-[20px]' : 'h-[13px] border-t'} ${isStopped ? 'border-rose-700' : 'border-slate-100'}">
                        <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${safeRoom}')" class="cursor-pointer w-full h-full flex items-center justify-center" title="Click to cycle: Open → CTA → CTD → CTB → STOP">
                            ${pillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trRate += `</tr>`;
            allRowsHtml += trRate;
        }

        // Master DEF Event Non-Ref Row
        if (showMasterEvent) {
            let trEvt = `<tr class="${groupClass} border-b-2 border-pink-300 bg-pink-50/40">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 border-l-[3px] border-l-pink-500 !bg-pink-50">
                    <div class="w-[140px] ${isSingleBandRow ? 'h-[22px]' : 'py-1'} flex items-center justify-between gap-1 px-1.5 text-left" title="DEF Event Non-Ref">
                        <span class="text-[10px] font-black text-pink-900 ${isSingleBandRow ? 'truncate min-w-0' : 'leading-[1.15] whitespace-normal break-words'}">DEF Event Non-Ref</span>
                        <span class="text-[7px] font-black uppercase text-white bg-pink-600 px-1 py-0.2 rounded shrink-0">EVT</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const rData = dayObj[room] || {};
                const rawFmp = rData.fmp !== undefined && rData.fmp !== "" ? rData.fmp : "";
                const displayFmp = rawFmp !== "" && !isNaN(parseFloat(rawFmp)) ? Math.round(parseFloat(rawFmp)) : "";
                const isPinnedFmp = !!rData.isOverride?.fmp;

                const evtMinVal = rData.evt_min !== undefined && rData.evt_min !== ""
                    ? rData.evt_min
                    : (rData.evt_min_arr ? `${rData.evt_min_arr}▸` : (dayObj.evtRestrictions?.min || (dayObj.evtRestrictions?.min_arr ? `${dayObj.evtRestrictions.min_arr}▸` : "")));
                const evtMaxVal = rData.evt_max !== undefined && rData.evt_max !== "" ? rData.evt_max : (dayObj.evtRestrictions?.max || "");
                const evtCta = rData.evt_cta !== undefined ? !!rData.evt_cta : !!dayObj.evtRestrictions?.cta;
                const evtCtd = rData.evt_ctd !== undefined ? !!rData.evt_ctd : !!dayObj.evtRestrictions?.ctd;
                const evtStopped = rData.evt_stop !== undefined ? !!(rData.evt_stop || rData.evt_stopSell) : !!dayObj.evtRestrictions?.stop;
                const evtPillHtml = getUnifiedRestrictionBadgeHtml(evtCta, evtCtd, evtStopped);

                const isDirtyEvt = isCellDirty(dateStr, room);
                const isSyncedEvt = isCellJustSynced(dateStr, room);
                const isBrokenRippleEvt = isLinkedTargetRoom && isPinnedFmp;

                let evtStateBgClass = '!bg-pink-50/40';
                if (evtStopped) evtStateBgClass = 'rate-cell-stopped';
                else if (isDirtyEvt) evtStateBgClass = '!bg-amber-100 ring-1 ring-inset ring-amber-400';
                else if (isSyncedEvt) evtStateBgClass = '!bg-emerald-50 ring-1 ring-inset ring-emerald-300';
                else if (isPinnedFmp) evtStateBgClass = 'rate-cell-pinned !bg-amber-50';

                const evtPinCornerHtml = isBrokenRippleEvt
                    ? `<span class="pointer-events-none absolute top-0 right-0 w-0 h-0 border-t-[7px] border-l-[7px] border-t-orange-500 border-l-transparent z-10" title="Pinned Event Override (breaks ripple — double-click to re-link)"></span>`
                    : '';

                trEvt += `<td class="p-0 border-r border-pink-200 text-center relative ${evtStateBgClass}" style="width: 42px; min-width: 42px; max-width: 42px;">
                    ${evtPinCornerHtml}
                    ${showTop ? `
                    <div class="flex items-center w-full h-[15px] ${showPrice || showBottom ? 'border-b' : ''} ${evtStopped ? 'border-rose-700 bg-transparent' : 'border-pink-200 bg-white/60'} overflow-hidden leading-none">
                        <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black text-pink-800 outline-none p-0" value="${evtMinVal}" placeholder="Min" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${safeRoom}', 'min_hybrid', this.value, true)">
                        <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-pink-500 outline-none p-0 border-l ${evtStopped ? 'border-rose-700' : 'border-pink-200'}" value="${evtMaxVal}" placeholder="Max" onchange="window.handleCellEdit('${dateStr}', '${safeRoom}', 'max', this.value, true)">
                    </div>` : ''}

                    ${showPrice ? `
                    <div class="${(!showTop && !showBottom) ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                        <input type="number" data-fill-room="${room}" data-fill-field="fmp" data-fill-date="${dateStr}" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] ${isDirtyEvt && !evtStopped ? '!text-amber-950' : 'text-pink-800'} px-0" value="${displayFmp}" onfocus="this.select()" oninput="window.handleCellPriceLive(this, '${dateStr}', '${safeRoom}', 'fmp')" onchange="window.handleCellEdit('${dateStr}', '${safeRoom}', 'fmp', this.value, true)">
                    </div>` : ''}

                    ${showBottom ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none ${(!showTop && !showPrice) ? 'h-[20px]' : 'h-[13px] border-t'} ${evtStopped ? 'border-rose-700' : 'border-pink-200/70'}">
                        <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${safeRoom}', null, true)" class="cursor-pointer w-full h-full flex items-center justify-center" title="Click to cycle Event restrictions">
                            ${evtPillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trEvt += `</tr>`;
            allRowsHtml += trEvt;
        }

        // Master Direct Rate Row
        if (showMasterDirect) {
            let trDir = `<tr class="bg-emerald-50/50 border-b border-emerald-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 border-l-[3px] border-l-emerald-500 !bg-emerald-50">
                    <div class="w-[140px] ${isSingleBandRow ? 'h-[22px]' : 'py-1'} flex items-center justify-between px-1.5 text-left">
                        <span class="text-[10px] font-black text-emerald-900 truncate">Direct Rate</span>
                        <span class="text-[7px] font-black uppercase text-white bg-emerald-600 px-1 py-0.5 rounded shrink-0">DIR</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const rData = dayObj[room] || {};
                const gData = dayObj.GLOBAL || {};
                const isPinnedDir = rData.dir_std !== undefined && rData.dir_std !== "";
                const computedDir = computeDynamicPlanRate
                    ? computeDynamicPlanRate(dateStr, room, { channel: 'WEB', policy: 'non-ref', product: 'std' })
                    : null;
                const rawDir = isPinnedDir ? rData.dir_std : (computedDir ?? rData.std ?? "");
                const displayDir = rawDir !== "" && rawDir !== null && !isNaN(parseFloat(rawDir)) ? Math.round(parseFloat(rawDir)) : "";

                const hasDirMin = (rData.dir_min !== undefined && rData.dir_min !== "") || (rData.dir_min_arr !== undefined && rData.dir_min_arr !== "");
                const hasRoomMin = (rData.min !== undefined && rData.min !== "") || (rData.min_arr !== undefined && rData.min_arr !== "");
                const dirMinVal = hasDirMin
                    ? (rData.dir_min !== undefined && rData.dir_min !== "" ? rData.dir_min : `${rData.dir_min_arr}▸`)
                    : (hasRoomMin
                        ? (rData.min !== undefined && rData.min !== "" ? rData.min : `${rData.min_arr}▸`)
                        : (gData.min !== undefined && gData.min !== "" ? gData.min : (gData.min_arr ? `${gData.min_arr}▸` : "")));
                const dirMaxVal = (rData.dir_max !== undefined && rData.dir_max !== "")
                    ? rData.dir_max
                    : ((rData.max !== undefined && rData.max !== "") ? rData.max : (gData.max || ""));
                const dirCta = rData.dir_cta !== undefined ? !!rData.dir_cta : (rData.cta !== undefined ? !!rData.cta : !!gData.cta);
                const dirCtd = rData.dir_ctd !== undefined ? !!rData.dir_ctd : (rData.ctd !== undefined ? !!rData.ctd : !!gData.ctd);
                const dirStopped = (rData.dir_stop !== undefined || rData.dir_stopSell !== undefined)
                    ? !!(rData.dir_stop || rData.dir_stopSell)
                    : ((rData.stop !== undefined || rData.stopSell !== undefined) ? !!(rData.stop || rData.stopSell) : !!(gData.stop || gData.stopSell));
                const dirPillHtml = getUnifiedRestrictionBadgeHtml(dirCta, dirCtd, dirStopped);

                trDir += `<td class="p-0 border-r border-emerald-200 text-center relative ${dirStopped ? 'rate-cell-stopped' : (isPinnedDir ? 'rate-cell-pinned !bg-amber-100' : '')}" style="width: 42px; min-width: 42px; max-width: 42px;">
                    ${showTop ? `
                    <div class="flex items-center w-full h-[15px] ${showPrice || showBottom ? 'border-b' : ''} ${dirStopped ? 'border-rose-700 bg-transparent' : 'border-emerald-200 bg-white/70'} overflow-hidden leading-none">
                        <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black text-emerald-800 outline-none p-0" value="${dirMinVal}" placeholder="Min" onchange="window.handleDirectEdit('${dateStr}', '${safeRoom}', 'min', this.value)">
                        <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-emerald-600 outline-none p-0 border-l ${dirStopped ? 'border-rose-700' : 'border-emerald-200'}" value="${dirMaxVal}" placeholder="Max" onchange="window.handleDirectEdit('${dateStr}', '${safeRoom}', 'max', this.value)">
                    </div>` : ''}

                    ${showPrice ? `
                    <div class="${(!showTop && !showBottom) ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                        <input type="number" data-fill-room="${room}" data-fill-field="dir_std" data-fill-date="${dateStr}" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-emerald-900 px-0" value="${displayDir}" onfocus="this.select()" onchange="window.handleDirectEdit('${dateStr}', '${safeRoom}', 'rate', this.value)">
                    </div>` : ''}

                    ${showBottom ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none ${(!showTop && !showPrice) ? 'h-[20px]' : 'h-[13px] border-t'} ${dirStopped ? 'border-rose-700' : 'border-emerald-200/70'}">
                        <button type="button" onclick="event.stopPropagation(); window.cycleDirectRestriction('${dateStr}', '${safeRoom}')" class="cursor-pointer w-full h-full flex items-center justify-center" title="Direct booking restriction (independent of OTAs)">
                            ${dirPillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trDir += `</tr>`;
            allRowsHtml += trDir;
        }

        // Mapped Channel / Event / Ref / Ghost Rate Plans
        if (mappedRates.length > 0) {
            mappedRates.forEach(rate => {
                const chanCode = resolveChannelCode(rate.channel || rate.ratePlanTitle);
                const badgeHtml = getCanonicalChannelBadgeHtml(chanCode);
                const ghostRoomMeta = ghostRoomLookup.get(rate.channexRoomId);
                const isGhostRate = !!rate.isGhost || !!ghostRoomMeta;
                const isEvtMappedRate = isEvents && isEventRatePlan(rate);
                const isRefMappedRate = isRefundableRatePlan(rate);
                const ghostTitle = ghostRoomMeta?.channexTitle || 'Ghost Room';
                const displayRateTitle = formatCmRateDisplayTitle(rate.ratePlanTitle);

                const ghostBadgeHtml = isGhostRate
                    ? `<span class="px-1 py-0.2 rounded bg-violet-600 text-white text-[7px] font-black uppercase shrink-0">GHOST</span>`
                    : '';
                const evtBadgeHtml = isEvtMappedRate
                    ? `<span class="px-1 py-0.2 rounded bg-pink-600 text-white text-[7px] font-black uppercase shrink-0">EVT</span>`
                    : '';
                const policyBadgeHtml = isRefMappedRate
                    ? `<span class="px-1 py-0.2 rounded bg-sky-100 text-sky-800 border border-sky-300 text-[7px] font-black uppercase shrink-0">REF</span>`
                    : '';

                let rowBorderCls = 'border-b border-slate-200';
                let frozenBgCls = '!bg-slate-50 border-l-[3px] border-l-indigo-400';
                let labelTextCls = 'text-slate-800';
                let defaultCellTintCls = '!bg-indigo-50/15';
                let cellBorderCls = 'border-indigo-100';

                if (isGhostRate) {
                    rowBorderCls = 'border-b border-violet-200 border-dashed';
                    frozenBgCls = '!bg-violet-50 border-l-[3px] border-l-violet-500';
                    labelTextCls = 'text-violet-950';
                    defaultCellTintCls = '!bg-violet-50/30';
                    cellBorderCls = 'border-violet-200';
                } else if (isEvtMappedRate && isRefMappedRate) {
                    rowBorderCls = 'border-b border-fuchsia-200';
                    frozenBgCls = '!bg-fuchsia-50 border-l-[3px] border-l-fuchsia-500';
                    labelTextCls = 'text-fuchsia-950';
                    defaultCellTintCls = '!bg-fuchsia-50/35';
                    cellBorderCls = 'border-fuchsia-200';
                } else if (isEvtMappedRate) {
                    rowBorderCls = 'border-b border-pink-200';
                    frozenBgCls = '!bg-pink-50 border-l-[3px] border-l-pink-500';
                    labelTextCls = 'text-pink-950';
                    defaultCellTintCls = '!bg-pink-50/35';
                    cellBorderCls = 'border-pink-200';
                } else if (isRefMappedRate) {
                    rowBorderCls = 'border-b border-sky-200';
                    frozenBgCls = '!bg-sky-50 border-l-[3px] border-l-sky-500';
                    labelTextCls = 'text-sky-950';
                    defaultCellTintCls = '!bg-sky-50/35';
                    cellBorderCls = 'border-sky-200';
                } else if (chanCode === 'WEB') {
                    rowBorderCls = 'border-b border-emerald-200';
                    frozenBgCls = '!bg-emerald-50 border-l-[3px] border-l-emerald-500';
                    labelTextCls = 'text-emerald-950';
                    defaultCellTintCls = '!bg-emerald-50/30';
                    cellBorderCls = 'border-emerald-200';
                }

                const rowTitleAttr = (isGhostRate ? `[GHOST: ${ghostTitle}] ${rate.ratePlanTitle || ''}` : (rate.ratePlanTitle || '')).replace(/"/g, '&quot;');
                const frozenInnerHtml = isSingleBandRow
                    ? `<div class="w-[140px] h-[22px] flex items-center gap-1 px-1.5 text-left overflow-hidden" title="${rowTitleAttr}">
                            <div class="flex items-center gap-0.5 shrink-0">${badgeHtml}${ghostBadgeHtml}${evtBadgeHtml}${policyBadgeHtml}</div>
                            <span class="text-[9px] font-black leading-none truncate min-w-0 ${labelTextCls}">${displayRateTitle}</span>
                       </div>`
                    : `<div class="w-[140px] flex flex-col justify-center gap-0.5 px-1.5 py-1 text-left" title="${rowTitleAttr}">
                            <div class="flex flex-wrap items-center gap-1">${badgeHtml}${ghostBadgeHtml}${evtBadgeHtml}${policyBadgeHtml}</div>
                            <div class="text-[9px] font-black leading-[1.15] whitespace-normal break-words ${labelTextCls}">${displayRateTitle}</div>
                       </div>`;

                let trOta = `<tr class="${rowBorderCls}">
                    <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${frozenBgCls}">
                        ${frozenInnerHtml}
                    </td>`;

                for (let i = 0; i < daysToRender; i++) {
                    const cur = new Date(dObj);
                    cur.setUTCDate(cur.getUTCDate() + i);
                    const dateStr = getLocalYMD(cur);
                    const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                    const rData = dayObj[room] || {};
                    const gData = dayObj.GLOBAL || {};
                    const otaOverride = dayObj.otaOverrides?.[rate.ratePlanId];
                    const rawComputed = otaOverride !== undefined ? otaOverride : (computeDynamicPlanRate ? computeDynamicPlanRate(dateStr, room, rate) : "");
                    const computed = rawComputed !== "" && rawComputed !== null && !isNaN(parseFloat(rawComputed)) ? Math.round(parseFloat(rawComputed)) : "";

                    const hasNonEmpty = v => v !== undefined && v !== null && v !== "";

                    const rawOtaMin = dayObj.otaOverrides?.[`${rate.ratePlanId}_min`];
                    const rawOtaMinArr = dayObj.otaOverrides?.[`${rate.ratePlanId}_min_arr`];
                    const hasOtaMin = hasNonEmpty(rawOtaMin) || hasNonEmpty(rawOtaMinArr);
                    const hasEvtRoomMin = isEvtMappedRate && (hasNonEmpty(rData.evt_min) || hasNonEmpty(rData.evt_min_arr));
                    const hasEvtDayMin = isEvtMappedRate && (hasNonEmpty(dayObj.evtRestrictions?.min) || hasNonEmpty(dayObj.evtRestrictions?.min_arr));
                    const hasRoomMin = hasNonEmpty(rData.min) || hasNonEmpty(rData.min_arr);

                    const otaMin = hasOtaMin
                        ? (hasNonEmpty(rawOtaMin) ? rawOtaMin : `${rawOtaMinArr}▸`)
                        : (hasEvtRoomMin
                            ? (hasNonEmpty(rData.evt_min) ? rData.evt_min : `${rData.evt_min_arr}▸`)
                            : (hasEvtDayMin
                                ? (hasNonEmpty(dayObj.evtRestrictions?.min) ? dayObj.evtRestrictions.min : `${dayObj.evtRestrictions.min_arr}▸`)
                                : (hasRoomMin
                                    ? (hasNonEmpty(rData.min) ? rData.min : `${rData.min_arr}▸`)
                                    : (hasNonEmpty(gData.min) ? gData.min : (hasNonEmpty(gData.min_arr) ? `${gData.min_arr}▸` : "")))));

                    const rawOtaMax = dayObj.otaOverrides?.[`${rate.ratePlanId}_max`];
                    const otaMax = hasNonEmpty(rawOtaMax)
                        ? rawOtaMax
                        : (isEvtMappedRate && hasNonEmpty(rData.evt_max)
                            ? rData.evt_max
                            : (isEvtMappedRate && hasNonEmpty(dayObj.evtRestrictions?.max)
                                ? dayObj.evtRestrictions.max
                                : (hasNonEmpty(rData.max) ? rData.max : (gData.max || ""))));

                    const rawOtaStop = dayObj.otaOverrides?.[`${rate.ratePlanId}_stop`];
                    const rawOtaCta = dayObj.otaOverrides?.[`${rate.ratePlanId}_cta`];
                    const rawOtaCtd = dayObj.otaOverrides?.[`${rate.ratePlanId}_ctd`];
                    const otaStop = rawOtaStop !== undefined
                        ? !!rawOtaStop
                        : (isEvtMappedRate && (rData.evt_stop !== undefined || rData.evt_stopSell !== undefined)
                            ? !!(rData.evt_stop || rData.evt_stopSell)
                            : (isEvtMappedRate && dayObj.evtRestrictions?.stop !== undefined
                                ? !!dayObj.evtRestrictions.stop
                                : ((rData.stop !== undefined || rData.stopSell !== undefined) ? !!(rData.stop || rData.stopSell) : !!(gData.stop || gData.stopSell))));
                    const otaCta = rawOtaCta !== undefined
                        ? !!rawOtaCta
                        : (isEvtMappedRate && rData.evt_cta !== undefined
                            ? !!rData.evt_cta
                            : (isEvtMappedRate && dayObj.evtRestrictions?.cta !== undefined
                                ? !!dayObj.evtRestrictions.cta
                                : (rData.cta !== undefined ? !!rData.cta : !!gData.cta)));
                    const otaCtd = rawOtaCtd !== undefined
                        ? !!rawOtaCtd
                        : (isEvtMappedRate && rData.evt_ctd !== undefined
                            ? !!rData.evt_ctd
                            : (isEvtMappedRate && dayObj.evtRestrictions?.ctd !== undefined
                                ? !!dayObj.evtRestrictions.ctd
                                : (rData.ctd !== undefined ? !!rData.ctd : !!gData.ctd)));
                    const otaPillHtml = getUnifiedRestrictionBadgeHtml(otaCta, otaCtd, otaStop);

                    const cellStateCls = otaStop
                        ? 'rate-cell-stopped'
                        : (otaOverride !== undefined ? 'rate-cell-pinned !bg-amber-100' : defaultCellTintCls);

                    trOta += `<td class="p-0 border-r ${cellBorderCls} text-center relative ${cellStateCls}" style="width: 42px; min-width: 42px; max-width: 42px;" ondblclick="window.unlockCellOverride('${dateStr}', '${safeRoom}', '${rate.ratePlanId}')">
                        ${showTop ? `
                        <div class="flex items-center w-full h-[15px] ${showPrice || showBottom ? 'border-b' : ''} ${otaStop ? 'border-rose-700 bg-transparent' : `${cellBorderCls} bg-white/60`} overflow-hidden leading-none">
                            <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-bold text-indigo-700 outline-none p-0" value="${otaMin}" placeholder="Min" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${safeRoom}', '=', 0, 'min', this.value)">
                            <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-indigo-400 outline-none p-0 border-l ${otaStop ? 'border-rose-700' : cellBorderCls}" value="${otaMax}" placeholder="Max" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${safeRoom}', '=', 0, 'max', this.value)">
                        </div>` : ''}
                        ${showPrice ? `
                        <div class="${(!showTop && !showBottom) ? 'h-[22px]' : 'h-[18px]'} flex items-center justify-center">
                            <input type="number" class="cell-price-text w-full text-center outline-none bg-transparent font-bold text-[10px] ${otaOverride !== undefined && !otaStop ? '!text-pink-600 font-black' : labelTextCls} px-0" value="${computed}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${safeRoom}', '=', 0, 'rate', this.value)">
                        </div>` : ''}
                        ${showBottom ? `
                        <div class="flex items-center justify-center px-0.5 text-[7px] leading-none ${(!showTop && !showPrice) ? 'h-[20px]' : 'h-[13px] border-t'} ${otaStop ? 'border-rose-700' : cellBorderCls}">
                            <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${safeRoom}', '${rate.ratePlanId}')" class="cursor-pointer w-full h-full flex items-center justify-center">
                                ${otaPillHtml}
                            </button>
                        </div>` : ''}
                    </td>`;
                }
                trOta += `</tr>`;
                allRowsHtml += trOta;
            });
        }
    });

    // 3. GLOBAL Restrictions Row (Thick 4px top divider + distinct high-contrast styling)
    if (showTop || showBottom) {
        let globalTr = `<tr class="bg-slate-200/90 text-slate-900 border-t-[4px] border-slate-900 border-b-2 border-slate-900">
            <td class="frozen-col !p-0 z-20 !bg-slate-900 text-white border-r-2 border-slate-700 px-1.5 py-1.5">
                <div class="w-[140px] flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-wider text-amber-300">GLOBAL</span>
                    <span class="text-[7px] font-black text-slate-900 uppercase bg-amber-300 px-1 py-0.5 rounded">ALL ROOMS</span>
                </div>
            </td>`;

        for (let i = 0; i < daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = getLocalYMD(cur);
            const gData = window.masterPricing?.timeline?.[dateStr]?.GLOBAL || {};
            const gMinVal = gData.min !== undefined && gData.min !== "" ? gData.min : (gData.min_arr ? `${gData.min_arr}▸` : "");
            const gStopped = !!(gData.stop || gData.stopSell);
            const gPillHtml = getUnifiedRestrictionBadgeHtml(gData.cta, gData.ctd, gStopped);

            globalTr += `<td class="p-0 border-r border-slate-300 text-center ${gStopped ? 'rate-cell-stopped' : 'bg-slate-200/80'}" style="width: 42px; min-width: 42px; max-width: 42px;">
                ${showTop ? `
                <div class="flex items-center w-full h-[15px] leading-none overflow-hidden">
                    <input type="text" class="cell-min-input w-1/2 ${gStopped ? 'bg-transparent' : 'bg-white/90'} text-center font-black text-slate-900 outline-none p-0" value="${gMinVal}" placeholder="Min" ondblclick="event.stopPropagation(); window.toggleMinStayMode('${dateStr}', 'GLOBAL')" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'min_hybrid', this.value)">
                    <input type="text" class="cell-max-input w-1/2 ${gStopped ? 'bg-transparent' : 'bg-white/90'} text-center font-bold text-slate-600 outline-none p-0 border-l ${gStopped ? 'border-rose-700' : 'border-slate-300'}" value="${gData.max || ''}" placeholder="Max" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'max', this.value)">
                </div>` : ''}
                ${showBottom ? `
                <div class="flex items-center justify-center px-0.5 text-[7px] leading-none ${showTop ? 'h-[13px] border-t' : 'h-[20px]'} ${gStopped ? 'border-rose-700' : 'border-slate-300'}">
                    <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', 'GLOBAL')" class="cursor-pointer w-full h-full flex items-center justify-center" title="Click to cycle GLOBAL: Open → CTA → CTD → CTB → STOP">
                        ${gPillHtml}
                    </button>
                </div>` : ''}
            </td>`;
        }
        globalTr += `</tr>`;
        allRowsHtml += globalTr;
    }

    body.innerHTML = allRowsHtml;
    if (window.lucide) window.lucide.createIcons();

    if (window._pendingGridFocus) {
        const req = window._pendingGridFocus;
        window._pendingGridFocus = null;
        restoreGridFocus(req);
    }
}

export function handleDirectEdit(dateStr, room, field, val) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];

    if (field === 'rate') {
        if (val === "" || isNaN(parseFloat(val))) delete rData.dir_std;
        else rData.dir_std = roundCurrency(parseFloat(val));
    } else if (field === 'min') {
        const clean = String(val).trim();
        if (!clean || clean === '-') { delete rData.dir_min; delete rData.dir_min_arr; }
        else if (/(\d+)\s*(a|>|▸)/i.test(clean)) { rData.dir_min_arr = parseInt(clean.match(/(\d+)/)[1], 10); delete rData.dir_min; }
        else { rData.dir_min = parseInt(clean.match(/(\d+)/)[1], 10); delete rData.dir_min_arr; }
    } else if (field === 'max') {
        if (!val || val === '-') delete rData.dir_max;
        else rData.dir_max = parseInt(val, 10);
    }
    if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'rate', `ROOM:${room}`);
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
}

export function cycleDirectRestriction(dateStr, room) {
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];

    const cta = !!rData.dir_cta;
    const ctd = !!rData.dir_ctd;
    const stop = !!(rData.dir_stop || rData.dir_stopSell);

    if (!cta && !ctd && !stop) { rData.dir_cta = true; rData.dir_ctd = false; rData.dir_stop = false; }
    else if (cta && !ctd && !stop) { rData.dir_cta = false; rData.dir_ctd = true; rData.dir_stop = false; }
    else if (!cta && ctd && !stop) { rData.dir_cta = true; rData.dir_ctd = true; rData.dir_stop = false; }
    else if (cta && ctd && !stop) { rData.dir_cta = false; rData.dir_ctd = false; rData.dir_stop = true; }
    else { rData.dir_cta = false; rData.dir_ctd = false; rData.dir_stop = false; }

    if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'rate', `ROOM:${room}`);
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
}

let lastFillKey = '';
let lastFillTime = 0;
let fillTapStage = 0;

if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
            const target = document.activeElement;
            if (!target || target.tagName !== 'INPUT') return;
            const room = target.dataset.fillRoom;
            const field = target.dataset.fillField;
            const startDate = target.dataset.fillDate;
            if (!room || !field || !startDate) return;

            e.preventDefault();
            const now = Date.now();
            const key = `${room}|${field}|${startDate}`;
            const baseStep = parseInt(window.pricingRules?.fillRightDays, 10) || 7;
            const steps = Array.from(new Set([baseStep, 14, 30, 90])).sort((a, b) => a - b);

            if (key === lastFillKey && (now - lastFillTime) < 1800) {
                fillTapStage = (fillTapStage + 1) % steps.length;
            } else {
                fillTapStage = 0;
            }
            lastFillKey = key;
            lastFillTime = now;

            const daysForward = steps[fillTapStage];
            const rawVal = target.value;
            const numVal = rawVal !== '' && !isNaN(parseFloat(rawVal)) ? roundCurrency(parseFloat(rawVal)) : '';
            const startMs = parseYMD(startDate);

            for (let i = 0; i <= daysForward; i++) {
                const dStr = getLocalYMD(new Date(startMs + (i * 86400000)));
                window.masterPricing.timeline[dStr] = window.masterPricing.timeline[dStr] || {};
                window.masterPricing.timeline[dStr][room] = window.masterPricing.timeline[dStr][room] || { isOverride: {} };
                const cell = window.masterPricing.timeline[dStr][room];
                cell.isOverride = cell.isOverride || {};

                if (numVal === '') {
                    delete cell[field];
                    delete cell.isOverride[field];
                } else {
                    cell[field] = numVal;
                    cell.isOverride[field] = true;
                    if (window.editMode === 'ripple' && (field === 'std' || field === 'fmp')) {
                        rippleDay(dStr, room, true, 'rates');
                    }
                }
                if (typeof window.markCmDirty === 'function' && field !== 'dir_std') {
                    window.markCmDirty(dStr, 'rate', window.editMode === 'ripple' ? '*' : `ROOM:${room}`);
                }
            }

            const tbody = document.getElementById('grid-body');
            const tr = target.closest('tr');
            const td = target.closest('td');
            if (tbody && tr && td) {
                window._pendingGridFocus = {
                    id: target.id || null,
                    selector: '.cell-price-text',
                    rowIdx: Array.from(tbody.children).indexOf(tr),
                    colIdx: Array.from(tr.children).indexOf(td)
                };
            }

            if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
            renderRateMatrix();

            const nextStep = steps[(fillTapStage + 1) % steps.length];
            const tt = document.getElementById('cm-tooltip');
            if (tt) {
                tt.innerText = `Filled forward +${daysForward} days (Press Ctrl+→ again for +${nextStep}d)`;
                tt.classList.remove('hidden');
                tt.style.left = '50%';
                tt.style.top = '54px';
                tt.style.transform = 'translateX(-50%)';
                clearTimeout(window._fillToastTimer);
                window._fillToastTimer = setTimeout(() => {
                    tt.classList.add('hidden');
                    tt.style.transform = '';
                }, 2200);
            }
            return;
        }

        if (e.key !== 'Tab') return;
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        let selector = '';
        if (target.classList.contains('cell-price-text')) selector = '.cell-price-text';
        else if (target.classList.contains('cell-min-input')) selector = '.cell-min-input';
        else if (target.classList.contains('cell-max-input')) selector = '.cell-max-input';
        else if (target.classList.contains('cell-avail-input')) selector = '.cell-avail-input';
        if (!selector) return;

        const tbody = document.getElementById('grid-body');
        const currentRow = target.closest('tr');
        if (!tbody || !currentRow) return;

        e.preventDefault();
        e.stopPropagation();

        const rowInputs = Array.from(currentRow.querySelectorAll(selector)).filter(i => !i.disabled && i.offsetParent !== null);
        const idxInRow = rowInputs.indexOf(target);
        let nextEl = null;

        if (idxInRow !== -1) {
            if (!e.shiftKey && idxInRow + 1 < rowInputs.length) nextEl = rowInputs[idxInRow + 1];
            else if (e.shiftKey && idxInRow - 1 >= 0) nextEl = rowInputs[idxInRow - 1];
        }

        if (!nextEl) {
            const allInputs = Array.from(tbody.querySelectorAll(selector)).filter(i => !i.disabled && i.offsetParent !== null);
            const gIdx = allInputs.indexOf(target);
            if (gIdx !== -1) {
                nextEl = allInputs[e.shiftKey ? (gIdx - 1 + allInputs.length) % allInputs.length : (gIdx + 1) % allInputs.length];
            }
        }
        if (!nextEl) return;

        const nextTr = nextEl.closest('tr');
        const nextTd = nextEl.closest('td');
        window._pendingGridFocus = {
            id: nextEl.id || null,
            selector,
            rowIdx: Array.from(tbody.children).indexOf(nextTr),
            colIdx: Array.from(nextTr.children).indexOf(nextTd)
        };

        target.blur();

        if (window._pendingGridFocus) {
            const req = window._pendingGridFocus;
            window._pendingGridFocus = null;
            restoreGridFocus(req);
        }
    }, true);
}

// Global Aliases & Bridges
if (typeof window !== 'undefined') {
    window.renderRateMatrix = renderRateMatrix;
    window.renderGrid = renderRateMatrix;
    window.formatMinStayInput = formatMinStayInput;
    window.showCmTooltip = showCmTooltip;
    window.hideCmTooltip = hideCmTooltip;
    window.calculateLiveInventory = calculateLiveInventory;
    window.handleAvailEdit = handleAvailEdit;
    window.handleCellPriceLive = handleCellPriceLive;
    window.toggleMinStayMode = toggleMinStayMode;
    window.handleCellPriceChange = handleCellPriceChange;
    window.handleCellEdit = handleCellEdit;
    window.handleOtaEdit = handleOtaEdit;
    window.cycleUnifiedRestriction = cycleUnifiedRestriction;
    window.unlockCellOverride = unlockCellOverride;
    window.setRoomLevel = setRoomLevel;
    window.toggleGridRatesDropdown = toggleGridRatesDropdown;
    window.toggleGridViewDropdown = toggleGridViewDropdown;
    window.toggleGridRateFilter = toggleGridRateFilter;
    window.setAllGridRateFilters = setAllGridRateFilters;
    window.toggleGridViewField = toggleGridViewField;
    window.setAllGridViewFields = setAllGridViewFields;
    window.setGridViewPresetCompact = setGridViewPresetCompact;
    window.toggleHighlightGaps = toggleHighlightGaps;
    window.handleDirectEdit = handleDirectEdit;
    window.cycleDirectRestriction = cycleDirectRestriction;
    window.setChannelPreviewFilter = setChannelPreviewFilter;
    window.toggleRoomExpand = toggleRoomExpand;
    window.initGridUI = initGridUI;
}
