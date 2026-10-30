// ==========================================================================
// cm/cm-init.js - Channel Manager Frame Bootstrapper & Cloud Persistence
// Wild & Wandering Channel Manager
// ==========================================================================

import { app, auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';
import { customAlert } from '../core/ui-dialogs.js';
import { renderRateMatrix } from './cm-matrix-grid.js';
import { loadPropertyBaseline } from './cm-auditor.js';
import { renderPromoRulesTable } from './cm-promos.js';
import { pushToChannexAPI, saveAndSync } from '../channex.js';

export let hasUnsavedChanges = false;

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
        window.currentPropertyConfig = activeProp;
        window.roomTypes = Array.from(new Set((activeProp?.rooms || []).map(r => r.type || r.category).filter(Boolean)));
        window.channexConfig = activeProp?.channex || {};
        window.channexMap = activeProp?.channexMap || [];
        window.channexRateMap = activeProp?.channexRateMap || [];
        window.promoRules = activeProp?.promoRules || [];
        window.dirtyDates = new Set();
        window.editMode = 'ripple';

        // Load Rate Matrix Document
        const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${window.currentPropertyId}`));
        if (pricingSnap.exists()) {
            window.masterPricing = pricingSnap.data();
        } else {
            window.masterPricing = { timeline: {}, relationships: [] };
        }

        // Realtime Staff Bookings (for Net Availability calculation)
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

export function markUnsavedChanges() {
    hasUnsavedChanges = true;
    updateSaveIndicator();
}

export function updateSaveIndicator() {
    const si = document.getElementById('save-indicator');
    if (!si) return;
    if (hasUnsavedChanges) {
        si.innerText = '● UNSAVED CHANGES';
        si.className = 'text-[10px] font-black uppercase tracking-widest text-amber-600 mr-2 opacity-100 animate-pulse';
    } else {
        si.innerText = 'PRICING SAVED';
        si.className = 'text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-2 opacity-100';
        setTimeout(() => { if (!hasUnsavedChanges) si.classList.add('opacity-0'); }, 3000);
    }
}

export async function savePricingToCloud(silent = false) {
    if (!silent) {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';
    }

    try {
        const canonId = window.currentPropertyId;

        // Rolling Backup
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing_backups', `${canonId}_${Date.now()}`);
        await setDoc(backupRef, {
            timeline: window.masterPricing?.timeline || {},
            createdAt: new Date().toISOString()
        });

        // Write Primary Matrix
        const mainRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`);
        await setDoc(mainRef, {
            timeline: window.masterPricing?.timeline || {},
            relationships: window.masterPricing?.relationships || [],
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
    ['grid', 'rules', 'promos', 'manual'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (view) view.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });

    if (tab === 'grid') renderRateMatrix();
    if (tab === 'promos') renderPromoRulesTable();
}

if (typeof window !== 'undefined') {
    window.markUnsavedChanges = markUnsavedChanges;
    window.updateSaveIndicator = updateSaveIndicator;
    window.savePricingToCloud = savePricingToCloud;
    window.switchTab = switchTab;
}

document.addEventListener('DOMContentLoaded', initCm);
