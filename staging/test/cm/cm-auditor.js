// ==========================================================================
// cm/cm-auditor.js - OTA Extranet Auditor & Live Inventory Matrix Discrepancies
// Wild & Wandering Channel Manager
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { calculateLiveInventory } from './cm-matrix-grid.js';

export let snapshotData = {};
export let dismissedIds = [];
export let excludedAuditorRooms = new Set();

const getPropId = () => window.currentPropertyId || 'swims_resort';
const getBaselineDocId = () => `baseline_${getPropId()}`;
const getExcludedStorageKey = () => `ww_auditor_excl_${getPropId()}`;

function loadLocalExcludedRooms() {
    try {
        const raw = localStorage.getItem(getExcludedStorageKey());
        if (raw) excludedAuditorRooms = new Set(JSON.parse(raw));
    } catch (e) { /* ignore */ }
}

function saveLocalExcludedRooms() {
    try {
        localStorage.setItem(getExcludedStorageKey(), JSON.stringify(Array.from(excludedAuditorRooms)));
    } catch (e) { /* ignore */ }
}

export function renderAuditorRoomFilters() {
    const container = document.getElementById('sync-room-filters');
    if (!container) return;

    const allTypes = window.roomTypes || [];
    if (allTypes.length === 0) {
        container.innerHTML = '';
        return;
    }

    const pillsHtml = allTypes.map(t => {
        const isChecked = !excludedAuditorRooms.has(t);
        const label = window.displayAbbrev?.[t] || t;
        return `<button type="button" data-room="${t}" onclick="window.toggleAuditorRoomFilter(this.dataset.room)" class="px-2 py-0.5 rounded border font-bold cursor-pointer transition-colors flex items-center gap-1 ${isChecked ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-400 border-slate-300 line-through hover:text-slate-600'}" title="${t}">
            <span>${isChecked ? '✓' : '✕'}</span><span>${label}</span>
        </button>`;
    }).join('');

    container.innerHTML = `
        <span class="font-black uppercase text-slate-400 text-[9px] mr-1">Rooms Checked:</span>
        ${pillsHtml}
        <button type="button" onclick="window.setAllAuditorRoomFilters(true)" class="ml-1 text-[9px] font-black uppercase text-indigo-600 hover:underline cursor-pointer">All</button>
        <span class="text-slate-300">•</span>
        <button type="button" onclick="window.setAllAuditorRoomFilters(false)" class="text-[9px] font-black uppercase text-slate-500 hover:underline cursor-pointer">None</button>
    `;
}

export async function toggleAuditorRoomFilter(roomType) {
    if (!roomType) return;
    if (excludedAuditorRooms.has(roomType)) excludedAuditorRooms.delete(roomType);
    else excludedAuditorRooms.add(roomType);

    saveLocalExcludedRooms();
    renderAuditorRoomFilters();
    renderManualGrid();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()), {
            excludedRooms: Array.from(excludedAuditorRooms),
            property: getPropId(),
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) { /* non-blocking */ }
}

export async function setAllAuditorRoomFilters(includeAll) {
    const allTypes = window.roomTypes || [];
    if (includeAll) excludedAuditorRooms.clear();
    else allTypes.forEach(t => excludedAuditorRooms.add(t));

    saveLocalExcludedRooms();
    renderAuditorRoomFilters();
    renderManualGrid();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()), {
            excludedRooms: Array.from(excludedAuditorRooms),
            property: getPropId(),
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) { /* non-blocking */ }
}

// --- 1. DISMISSED BOOKINGS CONTROLLERS ---

export function updateDismissedUI() {
    const btn = document.getElementById('reset-dismissed-btn');
    if (!btn) return;
    if (dismissedIds.length > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

export async function loadPropertyBaseline() {
    try {
        const curProp = getPropId();
        let baselineSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()));

        // Backward compatibility fallback for SWIMS
        if (!baselineSnap.exists() && curProp === 'swims_resort') {
            baselineSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', 'baseline'));
        }

        loadLocalExcludedRooms();

        if (baselineSnap.exists()) {
            const data = baselineSnap.data();
            snapshotData = data.matrix || {};
            dismissedIds = data.dismissed || [];
            if (Array.isArray(data.excludedRooms)) {
                excludedAuditorRooms = new Set(data.excludedRooms);
                saveLocalExcludedRooms();
            }
        } else {
            snapshotData = {};
            dismissedIds = [];
        }

        window.snapshotData = snapshotData;
        window.dismissedIds = dismissedIds;

        updateDismissedUI();
        renderAuditorRoomFilters();
        renderManualGrid();
    } catch (baseErr) {
        console.warn("[Auditor Baseline Load Notice]:", baseErr);
        snapshotData = {};
        dismissedIds = [];
        window.snapshotData = snapshotData;
        window.dismissedIds = dismissedIds;
    }
}

export async function dismissBooking(id) {
    if (!dismissedIds.includes(id)) dismissedIds.push(id);
    window.dismissedIds = dismissedIds;

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()), {
            matrix: snapshotData,
            dismissed: dismissedIds,
            property: getPropId(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        updateDismissedUI();
        checkMissing();
    } catch (e) {
        customAlert("Dismiss Failed", "Could not save dismissed status to database: " + e.message);
    }
}

export async function resetDismissed() {
    dismissedIds = [];
    window.dismissedIds = dismissedIds;

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()), {
            matrix: snapshotData,
            dismissed: dismissedIds,
            property: getPropId(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        updateDismissedUI();
        checkMissing();
    } catch (e) {
        customAlert("Reset Failed", "Could not reset dismissed list: " + e.message);
    }
}

export async function markSynced() {
    const curProp = getPropId();
    customAlert(
        "Mark Synced",
        `Mark all current availability as synced for ${curProp.toUpperCase()}?\n\nThis will clear your 'Changes' list until new bookings arrive.`,
        true,
        async () => {
            const loader = document.getElementById('loader');
            const statusEl = document.getElementById('sync-status');
            if (loader) loader.style.display = 'flex';
            if (statusEl) statusEl.innerText = 'SAVING SYNC...';

            snapshotData = JSON.parse(JSON.stringify(window.liveInventory || {}));
            window.snapshotData = snapshotData;

            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', getBaselineDocId()), {
                    matrix: snapshotData,
                    dismissed: dismissedIds,
                    property: curProp,
                    updatedAt: new Date().toISOString()
                });
                renderManualGrid();
            } catch (e) {
                customAlert("Save Failed", "Check database permissions on 'ota_sync': " + e.message);
            } finally {
                if (loader) loader.style.display = 'none';
            }
        }
    );
}

// --- 2. EXTRANET TEXT PARSER & PMS MATCHER ---

function findPmsBooking(id, extraPredicate = null) {
    if (!id && !extraPredicate) return null;
    const cleanId = id ? String(id).trim() : null;
    const curProp = getPropId();

    return (window.staff || []).find(s => {
        const sProp = typeof toCanonicalPropId === 'function' ? toCanonicalPropId(s.property) : (s.property || 'swims_resort');
        if (sProp !== curProp) return false;

        if (cleanId) {
            if (s.bookId === cleanId || s.id === cleanId) return true;
            if (cleanId.includes('-') && s.bookId === cleanId.split('-')[1]) return true;

            if (s.notes) {
                if (s.notes.includes(cleanId)) return true;
                if (s.notes.includes(`[Merged Book ID]: ${cleanId}`)) return true;
                if (s.notes.includes(`--- MERGED WITH BOOKING ${cleanId} ---`)) return true;
            }
        }

        if (extraPredicate && extraPredicate(s)) return true;
        return false;
    });
}

export function checkMissing() {
    const rawText = document.getElementById('audit-text')?.value || '';
    const resultDiv = document.getElementById('audit-result');
    if (!resultDiv) return;

    if (!rawText.trim()) {
        resultDiv.innerHTML = '';
        return;
    }

    let foundIds = new Set();
    let missingHtml = [];
    let actionCount = 0;

    const ignoreIds = ['16646458'];
    const dismissed = dismissedIds || [];

    const lowerText = rawText.toLowerCase();
    let source = 'bdc';
    if (lowerText.includes('hostelworld') || /\b\d{5,7}-\d+\b/.test(rawText)) {
        source = 'hw';
    } else if (lowerText.includes('airbnb') || lowerText.includes('switch to traveling') || lowerText.includes('upcoming reservations')) {
        source = 'airbnb';
    } else if (lowerText.includes('booking.com') || lowerText.includes('extranet')) {
        source = 'bdc';
    }

    const addMissing = (id, guestName, badge, type, displayId) => {
        if (ignoreIds.includes(id) || dismissed.includes(id) || foundIds.has(id)) return;
        foundIds.add(id);
        actionCount++;

        let cardStyle = '', icon = '';
        if (type === 'missing') {
            cardStyle = 'bg-rose-50 border-rose-200 text-rose-900';
            icon = '<i data-lucide="arrow-right" class="text-rose-500 shrink-0" size="16"></i>';
        } else if (type === 'cancel') {
            cardStyle = 'bg-amber-50 border-amber-300 text-amber-900';
            icon = '<i data-lucide="arrow-right" class="text-amber-500 shrink-0" size="16"></i>';
        } else if (type === 'ota_cancel') {
            cardStyle = 'bg-slate-100 border-slate-300 text-slate-700 opacity-80';
            icon = '<i data-lucide="arrow-right" class="text-slate-400 shrink-0" size="16"></i>';
        }

        missingHtml.push(`
            <div class="${cardStyle} px-3 py-2 rounded-lg border shadow-xs flex items-center justify-between gap-3 text-xs">
                <div class="font-bold truncate flex items-center gap-2 flex-1 min-w-0">
                    ${icon} <span class="truncate font-black text-sm">${guestName}</span> <span class="opacity-60 font-mono text-xs shrink-0">(${displayId})</span> 
                    <span class="bg-white/60 text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider shrink-0 border border-black/10">${badge}</span>
                </div>
                <button type="button" onclick="window.dismissBooking('${id}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded shadow-xs border border-slate-200 transition-colors shrink-0 flex items-center gap-1 cursor-pointer">
                    Dismiss <i data-lucide="x" size="11"></i>
                </button>
            </div>
        `);
    };

    if (source === 'hw') {
        const hwRegex = /\b(\d{5,7}-\d+)\b/g;
        let match;
        while ((match = hwRegex.exec(rawText)) !== null) {
            let id = match[1];
            let startIndex = match.index + id.length;
            let textAfterId = rawText.substring(startIndex);
            let firstDigitIndex = textAfterId.search(/\d/);
            let rawName = firstDigitIndex > -1 ? textAfterId.substring(0, firstDigitIndex) : textAfterId.substring(0, 50);

            let guestName = rawName
                .replace(/Visa|Mastercard|Amex|JCB|Diners|UnionPay|Discover|Maestro|Cash|None/gi, '')
                .replace(/Late|Reference|Card|Type/gi, '')
                .replace(/[\n\r\t]/g, ' ')
                .trim();

            if (!guestName || guestName.length < 2) guestName = "UNKNOWN GUEST";

            let pmsBooking = findPmsBooking(id);
            if (!pmsBooking) {
                addMissing(id, guestName, 'Missing in PMS', 'missing', id);
            }
        }
    } else if (source === 'airbnb') {
        let lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('sunset') || lines[i].toLowerCase().includes('entire') || lines[i].toLowerCase().includes('private room') || lines[i].toLowerCase().includes('group')) {
                let rawName = lines[i - 1];
                if (!rawName) continue;

                let guestName = rawName.split(/['’]s group/i)[0].trim();
                let pmsBooking = findPmsBooking(null, s => 
                    s.source === 'airbnb' && s.status !== 'cancelled' && s.status !== 'noshow' &&
                    (((s.firstName || '').toLowerCase().includes(guestName.toLowerCase())) ||
                     ((s.lastName || '').toLowerCase().includes(guestName.toLowerCase())) ||
                     (guestName.toLowerCase().includes((s.firstName || '').toLowerCase())) ||
                     (guestName.toLowerCase().includes((s.lastName || '').toLowerCase())))
                );

                if (!pmsBooking) {
                    let pseudoId = 'ABNB_' + guestName.replace(/\s+/g, '').toUpperCase();
                    addMissing(pseudoId, guestName, 'Missing Airbnb', 'missing', 'AirBnB');
                }
            }
        }
    } else {
        let lines = rawText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        const numRegex = /\b\d{10}\b/g;

        for (let i = 0; i < lines.length; i++) {
            let match;
            while ((match = numRegex.exec(lines[i])) !== null) {
                let id = match[0];
                let pmsBooking = findPmsBooking(id);
                let guestName = "UNKNOWN GUEST";
                let isCancelled = false;

                for (let j = i; j >= Math.max(0, i - 12); j--) {
                    if (/\b(adult|child|adults|children)\b/i.test(lines[j])) {
                        if (j - 1 >= 0) {
                            let rawLine = lines[j - 1];
                            guestName = rawLine
                                .replace(/THB|฿/gi, '')
                                .replace(/Payment via Booking\.com/i, '')
                                .replace(/Bank transfer/i, '')
                                .replace(/StatusPriceCommission and chargesBooking number/i, '')
                                .replace(/[\d,.]+/g, '')
                                .trim();

                            for (let k = Math.max(0, j - 2); k <= i; k++) {
                                if (lines[k] && /cancelled|canceled/i.test(lines[k])) isCancelled = true;
                            }
                        }
                        break;
                    }
                }
                if (!guestName || guestName.length < 2) guestName = "UNKNOWN GUEST";

                if (!pmsBooking && !isCancelled) addMissing(id, guestName, 'Missing in PMS', 'missing', id);
                else if (!pmsBooking && isCancelled) addMissing(id, guestName, 'OTA Cancelled', 'ota_cancel', id);
                else if (pmsBooking && isCancelled && pmsBooking.status !== 'cancelled') addMissing(id, guestName, 'Cancel in PMS!', 'cancel', id);
            }
        }
    }

    if (actionCount === 0) {
        resultDiv.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-400 text-emerald-800 p-2.5 rounded-lg shadow-xs text-center">
                <div class="font-black text-sm mb-0.5 flex items-center justify-center gap-1.5">
                    <i data-lucide="check-circle" size="16" class="text-emerald-500"></i> ALL CLEAR
                </div>
                <p class="font-bold text-xs text-emerald-600">No missing or pending cancelled bookings found for this property.</p>
            </div>`;
    } else {
        resultDiv.innerHTML = `
            <div class="bg-slate-50 border border-slate-300 p-2.5 rounded-lg shadow-xs">
                <div class="font-black text-xs text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                    <i data-lucide="alert-triangle" size="14" class="text-rose-600"></i> ${actionCount} ACTION ITEM${actionCount > 1 ? 'S' : ''} FOUND
                </div>
                <div class="flex flex-col gap-1.5">
                    ${missingHtml.join('')}
                </div>
            </div>`;
    }
    if (window.lucide) window.lucide.createIcons();
}

// --- 3. 240-DAY LIVE INVENTORY DISCREPANCY MATRIX ---

export function renderManualGrid() {
    const filterEl = document.getElementById('grid-filter');
    const filter = filterEl ? filterEl.value : 'changes';
    const head = document.getElementById('sync-head');
    const body = document.getElementById('sync-body');
    const noMsg = document.getElementById('no-changes-msg');

    if (!head || !body) return;
    head.innerHTML = '';
    body.innerHTML = '';

    if (typeof calculateLiveInventory === 'function') {
        calculateLiveInventory();
    }

    renderAuditorRoomFilters();

    const allTypes = window.roomTypes || [];
    const rawTypes = allTypes.filter(t => !excludedAuditorRooms.has(t));
    const totalRoomsByType = window.totalRoomsByType || {};
    const liveInventory = window.liveInventory || {};
    const currentSnapshot = snapshotData || {};

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const viewDates = [];
    for (let i = 0; i < 240; i++) {
        let d = new Date(today);
        d.setDate(d.getDate() + i);
        viewDates.push(getLocalYMD(d));
    }

    let colsToShowRaw = [];
    viewDates.forEach(d => {
        let show = false;
        if (filter === 'all') {
            show = rawTypes.length > 0;
        } else {
            rawTypes.forEach(t => {
                let live = (liveInventory[d] && liveInventory[d][t] !== undefined) ? liveInventory[d][t] : 0;
                let snap = currentSnapshot[d] && currentSnapshot[d][t] !== undefined ? currentSnapshot[d][t] : totalRoomsByType[t];
                let isUrgent = live <= 2 && (totalRoomsByType[t] || 0) > 2;

                if (filter === 'changes' && live !== snap) show = true;
                if (filter === 'urgent' && isUrgent) show = true;
            });
        }
        if (show) colsToShowRaw.push(d);
    });

    if (colsToShowRaw.length === 0) {
        if (noMsg) noMsg.classList.remove('hidden');
        const title = document.getElementById('no-data-title');
        const desc = document.getElementById('no-data-desc');
        if (title && desc) {
            if (filter === 'urgent') {
                title.innerText = "NO URGENT DATES";
                desc.innerText = "You have plenty of availability everywhere.";
            } else {
                title.innerText = "EVERYTHING IS SYNCED";
                desc.innerText = "No changes detected since your last sync.";
            }
        }
        return;
    } else {
        if (noMsg) noMsg.classList.add('hidden');
    }

    // Gap detection when dates are skipped
    let finalCols = [];
    for (let i = 0; i < colsToShowRaw.length; i++) {
        if (i > 0) {
            let prevMs = parseYMD(colsToShowRaw[i - 1]);
            let currMs = parseYMD(colsToShowRaw[i]);
            let diff = Math.round((currMs - prevMs) / 86400000);
            if (diff > 1) finalCols.push({ type: 'gap' });
        }
        finalCols.push({ type: 'date', val: colsToShowRaw[i] });
    }

    let trHead = `<tr class="frozen-row bg-slate-800 text-white"><th class="frozen-corner sticky left-0 z-20 bg-slate-900 w-36 min-w-[9rem] text-[10px] text-left px-2 py-1 uppercase font-black border-r border-slate-700">ROOM TYPE</th>`;
    finalCols.forEach(col => {
        if (col.type === 'gap') {
            trHead += `<th class="w-2 min-w-[8px] bg-amber-400 border-x border-slate-700" title="Skipped Dates"></th>`;
        } else {
            const dt = new Date(col.val + "T12:00:00Z");
            trHead += `<th class="w-[38px] min-w-[38px] px-0.5 py-1 leading-tight text-center border-b border-slate-700 border-r border-slate-700/60">
                <span class="text-blue-300 text-[9px] uppercase font-bold tracking-tight block">${mNames[dt.getUTCMonth()]}</span>
                <span class="text-xs font-black">${dt.getUTCDate()}</span>
            </th>`;
        }
    });
    trHead += `</tr>`;
    head.innerHTML = trHead;

    rawTypes.forEach((t, index) => {
        let rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
        let shortName = window.displayAbbrev?.[t] || t;

        let tr = `<tr class="${rowBg} border-b border-slate-200">
            <td class="sticky left-0 z-10 font-black text-xs leading-snug px-2 py-1 whitespace-normal border-r-2 border-slate-300 ${rowBg}" title="${t}">
                ${shortName}<br>
                <span class="text-slate-400 font-bold text-[8px] uppercase tracking-widest">CAP: ${totalRoomsByType[t] || 0}</span>
            </td>`;

        finalCols.forEach(col => {
            if (col.type === 'gap') {
                tr += `<td class="bg-amber-300 border-x border-slate-400"></td>`;
            } else {
                let d = col.val;
                let live = (liveInventory[d] && liveInventory[d][t] !== undefined) ? liveInventory[d][t] : 0;
                let snap = currentSnapshot[d] && currentSnapshot[d][t] !== undefined ? currentSnapshot[d][t] : totalRoomsByType[t];
                let isUrgent = live <= 2 && (totalRoomsByType[t] || 0) > 2;

                let tdBg = '';
                let content = `<span class="font-bold text-xs text-slate-500">${live}</span>`;

                if (live !== snap) {
                    if (live === 0) {
                        tdBg = 'bg-rose-600';
                        content = `<div class="flex flex-col items-center justify-center leading-tight">
                            <span class="text-[9px] font-bold text-rose-200 line-through">${snap}</span>
                            <span class="font-black text-white text-xs">0</span>
                        </div>`;
                    } else if (live < snap) {
                        tdBg = 'bg-amber-200';
                        content = `<div class="flex flex-col items-center justify-center leading-tight">
                            <span class="text-[9px] font-bold text-amber-800/80 line-through">${snap}</span>
                            <span class="font-black text-slate-950 text-xs">${live}</span>
                        </div>`;
                    } else {
                        tdBg = 'bg-emerald-200';
                        content = `<div class="flex flex-col items-center justify-center leading-tight">
                            <span class="text-[9px] font-bold text-emerald-800/80 line-through">${snap}</span>
                            <span class="font-black text-emerald-950 text-xs">${live}</span>
                        </div>`;
                    }
                } else if (filter === 'urgent' && isUrgent) {
                    tdBg = live === 0 ? 'bg-rose-100' : 'bg-orange-100';
                    content = `<span class="font-black text-orange-800 text-xs">${live}</span>`;
                }

                tr += `<td class="text-center p-1 border-r border-slate-200 ${tdBg}">${content}</td>`;
            }
        });
        tr += `</tr>`;
        body.innerHTML += tr;
    });

    if (window.lucide) window.lucide.createIcons();
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.renderAuditorRoomFilters = renderAuditorRoomFilters;
    window.toggleAuditorRoomFilter = toggleAuditorRoomFilter;
    window.setAllAuditorRoomFilters = setAllAuditorRoomFilters;
    window.updateDismissedUI = updateDismissedUI;
    window.loadPropertyBaseline = loadPropertyBaseline;
    window.dismissBooking = dismissBooking;
    window.resetDismissed = resetDismissed;
    window.markSynced = markSynced;
    window.checkMissing = checkMissing;
    window.renderManualGrid = renderManualGrid;
}
