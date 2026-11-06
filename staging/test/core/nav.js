// ==========================================================================
// core/nav.js - Self-Mounting Universal Header & Property Switcher
// Wild & Wandering Property Management System
// ==========================================================================

import { loadPropertiesCatalog, toCanonicalPropId } from './properties.js';

const DEFAULT_BRAND_LOGO = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

export const APP_REGISTRY = [
    { id: 'pms', label: 'PMS', href: 'pms.html', icon: 'layout-grid' },
    { id: 'cm', label: 'CM', href: 'cm.html', icon: 'calendar' },
    { id: 'setup', label: 'Setup', href: 'setup.html', icon: 'settings' },
    { id: 'scan', label: 'Scan', href: 'scan.html', icon: 'scan' },
    { id: 'tm30', label: 'TM30', href: 'tm30.html', icon: 'file-text' }
];

export function getActiveProp() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('p') || localStorage.getItem('last_prop') || '';
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
        container.innerHTML = `<div class="p-3 text-xs text-slate-400 font-bold text-center">Loading properties from database...</div>`;
        return;
    }

    container.innerHTML = list.map(p => {
        const isSel = p.id.toLowerCase() === cur.toLowerCase();
        return `
            <button type="button" onclick="window.switchProperty('${p.id}')" class="w-full text-left px-3 py-2 rounded text-xs font-bold uppercase transition-colors flex items-center justify-between cursor-pointer ${
                isSel ? 'bg-indigo-600 text-white font-black shadow-xs' : 'text-slate-700 hover:bg-slate-100'
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

export function mountNav() {
    const container = document.getElementById('app-nav');
    if (!container) return;

    // Prevent re-mounting if header already exists
    if (container.querySelector('header')) {
        updateNavBrandLogo();
        return;
    }

    const currentApp = container.dataset.app || '';
    const curProp = getActiveProp();
    window.currentPropertyId = curProp;

    // Preserve existing live slot elements and their event listeners
    const centerSlot = document.getElementById('nav-center-slot');
    const rightSlot = document.getElementById('nav-right-slot');

    const header = document.createElement('header');
    header.className = "bg-white px-2 py-1 sm:py-1.5 rounded-none sm:rounded-lg shadow-xs border-b sm:border border-slate-200 mb-1 flex items-center justify-between gap-1.5 shrink-0 z-50 unselectable w-full";

    // 1. Left: Logo-Only Dropdown Trigger
    const leftDiv = document.createElement('div');
    leftDiv.className = "flex items-center gap-2 shrink-0 min-w-0";
    leftDiv.innerHTML = `
        <div class="relative min-w-0">
            <button type="button" onclick="window.togglePropertyPicker()" class="flex items-center hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-none p-0" title="Switch Property">
                <img id="main-brand-logo" src="${DEFAULT_BRAND_LOGO}" alt="Property Logo" class="h-8 sm:h-9 object-contain">
            </button>
            <div id="property-picker-dropdown" class="absolute left-0 top-full mt-2 w-64 bg-white border-2 border-slate-800 rounded-xl shadow-2xl z-[150] hidden overflow-hidden">
                <div class="bg-slate-900 text-white text-[10px] font-black uppercase px-3 py-2 flex justify-between items-center">
                    <span class="flex items-center gap-1.5"><i data-lucide="building-2" size="12" class="text-indigo-400"></i> Switch Property</span>
                    <button type="button" onclick="window.togglePropertyPicker()" class="text-slate-400 hover:text-white cursor-pointer"><i data-lucide="x" size="14"></i></button>
                </div>
                <div id="property-picker-list" class="p-1 space-y-0.5 max-h-64 overflow-y-auto"></div>
            </div>
        </div>
    `;
    header.appendChild(leftDiv);

    // 2. Center: Move the actual center DOM node inside
    if (centerSlot) {
        header.appendChild(centerSlot);
    }

    // 3. Right: Universal App Links + Page Actions Slot
    const rightWrapper = document.createElement('div');
    rightWrapper.className = "flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto";

    const navLinks = document.createElement('nav');
    navLinks.className = "hidden md:flex items-center gap-0.5";
    navLinks.innerHTML = APP_REGISTRY.map(app => {
        const isCur = app.id === currentApp;
        return `
            <a href="${app.href}?p=${curProp}" onclick="window.navigateToApp('${app.id}', event)" class="px-2 py-1 rounded text-[11px] font-black uppercase flex items-center gap-1 transition-colors ${
                isCur ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }">
                <i data-lucide="${app.icon}" class="!w-3 !h-3"></i>
                <span>${app.label}</span>
            </a>
        `;
    }).join('');

    rightWrapper.appendChild(navLinks);
    if (rightSlot) {
        rightWrapper.appendChild(rightSlot);
    }
    header.appendChild(rightWrapper);

    container.appendChild(header);

    // Outside click dismiss
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

    // Background fetch of Firestore property metadata
    loadPropertiesCatalog().then(props => {
        if (Array.isArray(props) && props.length > 0) {
            updateNavBrandLogo();
            const dd = document.getElementById('property-picker-dropdown');
            if (dd && !dd.classList.contains('hidden')) {
                renderPropertyPickerList();
            }
        }
    });
}

function updateNavBrandLogo() {
    const curProp = getActiveProp();
    const props = window.activePropertiesList || [];
    const active = props.find(p => p.id.toLowerCase() === curProp.toLowerCase());
    const logoEl = document.getElementById('main-brand-logo');
    if (logoEl && active) {
        logoEl.src = active.iconUrl || active.logoUrl || DEFAULT_BRAND_LOGO;
    }
}

if (typeof window !== 'undefined') {
    window.switchProperty = switchProperty;
    window.navigateToApp = navigateToApp;
    window.togglePropertyPicker = togglePropertyPicker;
    window.mountNav = mountNav;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNav);
} else {
    mountNav();
}
