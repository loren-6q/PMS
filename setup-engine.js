// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// Wild & Wandering Property Management System
// Hosted at: https://loren-6q.github.io/PMS/setup-engine.js
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- SECTION 1: GLOBAL SCOPE & STEPPER MOUNTING ---

window.currentStep = 1;
window.jumpStep = function(step) {
    window.currentStep = Math.max(1, Math.min(5, parseInt(step, 10) || 1));
    for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById('pill-step-' + i);
        const badge = document.getElementById('badge-step-' + i);
        const sec = document.getElementById('step-content-' + i);
        if (pill) {
            pill.classList.toggle('active', i === window.currentStep);
            pill.classList.toggle('completed', i < window.currentStep);
        }
        if (badge) {
            if (i === window.currentStep) badge.className = "w-5 h-5 rounded bg-white text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs";
            else if (i < window.currentStep) badge.className = "w-5 h-5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px] flex items-center justify-center shrink-0 border border-emerald-300";
            else badge.className = "w-5 h-5 rounded bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0 border border-slate-200";
        }
        if (sec) sec.classList.toggle('hidden', i !== window.currentStep);
    }
    const ind = document.getElementById('wizard-step-indicator');
    if (ind) ind.innerText = `Step ${window.currentStep} of 5`;
    const prevBtn = document.getElementById('btn-prev-step');
    if (prevBtn) prevBtn.disabled = (window.currentStep === 1);
    if (window.currentStep === 5 && typeof window.updateStep5Review === 'function') {
        window.updateStep5Review();
    }
    if (window.lucide) window.lucide.createIcons();
};

window.nextStep = function() { if (window.currentStep < 5) window.jumpStep(window.currentStep + 1); };
window.prevStep = function() { if (window.currentStep > 1) window.jumpStep(window.currentStep - 1); };

// Card collapse toggle
window.toggleCardSection = function(contentId, chevronId) {
    const el = document.getElementById(contentId);
    const ch = document.getElementById(chevronId);
    if (!el) return;
    const isHidden = el.classList.contains('hidden') || el.style.display === 'none';
    if (isHidden) {
        el.classList.remove('hidden');
        el.style.display = '';
        if (ch) ch.style.transform = 'rotate(0deg)';
    } else {
        el.classList.add('hidden');
        el.style.display = 'none';
        if (ch) ch.style.transform = 'rotate(-90deg)';
    }
};

// --- SECTION 2: FIREBASE & STATE INITIALIZATION ---

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

window.db = db;
window.auth = auth;

// Working Memory State
window.currentPropertyId = 'swims_resort';
window.currentPropertyConfig = {};
window.availableProperties = [];
window.roomDefinitions = [];
window.compiledRooms = [];
window.addonsList = [];
window.paymentMethods = [];
window.channexConfig = { apiKey: '', propId: '', rateMultiplier: 100 };
window.channexRooms = [];
window.channexRatePlans = [];
window.channexMap = [];
window.channexRateMap = [];
window.pricingRules = {
    masterDriver: 'Direct',
    channels: {},
    stdRefType: '+%',
    stdRefVal: 25,
    evtRefType: '+%',
    evtRefVal: 25
};
window.relationships = [];
window.eventDates = [];
window.eventCurves = {
    ratesSpan: '±2',
    restrSpan: '±6',
    rates: {},
    restr: {}
};

// --- SECTION 3: STEP 1 (GENERAL, LOGOS, PAYMENTS, ADD-ONS) ---

const DEFAULT_PAYMENT_METHODS = [
    { key: "cash", label: "Cash (THB)", type: "revenue", enabled: true },
    { key: "scan", label: "Thai QR Scan / PromptPay", type: "revenue", enabled: true },
    { key: "card", label: "Credit / Debit Card Terminal", type: "revenue", enabled: true },
    { key: "otapay", label: "OTA Virtual Card Payout", type: "revenue", enabled: true },
    { key: "bdc-kp", label: "Booking.com Commission (KP)", type: "commission", enabled: true },
    { key: "hw-kp", label: "Hostelworld Deposit Commission (KP)", type: "commission", enabled: true },
    { key: "agoda-kp", label: "Agoda Commission (KP)", type: "commission", enabled: true },
    { key: "expedia-kp", label: "Expedia Commission (KP)", type: "commission", enabled: true }
];

const DEFAULT_ADDONS = [
    { name: "Ferry Ticket (Koh Phangan / Tao)", cat: "Transfers", price: 400, type: "per_person" },
    { name: "Van Transfer (Pier / Airport)", cat: "Transfers", price: 300, type: "per_booking" },
    { name: "Scooter Rental (24h)", cat: "Rentals", price: 250, type: "per_day" },
    { name: "Laundry Service (Per KG)", cat: "Services", price: 60, type: "per_unit" },
    { name: "Key / Towel Security Deposit", cat: "Deposits", price: 200, type: "deposit" }
];

window.updateLogoPreview = function(type, url) {
    const previewId = type === 'primary' ? 'preview-logo-primary' : (type === 'banner' ? 'preview-logo-banner' : 'preview-logo-icon');
    const el = document.getElementById(previewId);
    if (el) el.src = url || 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
};

window.handleLogoFileUpload = function(e, type) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const dataUrl = evt.target.result;
        const inputId = type === 'primary' ? 'prop-logo-url' : (type === 'banner' ? 'prop-banner-url' : 'prop-icon-url');
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.value = dataUrl;
        window.updateLogoPreview(type, dataUrl);
    };
    reader.readAsDataURL(file);
};

window.resetLogosToDefault = function() {
    const defaultIcon = 'https://loren-6q.github.io/PMS/gfx/WWicon.png';
    ['prop-logo-url', 'prop-banner-url', 'prop-icon-url'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = defaultIcon;
    });
    window.updateLogoPreview('primary', defaultIcon);
    window.updateLogoPreview('banner', defaultIcon);
    window.updateLogoPreview('icon', defaultIcon);
};

window.renderPaymentMethodsTable = function() {
    const tbody = document.getElementById('payment-methods-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.paymentMethods.forEach((pm, idx) => {
        const isComm = pm.type === 'commission';
        const tr = document.createElement('tr');
        tr.className = isComm ? 'bg-rose-50/50 hover:bg-rose-50' : 'bg-white hover:bg-slate-50';
        tr.innerHTML = `
            <td class="font-mono font-black text-slate-700 text-[10px]">${pm.key}</td>
            <td>
                <input type="text" value="${pm.label || ''}" class="table-input" onchange="window.paymentMethods[${idx}].label = this.value">
            </td>
            <td>
                <select class="table-input" onchange="window.paymentMethods[${idx}].type = this.value; window.renderPaymentMethodsTable();">
                    <option value="revenue" ${pm.type === 'revenue' ? 'selected' : ''}>Revenue (Real Money)</option>
                    <option value="commission" ${pm.type === 'commission' ? 'selected' : ''}>Commission Withheld (KP)</option>
                    <option value="other" ${pm.type === 'other' ? 'selected' : ''}>Internal Other</option>
                </select>
            </td>
            <td class="text-center">
                <input type="checkbox" ${pm.enabled !== false ? 'checked' : ''} onchange="window.paymentMethods[${idx}].enabled = this.checked" class="cursor-pointer">
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderAddonsTable = function() {
    const tbody = document.getElementById('addon-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.addonsList.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-amber-50/40 transition-colors';
        tr.innerHTML = `
            <td class="text-center">
                <div class="order-btn-col">
                    <button type="button" onclick="window.shiftAddonOrder(${idx}, -1)" class="order-arrow-btn text-slate-500 hover:text-indigo-600 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : ''}" ${idx === 0 ? 'disabled' : ''}>
                        <i data-lucide="chevron-up"></i>
                    </button>
                    <button type="button" onclick="window.shiftAddonOrder(${idx}, 1)" class="order-arrow-btn text-slate-500 hover:text-indigo-600 ${idx === window.addonsList.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}" ${idx === window.addonsList.length - 1 ? 'disabled' : ''}>
                        <i data-lucide="chevron-down"></i>
                    </button>
                </div>
            </td>
            <td><input type="text" value="${item.name || ''}" class="table-input font-bold" onchange="window.addonsList[${idx}].name = this.value"></td>
            <td><input type="text" value="${item.cat || ''}" class="table-input" onchange="window.addonsList[${idx}].cat = this.value"></td>
            <td class="text-center"><input type="number" value="${item.price || 0}" class="table-input text-center font-black" onchange="window.addonsList[${idx}].price = parseFloat(this.value) || 0"></td>
            <td>
                <select class="table-input font-bold" onchange="window.addonsList[${idx}].type = this.value">
                    <option value="per_unit" ${item.type === 'per_unit' ? 'selected' : ''}>Per Unit</option>
                    <option value="per_person" ${item.type === 'per_person' ? 'selected' : ''}>Per Person</option>
                    <option value="per_day" ${item.type === 'per_day' ? 'selected' : ''}>Per Day</option>
                    <option value="per_booking" ${item.type === 'per_booking' ? 'selected' : ''}>Per Stay</option>
                    <option value="deposit" ${item.type === 'deposit' ? 'selected' : ''}>Refundable Deposit</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.deleteAddonRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.shiftAddonOrder = function(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= window.addonsList.length) return;
    const item = window.addonsList.splice(index, 1)[0];
    window.addonsList.splice(target, 0, item);
    window.renderAddonsTable();
};

window.addBlankAddonRow = function() {
    window.addonsList.push({ name: "New Addon", cat: "General", price: 100, type: "per_unit" });
    window.renderAddonsTable();
};

window.deleteAddonRow = function(idx) {
    window.addonsList.splice(idx, 1);
    window.renderAddonsTable();
};

// --- SECTION 4: STEP 2 (ROOM INVENTORY & COMPILER) ---

window.compileRoomsFromDefinitions = function() {
    const compiled = [];
    const usedIds = new Set();

    window.roomDefinitions.forEach(def => {
        const rawName = (def.name || 'Room').trim().toUpperCase();
        const cat = (def.category || 'Standard Room').trim();
        const rule = def.rule || 'private';
        const floor = def.floor || '1';
        const total = Math.max(1, parseInt(def.beds || def.units || 1, 10));

        if (rule === 'private') {
            let roomId = rawName;
            let counter = 1;
            while (usedIds.has(roomId)) {
                roomId = `${rawName}_${counter++}`;
            }
            usedIds.add(roomId);

            compiled.push({
                id: roomId,
                name: rawName,
                type: cat,
                category: cat,
                floor: floor,
                bed: 'private',
                bunk: 'private',
                rule: 'private',
                parentRoom: rawName,
                isDorm: false
            });
        } else {
            // Dorm rooms: strict sequential bed numbering (1..total)
            for (let b = 1; b <= total; b++) {
                const bedId = `${rawName}-${b}`;
                usedIds.add(bedId);

                let bunkType = 'single';
                if (rule === 'odd-top') bunkType = (b % 2 !== 0) ? 'top' : 'bottom';
                else if (rule === 'even-top') bunkType = (b % 2 === 0) ? 'top' : 'bottom';

                compiled.push({
                    id: bedId,
                    name: `${rawName} Bed ${b}`,
                    type: cat,
                    category: cat,
                    floor: floor,
                    bed: bunkType,
                    bunk: bunkType,
                    icon: bunkType === 'top' ? 'top' : (bunkType === 'bottom' ? 'bot' : 'single'),
                    rule: rule,
                    parentRoom: rawName,
                    isDorm: true
                });
            }
        }
    });

    window.compiledRooms = compiled;

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.innerText = `${window.roomDefinitions.length} Rooms`;
    if (uBadge) uBadge.innerText = `${compiled.length} Beds Total`;

    window.renderBedPreviewDrawer();
};

window.renderRoomDefinitionsTable = function() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const datalist = document.getElementById('setup-category-datalist');
    const distinctCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    if (datalist) {
        datalist.innerHTML = distinctCategories.map(c => `<option value="${c}"></option>`).join('');
    }

    let lastCategory = null;
    let privateThemeCounter = 0;
    const categoryThemeMap = {};

    window.roomDefinitions.forEach((room, idx) => {
        const curCat = room.category || 'Standard Room';
        const isDorm = room.rule && room.rule !== 'private';

        // When category changes, render universal theme divider banner
        if (curCat !== lastCategory) {
            lastCategory = curCat;
            if (!categoryThemeMap[curCat]) {
                if (isDorm) {
                    categoryThemeMap[curCat] = { bannerClass: 'setup-cat-banner-dorm', rowClass: 'setup-row-dorm', isDorm: true };
                } else {
                    const themeIdx = privateThemeCounter % 6;
                    categoryThemeMap[curCat] = { bannerClass: `setup-cat-banner-${themeIdx}`, rowClass: `setup-row-${themeIdx}`, isDorm: false };
                    privateThemeCounter++;
                }
            }

            const catTheme = categoryThemeMap[curCat];
            const matchingRooms = window.roomDefinitions.filter(r => r.category === curCat);
            const catRooms = matchingRooms.length;
            const catBeds = matchingRooms.reduce((sum, r) => sum + Math.max(1, parseInt(r.beds || r.units || 1, 10)), 0);

            const divTr = document.createElement('tr');
            divTr.className = 'border-t-2 border-b border-slate-300';
            divTr.innerHTML = `
                <td colspan="7" class="py-1 px-2 !h-[26px]">
                    <div class="flex items-center justify-between px-2 py-0.5 rounded border shadow-2xs ${catTheme.bannerClass}">
                        <div class="flex items-center gap-1.5">
                            <i data-lucide="${catTheme.isDorm ? 'bed-double' : 'door-closed'}" size="13"></i>
                            <span class="font-black uppercase tracking-wider text-[11px]">${curCat}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="px-1.5 py-0.2 rounded bg-white/80 border border-black/10 font-black text-[9.5px]">
                                ${catRooms} Rooms • ${catBeds} Beds
                            </span>
                            <span class="px-1.5 py-0.2 rounded bg-white/80 border border-black/10 font-bold text-[9px] uppercase">
                                ${catTheme.isDorm ? 'DORM INVENTORY' : 'PRIVATE UNITS'}
                            </span>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(divTr);
        }

        const catTheme = categoryThemeMap[curCat] || { rowClass: 'bg-white' };
        const tr = document.createElement('tr');
        tr.className = `${catTheme.rowClass} hover:brightness-95 transition-all`;
        tr.innerHTML = `
            <td class="text-center font-mono font-bold text-slate-400 text-[10px]">${idx + 1}</td>
            <td>
                <input type="text" value="${room.name || ''}" class="table-input font-bold" onchange="window.updateRoomDef(${idx}, 'name', this.value)">
            </td>
            <td>
                <input type="text" list="setup-category-datalist" value="${curCat}" class="table-input font-bold" onchange="window.handleRoomCategoryChange(${idx}, this.value)">
            </td>
            <td class="text-center">
                <input type="number" min="1" max="60" value="${room.beds || room.units || 1}" class="table-input text-center font-black" onchange="window.updateRoomDef(${idx}, 'beds', parseInt(this.value, 10) || 1)">
            </td>
            <td class="text-center">
                <input type="text" value="${room.floor || '1'}" class="table-input text-center font-bold" onchange="window.updateRoomDef(${idx}, 'floor', this.value)">
            </td>
            <td>
                <select class="table-input font-bold" onchange="window.updateRoomDef(${idx}, 'rule', this.value)">
                    <option value="private" ${room.rule === 'private' ? 'selected' : ''}>PRIVATE</option>
                    <option value="odd-top" ${room.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="even-top" ${room.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="single" ${room.rule === 'single' ? 'selected' : ''}>DORM (Single Beds)</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.deleteRoomDef(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
    window.compileRoomsFromDefinitions();
};

window.handleRoomCategoryChange = function(index, newCategory) {
    if (!window.roomDefinitions[index]) return;
    window.roomDefinitions[index].category = newCategory.trim();

    // Re-group array so all rooms in the same category cluster together
    const grouped = {};
    const categoryOrder = [];

    window.roomDefinitions.forEach(r => {
        const cat = r.category || 'Standard Room';
        if (!grouped[cat]) {
            grouped[cat] = [];
            categoryOrder.push(cat);
        }
        grouped[cat].push(r);
    });

    const regrouped = [];
    categoryOrder.forEach(cat => regrouped.push(...grouped[cat]));
    window.roomDefinitions = regrouped;

    window.renderRoomDefinitionsTable();
};

window.updateRoomDef = function(index, field, value) {
    if (!window.roomDefinitions[index]) return;
    window.roomDefinitions[index][field] = value;
    if (field === 'beds' || field === 'units' || field === 'rule') {
        window.compileRoomsFromDefinitions();
    }
};

window.deleteRoomDef = function(index) {
    window.roomDefinitions.splice(index, 1);
    window.renderRoomDefinitionsTable();
};

window.addBlankRoomDef = function() {
    window.roomDefinitions.push({
        name: `ROOM ${window.roomDefinitions.length + 1}`,
        category: "Standard Room",
        units: 1,
        beds: 1,
        floor: "1",
        rule: "private"
    });
    window.renderRoomDefinitionsTable();
};

window.clearAllRoomDefs = function() {
    window.customAlert("Clear Inventory", "Are you sure you want to clear all room definitions?", true, () => {
        window.roomDefinitions = [];
        window.renderRoomDefinitionsTable();
    });
};

// Batch Generators
window.toggleBatchDormPanel = function(force) {
    const el = document.getElementById('batch-dorm-panel');
    if (!el) return;
    el.classList.toggle('hidden', force !== undefined ? !force : !el.classList.contains('hidden'));
};

window.toggleBatchRoomPanel = function(force) {
    const el = document.getElementById('batch-room-panel');
    if (!el) return;
    el.classList.toggle('hidden', force !== undefined ? !force : !el.classList.contains('hidden'));
};

window.executeBatchDormGenerate = function() {
    const name = document.getElementById('gen-dorm-name')?.value.trim() || 'DORM A';
    const cat = document.getElementById('gen-dorm-cat')?.value.trim() || 'Standard 6-Bed Dorm';
    const beds = parseInt(document.getElementById('gen-dorm-beds')?.value, 10) || 6;
    const floor = document.getElementById('gen-dorm-floor')?.value.trim() || '1';
    const rule = document.getElementById('gen-dorm-rule')?.value || 'odd-top';

    window.roomDefinitions.push({ name, category: cat, units: beds, beds, floor, rule });
    window.toggleBatchDormPanel(false);
    window.renderRoomDefinitionsTable();
};

window.executeBatchRoomGenerate = function() {
    const prefix = document.getElementById('gen-room-prefix')?.value.trim() || 'ROOM ';
    const cat = document.getElementById('gen-room-cat')?.value.trim() || 'Deluxe King Room';
    const start = parseInt(document.getElementById('gen-room-start')?.value, 10) || 1;
    const end = parseInt(document.getElementById('gen-room-end')?.value, 10) || 4;
    const floor = document.getElementById('gen-room-floor')?.value.trim() || '1';

    for (let i = start; i <= end; i++) {
        window.roomDefinitions.push({
            name: `${prefix}${i}`,
            category: cat,
            units: 1,
            beds: 1,
            floor: floor,
            rule: 'private'
        });
    }
    window.toggleBatchRoomPanel(false);
    window.renderRoomDefinitionsTable();
};

// All Beds Preview Drawer
window.toggleBedPreviewDrawer = function() {
    const el = document.getElementById('bed-preview-drawer');
    if (!el) return;
    el.classList.toggle('hidden');
    window.renderBedPreviewDrawer();
};

window.renderBedPreviewDrawer = function() {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;
    container.innerHTML = '';

    const grouped = {};
    window.compiledRooms.forEach(u => {
        const cat = u.category || 'Standard Room';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(u);
    });

    Object.entries(grouped).forEach(([cat, units]) => {
        const card = document.createElement('div');
        card.className = "bg-white border border-slate-300 rounded p-1.5 shadow-2xs flex flex-col gap-1 min-w-[150px]";
        
        let pillsHtml = `<div class="font-black text-slate-800 text-[10px] uppercase border-b border-slate-200 pb-0.5 mb-0.5 flex justify-between"><span>${cat}</span><span class="text-indigo-600">${units.length}</span></div><div class="flex flex-wrap gap-1">`;
        
        units.forEach(u => {
            const isTop = u.bed === 'top' || u.bunk === 'top';
            const isBottom = u.bed === 'bottom' || u.bunk === 'bottom' || u.icon === 'bot';
            const colorClass = isTop ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : (isBottom ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-800 border-slate-300');
            const iconText = isTop ? '▲' : (isBottom ? '▼' : '●');

            pillsHtml += `<span class="px-1 py-0.2 rounded border font-mono font-bold text-[9px] flex items-center gap-0.5 ${colorClass}"><span>${u.id}</span><span class="text-[7.5px] opacity-70">${iconText}</span></span>`;
        });
        pillsHtml += `</div>`;
        card.innerHTML = pillsHtml;
        container.appendChild(card);
    });
};

// Reorder Categories Modal
window._tempCategoryOrder = [];
window.openReorderCategoriesModal = function() {
    const distinct = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    window._tempCategoryOrder = [...distinct];
    window.renderReorderCategoryList();
    const modal = document.getElementById('reorder-categories-modal');
    if (modal) modal.classList.remove('hidden');
};

window.renderReorderCategoryList = function() {
    const list = document.getElementById('reorder-cat-list');
    if (!list) return;
    list.innerHTML = '';

    window._tempCategoryOrder.forEach((cat, idx) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-1 bg-white border border-slate-200 rounded shadow-2xs text-xs font-bold text-slate-800";
        item.innerHTML = `
            <div class="flex items-center gap-1.5">
                <span class="font-mono text-[10px] text-slate-400">${idx + 1}</span>
                <span>${cat}</span>
            </div>
            <div class="flex items-center gap-1">
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, -1)" class="p-0.5 text-slate-500 hover:text-indigo-600 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}" ${idx === 0 ? 'disabled' : ''}>
                    <i data-lucide="chevron-up" size="14"></i>
                </button>
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, 1)" class="p-0.5 text-slate-500 hover:text-indigo-600 ${idx === window._tempCategoryOrder.length - 1 ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}" ${idx === window._tempCategoryOrder.length - 1 ? 'disabled' : ''}>
                    <i data-lucide="chevron-down" size="14"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.shiftCategoryOrderItem = function(idx, delta) {
    const target = idx + delta;
    if (target < 0 || target >= window._tempCategoryOrder.length) return;
    const cat = window._tempCategoryOrder.splice(idx, 1)[0];
    window._tempCategoryOrder.splice(target, 0, cat);
    window.renderReorderCategoryList();
};

window.applyReorderedCategories = function() {
    const grouped = {};
    window.roomDefinitions.forEach(r => {
        const cat = r.category || 'Standard Room';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
    });

    const newDefs = [];
    window._tempCategoryOrder.forEach(cat => {
        if (grouped[cat]) newDefs.push(...grouped[cat]);
    });
    // Add any unlisted
    Object.keys(grouped).forEach(cat => {
        if (!window._tempCategoryOrder.includes(cat)) newDefs.push(...grouped[cat]);
    });

    window.roomDefinitions = newDefs;
    window.closeReorderCategoriesModal();
    window.renderRoomDefinitionsTable();
};

window.closeReorderCategoriesModal = function() {
    const modal = document.getElementById('reorder-categories-modal');
    if (modal) modal.classList.add('hidden');
};

// --- SECTION 5: STEP 3 (CHANNEX MAPPING & PROTOCOL ENGINE) ---

function getPlanRoomTypeId(p) {
    return p.relationships?.room_type?.data?.id || p.attributes?.room_type_id || p.room_type_id || null;
}

window.fetchChannexData = async function() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim() || window.channexConfig?.apiKey;
    const propId = document.getElementById('chan-prop-id')?.value.trim() || window.channexConfig?.propId;

    if (!apiKey || !propId) {
        return window.customAlert("Missing Credentials", "Please enter both Channex API Key and Property UUID.");
    }

    window.channexConfig.apiKey = apiKey;
    window.channexConfig.propId = propId;

    const btn = event?.target;
    if (btn) btn.innerText = "FETCHING...";

    try {
        const baseUrl = "https://app.channex.io/api/v1";
        const headers = { "user-api-key": apiKey, "Content-Type": "application/json" };

        // 1. Fetch Room Types
        const rRes = await fetch(`${baseUrl}/room_types?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
        const rData = await rRes.json();
        window.channexRooms = rData.data || [];

        // 2. Fetch Rate Plans (Filtered via options endpoint to purge channel-derived phantom plans)
        let plans = [];
        try {
            const optRes = await fetch(`${baseUrl}/rate_plans/options?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
            if (optRes.ok) {
                const optData = await optRes.json();
                plans = optData.data || [];
            }
        } catch (e) {
            console.warn("Falling back to standard rate plans:", e);
        }

        if (plans.length === 0) {
            const pRes = await fetch(`${baseUrl}/rate_plans?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
            const pData = await pRes.json();
            plans = pData.data || [];
        }

        // Strict filter: exclude OTA channel-derived internal plans
        window.channexRatePlans = plans.filter(p => {
            const attr = p.attributes || p;
            if (attr.ui_read_only === true) return false;
            if (attr.parent_rate_plan_id) return false;
            if (attr.channel_id) return false;
            const title = (attr.title || '').toLowerCase();
            if (title.startsWith('booking.com') || title.startsWith('agoda') || title.startsWith('expedia')) return false;
            return true;
        });

        // 3. Fetch Connected Channels
        try {
            const cRes = await fetch(`${baseUrl}/channels?filter[property_id]=${propId}`, { headers });
            if (cRes.ok) {
                const cData = await cRes.json();
                const otaChannels = (cData.data || []).map(c => c.attributes?.title || c.title).filter(Boolean);
                window.populateChannelsFromChannex(otaChannels);
            }
        } catch (e) {}

        window.renderStep3Mapping();
        window.customAlert("Success", `Connected! Downloaded ${window.channexRooms.length} room types and ${window.channexRatePlans.length} primary rate plans.`);

    } catch (err) {
        console.error("Channex Fetch Error:", err);
        window.customAlert("Fetch Error", err.message);
    } finally {
        if (btn) btn.innerText = "Fetch Channex Data";
    }
};

window.populateChannelsFromChannex = function(otaChannels = []) {
    const preserved = {
        'Default': window.pricingRules.channels?.Default || { type: '=', val: 0 },
        'Direct': window.pricingRules.channels?.Direct || { type: '-%', val: 10 }
    };
    otaChannels.forEach(c => {
        preserved[c] = window.pricingRules.channels?.[c] || { type: '+%', val: 15 };
    });
    window.pricingRules.channels = preserved;
    window.renderChannelRulesList();
};

window.renderStep3Mapping = function() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    container.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    const channexRooms = window.channexRooms || [];
    const allPlans = window.channexRatePlans || [];

    if (pmsCategories.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold bg-white rounded border border-slate-200">No PMS Room Categories configured in Step 2. Please create rooms first.</div>`;
        return;
    }

    let mappedCount = 0;

    pmsCategories.forEach(pmsCat => {
        const existingMap = (window.channexMap || []).find(m => m.pmsCategory === pmsCat);
        const mappedRoomId = existingMap?.channexId || '';
        const isMapped = !!mappedRoomId;
        if (isMapped) mappedCount++;

        // Rate plans belonging to this mapped room type
        const attachedPlans = isMapped ? allPlans.filter(p => getPlanRoomTypeId(p) === mappedRoomId) : [];

        const card = document.createElement('div');
        card.className = "bg-white border rounded-lg p-2.5 shadow-2xs flex flex-col gap-2 transition-all " + (isMapped ? "border-emerald-300" : "border-amber-300");

        let selectOptions = `<option value="">-- Unmapped / Select Channex Room --</option>`;
        channexRooms.forEach(cr => {
            const crTitle = cr.attributes?.title || cr.title || cr.id;
            selectOptions += `<option value="${cr.id}" ${cr.id === mappedRoomId ? 'selected' : ''}>${crTitle}</option>`;
        });

        const statusBadge = isMapped
            ? `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[9.5px]">🟢 Paired (${attachedPlans.length} Rates)</span>`
            : `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-black text-[9.5px] animate-pulse">⚠️ Unmapped</span>`;

        card.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200">
                <div class="flex items-center gap-1.5">
                    <span class="font-black text-slate-900 text-xs uppercase">${pmsCat}</span>
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-1.5">
                    <label class="text-[9.5px] font-black uppercase text-slate-400">Channex Room:</label>
                    <select class="table-input font-bold !w-60 ${isMapped ? 'border-emerald-400 text-emerald-950 bg-emerald-50' : 'border-amber-400 text-amber-950 bg-amber-50 ring-2 ring-amber-300 animate-pulse'}" onchange="window.handleChannexRoomPairing('${pmsCat}', this.value)">
                        ${selectOptions}
                    </select>
                </div>
            </div>
            <div id="plans-table-wrap-${pmsCat.replace(/\s+/g, '_')}"></div>
        `;

        container.appendChild(card);

        // Render rate plans if room is paired
        const plansWrap = card.querySelector(`#plans-table-wrap-${pmsCat.replace(/\s+/g, '_')}`);
        if (!isMapped) {
            plansWrap.innerHTML = `<p class="text-[10px] text-amber-700 font-semibold p-1 bg-amber-50 rounded">Select a matching Channex Room Type above to load its rate plans, or click [+ Create & Push Plan] to add one.</p>`;
        } else if (attachedPlans.length === 0) {
            plansWrap.innerHTML = `<p class="text-[10px] text-slate-400 font-semibold p-1 bg-slate-50 rounded">No rate plans found in Channex for this room type. Click [+ Create & Push Plan] to generate one.</p>`;
        } else {
            let tableHtml = `
                <table class="w-full text-left text-[11px] border-collapse">
                    <thead class="bg-slate-800 text-[9px] font-black uppercase text-white border-b border-slate-900">
                        <tr>
                            <th class="py-0.5 px-1.5 w-1/3">Rate Plan Title</th>
                            <th class="py-0.5 px-1.5 w-1/4">Sales Channel</th>
                            <th class="py-0.5 px-1.5 w-1/5">Policy</th>
                            <th class="py-0.5 px-1.5 w-1/5">Product</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 font-semibold">
            `;
            attachedPlans.forEach(plan => {
                const planId = plan.id;
                const planTitle = plan.attributes?.title || plan.title || '';
                let existingRateMap = (window.channexRateMap || []).find(r => r.ratePlanId === planId);
                if (!existingRateMap) {
                    existingRateMap = {
                        ratePlanId: planId,
                        ratePlanTitle: planTitle,
                        pmsCategory: pmsCat,
                        channel: 'Default',
                        policy: /non-?ref/i.test(planTitle) ? 'non-ref' : 'ref',
                        product: /evt|fmp|event/i.test(planTitle) ? 'evt' : 'std'
                    };
                    window.channexRateMap.push(existingRateMap);
                }

                tableHtml += `
                    <tr class="hover:bg-slate-50">
                        <td class="font-bold text-slate-800">${planTitle}</td>
                        <td>
                            <select class="table-input font-bold" onchange="window.updateRateMapEntry('${planId}', 'channel', this.value)">
                                <option value="Default" ${existingRateMap.channel === 'Default' ? 'selected' : ''}>Default</option>
                                <option value="Booking.com" ${existingRateMap.channel === 'Booking.com' ? 'selected' : ''}>Booking.com</option>
                                <option value="Hostelworld" ${existingRateMap.channel === 'Hostelworld' ? 'selected' : ''}>Hostelworld</option>
                                <option value="Agoda" ${existingRateMap.channel === 'Agoda' ? 'selected' : ''}>Agoda</option>
                                <option value="Expedia" ${existingRateMap.channel === 'Expedia' ? 'selected' : ''}>Expedia</option>
                                <option value="Airbnb" ${existingRateMap.channel === 'Airbnb' ? 'selected' : ''}>Airbnb</option>
                            </select>
                        </td>
                        <td>
                            <select class="table-input font-bold" onchange="window.updateRateMapEntry('${planId}', 'policy', this.value)">
                                <option value="non-ref" ${existingRateMap.policy === 'non-ref' ? 'selected' : ''}>Non-Refundable</option>
                                <option value="ref" ${existingRateMap.policy === 'ref' ? 'selected' : ''}>Flexible (+%)</option>
                            </select>
                        </td>
                        <td>
                            <select class="table-input font-bold" onchange="window.updateRateMapEntry('${planId}', 'product', this.value)">
                                <option value="std" ${existingRateMap.product === 'std' ? 'selected' : ''}>Standard</option>
                                <option value="evt" ${existingRateMap.product === 'evt' ? 'selected' : ''}>Event / Peak</option>
                            </select>
                        </td>
                    </tr>
                `;
            });
            tableHtml += `</tbody></table>`;
            plansWrap.innerHTML = tableHtml;
        }
    });

    const progBadge = document.getElementById('channex-mapping-progress-badge');
    if (progBadge) {
        progBadge.innerText = `${mappedCount} of ${pmsCategories.length} Rooms Paired`;
        progBadge.className = mappedCount === pmsCategories.length ? "text-[9.5px] font-bold text-emerald-600" : "text-[9.5px] font-bold text-amber-600";
    }
};

window.handleChannexRoomPairing = function(pmsCat, channexRoomId) {
    window.channexMap = window.channexMap || [];
    const idx = window.channexMap.findIndex(m => m.pmsCategory === pmsCat);
    if (!channexRoomId) {
        if (idx > -1) window.channexMap.splice(idx, 1);
    } else {
        if (idx > -1) window.channexMap[idx].channexId = channexRoomId;
        else window.channexMap.push({ pmsCategory: pmsCat, channexId: channexRoomId });
    }
    window.renderStep3Mapping();
};

window.updateRateMapEntry = function(ratePlanId, field, val) {
    const entry = (window.channexRateMap || []).find(r => r.ratePlanId === ratePlanId);
    if (entry) entry[field] = val;
};

// Create Rate Plan Modal
window.openCreateRatePlanModal = function() {
    const list = document.getElementById('crp-room-checklist');
    const pmsCats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    if (list) {
        list.innerHTML = pmsCats.map(cat => `
            <label class="flex items-center gap-1.5 p-0.5 hover:bg-slate-100 rounded cursor-pointer text-[10px] font-bold text-slate-700">
                <input type="checkbox" value="${cat}" class="crp-room-checkbox cursor-pointer" checked>
                <span>${cat}</span>
            </label>
        `).join('');
    }
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCreateRatePlanModal = function() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) modal.classList.add('hidden');
};

window.toggleAllTargetRooms = function(checked) {
    document.querySelectorAll('.crp-room-checkbox').forEach(cb => { cb.checked = checked; });
};

window.applyRatePlanPreset = function(title, channel, policy) {
    const tInp = document.getElementById('crp-title');
    const cSel = document.getElementById('crp-channel');
    const pSel = document.getElementById('crp-policy');
    if (tInp) tInp.value = title;
    if (cSel) cSel.value = channel;
    if (pSel) pSel.value = policy;
};

window.executeCreateAndPushRatePlan = async function() {
    const title = document.getElementById('crp-title')?.value.trim();
    const channel = document.getElementById('crp-channel')?.value;
    const policy = document.getElementById('crp-policy')?.value;
    const selectedRooms = Array.from(document.querySelectorAll('.crp-room-checkbox:checked')).map(cb => cb.value);

    if (!title || selectedRooms.length === 0) {
        return window.customAlert("Missing Data", "Please enter a rate plan title and select at least one room.");
    }

    const btn = document.getElementById('btn-confirm-push-rate');
    if (btn) btn.innerText = "PUSHING...";

    try {
        const apiKey = window.channexConfig?.apiKey;
        const propId = window.channexConfig?.propId;
        let createdCount = 0;

        for (let pmsCat of selectedRooms) {
            const mappedRoom = (window.channexMap || []).find(m => m.pmsCategory === pmsCat);
            if (!mappedRoom || !mappedRoom.channexId) continue;

            const payload = {
                rate_plan: {
                    title: `${title} (${pmsCat})`,
                    property_id: propId,
                    room_type_id: mappedRoom.channexId,
                    currency: document.getElementById('prop-currency')?.value || 'THB',
                    options: [{ occupancy: 1, is_primary: true }]
                }
            };

            const res = await fetch("https://app.channex.io/api/v1/rate_plans", {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const j = await res.json();
                if (j.data?.id) {
                    window.channexRateMap.push({
                        ratePlanId: j.data.id,
                        ratePlanTitle: j.data.attributes?.title || title,
                        pmsCategory: pmsCat,
                        channel,
                        policy,
                        product: /evt|fmp|event/i.test(title) ? 'evt' : 'std'
                    });
                    createdCount++;
                }
            }
        }

        window.closeCreateRatePlanModal();
        window.renderStep3Mapping();
        window.customAlert("Success", `Created and pushed ${createdCount} rate plans to Channex.`);

    } catch (e) {
        window.customAlert("Push Error", e.message);
    } finally {
        if (btn) btn.innerText = "Push to Selected Rooms";
    }
};

// --- SECTION 6: STEP 4 (PRICING ANCHORS, LINKS, CHANNELS, CURVES) ---

window.renderStep4Anchors = function() {
    const dormSelect = document.getElementById('anchor-dorm-select');
    const privSelect = document.getElementById('anchor-private-select');
    const pmsCats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));

    const dormCats = pmsCats.filter(c => {
        const r = window.roomDefinitions.find(rd => rd.category === c);
        return r && r.rule !== 'private';
    });
    const privCats = pmsCats.filter(c => !dormCats.includes(c));

    if (dormSelect) {
        dormSelect.innerHTML = dormCats.map(c => `<option value="${c}" ${c === window.pricingRules.dormAnchor ? 'selected' : ''}>${c}</option>`).join('');
        if (!window.pricingRules.dormAnchor && dormCats[0]) window.pricingRules.dormAnchor = dormCats[0];
        dormSelect.onchange = e => { window.pricingRules.dormAnchor = e.target.value; };
    }

    if (privSelect) {
        privSelect.innerHTML = privCats.map(c => `<option value="${c}" ${c === window.pricingRules.privAnchor ? 'selected' : ''}>${c}</option>`).join('');
        if (!window.pricingRules.privAnchor && privCats[0]) window.pricingRules.privAnchor = privCats[0];
        privSelect.onchange = e => { window.pricingRules.privAnchor = e.target.value; };
    }
};

window.renderRelationshipsTable = function() {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const pmsCats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));

    window.relationships.forEach((rel, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";

        let anchorOpts = pmsCats.map(c => `<option value="${c}" ${c === rel.anchor ? 'selected' : ''}>${c}</option>`).join('');
        let targetOpts = pmsCats.map(c => `<option value="${c}" ${c === rel.target ? 'selected' : ''}>${c}</option>`).join('');

        tr.innerHTML = `
            <td><select class="table-input font-bold" onchange="window.relationships[${idx}].anchor = this.value">${anchorOpts}</select></td>
            <td><select class="table-input font-bold" onchange="window.relationships[${idx}].target = this.value">${targetOpts}</select></td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-bold" onchange="window.relationships[${idx}].type = this.value">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>-</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" value="${rel.val || 0}" class="table-input text-center font-bold" onchange="window.relationships[${idx}].val = parseFloat(this.value) || 0">
                </div>
            </td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-bold text-pink-700 bg-pink-50" onchange="window.relationships[${idx}].typeFmp = this.value">
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>-</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" value="${rel.valFmp !== undefined ? rel.valFmp : (rel.val || 0)}" class="table-input text-center font-bold text-pink-700 bg-pink-50" onchange="window.relationships[${idx}].valFmp = parseFloat(this.value) || 0">
                </div>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.relationships.splice(${idx}, 1); window.renderRelationshipsTable();" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = function() {
    const pmsCats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    if (pmsCats.length < 2) return window.customAlert("Notice", "You need at least 2 room categories to configure linking rules.");
    window.relationships.push({
        anchor: pmsCats[0],
        target: pmsCats[1] || pmsCats[0],
        type: "+%",
        val: 20,
        typeFmp: "+%",
        valFmp: 20
    });
    window.renderRelationshipsTable();
};

window.renderChannelRulesList = function() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;
    container.innerHTML = '';

    const master = window.pricingRules.masterDriver || 'Direct';
    const channels = window.pricingRules.channels || {};

    // Ensure Default and Direct are permanently present
    if (!channels.Default) channels.Default = { type: '=', val: 0 };
    if (!channels.Direct) channels.Direct = { type: '-%', val: 10 };

    Object.entries(channels).forEach(([chanName, rule]) => {
        const isMaster = chanName === master;
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-1 bg-white border border-amber-200 rounded text-xs";
        div.innerHTML = `
            <div class="flex items-center gap-1.5">
                <span class="font-black text-slate-800">${chanName}</span>
                ${isMaster ? '<span class="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 font-black text-[8px] uppercase">1:1 MASTER</span>' : ''}
            </div>
            <div class="flex items-center gap-1">
                <select class="table-input !w-16 font-bold" ${isMaster ? 'disabled' : ''} onchange="window.pricingRules.channels['${chanName}'].type = this.value">
                    <option value="=" ${rule.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${rule.type === '+%' ? 'selected' : ''}>+%</option>
                    <option value="-%" ${rule.type === '-%' ? 'selected' : ''}>-%</option>
                    <option value="+" ${rule.type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${rule.type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" value="${rule.val || 0}" ${isMaster ? 'disabled' : ''} class="table-input !w-14 text-center font-black" onchange="window.pricingRules.channels['${chanName}'].val = parseFloat(this.value) || 0">
            </div>
        `;
        container.appendChild(div);
    });
};

window.addVerifiedChannelRule = function() {
    const name = prompt("Enter Sales Channel Name (e.g. Hostelworld, Agoda, Expedia):");
    if (!name) return;
    const clean = name.trim();
    if (!window.pricingRules.channels[clean]) {
        window.pricingRules.channels[clean] = { type: '+%', val: 15 };
        window.renderChannelRulesList();
    }
};

window.toggleEventSettings = function(checked) {
    const panel = document.getElementById('event-curve-panel');
    if (panel) panel.classList.toggle('hidden', !checked);
    window.renderEventCurveTables();
};

window.cycleRatesSpan = function() {
    window.eventCurves.ratesSpan = window.eventCurves.ratesSpan === '±2' ? '±1' : (window.eventCurves.ratesSpan === '±1' ? '±3' : '±2');
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `${window.eventCurves.ratesSpan} Days`;
    window.renderEventCurveTables();
};

window.cycleRestrSpan = function() {
    window.eventCurves.restrSpan = window.eventCurves.restrSpan === '±6' ? '±4' : (window.eventCurves.restrSpan === '±4' ? '±7' : '±6');
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `${window.eventCurves.restrSpan} Days`;
    window.renderEventCurveTables();
};

window.renderEventCurveTables = function() {
    const priceThead = document.getElementById('event-price-thead');
    const priceTbody = document.getElementById('event-price-tbody');
    const restrThead = document.getElementById('event-restr-thead');
    const restrTbody = document.getElementById('event-restr-tbody');

    if (priceThead && priceTbody) {
        priceThead.innerHTML = `
            <tr class="bg-pink-100 text-pink-900 text-[9px] font-black uppercase">
                <th class="p-1">Anchor</th>
                <th class="p-1">EVT -2</th>
                <th class="p-1">EVT -1</th>
                <th class="p-1 bg-amber-400 text-amber-950 font-black">PEAK (0)</th>
                <th class="p-1">EVT +1</th>
                <th class="p-1">EVT +2</th>
            </tr>
        `;
        priceTbody.innerHTML = `
            <tr class="hover:bg-pink-50">
                <td class="p-1 font-black text-slate-800 text-left">Dorm Master</td>
                <td class="p-1"><input type="number" value="450" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="700" class="table-input text-center font-bold"></td>
                <td class="p-1 bg-amber-50"><input type="number" value="1200" class="table-input text-center font-black text-amber-900"></td>
                <td class="p-1"><input type="number" value="700" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="450" class="table-input text-center font-bold"></td>
            </tr>
            <tr class="hover:bg-pink-50">
                <td class="p-1 font-black text-slate-800 text-left">Private Master</td>
                <td class="p-1"><input type="number" value="1800" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="2500" class="table-input text-center font-bold"></td>
                <td class="p-1 bg-amber-50"><input type="number" value="4500" class="table-input text-center font-black text-amber-900"></td>
                <td class="p-1"><input type="number" value="2500" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="1800" class="table-input text-center font-bold"></td>
            </tr>
        `;
    }

    if (restrThead && restrTbody) {
        restrThead.innerHTML = `
            <tr class="bg-indigo-100 text-indigo-950 text-[9px] font-black uppercase">
                <th class="p-1">Rule</th>
                <th class="p-1">EVT -3</th>
                <th class="p-1">EVT -2</th>
                <th class="p-1">EVT -1</th>
                <th class="p-1 bg-amber-400 text-amber-950 font-black">PEAK (0)</th>
                <th class="p-1">EVT +1</th>
                <th class="p-1">EVT +2</th>
                <th class="p-1">EVT +3</th>
            </tr>
        `;
        restrTbody.innerHTML = `
            <tr class="hover:bg-indigo-50">
                <td class="p-1 font-black text-slate-800 text-left">Min Stay (Nights)</td>
                <td class="p-1"><input type="number" value="2" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="3" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="4" class="table-input text-center font-bold"></td>
                <td class="p-1 bg-amber-50"><input type="number" value="4" class="table-input text-center font-black text-amber-900"></td>
                <td class="p-1"><input type="number" value="3" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="2" class="table-input text-center font-bold"></td>
                <td class="p-1"><input type="number" value="1" class="table-input text-center font-bold"></td>
            </tr>
        `;
    }
};

// --- SECTION 7: STEP 5 (VERIFICATION & LAUNCH) ---

window.updateStep5Review = function() {
    const revName = document.getElementById('rev-prop-name');
    const revCode = document.getElementById('rev-prop-code');
    const revInv = document.getElementById('rev-inv-count');
    const revCat = document.getElementById('rev-cat-count');
    const revChan = document.getElementById('rev-chan-status');
    const revPlans = document.getElementById('rev-chan-plans');

    if (revName) revName.innerText = document.getElementById('prop-name')?.value || window.currentPropertyConfig.name || '--';
    if (revCode) revCode.innerText = document.getElementById('prop-short')?.value || window.currentPropertyConfig.short || '--';
    if (revInv) revInv.innerText = `${window.compiledRooms.length} Physical Units`;
    const distinctCats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    if (revCat) revCat.innerText = `${distinctCats.length} Room Categories`;

    const isConnected = !!(window.channexConfig?.apiKey && window.channexConfig?.propId);
    if (revChan) revChan.innerText = isConnected ? "Connected (Channex API)" : "Not Configured";
    if (revPlans) revPlans.innerText = `${window.channexRateMap.length} Mapped Rate Plans`;
};

window.launchApp = function(target) {
    const curShort = document.getElementById('prop-short')?.value.trim() || 'SWIMS';
    const page = target === 'cm' ? 'cm.html' : 'pms.html';
    window.location.href = `https://loren-6q.github.io/PMS/${page}?p=${encodeURIComponent(curShort)}`;
};

// --- SECTION 8: PERSISTENCE (SAVE & LOAD) ---

window.loadPropertyFromDatabase = async function(propId) {
    const headerStatus = document.getElementById('header-status-text');
    if (headerStatus) headerStatus.innerText = `Loading ${propId}...`;

    // 1. Purge all in-memory arrays so zero state bleeds between properties
    window.currentPropertyConfig = {};
    window.roomDefinitions = [];
    window.compiledRooms = [];
    window.addonsList = [];
    window.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
    window.channexRooms = [];
    window.channexRatePlans = [];
    window.channexMap = [];
    window.channexRateMap = [];
    window.pricingRules = { masterDriver: 'Direct', channels: {}, stdRefType: '+%', stdRefVal: 25, evtRefType: '+%', evtRefVal: 25 };
    window.relationships = [];

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId);
        const snap = await getDoc(propRef);

        if (snap.exists()) {
            const data = snap.data();
            window.currentPropertyConfig = data;

            // Step 1: Profile
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            setVal('prop-name', data.name);
            setVal('prop-short', data.short);
            setVal('prop-currency', data.currency || 'THB');
            setVal('prop-timezone', data.timezone || 'Asia/Bangkok');
            setVal('prop-address', data.address);
            setVal('prop-email', data.email);
            setVal('prop-phone', data.phone);

            // Logos
            setVal('prop-logo-url', data.logoUrl);
            setVal('prop-banner-url', data.bannerUrl);
            setVal('prop-icon-url', data.iconUrl);
            window.updateLogoPreview('primary', data.logoUrl);
            window.updateLogoPreview('banner', data.bannerUrl);
            window.updateLogoPreview('icon', data.iconUrl);

            // Payments & Add-ons
            if (Array.isArray(data.paymentMethods) && data.paymentMethods.length > 0) {
                window.paymentMethods = data.paymentMethods;
            }
            window.renderPaymentMethodsTable();

            window.addonsList = Array.isArray(data.addons) && data.addons.length > 0 ? data.addons : [...DEFAULT_ADDONS];
            window.renderAddonsTable();

            // Step 2: Room Definitions (Editable, with auto-count pre-filler fallback)
            if (Array.isArray(data.roomDefinitions) && data.roomDefinitions.length > 0) {
                window.roomDefinitions = data.roomDefinitions.map(rd => {
                    let beds = parseInt(rd.beds || rd.units, 10);
                    // Pre-fill fallback: if definition has 0 or undefined, count matching physical rooms
                    if ((!beds || beds <= 0) && Array.isArray(data.rooms)) {
                        const raw = (rd.name || '').trim().toUpperCase();
                        const matches = data.rooms.filter(r => (r.parentRoom && r.parentRoom.toUpperCase() === raw) || r.id.toUpperCase().startsWith(raw));
                        beds = matches.length > 0 ? matches.length : 1;
                    }
                    return { ...rd, beds: Math.max(1, beds || 1), units: Math.max(1, beds || 1) };
                });
            } else if (Array.isArray(data.rooms) && data.rooms.length > 0) {
                // If only compiled rooms exist, construct definitions
                const catGrouped = {};
                data.rooms.forEach(r => {
                    const parent = r.parentRoom || r.id.split('-')[0];
                    if (!catGrouped[parent]) {
                        catGrouped[parent] = { name: parent, category: r.category || r.type, beds: 0, floor: r.floor || '1', rule: r.isDorm ? 'odd-top' : 'private' };
                    }
                    catGrouped[parent].beds++;
                });
                window.roomDefinitions = Object.values(catGrouped);
            }
            window.renderRoomDefinitionsTable();

            // Step 3: Channex Mapping
            setVal('chan-api-key', data.channex?.apiKey);
            setVal('chan-prop-id', data.channex?.propId);
            window.channexConfig = data.channex || { apiKey: '', propId: '', rateMultiplier: 100 };
            window.channexMap = Array.isArray(data.channexMap) ? data.channexMap : [];
            window.channexRateMap = Array.isArray(data.channexRateMap) ? data.channexRateMap : [];

            // Step 4: Pricing Rules
            if (data.pricingRules) window.pricingRules = data.pricingRules;
            if (Array.isArray(data.relationships)) window.relationships = data.relationships;
            window.renderStep4Anchors();
            window.renderRelationshipsTable();
            window.renderChannelRulesList();
        }

        if (headerStatus) headerStatus.innerText = `Active: ${window.currentPropertyConfig.name || propId}`;
    } catch (err) {
        console.error("Load Error:", err);
        if (headerStatus) headerStatus.innerText = `Error loading ${propId}`;
    }
};

window.savePropertyToDatabase = async function(showMessage = true) {
    const propId = window.currentPropertyId;
    if (!propId) return;

    window.compileRoomsFromDefinitions();

    const payload = {
        name: document.getElementById('prop-name')?.value.trim() || 'Wild & Wandering Property',
        short: document.getElementById('prop-short')?.value.trim().toUpperCase() || 'WW',
        currency: document.getElementById('prop-currency')?.value || 'THB',
        timezone: document.getElementById('prop-timezone')?.value || 'Asia/Bangkok',
        address: document.getElementById('prop-address')?.value.trim() || '',
        email: document.getElementById('prop-email')?.value.trim() || '',
        phone: document.getElementById('prop-phone')?.value.trim() || '',
        logoUrl: document.getElementById('prop-logo-url')?.value.trim() || '',
        bannerUrl: document.getElementById('prop-banner-url')?.value.trim() || '',
        iconUrl: document.getElementById('prop-icon-url')?.value.trim() || '',
        paymentMethods: window.paymentMethods,
        addons: window.addonsList,
        roomDefinitions: window.roomDefinitions,
        rooms: window.compiledRooms,
        channex: {
            apiKey: document.getElementById('chan-api-key')?.value.trim() || '',
            propId: document.getElementById('chan-prop-id')?.value.trim() || '',
            rateMultiplier: 100
        },
        channexMap: window.channexMap,
        channexRateMap: window.channexRateMap,
        pricingRules: window.pricingRules,
        relationships: window.relationships,
        updatedAt: new Date().toISOString()
    };

    try {
        const propRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId);
        await setDoc(propRef, payload, { merge: true });
        if (showMessage) window.customAlert("Saved", "Property setup successfully saved to cloud database.");
    } catch (e) {
        window.customAlert("Save Error", e.message);
    }
};

// Property Switcher
window.switchSetupProperty = async function(propId) {
    if (!propId || propId === window.currentPropertyId) return;
    window.currentPropertyId = propId;
    const found = window.availableProperties.find(p => p.id === propId);
    if (found?.short) {
        window.history.replaceState({}, '', `?p=${encodeURIComponent(found.short)}`);
    }
    await window.loadPropertyFromDatabase(propId);
};

// Modal helpers
window.closeCustomModal = function() {
    const m = document.getElementById('custom-app-modal');
    if (m) m.classList.add('hidden');
};

// --- SECTION 9: BOOTLOADER ---

async function initSetupEngine() {
    try {
        await signInAnonymously(auth);
    } catch (e) {
        console.warn("Auth note:", e);
    }

    // Dynamic Property Loading from Firestore (No hardcoded maps)
    try {
        const propsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        window.availableProperties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const select = document.getElementById('property-select');
        if (select) {
            select.innerHTML = window.availableProperties.map(p => `
                <option value="${p.id}">${p.name || p.id} (${p.short || p.id.toUpperCase()})</option>
            `).join('');
        }
    } catch (e) {
        console.warn("Could not query properties collection:", e);
    }

    // Resolve URL ?p= parameter
    const urlParams = new URLSearchParams(window.location.search);
    const pParam = (urlParams.get('p') || '').trim();
    let targetPropId = window.availableProperties[0]?.id || 'swims_resort';

    if (pParam) {
        const matched = window.availableProperties.find(p => 
            p.id.toLowerCase() === pParam.toLowerCase() ||
            (p.short && p.short.toLowerCase() === pParam.toLowerCase())
        );
        if (matched) targetPropId = matched.id;
    }

    window.currentPropertyId = targetPropId;
    const select = document.getElementById('property-select');
    if (select) select.value = targetPropId;

    await window.loadPropertyFromDatabase(targetPropId);
    window.jumpStep(1);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetupEngine);
} else {
    setTimeout(initSetupEngine, 0);
}
