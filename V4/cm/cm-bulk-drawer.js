// ==========================================================================
// cm/cm-bulk-drawer.js - Range Bulk Update & Event Curve Tuner Drawers
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { customAlert } from '../core/ui-dialogs.js';
import { db, appId } from '../core/config.js';
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { resolveRoomCategory as findCanonicalRoom, getResolvedAnchors } from '../core/properties.js';
import { resolveChannelCode, getChannelByCode, isEventRatePlan } from '../core/channels.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { rippleDay } from './cm-ripple.js';

export let bulkScopeMode = 'anchors'; // 'anchors' | 'all'
export let bulkSelectedRateKeys = null; // Set of selected leaf keys (null = all selected)

// Normalize a Channex rate plan title into a general rate type (stripping room names/abbreviations)
function getCleanPlanLabel(rp) {
    let title = (rp.ratePlanTitle || rp.title || '').trim();
    const roomCandidates = new Set([
        rp.pmsCategory,
        ...(window.roomTypes || []),
        ...Object.values(window.displayAbbrev || {})
    ].filter(Boolean));

    // 1. Strip any exact room category / abbreviation match anywhere in the title
    Array.from(roomCandidates)
        .sort((a, b) => b.length - a.length)
        .forEach(cat => {
            const escaped = String(cat).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!escaped) return;
            title = title.replace(new RegExp(`(^|[\\s\\-–—:|(])${escaped}($|[\\s\\-–—:|)])`, 'ig'), ' ');
        });

    title = title.replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '').replace(/\s{2,}/g, ' ').trim();

    // 2. Collapse trailing room-specific words after standard policy names (e.g. "BDC Non-Refundable Triple K+T" -> "BDC Non-Refundable")
    const policySuffixMatch = title.match(/^((?:[A-Z]{2,4}\s+)?(?:Event\s+)?(?:Non-?Refundable|Refundable|Standard|Flexible|Package|Promo))(?:\s+(.+))?$/i);
    if (policySuffixMatch) {
        const baseType = policySuffixMatch[1].trim();
        const trailing = (policySuffixMatch[2] || '').trim();
        if (trailing) {
            const catWords = new Set(
                String(rp.pmsCategory || '')
                    .toLowerCase()
                    .split(/[^a-z0-9+]+/)
                    .filter(w => w.length >= 2)
            );
            const roomWords = new Set(['triple', 'twin', 'king', 'queen', 'double', 'single', 'dorm', 'bed', 'beds', 'mixed', 'female', 'male', 'private', 'deluxe', 'superior', 'oceanview', 'ocean', 'partial', 'garden', 'suite', 'bunk', 'pod', 'room', 'villa', 'bungalow']);
            const trailingTokens = trailing.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
            if (trailingTokens.some(tok => catWords.has(tok) || roomWords.has(tok) || /\+/.test(tok) || /^\d+$/.test(tok))) {
                title = baseType;
            }
        }
    }

    return title || rp.ratePlanId;
}

function getPlanSignature(rp) {
    const ch = resolveChannelCode(rp.channel || '');
    const connId = rp.channelId || '';
    const cleanLabel = getCleanPlanLabel(rp).toLowerCase();
    return `${ch}::${connId}::${cleanLabel}`;
}

// Anchors mode cascades to linked rooms; All Rooms mode edits ONLY the specific room row
function getTargetRoomsForBulkRow(rt) {
    if (bulkScopeMode !== 'anchors') return [rt];
    const targets = new Set([rt]);
    const queue = [rt];
    const rels = window.masterPricing?.relationships || [];
    while (queue.length > 0) {
        const cur = queue.shift();
        rels.forEach(rel => {
            const rawA = rel.anchor || rel.source || rel.from || rel.roomA;
            const rawB = rel.target || rel.to || rel.roomB;
            if (!rawA || rawA === 'unlinked' || !rawB) return;
            const roomA = findCanonicalRoom(rawA) || rawA;
            const roomB = findCanonicalRoom(rawB) || rawB;
            if (roomA === cur && roomB && !targets.has(roomB)) {
                targets.add(roomB);
                queue.push(roomB);
            }
            if (roomB === cur && roomA && !targets.has(roomA)) {
                targets.add(roomA);
                queue.push(roomA);
            }
        });
    }
    return Array.from(targets);
}

function buildBulkRatesTree() {
    const activeRoomsLower = new Set((window.roomTypes || []).map(r => r.toLowerCase()));
    const rateMap = (window.channexRateMap || []).filter(rp => {
        if (!rp || !rp.ratePlanId) return false;
        const canonCat = (findCanonicalRoom(rp.pmsCategory) || rp.pmsCategory || '').toLowerCase();
        return activeRoomsLower.size === 0 || activeRoomsLower.has(canonCat);
    });

    const seenPlanKeys = new Set();
    const defLeaves = [{ key: 'DEF::BASE', label: 'DEF Non-Ref (Master)', planSig: null }];
    const dirLeaves = [{ key: 'DIR::BASE', label: 'Direct Rate (Master)', planSig: null }];
    const evtLeaves = [];
    const otaByBucket = new Map();
    const otherLeaves = [];

    if (window.enableEventRates || rateMap.some(r => isEventRatePlan(r))) {
        evtLeaves.push({ key: 'EVT::BASE', label: 'DEF Event Rate', planSig: null });
    }

    const connIdsByCode = new Map();
    rateMap.forEach(rp => {
        const ch = resolveChannelCode(rp.channel || '');
        if (!connIdsByCode.has(ch)) connIdsByCode.set(ch, new Set());
        connIdsByCode.get(ch).add(rp.channelId || 'default');
    });

    rateMap.forEach(rp => {
        const ch = resolveChannelCode(rp.channel || '');
        const cleanLabel = getCleanPlanLabel(rp);
        const planSig = getPlanSignature(rp);
        if (seenPlanKeys.has(planSig)) return;
        seenPlanKeys.add(planSig);

        const isMultiConn = (connIdsByCode.get(ch)?.size || 0) > 1 && rp.channelId;
        const leafLabel = (isMultiConn && rp.connectionTitle)
            ? `${cleanLabel} (${rp.connectionTitle})`
            : cleanLabel;

        const isEvt = isEventRatePlan(rp);
        const leaf = { key: `PLAN::${planSig}`, label: leafLabel, planSig };

        if (isEvt) {
            evtLeaves.push(leaf);
        } else if (ch === 'DEF') {
            defLeaves.push(leaf);
        } else if (ch === 'WEB' || ch === 'DIR') {
            dirLeaves.push(leaf);
        } else if (ch && ch !== 'OTH') {
            const isStandardPolicy = rp.policy === 'ref' || rp.policy === 'non-ref' || /\b(non-?ref|refundable|standard)\b/i.test(cleanLabel);
            if (isStandardPolicy) {
                const bucketKey = isMultiConn ? `${ch}::${rp.channelId}` : ch;
                const bucketLabel = isMultiConn
                    ? `${ch} — ${rp.connectionTitle || rp.channelId.slice(-6)}`
                    : `${ch} (${getChannelByCode(ch).name})`;
                const bucketShort = isMultiConn
                    ? `${ch} (${rp.connectionTitle || rp.channelId.slice(-6)})`
                    : `${ch} Rates`;

                if (!otaByBucket.has(bucketKey)) {
                    otaByBucket.set(bucketKey, { id: `ota-${bucketKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`, label: bucketLabel, shortLabel: bucketShort, leaves: [] });
                }
                otaByBucket.get(bucketKey).leaves.push(leaf);
            } else {
                otherLeaves.push(leaf);
            }
        } else {
            otherLeaves.push(leaf);
        }
    });

    const groups = [
        { id: 'grp-def', label: 'DEFAULT RATES (DEF)', shortLabel: 'DEF Rates', leaves: defLeaves, subgroups: [] },
        { id: 'grp-dir', label: 'DIRECT RATES (DIR)', shortLabel: 'Direct Rates', leaves: dirLeaves, subgroups: [] }
    ];

    if (otaByBucket.size > 0) {
        groups.push({ id: 'grp-ota', label: 'OTA RATES', shortLabel: 'OTA Rates', leaves: [], subgroups: Array.from(otaByBucket.values()) });
    }
    if (evtLeaves.length > 0) {
        groups.push({ id: 'grp-evt', label: 'EVENT RATES (EVT)', shortLabel: 'Event Rates', leaves: evtLeaves, subgroups: [] });
    }
    if (otherLeaves.length > 0) {
        groups.push({ id: 'grp-other', label: 'OTHER RATES', shortLabel: 'Other Rates', leaves: otherLeaves, subgroups: [] });
    }

    const allLeafKeys = [];
    const leafMap = new Map();
    groups.forEach(g => {
        g.leaves.forEach(l => { allLeafKeys.push(l.key); leafMap.set(l.key, l); });
        g.subgroups.forEach(sg => sg.leaves.forEach(l => { allLeafKeys.push(l.key); leafMap.set(l.key, l); }));
    });

    return { groups, allLeafKeys, leafMap };
}

function syncBulkRatesDropdownState(groups, allLeafKeys, leafMap) {
    const dropdown = document.getElementById('qb-rates-dropdown');
    const labelEl = document.getElementById('qb-rates-label');
    if (!dropdown) return;

    const totalCount = allLeafKeys.length;
    const selectedCount = bulkSelectedRateKeys.size;

    dropdown.querySelectorAll('input[data-leaf-key]').forEach(cb => {
        cb.checked = bulkSelectedRateKeys.has(cb.dataset.leafKey);
    });

    groups.forEach(g => {
        const groupLeaves = [...g.leaves, ...g.subgroups.flatMap(sg => sg.leaves)];
        const gSel = groupLeaves.filter(l => bulkSelectedRateKeys.has(l.key)).length;
        const gCb = document.getElementById(`qb-rate-cb-${g.id}`);
        if (gCb) {
            gCb.checked = gSel === groupLeaves.length && groupLeaves.length > 0;
            gCb.indeterminate = gSel > 0 && gSel < groupLeaves.length;
        }

        g.subgroups.forEach(sg => {
            const sgSel = sg.leaves.filter(l => bulkSelectedRateKeys.has(l.key)).length;
            const sgCb = document.getElementById(`qb-rate-cb-${sg.id}`);
            if (sgCb) {
                sgCb.checked = sgSel === sg.leaves.length && sg.leaves.length > 0;
                sgCb.indeterminate = sgSel > 0 && sgSel < sg.leaves.length;
            }
        });
    });

    if (labelEl) {
        if (selectedCount === 0) {
            labelEl.innerText = 'None Selected';
        } else if (selectedCount === totalCount) {
            labelEl.innerText = 'All Rates';
        } else if (selectedCount === 1) {
            const onlyKey = Array.from(bulkSelectedRateKeys)[0];
            labelEl.innerText = leafMap.get(onlyKey)?.label || '1 Selected';
        } else {
            const exactGroup = groups.find(g => {
                const gl = [...g.leaves, ...g.subgroups.flatMap(sg => sg.leaves)];
                return gl.length === selectedCount && gl.every(l => bulkSelectedRateKeys.has(l.key));
            });
            const exactSub = groups.flatMap(g => g.subgroups).find(sg =>
                sg.leaves.length === selectedCount && sg.leaves.every(l => bulkSelectedRateKeys.has(l.key))
            );
            if (exactGroup) labelEl.innerText = `${exactGroup.shortLabel} (${selectedCount})`;
            else if (exactSub) labelEl.innerText = `${exactSub.shortLabel} (${selectedCount})`;
            else labelEl.innerText = `${selectedCount} Selected`;
        }
    }
}

export function renderBulkRatesDropdown() {
    const dropdown = document.getElementById('qb-rates-dropdown');
    if (!dropdown) return;

    const { groups, allLeafKeys, leafMap } = buildBulkRatesTree();
    if (!bulkSelectedRateKeys) {
        bulkSelectedRateKeys = new Set(allLeafKeys);
    } else {
        bulkSelectedRateKeys = new Set(allLeafKeys.filter(k => bulkSelectedRateKeys.has(k)));
    }

    let html = `
        <div class="flex items-center justify-between gap-2 px-1.5 py-1 rounded bg-slate-100 border-b border-slate-200 mb-1 sticky top-0 z-10">
            <button type="button" onclick="event.stopPropagation(); window.toggleBulkRateNode('all', 'ALL', true)" class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[9.5px] cursor-pointer">Select All (${allLeafKeys.length})</button>
            <button type="button" onclick="event.stopPropagation(); window.toggleBulkRateNode('none', 'NONE', true)" class="px-2 py-0.5 rounded bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-black uppercase text-[9.5px] cursor-pointer">Clear All</button>
        </div>
    `;

    groups.forEach(g => {
        html += `
            <div class="mt-1">
                <label class="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 cursor-pointer font-black text-[10px] uppercase text-slate-700">
                    <input type="checkbox" id="qb-rate-cb-${g.id}" onchange="window.toggleBulkRateNode('group', '${g.id}', this.checked)" class="row-checkbox">
                    <span>${g.label}</span>
                </label>
                <div class="pl-3 space-y-0.5 mt-0.5">
                    ${g.leaves.map(l => `
                        <label class="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-[11px] font-semibold text-slate-700">
                            <input type="checkbox" data-leaf-key="${l.key.replace(/"/g, '&quot;')}" onchange="window.toggleBulkRateNode('leaf', '${l.key.replace(/'/g, "\\'")}', this.checked)" class="row-checkbox">
                            <span class="truncate">${l.label}</span>
                        </label>
                    `).join('')}
                    ${g.subgroups.map(sg => `
                        <div class="mt-0.5">
                            <label class="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer font-black text-[10px] uppercase text-slate-700">
                                <input type="checkbox" id="qb-rate-cb-${sg.id}" onchange="window.toggleBulkRateNode('subgroup', '${sg.id}', this.checked)" class="row-checkbox">
                                <span>${sg.label}</span>
                            </label>
                            <div class="pl-4 space-y-0.5">
                                ${sg.leaves.map(l => `
                                    <label class="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-[11px] font-semibold text-slate-600">
                                        <input type="checkbox" data-leaf-key="${l.key.replace(/"/g, '&quot;')}" onchange="window.toggleBulkRateNode('leaf', '${l.key.replace(/'/g, "\\'")}', this.checked)" class="row-checkbox">
                                        <span class="truncate">${l.label}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    dropdown.innerHTML = html;
    syncBulkRatesDropdownState(groups, allLeafKeys, leafMap);
}

export function toggleBulkRatesDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('qb-rates-dropdown');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        renderBulkRatesDropdown();
        dropdown.classList.remove('hidden');
    } else {
        dropdown.classList.add('hidden');
    }
}

export function toggleBulkRateNode(nodeType, nodeId, checked) {
    const { groups, allLeafKeys, leafMap } = buildBulkRatesTree();
    if (!bulkSelectedRateKeys) bulkSelectedRateKeys = new Set(allLeafKeys);

    if (nodeType === 'none') {
        bulkSelectedRateKeys.clear();
        syncBulkRatesDropdownState(groups, allLeafKeys, leafMap);
        return;
    }

    let targetKeys = [];
    if (nodeType === 'all') {
        targetKeys = allLeafKeys;
    } else if (nodeType === 'group') {
        const grp = groups.find(g => g.id === nodeId);
        if (grp) targetKeys = [...grp.leaves, ...grp.subgroups.flatMap(sg => sg.leaves)].map(l => l.key);
    } else if (nodeType === 'subgroup') {
        const sub = groups.flatMap(g => g.subgroups).find(sg => sg.id === nodeId);
        if (sub) targetKeys = sub.leaves.map(l => l.key);
    } else if (nodeType === 'leaf') {
        targetKeys = [nodeId];
    }

    targetKeys.forEach(k => {
        if (checked) bulkSelectedRateKeys.add(k);
        else bulkSelectedRateKeys.delete(k);
    });

    syncBulkRatesDropdownState(groups, allLeafKeys, leafMap);
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
        if (e.target && e.target.isConnected && !e.target.closest('#qb-rates-wrap')) {
            document.getElementById('qb-rates-dropdown')?.classList.add('hidden');
        }
    });
}

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

        renderBulkRatesDropdown();
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
            ? "px-2 py-0.5 rounded cursor-pointer bg-white text-indigo-700 shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer text-slate-600 hover:bg-white";
        btnAll.className = mode === 'all'
            ? "px-2 py-0.5 rounded cursor-pointer bg-white text-indigo-700 shadow-2xs font-black"
            : "px-2 py-0.5 rounded cursor-pointer text-slate-600 hover:bg-white";
    }
    renderBulkGrid();
}

export function cycleBulkRowPill(btn) {
    if (!btn) return;
    const states = ['nochange', 'open', 'cta', 'ctd', 'both', 'stop'];
    const cur = btn.dataset.state || 'nochange';
    const next = states[(states.indexOf(cur) + 1) % states.length];
    btn.dataset.state = next;

    const labels = {
        nochange: 'No Change',
        open: 'OPEN (Clear Closures)',
        cta: 'CTA (Closed Arrival)',
        ctd: 'CTD (Closed Depart)',
        both: 'CTB (Closed Both)',
        stop: 'STOP (Stop Sell)'
    };

    const classes = {
        nochange: 'bg-slate-100 text-slate-600 border-slate-300',
        open: 'bg-emerald-100 text-emerald-900 border-emerald-400',
        cta: 'bg-amber-200 text-amber-900 border-amber-400',
        ctd: 'bg-sky-200 text-sky-900 border-sky-400',
        both: 'bg-purple-200 text-purple-900 border-purple-400',
        stop: 'bg-rose-600 text-white border-rose-600'
    };

    btn.className = `qb-val-pill w-full sm:w-44 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-2xs ${classes[next]}`;
    btn.innerHTML = labels[next];
}

export function renderBulkGrid() {
    const qbBody = document.getElementById('qb-grid-body');
    if (!qbBody) return;

    const inptCls = "table-input text-center font-black";
    const pillBtn = `<button type="button" data-state="nochange" onclick="window.cycleBulkRowPill(this)" class="qb-val-pill w-full sm:w-44 py-1 text-center text-[10px] font-black uppercase rounded cursor-pointer transition-colors border shadow-2xs bg-slate-100 text-slate-600 border-slate-300">No Change</button>`;

    let html = `
    <tr class="bg-slate-50 font-black text-slate-800" data-type="global" data-id="GLOBAL">
        <td class="p-1.5 border-r border-slate-200 font-black uppercase text-slate-700">
            GLOBAL (All Rooms)
        </td>
        <td class="p-1 border-r border-slate-200 text-center">
            <input type="text" disabled placeholder="--" class="${inptCls} !bg-slate-100 !text-slate-400 cursor-not-allowed">
        </td>
        <td class="p-1 border-r border-slate-200 text-center">
            <input type="text" class="${inptCls} qb-val-min" placeholder="e.g. 3 or 3▸">
        </td>
        <td class="p-1 border-r border-slate-200 text-center">
            <input type="text" class="${inptCls} qb-val-max" placeholder="e.g. 14">
        </td>
        <td class="p-1 text-center">
            ${pillBtn}
        </td>
    </tr>`;

    let roomsToRender = [...(window.roomTypes || [])];
    const { anchorP, anchorD } = getResolvedAnchors();

    if (bulkScopeMode === 'anchors') {
        roomsToRender = Array.from(new Set([anchorP, anchorD].filter(Boolean)));
        if (roomsToRender.length === 0 && (window.roomTypes || []).length > 0) {
            roomsToRender = [window.roomTypes[0]];
        }
    }

    roomsToRender.forEach(r => {
        const displayName = window.displayAbbrev?.[r] || r;
        const isAnchor = (r === anchorP || r === anchorD);

        html += `
        <tr class="bg-white hover:bg-slate-50 text-slate-800 transition-colors" data-type="room" data-id="${r}">
            <td class="p-1.5 border-r border-slate-200 font-bold text-slate-800 truncate">
                ${displayName} ${isAnchor ? '<span class="setup-badge-std !text-indigo-700 !bg-indigo-50 !border-indigo-200 ml-1">ANCHOR</span>' : ''}
            </td>
            <td class="p-1 border-r border-slate-200 text-center">
                <input type="number" step="any" class="${inptCls} qb-val-rate !text-indigo-700" placeholder="--">
            </td>
            <td class="p-1 border-r border-slate-200 text-center">
                <input type="text" class="${inptCls} qb-val-min" placeholder="e.g. 3 or 3▸">
            </td>
            <td class="p-1 border-r border-slate-200 text-center">
                <input type="text" class="${inptCls} qb-val-max" placeholder="e.g. 14">
            </td>
            <td class="p-1 text-center">
                ${pillBtn}
            </td>
        </tr>`;
    });

    qbBody.innerHTML = html;
}

function clearRoomRestrictionFields(rmData, rule) {
    if (!rmData) return;
    if (rule.min !== undefined || rule.min_arr !== undefined) {
        delete rmData.min;
        delete rmData.min_arr;
        if (rmData.isOverride) { delete rmData.isOverride.min; delete rmData.isOverride.min_arr; }
    }
    if (rule.max !== undefined) {
        delete rmData.max;
        if (rmData.isOverride) delete rmData.isOverride.max;
    }
    if (rule.pillState !== 'nochange') {
        delete rmData.cta;
        delete rmData.ctd;
        delete rmData.stop;
        delete rmData.stopSell;
        delete rmData.evt_stop;
        delete rmData.evt_stopSell;
        delete rmData.dir_stop;
        delete rmData.dir_stopSell;
        if (rmData.isOverride) { delete rmData.isOverride.cta; delete rmData.isOverride.ctd; delete rmData.isOverride.stop; }
    }
}

export function applyBulkGrid(isClear = false) {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e) return customAlert("Validation Error", "Please choose a valid Start and End date range.");
    if (s > e) return customAlert("Validation Error", "End date must be on or after Start date.");

    const { allLeafKeys, leafMap } = buildBulkRatesTree();
    if (!bulkSelectedRateKeys) bulkSelectedRateKeys = new Set(allLeafKeys);
    if (!isClear && bulkSelectedRateKeys.size === 0) {
        return customAlert("No Rates Selected", "Select at least one rate plan in the Rates dropdown before applying.");
    }

    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline = window.masterPricing.timeline || {};
    window.dirtyDates = window.dirtyDates || new Set();
    window.syncedDates = window.syncedDates || new Set();
    window.dirtyCellKeys = window.dirtyCellKeys || new Set();
    window.justSyncedCellKeys = window.justSyncedCellKeys || new Set();

    const sU = parseYMD(s);
    const eU = parseYMD(e);
    const rows = document.querySelectorAll('#qb-grid-body tr');
    const isAllRatesSelected = bulkSelectedRateKeys.size === allLeafKeys.length;

    const selectedPlanSigs = new Set();
    bulkSelectedRateKeys.forEach(k => {
        const sig = leafMap.get(k)?.planSig;
        if (sig) selectedPlanSigs.add(sig);
    });

    const applyRestrictionPayload = (dObj, dateStr, targetRoom, r) => {
        const targetRooms = getTargetRoomsForBulkRow(targetRoom);

        if (isAllRatesSelected || bulkSelectedRateKeys.has('DEF::BASE')) {
            targetRooms.forEach(rm => {
                const rmData = dObj[rm] || (dObj[rm] = { isOverride: {} });
                rmData.isOverride = rmData.isOverride || {};
                if (r.min !== undefined) { rmData.min = r.min; delete rmData.min_arr; rmData.isOverride.min = true; }
                if (r.min_arr !== undefined) { rmData.min_arr = r.min_arr; delete rmData.min; rmData.isOverride.min_arr = true; }
                if (r.max !== undefined) { rmData.max = r.max; rmData.isOverride.max = true; }
                if (r.pillState !== 'nochange') {
                    rmData.cta = r.cta;
                    rmData.ctd = r.ctd;
                    rmData.stop = r.stop;
                    delete rmData.stopSell;
                    rmData.isOverride.cta = true;
                    rmData.isOverride.ctd = true;
                    rmData.isOverride.stop = true;
                }
                window.dirtyCellKeys.add(`${dateStr}|${rm}`);
                window.justSyncedCellKeys.delete(`${dateStr}|${rm}`);
            });
        }

        if (isAllRatesSelected || bulkSelectedRateKeys.has('DIR::BASE')) {
            targetRooms.forEach(rm => {
                const rmData = dObj[rm] || (dObj[rm] = { isOverride: {} });
                if (r.min !== undefined) { rmData.dir_min = r.min; delete rmData.dir_min_arr; }
                if (r.min_arr !== undefined) { rmData.dir_min_arr = r.min_arr; delete rmData.dir_min; }
                if (r.max !== undefined) { rmData.dir_max = r.max; }
                if (r.pillState !== 'nochange') {
                    rmData.dir_cta = r.cta;
                    rmData.dir_ctd = r.ctd;
                    rmData.dir_stop = r.stop;
                    delete rmData.dir_stopSell;
                }
            });
        }

        if (isAllRatesSelected || bulkSelectedRateKeys.has('EVT::BASE')) {
            targetRooms.forEach(rm => {
                const rmData = dObj[rm] || (dObj[rm] = { isOverride: {} });
                if (r.min !== undefined) { rmData.evt_min = r.min; delete rmData.evt_min_arr; }
                if (r.min_arr !== undefined) { rmData.evt_min_arr = r.min_arr; delete rmData.evt_min; }
                if (r.max !== undefined) { rmData.evt_max = r.max; }
                if (r.pillState !== 'nochange') {
                    rmData.evt_cta = r.cta;
                    rmData.evt_ctd = r.ctd;
                    rmData.evt_stop = r.stop;
                    delete rmData.evt_stopSell;
                }
                window.dirtyCellKeys.add(`${dateStr}|${rm}`);
                window.justSyncedCellKeys.delete(`${dateStr}|${rm}`);
            });
        }

        if (isAllRatesSelected) {
            if (dObj.otaOverrides) {
                (window.channexRateMap || []).forEach(rp => {
                    const mappedCat = findCanonicalRoom(rp.pmsCategory) || rp.pmsCategory;
                    if (!targetRooms.includes(mappedCat)) return;
                    if (r.min !== undefined || r.min_arr !== undefined) {
                        delete dObj.otaOverrides[`${rp.ratePlanId}_min`];
                        delete dObj.otaOverrides[`${rp.ratePlanId}_min_arr`];
                    }
                    if (r.max !== undefined) delete dObj.otaOverrides[`${rp.ratePlanId}_max`];
                    if (r.pillState !== 'nochange') {
                        delete dObj.otaOverrides[`${rp.ratePlanId}_cta`];
                        delete dObj.otaOverrides[`${rp.ratePlanId}_ctd`];
                        delete dObj.otaOverrides[`${rp.ratePlanId}_stop`];
                    }
                });
            }
        } else if (selectedPlanSigs.size > 0) {
            dObj.otaOverrides = dObj.otaOverrides || {};
            (window.channexRateMap || []).forEach(rp => {
                const mappedCat = findCanonicalRoom(rp.pmsCategory) || rp.pmsCategory;
                if (!targetRooms.includes(mappedCat)) return;
                const planSig = getPlanSignature(rp);
                if (!selectedPlanSigs.has(planSig)) return;

                if (r.min !== undefined) { dObj.otaOverrides[`${rp.ratePlanId}_min`] = r.min; delete dObj.otaOverrides[`${rp.ratePlanId}_min_arr`]; }
                if (r.min_arr !== undefined) { dObj.otaOverrides[`${rp.ratePlanId}_min_arr`] = r.min_arr; delete dObj.otaOverrides[`${rp.ratePlanId}_min`]; }
                if (r.max !== undefined) { dObj.otaOverrides[`${rp.ratePlanId}_max`] = r.max; }
                if (r.pillState !== 'nochange') {
                    dObj.otaOverrides[`${rp.ratePlanId}_cta`] = r.cta;
                    dObj.otaOverrides[`${rp.ratePlanId}_ctd`] = r.ctd;
                    dObj.otaOverrides[`${rp.ratePlanId}_stop`] = r.stop;
                }
            });
        }
    };

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
        const pillState = pill?.dataset.state || 'nochange';

        let cta = undefined, ctd = undefined, stop = undefined;
        if (pillState === 'open') { cta = false; ctd = false; stop = false; }
        else if (pillState === 'cta') { cta = true; ctd = false; stop = false; }
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
            const hasGlobalRestr = globalRule.min !== undefined || globalRule.min_arr !== undefined || globalRule.max !== undefined || globalRule.pillState !== 'nochange';
            dObj['GLOBAL'] = dObj['GLOBAL'] || { isOverride: {} };
            dObj['GLOBAL'].isOverride = dObj['GLOBAL'].isOverride || {};
            if (isClear) {
                delete dObj['GLOBAL'].min;
                delete dObj['GLOBAL'].max;
                delete dObj['GLOBAL'].min_arr;
                delete dObj['GLOBAL'].cta;
                delete dObj['GLOBAL'].ctd;
                delete dObj['GLOBAL'].stop;
                delete dObj['GLOBAL'].stopSell;
                dObj['GLOBAL'].isOverride = {};
            } else if (hasGlobalRestr) {
                if (isAllRatesSelected) {
                    if (globalRule.min !== undefined) { dObj['GLOBAL'].min = globalRule.min; delete dObj['GLOBAL'].min_arr; dObj['GLOBAL'].isOverride.min = true; }
                    if (globalRule.min_arr !== undefined) { dObj['GLOBAL'].min_arr = globalRule.min_arr; delete dObj['GLOBAL'].min; dObj['GLOBAL'].isOverride.min_arr = true; }
                    if (globalRule.max !== undefined) { dObj['GLOBAL'].max = globalRule.max; dObj['GLOBAL'].isOverride.max = true; }
                    if (globalRule.pillState !== 'nochange') {
                        dObj['GLOBAL'].cta = globalRule.cta;
                        dObj['GLOBAL'].ctd = globalRule.ctd;
                        dObj['GLOBAL'].stop = globalRule.stop;
                        delete dObj['GLOBAL'].stopSell;
                        dObj['GLOBAL'].isOverride.cta = true;
                        dObj['GLOBAL'].isOverride.ctd = true;
                        dObj['GLOBAL'].isOverride.stop = true;
                    }
                    (window.roomTypes || []).forEach(rt => clearRoomRestrictionFields(dObj[rt], globalRule));
                } else {
                    (window.roomTypes || []).forEach(rt => applyRestrictionPayload(dObj, dateStr, rt, globalRule));
                }
                if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'rate', '*');
            }
        }

        roomUpdates.forEach(r => {
            const rt = findCanonicalRoom(r.id) || r.id;
            dObj[rt] = dObj[rt] || { isOverride: {} };
            const rData = dObj[rt];
            rData.isOverride = rData.isOverride || {};

            if (isClear) {
                getTargetRoomsForBulkRow(rt).forEach(targetRm => {
                    if (!dObj[targetRm]) return;
                    delete dObj[targetRm].std;
                    delete dObj[targetRm].min;
                    delete dObj[targetRm].max;
                    delete dObj[targetRm].min_arr;
                    delete dObj[targetRm].cta;
                    delete dObj[targetRm].ctd;
                    delete dObj[targetRm].stop;
                    delete dObj[targetRm].stopSell;
                    delete dObj[targetRm].evt_stop;
                    delete dObj[targetRm].evt_stopSell;
                    delete dObj[targetRm].dir_stop;
                    delete dObj[targetRm].dir_stopSell;
                    dObj[targetRm].isOverride = {};
                    window.dirtyCellKeys.add(`${dateStr}|${targetRm}`);
                    window.justSyncedCellKeys.delete(`${dateStr}|${targetRm}`);
                });
                if (typeof window.markCmDirty === 'function') {
                    window.markCmDirty(dateStr, 'rate', bulkScopeMode === 'anchors' ? '*' : `ROOM:${rt}`);
                }
            } else {
                const hasRateChange = r.rate !== undefined && !isNaN(r.rate);
                const hasRestrChange = r.min !== undefined || r.min_arr !== undefined || r.max !== undefined || r.pillState !== 'nochange';

                if (hasRateChange) {
                    rData.std = roundCurrency(r.rate);
                    rData.isOverride.std = true;
                    window.dirtyCellKeys.add(`${dateStr}|${rt}`);
                    window.justSyncedCellKeys.delete(`${dateStr}|${rt}`);
                    if (bulkScopeMode === 'anchors') {
                        rippleDay(dateStr, rt, true);
                    }
                }
                if (hasRestrChange) {
                    applyRestrictionPayload(dObj, dateStr, rt, r);
                }
                if ((hasRateChange || hasRestrChange) && typeof window.markCmDirty === 'function') {
                    window.markCmDirty(dateStr, 'rate', bulkScopeMode === 'anchors' ? '*' : `ROOM:${rt}`);
                }
            }
        });
    }

    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
    toggleQuickBulk(true);
    customAlert("Bulk Update", isClear ? "Overrides cleared across the selected range." : `Applied updates from ${s} to ${e}.`);
}

export function runRippleRecovery(mode = 'blanks') {
    const s = document.getElementById('qb-start')?.value;
    const e = document.getElementById('qb-end')?.value;
    if (!s || !e) return customAlert("Validation Error", "Please choose a valid Start and End date range.");
    if (s > e) return customAlert("Validation Error", "End date must be on or after Start date.");

    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline = window.masterPricing.timeline || {};
    const allRooms = window.roomTypes || [];
    const { anchorP, anchorD } = getResolvedAnchors();
    const sU = parseYMD(s);
    const eU = parseYMD(e);

    let updatedCount = 0;

    for (let d = sU; d <= eU; d += 86400000) {
        const dateStr = getLocalYMD(new Date(d));
        const dObj = window.masterPricing.timeline[dateStr];
        if (!dObj) continue;

        if (mode === 'blanks') {
            const preservedRates = {};
            allRooms.forEach(rt => {
                const cur = dObj[rt];
                if (cur && cur.std !== undefined && cur.std !== "") {
                    preservedRates[rt] = { std: cur.std, fmp: cur.fmp, isStdOvr: !!cur.isOverride?.std, isFmpOvr: !!cur.isOverride?.fmp };
                }
            });

            const seeds = Array.from(new Set([anchorP, anchorD, ...Object.keys(preservedRates)].filter(Boolean)));
            seeds.forEach(seed => {
                if (preservedRates[seed]) rippleDay(dateStr, seed, true);
            });

            allRooms.forEach(rt => {
                if (preservedRates[rt]) {
                    dObj[rt] = dObj[rt] || { isOverride: {} };
                    dObj[rt].std = preservedRates[rt].std;
                    if (preservedRates[rt].fmp !== undefined) dObj[rt].fmp = preservedRates[rt].fmp;
                    dObj[rt].isOverride = dObj[rt].isOverride || {};
                    if (preservedRates[rt].isStdOvr) dObj[rt].isOverride.std = true;
                    if (preservedRates[rt].isFmpOvr) dObj[rt].isOverride.fmp = true;
                } else if (dObj[rt] && dObj[rt].std !== undefined && dObj[rt].std !== "") {
                    updatedCount++;
                    if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'rate', `ROOM:${rt}`);
                }
            });
        } else {
            [anchorP, anchorD].filter(Boolean).forEach(anc => {
                if (dObj[anc] && (dObj[anc].std !== undefined || dObj[anc].fmp !== undefined)) {
                    rippleDay(dateStr, anc, false);
                    updatedCount++;
                    if (typeof window.markCmDirty === 'function') window.markCmDirty(dateStr, 'rate', '*');
                }
            });
        }
    }

    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
    toggleQuickBulk(true);
    customAlert(
        mode === 'blanks' ? "Fill Blanks Complete" : "Re-Ripple Complete",
        mode === 'blanks'
            ? `Populated ${updatedCount} missing room cell(s) from ${s} to ${e}.`
            : `Recalculated linked rooms across ${updatedCount} anchor date(s) from ${s} to ${e}.`
    );
}

// --- 2. QUICK EVENT CURVE & PYRAMID TUNER CONTROLLERS ---

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

export async function addCmEventDate() {
    const input = document.getElementById('ct-new-event-date');
    const newDate = input?.value;
    if (!newDate) return customAlert("Date Required", "Pick a date in the '+ Event' date box first.");

    const events = new Set(window.eventDates || []);
    events.add(newDate);
    window.eventDates = Array.from(events).sort();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            events: window.eventDates
        });
        if (input) input.value = '';
        initCurveTuner(newDate);
        renderRateMatrix();
    } catch (err) {
        customAlert("Save Error", err.message);
    }
}

export async function removeCmEventDate() {
    const select = document.getElementById('ct-event-select');
    const target = select?.value;
    if (!target) return;

    window.eventDates = (window.eventDates || []).filter(d => d !== target);

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            events: window.eventDates
        });
        initCurveTuner();
        renderRateMatrix();
    } catch (err) {
        customAlert("Delete Error", err.message);
    }
}

export function initCurveTuner(targetDateStr = null) {
    const select = document.getElementById('ct-event-select');
    if (!select) return;

    const todayStr = getLocalYMD(new Date());
    const upcomingEvents = (window.eventDates || [])
        .filter(d => d >= todayStr || (targetDateStr && d === targetDateStr))
        .slice()
        .sort();

    if (upcomingEvents.length === 0) {
        select.innerHTML = `<option value="">No upcoming events — add a date →</option>`;
        renderCurveRestrictionsGrid();
        return;
    }

    const selectedDate = (targetDateStr && upcomingEvents.includes(targetDateStr))
        ? targetDateStr
        : upcomingEvents[0];

    select.innerHTML = upcomingEvents.map(dStr => {
        const dObj = new Date(dStr + "T12:00:00Z");
        return `<option value="${dStr}" ${dStr === selectedDate ? 'selected' : ''}>${dObj.getUTCDate()} ${mNames[dObj.getUTCMonth()]} ${dObj.getUTCFullYear()} (${dStr})</option>`;
    }).join('');

    handleCurveEventSelect(selectedDate);
}

export function renderCurveRestrictionsGrid(selectedDateStr = null, forceBaselines = false) {
    const rThead = document.getElementById('ct-restr-thead');
    const rTbody = document.getElementById('ct-restr-tbody');
    if (!rThead || !rTbody) return;

    const b = window.savedAutofillBaselines || {};
    const timeline = window.masterPricing?.timeline || {};
    const evtDate = selectedDateStr || document.getElementById('ct-event-select')?.value || null;
    const peakMs = evtDate ? parseYMD(evtDate) : 0;
    const offsets = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
    const tagOf = off => (off < 0 ? `m${Math.abs(off)}` : (off === 0 ? '0' : `p${off}`));

    const getRestrFieldVal = (off, evtField, bPrefix, isBool = false) => {
        const tag = tagOf(off);
        if (!forceBaselines && peakMs) {
            const dStr = getLocalYMD(new Date(peakMs + (off * 86400000)));
            const evtObj = timeline[dStr]?.evtRestrictions;
            if (evtObj && typeof evtObj === 'object') {
                return isBool ? !!evtObj[evtField] : (evtObj[evtField] ?? '');
            }
        }
        return isBool ? !!b[`${bPrefix}_${tag}`] : (b[`${bPrefix}_${tag}`] ?? '');
    };

    rThead.innerHTML = `<tr>
        <th class="p-1.5 text-left border-r border-slate-200">
            <div class="flex items-center gap-1.5">
                <span>Event Restrictions (±6d)</span>
                <button type="button" onclick="window.applyCmPyramidPreset()" class="preset-pill !bg-pink-50 !text-pink-700 !border-pink-200 hover:!bg-pink-100">Pyramid Preset</button>
            </div>
        </th>
        ${offsets.map(off => `<th class="p-1 border-r border-slate-200 ${off === 0 ? 'bg-indigo-50 text-indigo-800' : ''}">${off === 0 ? 'PEAK' : (off > 0 ? `+${off}` : off)}</th>`).join('')}
    </tr>`;

    const numRows = [
        { idPrefix: 'ct-r-min', evtField: 'min', bPrefix: 'r_min', label: 'Min Stay (Through)', cls: 'text-slate-800' },
        { idPrefix: 'ct-r-minarr', evtField: 'min_arr', bPrefix: 'r_minarr', label: 'Min on Arrival', cls: 'text-indigo-700' },
        { idPrefix: 'ct-r-max', evtField: 'max', bPrefix: 'r_max', label: 'Max Stay', cls: 'text-slate-600' }
    ];

    const boolRows = [
        { idPrefix: 'ct-r-cta', evtField: 'cta', bPrefix: 'r_cta', label: 'Closed to Arrival (CTA)' },
        { idPrefix: 'ct-r-ctd', evtField: 'ctd', bPrefix: 'r_ctd', label: 'Closed to Departure (CTD)' }
    ];

    let html = numRows.map(r => `<tr>
        <td class="p-1 text-left border-r border-slate-200 text-slate-700 font-bold">${r.label}</td>
        ${offsets.map(off => {
            const tag = tagOf(off);
            const val = getRestrFieldVal(off, r.evtField, r.bPrefix, false);
            return `<td class="p-0.5 border-r border-slate-200 ${off === 0 ? 'bg-indigo-50/40' : ''}">
                <input type="number" min="1" id="${r.idPrefix}-${tag}" class="table-input !w-9 text-center font-black ${r.cls}" value="${val}" placeholder="-">
            </td>`;
        }).join('')}
    </tr>`).join('');

    html += boolRows.map(r => `<tr>
        <td class="p-1 text-left border-r border-slate-200 text-slate-700 font-bold">${r.label}</td>
        ${offsets.map(off => {
            const tag = tagOf(off);
            const checked = getRestrFieldVal(off, r.evtField, r.bPrefix, true);
            return `<td class="p-0.5 border-r border-slate-200 ${off === 0 ? 'bg-indigo-50/40' : ''}">
                <input type="checkbox" id="${r.idPrefix}-${tag}" class="row-checkbox cursor-pointer" ${checked ? 'checked' : ''}>
            </td>`;
        }).join('')}
    </tr>`).join('');

    rTbody.innerHTML = html;
}

export function applyCmPyramidPreset() {
    window.savedAutofillBaselines = window.savedAutofillBaselines || {};
    const b = window.savedAutofillBaselines;
    for (let off = -6; off <= 6; off++) {
        const tag = off < 0 ? `m${Math.abs(off)}` : (off === 0 ? '0' : `p${off}`);
        const absOff = Math.abs(off);
        b[`r_min_${tag}`] = absOff + 1;
        b[`r_minarr_${tag}`] = off <= 0 ? (absOff + 1) : 7;
        b[`r_cta_${tag}`] = off > 0;
        b[`r_ctd_${tag}`] = false;
    }
    const evtDate = document.getElementById('ct-event-select')?.value || null;
    renderCurveRestrictionsGrid(evtDate, true);
}

export function handleCurveEventSelect(selectedDateStr) {
    renderCurveRestrictionsGrid(selectedDateStr, false);
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

    const { anchorP, anchorD } = getResolvedAnchors();
    const b = window.savedAutofillBaselines || {};
    const timeline = window.masterPricing?.timeline || {};

    const getTimelineVal = (off, room, field, baselineKey, defaultVal) => {
        if (room) {
            const dStr = getLocalYMD(new Date(peakMs + (off * 86400000)));
            const dayData = timeline[dStr]?.[room];
            if (dayData && dayData[field] !== undefined && dayData[field] !== "") {
                return dayData[field];
            }
        }
        return b[baselineKey] !== undefined ? b[baselineKey] : defaultVal;
    };

    const inptCls = "table-input text-center font-black";
    const peakInptCls = "table-input text-center font-black !border-indigo-400 !bg-indigo-50/40 !text-indigo-900";

    let rowsHtml = '';
    if (anchorP) {
        const labelP = window.displayAbbrev?.[anchorP] || anchorP;
        rowsHtml += `
        <tr class="bg-white text-slate-800" data-segment="p" data-anchor="${anchorP}">
            <td class="p-1.5 text-left border-r border-slate-200 text-indigo-800 font-black truncate" title="${anchorP}">${labelP}</td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-base" class="${inptCls}" value="${b.p_base || 899}" onchange="window.recalcCurveTunerShoulders('p')"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-pkg" class="table-input-pink table-input text-center" value="${getTimelineVal(-1, anchorP, 'fmp', 'p_pkg', 1000)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-m2" class="${inptCls}" value="${getTimelineVal(-2, anchorP, 'std', 'p_m2', 1099)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-m1" class="${inptCls}" value="${getTimelineVal(-1, anchorP, 'std', 'p_m1', 1999)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-0" class="${peakInptCls}" value="${getTimelineVal(0, anchorP, 'std', 'p_0', 5999)}" oninput="window.recalcCurveTunerShoulders('p')"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-p-p1" class="${inptCls}" value="${getTimelineVal(1, anchorP, 'std', 'p_p1', 1999)}"></td>
            <td class="p-1"><input type="number" id="ct-p-p2" class="${inptCls}" value="${getTimelineVal(2, anchorP, 'std', 'p_p2', 1099)}"></td>
        </tr>`;
    }

    if (anchorD) {
        const labelD = window.displayAbbrev?.[anchorD] || anchorD;
        rowsHtml += `
        <tr class="bg-slate-50/60 text-slate-800" data-segment="d" data-anchor="${anchorD}">
            <td class="p-1.5 text-left border-r border-slate-200 text-slate-800 font-black truncate" title="${anchorD}">${labelD}</td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-base" class="${inptCls}" value="${b.d_base || 199}" onchange="window.recalcCurveTunerShoulders('d')"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-pkg" class="table-input-pink table-input text-center" value="${getTimelineVal(-1, anchorD, 'fmp', 'd_pkg', 200)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-m2" class="${inptCls}" value="${getTimelineVal(-2, anchorD, 'std', 'd_m2', 299)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-m1" class="${inptCls}" value="${getTimelineVal(-1, anchorD, 'std', 'd_m1', 799)}"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-0" class="${peakInptCls}" value="${getTimelineVal(0, anchorD, 'std', 'd_0', 2499)}" oninput="window.recalcCurveTunerShoulders('d')"></td>
            <td class="p-1 border-r border-slate-200"><input type="number" id="ct-d-p1" class="${inptCls}" value="${getTimelineVal(1, anchorD, 'std', 'd_p1', 799)}"></td>
            <td class="p-1"><input type="number" id="ct-d-p2" class="${inptCls}" value="${getTimelineVal(2, anchorD, 'std', 'd_p2', 299)}"></td>
        </tr>`;
    }

    body.innerHTML = rowsHtml;
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

function readCurveRestrictionsFromUI() {
    const out = {};
    for (let off = -6; off <= 6; off++) {
        const tag = off < 0 ? `m${Math.abs(off)}` : (off === 0 ? '0' : `p${off}`);
        const minV = document.getElementById(`ct-r-min-${tag}`)?.value;
        const minArrV = document.getElementById(`ct-r-minarr-${tag}`)?.value;
        const maxV = document.getElementById(`ct-r-max-${tag}`)?.value;
        const ctaV = !!document.getElementById(`ct-r-cta-${tag}`)?.checked;
        const ctdV = !!document.getElementById(`ct-r-ctd-${tag}`)?.checked;

        out[`r_min_${tag}`] = minV !== undefined && minV !== '' ? parseInt(minV, 10) : '';
        out[`r_minarr_${tag}`] = minArrV !== undefined && minArrV !== '' ? parseInt(minArrV, 10) : '';
        out[`r_max_${tag}`] = maxV !== undefined && maxV !== '' ? parseInt(maxV, 10) : '';
        out[`r_cta_${tag}`] = ctaV;
        out[`r_ctd_${tag}`] = ctdV;
    }
    return out;
}

export function applyCurveTuner() {
    const select = document.getElementById('ct-event-select');
    const evtStr = select?.value;
    if (!evtStr) return customAlert("Input Required", "Please select or add an event date first.");

    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline = window.masterPricing.timeline || {};
    window.dirtyDates = window.dirtyDates || new Set();
    window.syncedDates = window.syncedDates || new Set();

    window.enableEventRates = true;
    window.showEventRows = true;
    if (window.currentPropertyConfig) window.currentPropertyConfig.enableEventRates = true;
    if (typeof window.updateEventPricingToggleUI === 'function') window.updateEventPricingToggleUI();
    if (window.currentPropertyId) {
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            enableEventRates: true
        }).catch(err => console.warn("[Curve Tuner] Could not persist enableEventRates:", err));
    }

    const peakMs = parseYMD(evtStr);
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;

    const p_pkg = getVal('ct-p-pkg') || 1000;
    const d_pkg = getVal('ct-d-pkg') || 200;

    const p_rates = { [-2]: getVal('ct-p-m2'), [-1]: getVal('ct-p-m1'), [0]: getVal('ct-p-0'), [1]: getVal('ct-p-p1'), [2]: getVal('ct-p-p2') };
    const d_rates = { [-2]: getVal('ct-d-m2'), [-1]: getVal('ct-d-m1'), [0]: getVal('ct-d-0'), [1]: getVal('ct-d-p1'), [2]: getVal('ct-d-p2') };

    const { anchorP, anchorD } = getResolvedAnchors();
    if (!anchorP && !anchorD) {
        return customAlert("No Rooms Found", "No active room categories were found to apply the curve to.");
    }

    const restrMap = readCurveRestrictionsFromUI();
    const evtRatePlans = (window.channexRateMap || []).filter(isEventRatePlan);

    for (let off = -6; off <= 6; off++) {
        const dStr = getLocalYMD(new Date(peakMs + (off * 86400000)));
        window.masterPricing.timeline[dStr] = window.masterPricing.timeline[dStr] || {};
        const dObj = window.masterPricing.timeline[dStr];
        const isPeak = (off === 0);

        if (anchorP) {
            dObj[anchorP] = dObj[anchorP] || { isOverride: {} };
            dObj[anchorP].isOverride = dObj[anchorP].isOverride || {};
            if (p_rates[off] !== undefined && p_rates[off] > 0) {
                dObj[anchorP].std = p_rates[off];
                dObj[anchorP].isOverride.std = true;
            }
            dObj[anchorP].fmp = isPeak ? (p_rates[0] || p_pkg) : p_pkg;
            dObj[anchorP].isOverride.fmp = true;
            rippleDay(dStr, anchorP, true);
        }

        if (anchorD) {
            dObj[anchorD] = dObj[anchorD] || { isOverride: {} };
            dObj[anchorD].isOverride = dObj[anchorD].isOverride || {};
            if (d_rates[off] !== undefined && d_rates[off] > 0) {
                dObj[anchorD].std = d_rates[off];
                dObj[anchorD].isOverride.std = true;
            }
            dObj[anchorD].fmp = isPeak ? (d_rates[0] || d_pkg) : d_pkg;
            dObj[anchorD].isOverride.fmp = true;
            rippleDay(dStr, anchorD, true);
        }

        const tag = off < 0 ? `m${Math.abs(off)}` : (off === 0 ? '0' : `p${off}`);
        const rMin = restrMap[`r_min_${tag}`];
        const rMinArr = restrMap[`r_minarr_${tag}`];
        const rMax = restrMap[`r_max_${tag}`];
        const rCta = !!restrMap[`r_cta_${tag}`];
        const rCtd = !!restrMap[`r_ctd_${tag}`];

        dObj.evtRestrictions = {
            min: rMin,
            min_arr: rMinArr,
            max: rMax,
            cta: rCta,
            ctd: rCtd
        };

        // Clear any stale per-room event restriction overrides so Curve Tuner drives every room's event rows
        (window.roomTypes || []).forEach(rt => {
            const rm = dObj[rt];
            if (!rm) return;
            delete rm.evt_min;
            delete rm.evt_min_arr;
            delete rm.evt_max;
            delete rm.evt_cta;
            delete rm.evt_ctd;
            if (rm.isOverride) {
                delete rm.isOverride.evt_min;
                delete rm.isOverride.evt_min_arr;
                delete rm.isOverride.evt_max;
                delete rm.isOverride.evt_cta;
                delete rm.isOverride.evt_ctd;
            }
        });

        if (evtRatePlans.length > 0) {
            dObj.otaOverrides = dObj.otaOverrides || {};
            evtRatePlans.forEach(rp => {
                if (rMin !== '') dObj.otaOverrides[`${rp.ratePlanId}_min`] = rMin;
                else delete dObj.otaOverrides[`${rp.ratePlanId}_min`];

                if (rMinArr !== '') dObj.otaOverrides[`${rp.ratePlanId}_min_arr`] = rMinArr;
                else delete dObj.otaOverrides[`${rp.ratePlanId}_min_arr`];

                if (rMax !== '') dObj.otaOverrides[`${rp.ratePlanId}_max`] = rMax;
                else delete dObj.otaOverrides[`${rp.ratePlanId}_max`];

                dObj.otaOverrides[`${rp.ratePlanId}_cta`] = rCta;
                dObj.otaOverrides[`${rp.ratePlanId}_ctd`] = rCtd;
            });
        }

        window.dirtyCellKeys = window.dirtyCellKeys || new Set();
        window.justSyncedCellKeys = window.justSyncedCellKeys || new Set();
        const dirtyRooms = Array.from(new Set([...(window.roomTypes || []), anchorP, anchorD].filter(Boolean)));
        dirtyRooms.forEach(rm => {
            window.dirtyCellKeys.add(`${dStr}|${rm}`);
            window.justSyncedCellKeys.delete(`${dStr}|${rm}`);
        });
        if (typeof window.markCmDirty === 'function') window.markCmDirty(dStr, 'rate', '*');

        window.dirtyDates.add(dStr);
        window.syncedDates.delete(dStr);
    }

    if (typeof window.markUnsavedChanges === 'function') window.markUnsavedChanges();
    renderRateMatrix();
    toggleCurveTuner(true);
    customAlert("Curve Applied", `Event curve & restriction pyramid applied for ${evtStr} (±6 days). Click "SAVE & SYNC" to push.`);
}

export async function saveCurveTunerAsDefault() {
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;
    const restrMap = readCurveRestrictionsFromUI();

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
        d_p2: getVal('ct-d-p2'),
        ...restrMap
    };

    window.savedAutofillBaselines = { ...(window.savedAutofillBaselines || {}), ...baselines };

    try {
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            autofillBaselines: window.savedAutofillBaselines,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        customAlert("Template Saved", "Default event pricing curve & pyramid template saved.");
    } catch (err) {
        customAlert("Save Error", err.message);
    }
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.toggleQuickBulk = toggleQuickBulk;
    window.setBulkScopeMode = setBulkScopeMode;
    window.renderBulkRatesDropdown = renderBulkRatesDropdown;
    window.toggleBulkRatesDropdown = toggleBulkRatesDropdown;
    window.toggleBulkRateNode = toggleBulkRateNode;
    window.cycleBulkRowPill = cycleBulkRowPill;
    window.renderBulkGrid = renderBulkGrid;
    window.applyBulkGrid = applyBulkGrid;
    window.runRippleRecovery = runRippleRecovery;
    window.toggleCurveTuner = toggleCurveTuner;
    window.openCurveTunerForDate = openCurveTunerForDate;
    window.addCmEventDate = addCmEventDate;
    window.removeCmEventDate = removeCmEventDate;
    window.applyCmPyramidPreset = applyCmPyramidPreset;
    window.handleCurveEventSelect = handleCurveEventSelect;
    window.adjustCurveTunerPeak = adjustCurveTunerPeak;
    window.recalcCurveTunerShoulders = recalcCurveTunerShoulders;
    window.applyCurveTuner = applyCurveTuner;
    window.saveCurveTunerAsDefault = saveCurveTunerAsDefault;
}
