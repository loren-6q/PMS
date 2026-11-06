// ==========================================================================
// cm/cm-init.js - Channel Manager Frame Bootstrapper & Cloud Persistence
// Wild & Wandering Channel Manager
// ==========================================================================

import { auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { loadPropertyBaseline, checkMissing, renderManualGrid } from './cm-auditor.js';
import { renderPromoRulesTable } from './cm-promos.js';
import { pushToChannexAPI, saveAndSync } from '../channex.js';

export let hasUnsavedChanges = false;
export let hasLoadedPricingFromCloud = false;

export async function initCm() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        await signInAnonymously(auth);

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
        window.currentPropertyId = toCanonicalPropId(pParam);

        const activeProp = props.find(p => p.id === window.currentPropertyId) || props[0];
        window.currentPropertyConfig = activeProp || {};

        window.roomTypes = Array.from(new Set((activeProp?.rooms || []).map(r => r.type || r.category).filter(Boolean)));
        window.displayAbbrev = {};
        (activeProp?.rooms || []).forEach(r => {
            if (r.type && r.short) window.displayAbbrev[r.type] = r.short;
        });

        window.totalRoomsByType = {};
        (activeProp?.rooms || []).forEach(r => {
            const cat = r.type || r.category;
            if (cat) window.totalRoomsByType[cat] = (window.totalRoomsByType[cat] || 0) + 1;
        });

        window.eventDates = activeProp?.events || [];
        window.enableEventRates = activeProp?.enableEventRates !== undefined 
            ? !!activeProp.enableEventRates 
            : ((window.eventDates || []).length > 0);

        window.channexConfig = activeProp?.channex || {};
        window.channexMap = activeProp?.channexMap || [];
        window.channexRateMap = activeProp?.channexRateMap || [];
        window.promoRules = activeProp?.promoRules || [];
        window.dirtyDates = new Set();
        window.syncedDates = new Set();
        window.editMode = 'ripple';

        // Load Pricing Matrix from Firestore
        const canonId = window.toCanonicalPropId(window.currentPropertyId);
        const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`));
        if (pricingSnap.exists()) {
            const pData = pricingSnap.data();
            window.masterPricing = {
                timeline: pData.timeline || {},
                relationships: pData.relationships || [],
                baseRates: pData.baseRates || {}
            };
            window.pricingRules = pData.pricingRules || { channels: {} };
            window.savedAutofillBaselines = pData.autofillBaselines || {};
        } else {
            window.masterPricing = { timeline: {}, relationships: [], baseRates: {} };
            window.pricingRules = { channels: {} };
        }

        hasLoadedPricingFromCloud = true;
        updateEventPricingToggleUI();

        // Realtime Staff Listener for Net Availability Calculation
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            window.staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderRateMatrix();
        });

        renderRateMatrix();
        renderPromoRulesTable();
        loadPropertyBaseline();

        if (loader) loader.style.display = 'none';

    } catch (err) {
        console.error("[CM Init Failed]:", err);
        if (loader) loader.style.display = 'none';
    }
}

export function isEventPricingEnabled() {
    const canon = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
    if (canon === 'loud_samui' || canon === 'big_c') return false;
    return window.enableEventRates !== undefined ? !!window.enableEventRates : ((window.eventDates || []).length > 0);
}

export async function togglePropertyEventRates() {
    const canon = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
    if (canon === 'loud_samui') {
        return customAlert("Notice", "Event Pricing is not active for LOUD Hostels Samui.");
    }

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
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;

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
}

// DOM & Interaction Locks
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCm);
} else {
    initCm();
}
