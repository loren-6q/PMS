// ==========================================================================
// core/properties.js - Canonical Properties & Universal Navigation Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from './config.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Canonical Property Dictionary
export const PROPERTY_CANONICAL_MAP = {
    'swims_resort': 'swims_resort',
    'swims': 'swims_resort',
    'swims resort': 'swims_resort',
    'loud_beach': 'loud_beach',
    'loud': 'loud_beach',
    'loud beach': 'loud_beach'
};

// Normalize raw property strings or short codes
export function toCanonicalPropId(rawId) {
    if (!rawId) return 'swims_resort';
    const clean = String(rawId).trim().toLowerCase();
    return PROPERTY_CANONICAL_MAP[clean] || clean;
}

// Get the active property ID from URL or local storage
export function getActivePropertyId() {
    const urlParams = new URLSearchParams(window.location.search);
    const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
    const canon = toCanonicalPropId(pParam);
    localStorage.setItem('last_prop', canon);
    return canon;
}

// Fetch all properties from Firestore
export async function loadPropertiesCatalog() {
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.availableProperties = props;
        return props;
    } catch (err) {
        console.error("[Properties Catalog Load Error]:", err);
        return [];
    }
}

// Fetch a single property config document
export async function getActivePropertyConfig(propId) {
    try {
        const targetId = toCanonicalPropId(propId || getActivePropertyId());
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', targetId));
        if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() };
            window.currentPropertyConfig = data;
            return data;
        }
    } catch (err) {
        console.error("[Property Config Load Error]:", err);
    }
    return null;
}

// --------------------------------------------------------------------------
// UNIVERSAL HEADER & PROPERTY PICKER CONTROLLER
// --------------------------------------------------------------------------

// Toggle Property Picker Dropdown attached to Top-Left Brand Logo
export function togglePropertyPicker() {
    const dropdown = document.getElementById('property-picker-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (!isHidden) {
        dropdown.classList.add('hidden');
        return;
    }

    renderPropertyPickerList();
    dropdown.classList.remove('hidden');
}

// Render the list of available properties inside the logo dropdown
export function renderPropertyPickerList() {
    const listContainer = document.getElementById('property-picker-list');
    if (!listContainer) return;

    const props = window.availableProperties || [];
    const curProp = getActivePropertyId();

    if (props.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold">No properties loaded.</div>`;
        return;
    }

    listContainer.innerHTML = props.map(p => {
        const isSelected = p.id === curProp;
        const displayName = p.name || p.id;
        const displayCode = (p.short || p.id).toUpperCase();
        return `
            <button type="button" onclick="window.switchProperty('${p.id}')" class="w-full text-left px-3 py-2 rounded text-xs font-bold uppercase transition-colors flex items-center justify-between cursor-pointer ${
                isSelected ? 'bg-indigo-600 text-white font-black shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }">
                <div class="flex flex-col">
                    <span>${displayName}</span>
                    <span class="text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'} font-mono">${displayCode}</span>
                </div>
                ${isSelected ? '<span class="text-xs font-black">✓</span>' : ''}
            </button>
        `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Switch property and reload the active page with preserved ?p= query
export function switchProperty(targetPropId) {
    const canon = toCanonicalPropId(targetPropId);
    localStorage.setItem('last_prop', canon);
    const url = new URL(window.location.href);
    url.searchParams.set('p', canon);
    window.location.href = url.toString();
}

// Universal app navigation: preserves active property across all frames
export function navigateToApp(appName, event) {
    if (event) event.preventDefault();
    const curProp = getActivePropertyId();
    window.location.href = `${appName}.html?p=${curProp}`;
}

// Mount and initialize the universal navigation on any page
export async function mountUniversalNav(activeApp = '') {
    const curProp = getActivePropertyId();
    window.currentPropertyId = curProp;

    // Highlight the active app pill in header
    if (activeApp) {
        document.querySelectorAll('.nav-app-link').forEach(link => {
            const isMatch = link.dataset.app === activeApp || link.getAttribute('href')?.startsWith(activeApp);
            if (isMatch) {
                link.className = "nav-app-link px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-black uppercase flex items-center gap-1 shadow-2xs";
            } else {
                link.className = "nav-app-link px-2.5 py-1 rounded border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-[11px] font-bold uppercase flex items-center gap-1 transition-colors";
            }
        });
    }

    // Load catalog if empty
    if (!window.availableProperties || window.availableProperties.length === 0) {
        await loadPropertiesCatalog();
    }

    // Resolve active property branding
    const propCfg = await getActivePropertyConfig(curProp);
    if (propCfg) {
        const logoEl = document.getElementById('nav-brand-logo');
        const nameEl = document.getElementById('nav-property-name');
        const codeEl = document.getElementById('nav-property-code');

        if (logoEl && propCfg.iconUrl) logoEl.src = propCfg.iconUrl;
        if (nameEl) nameEl.innerText = propCfg.name || curProp;
        if (codeEl) codeEl.innerText = (propCfg.short || curProp).toUpperCase();
    }

    // Auto-close property dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('property-picker-dropdown');
        const logoBtn = document.getElementById('nav-brand-logo')?.closest('button');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            if (!dropdown.contains(e.target) && (!logoBtn || !logoBtn.contains(e.target))) {
                dropdown.classList.add('hidden');
            }
        }
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.toCanonicalPropId = toCanonicalPropId;
    window.getActivePropertyId = getActivePropertyId;
    window.loadPropertiesCatalog = loadPropertiesCatalog;
    window.getActivePropertyConfig = getActivePropertyConfig;
    window.togglePropertyPicker = togglePropertyPicker;
    window.switchProperty = switchProperty;
    window.navigateToApp = navigateToApp;
    window.mountUniversalNav = mountUniversalNav;
}
