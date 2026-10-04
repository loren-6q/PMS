// ==========================================================================
// CHANNEL MANAGER CORE MODULE (cm-core.js)
// Wild & Wandering Channel Manager
// Hosted at: https://loren-6q.github.io/PMS/cm-core.js
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, 
    getDocs, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. FIREBASE INITIALIZATION & EXPORTS ---
const firebaseConfig = { 
    apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU", 
    authDomain: "swimspms.firebaseapp.com", 
    projectId: "swimspms", 
    storageBucket: "swimspms.firebasestorage.app", 
    messagingSenderId: "989960113115", 
    appId: "1:989960113115:web:a99e08a23a36ff4289f5fe" 
};

export const app = initializeApp(firebaseConfig); 
export const auth = getAuth(app); 
export const db = getFirestore(app); 
export const appId = 'hotel-pms-v1';

// Expose Firestore services on window for other modules
window.db = db;
window.auth = auth;
window.appId = appId;
window.cmFs = { doc, getDoc, setDoc, collection, getDocs, updateDoc, onSnapshot };

// --- 2. GLOBAL STATE DEFINITIONS ---
window.mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
window.daysToRender = 42;
window.currentPropertyId = 'swims_resort';
window.windowPropertiesList = [];
window.roomTypes = [];
window.displayAbbrev = {};
window.eventDates = [];
window.masterPricing = { relationships: [], timeline: {} };
window.currentPlatformView = 'direct';
window.isRippleEnabled = true;
window.staff = [];
window.totalRoomsByType = {};
window.hotelRooms = [];
window.liveInventory = {};
window.currentCurrency = 'THB';
window.savedAutofillBaselines = null;

// Dirty Tracking & Sync Queues
window.dirtyDates = new Set();
window.syncedDates = new Set();
window.dirtyFields = {};
window.hasUnsavedChanges = false;

// Default Metric Display: Rates and Avail Only
window.activeMetrics = (() => {
    try {
        const raw = localStorage.getItem('cm_active_metrics');
        if (raw) return new Set(JSON.parse(raw));
    } catch(e) {}
    return new Set(['rates', 'avail']);
})();

// Manual Auditor & Live Matrix State
window.snapshotData = {};
window.dismissedIds = [];
window.viewDates = [];

// Typing & Scroll Lockouts
window.isUserTyping = false;
window.typingTimeout = null;

// --- 3. UI LOADERS, MODALS & ALERTS ---
window.showLoader = (statusText = 'LOADING DATA...') => {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('active');
        loader.style.display = 'flex';
    }
    const statusEl = document.getElementById('sync-status');
    if (statusEl && statusText) statusEl.innerText = statusText;
};

window.hideLoader = () => {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('active');
        loader.style.display = 'none';
    }
};

window.customAlert = (msg, isConfirm = false, onConfirm = null) => {
    const msgEl = document.getElementById('custom-alert-msg');
    if (msgEl) msgEl.innerText = msg;
    const cancelBtn = document.getElementById('custom-alert-cancel');
    const confirmBtn = document.getElementById('custom-alert-confirm');
    const alertEl = document.getElementById('custom-alert');
    if (!alertEl || !confirmBtn) return;

    if (isConfirm) {
        if (cancelBtn) cancelBtn.classList.remove('hidden'); 
        confirmBtn.innerText = 'Yes';
        confirmBtn.classList.replace('bg-indigo-600', 'bg-red-600'); 
        confirmBtn.classList.replace('hover:bg-indigo-700', 'hover:bg-red-700');
    } else {
        if (cancelBtn) cancelBtn.classList.add('hidden'); 
        confirmBtn.innerText = 'Okay';
        confirmBtn.classList.replace('bg-red-600', 'bg-indigo-600'); 
        confirmBtn.classList.replace('hover:bg-red-700', 'hover:bg-indigo-700');
    }
    confirmBtn.onclick = () => { 
        if (onConfirm) onConfirm(); 
        alertEl.classList.add('hidden'); 
    };
    alertEl.classList.remove('hidden');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
    }
};

// --- 4. FORMATTERS & MATH HELPERS ---
// Universal Currency Rounder: Strict whole integer for zero-decimal currencies (THB, JPY), 2 decimals for others
window.roundCurrency = (val, currency = (window.currentCurrency || 'THB')) => {
    if (val === "" || val === null || val === undefined || isNaN(val)) return "";
    const num = Number(val);
    const cur = (currency || window.currentCurrency || 'THB').toString().toUpperCase().trim();
    const decimalCurrencies = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'NZD'];
    if (decimalCurrencies.includes(cur)) {
        return Math.round(num * 100) / 100;
    }
    return Math.round(num); // Unconditional whole integer rounding for THB
};

window.formatDisplay = (val) => {
    if (val === "" || val === undefined || val === null || isNaN(val)) return "";
    return window.roundCurrency(val);
};

window.formatRatePlanTitle = (rawTitle) => {
    if (!rawTitle) return "Standard";
    let t = rawTitle.replace(/\[.*?\]/g, '').trim();
    t = t.replace(/\s+Rate$/i, '').trim();
    const lower = t.toLowerCase();
    if (lower.includes('non-ref') || lower.includes('non ref')) return "Non-Refundable";
    if (lower.includes('standard') || lower.includes('flex') || lower.includes('refundable')) return "Standard";
    if (lower.includes('breakfast')) return "Bed & Breakfast";
    if (lower.includes('monthly') || lower.includes('long stay')) return "Monthly / Long";
    return t || "Rate Plan";
};

window.cleanPayload = (obj) => {
    if (Array.isArray(obj)) return obj.map(window.cleanPayload);
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => [k, window.cleanPayload(v)])
        );
    }
    return obj;
};

window.getLocalYMD = (d) => { return d.toISOString().split('T')[0]; };
window.parseYMD = (str) => { 
    if(!str) return 0; 
    const p = str.split('-'); 
    return Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]), 12, 0, 0); 
};

window.dbToUiRoom = (rid) => {
    if (!rid) return "";
    return window.normalizeRoomId ? window.normalizeRoomId(rid, window.currentPropertyId) : rid;
};

// Strict, Non-Heuristic Category Resolver
window.categoryResolver = (catName) => {
    if (!catName) return "";
    const clean = catName.toUpperCase().trim();
    const actual = (window.roomTypes || []).find(rt => rt.toUpperCase().trim() === clean);
    return actual || "";
};

window.resolveRoomCategory = (bookedType) => {
    if (window.resolvePmsRoomType) {
        const resolved = window.resolvePmsRoomType(bookedType);
        if (resolved && (window.roomTypes || []).includes(resolved)) return resolved;
    }
    if (!bookedType) return null;
    const rawLower = bookedType.toLowerCase();
    return (window.roomTypes || []).find(rt => rawLower.includes(rt.toLowerCase()) || rt.toLowerCase().includes(rawLower)) || null;
};

window.getViewMultiplier = () => { 
    return window.currentPlatformView === 'hw' ? 1.25 : 1.0; 
};

// Universal OTA Channel Matcher (Supports BDC, HW, Agoda, Expedia, Airbnb aliases)
window.isRatePlanMatchingChannel = (ratePlanTitle = '', channel = '') => {
    if (!channel || channel === 'ALL') return true;
    if (!ratePlanTitle) return false;
    const titleLower = ratePlanTitle.toLowerCase();
    const chLower = channel.toLowerCase();

    // Direct containment check
    if (titleLower.includes(chLower)) return true;

    // Industry OTA alias dictionary
    const aliases = {
        'booking.com': ['booking.com', 'booking', 'bdc'],
        'hostelworld': ['hostelworld', 'hw'],
        'agoda': ['agoda', 'ago', 'ycs'],
        'expedia': ['expedia', 'exp', 'epc'],
        'airbnb': ['airbnb', 'abnb']
    };

    for (const [key, aliasList] of Object.entries(aliases)) {
        if (chLower.includes(key) || key.includes(chLower)) {
            if (aliasList.some(alias => titleLower.includes(alias) || new RegExp(`\\b${alias}\\b`, 'i').test(titleLower))) {
                return true;
            }
        }
    }

    return false;
};

// --- 5. PROPERTY & URL RESOLUTION ---
window.safeUpdateUrlParam = (paramName, paramVal) => {
    try {
        if (typeof window === 'undefined' || !window.location) return;
        if (!window.location.protocol.startsWith('http')) return;
        const url = new URL(window.location.href);
        url.searchParams.set(paramName, paramVal);
        window.history.replaceState({}, '', url.pathname + url.search);
    } catch(e) {}
};

window.resolveTargetPropertyId = (propsList) => {
    let pRaw = '';
    try {
        const params = new URLSearchParams(window.location.search);
        pRaw = (params.get('p') || params.get('prop') || params.get('property') || '').trim();
    } catch(e) {}

    let storedRaw = '';
    try {
        storedRaw = (localStorage.getItem('last_prop') || localStorage.getItem('pms_active_property') || '').trim();
    } catch(e) {}

    const candidates = [pRaw, storedRaw].filter(Boolean);

    for (const raw of candidates) {
        const upperRaw = raw.toUpperCase();
        const mappedId = window.toCanonicalPropId ? window.toCanonicalPropId(upperRaw) : raw;

        const exact = propsList.find(p => p.id.toLowerCase() === mappedId.toLowerCase());
        if (exact) return exact.id;

        const matchShort = propsList.find(p => (window.toDisplayPropKey ? window.toDisplayPropKey(p.id) : '').toUpperCase() === upperRaw);
        if (matchShort) return matchShort.id;

        const partial = propsList.find(p => p.id.toLowerCase().includes(raw.toLowerCase()) || (p.name && p.name.toLowerCase().includes(raw.toLowerCase())));
        if (partial) return partial.id;
    }

    return propsList[0]?.id || 'swims_resort';
};

window.syncNavLinks = (propId) => {
    const shortKey = window.toDisplayPropKey ? window.toDisplayPropKey(propId) : 'SWIMS';
    const backBtn = document.getElementById('nav-pms-btn');
    if (backBtn) backBtn.href = `index.html?p=${shortKey}`;

    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
            try {
                const baseOrigin = window.location.protocol.startsWith('http') ? window.location.origin : 'https://localhost';
                const url = new URL(href, baseOrigin);
                url.searchParams.set('p', shortKey);
                a.setAttribute('href', url.pathname + url.search);
            } catch(e) {}
        }
    });
};

// --- 6. UI PREFERENCES & DIRTY TRACKING ---
window.saveUiPreferences = () => {
    try {
        localStorage.setItem('cm_active_metrics', JSON.stringify(Array.from(window.activeMetrics)));
        localStorage.setItem('cm_platform_view', window.currentPlatformView);
    } catch(e) {}
};

window.syncFilterPills = () => {
    ['rates', 'evt', 'avail', 'min', 'max', 'cta', 'ctd', 'stop'].forEach(m => {
        const pill = document.getElementById(`flt-${m}`);
        if (pill) {
            if (window.activeMetrics.has(m)) pill.classList.add('active');
            else pill.classList.remove('active');
        }
    });
};

window.toggleFilter = (metric) => {
    if (window.activeMetrics.has(metric)) window.activeMetrics.delete(metric);
    else window.activeMetrics.add(metric);
    window.saveUiPreferences();
    window.syncFilterPills();
    if (window.renderGrid) window.renderGrid();
};

window.switchTab = (tab) => {
    const tabs = ['grid', 'promos', 'smart', 'relational', 'mapping', 'manual'];
    tabs.forEach(t => {
        const el = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (el) {
            if (t === tab) {
                el.style.display = (t === 'manual' || t === 'grid') ? 'flex' : 'block';
                el.classList.remove('hidden');
            } else {
                el.style.display = 'none';
                el.classList.add('hidden');
            }
        }
        if (btn) {
            btn.classList.toggle('active', t === tab);
        }
    });

    try {
        if (tab === 'promos' && typeof window.renderPromoRulesTable === 'function') window.renderPromoRulesTable();
        if (tab === 'relational' && typeof window.renderRelationships === 'function') window.renderRelationships();
        if (tab === 'smart' && typeof window.updateAnchorDropdowns === 'function') window.updateAnchorDropdowns();
        if (tab === 'manual') {
            if (typeof window.renderManualGrid === 'function') window.renderManualGrid();
            if (typeof window.checkMissing === 'function') window.checkMissing();
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    } catch (err) {
        console.warn("Tab view refresh notice:", err);
    }
};

window.setPreset = (preset) => {
    if (preset === 'rates') window.activeMetrics = new Set(['rates']);
    else if (preset === 'avail') window.activeMetrics = new Set(['avail']);
    else if (preset === 'min') window.activeMetrics = new Set(['min']);
    else if (preset === 'full') window.activeMetrics = new Set(['rates', 'evt', 'avail', 'min', 'max', 'cta', 'ctd', 'stop']);
    window.saveUiPreferences();
    window.syncFilterPills();
    if (window.renderGrid) window.renderGrid();
};

window.setView = (view) => {
    window.currentPlatformView = view;
    ['direct', 'bdc', 'hw'].forEach(v => { 
        document.getElementById(`view-${v}`)?.classList.remove(`active-${v}`); 
    });
    document.getElementById(`view-${view}`)?.classList.add(`active-${view}`);
    window.saveUiPreferences();
    if (window.renderGrid) window.renderGrid();
};

window.markUnsavedChanges = () => {
    window.hasUnsavedChanges = true;
    window.updateSaveIndicator();
};

window.updateSaveIndicator = () => {
    const si = document.getElementById('save-indicator');
    const saveBtn = document.getElementById('btn-save-sync');
    if (!si) return;
    if (window.hasUnsavedChanges) {
        si.innerText = '● UNSAVED CHANGES';
        si.className = 'text-[10px] font-black uppercase tracking-widest text-amber-600 mr-2 opacity-100 animate-pulse';
        if (saveBtn) saveBtn.classList.add('ring-2', 'ring-amber-400');
    } else {
        si.innerText = 'PRICING SAVED';
        si.className = 'text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-2 opacity-100';
        if (saveBtn) saveBtn.classList.remove('ring-2', 'ring-amber-400');
        setTimeout(() => { if (!window.hasUnsavedChanges && si) si.classList.add('opacity-0'); }, 3000);
    }
};

// --- 7. LOAD PROPERTY CONFIG & PRICING ---
window.loadPropertyConfig = async () => {
    try {
        const propsRef = collection(db, 'artifacts', appId, 'public', 'data', 'properties');
        const propsSnap = await getDocs(propsRef);
        window.windowPropertiesList = [];
        propsSnap.forEach(docSnap => window.windowPropertiesList.push({ id: docSnap.id, ...docSnap.data() }));

        const targetPropId = window.resolveTargetPropertyId(window.windowPropertiesList);
        window.currentPropertyId = targetPropId;

        try { 
            localStorage.setItem('last_prop', window.currentPropertyId); 
            localStorage.setItem('pms_active_property', window.currentPropertyId); 
        } catch(e) {}

        const shortKey = window.toDisplayPropKey ? window.toDisplayPropKey(window.currentPropertyId) : 'SWIMS';
        window.safeUpdateUrlParam('p', shortKey);
        window.syncNavLinks(window.currentPropertyId);

        // Populate switcher with canonical names
        const switcher = document.getElementById('property-switcher');
        if (switcher && window.windowPropertiesList.length > 0) {
            const seen = new Set();
            const optionsHtml = [];
            window.windowPropertiesList.forEach(p => {
                const canon = window.toCanonicalPropId ? window.toCanonicalPropId(p.id) : p.id;
                if (!seen.has(canon)) {
                    seen.add(canon);
                    optionsHtml.push(`<option value="${p.id}" ${p.id === window.currentPropertyId ? 'selected' : ''}>${(p.name || p.id).toUpperCase()}</option>`);
                }
            });
            switcher.innerHTML = optionsHtml.join('');
            switcher.value = window.currentPropertyId;
        }

        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const propToLoad = window.windowPropertiesList.find(p => p.id === canonId && Array.isArray(p.rooms) && p.rooms.length > 0)
            || window.windowPropertiesList.find(p => (window.toCanonicalPropId ? window.toCanonicalPropId(p.id) : p.id) === canonId)
            || window.windowPropertiesList.find(p => p.id.toLowerCase() === window.currentPropertyId.toLowerCase())
            || window.windowPropertiesList[0];

        if (propToLoad) {
            window.currentCurrency = propToLoad.currency || 'THB';
            window.hotelRooms = Array.isArray(propToLoad.rooms) ? [...propToLoad.rooms] : [];
            window.eventDates = Array.isArray(propToLoad.events) ? [...propToLoad.events] : [];
            window.channexConfig = propToLoad.channex || {};
            window.channexMap = Array.isArray(propToLoad.channexMap) ? [...propToLoad.channexMap] : [];
            window.channexRateMap = Array.isArray(propToLoad.channexRateMap) ? [...propToLoad.channexRateMap] : [];
            window.promoRules = Array.isArray(propToLoad.promoRules) ? [...propToLoad.promoRules] : [];
        } else {
            window.currentCurrency = 'THB';
            window.hotelRooms = []; 
            window.eventDates = []; 
            window.channexConfig = {}; 
            window.channexMap = []; 
            window.channexRateMap = []; 
            window.promoRules = [];
        }

        // Restore Channex credentials to input fields
        let apiKey = window.channexConfig?.apiKey || '';
        let chanPropId = window.channexConfig?.propId || '';

        if (!apiKey || !chanPropId) {
            try {
                const localCreds = JSON.parse(localStorage.getItem(`cm_channex_${window.currentPropertyId}`) || '{}');
                if (localCreds.apiKey && !apiKey) apiKey = localCreds.apiKey;
                if (localCreds.propId && !chanPropId) chanPropId = localCreds.propId;
            } catch(e) {}
        }

        const keyInput = document.getElementById('chan-api-key');
        const propInput = document.getElementById('chan-prop-id');
        if (keyInput) keyInput.value = apiKey;
        if (propInput) propInput.value = chanPropId;
        if (apiKey && chanPropId) {
            window.channexConfig = { apiKey, propId: chanPropId, env: 'production' };
        }

        // Derive active room categories strictly from hotelRooms
        window.roomTypes = [];
        window.totalRoomsByType = {};
        
        window.hotelRooms.forEach(r => {
            if (r && r.type) {
                const cleanType = r.type.trim();
                if (!window.roomTypes.includes(cleanType)) window.roomTypes.push(cleanType);
                window.totalRoomsByType[cleanType] = (window.totalRoomsByType[cleanType] || 0) + 1;
            }
        });

        window.displayAbbrev = {};
        window.roomTypes.forEach(rt => {
            const firstRoomOfCat = window.hotelRooms.find(r => r && r.type === rt);
            window.displayAbbrev[rt] = (firstRoomOfCat && firstRoomOfCat.short) ? firstRoomOfCat.short : rt;
        });

        const hasEvents = window.eventDates.length > 0;
        const evtCheckbox = document.getElementById('w-enable-events');
        if (evtCheckbox) evtCheckbox.checked = hasEvents;
        if (window.toggleAutofillEventMode) window.toggleAutofillEventMode(hasEvents);
        
        window.syncFilterPills();
        window.masterPricing = { relationships: [], timeline: {} };
        
        // Document recovery
        const canonPropId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const shortPropId = window.toDisplayPropKey ? window.toDisplayPropKey(canonPropId) : '';
        const possibleDocIds = [...new Set([`master_${canonPropId}`, `master_${window.currentPropertyId}`, `master_${shortPropId}`].filter(Boolean))];

        let loadedRelationships = null;
        let loadedBaselines = null;
        let loadedTimeline = null;

        for (const docId of possibleDocIds) {
            try {
                const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', docId));
                if (snap.exists()) {
                    const d = snap.data();
                    if (!loadedTimeline && d.timeline && Object.keys(d.timeline).length > 0) loadedTimeline = d.timeline;
                    if (!loadedRelationships && Array.isArray(d.relationships) && d.relationships.length > 0) loadedRelationships = d.relationships;
                    if (!loadedBaselines && d.autofillBaselines) loadedBaselines = d.autofillBaselines;
                    if ((!window.channexConfig?.apiKey || !window.channexConfig?.propId) && d.channex?.apiKey && d.channex?.propId) {
                        window.channexConfig = d.channex;
                        if (keyInput && !keyInput.value) keyInput.value = d.channex.apiKey;
                        if (propInput && !propInput.value) propInput.value = d.channex.propId;
                    }
                }
            } catch (pErr) {
                console.warn("Pricing load check:", docId, pErr);
            }
        }

        if (loadedTimeline) window.masterPricing.timeline = loadedTimeline;
        if (loadedRelationships) window.masterPricing.relationships = loadedRelationships;
        if (loadedBaselines && window.populateAutofillBaselines) window.populateAutofillBaselines(loadedBaselines);

        if (Array.isArray(window.masterPricing.relationships) && window.masterPricing.relationships.length > 0) {
            window.masterPricing.relationships = window.masterPricing.relationships.map(rel => ({
                ...rel,
                anchor: rel.anchor === 'unlinked' ? 'unlinked' : (window.categoryResolver(rel.anchor) || rel.anchor),
                target: window.categoryResolver(rel.target) || rel.target
            }));
        }

        if (window.updateAnchorDropdowns) window.updateAnchorDropdowns();
        if (window.populatePromoScopeDropdown) window.populatePromoScopeDropdown();
        if (window.renderPromoRulesTable) window.renderPromoRulesTable();
        if (window.renderRelationships) window.renderRelationships();
        if (window.renderChannexMapping) window.renderChannexMapping();
    } catch (err) {
        console.error("Config load error:", err);
    }
};

window.handlePropertySwitch = async (propId) => {
    if (propId === window.currentPropertyId) return;
    window.showLoader('SWITCHING PROPERTY...');
    window.currentPropertyId = propId;

    try { 
        localStorage.setItem('last_prop', window.currentPropertyId); 
        localStorage.setItem('pms_active_property', window.currentPropertyId); 
    } catch(e) {}

    const shortKey = window.toDisplayPropKey ? window.toDisplayPropKey(window.currentPropertyId) : 'SWIMS';
    window.safeUpdateUrlParam('p', shortKey);
    window.syncNavLinks(window.currentPropertyId);

    window.dirtyDates.clear();
    window.dirtyFields = {};
    window.hasUnsavedChanges = false;
    window.updateSaveIndicator();

    await window.loadPropertyConfig();
    if (window.renderGrid) window.renderGrid();
    if (window.renderManualGrid) window.renderManualGrid();
    window.hideLoader();
};

window.reloadSettingsConfig = async () => {
    window.showLoader('RELOADING CONFIG FROM DATABASE...');
    await window.loadPropertyConfig();
    if (window.renderGrid) window.renderGrid();
    if (window.renderManualGrid) window.renderManualGrid();
    window.hideLoader();
    window.customAlert("Inventory & Event settings refreshed from database!");
};

// --- 8. SAVE PRICING TO CLOUD ---
window.savePricingToCloud = async (silent = false) => {
    if (!silent) window.showLoader('SAVING TO CLOUD...');
    try {
        if (window.readRelationshipsFromDOM) window.readRelationshipsFromDOM();
        const canonId = window.toCanonicalPropId ? window.toCanonicalPropId(window.currentPropertyId) : window.currentPropertyId;
        const payload = window.cleanPayload(JSON.parse(JSON.stringify(window.masterPricing)));
        if (window.savedAutofillBaselines) {
            payload.autofillBaselines = window.savedAutofillBaselines;
        }
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`), { 
            ...payload, 
            updatedAt: new Date().toISOString() 
        }, { merge: true });
        
        window.hasUnsavedChanges = false;
        window.updateSaveIndicator();

        if (!silent) { 
            window.hideLoader(); 
            window.customAlert("Success!\n\nYour Master Pricing Matrix and Rule Links have been saved to the database."); 
        }
        return true;
    } catch (err) {
        console.warn(err);
        if (!silent) { 
            window.hideLoader(); 
            window.customAlert("Save Error:\n\nCould not write to Firebase: " + err.message); 
        }
        return false;
    }
};

// --- 9. COMBINED "SAVE & SYNC" ENGINE ---
// Replaces separate Save Pricing and Sync Changes buttons with one seamless action
window.saveAndSync = async (btn) => {
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline" size="14"></i> SAVING & SYNCING...';
        btn.disabled = true;
    }

    try {
        // Step 1: Commit in-memory changes to Firebase Cloud
        const saveOk = await window.savePricingToCloud(true);
        if (!saveOk) throw new Error("Could not commit pricing to Firestore.");

        // Step 2: Push pending delta changes to Channex if configured
        const hasChannex = window.channexConfig?.apiKey && window.channexConfig?.propId;
        if (hasChannex && window.pushToChannexAPI) {
            if (window.dirtyDates.size > 0) {
                await window.pushToChannexAPI(btn, 'delta');
            } else {
                window.customAlert("✅ Pricing saved to cloud!\n\nNo pending modified cells to push to Channex.");
            }
        } else {
            window.customAlert("✅ Pricing saved to cloud successfully!\n\n(Channex OTA credentials not mapped for this property).");
        }
    } catch (e) {
        console.error("Save & Sync Error:", e);
        window.customAlert("Save & Sync Failed:\n\n" + e.message);
    } finally {
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
        if (window.lucide) window.lucide.createIcons();
    }
};

// --- 10. AUTH & BOOTSTRAP INITIALIZATION ---
window.initCmCore = async () => {
    window.showLoader('AUTHENTICATING...');

    const safetyTimer = setTimeout(() => {
        window.hideLoader();
    }, 5000);

    try { 
        if (typeof window.__initial_auth_token !== 'undefined') {
            try { await signInWithCustomToken(auth, window.__initial_auth_token); }
            catch (e) { await signInAnonymously(auth); }
        } else {
            await signInAnonymously(auth);
        }
    } catch (aErr) {
        console.warn("Auth initialization notice:", aErr);
    }

    // Realtime Staff Bookings listener for availability calculation
    try {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (staffSnap) => {
            window.staff = staffSnap.docs.map(d => {
                let data = d.data();
                if (!data.property) data.property = 'swims_resort'; 
                return { id: d.id, ...data };
            });
            
            if (window.roomTypes && window.roomTypes.length > 0) {
                if (window.renderGrid) window.renderGrid();
                if (window.renderManualGrid) window.renderManualGrid();
            }
        }, (snapErr) => console.warn("Staff snapshot warning:", snapErr));
    } catch (staffErr) {
        console.warn("Could not load staff bookings:", staffErr);
    }

    try {
        await window.loadPropertyConfig();
        if (window.loadPropertyBaseline) await window.loadPropertyBaseline();
    } catch (e) { console.warn("Config load error:", e); }

    // Date range initializations
    const today = new Date(); 
    const tapeStart = document.getElementById('tape-start');
    if (tapeStart) tapeStart.value = window.getLocalYMD(today); 
    const wStart = document.getElementById('w-start-date');
    if (wStart) wStart.value = window.getLocalYMD(today);
    const wEnd = document.getElementById('w-end-date');
    if (wEnd) {
        const next90 = new Date(today);
        next90.setDate(today.getDate() + 89);
        wEnd.value = window.getLocalYMD(next90);
    }
    
    const nextM = new Date(today); 
    nextM.setDate(today.getDate() + 30);
    const qbStart = document.getElementById('qb-start'); 
    if(qbStart) qbStart.value = window.getLocalYMD(today);
    const qbEnd = document.getElementById('qb-end'); 
    if(qbEnd) qbEnd.value = window.getLocalYMD(nextM);

    // Restore platform view
    try {
        const savedView = localStorage.getItem('cm_platform_view');
        if (savedView && ['direct', 'bdc', 'hw'].includes(savedView)) {
            window.currentPlatformView = savedView;
            ['direct', 'bdc', 'hw'].forEach(v => document.getElementById(`view-${v}`)?.classList.remove(`active-${v}`));
            document.getElementById(`view-${savedView}`)?.classList.add(`active-${savedView}`);
        }
    } catch(e) {}

    if (window.switchTab) window.switchTab('grid'); 
    window.syncFilterPills();
    
    try { 
        if (window.renderGrid) window.renderGrid();
        if (window.renderManualGrid) window.renderManualGrid();
    } catch(gErr) { console.warn("Grid render error:", gErr); }

    clearTimeout(safetyTimer);
    window.hideLoader();

    // Interaction Locks
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' && (e.target.closest('.rate-grid-table') || e.target.closest('#qb-grid-body'))) {
            window.isUserTyping = true;
            clearTimeout(window.typingTimeout);
            window.typingTimeout = setTimeout(() => { window.isUserTyping = false; }, 800);
        }
    });

    window.addEventListener('wheel', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.closest('.rate-grid-table')) {
            document.activeElement.blur();
        }
    }, { passive: true });

    document.body.addEventListener('mouseover', (e) => {
        if (window.isUserTyping) return;
        if (e.target.tagName === 'INPUT' && (e.target.closest('.rate-grid-table') || e.target.closest('#qb-grid-body'))) {
            if (document.activeElement !== e.target && e.target.type !== 'date' && !e.target.disabled) {
                e.target.focus({ preventScroll: true });
                if(e.target.type === 'number' || e.target.type === 'text') e.target.select();
            }
        }
    });

    document.body.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            const currentTd = e.target.closest('td');
            const currentTr = e.target.closest('tr');
            if(!currentTd || !currentTr) return;
            
            const cellIndex = Array.from(currentTr.children).indexOf(currentTd);
            let nextTr = currentTr.nextElementSibling;
            
            while(nextTr) {
                const nextTd = nextTr.children[cellIndex];
                if (nextTd) {
                    const nextInput = nextTd.querySelector('input:not([disabled])');
                    if (nextInput && nextInput.type !== 'hidden') {
                        nextInput.focus();
                        nextInput.select();
                        return;
                    }
                }
                nextTr = nextTr.nextElementSibling;
            }
        }
    });
};
