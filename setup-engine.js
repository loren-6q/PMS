// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// Wild & Wandering Property Management System
// 
// BUG FIXES & RESTORATIONS:
// - Property-Scoped Channels: Empties in-memory channel rules on property switch.
//   Derives channels strictly from that property's own Channex rate plans + Direct & Default.
// - Fixed fetchChannexData: maps plans strictly to parent room category.
// - Restored high-density, compact row styling with rich color coding across steps.
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, ref as storageRef, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU",
    authDomain: "swimspms.firebaseapp.com",
    projectId: "swimspms",
    storageBucket: "swimspms.firebasestorage.app",
    messagingSenderId: "989960113115",
    appId: "1:989960113115:web:a99e08a23a36ff4289f5fe"
};
const appId = 'hotel-pms-v1';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

// Canonical Channel Key Normalizer
function cleanChannelKey(rawKey) {
    if (!rawKey) return 'Default';
    const s = String(rawKey).trim().toLowerCase();
    if (s === 'default') return 'Default';
    if (s === 'direct') return 'Direct';
    if (s.includes('booking') || s.includes('bdc')) return 'Booking.com';
    if (s.includes('hostelworld') || s.includes('hw')) return 'Hostelworld';
    if (s.includes('agoda')) return 'Agoda';
    if (s.includes('expedia')) return 'Expedia';
    if (s.includes('airbnb') || s.includes('abnb')) return 'Airbnb';
    return rawKey.trim();
}

// --- GLOBAL STATE ---
window.currentStep = 1;
window.totalSteps = 5;
window.activePropertyId = '';
window.availableProperties = [];
window.currentPropertyConfig = {};
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
    masterDriver: 'bdc_non_ref',
    anchorPrivate: '',
    anchorDorm: '',
    stdRefType: '+%',
    stdRefVal: 25,
    evtRefType: '+%',
    evtRefVal: 25,
    channels: {}
};
window.relationships = [];
window.savedAutofillBaselines = {};
window.ratesSpan = 2;
window.restrSpan = 6;

// --- STEP NAVIGATION ---
window.jumpStep = function(step) {
    const s = Math.max(1, Math.min(5, parseInt(step, 10) || 1));
    window.currentStep = s;

    for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById(`pill-step-${i}`);
        const badge = document.getElementById(`badge-step-${i}`);
        const sec = document.getElementById(`step-content-${i}`);

        if (i === s) {
            if (pill) { pill.classList.add('active'); pill.classList.remove('completed'); }
            if (badge) { badge.className = "w-5 h-5 rounded bg-white text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs"; }
            if (sec) sec.classList.remove('hidden');
        } else if (i < s) {
            if (pill) { pill.classList.remove('active'); pill.classList.add('completed'); }
            if (badge) { badge.className = "w-5 h-5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px] flex items-center justify-center shrink-0 border border-emerald-300"; }
            if (sec) sec.classList.add('hidden');
        } else {
            if (pill) pill.classList.remove('active', 'completed');
            if (badge) badge.className = "w-5 h-5 rounded bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0 border border-slate-200";
            if (sec) sec.classList.add('hidden');
        }
    }

    const indicator = document.getElementById('wizard-step-indicator');
    if (indicator) indicator.innerText = `Step ${s} of 5`;

    const prevBtn = document.getElementById('btn-prev-step');
    if (prevBtn) prevBtn.disabled = (s === 1);

    const nextBtn = document.getElementById('btn-next-step');
    if (nextBtn) {
        if (s === 5) {
            nextBtn.innerHTML = `<span>Save All</span> <i data-lucide="check" size="12"></i>`;
            nextBtn.onclick = () => window.savePropertyToDatabase(true);
        } else {
            nextBtn.innerHTML = `<span>Continue</span> <i data-lucide="arrow-right" size="12"></i>`;
            nextBtn.onclick = () => window.nextStep();
        }
    }

    if (s === 1) {
        window.renderPaymentMethodsTable();
        window.renderAddonsTable();
    }
    if (s === 2) {
        window.compileRoomsFromDefinitions();
        window.renderRoomDefinitionsTable();
    }
    if (s === 3) window.renderUnifiedMappingCards();
    if (s === 4) window.renderPricingStepRules();
    if (s === 5) window.renderReviewLaunchStep();

    if (window.lucide) window.lucide.createIcons();
};

window.nextStep = function() {
    if (window.currentStep < 5) window.jumpStep(window.currentStep + 1);
};

window.prevStep = function() {
    if (window.currentStep > 1) window.jumpStep(window.currentStep - 1);
};

window.toggleCardSection = function(sectionId, chevronId, forceState = null) {
    const sec = document.getElementById(sectionId);
    const icon = document.getElementById(chevronId);
    if (!sec) return;
    const shouldShow = forceState !== null ? forceState : sec.classList.contains('hidden');
    sec.classList.toggle('hidden', !shouldShow);
    if (icon) icon.style.transform = shouldShow ? 'rotate(0deg)' : 'rotate(-90deg)';
};

let _customModalCallback = null;
window.customAlert = function(title, message, isConfirm = false, onConfirm = null) {
    const modal = document.getElementById('custom-app-modal');
    if (!modal) return alert(`${title}\n\n${message}`);
    document.getElementById('modal-title').innerText = title || "Notification";
    document.getElementById('modal-body').innerText = message || "";
    _customModalCallback = onConfirm;

    const cancelBtn = document.getElementById('modal-cancel-btn');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !isConfirm);
    if (confirmBtn) confirmBtn.innerText = isConfirm ? "Confirm" : "OK";

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
};

window.closeCustomModal = function(confirmed) {
    const modal = document.getElementById('custom-app-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    if (confirmed && typeof _customModalCallback === 'function') {
        const cb = _customModalCallback;
        _customModalCallback = null;
        cb();
    } else {
        _customModalCallback = null;
    }
};

async function compressImage(file, maxWidth = 1200, maxHeight = 400, quality = 0.82) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) return resolve({ blob: file, dataUrl: '' });
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxWidth || h > maxHeight) {
                    const ratio = Math.min(maxWidth / w, maxHeight / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const isPng = file.type === 'image/png';
                const mime = isPng ? 'image/png' : 'image/jpeg';
                canvas.toBlob((blob) => {
                    resolve({ blob: blob || file, dataUrl: canvas.toDataURL(mime, quality) });
                }, mime, quality);
            };
            img.onerror = () => resolve({ blob: file, dataUrl: e.target.result });
            img.src = e.target.result;
        };
        reader.onerror = () => resolve({ blob: file, dataUrl: '' });
        reader.readAsDataURL(file);
    });
}

function sanitizeForFirestore(data) {
    if (data === undefined || data === null) return null;
    if (Array.isArray(data)) return data.map(item => sanitizeForFirestore(item));
    if (typeof data === 'object' && !(data instanceof Date)) {
        const cleaned = {};
        for (const [key, val] of Object.entries(data)) {
            cleaned[key] = val !== undefined ? sanitizeForFirestore(val) : null;
        }
        return cleaned;
    }
    return data;
}

// --- LOGO UPLOADS & PREVIEWS ---
window.updateLogoPreview = function(type, url) {
    const cleanUrl = (url || '').trim() || DEFAULT_WW_ICON;
    const img = document.getElementById(`preview-logo-${type}`);
    const inp = document.getElementById(`prop-${type === 'primary' ? 'logo' : (type === 'banner' ? 'banner' : 'icon')}-url`);
    if (img) img.src = cleanUrl;
    if (inp && inp.value !== cleanUrl) inp.value = cleanUrl;
    if (type === 'icon') {
        const navIcon = document.getElementById('nav-brand-icon');
        if (navIcon) navIcon.src = cleanUrl;
    }
};

window.resetLogosToDefault = function() {
    ['primary', 'banner', 'icon'].forEach(t => window.updateLogoPreview(t, DEFAULT_WW_ICON));
};

window.handleLogoFileUpload = async function(event, logoType) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const propId = window.activePropertyId || 'swims_resort';
    const dimensions = {
        primary: { w: 400, h: 120, q: 0.85 },
        banner: { w: 1200, h: 320, q: 0.80 },
        icon: { w: 128, h: 128, q: 0.85 }
    }[logoType] || { w: 800, h: 400, q: 0.80 };

    const compressed = await compressImage(file, dimensions.w, dimensions.h, dimensions.q);
    window.updateLogoPreview(logoType, compressed.dataUrl);

    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const storagePath = `properties/${propId}/logo_${logoType}_${Date.now()}.${ext}`;

    try {
        const sRef = storageRef(storage, storagePath);
        await uploadBytes(sRef, compressed.blob);
        const downloadUrl = await getDownloadURL(sRef);
        window.updateLogoPreview(logoType, downloadUrl);
        window.customAlert("Success", `${logoType.toUpperCase()} logo uploaded and updated.`);
    } catch (err) {
        console.warn("Storage upload failed, keeping compressed thumbnail DataURL:", err);
    }
};

// --- PAYMENT METHODS & COMMISSION (KP) TABLE ---
window.renderPaymentMethodsTable = function() {
    const tbody = document.getElementById('payment-methods-table-body');
    if (!tbody) return;

    if (!Array.isArray(window.paymentMethods) || window.paymentMethods.length === 0) {
        window.paymentMethods = [
            { key: 'cash', label: 'Cash (In-House)', class: 'revenue', active: true },
            { key: 'card', label: 'Credit Card (Terminal / Stripe)', class: 'revenue', active: true },
            { key: 'scan', label: 'QR Scan / Bank Transfer', class: 'revenue', active: true },
            { key: 'bdc-pay', label: 'Booking.com Virtual Card', class: 'revenue', active: true },
            { key: 'bdc-kp', label: 'Booking.com Commission Withheld', class: 'commission', active: true },
            { key: 'agoda-pay', label: 'Agoda Payout (Prepaid)', class: 'revenue', active: true },
            { key: 'agoda-kp', label: 'Agoda Commission Withheld', class: 'commission', active: true },
            { key: 'hw-kp', label: 'Hostelworld Online Deposit (Commission)', class: 'commission', active: true },
            { key: 'airbnb-pay', label: 'Airbnb Payout', class: 'revenue', active: true },
            { key: 'airbnb-kp', label: 'Airbnb Host Fee Withheld', class: 'commission', active: true },
            { key: 'expedia-pay', label: 'Expedia Payout', class: 'revenue', active: true },
            { key: 'expedia-kp', label: 'Expedia Commission Withheld', class: 'commission', active: true }
        ];
    }

    tbody.innerHTML = window.paymentMethods.map((pm, idx) => `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs ${pm.class === 'commission' ? 'bg-rose-50/30' : 'bg-emerald-50/20'}">
            <td class="p-1 px-2 font-mono font-black text-indigo-700">${pm.key}</td>
            <td class="p-1 px-2"><input type="text" class="table-input font-bold" value="${pm.label}" onchange="window.paymentMethods[${idx}].label = this.value"></td>
            <td class="p-1 px-2">
                <select class="table-input font-bold ${pm.class === 'commission' ? 'text-rose-700 bg-rose-50 border-rose-300' : 'text-emerald-700 bg-emerald-50 border-emerald-300'}" onchange="window.paymentMethods[${idx}].class = this.value; window.renderPaymentMethodsTable();">
                    <option value="revenue" ${pm.class === 'revenue' ? 'selected' : ''}>Real Revenue (Collected)</option>
                    <option value="commission" ${pm.class === 'commission' ? 'selected' : ''}>Commission (KP Expense)</option>
                </select>
            </td>
            <td class="p-1 px-2 text-center">
                <span class="px-2 py-0.2 rounded text-[9.5px] font-black uppercase ${pm.class === 'commission' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}">
                    ${pm.class === 'commission' ? 'KP Expense' : 'Real Money'}
                </span>
            </td>
        </tr>
    `).join('');
};

// --- ADDONS MANAGEMENT ---
window.moveAddon = function(idx, direction) {
    if (!Array.isArray(window.addonsList)) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= window.addonsList.length) return;
    
    const temp = window.addonsList[idx];
    window.addonsList[idx] = window.addonsList[targetIdx];
    window.addonsList[targetIdx] = temp;
    window.addonsList.forEach((item, i) => { item.order = i + 1; });
    window.renderAddonsTable();
};

window.renderAddonsTable = function() {
    const tbody = document.getElementById('addon-list-body');
    if (!tbody) return;

    if (!Array.isArray(window.addonsList) || window.addonsList.length === 0) {
        window.addonsList = [
            { id: 'add_1', order: 1, name: 'Late Check-out', category: 'Stay', price: 300, type: 'one-off' },
            { id: 'add_2', order: 2, name: 'Room Upgrade', category: 'Stay', price: 500, type: 'one-off' },
            { id: 'add_3', order: 3, name: 'Laundry Service', category: 'Service', price: 100, type: 'per-item' },
            { id: 'add_4', order: 4, name: 'Airport / Pier Transfer', category: 'Transfer', price: 400, type: 'one-off' }
        ];
    }

    tbody.innerHTML = window.addonsList.map((item, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === window.addonsList.length - 1;
        return `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="p-1 text-center font-mono font-bold text-slate-500 text-[10px] whitespace-nowrap">
                <div class="flex items-center justify-center gap-1">
                    <span class="w-4 text-center text-slate-600 font-bold">${idx + 1}</span>
                    <div class="flex flex-col ml-0.5">
                        <button type="button" onclick="window.moveAddon(${idx}, -1)" ${isFirst ? 'disabled' : ''} class="text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed leading-none p-0.5">
                            <i data-lucide="chevron-up" size="10"></i>
                        </button>
                        <button type="button" onclick="window.moveAddon(${idx}, 1)" ${isLast ? 'disabled' : ''} class="text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed leading-none p-0.5">
                            <i data-lucide="chevron-down" size="10"></i>
                        </button>
                    </div>
                </div>
            </td>
            <td class="p-1"><input type="text" class="table-input font-bold" value="${item.name || ''}" onchange="window.addonsList[${idx}].name = this.value"></td>
            <td class="p-1"><input type="text" class="table-input" value="${item.category || 'General'}" onchange="window.addonsList[${idx}].category = this.value"></td>
            <td class="p-1"><input type="number" step="any" class="table-input font-black text-center text-emerald-700" value="${item.price || 0}" onchange="window.addonsList[${idx}].price = parseFloat(this.value)||0"></td>
            <td class="p-1">
                <select class="table-input font-medium" onchange="window.addonsList[${idx}].type = this.value">
                    <option value="one-off" ${item.type === 'one-off' ? 'selected' : ''}>One-Off</option>
                    <option value="per-day" ${item.type === 'per-day' ? 'selected' : ''}>Per Day</option>
                    <option value="per-item" ${item.type === 'per-item' ? 'selected' : ''}>Per Item</option>
                </select>
            </td>
            <td class="p-1 text-center">
                <button type="button" onclick="window.addonsList.splice(${idx}, 1); window.renderAddonsTable();" class="p-1 text-slate-400 hover:text-rose-600"><i data-lucide="trash-2" size="12"></i></button>
            </td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.addBlankAddonRow = function() {
    window.addonsList = window.addonsList || [];
    window.addonsList.push({
        id: 'add_' + Math.random().toString(36).substr(2, 7),
        order: window.addonsList.length + 1,
        name: 'New Service Item',
        category: 'Service',
        price: 150,
        type: 'one-off'
    });
    window.renderAddonsTable();
};

// --- ROOM INVENTORY DEFINITIONS & GENERATORS ---
window.toggleBatchDormPanel = function(forceState = null) {
    const p = document.getElementById('batch-dorm-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    p.classList.toggle('hidden', !shouldShow);
};

window.toggleBatchRoomPanel = function(forceState = null) {
    const p = document.getElementById('batch-room-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    p.classList.toggle('hidden', !shouldShow);
};

window.executeBatchDormGenerate = function() {
    const roomName = (document.getElementById('gen-dorm-name')?.value || 'DORM A').trim().toUpperCase();
    const catName = (document.getElementById('gen-dorm-cat')?.value || 'Standard 6-Bed Dorm').trim();
    const bedCount = parseInt(document.getElementById('gen-dorm-beds')?.value, 10) || 6;
    const floor = (document.getElementById('gen-dorm-floor')?.value || '1').trim();
    const rule = document.getElementById('gen-dorm-rule')?.value || 'odd-top';

    const existing = window.roomDefinitions.find(r => r.name.toUpperCase() === roomName);
    if (existing) {
        existing.category = catName;
        existing.count = bedCount;
        existing.floor = floor;
        existing.rule = rule;
        existing.isDorm = true;
    } else {
        window.roomDefinitions.push({
            id: 'room_' + Math.random().toString(36).substr(2, 7),
            name: roomName,
            category: catName,
            count: bedCount,
            floor,
            rule,
            isDorm: true
        });
    }

    window.toggleBatchDormPanel(false);
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

window.executeBatchRoomGenerate = function() {
    const prefix = document.getElementById('gen-room-prefix')?.value || 'ROOM ';
    const catName = (document.getElementById('gen-room-cat')?.value || 'Deluxe King Room').trim();
    const startNum = parseInt(document.getElementById('gen-room-start')?.value, 10) || 1;
    const endNum = parseInt(document.getElementById('gen-room-end')?.value, 10) || 4;
    const floor = (document.getElementById('gen-room-floor')?.value || '1').trim();

    if (startNum > endNum) return window.customAlert("Validation Error", "Start number must be <= End number.");

    for (let i = startNum; i <= endNum; i++) {
        const fullRoomName = `${prefix}${i}`;
        const existing = window.roomDefinitions.find(r => r.name.toUpperCase() === fullRoomName.toUpperCase());
        if (existing) {
            existing.category = catName;
            existing.floor = floor;
            existing.count = 1;
            existing.isDorm = false;
        } else {
            window.roomDefinitions.push({
                id: 'room_' + Math.random().toString(36).substr(2, 7),
                name: fullRoomName,
                category: catName,
                count: 1,
                floor,
                rule: 'private',
                isDorm: false
            });
        }
    }

    window.toggleBatchRoomPanel(false);
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

window.compileRoomsFromDefinitions = function() {
    const existingRooms = window.compiledRooms || window.currentPropertyConfig?.rooms || [];
    const existingById = {};
    existingRooms.forEach(r => { if (r.id) existingById[r.id] = r; });

    const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const compiled = [];

    (window.roomDefinitions || []).forEach((def, defIdx) => {
        const rawName = (def.name || def.id || `ROOM ${defIdx + 1}`).trim();
        const category = (def.category || 'Standard Room').trim();
        const floor = (def.floor || '1').trim();
        const total = parseInt(def.count, 10) || 1;
        const isDorm = def.isDorm || def.rule !== 'private';

        if (isDorm) {
            const dormBeds = [];
            for (let b = 1; b <= total; b++) {
                let bunkTag = 'single';
                if (def.rule === 'odd-top') bunkTag = (b % 2 === 1) ? 'top' : 'bottom';
                else if (def.rule === 'even-top') bunkTag = (b % 2 === 0) ? 'top' : 'bottom';

                const bedId = `${rawName}-${b}`;
                const existing = existingById[bedId] || {};

                dormBeds.push({
                    id: bedId,
                    type: category,
                    category: category,
                    floor: floor,
                    bed: bunkTag,
                    bunk: bunkTag,
                    icon: bunkTag,
                    parentRoom: rawName,
                    isDorm: true,
                    ...existing
                });
            }
            dormBeds.sort((a, b) => naturalCollator.compare(a.id, b.id));
            compiled.push(...dormBeds);
        } else {
            const existing = existingById[rawName] || {};
            compiled.push({
                id: rawName,
                type: category,
                category: category,
                floor: floor,
                bed: 'private',
                bunk: 'private',
                icon: 'private',
                parentRoom: rawName,
                bedCount: total,
                isDorm: false,
                ...existing
            });
        }
    });

    window.compiledRooms = compiled;

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.innerText = `${(window.roomDefinitions || []).length} Rooms`;
    if (uBadge) uBadge.innerText = `${compiled.length} Beds/Units Total`;

    window.renderBedPreviewDrawer();
};

window.renderRoomDefinitionsTable = function() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;

    if (!window.roomDefinitions || window.roomDefinitions.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="7" class="p-4 text-center text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                No rooms configured. Use "BATCH DORM" or "BATCH ROOM" above to generate your inventory.
            </td>
        </tr>`;
        return;
    }

    const catList = document.getElementById('setup-category-datalist');
    const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    if (catList) catList.innerHTML = existingCats.map(c => `<option value="${c}"></option>`).join('');

    let html = '';
    let lastCategory = null;

    window.roomDefinitions.forEach((def, idx) => {
        const currentCat = def.category || 'Standard Room';
        const isDorm = def.isDorm || def.rule !== 'private';

        if (currentCat !== lastCategory) {
            lastCategory = currentCat;
            const catRooms = window.roomDefinitions.filter(r => (r.category || 'Standard Room') === currentCat);
            const totalBeds = catRooms.reduce((sum, r) => sum + (parseInt(r.count, 10) || 1), 0);

            html += `
            <tr class="bg-slate-900 text-white border-y-2 border-slate-950 sticky z-10 shadow-xs">
                <td colspan="7" class="py-1 px-2.5">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i data-lucide="folder" size="13" class="text-indigo-400"></i>
                            <span class="font-black text-xs uppercase tracking-wider text-slate-100">${currentCat}</span>
                            <span class="bg-indigo-950 text-indigo-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-indigo-700">
                                ${catRooms.length} Rooms • ${totalBeds} Units
                            </span>
                        </div>
                    </div>
                </td>
            </tr>`;
        }

        // Visual distinction: Dorms get warm amber tint, Privates get crisp white/slate
        const rowBg = isDorm ? 'bg-amber-50/20 hover:bg-amber-50/50' : 'bg-white hover:bg-slate-50';

        html += `
        <tr class="${rowBg} transition-colors border-b border-slate-100" data-room-idx="${idx}">
            <td class="py-0.5 px-1 text-center font-mono font-bold text-slate-500 text-[10px] whitespace-nowrap">
                <span class="w-4 text-center text-slate-600 font-black">${idx + 1}</span>
            </td>
            <td class="py-0.5 px-1"><input type="text" class="table-input font-bold" value="${def.name || ''}" onchange="window.roomDefinitions[${idx}].name = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="py-0.5 px-1"><input type="text" list="setup-category-datalist" class="table-input font-bold text-indigo-700" value="${def.category || ''}" onchange="window.roomDefinitions[${idx}].category = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="py-0.5 px-1 text-center"><input type="number" min="1" max="60" class="table-input font-black text-center !w-14 mx-auto ${isDorm ? 'text-amber-700' : 'text-slate-800'}" value="${def.count || 1}" onchange="window.roomDefinitions[${idx}].count = parseInt(this.value,10)||1; window.compileRoomsFromDefinitions();"></td>
            <td class="py-0.5 px-1"><input type="text" class="table-input text-center !w-16" value="${def.floor || '1'}" onchange="window.roomDefinitions[${idx}].floor = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="py-0.5 px-1">
                <select class="table-input font-semibold ${isDorm ? 'text-amber-800 bg-amber-50/50' : 'text-slate-700'}" onchange="window.roomDefinitions[${idx}].rule = this.value; window.roomDefinitions[${idx}].isDorm = (this.value !== 'private'); window.compileRoomsFromDefinitions(); window.renderRoomDefinitionsTable();">
                    <option value="odd-top" ${def.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="even-top" ${def.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="single" ${def.rule === 'single' ? 'selected' : ''}>DORM (Single)</option>
                    <option value="private" ${def.rule === 'private' ? 'selected' : ''}>PRIVATE ROOM</option>
                </select>
            </td>
            <td class="py-0.5 px-1 text-center">
                <button type="button" onclick="window.roomDefinitions.splice(${idx}, 1); window.compileRoomsFromDefinitions(); window.renderRoomDefinitionsTable();" class="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"><i data-lucide="trash-2" size="12"></i></button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.renderBedPreviewDrawer = function() {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;
    const grouped = {};
    (window.compiledRooms || []).forEach(r => {
        const p = r.parentRoom || r.id;
        if (!grouped[p]) grouped[p] = [];
        grouped[p].push(r);
    });

    container.innerHTML = Object.keys(grouped).map(p => {
        const units = grouped[p];
        return `
        <div class="bg-white p-1.5 rounded border border-slate-300 shadow-2xs min-w-[120px]">
            <div class="font-black text-slate-800 text-[10px] border-b border-slate-200 pb-0.5 mb-1 flex items-center justify-between">
                <span>${p}</span><span class="text-[8.5px] text-slate-400">Fl. ${units[0]?.floor || 1}</span>
            </div>
            <div class="flex flex-wrap gap-1">
                ${units.map(u => `
                    <span class="px-1 py-0.2 rounded text-[8.5px] font-bold ${u.bunk === 'top' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : (u.bunk === 'bottom' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200')}">
                        ${u.id}
                    </span>
                `).join('')}
            </div>
        </div>`;
    }).join('');
};

window.toggleBedPreviewDrawer = function(force) {
    const d = document.getElementById('bed-preview-drawer');
    if (d) d.classList.toggle('hidden', force !== undefined ? !force : undefined);
};

window.clearAllRoomDefs = function() {
    window.customAlert("Clear Rooms", "Wipe all configured rooms?", true, () => {
        window.roomDefinitions = [];
        window.compileRoomsFromDefinitions();
        window.renderRoomDefinitionsTable();
    });
};

window.addBlankRoomDef = function() {
    window.roomDefinitions.push({ id: 'room_' + Date.now(), name: `ROOM ${window.roomDefinitions.length + 1}`, category: 'Standard Room', count: 1, floor: '1', rule: 'private', isDorm: false });
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

// --- CATEGORY REORDERING ENGINE ---
window.openReorderCategoriesModal = function() {
    const defs = window.roomDefinitions || [];
    const counts = {};
    const categories = [];

    defs.forEach(d => {
        const c = d.category || 'Standard Room';
        if (!counts[c]) { counts[c] = { rooms: 0, beds: 0 }; categories.push(c); }
        counts[c].rooms++;
        counts[c].beds += parseInt(d.count, 10) || 1;
    });

    window._tempCategoryOrder = [...categories];
    window._tempCategoryCounts = counts;

    const listEl = document.getElementById('reorder-cat-list');
    if (listEl) {
        listEl.innerHTML = categories.map((cat, idx) => `
            <div class="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 shadow-2xs">
                <span class="font-black text-slate-800 text-xs">${idx + 1}. ${cat}</span>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, -1)" class="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"><i data-lucide="chevron-up" size="13"></i></button>
                    <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, 1)" class="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"><i data-lucide="chevron-down" size="13"></i></button>
                </div>
            </div>
        `).join('');
    }

    const modal = document.getElementById('reorder-categories-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if (window.lucide) window.lucide.createIcons();
};

window.closeReorderCategoriesModal = function() {
    const modal = document.getElementById('reorder-categories-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.shiftCategoryOrderItem = function(idx, direction) {
    const target = idx + direction;
    if (target < 0 || target >= window._tempCategoryOrder.length) return;
    const temp = window._tempCategoryOrder[idx];
    window._tempCategoryOrder[idx] = window._tempCategoryOrder[target];
    window._tempCategoryOrder[target] = temp;
    window.openReorderCategoriesModal();
};

window.applyReorderedCategories = function() {
    const order = window._tempCategoryOrder || [];
    const defs = window.roomDefinitions || [];
    const reordered = [];
    order.forEach(c => {
        reordered.push(...defs.filter(d => (d.category || 'Standard Room') === c));
    });
    window.roomDefinitions = reordered;
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
    window.closeReorderCategoriesModal();
};

// --- CHANNEX INTEGRATION & SMART RATE-TO-ROOM MAPPING ---
window.fetchChannexData = async function() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();
    if (!apiKey || !propId) return window.customAlert("Credentials Required", "Enter both your Channex API Key and Property ID.");

    try {
        const propRes = await fetch(`https://app.channex.io/api/v1/properties/${propId}`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        if (!propRes.ok) throw new Error("Invalid API key or Property ID.");

        const rtRes = await fetch(`https://app.channex.io/api/v1/room_types?filter[property_id]=${propId}&pagination[limit]=100`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        const rtJson = await rtRes.json();
        const channexRooms = rtJson.data || [];
        window.channexRooms = channexRooms;

        const optRes = await fetch(`https://app.channex.io/api/v1/rate_plans/options?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        const optJson = await optRes.json();
        const cleanRatePlans = optJson.data || [];
        window.channexRatePlans = cleanRatePlans;

        window.channexConfig = { apiKey, propId, rateMultiplier: 100 };

        // 1. Build initial channexMap (Channex Room Types -> PMS Categories)
        const pmsCategories = [...new Set((window.roomDefinitions || []).map(r => r.category))];
        window.channexMap = channexRooms.map(cr => {
            const crTitle = cr.attributes?.title || '';
            const matchedPms = pmsCategories.find(c => 
                c.toLowerCase() === crTitle.toLowerCase() || 
                crTitle.toLowerCase().includes(c.toLowerCase()) || 
                c.toLowerCase().includes(crTitle.toLowerCase())
            ) || pmsCategories[0] || 'Standard Room';

            return {
                channexId: cr.id,
                channexTitle: crTitle,
                pmsCategory: matchedPms
            };
        });

        // 2. Build channexRateMap: MAP STRICTLY TO PARENT ROOM CATEGORY
        window.channexRateMap = cleanRatePlans.map(item => {
            const planTitle = item.attributes?.title || '';
            const parentRoomId = item.attributes?.room_type_id || item.relationships?.room_type?.data?.id;
            const parentChannexRoom = channexRooms.find(r => r.id === parentRoomId);
            const parentRoomTitle = parentChannexRoom?.attributes?.title || '';

            let assignedPmsCategory = '';
            const mappedRoomEntry = window.channexMap.find(m => m.channexId === parentRoomId);
            if (mappedRoomEntry) {
                assignedPmsCategory = mappedRoomEntry.pmsCategory;
            } else {
                assignedPmsCategory = pmsCategories.find(c => 
                    c.toLowerCase() === parentRoomTitle.toLowerCase() || 
                    parentRoomTitle.toLowerCase().includes(c.toLowerCase())
                ) || pmsCategories[0] || 'Standard Room';
            }

            const rawChannel = /bdc|booking/i.test(planTitle) ? 'Booking.com' : 
                               (/hw|hostelworld/i.test(planTitle) ? 'Hostelworld' : 
                               (/agoda/i.test(planTitle) ? 'Agoda' : 
                               (/expedia/i.test(planTitle) ? 'Expedia' : 'Default')));

            return {
                ratePlanId: item.id,
                ratePlanTitle: planTitle,
                channexRoomTitle: parentRoomTitle,
                pmsCategory: assignedPmsCategory,
                channel: cleanChannelKey(rawChannel),
                policy: /ref/i.test(planTitle) && !/non-?ref/i.test(planTitle) ? 'ref' : 'non-ref',
                product: /event/i.test(planTitle) ? 'evt' : 'std',
                rateSource: /event/i.test(planTitle) ? 'evt' : 'std'
            };
        });

        // 3. Populate Property-Scoped Channel Rules
        window.populateChannelsFromRateMap();

        window.renderUnifiedMappingCards();
        window.customAlert("Channex Connected", `Successfully mapped ${channexRooms.length} Room Types and ${cleanRatePlans.length} Rate Plans to their proper categories.`);
    } catch (err) {
        console.error("Channex fetch error:", err);
        window.customAlert("Connection Failed", err.message);
    }
};

// DERIVES CHANNELS STRICTLY FROM THE PROPERTY'S OWN RATE MAP
window.populateChannelsFromRateMap = function() {
    const existing = window.pricingRules?.channels || {};
    const propertyChannels = {};

    // 1. Direct (Default Built-in Engine)
    propertyChannels['Direct'] = existing['Direct'] || { type: '-%', val: 10 };

    // 2. Discover channels actively present in this property's rate map
    (window.channexRateMap || []).forEach(plan => {
        const ch = cleanChannelKey(plan.channel);
        if (ch && ch !== 'Default' && ch !== 'Direct') {
            if (!propertyChannels[ch]) {
                propertyChannels[ch] = existing[ch] || { type: '=', val: 0 };
            }
        }
    });

    window.pricingRules.channels = propertyChannels;
    window.renderChannelRulesList();
};

window.openCreateRatePlanModal = function() {
    const checklist = document.getElementById('crp-room-checklist');
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    if (checklist) {
        checklist.innerHTML = cats.map(c => `
            <label class="flex items-center gap-2 p-1 rounded bg-white border border-slate-200 cursor-pointer text-xs font-bold">
                <input type="checkbox" value="${c}" checked class="crp-cat-box rounded"> <span>${c}</span>
            </label>
        `).join('');
    }
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.closeCreateRatePlanModal = function() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.applyRatePlanPreset = function(title, channel, policy) {
    const t = document.getElementById('crp-title');
    const c = document.getElementById('crp-channel');
    const p = document.getElementById('crp-policy');
    if (t) t.value = title;
    if (c) c.value = channel;
    if (p) p.value = policy;
};

window.toggleAllTargetRooms = function(checked) {
    document.querySelectorAll('.crp-cat-box').forEach(cb => cb.checked = !!checked);
};

window.executeCreateAndPushRatePlan = async function() {
    const title = document.getElementById('crp-title')?.value.trim();
    const channel = cleanChannelKey(document.getElementById('crp-channel')?.value || 'DEFAULT');
    const policy = document.getElementById('crp-policy')?.value || 'non-ref';
    const selectedCats = Array.from(document.querySelectorAll('.crp-cat-box:checked')).map(cb => cb.value);

    if (!title) return window.customAlert("Validation Error", "Please provide a Rate Plan Title.");
    if (selectedCats.length === 0) return window.customAlert("Validation Error", "Please select at least one Room Category.");

    const apiKey = window.channexConfig?.apiKey || document.getElementById('chan-api-key')?.value.trim();
    const propId = window.channexConfig?.propId || document.getElementById('chan-prop-id')?.value.trim();

    let pushedCount = 0;
    for (const cat of selectedCats) {
        const mappedRoom = (window.channexMap || []).find(m => m.pmsCategory === cat);
        const roomId = mappedRoom?.channexId;

        if (apiKey && propId && roomId) {
            try {
                const res = await fetch("https://app.channex.io/api/v1/rate_plans", {
                    method: "POST",
                    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        rate_plan: {
                            property_id: propId,
                            room_type_id: roomId,
                            title: title,
                            options: [{ occupancy: 1, rate: 100 }]
                        }
                    })
                });
                if (res.ok) {
                    const json = await res.json();
                    const newId = json.data?.id;
                    window.channexRateMap.push({
                        ratePlanId: newId,
                        ratePlanTitle: title,
                        pmsCategory: cat,
                        channel,
                        policy,
                        product: /event/i.test(title) ? 'evt' : 'std',
                        rateSource: /event/i.test(title) ? 'evt' : 'std'
                    });
                    pushedCount++;
                }
            } catch (err) {
                console.warn(`Could not push to Channex for ${cat}:`, err);
            }
        } else {
            const localId = 'plan_' + Math.random().toString(36).substr(2, 9);
            window.channexRateMap.push({
                ratePlanId: localId,
                ratePlanTitle: title,
                pmsCategory: cat,
                channel,
                policy,
                product: /event/i.test(title) ? 'evt' : 'std',
                rateSource: /event/i.test(title) ? 'evt' : 'std'
            });
            pushedCount++;
        }
    }

    window.populateChannelsFromRateMap();
    window.closeCreateRatePlanModal();
    window.renderUnifiedMappingCards();
    window.customAlert("Rate Plans Ready", `Saved "${title}" across ${pushedCount} categories.`);
};

// PMS-Style Authentic Brand Badges
window.getChannelBadgeHtml = function(channel) {
    const ch = cleanChannelKey(channel);
    if (ch === 'Booking.com') return `<span class="bg-[#003580] text-white px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">BDC</span>`;
    if (ch === 'Hostelworld') return `<span class="bg-[#F15A24] text-white px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">HW</span>`;
    if (ch === 'Agoda') return `<span class="bg-[#87B2D6] text-white px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">AGODA</span>`;
    if (ch === 'Expedia') return `<span class="bg-[#facc15] text-[#003580] px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">EXPEDIA</span>`;
    if (ch === 'Airbnb') return `<span class="bg-[#FF5A5F] text-white px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">AIRBNB</span>`;
    if (ch === 'Direct') return `<span class="bg-teal-600 text-white px-1.5 py-0.2 text-[9.5px] font-black rounded shrink-0">DIRECT</span>`;
    return `<span class="bg-emerald-600 text-white px-1.5 py-0.2 text-[9px] font-black rounded shrink-0">DEFAULT</span>`;
};

window.renderUnifiedMappingCards = function() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    if (pmsCats.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs font-bold text-slate-400">Define rooms in Step 2 first.</div>`;
        return;
    }

    container.innerHTML = pmsCats.map((cat, idx) => {
        const plans = (window.channexRateMap || []).filter(p => p.pmsCategory === cat);
        const cardBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';

        return `
            <div class="${cardBg} border border-slate-300 rounded-lg p-2.5 shadow-xs mb-1.5">
                <div class="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-1.5">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span class="font-black text-xs uppercase text-slate-800">${cat}</span>
                    </div>
                    <span class="text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        ${plans.length} Mapped Rate Plans
                    </span>
                </div>
                <div class="space-y-1">
                    ${plans.length > 0 ? plans.map(p => `
                        <div class="flex items-center justify-between text-xs p-1 px-1.5 rounded bg-white border border-slate-200 hover:border-indigo-300 transition-colors">
                            <span class="font-bold text-slate-700 text-[11px] truncate mr-2">${p.ratePlanTitle}</span>
                            <div class="flex items-center gap-1.5 shrink-0">
                                ${window.getChannelBadgeHtml(p.channel)}
                                <span class="text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${p.policy === 'ref' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">${p.policy}</span>
                            </div>
                        </div>
                    `).join('') : `<div class="text-[10px] text-slate-400 italic py-1 px-1">No rate plans linked to this category.</div>`}
                </div>
            </div>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
};

// --- STEP 4 PRICING & CHANNELS ---
window.renderPricingStepRules = function() {
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    const dormSelect = document.getElementById('anchor-dorm-select');
    const privSelect = document.getElementById('anchor-private-select');

    const opts = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (dormSelect) { dormSelect.innerHTML = opts; dormSelect.value = window.pricingRules.anchorDorm || cats.find(c => c.toLowerCase().includes('dorm')) || cats[0] || ''; }
    if (privSelect) { privSelect.innerHTML = opts; privSelect.value = window.pricingRules.anchorPrivate || cats.find(c => !c.toLowerCase().includes('dorm')) || cats[0] || ''; }

    const stdRefInput = document.getElementById('rule-std-ref');
    const evtRefInput = document.getElementById('rule-evt-ref');
    if (stdRefInput) stdRefInput.value = window.pricingRules.stdRefVal || 25;
    if (evtRefInput) evtRefInput.value = window.pricingRules.evtRefVal || 25;

    window.renderRelationships();
    window.renderChannelRulesList();
};

window.renderRelationships = function() {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    const catOpts = cats.map(c => `<option value="${c}">${c}</option>`).join('');

    tbody.innerHTML = (window.relationships || []).map((rel, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
            <td class="p-1"><select class="table-input font-bold" onchange="window.relationships[${idx}].anchor = this.value"><option value="unlinked">-- Unlinked --</option>${catOpts}</select></td>
            <td class="p-1"><select class="table-input font-bold" onchange="window.relationships[${idx}].target = this.value">${catOpts}</select></td>
            <td class="p-1">
                <div class="flex items-center gap-1">
                    <select class="table-input !w-20 font-black text-center" onchange="window.relationships[${idx}].type = this.value">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" step="any" class="table-input font-bold text-center !w-16" value="${rel.val || 0}" onchange="window.relationships[${idx}].val = parseFloat(this.value)||0">
                </div>
            </td>
            <td class="p-1 evt-col-cell">
                <div class="flex items-center gap-1">
                    <select class="table-input !w-20 font-black text-center text-pink-700" onchange="window.relationships[${idx}].typeFmp = this.value">
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" step="any" class="table-input font-bold text-center !w-16 text-pink-700" value="${rel.valFmp || 0}" onchange="window.relationships[${idx}].valFmp = parseFloat(this.value)||0">
                </div>
            </td>
            <td class="p-1 text-center"><button type="button" onclick="window.relationships.splice(${idx}, 1); window.renderRelationships();" class="text-slate-400 hover:text-rose-600 cursor-pointer"><i data-lucide="trash-2" size="12"></i></button></td>
        </tr>
    `).join('');

    (window.relationships || []).forEach((rel, idx) => {
        const tr = tbody.children[idx];
        if (tr) {
            const selects = tr.querySelectorAll('select');
            if (selects[0]) selects[0].value = rel.anchor || 'unlinked';
            if (selects[1]) selects[1].value = rel.target || cats[0];
        }
    });

    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = function() {
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    window.relationships.push({ anchor: cats[0] || '', target: cats[1] || cats[0] || '', type: '=', val: 0, typeFmp: '=', valFmp: 0 });
    window.renderRelationships();
};

window.renderChannelRulesList = function() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;

    const channels = window.pricingRules.channels || {};
    const keys = Object.keys(channels).filter(k => k !== 'Default');

    if (keys.length === 0) {
        container.innerHTML = `
            <div class="text-[10px] text-slate-400 italic p-2 bg-white rounded border border-slate-200">
                All OTAs are currently selling directly from your Base Rate Anchor. Click "+ Add Channel" to define custom multipliers.
            </div>`;
        return;
    }

    container.innerHTML = keys.map(ch => {
        const conf = channels[ch] || { type: '=', val: 0 };
        const badgeHtml = window.getChannelBadgeHtml(ch);

        return `
        <div class="flex items-center justify-between p-1 px-2 rounded bg-white border border-slate-200 shadow-2xs">
            <div class="flex items-center gap-2">
                ${badgeHtml}
                <span class="font-bold text-xs text-slate-800">${ch}</span>
            </div>
            <div class="flex items-center gap-1">
                <select class="table-input !w-20 font-black text-center !py-0.5" onchange="window.pricingRules.channels['${ch}'].type = this.value">
                    <option value="=" ${conf.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${conf.type === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${conf.type === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+" ${conf.type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${conf.type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" step="any" class="table-input font-bold text-center !w-16 !py-0.5" value="${conf.val || 0}" onchange="window.pricingRules.channels['${ch}'].val = parseFloat(this.value)||0">
            </div>
        </div>`;
    }).join('');
};

window.addVerifiedChannelRule = function() {
    const ch = prompt("Enter Channel Name (e.g. Airbnb):");
    if (ch && ch.trim()) {
        const clean = cleanChannelKey(ch.trim());
        window.pricingRules.channels = window.pricingRules.channels || {};
        window.pricingRules.channels[clean] = { type: '+%', val: 10 };
        window.renderChannelRulesList();
    }
};

window.toggleEventSettings = function(enabled) {
    const panel = document.getElementById('event-curve-panel');
    if (panel) panel.classList.toggle('hidden', !enabled);
    document.querySelectorAll('.evt-col-header, .evt-col-cell, #evt-ref-row').forEach(el => {
        el.style.display = enabled ? '' : 'none';
    });
};

window.cycleRatesSpan = function() {
    window.ratesSpan = (window.ratesSpan === 2) ? 3 : 2;
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `±${window.ratesSpan} Days`;
};

window.cycleRestrSpan = function() {
    window.restrSpan = (window.restrSpan === 6) ? 7 : (window.restrSpan === 7 ? 2 : 6);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `±${window.restrSpan} Days`;
};

window.renderReviewLaunchStep = function() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setTxt('rev-prop-name', document.getElementById('prop-name')?.value || window.activePropertyId);
    setTxt('rev-prop-code', document.getElementById('prop-short')?.value || '');
    setTxt('rev-inv-count', `${(window.compiledRooms || []).length} Units`);
    setTxt('rev-cat-count', `${(window.roomDefinitions || []).length} Categories`);
    setTxt('rev-chan-status', window.channexConfig?.propId ? 'Configured' : 'Offline / Standalone');
    setTxt('rev-chan-plans', `${(window.channexRateMap || []).length} Plans Mapped`);
};

window.launchApp = function(appKey) {
    const pCode = (document.getElementById('prop-short')?.value || window.activePropertyId || 'SWIMS').toUpperCase();
    window.location.href = `${appKey}.html?p=${encodeURIComponent(pCode)}`;
};

// --- DATABASE LOAD & SAVE ---
window.loadPropertyFromDatabase = async function(propId) {
    if (!propId) return;
    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Loading ${propId}...`;

    try {
        const propDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (!propDoc.exists()) throw new Error(`Property ${propId} not found.`);

        const pData = propDoc.data() || {};
        window.currentPropertyConfig = pData;
        window.activePropertyId = propId;

        // Reset memory state completely on property switch
        window.pricingRules.channels = {};

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setVal('prop-name', pData.name || propId);
        setVal('prop-short', (pData.short || pData.shortCode || propId).toUpperCase());
        setVal('prop-currency', pData.currency || 'THB');
        setVal('prop-timezone', pData.timezone || 'Asia/Bangkok');
        setVal('prop-address', pData.address || '');
        setVal('prop-email', pData.email || '');
        setVal('prop-phone', pData.phone || '');
        setVal('prop-website', pData.website || '');

        const activeIcon = pData.iconUrl || pData.logoUrl || DEFAULT_WW_ICON;
        window.updateLogoPreview('primary', pData.logoUrl || DEFAULT_WW_ICON);
        window.updateLogoPreview('banner', pData.bannerUrl || DEFAULT_WW_ICON);
        window.updateLogoPreview('icon', activeIcon);

        window.addonsList = pData.addons || [];
        window.renderAddonsTable();

        window.paymentMethods = pData.paymentMethods || [];
        window.renderPaymentMethodsTable();

        window.roomDefinitions = pData.roomDefinitions || [];
        window.compiledRooms = pData.rooms || [];
        if (window.roomDefinitions.length === 0 && window.compiledRooms.length > 0) {
            window.roomDefinitions = window.compiledRooms.map((r, i) => ({
                id: 'room_' + i, name: r.id, category: r.type || r.category || 'Standard', count: 1, floor: r.floor || '1', rule: r.isDorm ? 'single' : 'private', isDorm: !!r.isDorm
            }));
        }
        window.renderRoomDefinitionsTable();

        window.channexConfig = pData.channex || {};
        setVal('chan-api-key', window.channexConfig.apiKey || '');
        setVal('chan-prop-id', window.channexConfig.propId || '');
        window.channexRateMap = pData.channexRateMap || [];

        const pPricingDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        if (pPricingDoc.exists()) {
            const pDataPricing = pPricingDoc.data() || {};
            window.relationships = pDataPricing.relationships || [];
            window.pricingRules = { ...window.pricingRules, ...(pDataPricing.pricingRules || {}) };
        }

        // Strictly derive channels from this property's own rate map
        window.populateChannelsFromRateMap();

        if (statusText) statusText.innerText = "Ready";
    } catch (err) {
        console.error("Load error:", err);
        if (statusText) statusText.innerText = `Error: ${err.message}`;
    }
};

window.savePropertyToDatabase = async function(showModal = true) {
    const propId = window.activePropertyId;
    if (!propId) return window.customAlert("Error", "No active property selected.");

    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = "Saving configuration...";

    try {
        const getVal = id => document.getElementById(id)?.value?.trim() || '';
        const name = getVal('prop-name') || propId;
        const short = (getVal('prop-short') || propId).toUpperCase();

        if (window.roomDefinitions.length > 0) {
            window.compileRoomsFromDefinitions();
        }

        const propertyPayload = {
            name,
            short,
            shortCode: short,
            currency: getVal('prop-currency') || 'THB',
            timezone: getVal('prop-timezone') || 'Asia/Bangkok',
            address: getVal('prop-address'),
            email: getVal('prop-email'),
            phone: getVal('prop-phone'),
            website: getVal('prop-website'),
            logoUrl: getVal('prop-logo-url') || DEFAULT_WW_ICON,
            bannerUrl: getVal('prop-banner-url') || DEFAULT_WW_ICON,
            iconUrl: getVal('prop-icon-url') || DEFAULT_WW_ICON,
            addons: window.addonsList || [],
            paymentMethods: window.paymentMethods || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: window.compiledRooms || [],
            channex: {
                apiKey: getVal('chan-api-key') || window.channexConfig.apiKey || '',
                propId: getVal('chan-prop-id') || window.channexConfig.propId || '',
                rateMultiplier: 100
            },
            channexRateMap: window.channexRateMap || [],
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), sanitizeForFirestore(propertyPayload), { merge: true });

        const dormAnchor = document.getElementById('anchor-dorm-select')?.value;
        const privAnchor = document.getElementById('anchor-private-select')?.value;
        if (dormAnchor) window.pricingRules.anchorDorm = dormAnchor;
        if (privAnchor) window.pricingRules.anchorPrivate = privAnchor;

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`), sanitizeForFirestore({
            pricingRules: window.pricingRules,
            relationships: window.relationships || [],
            updatedAt: new Date().toISOString()
        }), { merge: true });

        if (statusText) statusText.innerText = "Saved!";
        if (showModal) window.customAlert("Success", `Configuration for "${name}" (${short}) saved.`);
    } catch (err) {
        console.error("Save error:", err);
        if (statusText) statusText.innerText = "Save Failed";
        window.customAlert("Save Error", err.message);
    }
};

window.switchSetupProperty = async function(propId) {
    if (!propId || propId === window.activePropertyId) return;
    window.activePropertyId = propId;
    await window.loadPropertyFromDatabase(propId);
    window.jumpStep(1);
};

// --- INITIALIZER ---
async function initSetupEngine() {
    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.warn("Auth note:", err);
    }

    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        window.availableProperties = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sel = document.getElementById('property-select');
        if (sel) {
            sel.innerHTML = window.availableProperties.map(p => `
                <option value="${p.id}">${p.name || p.id} (${(p.short || p.shortCode || p.id).toUpperCase()})</option>
            `).join('');
        }
    } catch (e) {
        console.error("Properties list load failed:", e);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const pParam = (urlParams.get('p') || '').trim();
    let targetId = window.availableProperties[0]?.id || 'swims_resort';

    if (pParam) {
        const pNorm = pParam.toLowerCase();
        const found = window.availableProperties.find(p => 
            p.id.toLowerCase() === pNorm || 
            (p.short && p.short.toLowerCase() === pNorm) ||
            (p.shortCode && p.shortCode.toLowerCase() === pNorm)
        );
        if (found) targetId = found.id;
    }

    const sel = document.getElementById('property-select');
    if (sel) sel.value = targetId;
    window.activePropertyId = targetId;

    await window.loadPropertyFromDatabase(targetId);
    window.jumpStep(1);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetupEngine);
} else {
    setTimeout(initSetupEngine, 0);
}
