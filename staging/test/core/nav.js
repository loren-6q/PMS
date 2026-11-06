// ==========================================================================
// core/nav.js - Self-Mounting Universal Header & Property Switcher
// Wild & Wandering Property Management System
// ==========================================================================

import { loadPropertiesCatalog, toCanonicalPropId, toDisplayPropKey } from './properties.js';

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

export const APP_REGISTRY = [
    { id: 'pms', label: 'PMS', href: 'pms.html', icon: 'layout-grid' },
    { id: 'cm', label: 'CM', href: 'cm.html', icon: 'calendar' },
    { id: 'setup', label: 'Setup', href: 'setup.html', icon: 'settings' },
    { id: 'scan', label: 'Scan', href: 'scan.html', icon: 'scan' },
    { id: 'tm30', label: 'TM30', href: 'tm30.html', icon: 'file-text' }
];

export function getActiveProp() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
    return toCanonicalPropId(raw);
}

export function switchProperty(propId) {
    const target = toCanonicalPropId(propId);
    localStorage.setItem('last_prop', target);
    const url = new URL(window.location.href);
    url.searchParams.set('p', target);
    window.location.href = url.toString();
}

export function navigateToApp(appName, event) {
    if (event) event.preventDefault();
    const cur = getActiveProp();
    window.location.href = `${appName}.html?p=${cur}`;
}

export function togglePropertyPicker() {
    const dd = document.getElementById('property-picker-dropdown');
    if (!dd) return;
    const isHidden = dd.classList.contains('hidden');
    if (isHidden) {
        renderPropertyPickerList();
        dd.classList.remove('hidden');
    } else {
        dd.classList.add('hidden');
    }
}

function renderPropertyPickerList() {
    const container = document.getElementById('property-picker-list');
    if (!container) return;

    const list = window.activePropertiesList || [];
    const cur = getActiveProp();

    if (list.length === 0) {
        container.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold">No properties loaded.</div>`;
        return;
    }

    container.innerHTML = list.map(p => {
        const isSel = p.id.toLowerCase() === cur.toLowerCase();
        return `
            <button type="button" onclick="window.switchProperty('${p.id}')" class="w-full text-left px-3 py-2 rounded text-xs font-bold uppercase transition-colors flex items-center justify-between cursor-pointer ${
                isSel ? 'bg-indigo-600 text-white font-black shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }">
                <div class="flex flex-col">
                    <span>${p.name || p.id}</span>
                    <span class="text-[9px] ${isSel ? 'text-indigo-200' : 'text-slate-400'} font-mono">${(p.short || p.id).toUpperCase()}</span>
                </div>
                ${isSel ? '<span class="text-xs font-black">✓</span>' : ''}
            </button>
        `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export async function mountNav() {
    const container = document.getElementById('app-nav');
    if (!container) return;

    const currentApp = container.dataset.app || '';
    const curPropId = getActiveProp();
    window.currentPropertyId = curPropId;

    // Load property list from Firestore
    if (!window.activePropertiesList || window.activePropertiesList.length === 0) {
        await loadPropertiesCatalog();
    }

    const propList = window.activePropertiesList || [];
    const activeProp = propList.find(p => p.id.toLowerCase() === curPropId.toLowerCase()) || propList[0] || {
        id: curPropId,
        name: curPropId,
        short: curPropId.toUpperCase(),
        iconUrl: DEFAULT_WW_ICON
    };

    window.currentPropertyConfig = activeProp;

    const logoSrc = activeProp.iconUrl || activeProp.logoUrl || DEFAULT_WW_ICON;
    const propName = activeProp.name || curPropId;
    const propShort = (activeProp.short || toDisplayPropKey(curPropId)).toUpperCase();

    // Preserve any existing slot content defined in HTML
    const centerSlot = document.getElementById('nav-center-slot');
    const rightSlot = document.getElementById('nav-right-slot');
    const centerHtml = centerSlot ? centerSlot.innerHTML : '';
    const rightHtml = rightSlot ? rightSlot.innerHTML : '';

    container.innerHTML = `
        <header class="bg-white px-2 py-1 sm:py-1.5 rounded-none sm:rounded-lg shadow-xs border-b sm:border border-slate-200 mb-1 flex items-center justify-between gap-1.5 shrink-0 z-50 unselectable w-full">
            <!-- LEFT: Brand Logo & Property Dropdown Picker -->
            <div class="flex items-center gap-2 shrink-0 min-w-0">
                <div class="relative min-w-0">
                    <button type="button" onclick="window.togglePropertyPicker()" class="flex items-center gap-1.5 hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-none p-0" title="Switch Property">
                        <img id="main-brand-logo" src="${logoSrc}" alt="Property Logo" class="h-8 sm:h-9 object-contain">
                        <div class="text-left hidden sm:block">
                            <div class="flex items-center gap-1 leading-tight">
                                <span id="nav-prop-name" class="text-xs font-black text-slate-900 uppercase truncate max-w-[130px]">${propName}</span>
                                <i data-lucide="chevron-down" class="!w-3 !h-3 text-slate-400"></i>
                            </div>
                            <span id="nav-prop-code" class="text-[9px] font-mono font-bold text-slate-400 tracking-wider">${propShort}</span>
                        </div>
                    </button>

                    <!-- Property Picker Dropdown -->
                    <div id="property-picker-dropdown" class="absolute left-0 top-full mt-2 w-64 bg-white border-2 border-slate-800 rounded-xl shadow-2xl z-[150] hidden overflow-hidden">
                        <div class="bg-slate-900 text-white text-[10px] font-black uppercase px-3 py-2 flex justify-between items-center">
                            <span class="flex items-center gap-1.5"><i data-lucide="building-2" size="12" class="text-indigo-400"></i> Switch Property</span>
                            <button type="button" onclick="window.togglePropertyPicker()" class="text-slate-400 hover:text-white cursor-pointer"><i data-lucide="x" size="14"></i></button>
                        </div>
                        <div id="property-picker-list" class="p-1 space-y-0.5 max-h-64 overflow-y-auto"></div>
                    </div>
                </div>
            </div>

            <!-- CENTER: App Context Tools (Slot) -->
            <div id="nav-center-slot" class="flex items-center gap-1 shrink-1 min-w-0">
                ${centerHtml}
            </div>

            <!-- RIGHT: Universal App Links & Actions (Slot) -->
            <div class="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                <nav class="hidden md:flex items-center gap-0.5">
                    ${APP_REGISTRY.map(app => {
                        const isCur = app.id === currentApp;
                        return `
                            <a href="${app.href}?p=${curPropId}" onclick="window.navigateToApp('${app.id}', event)" class="px-2 py-1 rounded text-[11px] font-black uppercase flex items-center gap-1 transition-colors ${
                                isCur ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                            }">
                                <i data-lucide="${app.icon}" class="!w-3 !h-3"></i>
                                <span>${app.label}</span>
                            </a>
                        `;
                    }).join('')}
                </nav>

                <div id="nav-right-slot" class="flex items-center gap-1">
                    ${rightHtml}
                </div>
            </div>
        </header>
    `;

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const dd = document.getElementById('property-picker-dropdown');
        const logoBtn = document.getElementById('main-brand-logo')?.closest('button');
        if (dd && !dd.classList.contains('hidden')) {
            if (!dd.contains(e.target) && (!logoBtn || !logoBtn.contains(e.target))) {
                dd.classList.add('hidden');
            }
        }
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Global window bridges
if (typeof window !== 'undefined') {
    window.switchProperty = switchProperty;
    window.navigateToApp = navigateToApp;
    window.togglePropertyPicker = togglePropertyPicker;
    window.mountNav = mountNav;
}

// Self-mounting on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNav);
} else {
    mountNav();
}
