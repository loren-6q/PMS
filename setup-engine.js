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

// --- SECTION 4: STEP 2 (ROOM INVENTORY, COMPILER & RECOVERY) ---

window.compileRoomsFromDefinitions = function() {
    const compiled = [];
    const usedIds = new Set();

    window.roomDefinitions.forEach(def => {
        const rawName = (def.name || 'Room').trim().toUpperCase();
        const cat = (def.category || 'Standard Room').trim();
        const rule = def.rule || 'private';
        const floor = def.floor || '1';
        const total = Math.max(1, parseInt(def.beds || def.units || 1, 10));

        // Preserve immutable room ID if it exists; never overwrite with renamed string
        const baseId = def.id ? String(def.id).trim().toUpperCase() : rawName;

        if (rule === 'private') {
            let roomId = baseId;
            let counter = 1;
            while (usedIds.has(roomId)) {
                roomId = `${baseId}_${counter++}`;
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
            for (let b = 1; b <= total; b++) {
                const bedId = def.id ? `${baseId}-${b}` : `${rawName}-${b}`;
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

// ==========================================================================
// EMERGENCY RECOVERY FUNCTIONS: RECONCILE ROOMS DIRECTLY FROM LIVE BOOKINGS
// ==========================================================================
window.rebuildRoomsFromLiveBookings = async function() {
    const curProp = window.currentPropertyId;
    window.customAlert("Rebuild From Bookings", `Scan live guest bookings for ${curProp} and reconstruct exact matching rooms and bed counts?`, true, async () => {
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
            const bookings = snap.docs.map(d => d.data());
            const curBookings = bookings.filter(b => {
                const bProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
                return bProp === curProp;
            });

            if (curBookings.length === 0) {
                return window.customAlert("No Bookings", `No bookings found for property: ${curProp}`);
            }

            const roomMap = new Map();

            curBookings.forEach(b => {
                const rList = b.rooms?.length ? b.rooms : (b.room ? [b.room] : []);
                rList.forEach(rid => {
                    if (!rid || String(rid).toLowerCase().includes('unassigned')) return;
                    const cleanRid = String(rid).toUpperCase().trim();
                    const isDorm = cleanRid.includes('-');
                    const parentName = isDorm ? cleanRid.split('-')[0].trim() : cleanRid;
                    const bedNum = isDorm ? (parseInt(cleanRid.split('-')[1], 10) || 1) : 1;
                    const category = b.bookedType || (isDorm ? "Dorm Category" : "Private Category");

                    if (!roomMap.has(parentName)) {
                        roomMap.set(parentName, {
                            name: parentName,
                            category: category,
                            units: 1,
                            beds: 1,
                            floor: "1",
                            rule: isDorm ? 'odd-top' : 'private',
                            maxBed: bedNum
                        });
                    } else {
                        const existing = roomMap.get(parentName);
                        if (bedNum > existing.maxBed) {
                            existing.maxBed = bedNum;
                            existing.beds = bedNum;
                            existing.units = bedNum;
                        }
                    }
                });
            });

            if (roomMap.size === 0) {
                return window.customAlert("Notice", "Bookings exist but none had physical room numbers assigned.");
            }

            const newDefs = Array.from(roomMap.values());
            window.roomDefinitions = newDefs;
            window.renderRoomDefinitionsTable();
            await window.savePropertyToDatabase(false);

            window.customAlert("Rooms Rebuilt!", `Successfully reconstructed ${newDefs.length} rooms from live bookings!\n\nAll existing guest reservations will now render on their respective rows.`);

        } catch (err) {
            console.error("Rebuild error:", err);
            window.customAlert("Rebuild Failed", err.message);
        }
    });
};

window.restoreSwimsDefaultRooms = async function() {
    window.customAlert("Restore SWIMS Inventory", "Restore all 79 physical rooms and dorms from the verified SWIMS catalog?", true, async () => {
        try {
            const res = await fetch("https://loren-6q.github.io/PMS/swims_rooms_backup.json");
            if (!res.ok) throw new Error("Could not load swims_rooms_backup.json");
            const catalog = await res.json();

            const grouped = {};
            catalog.forEach(r => {
                const parent = r.parentRoom || r.id;
                if (!grouped[parent]) {
                    grouped[parent] = {
                        id: parent,
                        name: parent,
                        category: r.category || r.type,
                        units: 1,
                        beds: 1,
                        floor: r.floor || "1",
                        rule: r.isDorm ? (r.rule || "odd-top") : "private"
                    };
                } else if (r.isDorm) {
                    grouped[parent].beds += 1;
                    grouped[parent].units += 1;
                }
            });

            window.roomDefinitions = Object.values(grouped);
            window.renderRoomDefinitionsTable();
            await window.savePropertyToDatabase(false);
            window.customAlert("SWIMS Restored", "All 79 physical rooms and dorms have been restored.");
        } catch (err) {
            console.error("SWIMS restore error:", err);
            window.customAlert("Restore Failed", err.message);
        }
    });
};

window.renderBedPreviewDrawer = function() {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;
    container.innerHTML = '';

    const grouped = {};
    (window.compiledRooms || []).forEach(r => {
        const cat = r.category || 'Standard Room';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
    });

    Object.entries(grouped).forEach(([cat, units]) => {
        const card = document.createElement('div');
        card.className = "bg-white p-2 rounded border border-slate-300 shadow-2xs flex flex-col gap-1 min-w-[200px]";
        let html = `<div class="font-black text-[10px] uppercase text-slate-800 border-b border-slate-200 pb-1 mb-1 flex justify-between">
            <span>${cat}</span>
            <span class="text-indigo-600">${units.length} Units</span>
        </div><div class="flex flex-wrap gap-1">`;

        units.forEach(u => {
            const isTop = u.bunk === 'top' || u.icon === 'top' || String(u.bed).toLowerCase().includes('top');
            const isBot = u.bunk === 'bottom' || u.bunk === 'bot' || u.icon === 'bot' || String(u.bed).toLowerCase().includes('bot');
            const pillClass = isTop
                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                : (isBot ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-300');

            html += `<span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${pillClass}">${u.id}</span>`;
        });
        html += `</div>`;
        card.innerHTML = html;
        container.appendChild(card);
    });
};

window.toggleBedPreviewDrawer = function() {
    const el = document.getElementById('bed-preview-drawer');
    if (el) el.classList.toggle('hidden');
};

window.toggleBatchDormPanel = function(force) {
    const el = document.getElementById('batch-dorm-panel');
    if (!el) return;
    if (force !== undefined) el.classList.toggle('hidden', !force);
    else el.classList.toggle('hidden');
};

window.toggleBatchRoomPanel = function(force) {
    const el = document.getElementById('batch-room-panel');
    if (!el) return;
    if (force !== undefined) el.classList.toggle('hidden', !force);
    else el.classList.toggle('hidden');
};

window.executeBatchDormGenerate = function() {
    const name = (document.getElementById('gen-dorm-name')?.value || 'DORM').trim().toUpperCase();
    const cat = (document.getElementById('gen-dorm-cat')?.value || 'Standard Dorm').trim();
    const beds = parseInt(document.getElementById('gen-dorm-beds')?.value, 10) || 6;
    const floor = (document.getElementById('gen-dorm-floor')?.value || '1').trim();
    const rule = document.getElementById('gen-dorm-rule')?.value || 'odd-top';

    window.roomDefinitions.push({
        id: name,
        name: name,
        category: cat,
        units: beds,
        beds: beds,
        floor: floor,
        rule: rule
    });

    window.renderRoomDefinitionsTable();
    window.toggleBatchDormPanel(false);
};

window.executeBatchRoomGenerate = function() {
    const prefix = (document.getElementById('gen-room-prefix')?.value || 'ROOM ').trim().toUpperCase();
    const cat = (document.getElementById('gen-room-cat')?.value || 'Deluxe King Room').trim();
    const start = parseInt(document.getElementById('gen-room-start')?.value, 10) || 1;
    const end = parseInt(document.getElementById('gen-room-end')?.value, 10) || 1;
    const floor = (document.getElementById('gen-room-floor')?.value || '1').trim();

    for (let i = start; i <= end; i++) {
        const rName = `${prefix}${i}`;
        window.roomDefinitions.push({
            id: rName,
            name: rName,
            category: cat,
            units: 1,
            beds: 1,
            floor: floor,
            rule: 'private'
        });
    }

    window.renderRoomDefinitionsTable();
    window.toggleBatchRoomPanel(false);
};

window.openReorderCategoriesModal = function() {
    const distinctCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    window._tempCategoryOrder = [...distinctCategories];
    window.renderReorderCategoryList();
    const m = document.getElementById('reorder-categories-modal');
    if (m) {
        m.classList.remove('hidden');
        m.style.display = 'flex';
    }
};

window.closeReorderCategoriesModal = function() {
    const m = document.getElementById('reorder-categories-modal');
    if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
    }
};

window.renderReorderCategoryList = function() {
    const list = document.getElementById('reorder-cat-list');
    if (!list || !window._tempCategoryOrder) return;
    list.innerHTML = '';

    window._tempCategoryOrder.forEach((cat, idx) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-1.5 rounded border border-slate-200 bg-slate-50 text-xs font-bold";
        div.innerHTML = `
            <span>${cat}</span>
            <div class="flex items-center gap-1">
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, -1)" class="p-0.5 hover:bg-slate-200 rounded text-slate-600 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : ''}" ${idx === 0 ? 'disabled' : ''}>
                    <i data-lucide="chevron-up" size="13"></i>
                </button>
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, 1)" class="p-0.5 hover:bg-slate-200 rounded text-slate-600 ${idx === window._tempCategoryOrder.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}" ${idx === window._tempCategoryOrder.length - 1 ? 'disabled' : ''}>
                    <i data-lucide="chevron-down" size="13"></i>
                </button>
            </div>
        `;
        list.appendChild(div);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.shiftCategoryOrderItem = function(index, delta) {
    const target = index + delta;
    if (!window._tempCategoryOrder || target < 0 || target >= window._tempCategoryOrder.length) return;
    const item = window._tempCategoryOrder.splice(index, 1)[0];
    window._tempCategoryOrder.splice(target, 0, item);
    window.renderReorderCategoryList();
};

window.applyReorderedCategories = function() {
    if (!window._tempCategoryOrder) return;
    const grouped = {};
    window.roomDefinitions.forEach(r => {
        const cat = r.category || 'Standard Room';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
    });

    const regrouped = [];
    window._tempCategoryOrder.forEach(cat => {
        if (grouped[cat]) regrouped.push(...grouped[cat]);
    });

    Object.keys(grouped).forEach(cat => {
        if (!window._tempCategoryOrder.includes(cat)) regrouped.push(...grouped[cat]);
    });

    window.roomDefinitions = regrouped;
    window.closeReorderCategoriesModal();
    window.renderRoomDefinitionsTable();
};

// --- SECTION 5: STEP 3 (CHANNEX ROOM & RATE PLAN MAPPING) ---

window.fetchChannexData = async function() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Credentials Required", "Please enter both the Channex API Key and Property UUID.");
    }

    window.showLoader('FETCHING CHANNEX DATA...');

    try {
        const headers = { "user-api-key": apiKey, "Content-Type": "application/json" };
        const host = "https://app.channex.io/api/v1";

        const rRes = await fetch(`${host}/room_types?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
        const rJson = await rRes.json();
        window.channexRooms = rJson.data || [];

        const pRes = await fetch(`${host}/rate_plans?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
        const pJson = await pRes.json();
        const allPlans = pJson.data || [];

        // Filter out OTA-derived mapping rate plans to keep primary plans
        const cleanRatePlans = allPlans.filter(p => {
            const attr = p.attributes || {};
            if (attr.ui_read_only === true || attr.parent_rate_plan_id != null || attr.channel_id != null) return false;
            const t = (attr.title || '').trim().toLowerCase();
            if (t.startsWith('booking.com') || t.startsWith('agoda') || t.startsWith('hostelworld') || t.startsWith('expedia')) return false;
            return true;
        });

        window.channexRatePlans = cleanRatePlans;

        // Auto-match Channex room types to PMS categories
        const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
        window.channexMap = [];

        pmsCategories.forEach(pmsCat => {
            const normPms = pmsCat.toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchedChannex = window.channexRooms.find(cr => {
                const normCr = (cr.attributes?.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return normCr === normPms || normCr.includes(normPms) || normPms.includes(normCr);
            });

            if (matchedChannex) {
                window.channexMap.push({
                    pmsCategory: pmsCat,
                    channexId: matchedChannex.id,
                    channexTitle: matchedChannex.attributes?.title || ''
                });
            }
        });

        // Map rate plans directly under their parent room types
        window.channexRateMap = cleanRatePlans.map(item => {
            const rId = item.relationships?.room_type?.data?.id || item.attributes?.room_type_id;
            const parentRoom = window.channexRooms.find(r => r.id === rId);
            const parentTitle = parentRoom?.attributes?.title || '';
            const mappedRule = window.channexMap.find(m => m.channexId === rId);
            const pmsCat = mappedRule ? mappedRule.pmsCategory : '';

            const title = item.attributes?.title || '';
            const lower = title.toLowerCase();
            const policy = (lower.includes('non-ref') || lower.includes('non ref') || lower.includes('nr')) ? 'non-ref' : 'ref';
            const product = (lower.includes('fmp') || lower.includes('evt') || lower.includes('event')) ? 'evt' : 'std';

            return {
                ratePlanId: item.id,
                ratePlanTitle: title,
                channexRoomId: rId || '',
                channexRoomTitle: parentTitle,
                pmsCategory: pmsCat,
                channel: 'Default',
                policy: policy,
                product: product
            };
        });

        window.renderStep3UnifiedMapping();
        window.customAlert("Channex Fetched", `Successfully fetched ${window.channexRooms.length} room types and ${cleanRatePlans.length} rate plans.`);

    } catch (err) {
        console.error("Fetch Channex Error:", err);
        window.customAlert("Fetch Failed", err.message);
    } finally {
        window.hideLoader();
    }
};

window.renderStep3UnifiedMapping = function() {
    const container = document.getElementById('unified-mapping-container');
    const badge = document.getElementById('channex-mapping-progress-badge');
    if (!container) return;
    container.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    let pairedCount = 0;

    pmsCategories.forEach(pmsCat => {
        const mapping = window.channexMap.find(m => m.pmsCategory === pmsCat);
        const isPaired = !!(mapping && mapping.channexId);
        if (isPaired) pairedCount++;

        const associatedRates = isPaired
            ? (window.channexRateMap || []).filter(r => r.channexRoomId === mapping.channexId)
            : [];

        const card = document.createElement('div');
        card.className = "bg-white border rounded-lg overflow-hidden shadow-xs " + (isPaired ? "border-slate-300" : "border-amber-300");

        let selectHtml = `<select class="table-input font-bold ${isPaired ? 'border-emerald-400 bg-emerald-50 text-emerald-950 font-black' : 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-300 animate-pulse'}" onchange="window.updateRoomTypeMapping('${pmsCat}', this.value)">
            <option value="">-- UNMAPPED: SELECT CHANNEX ROOM TYPE --</option>`;

        (window.channexRooms || []).forEach(cr => {
            const selected = mapping && mapping.channexId === cr.id ? 'selected' : '';
            selectHtml += `<option value="${cr.id}" ${selected}>${cr.attributes?.title || cr.id}</option>`;
        });
        selectHtml += `</select>`;

        let ratesHtml = '';
        if (isPaired && associatedRates.length > 0) {
            ratesHtml = `
                <div class="overflow-x-auto border-t border-slate-200">
                    <table class="w-full text-left text-[11px] border-collapse">
                        <thead class="bg-slate-800 text-[9px] font-black uppercase text-white">
                            <tr>
                                <th class="py-1 px-2 w-2/5">Channex Rate Plan</th>
                                <th class="py-1 px-2 w-1/4">Sales Channel</th>
                                <th class="py-1 px-2 w-1/5">Policy</th>
                                <th class="py-1 px-2 w-1/6">Product</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 font-semibold">`;

            associatedRates.forEach(plan => {
                ratesHtml += `
                    <tr class="hover:bg-slate-50">
                        <td class="py-1 px-2 font-bold text-slate-800">${plan.ratePlanTitle}</td>
                        <td class="py-1 px-2">
                            <select class="table-input" onchange="plan.channel = this.value">
                                <option value="Default" ${plan.channel === 'Default' ? 'selected' : ''}>Default</option>
                                <option value="Direct" ${plan.channel === 'Direct' ? 'selected' : ''}>Direct</option>
                                <option value="Booking.com" ${plan.channel === 'Booking.com' ? 'selected' : ''}>Booking.com</option>
                                <option value="Hostelworld" ${plan.channel === 'Hostelworld' ? 'selected' : ''}>Hostelworld</option>
                                <option value="Agoda" ${plan.channel === 'Agoda' ? 'selected' : ''}>Agoda</option>
                                <option value="Expedia" ${plan.channel === 'Expedia' ? 'selected' : ''}>Expedia</option>
                                <option value="Airbnb" ${plan.channel === 'Airbnb' ? 'selected' : ''}>Airbnb</option>
                            </select>
                        </td>
                        <td class="py-1 px-2">
                            <select class="table-input font-bold" onchange="plan.policy = this.value">
                                <option value="non-ref" ${plan.policy === 'non-ref' ? 'selected' : ''}>Non-Ref</option>
                                <option value="ref" ${plan.policy === 'ref' ? 'selected' : ''}>Ref (+%)</option>
                            </select>
                        </td>
                        <td class="py-1 px-2">
                            <select class="table-input font-bold" onchange="plan.product = this.value">
                                <option value="std" ${plan.product === 'std' ? 'selected' : ''}>Standard</option>
                                <option value="evt" ${plan.product === 'evt' ? 'selected' : ''}>Event Pkg</option>
                            </select>
                        </td>
                    </tr>`;
            });
            ratesHtml += `</tbody></table></div>`;
        } else if (isPaired) {
            ratesHtml = `<div class="p-2.5 text-center text-slate-400 font-bold text-[10px] uppercase">No rate plans linked to this Channex room. Click "+ Create & Push Plan" above.</div>`;
        } else {
            ratesHtml = `<div class="p-2.5 text-center text-amber-800 bg-amber-50/50 font-bold text-[10px] uppercase">Select the matching Channex room type above to reveal rate plans.</div>`;
        }

        card.innerHTML = `
            <div class="p-2 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                    <span class="font-black text-xs uppercase text-slate-800">${pmsCat}</span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${isPaired ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                        ${isPaired ? `🟢 Paired (${associatedRates.length} Rates)` : '⚠️ Action Required: Select Room'}
                    </span>
                </div>
                <div class="w-full sm:w-72">${selectHtml}</div>
            </div>
            ${ratesHtml}
        `;
        container.appendChild(card);
    });

    if (badge) {
        badge.innerText = `${pairedCount} of ${pmsCategories.length} Categories Paired`;
        badge.className = pairedCount === pmsCategories.length
            ? "text-[9.5px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded"
            : "text-[9.5px] font-black text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded";
    }
};

window.updateRoomTypeMapping = function(pmsCat, channexRoomId) {
    const existingIdx = window.channexMap.findIndex(m => m.pmsCategory === pmsCat);
    if (!channexRoomId) {
        if (existingIdx > -1) window.channexMap.splice(existingIdx, 1);
    } else {
        const cRoom = window.channexRooms.find(r => r.id === channexRoomId);
        const title = cRoom?.attributes?.title || '';
        if (existingIdx > -1) {
            window.channexMap[existingIdx].channexId = channexRoomId;
            window.channexMap[existingIdx].channexTitle = title;
        } else {
            window.channexMap.push({ pmsCategory: pmsCat, channexId: channexRoomId, channexTitle: title });
        }

        (window.channexRateMap || []).forEach(plan => {
            if (plan.channexRoomId === channexRoomId) {
                plan.pmsCategory = pmsCat;
            }
        });
    }
    window.renderStep3UnifiedMapping();
};

window.openCreateRatePlanModal = function() {
    const checklist = document.getElementById('crp-room-checklist');
    if (!checklist) return;
    checklist.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    pmsCategories.forEach((cat, idx) => {
        const mapping = window.channexMap.find(m => m.pmsCategory === cat);
        const isPaired = !!(mapping && mapping.channexId);

        checklist.innerHTML += `
            <label class="flex items-center gap-1.5 p-1 rounded hover:bg-white text-xs cursor-pointer">
                <input type="checkbox" value="${cat}" class="crp-room-cb" ${isPaired ? 'checked' : 'disabled'}>
                <span class="${isPaired ? 'font-bold text-slate-800' : 'text-slate-400 line-through'}">${cat}</span>
                ${isPaired ? '' : '<span class="text-[9px] text-amber-600 font-bold">(Unpaired)</span>'}
            </label>
        `;
    });

    const m = document.getElementById('create-rate-plan-modal');
    if (m) {
        m.classList.remove('hidden');
        m.style.display = 'flex';
    }
};

window.closeCreateRatePlanModal = function() {
    const m = document.getElementById('create-rate-plan-modal');
    if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
    }
};

window.toggleAllTargetRooms = function(checked) {
    document.querySelectorAll('.crp-room-cb:not(:disabled)').forEach(cb => { cb.checked = checked; });
};

window.executeCreateAndPushRatePlan = async function() {
    const title = document.getElementById('crp-title')?.value.trim();
    const channel = document.getElementById('crp-channel')?.value;
    const policy = document.getElementById('crp-policy')?.value;
    const selectedCats = Array.from(document.querySelectorAll('.crp-room-cb:checked')).map(cb => cb.value);

    if (!title) return window.customAlert("Title Required", "Please enter a rate plan title.");
    if (selectedCats.length === 0) return window.customAlert("Room Required", "Please select at least one paired room category.");

    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();
    if (!apiKey || !propId) return window.customAlert("Credentials Required", "Channex API credentials are missing.");

    const btn = document.getElementById('btn-confirm-push-rate');
    if (btn) { btn.disabled = true; btn.innerText = "PUSHING..."; }

    try {
        for (let cat of selectedCats) {
            const map = window.channexMap.find(m => m.pmsCategory === cat);
            if (!map || !map.channexId) continue;

            const payload = {
                rate_plan: {
                    title: `${title} - ${cat}`,
                    room_type_id: map.channexId,
                    property_id: propId,
                    currency: document.getElementById('prop-currency')?.value || "THB",
                    options: []
                }
            };

            const res = await fetch("https://app.channex.io/api/v1/rate_plans", {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Failed to create rate plan for ${cat}`);
            }

            const created = await res.json();
            window.channexRateMap.push({
                ratePlanId: created.data.id,
                ratePlanTitle: created.data.attributes?.title || title,
                channexRoomId: map.channexId,
                channexRoomTitle: map.channexTitle,
                pmsCategory: cat,
                channel: channel,
                policy: policy,
                product: 'std'
            });
        }

        window.closeCreateRatePlanModal();
        window.renderStep3UnifiedMapping();
        window.customAlert("Plans Created", `Successfully pushed rate plan to ${selectedCats.length} room types.`);

    } catch (err) {
        console.error("Create Plan Error:", err);
        window.customAlert("Push Failed", err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Push to Selected Rooms"; }
    }
};

// --- SECTION 6: STEP 4 (PRICING RULES, ANCHORS & LINKS) ---

window.renderStep4Pricing = function() {
    const dormSel = document.getElementById('anchor-dorm-select');
    const privSel = document.getElementById('anchor-private-select');
    if (!dormSel || !privSel) return;

    dormSel.innerHTML = '';
    privSel.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    pmsCategories.forEach(cat => {
        const isDorm = window.roomDefinitions.some(r => r.category === cat && r.rule !== 'private');
        const opt = `<option value="${cat}">${cat}</option>`;
        if (isDorm) dormSel.innerHTML += opt;
        else privSel.innerHTML += opt;
    });

    if (window.pricingRules.dormAnchor) dormSel.value = window.pricingRules.dormAnchor;
    if (window.pricingRules.privateAnchor) privSel.value = window.pricingRules.privateAnchor;

    window.renderRelationshipsTable();
    window.renderChannelRulesList();
};

window.renderRelationshipsTable = function() {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const categories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));

    (window.relationships || []).forEach((rel, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";

        let anchorOpts = categories.map(c => `<option value="${c}" ${rel.anchor === c ? 'selected' : ''}>${c}</option>`).join('');
        let targetOpts = categories.map(c => `<option value="${c}" ${rel.target === c ? 'selected' : ''}>${c}</option>`).join('');

        tr.innerHTML = `
            <td><select class="table-input" onchange="window.relationships[${idx}].anchor = this.value">${anchorOpts}</select></td>
            <td><select class="table-input" onchange="window.relationships[${idx}].target = this.value">${targetOpts}</select></td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-14" onchange="window.relationships[${idx}].type = this.value">
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>-</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>-%</option>
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>=</option>
                    </select>
                    <input type="number" value="${rel.val || 0}" class="table-input text-center font-bold" onchange="window.relationships[${idx}].val = parseFloat(this.value) || 0">
                </div>
            </td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-14 text-pink-700 bg-pink-50" onchange="window.relationships[${idx}].typeFmp = this.value">
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>-</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>-%</option>
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>=</option>
                    </select>
                    <input type="number" value="${rel.valFmp !== undefined ? rel.valFmp : (rel.val || 0)}" class="table-input text-center font-bold text-pink-700 bg-pink-50" onchange="window.relationships[${idx}].valFmp = parseFloat(this.value) || 0">
                </div>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.deleteRelationshipRow(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = function() {
    const cats = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    window.relationships.push({
        anchor: cats[0] || 'Room 1',
        target: cats[1] || cats[0] || 'Room 2',
        type: '+',
        val: 100,
        typeFmp: '+',
        valFmp: 100
    });
    window.renderRelationshipsTable();
};

window.deleteRelationshipRow = function(idx) {
    window.relationships.splice(idx, 1);
    window.renderRelationshipsTable();
};

window.renderChannelRulesList = function() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;
    container.innerHTML = '';

    const masterDriver = window.pricingRules.masterDriver || 'Direct';
    const channels = ['Default', 'Direct', 'Booking.com', 'Hostelworld', 'Agoda', 'Expedia', 'Airbnb'];

    channels.forEach(ch => {
        const isMaster = (ch === masterDriver);
        const rule = window.pricingRules.channels[ch] || { type: '=', val: 0 };

        const row = document.createElement('div');
        row.className = "flex items-center justify-between p-1.5 rounded border border-slate-200 bg-white text-xs";
        row.innerHTML = `
            <div class="flex items-center gap-1.5">
                <span class="font-black ${isMaster ? 'text-indigo-700' : 'text-slate-800'}">${ch}</span>
                ${isMaster ? '<span class="text-[8px] bg-indigo-100 text-indigo-800 font-black px-1 rounded uppercase">Master Anchor (= 0)</span>' : ''}
            </div>
            ${isMaster ? '<span class="text-[10px] font-bold text-slate-400">Baseline 1:1</span>' : `
            <div class="flex items-center gap-1">
                <select class="table-input !w-14" onchange="window.updateChannelRule('${ch}', 'type', this.value)">
                    <option value="=" ${rule.type === '=' ? 'selected' : ''}>=</option>
                    <option value="+" ${rule.type === '+' ? 'selected' : ''}>+</option>
                    <option value="-" ${rule.type === '-' ? 'selected' : ''}>-</option>
                    <option value="+%" ${rule.type === '+%' ? 'selected' : ''}>+%</option>
                    <option value="-%" ${rule.type === '-%' ? 'selected' : ''}>-%</option>
                </select>
                <input type="number" value="${rule.val || 0}" class="table-input !w-16 text-center font-bold" onchange="window.updateChannelRule('${ch}', 'val', parseFloat(this.value) || 0)">
            </div>`}
        `;
        container.appendChild(row);
    });
};

window.updateChannelRule = function(ch, field, val) {
    if (!window.pricingRules.channels[ch]) window.pricingRules.channels[ch] = { type: '=', val: 0 };
    window.pricingRules.channels[ch][field] = val;
};

// --- SECTION 7: STEP 5 REVIEW, PERSISTENCE & BOOTLOADER ---

window.updateStep5Review = function() {
    const propName = document.getElementById('prop-name')?.value || window.currentPropertyId;
    const propShort = document.getElementById('prop-short')?.value || 'PROP';

    const revName = document.getElementById('rev-prop-name');
    const revCode = document.getElementById('rev-prop-code');
    const revInv = document.getElementById('rev-inv-count');
    const revCat = document.getElementById('rev-cat-count');
    const revChanStatus = document.getElementById('rev-chan-status');
    const revChanPlans = document.getElementById('rev-chan-plans');

    if (revName) revName.innerText = propName;
    if (revCode) revCode.innerText = propShort;
    if (revInv) revInv.innerText = `${window.compiledRooms.length} Units`;
    if (revCat) revCat.innerText = `${new Set(window.roomDefinitions.map(r => r.category)).size} Categories`;
    if (revChanStatus) revChanStatus.innerText = window.channexConfig?.propId ? "Connected" : "Not Configured";
    if (revChanPlans) revChanPlans.innerText = `${window.channexRateMap.length} Plans Mapped`;
};

window.savePropertyToDatabase = async function(showMessage = true) {
    const btn = document.getElementById('btn-save-header');
    if (btn) { btn.disabled = true; btn.innerText = "SAVING..."; }

    try {
        const propId = window.currentPropertyId;
        window.compileRoomsFromDefinitions();

        const dataToSave = {
            id: propId,
            name: document.getElementById('prop-name')?.value.trim() || propId,
            short: document.getElementById('prop-short')?.value.trim().toUpperCase() || 'PROP',
            currency: document.getElementById('prop-currency')?.value || 'THB',
            timezone: document.getElementById('prop-timezone')?.value || 'Asia/Bangkok',
            address: document.getElementById('prop-address')?.value || '',
            email: document.getElementById('prop-email')?.value || '',
            phone: document.getElementById('prop-phone')?.value || '',
            logoUrl: document.getElementById('prop-logo-url')?.value || '',
            bannerUrl: document.getElementById('prop-banner-url')?.value || '',
            iconUrl: document.getElementById('prop-icon-url')?.value || '',
            payments: window.paymentMethods,
            addons: window.addonsList,
            roomDefinitions: window.roomDefinitions,
            rooms: window.compiledRooms,
            channex: {
                apiKey: document.getElementById('chan-api-key')?.value.trim() || '',
                propId: document.getElementById('chan-prop-id')?.value.trim() || ''
            },
            channexMap: window.channexMap,
            channexRateMap: window.channexRateMap,
            pricingRules: {
                masterDriver: document.getElementById('rule-master-driver')?.value || 'Direct',
                dormAnchor: document.getElementById('anchor-dorm-select')?.value || '',
                privateAnchor: document.getElementById('anchor-private-select')?.value || '',
                channels: window.pricingRules.channels,
                stdRefVal: parseFloat(document.getElementById('rule-std-ref')?.value) || 25,
                evtRefVal: parseFloat(document.getElementById('rule-evt-ref')?.value) || 25
            },
            relationships: window.relationships,
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), dataToSave, { merge: true });

        if (showMessage) {
            window.customAlert("Saved", "Property setup successfully saved to cloud.");
        }
    } catch (err) {
        console.error("Save Error:", err);
        window.customAlert("Save Error", err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
        if (window.lucide) window.lucide.createIcons();
    }
};

window.loadPropertyFromDatabase = async function(propId) {
    window.currentPropertyId = propId;
    window.safeUpdateUrlParam ? window.safeUpdateUrlParam('p', propId.toUpperCase()) : null;

    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (snap.exists()) {
            const data = snap.data();
            window.currentPropertyConfig = data;

            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            setVal('prop-name', data.name);
            setVal('prop-short', data.short);
            setVal('prop-currency', data.currency || 'THB');
            setVal('prop-timezone', data.timezone || 'Asia/Bangkok');
            setVal('prop-address', data.address);
            setVal('prop-email', data.email);
            setVal('prop-phone', data.phone);
            setVal('prop-logo-url', data.logoUrl);
            setVal('prop-banner-url', data.bannerUrl);
            setVal('prop-icon-url', data.iconUrl);

            window.updateLogoPreview('primary', data.logoUrl);
            window.updateLogoPreview('banner', data.bannerUrl);
            window.updateLogoPreview('icon', data.iconUrl);

            window.paymentMethods = Array.isArray(data.payments) && data.payments.length > 0 ? data.payments : [...DEFAULT_PAYMENT_METHODS];
            window.addonsList = Array.isArray(data.addons) && data.addons.length > 0 ? data.addons : [...DEFAULT_ADDONS];
            window.roomDefinitions = Array.isArray(data.roomDefinitions) ? data.roomDefinitions : [];
            window.channexConfig = data.channex || { apiKey: '', propId: '' };
            setVal('chan-api-key', window.channexConfig.apiKey);
            setVal('chan-prop-id', window.channexConfig.propId);

            window.channexMap = Array.isArray(data.channexMap) ? data.channexMap : [];
            window.channexRateMap = Array.isArray(data.channexRateMap) ? data.channexRateMap : [];
            window.relationships = Array.isArray(data.relationships) ? data.relationships : [];
            window.pricingRules = data.pricingRules || { masterDriver: 'Direct', channels: {} };

            window.renderPaymentMethodsTable();
            window.renderAddonsTable();
            window.renderRoomDefinitionsTable();
            window.renderStep3UnifiedMapping();
            window.renderStep4Pricing();
        }
    } catch (err) {
        console.error("Load Error:", err);
    }
};

window.switchSetupProperty = function(propId) {
    if (propId) window.loadPropertyFromDatabase(propId);
};

window.launchApp = function(appType) {
    const curProp = window.currentPropertyId || 'swims_resort';
    const short = document.getElementById('prop-short')?.value || curProp;
    const target = appType === 'cm' ? 'cm.html' : 'pms.html';
    window.location.href = `https://loren-6q.github.io/PMS/${target}?p=${encodeURIComponent(short)}`;
};

async function initSetupEngine() {
    try {
        await signInAnonymously(auth);
    } catch(e) {}

    const urlParams = new URLSearchParams(window.location.search);
    const pParam = (urlParams.get('p') || '').trim();

    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.availableProperties = props;

        const sel = document.getElementById('property-select');
        if (sel) {
            sel.innerHTML = props.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('');
        }

        let targetId = props[0]?.id || 'swims_resort';
        if (pParam) {
            const matched = props.find(p => 
                p.id.toLowerCase() === pParam.toLowerCase() || 
                (p.short && p.short.toLowerCase() === pParam.toLowerCase())
            );
            if (matched) targetId = matched.id;
        }

        if (sel) sel.value = targetId;
        await window.loadPropertyFromDatabase(targetId);

    } catch (e) {
        console.warn("Setup Engine Init:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetupEngine);
} else {
    setTimeout(initSetupEngine, 0);
}
