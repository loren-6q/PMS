// ==========================================================================
// core/nav.js - Self-Mounting Universal Header, Admin Lock & Split Screen
// Wild & Wandering Property Management System
// ==========================================================================

import { loadPropertiesCatalog, getActivePropertyId, switchProperty } from './properties.js';

const DEFAULT_BRAND_LOGO = "../gfx/WWicon.png";

// --- Resolve Root Asset Path Relative to Current Subdirectory ---
function resolveRootAsset(url, fallback = DEFAULT_BRAND_LOGO) {
    const raw = (url && String(url).trim()) ? String(url).trim() : fallback;
    const isSubdir = /\/(V[1-4]|LIVE)\//i.test(window.location.pathname);
    if (isSubdir && /^(gfx|pics)\//i.test(raw)) {
        return `../${raw}`;
    }
    return raw;
}

// --- Apply Active Property Favicon ---
export function applyPropertyFavicon(iconUrl) {
    const href = resolveRootAsset(iconUrl, DEFAULT_BRAND_LOGO);
    let iconLink = document.querySelector("link[rel='icon']");
    if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
    }
    iconLink.href = href;

    let appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
        appleLink = document.createElement('link');
        appleLink.rel = 'apple-touch-icon';
        document.head.appendChild(appleLink);
    }
    appleLink.href = href;
}

// --- Navigate Between Apps Preserving Active Property ---
export function navigateToApp(appName, event) {
    const curProp = getActivePropertyId();
    const targetUrl = `${appName}.html?p=${curProp}`;
    if (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
        if (event.altKey) {
            event.preventDefault();
            window.open(targetUrl, '_blank');
            return;
        }
        event.preventDefault();
    }
    window.location.href = targetUrl;
}

// --- Toggle Property Switcher Dropdown ---
export function togglePropertyPicker() {
    const dropdown = document.getElementById('property-picker-dropdown');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        renderPropertyPickerList();
        dropdown.classList.remove('hidden');
    } else {
        dropdown.classList.add('hidden');
    }
}

// --- Toggle Admin Menu or Prompt for Password ---
export function toggleAdminMenu() {
    const isUnlocked = sessionStorage.getItem('ww_admin_unlocked') === 'true';
    if (!isUnlocked) {
        const pass = prompt("Enter Admin Password:");
        const props = window.availableProperties || [];
        const curProp = getActivePropertyId();
        const activeCfg = window.currentPropertyConfig || props.find(p => p.id.toLowerCase() === curProp.toLowerCase()) || {};
        const validPass = activeCfg.adminPassword || 'admin123';

        if (pass === validPass) {
            sessionStorage.setItem('ww_admin_unlocked', 'true');
            renderAdminMenu();
            const menu = document.getElementById('admin-dropdown-menu');
            if (menu) menu.classList.remove('hidden');
        } else if (pass !== null) {
            alert("Incorrect password.");
        }
        return;
    }
    const menu = document.getElementById('admin-dropdown-menu');
    if (menu) menu.classList.toggle('hidden');
}

// --- Lock Admin Session & Return to Front Desk if Needed ---
export function lockAdmin() {
    sessionStorage.removeItem('ww_admin_unlocked');
    closeSplitScreen();
    renderAdminMenu();
    if (/\/(cm|accounting|setup)\.html/i.test(window.location.pathname)) {
        window.location.href = `pms.html?p=${getActivePropertyId()}`;
    }
}

// --- Open Side-by-Side Split Screen Overlay Inside Current Window ---
export function openSplitScreen(leftApp = 'cm', rightApp = 'pms') {
    const menu = document.getElementById('admin-dropdown-menu');
    if (menu) menu.classList.add('hidden');

    let overlay = document.getElementById('ww-split-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ww-split-overlay';
        overlay.className = 'fixed inset-0 z-[9000] bg-slate-900 flex flex-col';
        document.body.appendChild(overlay);
    }

    const curProp = getActivePropertyId();
    const options = [
        { val: 'cm', label: 'Channel Manager' },
        { val: 'pms', label: 'Front Desk PMS' },
        { val: 'accounting', label: 'Accounting' },
        { val: 'setup', label: 'Setup' }
    ];

    const buildOpts = (sel) => options.map(o => `<option value="${o.val}" ${o.val === sel ? 'selected' : ''}>${o.label}</option>`).join('');

    overlay.innerHTML = `
        <div class="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between border-b border-slate-700 text-xs shrink-0">
            <div class="flex items-center gap-2">
                <span class="font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1"><i data-lucide="columns-2" class="!w-3.5 !h-3.5"></i> Split Workspace</span>
                <select onchange="document.getElementById('split-frame-left').src = this.value + '.html?p=${curProp}'" class="bg-slate-800 text-white border border-slate-600 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase cursor-pointer">
                    ${buildOpts(leftApp)}
                </select>
                <span class="text-slate-500 font-black">|</span>
                <select onchange="document.getElementById('split-frame-right').src = this.value + '.html?p=${curProp}'" class="bg-slate-800 text-white border border-slate-600 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase cursor-pointer">
                    ${buildOpts(rightApp)}
                </select>
            </div>
            <button type="button" onclick="window.closeSplitScreen()" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-black text-[10px] uppercase cursor-pointer flex items-center gap-1">
                <i data-lucide="x" class="!w-3 !h-3"></i> Exit Split
            </button>
        </div>
        <div class="flex-1 flex min-h-0">
            <iframe id="split-frame-left" src="${leftApp}.html?p=${curProp}" class="w-1/2 h-full border-r-2 border-slate-800 bg-white"></iframe>
            <iframe id="split-frame-right" src="${rightApp}.html?p=${curProp}" class="w-1/2 h-full bg-white"></iframe>
        </div>
    `;
    overlay.classList.remove('hidden');
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

// --- Close Split Screen Overlay ---
export function closeSplitScreen() {
    const overlay = document.getElementById('ww-split-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// --- Render Admin Button / Dropdown ---
function renderAdminMenu() {
    const container = document.getElementById('nav-admin-wrapper');
    if (!container) return;
    const isUnlocked = sessionStorage.getItem('ww_admin_unlocked') === 'true';
    const curProp = getActivePropertyId();

    if (isUnlocked) {
        container.innerHTML = `
            <button type="button" onclick="window.toggleAdminMenu()" class="px-2 py-1 rounded text-[11px] font-black uppercase flex items-center gap-1 transition-colors bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs cursor-pointer">
                <i data-lucide="shield-check" class="!w-3 !h-3"></i> Admin ▾
            </button>
            <div id="admin-dropdown-menu" class="absolute right-0 top-full mt-1.5 w-44 bg-white border-2 border-slate-800 rounded-lg shadow-xl z-[150] hidden overflow-hidden flex flex-col">
                <a href="cm.html?p=${curProp}" class="px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 border-b border-slate-100 flex items-center gap-2"><i data-lucide="calendar" class="!w-3.5 !h-3.5 text-indigo-600"></i> Chan. Mgr</a>
                <a href="accounting.html?p=${curProp}" class="px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 border-b border-slate-100 flex items-center gap-2"><i data-lucide="bar-chart-3" class="!w-3.5 !h-3.5 text-emerald-600"></i> Accounting</a>
                <a href="setup.html?p=${curProp}" class="px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 border-b border-slate-100 flex items-center gap-2"><i data-lucide="settings" class="!w-3.5 !h-3.5 text-slate-600"></i> Setup</a>
                <button type="button" onclick="window.openSplitScreen('cm', 'pms')" class="px-3 py-2 text-xs font-black uppercase text-indigo-700 hover:bg-indigo-50 border-b border-slate-100 text-left flex items-center gap-2 cursor-pointer"><i data-lucide="columns-2" class="!w-3.5 !h-3.5"></i> Split Screen</button>
                <button type="button" onclick="window.lockAdmin()" class="px-3 py-2 text-xs font-black uppercase text-rose-600 hover:bg-rose-50 text-left flex items-center gap-2 cursor-pointer"><i data-lucide="lock" class="!w-3.5 !h-3.5"></i> Lock</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button type="button" onclick="window.toggleAdminMenu()" class="px-2 py-1 rounded text-[11px] font-black uppercase flex items-center gap-1 transition-colors text-slate-500 hover:bg-slate-100 border border-transparent cursor-pointer">
                <i data-lucide="shield" class="!w-3 !h-3"></i> Admin
            </button>
        `;
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

// --- Render Property Switcher List ---
export function renderPropertyPickerList() {
    const container = document.getElementById('property-picker-list');
    if (!container) return;

    const props = window.availableProperties || [];
    const curProp = getActivePropertyId();

    if (props.length === 0) {
        container.innerHTML = `<div class="p-3 text-xs text-slate-400 font-bold text-center">Loading properties from database...</div>`;
        return;
    }

    container.innerHTML = props.map(p => {
        const isSel = p.id.toLowerCase() === curProp.toLowerCase();
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

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

// --- Mount Universal Header ---
export function mountNav() {
    const container = document.getElementById('app-nav');
    if (!container) return;

    if (container.querySelector('header')) {
        updateNavBrandLogo();
        return;
    }

    // Hide header automatically if rendered inside Split Screen iframe
    if (window.self !== window.top && new URLSearchParams(window.location.search).get('split') === '1') {
        container.style.display = 'none';
        return;
    }

    const currentApp = container.dataset.app || '';
    const curProp = getActivePropertyId();
    window.currentPropertyId = curProp;

    const centerSlot = document.getElementById('nav-center-slot');
    const rightSlot = document.getElementById('nav-right-slot');

    const header = document.createElement('header');
    header.className = "bg-white px-2 py-1 sm:py-1.5 rounded-none sm:rounded-lg shadow-xs border-b sm:border border-slate-200 mb-1 flex items-center justify-between gap-1.5 shrink-0 z-50 unselectable w-full";

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

    if (centerSlot) header.appendChild(centerSlot);

    const rightWrapper = document.createElement('div');
    rightWrapper.className = "flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto";

    const navLinks = document.createElement('nav');
    navLinks.className = "hidden md:flex items-center gap-0.5";

    const isPms = currentApp === 'pms';
    navLinks.innerHTML = `
        <a href="pms.html?p=${curProp}" onclick="window.navigateToApp('pms', event)" class="px-2 py-1 rounded text-[11px] font-black uppercase flex items-center gap-1 transition-colors ${isPms ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 border border-transparent'}">
            <i data-lucide="layout-grid" class="!w-3 !h-3"></i> PMS
        </a>
        <div class="flex items-center bg-slate-100 rounded border border-slate-200 p-0.5 mx-0.5">
            <a href="scan.html?p=${curProp}" onclick="window.navigateToApp('scan', event)" class="px-1.5 py-0.5 rounded text-[11px] font-black uppercase flex items-center text-slate-600 hover:text-slate-900 hover:bg-white transition-colors" title="Passport Scanner">
                <i data-lucide="camera" class="!w-3.5 !h-3.5"></i>
            </a>
            <div class="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
            <a href="tm30.html?p=${curProp}" onclick="window.navigateToApp('tm30', event)" class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase text-slate-600 hover:text-slate-900 hover:bg-white transition-colors" title="TM30 Immigration">
                TM30
            </a>
        </div>
        <div id="nav-admin-wrapper" class="relative"></div>
    `;

    rightWrapper.appendChild(navLinks);
    if (rightSlot) rightWrapper.appendChild(rightSlot);
    header.appendChild(rightWrapper);

    container.appendChild(header);

    document.addEventListener('click', (e) => {
        const dd = document.getElementById('property-picker-dropdown');
        const logoBtn = document.getElementById('main-brand-logo')?.closest('button');
        if (dd && !dd.classList.contains('hidden')) {
            if (!dd.contains(e.target) && (!logoBtn || !logoBtn.contains(e.target))) dd.classList.add('hidden');
        }
        const aMenu = document.getElementById('admin-dropdown-menu');
        const aBtn = document.getElementById('nav-admin-wrapper');
        if (aMenu && !aMenu.classList.contains('hidden')) {
            if (!aMenu.contains(e.target) && (!aBtn || !aBtn.contains(e.target))) aMenu.classList.add('hidden');
        }
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();

    loadPropertiesCatalog().then(props => {
        if (Array.isArray(props) && props.length > 0) {
            window.availableProperties = props;
            updateNavBrandLogo();
            const dd = document.getElementById('property-picker-dropdown');
            if (dd && !dd.classList.contains('hidden')) renderPropertyPickerList();
        }
        renderAdminMenu();
    });
}

function updateNavBrandLogo() {
    const curProp = getActivePropertyId();
    const props = window.availableProperties || [];
    const active = props.find(p => p.id.toLowerCase() === curProp.toLowerCase());
    const activeIcon = resolveRootAsset(active?.iconUrl || active?.logoUrl, DEFAULT_BRAND_LOGO);
    const logoEl = document.getElementById('main-brand-logo');
    if (logoEl) logoEl.src = activeIcon;
    applyPropertyFavicon(activeIcon);
}

if (typeof window !== 'undefined') {
    window.navigateToApp = navigateToApp;
    window.togglePropertyPicker = togglePropertyPicker;
    window.renderPropertyPickerList = renderPropertyPickerList;
    window.switchProperty = switchProperty;
    window.applyPropertyFavicon = applyPropertyFavicon;
    window.mountNav = mountNav;
    window.toggleAdminMenu = toggleAdminMenu;
    window.lockAdmin = lockAdmin;
    window.openSplitScreen = openSplitScreen;
    window.closeSplitScreen = closeSplitScreen;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNav);
} else {
    mountNav();
}
