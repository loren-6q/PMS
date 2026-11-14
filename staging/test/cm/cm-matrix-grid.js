// ==========================================================================
// cm/cm-matrix-grid.js - Dense Rate Matrix Grid & Cell Controller
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { isOccupyingBooking } from '../core/occupancy.js';
import { resolveChannelCode } from '../core/channels.js';
import { rippleDay, applyMath, computeDynamicPlanRate, getNearestEvent } from './cm-ripple.js';

export let roomLevel = 'all';      // 'anchors' | 'all' | 'dorms' | 'privates'
export let rateLevel = 'min';      // 'min' | 'direct' | 'default' | 'all'
export let showEventRows = true;   // toggled via EVENTS button when Setup enables event rates
export let highlightGaps = false;  // toggled via GAPS button in toolbar
export let viewDensity = 'full';   // 'avail' | 'price' | 'compact' | 'minmax' | 'full'
export let channelPreviewFilter = 'ALL';
export const expandedRooms = new Set();
export const daysToRender = 42;

export function toggleHighlightGaps() {
    highlightGaps = !highlightGaps;
    const btn = document.getElementById('btn-toggle-gaps');
    if (btn) {
        btn.className = highlightGaps
            ? "view-btn !bg-rose-600 !text-white !border-rose-600 cursor-pointer font-black text-xs px-2 py-1 rounded flex items-center gap-1 shadow-2xs"
            : "view-btn !bg-slate-100 text-slate-600 cursor-pointer font-black text-xs px-2 py-1 rounded border border-slate-300 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1";
    }
    renderRateMatrix();
}

function getClassifiedRooms() {
    const all = [...(window.roomTypes || [])];
    const hotelRooms = window.hotelRooms || [];
    const dormSet = new Set();
    const privSet = new Set();

    hotelRooms.forEach(hr => {
        const cat = hr.category || hr.type;
        if (!cat) return;
        if (hr.rule === 'private') privSet.add(cat);
        else if (hr.rule) dormSet.add(cat);
    });

    const dorms = all.filter(rt => dormSet.has(rt) || (!privSet.has(rt) && /dorm|bed|bunk/i.test(rt)));
    const privates = all.filter(rt => !dorms.includes(rt));
    return { all, dorms, privates };
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
                    // Deduct 1 unit per assigned room/bed in its own category
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

                    // Deduct any remaining unassigned slots
                    const unassignedCount = Math.max(0, rawSlots.length - assignedSlots.length);
                    if (unassignedCount > 0) {
                        const fallbackCat = s.bookedType || s.category || s.roomType;
                        if (fallbackCat) {
                            const matchedRt = roomTypes.find(rt => rt.toLowerCase() === String(fallbackCat).toLowerCase());
                            if (matchedRt) {
                                const unitDed = matchedRt.toLowerCase().includes('dorm') ? Math.max(unassignedCount, parseInt(s.pax || 1, 10)) : unassignedCount;
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

export function handleAvailEdit(dateStr, room, val) {
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

    window.dirtyDates = window.dirtyDates || new Set();
    window.syncedDates = window.syncedDates || new Set();
    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);
    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
}

export function toggleMinStayMode(dateStr, room) {
    window.masterPricing = window.masterPricing || { relationships: [], timeline: {} };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dObj = window.masterPricing.timeline[dateStr];
    dObj[room] = dObj[room] || { isOverride: {} };
    const rData = dObj[room];
    rData.isOverride = rData.isOverride || {};

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
    } else {
        return;
    }

    window.dirtyDates = window.dirtyDates || new Set();
    window.dirtyDates.add(dateStr);
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
            anchors.forEach(a => { if (a && a !== 'unlinked') rippleDay(dateStr, a, true); });
        }
    } else {
        rData.std = roundCurrency(parseFloat(val));
        rData.isOverride.std = true;

        if (window.editMode === 'ripple') {
            rippleDay(dateStr, room, true);
        }
    }

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
                rippleDay(dateStr, room, true);
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

export function setRoomLevel(level) {
    roomLevel = level;
    window.roomLevel = level;
    ['anchors', 'all', 'dorms', 'privates'].forEach(l => {
        const btn = document.getElementById(`rlevel-${l}`);
        if (btn) {
            const isHidden = btn.classList.contains('hidden');
            btn.className = `${isHidden ? 'hidden ' : ''}px-2 py-0.5 rounded cursor-pointer transition-colors ${l === level ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-white'}`;
        }
    });
    renderRateMatrix();
}

export function setRateLevel(level) {
    rateLevel = level;
    window.rateLevel = level;
    ['min', 'direct', 'default', 'all'].forEach(l => {
        const btn = document.getElementById(`ratelevel-${l}`);
        if (btn) {
            btn.className = l === level
                ? "px-2 py-0.5 rounded cursor-pointer transition-colors bg-white text-indigo-700 shadow-2xs font-black"
                : "px-2 py-0.5 rounded cursor-pointer transition-colors text-slate-600 hover:bg-white";
        }
    });
    renderRateMatrix();
}

export function toggleEventRows() {
    showEventRows = !showEventRows;
    window.showEventRows = showEventRows;
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

    // Sync conditional EVENTS toggle & dynamic Dorms/Privates room buttons
    const evtToggleBtn = document.getElementById('btn-toggle-evt-rows');
    const evtToggleLbl = document.getElementById('lbl-toggle-evt-rows');
    if (evtToggleBtn) {
        evtToggleBtn.classList.toggle('hidden', !isEvents);
        if (isEvents) {
            evtToggleBtn.className = showEventRows
                ? "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer transition-colors flex items-center gap-1 bg-pink-600 text-white border-pink-600 shadow-2xs"
                : "px-2 py-1 rounded border text-[10px] font-black uppercase cursor-pointer transition-colors flex items-center gap-1 bg-slate-100 text-slate-600 border-slate-300 hover:bg-pink-50";
            if (evtToggleLbl) evtToggleLbl.innerText = showEventRows ? 'Events: On' : 'Events: Off';
        }
    }

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
    const renderEventsLayer = isEvents && showEventRows;
    let allRowsHtml = '';

    targetRooms.forEach((room, idx) => {
        const groupClass = idx % 2 === 0 ? 'room-group-even' : 'room-group-odd';
        const displayName = window.displayAbbrev?.[room] || room;
        const allMappedRates = (window.channexRateMap || []).filter(m => m.pmsCategory === room);

        const isRoomManuallyExpanded = expandedRooms.has(room);
        const effectiveRateLevel = isRoomManuallyExpanded && rateLevel === 'min' ? 'all' : rateLevel;

        let mappedRates = allMappedRates.filter(r => {
            const chanCode = resolveChannelCode(r.channel || r.ratePlanTitle);
            const isEvtPlan = (r.product === 'evt') || (r.rateSource === 'evt') || /\b(evt|fmp|event|pkg)\b/i.test(r.ratePlanTitle || '');
            const isRefPlan = (r.policy === 'ref') || (/ref|refundable/i.test(r.ratePlanTitle || '') && !/non-?ref/i.test(r.ratePlanTitle || ''));

            // Hide all event plans when Events layer is OFF
            if (isEvtPlan && !renderEventsLayer) return false;

            // Suppress duplicate DEF Non-Ref & DEF Event Non-Ref plans (already rendered as the master rows)
            if (chanCode === 'DEF' && !isRefPlan) return false;

            // Channel preview filter
            if (activePreviewFilter !== 'ALL' && chanCode !== activePreviewFilter) return false;

            // Rate level filter
            if (effectiveRateLevel === 'min' || effectiveRateLevel === 'direct') return false;
            if (effectiveRateLevel === 'default') return chanCode === 'DEF';
            return true;
        });

        const hasExpandablePlans = allMappedRates.some(r => {
            const c = resolveChannelCode(r.channel || r.ratePlanTitle);
            const isRef = (r.policy === 'ref') || (/ref|refundable/i.test(r.ratePlanTitle || '') && !/non-?ref/i.test(r.ratePlanTitle || ''));
            return c !== 'DEF' || isRef;
        });

        // A. Availability Row (Hidden in PRICE view so there is no blank row)
        if (density !== 'price') {
            let trAvail = `<tr class="${groupClass} border-b border-slate-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full font-black text-slate-800 text-[11px]">
                        <span class="truncate" title="${room}">${displayName}</span>
                        <div class="flex items-center gap-1">
                            ${hasExpandablePlans && rateLevel !== 'all' ? `
                            <button type="button" onclick="window.toggleRoomExpand('${room}')" class="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer" title="Expand/Collapse Rate Plans">
                                <i data-lucide="${isRoomManuallyExpanded ? 'chevron-down' : 'chevron-right'}" size="12"></i>
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

                trAvail += `<td class="p-0 border-r border-slate-200 ${otaAvail !== undefined ? '!bg-amber-100' : 'bg-slate-50/80'} text-center" style="width: 42px; min-width: 42px; max-width: 42px;">
                    <input type="number" class="cell-avail-input w-full text-center outline-none bg-transparent text-[10px] ${availColor} font-bold px-0 py-1" value="${displayVal}" onfocus="this.select()" onchange="window.handleAvailEdit('${dateStr}', '${room}', this.value)">
                </td>`;
            }
            trAvail += `</tr>`;
            allRowsHtml += trAvail;
        }

        if (density === 'avail') return;

        // B. DEF Non-Ref Row (Shows Room Name directly on this row when in PRICE view)
        const baseRowLabel = density === 'price'
            ? `<span class="text-[11px] font-black text-slate-800 truncate" title="${room}">${displayName}</span>`
            : `<span class="text-[10px] font-black text-slate-700 truncate">DEF Non-Ref</span>`;

        const baseExpandBtn = (density === 'price' && hasExpandablePlans && rateLevel !== 'all')
            ? `<button type="button" onclick="window.toggleRoomExpand('${room}')" class="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer" title="Expand/Collapse Rate Plans">
                    <i data-lucide="${isRoomManuallyExpanded ? 'chevron-down' : 'chevron-right'}" size="12"></i>
               </button>`
            : '';

        let trRate = `<tr class="${groupClass} border-b border-slate-300">
            <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}">
                <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                    ${baseRowLabel}
                    <div class="flex items-center gap-0.5 shrink-0">
                        ${baseExpandBtn}
                        <span class="text-[7px] font-black uppercase text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-200">DEF</span>
                    </div>
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
            const isStopped = !!(rData.stop || rData.stopSell);
            const pillHtml = getUnifiedRestrictionBadgeHtml(rData.cta, rData.ctd, isStopped);

            let cellClass = `p-0 border-r border-slate-200 text-center relative ${isStopped ? 'rate-cell-stopped' : (isPinned ? 'rate-cell-pinned !bg-amber-100' : '')}`;

            trRate += `<td class="${cellClass}" style="width: 42px; min-width: 42px; max-width: 42px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}')" onmouseenter="window.showCmTooltip(event, '${displayName} | ${dateStr}\\nDEF Non-Ref: ฿${displayPrice || '--'}${isPinned ? ' (Manual Override - Double-click to revert)' : ''}\\nMin: ${minVal || '--'}, Max: ${maxVal || '--'}')" onmouseleave="window.hideCmTooltip()">
                ${showTop ? `
                <div class="flex items-center w-full h-[15px] border-b ${isStopped ? 'border-rose-700 bg-transparent' : 'border-slate-200 bg-slate-50/70'} overflow-hidden leading-none">
                    <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black text-slate-700 outline-none p-0" value="${minVal}" placeholder="Min" title="Min Stay (e.g. 3 or 3▸ for Arrival; double-click to toggle)" ondblclick="event.stopPropagation(); window.toggleMinStayMode('${dateStr}', '${room}')" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value)">
                    <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-slate-500 outline-none p-0 border-l ${isStopped ? 'border-rose-700' : 'border-slate-200'}" value="${maxVal}" placeholder="Max" title="Max Stay" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value)">
                </div>` : ''}

                <div class="${(density === 'compact' || density === 'price') ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                    <input type="number" id="inp_${dateStr}_${room.replace(/\s+/g, '')}_std" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[11px] ${isPinned && !isStopped ? '!text-amber-900' : 'text-slate-800'} px-0" value="${displayPrice}" onfocus="this.select()" oninput="window.handleCellPriceLive(this, '${dateStr}', '${room}', 'std')" onchange="window.handleCellPriceChange(event, '${dateStr}', '${room}')">
                </div>

                ${showBottom ? `
                <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[13px] border-t ${isStopped ? 'border-rose-700' : 'border-slate-100'}">
                    <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${room}')" class="cursor-pointer w-full h-full flex items-center justify-center" title="Click to cycle: Open → CTA → CTD → CTB → STOP">
                        ${pillHtml}
                    </button>
                </div>` : ''}
            </td>`;
        }
        trRate += `</tr>`;
        allRowsHtml += trRate;

        // C. DEF Event Non-Ref Row (Matches all VIEW density filters: Avail / Price / Compact / MinMax / Full)
        if (renderEventsLayer && density !== 'avail') {
            const showTopEvt = density === 'minmax' || density === 'full';
            const showBottomEvt = density === 'full';

            let trEvt = `<tr class="${groupClass} border-b-2 border-slate-400 bg-pink-50/40">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 !bg-pink-50">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-pink-800 truncate">DEF Event Non-Ref</span>
                        <span class="text-[7px] font-black uppercase text-pink-700 bg-pink-100 px-1 py-0.5 rounded border border-pink-300 shrink-0">DEF EVT</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                const rData = dayObj[room] || {};
                const displayFmp = rData.fmp !== undefined && rData.fmp !== "" ? rData.fmp : "";
                const isPinnedFmp = !!rData.isOverride?.fmp;

                const evtMinVal = rData.evt_min !== undefined && rData.evt_min !== ""
                    ? rData.evt_min
                    : (rData.evt_min_arr ? `${rData.evt_min_arr}▸` : (dayObj.evtRestrictions?.min || (dayObj.evtRestrictions?.min_arr ? `${dayObj.evtRestrictions.min_arr}▸` : "")));
                const evtMaxVal = rData.evt_max !== undefined && rData.evt_max !== "" ? rData.evt_max : (dayObj.evtRestrictions?.max || "");
                const evtCta = rData.evt_cta !== undefined ? !!rData.evt_cta : !!dayObj.evtRestrictions?.cta;
                const evtCtd = rData.evt_ctd !== undefined ? !!rData.evt_ctd : !!dayObj.evtRestrictions?.ctd;
                const evtStopped = rData.evt_stop !== undefined ? !!(rData.evt_stop || rData.evt_stopSell) : !!dayObj.evtRestrictions?.stop;
                const evtPillHtml = getUnifiedRestrictionBadgeHtml(evtCta, evtCtd, evtStopped);

                trEvt += `<td class="p-0 border-r border-pink-200 text-center relative ${evtStopped ? 'rate-cell-stopped' : (isPinnedFmp ? 'rate-cell-pinned !bg-amber-100' : '')}" style="width: 42px; min-width: 42px; max-width: 42px;">
                    ${showTopEvt ? `
                    <div class="flex items-center w-full h-[15px] border-b ${evtStopped ? 'border-rose-700 bg-transparent' : 'border-pink-200 bg-white/60'} overflow-hidden leading-none">
                        <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black text-pink-800 outline-none p-0" value="${evtMinVal}" placeholder="Min" onblur="if(window.formatMinStayInput) this.value = window.formatMinStayInput(this.value);" onchange="window.handleCellEdit('${dateStr}', '${room}', 'min_hybrid', this.value, true)">
                        <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-pink-500 outline-none p-0 border-l ${evtStopped ? 'border-rose-700' : 'border-pink-200'}" value="${evtMaxVal}" placeholder="Max" onchange="window.handleCellEdit('${dateStr}', '${room}', 'max', this.value, true)">
                    </div>` : ''}

                    <div class="${(density === 'compact' || density === 'price') ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                        <input type="number" data-fill-room="${room}" data-fill-field="fmp" data-fill-date="${dateStr}" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-pink-800 px-0" value="${displayFmp}" onfocus="this.select()" oninput="window.handleCellPriceLive(this, '${dateStr}', '${room}', 'fmp')" onchange="window.handleCellEdit('${dateStr}', '${room}', 'fmp', this.value, true)">
                    </div>

                    ${showBottomEvt ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[13px] border-t ${evtStopped ? 'border-rose-700' : 'border-pink-200/70'}">
                        <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${room}', null, true)" class="cursor-pointer w-full h-full flex items-center justify-center" title="Click to cycle Event restrictions">
                            ${evtPillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trEvt += `</tr>`;
            allRowsHtml += trEvt;
        }

        // C2. Direct (WEB) Row (Shown when RATES is Direct, Default, or All)
        if ((effectiveRateLevel === 'direct' || effectiveRateLevel === 'default' || effectiveRateLevel === 'all') && density !== 'avail') {
            const showTopDir = density === 'minmax' || density === 'full';
            const showBottomDir = density === 'full';

            let trDir = `<tr class="bg-emerald-50/50 border-b border-emerald-200">
                <td class="frozen-col !p-0 z-20 align-middle border-r-2 border-slate-400 !bg-emerald-50">
                    <div class="w-[140px] flex items-center justify-between px-1.5 h-full text-left">
                        <span class="text-[10px] font-black text-emerald-900 truncate">Direct Rate</span>
                        <span class="text-[7px] font-black uppercase text-white bg-emerald-600 px-1 py-0.5 rounded shrink-0">DIR</span>
                    </div>
                </td>`;

            for (let i = 0; i < daysToRender; i++) {
                const cur = new Date(dObj);
                cur.setUTCDate(cur.getUTCDate() + i);
                const dateStr = getLocalYMD(cur);
                const rData = window.masterPricing?.timeline?.[dateStr]?.[room] || {};
                const displayDir = rData.dir_std !== undefined && rData.dir_std !== "" ? rData.dir_std : (rData.std ?? "");
                const isPinnedDir = rData.dir_std !== undefined && rData.dir_std !== "";

                const dirMinVal = rData.dir_min !== undefined && rData.dir_min !== "" ? rData.dir_min : (rData.dir_min_arr ? `${rData.dir_min_arr}▸` : "");
                const dirMaxVal = rData.dir_max !== undefined && rData.dir_max !== "" ? rData.dir_max : "";
                const dirStopped = !!(rData.dir_stop || rData.dir_stopSell);
                const dirPillHtml = getUnifiedRestrictionBadgeHtml(rData.dir_cta, rData.dir_ctd, dirStopped);

                trDir += `<td class="p-0 border-r border-emerald-200 text-center relative ${dirStopped ? 'rate-cell-stopped' : (isPinnedDir ? 'rate-cell-pinned !bg-amber-100' : '')}" style="width: 42px; min-width: 42px; max-width: 42px;">
                    ${showTopDir ? `
                    <div class="flex items-center w-full h-[15px] border-b ${dirStopped ? 'border-rose-700 bg-transparent' : 'border-emerald-200 bg-white/70'} overflow-hidden leading-none">
                        <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-black text-emerald-800 outline-none p-0" value="${dirMinVal}" placeholder="Min" onchange="window.handleDirectEdit('${dateStr}', '${room}', 'min', this.value)">
                        <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-emerald-600 outline-none p-0 border-l ${dirStopped ? 'border-rose-700' : 'border-emerald-200'}" value="${dirMaxVal}" placeholder="Max" onchange="window.handleDirectEdit('${dateStr}', '${room}', 'max', this.value)">
                    </div>` : ''}

                    <div class="${(density === 'compact' || density === 'price') ? 'h-[24px]' : 'h-[19px]'} flex items-center justify-center">
                        <input type="number" data-fill-room="${room}" data-fill-field="dir_std" data-fill-date="${dateStr}" class="cell-price-text w-full text-center outline-none bg-transparent font-black text-[10px] text-emerald-900 px-0" value="${displayDir}" onfocus="this.select()" onchange="window.handleDirectEdit('${dateStr}', '${room}', 'rate', this.value)">
                    </div>

                    ${showBottomDir ? `
                    <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[13px] border-t ${dirStopped ? 'border-rose-700' : 'border-emerald-200/70'}">
                        <button type="button" onclick="event.stopPropagation(); window.cycleDirectRestriction('${dateStr}', '${room}')" class="cursor-pointer w-full h-full flex items-center justify-center" title="Direct booking restriction (independent of OTAs)">
                            ${dirPillHtml}
                        </button>
                    </div>` : ''}
                </td>`;
            }
            trDir += `</tr>`;
            allRowsHtml += trDir;
        }

        // D. Mapped Rate Plans (Filtered by RATES level & EVENTS toggle)
        if (mappedRates.length > 0 && density !== 'avail') {
            mappedRates.forEach(rate => {
                const chanCode = resolveChannelCode(rate.channel || rate.ratePlanTitle);
                const badgeHtml = getCanonicalChannelBadgeHtml(chanCode);
                const showTop = density === 'minmax' || density === 'full';
                const showBottom = density === 'full';

                let trOta = `<tr class="bg-indigo-50/40 border-b border-indigo-100">
                    <td class="frozen-col !p-0 z-20 border-r-2 border-slate-400 bg-indigo-50/70">
                        <div class="w-[140px] flex items-center justify-between gap-1 px-1.5 h-full text-left truncate" title="${rate.ratePlanTitle}">
                            <div class="flex items-center gap-1 min-w-0">
                                ${badgeHtml}
                                <span class="text-[9px] font-black text-indigo-950 truncate">${rate.ratePlanTitle}</span>
                            </div>
                        </div>
                    </td>`;

                for (let i = 0; i < daysToRender; i++) {
                    const cur = new Date(dObj);
                    cur.setUTCDate(cur.getUTCDate() + i);
                    const dateStr = getLocalYMD(cur);
                    const dayObj = window.masterPricing?.timeline?.[dateStr] || {};
                    const otaOverride = dayObj.otaOverrides?.[rate.ratePlanId];
                    const computed = otaOverride !== undefined ? otaOverride : (computeDynamicPlanRate ? computeDynamicPlanRate(dateStr, room, rate) : "");

                    const otaMin = dayObj.otaOverrides?.[`${rate.ratePlanId}_min`] || '';
                    const otaMax = dayObj.otaOverrides?.[`${rate.ratePlanId}_max`] || '';
                    const otaStop = !!dayObj.otaOverrides?.[`${rate.ratePlanId}_stop`];
                    const otaCta = !!dayObj.otaOverrides?.[`${rate.ratePlanId}_cta`];
                    const otaCtd = !!dayObj.otaOverrides?.[`${rate.ratePlanId}_ctd`];
                    const otaPillHtml = getUnifiedRestrictionBadgeHtml(otaCta, otaCtd, otaStop);

                    trOta += `<td class="p-0 border-r border-indigo-100 text-center relative ${otaStop ? 'rate-cell-stopped' : (otaOverride !== undefined ? 'rate-cell-pinned !bg-amber-100' : '')}" style="width: 42px; min-width: 42px; max-width: 42px;" ondblclick="window.unlockCellOverride('${dateStr}', '${room}', '${rate.ratePlanId}')">
                        ${showTop ? `
                        <div class="flex items-center w-full h-[15px] border-b ${otaStop ? 'border-rose-700 bg-transparent' : 'border-indigo-100 bg-white/60'} overflow-hidden leading-none">
                            <input type="text" class="cell-min-input w-1/2 text-center bg-transparent border-none font-bold text-indigo-700 outline-none p-0" value="${otaMin}" placeholder="Min" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '=', 0, 'min', this.value)">
                            <input type="text" class="cell-max-input w-1/2 text-center bg-transparent border-none text-indigo-400 outline-none p-0 border-l ${otaStop ? 'border-rose-700' : 'border-indigo-100'}" value="${otaMax}" placeholder="Max" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '=', 0, 'max', this.value)">
                        </div>` : ''}
                        <div class="${(density === 'compact' || density === 'price') ? 'h-[22px]' : 'h-[18px]'} flex items-center justify-center">
                            <input type="number" class="cell-price-text w-full text-center outline-none bg-transparent font-bold text-[10px] ${otaOverride !== undefined && !otaStop ? '!text-pink-600 font-black' : 'text-indigo-900'} px-0" value="${computed}" onfocus="this.select()" onchange="window.handleOtaEdit('${dateStr}', '${rate.ratePlanId}', '${room}', '=', 0, 'rate', this.value)">
                        </div>
                        ${showBottom ? `
                        <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[13px] border-t ${otaStop ? 'border-rose-700' : 'border-indigo-100/70'}">
                            <button type="button" onclick="event.stopPropagation(); window.cycleUnifiedRestriction('${dateStr}', '${room}', '${rate.ratePlanId}')" class="cursor-pointer w-full h-full flex items-center justify-center">
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

    // 3. GLOBAL Restrictions Row
    if (density === 'minmax' || density === 'full') {
        let globalTr = `<tr class="bg-slate-100 text-slate-800 border-t-2 border-slate-400">
            <td class="frozen-col !p-0 z-20 bg-slate-100 border-r-2 border-slate-400 px-1.5 py-1">
                <div class="w-[140px] flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-wider text-slate-800">GLOBAL</span>
                    <span class="text-[7px] font-black text-slate-600 uppercase bg-white border border-slate-300 px-1 py-0.2 rounded">RESTR</span>
                </div>
            </td>`;

        for (let i = 0; i < daysToRender; i++) {
            const cur = new Date(dObj);
            cur.setUTCDate(cur.getUTCDate() + i);
            const dateStr = getLocalYMD(cur);
            const gData = window.masterPricing?.timeline?.[dateStr]?.GLOBAL || {};
            const gStopped = !!(gData.stop || gData.stopSell);
            const gPillHtml = getUnifiedRestrictionBadgeHtml(gData.cta, gData.ctd, gStopped);

            globalTr += `<td class="p-0 border-r border-slate-300 text-center ${gStopped ? 'rate-cell-stopped' : 'bg-slate-50'}" style="width: 42px; min-width: 42px; max-width: 42px;">
                <div class="flex items-center w-full h-[15px] leading-none overflow-hidden">
                    <input type="text" class="cell-min-input w-1/2 ${gStopped ? 'bg-transparent' : 'bg-white'} text-center font-black text-slate-800 outline-none p-0" value="${gData.min || ''}" placeholder="Min" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'min', this.value)">
                    <input type="text" class="cell-max-input w-1/2 ${gStopped ? 'bg-transparent' : 'bg-white'} text-center font-bold text-slate-500 outline-none p-0 border-l ${gStopped ? 'border-rose-700' : 'border-slate-200'}" value="${gData.max || ''}" placeholder="Max" onchange="window.handleCellEdit('${dateStr}', 'GLOBAL', 'max', this.value)">
                </div>
                ${density === 'full' ? `
                <div class="flex items-center justify-center px-0.5 text-[7px] leading-none h-[13px] border-t border-slate-200">
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

        if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
        renderRateMatrix();
    }

    // Progressive Multi-Tap Ctrl + RightArrow Fill-Right + Horizontal Tab Navigation
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
                            rippleDay(dStr, room, true);
                        }
                    }
                    if (typeof window.markCmDirty === 'function' && field !== 'dir_std') {
                        window.markCmDirty(dStr, 'rate', window.editMode === 'ripple' ? '*' : `ROOM:${room}`);
                    }
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
    window.cycleUnifiedRestriction = cycleUnifiedRestriction;
    window.unlockCellOverride = unlockCellOverride;
    window.setRoomLevel = setRoomLevel;
    window.setRateLevel = setRateLevel;
    window.toggleEventRows = toggleEventRows;
    window.setViewDensity = setViewDensity;
    window.toggleRoomExpand = toggleRoomExpand;
}
