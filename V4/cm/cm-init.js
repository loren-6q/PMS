// ==========================================================================
// cm/cm-init.js - Channel Manager Frame Bootstrapper & Cloud Persistence
// Wild & Wandering Channel Manager
// ==========================================================================

import { auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';
import { normalizeChannelRules, resolveChannelCode, getChannelByCode } from '../core/channels.js';
import { getLocalYMD, parseYMD } from '../core/dates.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { loadPropertyBaseline, checkMissing, renderManualGrid } from './cm-auditor.js';
import { renderPromoRulesTable, detectPromoScheduleShifts } from './cm-promos.js';
import { renderHealthAuditBanner } from '../core/health-audit.js';
import './cm-bulk-drawer.js';
import { pushToChannexAPI, saveAndSync } from '../channex.js';

export let hasUnsavedChanges = false;
export let hasLoadedPricingFromCloud = false;

const parseIfJson = (val, fallback) => {
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return fallback; }
    }
    return val ?? fallback;
};

function compactTimelineForCloud(rawTimeline = {}) {
    const todayMs = parseYMD(getLocalYMD(new Date()));
    const cutoffStr = getLocalYMD(new Date(todayMs - (14 * 86400000)));
    const compacted = {};

    Object.entries(rawTimeline || {}).forEach(([dateStr, dayObj]) => {
        if (!dateStr || dateStr < cutoffStr || !dayObj || typeof dayObj !== 'object') return;
        const cleanDay = {};

        Object.entries(dayObj).forEach(([key, val]) => {
            if (!val || typeof val !== 'object') return;
            const cleanNode = {};

            Object.entries(val).forEach(([field, fVal]) => {
                if (field === '_syncedStd' || fVal === undefined || fVal === "") return;
                if (field === 'isOverride' && typeof fVal === 'object') {
                    const cleanOvr = {};
                    Object.entries(fVal).forEach(([ok, ov]) => {
                        if (ov) cleanOvr[ok] = true;
                    });
                    if (Object.keys(cleanOvr).length > 0) cleanNode.isOverride = cleanOvr;
                    return;
                }
                cleanNode[field] = fVal;
            });

            if (Object.keys(cleanNode).length > 0) {
                cleanDay[key] = cleanNode;
            }
        });

        if (Object.keys(cleanDay).length > 0) {
            compacted[dateStr] = cleanDay;
        }
    });

    return compacted;
}

async function hydratePricingFromCloud(activeProp = null) {
    const canonId = toCanonicalPropId(window.currentPropertyId);
    const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`));
    const pData = pricingSnap.exists() ? pricingSnap.data() : {};

    // Merge legacy inline timeline + monthly shards (master_{canonId}_YYYY-MM)
    const mergedTimeline = { ...parseIfJson(pData.timeline, {}) };
    const shardMonths = Array.isArray(pData.shardMonths) ? pData.shardMonths : [];
    if (shardMonths.length > 0) {
        const shardSnaps = await Promise.all(
            shardMonths.map(ym => getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}_${ym}`)))
        );
        shardSnaps.forEach(snap => {
            if (!snap.exists()) return;
            const shardData = parseIfJson(snap.data()?.timeline, {});
            if (shardData && typeof shardData === 'object') {
                Object.assign(mergedTimeline, shardData);
            }
        });
    }

    const propConfig = activeProp || window.currentPropertyConfig || {};
    const parsedPropRels = parseIfJson(propConfig?.masterPricing?.relationships, []);
    const parsedDocRels = parseIfJson(pData.relationships, []);

    window.masterPricing = {
        timeline: mergedTimeline,
        relationships: (Array.isArray(parsedPropRels) && parsedPropRels.length ? parsedPropRels : parsedDocRels) || [],
        baseRates: parseIfJson(pData.baseRates, {})
    };

    const mergedRules = {
        ...(pData.pricingRules || {}),
        ...(propConfig?.pricingRules || {})
    };
    mergedRules.masterDriver = resolveChannelCode(mergedRules.masterDriver || 'WEB');
    mergedRules.channelRules = normalizeChannelRules(mergedRules.channelRules);
    window.pricingRules = mergedRules;

    window.savedAutofillBaselines = pData.autofillBaselines || {};

    Object.values(window.masterPricing.timeline).forEach(dayObj => {
        if (dayObj && typeof dayObj === 'object') {
            Object.values(dayObj).forEach(rData => {
                if (rData && typeof rData === 'object' && rData.std !== undefined && rData.std !== "") {
                    rData._syncedStd = rData.std;
                }
            });
        }
    });
}

export function markCmDirty(dateStr, kind = 'rate', target = '*') {
    if (!dateStr) return;
    window.dirtyDates = window.dirtyDates || new Set();
    window.syncedDates = window.syncedDates || new Set();
    window.dirtyAvailKeys = window.dirtyAvailKeys || new Set();
    window.dirtyPlanKeys = window.dirtyPlanKeys || new Set();

    window.dirtyDates.add(dateStr);
    window.syncedDates.delete(dateStr);

    if (kind === 'avail' || kind === 'both') {
        window.dirtyAvailKeys.add(`${dateStr}|${target}`);
    }
    if (kind === 'rate' || kind === 'both') {
        window.dirtyPlanKeys.add(`${dateStr}|${target}`);
    }
}

export async function initCm() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        await signInAnonymously(auth);

        const tapeInput = document.getElementById('tape-start');
        if (tapeInput && !tapeInput.value) tapeInput.value = getLocalYMD(new Date());

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || props[0]?.id || '';
        window.currentPropertyId = toCanonicalPropId(pParam);

        const activeProp = props.find(p => p.id === window.currentPropertyId) || props[0];
        window.currentPropertyConfig = activeProp || {};
        window.hotelRooms = (activeProp?.rooms || []).filter(r => !r.inactive);

        window.roomTypes = Array.from(new Set(window.hotelRooms.map(r => r.category || r.type).filter(Boolean)));
        window.displayAbbrev = {};
        window.hotelRooms.forEach(r => {
            const cat = r.category || r.type;
            if (cat && r.short) window.displayAbbrev[cat] = r.short;
        });

        window.totalRoomsByType = {};
        window.hotelRooms.forEach(r => {
            const cat = r.category || r.type;
            if (cat) window.totalRoomsByType[cat] = (window.totalRoomsByType[cat] || 0) + 1;
        });

        window.eventDates = activeProp?.events || [];
        window.enableEventRates = activeProp?.enableEventRates !== undefined
            ? !!activeProp.enableEventRates
            : ((window.eventDates || []).length > 0);

        window.channexConfig = activeProp?.channex || {};
        window.channexMap = activeProp?.channexMap || [];
        window.channexRateMap = (activeProp?.channexRateMap || []).map(rm => ({
            ...rm,
            channel: resolveChannelCode(rm.channel || rm.ratePlanTitle)
        }));
        window.promoRules = activeProp?.promoRules || [];
        window.dirtyDates = new Set();
        window.syncedDates = new Set();
        window.dirtyAvailKeys = new Set();
        window.dirtyPlanKeys = new Set();
        window.dirtyCellKeys = new Set();
        window.justSyncedCellKeys = new Set();
        window.editMode = 'ripple';

        await hydratePricingFromCloud(activeProp);

        populateChannelPreviewFilter();
        hasLoadedPricingFromCloud = true;
        hasUnsavedChanges = false;
        updateSaveIndicator();
        updateEventPricingToggleUI();

        // Realtime Staff Listener for Net Availability Calculation
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            window.staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderRateMatrix();
        });

        renderRateMatrix();
        renderPromoRulesTable();
        detectPromoScheduleShifts(activeProp?.lastPromoSyncDate);
        renderHealthAuditBanner('cm-health-banner', 'cm');
        loadPropertyBaseline();

        if (loader) loader.style.display = 'none';

    } catch (err) {
        console.error("[CM Init Failed]:", err);
        if (loader) loader.style.display = 'none';
    }
}

export async function discardUnsavedChanges() {
    if (!hasUnsavedChanges) return;
    const confirmed = typeof window.customConfirm === 'function'
        ? await window.customConfirm("Discard Changes?", "Revert all unsaved rate and restriction edits back to your last saved version?")
        : window.confirm("Discard all unsaved rate and restriction edits and revert to your last saved version?");
    if (!confirmed) return;

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        await hydratePricingFromCloud();
        window.dirtyDates = new Set();
        window.syncedDates = new Set();
        window.dirtyAvailKeys = new Set();
        window.dirtyPlanKeys = new Set();
        window.dirtyCellKeys = new Set();
        window.justSyncedCellKeys = new Set();
        hasUnsavedChanges = false;
        updateSaveIndicator();
        renderRateMatrix();
        customAlert("Reverted", "All unsaved edits have been discarded.");
    } catch (err) {
        console.error("[Discard Changes Error]:", err);
        customAlert("Revert Failed", err.message);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

export function populateChannelPreviewFilter() {
    const sel = document.getElementById('channel-preview-select');
    if (!sel) return;

    const codes = new Set(['DEF', 'WEB']);
    (window.channexRateMap || []).forEach(r => {
        if (r.channel) codes.add(resolveChannelCode(r.channel));
    });
    (window.pricingRules?.channelRules || []).forEach(r => {
        if (r.code) codes.add(resolveChannelCode(r.code));
    });

    sel.innerHTML = `<option value="ALL">All Rates</option>` +
        Array.from(codes).map(code => {
            const meta = getChannelByCode(code);
            return `<option value="${code}">${code} - ${meta.name}</option>`;
        }).join('');
}

export function isEventPricingEnabled() {
    return window.enableEventRates !== undefined
        ? !!window.enableEventRates
        : ((window.eventDates || []).length > 0);
}

export async function togglePropertyEventRates() {
    const nextState = !isEventPricingEnabled();
    window.enableEventRates = nextState;
    updateEventPricingToggleUI();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            enableEventRates: nextState
        });
    } catch (e) {
        console.warn("Could not persist event pricing toggle:", e);
    }

    renderRateMatrix();
}

export function updateEventPricingToggleUI() {
    const btn = document.getElementById('prop-event-pricing-btn');
    const isEn = isEventPricingEnabled();
    if (btn) {
        btn.className = isEn
            ? "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-pink-100 text-pink-800 border border-pink-300 hover:bg-pink-200"
            : "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200";
        btn.innerHTML = isEn
            ? `<i data-lucide="calendar-heart" size="13" class="text-pink-600"></i> <span>EVENTS: ON</span>`
            : `<i data-lucide="calendar-off" size="13" class="text-slate-400"></i> <span>EVENTS: OFF</span>`;
    }
    const btnCurve = document.getElementById('btn-curve-tuner');
    if (btnCurve) btnCurve.style.display = isEn ? 'inline-flex' : 'none';

    if (window.lucide) window.lucide.createIcons();
}

export function toggleEditMode() {
    window.editMode = window.editMode === 'ripple' ? 'pin' : 'ripple';
    const btn = document.getElementById('mode-toggle-btn');
    const label = document.getElementById('mode-label');
    const icon = document.getElementById('mode-icon');
    if (!btn || !label) return;

    if (window.editMode === 'ripple') {
        btn.className = "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200";
        label.innerText = "RIPPLE MODE";
        icon.innerHTML = '<i data-lucide="zap" size="13" class="text-amber-600"></i>';
    } else {
        btn.className = "px-2 py-1 rounded font-black text-[10px] sm:text-xs uppercase shadow-2xs flex items-center gap-1 transition-colors cursor-pointer bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200";
        label.innerText = "OVERRIDE MODE";
        icon.innerHTML = '<i data-lucide="edit-3" size="13" class="text-indigo-600"></i>';
    }
    if (window.lucide) window.lucide.createIcons();
}

export function markUnsavedChanges() {
    hasUnsavedChanges = true;
    updateSaveIndicator();
}

export function onChannexSyncComplete(syncedDates = []) {
    (syncedDates || []).forEach(d => {
        if (window.dirtyDates) window.dirtyDates.delete(d);
        if (window.syncedDates) window.syncedDates.add(d);
    });
    if (window.dirtyAvailKeys instanceof Set) window.dirtyAvailKeys.clear();
    if (window.dirtyPlanKeys instanceof Set) window.dirtyPlanKeys.clear();
    if (window.dirtyCellKeys instanceof Set && window.dirtyCellKeys.size > 0) {
        window.justSyncedCellKeys = new Set(window.dirtyCellKeys);
        window.dirtyCellKeys.clear();
    }
    hasUnsavedChanges = false;
    updateSaveIndicator();
    renderRateMatrix();
}

export function updateSaveIndicator() {
    const si = document.getElementById('save-indicator');
    const saveBtn = document.getElementById('btn-save-sync');

    let discardBtn = document.getElementById('btn-discard-changes');
    if (!discardBtn && saveBtn && saveBtn.parentElement) {
        discardBtn = document.createElement('button');
        discardBtn.id = 'btn-discard-changes';
        discardBtn.type = 'button';
        discardBtn.onclick = () => discardUnsavedChanges();
        discardBtn.className = 'hidden px-2 py-1 rounded font-black text-[10px] uppercase tracking-wider bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 transition-colors cursor-pointer mr-1.5';
        discardBtn.innerText = 'Discard';
        saveBtn.parentElement.insertBefore(discardBtn, saveBtn);
    }

    if (discardBtn) {
        discardBtn.classList.toggle('hidden', !hasUnsavedChanges);
    }

    if (!si) return;
    if (hasUnsavedChanges) {
        si.innerText = '● UNSAVED CHANGES';
        si.className = 'text-[9.5px] font-black uppercase tracking-widest text-amber-600 mr-2 opacity-100 animate-pulse';
        if (saveBtn) saveBtn.classList.add('ring-2', 'ring-amber-400');
    } else {
        si.innerText = 'PRICING SAVED';
        si.className = 'text-[9.5px] font-black uppercase tracking-widest text-emerald-600 mr-2 opacity-100';
        if (saveBtn) saveBtn.classList.remove('ring-2', 'ring-amber-400');
        setTimeout(() => { if (!hasUnsavedChanges && si) si.classList.add('opacity-0'); }, 3000);
    }
}

export async function savePricingToCloud(silent = false) {
    if (!hasLoadedPricingFromCloud) {
        console.error("[Save Blocked]: Pricing has not loaded yet.");
        return customAlert("Save Blocked", "Safety Guard: The pricing matrix has not finished loading. Overwrite blocked.");
    }

    const rawDates = Object.keys(window.masterPricing?.timeline || {});
    if (rawDates.length === 0) {
        console.error("[Save Blocked]: Attempted to save an empty pricing matrix.");
        return customAlert("Save Blocked", "Safety Guard: Matrix in memory is empty. Overwriting existing rates is blocked.");
    }

    if (!silent) {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';
    }

    try {
        const canonId = toCanonicalPropId(window.currentPropertyId);
        const compactedTimeline = compactTimelineForCloud(window.masterPricing.timeline || {});

        // Partition compacted timeline into monthly shards (YYYY-MM) so no Firestore doc approaches 1 MB
        const shardsByMonth = {};
        Object.entries(compactedTimeline).forEach(([dateStr, dayObj]) => {
            const ym = dateStr.slice(0, 7);
            if (!shardsByMonth[ym]) shardsByMonth[ym] = {};
            shardsByMonth[ym][dateStr] = dayObj;
        });

        const shardMonths = Object.keys(shardsByMonth).sort();
        const updatedAt = new Date().toISOString();

        // 1. Write monthly pricing shards in parallel
        await Promise.all(
            shardMonths.map(ym =>
                setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}_${ym}`), {
                    timeline: JSON.stringify(shardsByMonth[ym]),
                    updatedAt
                })
            )
        );

        // 2. Persist master metadata + shard index (and clear oversized legacy inline timeline)
        const mainRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`);
        await setDoc(mainRef, {
            shardMonths,
            timeline: deleteField(),
            relationships: window.masterPricing.relationships || [],
            pricingRules: window.pricingRules || {},
            updatedAt
        }, { merge: true });

        // 3. Lightweight rolling backup (capped at next 180 days so backup never exceeds 1 MB)
        const todayStr = getLocalYMD(new Date());
        const backupCutoffStr = getLocalYMD(new Date(parseYMD(todayStr) + (180 * 86400000)));
        const backupSlice = {};
        Object.entries(compactedTimeline).forEach(([dStr, dObj]) => {
            if (dStr >= todayStr && dStr <= backupCutoffStr) backupSlice[dStr] = dObj;
        });
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing_backups', `${canonId}_${Date.now()}`);
        await setDoc(backupRef, {
            timeline: JSON.stringify(backupSlice),
            createdAt: updatedAt
        });

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            lastPromoSyncDate: todayStr
        });
        const shiftBanner = document.getElementById('promo-shift-banner');
        if (shiftBanner) shiftBanner.classList.add('hidden');

        window.justSyncedCellKeys = new Set(window.dirtyCellKeys || []);
        window.dirtyCellKeys = new Set();
        hasUnsavedChanges = false;
        updateSaveIndicator();
        renderRateMatrix();
        if (!silent) customAlert("Success", "Master pricing matrix safely saved and backed up.");

    } catch (err) {
        console.error("[Pricing Save Error]:", err);
        customAlert("Save Failed", err.message);
    } finally {
        if (!silent) {
            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none';
        }
    }
}

export function switchTab(tab) {
    ['grid', 'promos', 'manual'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (view) {
            view.style.display = (t === tab) ? 'flex' : 'none';
            view.classList.toggle('hidden', t !== tab);
        }
        if (btn) btn.classList.toggle('active', t === tab);
    });

    if (tab === 'grid') renderRateMatrix();
    if (tab === 'promos') renderPromoRulesTable();
    if (tab === 'manual') {
        checkMissing();
        renderManualGrid();
    }
}

export function shiftTape(days) {
    const input = document.getElementById('tape-start');
    if (!input || !input.value) return;
    const cur = new Date(input.value + "T12:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + days);
    input.value = cur.toISOString().split('T')[0];
    renderRateMatrix();
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.markCmDirty = markCmDirty;
    window.markUnsavedChanges = markUnsavedChanges;
    window.discardUnsavedChanges = discardUnsavedChanges;
    window.onChannexSyncComplete = onChannexSyncComplete;
    window.updateSaveIndicator = updateSaveIndicator;
    window.savePricingToCloud = savePricingToCloud;
    window.switchTab = switchTab;
    window.shiftTape = shiftTape;
    window.isEventPricingEnabled = isEventPricingEnabled;
    window.togglePropertyEventRates = togglePropertyEventRates;
    window.toggleEditMode = toggleEditMode;
    window.reloadSettingsConfig = initCm;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCm);
} else {
    initCm();
}
