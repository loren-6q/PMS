// ==========================================================================
// cm/cm-init.js - Channel Manager Frame Bootstrapper & Cloud Persistence
// Wild & Wandering Channel Manager
// ==========================================================================

import { auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';
import { normalizeChannelRules, resolveChannelCode, getChannelByCode } from '../core/channels.js';
import { getLocalYMD } from '../core/dates.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { loadPropertyBaseline, checkMissing, renderManualGrid } from './cm-auditor.js';
import { renderPromoRulesTable, detectPromoScheduleShifts } from './cm-promos.js';
import './cm-bulk-drawer.js';
import { pushToChannexAPI, saveAndSync } from '../channex.js';

export let hasUnsavedChanges = false;
export let hasLoadedPricingFromCloud = false;

export async function initCm() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        await signInAnonymously(auth);

        const tapeInput = document.getElementById('tape-start');
        if (tapeInput && !tapeInput.value) tapeInput.value = getLocalYMD(new Date());

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
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
        window.editMode = 'ripple';

        // Load Pricing Matrix from Firestore
        const canonId = toCanonicalPropId(window.currentPropertyId);
        const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`));
        const pData = pricingSnap.exists() ? pricingSnap.data() : {};

        window.masterPricing = {
            timeline: pData.timeline || {},
            relationships: (activeProp?.masterPricing?.relationships?.length ? activeProp.masterPricing.relationships : pData.relationships) || [],
            baseRates: pData.baseRates || {}
        };

        const mergedRules = {
            ...(pData.pricingRules || {}),
            ...(activeProp?.pricingRules || {})
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

        populateChannelPreviewFilter();
        hasLoadedPricingFromCloud = true;
        updateEventPricingToggleUI();

        // Realtime Staff Listener for Net Availability Calculation
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            window.staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderRateMatrix();
        });

        renderRateMatrix();
        renderPromoRulesTable();
        detectPromoScheduleShifts(activeProp?.lastPromoSyncDate);
        loadPropertyBaseline();

        if (loader) loader.style.display = 'none';

    } catch (err) {
        console.error("[CM Init Failed]:", err);
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
    const depthEvtBtn = document.getElementById('depth-event');
    if (depthEvtBtn) depthEvtBtn.style.display = isEn ? 'inline-block' : 'none';

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

export function updateSaveIndicator() {
    const si = document.getElementById('save-indicator');
    const saveBtn = document.getElementById('btn-save-sync');
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

    const dateCount = Object.keys(window.masterPricing?.timeline || {}).length;
    if (dateCount === 0) {
        console.error("[Save Blocked]: Attempted to save an empty pricing matrix.");
        return customAlert("Save Blocked", "Safety Guard: Matrix in memory is empty. Overwriting existing rates is blocked.");
    }

    if (!silent) {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';
    }

    try {
        const canonId = toCanonicalPropId(window.currentPropertyId);

        // 1. Immutable Rolling Backup
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing_backups', `${canonId}_${Date.now()}`);
        await setDoc(backupRef, {
            timeline: window.masterPricing.timeline || {},
            createdAt: new Date().toISOString()
        });

        // 2. Persist Master Pricing Matrix
        const mainRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`);
        await setDoc(mainRef, {
            timeline: window.masterPricing.timeline || {},
            relationships: window.masterPricing.relationships || [],
            pricingRules: window.pricingRules || {},
            updatedAt: new Date().toISOString()
        }, { merge: true });

        const todayStr = getLocalYMD(new Date());
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', window.currentPropertyId), {
            lastPromoSyncDate: todayStr
        });
        const shiftBanner = document.getElementById('promo-shift-banner');
        if (shiftBanner) shiftBanner.classList.add('hidden');

        hasUnsavedChanges = false;
        updateSaveIndicator();
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
    window.markUnsavedChanges = markUnsavedChanges;
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
