// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// Wild & Wandering Property Management System
// Hosted at: https://loren-6q.github.io/PMS/setup-engine.js
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
    masterDriver: 'Direct',
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

window.jumpStep = function(step) {
    window.currentStep = Math.max(1, Math.min(5, parseInt(step, 10) || 1));
    for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById(`pill-step-${i}`);
        const badge = document.getElementById(`badge-step-${i}`);
        const sec = document.getElementById(`step-content-${i}`);
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

    if (window.currentStep === 2) {
        window.renderRoomDefinitionsTable();
        window.renderBedPreviewDrawer();
    } else if (window.currentStep === 3) {
        window.renderStep3Mapping();
    } else if (window.currentStep === 4) {
        window.renderStep4Controls();
    } else if (window.currentStep === 5) {
        window.renderStep5Review();
    }
    if (window.lucide) window.lucide.createIcons();
};

window.nextStep = function() {
    if (window.currentStep < 5) window.jumpStep(window.currentStep + 1);
};

window.prevStep = function() {
    if (window.currentStep > 1) window.jumpStep(window.currentStep - 1);
};

window.toggleCardSection = function(contentId, chevronId) {
    const el = document.getElementById(contentId);
    const ch = document.getElementById(chevronId);
    if (!el) return;
    const isClosed = el.classList.contains('hidden');
    el.classList.toggle('hidden', !isClosed);
    if (ch) ch.style.transform = isClosed ? 'rotate(0deg)' : 'rotate(-90deg)';
};

// --- LOGO UPLOAD & ASSETS ---

function compressImageFile(file, maxWidth = 400, maxHeight = 400, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > h) {
                    if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
                } else {
                    if (h > maxHeight) { w = Math.round((h * maxHeight) / h); h = maxHeight; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    resolve({ blob, dataUrl: canvas.toDataURL('image/png', quality) });
                }, 'image/png', quality);
            };
            img.onerror = () => resolve({ blob: file, dataUrl: e.target.result });
        };
        reader.onerror = () => resolve({ blob: file, dataUrl: null });
    });
}

window.handleLogoFileUpload = async function(event, logoType) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dimensions = logoType === 'icon' ? { w: 128, h: 128, q: 0.9 } : (logoType === 'banner' ? { w: 800, h: 200, q: 0.85 } : { w: 400, h: 400, q: 0.85 });
    const compressed = await compressImageFile(file, dimensions.w, dimensions.h, dimensions.q);

    window.updateLogoPreview(logoType, compressed.dataUrl);

    try {
        const canonId = window.activePropertyId;
        if (!canonId) return;
        const fileRef = storageRef(storage, `brand_assets/${canonId}_${logoType}_${Date.now()}.png`);
        const snap = await uploadBytes(fileRef, compressed.blob);
        const downloadUrl = await getDownloadURL(snap.ref);

        if (logoType === 'primary') {
            document.getElementById('prop-logo-url').value = downloadUrl;
            window.currentPropertyConfig.logoUrl = downloadUrl;
        } else if (logoType === 'banner') {
            document.getElementById('prop-banner-url').value = downloadUrl;
            window.currentPropertyConfig.bannerUrl = downloadUrl;
        } else if (logoType === 'icon') {
            document.getElementById('prop-icon-url').value = downloadUrl;
            window.currentPropertyConfig.iconUrl = downloadUrl;
        }
    } catch (err) {
        console.warn("Storage upload notice:", err);
    }
};

window.updateLogoPreview = function(logoType, url) {
    const fallback = DEFAULT_WW_ICON;
    const finalUrl = url && url.trim() ? url.trim() : fallback;
    if (logoType === 'primary') {
        const el = document.getElementById('preview-logo-primary');
        if (el) el.src = finalUrl;
        window.currentPropertyConfig.logoUrl = url;
    } else if (logoType === 'banner') {
        const el = document.getElementById('preview-logo-banner');
        if (el) el.src = finalUrl;
        window.currentPropertyConfig.bannerUrl = url;
    } else if (logoType === 'icon') {
        const el = document.getElementById('preview-logo-icon');
        if (el) el.src = finalUrl;
        const navIcon = document.getElementById('nav-brand-icon');
        if (navIcon) navIcon.src = finalUrl;
        window.currentPropertyConfig.iconUrl = url;
    }
};

window.resetLogosToDefault = function() {
    ['prop-logo-url', 'prop-banner-url', 'prop-icon-url'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    window.updateLogoPreview('primary', '');
    window.updateLogoPreview('banner', '');
    window.updateLogoPreview('icon', '');
};

// --- PAYMENT METHODS & ADDONS ---

window.renderPaymentMethodsTable = function() {
    const tbody = document.getElementById('payment-methods-table-body');
    if (!tbody) return;

    if (!window.paymentMethods || window.paymentMethods.length === 0) {
        window.paymentMethods = [
            { key: 'cash', label: 'Cash (THB)', class: 'revenue', active: true },
            { key: 'scan', label: 'QR Bank Transfer / PromptPay', class: 'revenue', active: true },
            { key: 'card', label: 'Credit Card / EDC Terminal', class: 'revenue', active: true },
            { key: 'bdc-pay', label: 'Booking.com Virtual Card', class: 'revenue', active: true },
            { key: 'bdc-kp', label: 'Booking.com Commission Withheld', class: 'commission', active: true },
            { key: 'hw-pay', label: 'Hostelworld Payout', class: 'revenue', active: true },
            { key: 'hw-kp', label: 'Hostelworld Online Deposit', class: 'commission', active: true },
            { key: 'agoda-pay', label: 'Agoda Payout / eCard', class: 'revenue', active: true },
            { key: 'agoda-kp', label: 'Agoda Commission Withheld', class: 'commission', active: true },
            { key: 'other', label: 'Other Settlement', class: 'revenue', active: true }
        ];
    }

    tbody.innerHTML = window.paymentMethods.map((p, idx) => `
        <tr class="${p.class === 'commission' ? 'bg-rose-50/50' : 'bg-white'} hover:bg-slate-50 transition-colors">
            <td class="font-mono font-bold text-slate-700">${p.key}</td>
            <td>
                <input type="text" value="${p.label || ''}" class="table-input font-bold" onchange="window.paymentMethods[${idx}].label = this.value">
            </td>
            <td>
                <select class="table-input font-bold ${p.class === 'commission' ? 'text-rose-700 bg-rose-50' : 'text-emerald-700'}" onchange="window.paymentMethods[${idx}].class = this.value; window.renderPaymentMethodsTable();">
                    <option value="revenue" ${p.class === 'revenue' ? 'selected' : ''}>Revenue / Collected Payout</option>
                    <option value="commission" ${p.class === 'commission' ? 'selected' : ''}>Withheld OTA Commission (Expense)</option>
                </select>
            </td>
            <td class="text-center">
                <input type="checkbox" ${p.active ? 'checked' : ''} onchange="window.paymentMethods[${idx}].active = this.checked" class="cursor-pointer">
            </td>
        </tr>
    `).join('');
};

window.renderAddonsTable = function() {
    const tbody = document.getElementById('addon-list-body');
    if (!tbody) return;

    window.addonsList = window.addonsList || [];
    window.addonsList.sort((a, b) => (a.order || 0) - (b.order || 0));

    tbody.innerHTML = window.addonsList.map((item, idx) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="text-center">
                <div class="order-btn-col">
                    <button type="button" onclick="window.moveAddon(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="order-arrow-btn text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer">
                        <i data-lucide="chevron-up"></i>
                    </button>
                    <button type="button" onclick="window.moveAddon(${idx}, 1)" ${idx === window.addonsList.length - 1 ? 'disabled' : ''} class="order-arrow-btn text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer">
                        <i data-lucide="chevron-down"></i>
                    </button>
                </div>
            </td>
            <td>
                <input type="text" value="${item.name || ''}" class="table-input font-bold" onchange="window.addonsList[${idx}].name = this.value">
            </td>
            <td>
                <input type="text" value="${item.category || ''}" class="table-input" onchange="window.addonsList[${idx}].category = this.value">
            </td>
            <td class="text-center">
                <input type="number" value="${item.price || 0}" class="table-input text-center font-bold" onchange="window.addonsList[${idx}].price = parseFloat(this.value) || 0">
            </td>
            <td>
                <select class="table-input font-bold" onchange="window.addonsList[${idx}].type = this.value">
                    <option value="one-off" ${item.type === 'one-off' ? 'selected' : ''}>One-Off Charge</option>
                    <option value="per-night" ${item.type === 'per-night' ? 'selected' : ''}>Per Night</option>
                    <option value="deposit" ${item.type === 'deposit' ? 'selected' : ''}>Refundable Deposit</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.removeAddonRow(${idx})" class="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer">
                    <i data-lucide="trash-2" size="12"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.moveAddon = function(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= window.addonsList.length) return;
    const temp = window.addonsList[index];
    window.addonsList[index] = window.addonsList[target];
    window.addonsList[target] = temp;
    window.addonsList.forEach((a, i) => { a.order = i + 1; });
    window.renderAddonsTable();
};

window.addBlankAddonRow = function() {
    window.addonsList.push({
        id: `add_${Date.now()}`,
        order: window.addonsList.length + 1,
        name: 'New Service',
        category: 'Service',
        price: 100,
        type: 'one-off'
    });
    window.renderAddonsTable();
};

window.removeAddonRow = function(index) {
    window.addonsList.splice(index, 1);
    window.addonsList.forEach((a, i) => { a.order = i + 1; });
    window.renderAddonsTable();
};

// --- STEP 2: ROOM INVENTORY & COMPILER ---

window.toggleBatchDormPanel = function(force) {
    const p = document.getElementById('batch-dorm-panel');
    if (!p) return;
    const isClosed = force !== undefined ? !force : p.classList.contains('hidden');
    p.classList.toggle('hidden', !isClosed);
};

window.toggleBatchRoomPanel = function(force) {
    const p = document.getElementById('batch-room-panel');
    if (!p) return;
    const isClosed = force !== undefined ? !force : p.classList.contains('hidden');
    p.classList.toggle('hidden', !isClosed);
};

window.compileRoomsFromDefinitions = function() {
    const compiled = [];
    (window.roomDefinitions || []).forEach(r => {
        const rawName = (r.name || '').trim();
        const category = (r.category || 'Standard Room').trim();
        const total = Math.max(1, parseInt(r.bedsCount || 1, 10));
        const floor = (r.floor || '1').trim();
        const rule = r.rule || 'single';

        if (rule === 'private') {
            compiled.push({
                id: rawName,
                name: rawName,
                displayId: rawName,
                category,
                type: category,
                floor,
                bed: 'private',
                bunk: 'private',
                icon: 'private',
                parentRoom: rawName,
                isDorm: false
            });
        } else {
            for (let b = 1; b <= total; b++) {
                const bedId = `${rawName}-${b}`;
                let bunkTag = 'single';
                if (rule === 'odd-top') {
                    bunkTag = (b % 2 !== 0) ? 'top' : 'bottom';
                } else if (rule === 'even-top') {
                    bunkTag = (b % 2 === 0) ? 'top' : 'bottom';
                }
                compiled.push({
                    id: bedId,
                    name: bedId,
                    displayId: bedId,
                    category,
                    type: category,
                    floor,
                    bed: bunkTag,
                    bunk: bunkTag,
                    icon: bunkTag === 'top' ? 'top' : 'bot',
                    parentRoom: rawName,
                    isDorm: true
                });
            }
        }
    });

    window.compiledRooms = compiled;

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.innerText = `${(window.roomDefinitions || []).length} Rooms`;
    if (uBadge) uBadge.innerText = `${compiled.length} Beds Total`;

    window.updateCategoryDatalist();
};

window.updateCategoryDatalist = function() {
    const dl = document.getElementById('setup-category-datalist');
    if (!dl) return;
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
    dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
};

window.renderRoomDefinitionsTable = function() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;

    if (!window.roomDefinitions || window.roomDefinitions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-4 text-center text-slate-400 font-bold">
                    No rooms configured yet. Click "+ Add Room", "Batch Dorm", or "Batch Room" above.
                </td>
            </tr>
        `;
        window.compileRoomsFromDefinitions();
        return;
    }

    tbody.innerHTML = window.roomDefinitions.map((r, idx) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="text-center font-mono font-bold text-slate-400">${idx + 1}</td>
            <td>
                <input type="text" value="${r.name || ''}" class="table-input font-bold" onchange="window.roomDefinitions[${idx}].name = this.value; window.compileRoomsFromDefinitions();">
            </td>
            <td>
                <input type="text" list="setup-category-datalist" value="${r.category || ''}" class="table-input font-bold" onchange="window.handleRoomCategoryChange(${idx}, this.value)">
            </td>
            <td class="text-center">
                <input type="number" min="1" max="60" value="${r.bedsCount || 1}" class="table-input text-center font-bold" onchange="window.roomDefinitions[${idx}].bedsCount = parseInt(this.value, 10) || 1; window.compileRoomsFromDefinitions();">
            </td>
            <td class="text-center">
                <input type="text" value="${r.floor || '1'}" class="table-input text-center font-bold" onchange="window.roomDefinitions[${idx}].floor = this.value; window.compileRoomsFromDefinitions();">
            </td>
            <td>
                <select class="table-input font-bold" onchange="window.roomDefinitions[${idx}].rule = this.value; window.compileRoomsFromDefinitions();">
                    <option value="odd-top" ${r.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="even-top" ${r.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="single" ${r.rule === 'single' ? 'selected' : ''}>DORM (Single Beds)</option>
                    <option value="private" ${r.rule === 'private' ? 'selected' : ''}>PRIVATE ROOM</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.removeRoomDef(${idx})" class="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer">
                    <i data-lucide="trash-2" size="12"></i>
                </button>
            </td>
        </tr>
    `).join('');

    window.compileRoomsFromDefinitions();
    if (window.lucide) window.lucide.createIcons();
};

window.handleRoomCategoryChange = function(index, newCategory) {
    if (!window.roomDefinitions[index]) return;
    window.roomDefinitions[index].category = newCategory.trim();

    // Re-group rooms under identical categories
    const groups = {};
    window.roomDefinitions.forEach(r => {
        const cat = r.category || 'Standard Room';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(r);
    });
    window.roomDefinitions = Object.values(groups).flat();

    window.renderRoomDefinitionsTable();
    window.renderBedPreviewDrawer();
};

window.addBlankRoomDef = function() {
    window.roomDefinitions.push({
        name: `ROOM ${window.roomDefinitions.length + 1}`,
        category: 'Standard Room',
        bedsCount: 1,
        floor: '1',
        rule: 'private'
    });
    window.renderRoomDefinitionsTable();
};

window.removeRoomDef = function(index) {
    window.roomDefinitions.splice(index, 1);
    window.renderRoomDefinitionsTable();
    window.renderBedPreviewDrawer();
};

window.clearAllRoomDefs = function() {
    window.customAlert("Clear Room Inventory?", "This will remove all room definitions from the table.", true, () => {
        window.roomDefinitions = [];
        window.renderRoomDefinitionsTable();
        window.renderBedPreviewDrawer();
    });
};

window.executeBatchDormGenerate = function() {
    const rawName = document.getElementById('gen-dorm-name').value.trim() || 'DORM A';
    const category = document.getElementById('gen-dorm-cat').value.trim() || 'Standard 6-Bed Dorm';
    const bedsCount = parseInt(document.getElementById('gen-dorm-beds').value, 10) || 6;
    const floor = document.getElementById('gen-dorm-floor').value.trim() || '1';
    const rule = document.getElementById('gen-dorm-rule').value;

    window.roomDefinitions.push({ name: rawName, category, bedsCount, floor, rule });
    window.toggleBatchDormPanel(false);
    window.renderRoomDefinitionsTable();
    window.renderBedPreviewDrawer();
};

window.executeBatchRoomGenerate = function() {
    const prefix = document.getElementById('gen-room-prefix').value.trim() || 'ROOM ';
    const category = document.getElementById('gen-room-cat').value.trim() || 'Deluxe King Room';
    const startNum = parseInt(document.getElementById('gen-room-start').value, 10) || 1;
    const endNum = parseInt(document.getElementById('gen-room-end').value, 10) || 4;
    const floor = document.getElementById('gen-room-floor').value.trim() || '1';

    for (let i = startNum; i <= endNum; i++) {
        window.roomDefinitions.push({
            name: `${prefix}${i}`,
            category,
            bedsCount: 1,
            floor,
            rule: 'private'
        });
    }

    window.toggleBatchRoomPanel(false);
    window.renderRoomDefinitionsTable();
    window.renderBedPreviewDrawer();
};

window.renderBedPreviewDrawer = function() {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;

    const grouped = {};
    (window.compiledRooms || []).forEach(b => {
        const cat = b.category || 'Standard';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(b);
    });

    container.innerHTML = Object.entries(grouped).map(([cat, beds]) => `
        <div class="border border-slate-300 rounded bg-white p-2 min-w-[220px] shadow-2xs">
            <div class="border-b border-slate-200 pb-1 mb-1 font-black text-[10px] text-slate-800 uppercase flex justify-between">
                <span>${cat}</span>
                <span class="text-indigo-600">${beds.length} beds</span>
            </div>
            <div class="flex flex-wrap gap-1">
                ${beds.map(u => {
                    const isTop = u.bunk === 'top';
                    const isBottom = u.bunk === 'bottom';
                    const badgeClass = isTop
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : (isBottom ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-300');
                    return `
                        <span class="px-1.5 py-0.5 rounded text-[9.5px] font-black border uppercase ${badgeClass}" title="${u.id} (${u.bed})">
                            ${u.id}
                        </span>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
};

window.toggleBedPreviewDrawer = function() {
    const d = document.getElementById('bed-preview-drawer');
    if (!d) return;
    d.classList.toggle('hidden');
};

// --- CATEGORY REORDERING MODAL ---

window.openReorderCategoriesModal = function() {
    const modal = document.getElementById('reorder-categories-modal');
    if (!modal) return;
    window._tempCategoryOrder = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
    window.renderReorderCategoryList();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeReorderCategoriesModal = function() {
    const modal = document.getElementById('reorder-categories-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.renderReorderCategoryList = function() {
    const list = document.getElementById('reorder-cat-list');
    if (!list) return;

    list.innerHTML = (window._tempCategoryOrder || []).map((cat, idx) => `
        <div class="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 shadow-2xs">
            <span class="flex items-center gap-1.5">
                <span class="w-4 h-4 rounded bg-slate-100 text-slate-500 font-mono text-[10px] flex items-center justify-center">${idx + 1}</span>
                <span>${cat}</span>
            </span>
            <div class="flex items-center gap-1">
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="p-1 hover:bg-slate-100 disabled:opacity-20 rounded text-slate-600 cursor-pointer">
                    <i data-lucide="chevron-up" size="13"></i>
                </button>
                <button type="button" onclick="window.shiftCategoryOrderItem(${idx}, 1)" ${idx === window._tempCategoryOrder.length - 1 ? 'disabled' : ''} class="p-1 hover:bg-slate-100 disabled:opacity-20 rounded text-slate-600 cursor-pointer">
                    <i data-lucide="chevron-down" size="13"></i>
                </button>
            </div>
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.shiftCategoryOrderItem = function(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= window._tempCategoryOrder.length) return;
    const temp = window._tempCategoryOrder[index];
    window._tempCategoryOrder[index] = window._tempCategoryOrder[target];
    window._tempCategoryOrder[target] = temp;
    window.renderReorderCategoryList();
};

window.applyReorderedCategories = function() {
    const orderMap = {};
    (window._tempCategoryOrder || []).forEach((c, i) => { orderMap[c] = i; });

    window.roomDefinitions.sort((a, b) => {
        const orderA = orderMap[a.category] !== undefined ? orderMap[a.category] : 999;
        const orderB = orderMap[b.category] !== undefined ? orderMap[b.category] : 999;
        return orderA - orderB;
    });

    window.closeReorderCategoriesModal();
    window.renderRoomDefinitionsTable();
    window.renderBedPreviewDrawer();
};

// --- STEP 3: UNIFIED CHANNEL MANAGER MAPPING CARDS ---

window.fetchChannexData = async function() {
    const apiKey = document.getElementById('chan-api-key').value.trim();
    const propId = document.getElementById('chan-prop-id').value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Missing Credentials", "Please enter your Channex API Key and Property UUID.");
    }

    window.channexConfig.apiKey = apiKey;
    window.channexConfig.propId = propId;

    try {
        const roomsRes = await fetch(`https://app.channex.io/api/v1/room_types?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey }
        });
        const roomsJson = await roomsRes.json();
        window.channexRooms = roomsJson.data || [];

        const plansRes = await fetch(`https://app.channex.io/api/v1/rate_plans?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey }
        });
        const plansJson = await plansRes.json();
        window.channexRatePlans = plansJson.data || [];

        // Retain saved pairings from Firestore, initialize blank for any unmapped
        const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
        window.channexMap = pmsCats.map(pmsCat => {
            const existing = (window.channexMap || []).find(m => m.pmsCategory === pmsCat);
            if (existing && existing.channexId) return existing;
            return {
                pmsCategory: pmsCat,
                channexId: '',
                channexTitle: ''
            };
        });

        window.renderStep3Mapping();
        window.customAlert("Success", `Fetched ${window.channexRooms.length} room types and ${window.channexRatePlans.length} rate plans from Channex.`);

    } catch (err) {
        console.error("Fetch Channex Error:", err);
        window.customAlert("Fetch Failed", err.message);
    }
};

window.renderStep3Mapping = function() {
    const container = document.getElementById('unified-mapping-container');
    const badge = document.getElementById('channex-mapping-progress-badge');
    if (!container) return;

    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
    if (pmsCats.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center text-slate-400 font-bold bg-white rounded-lg border border-slate-200">
                No room categories configured yet. Please configure your rooms in Step 2 first.
            </div>
        `;
        if (badge) badge.innerText = "0 Categories Defined";
        return;
    }

    let mappedCount = 0;

    container.innerHTML = pmsCats.map(pmsCat => {
        const mapping = (window.channexMap || []).find(m => m.pmsCategory === pmsCat) || { channexId: '' };
        const isMapped = !!mapping.channexId;
        if (isMapped) mappedCount++;

        const roomPlans = isMapped
            ? (window.channexRatePlans || []).filter(p => p.attributes?.room_type_id === mapping.channexId)
            : [];

        return `
            <div class="border rounded-lg bg-white overflow-hidden shadow-xs transition-all ${isMapped ? 'border-emerald-300' : 'border-amber-300'}">
                
                <!-- CARD HEADER: PMS ROOM + DIRECT CHANNEX PAIRING DROPDOWN -->
                <div class="px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${isMapped ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-black uppercase ${isMapped ? 'text-emerald-950' : 'text-amber-950'}">${pmsCat}</span>
                        ${isMapped
                            ? `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[9.5px] border border-emerald-300 flex items-center gap-1">🟢 Paired (${roomPlans.length} Rates)</span>`
                            : `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-black text-[9.5px] border border-amber-300 flex items-center gap-1 animate-pulse">⚠️ Unmapped — Select Channex Room</span>`
                        }
                    </div>

                    <div class="flex items-center gap-1.5 min-w-[260px]">
                        <label class="text-[9.5px] font-black uppercase text-slate-500">Channex Room:</label>
                        <select class="table-input font-bold !h-[22px] ${isMapped ? 'border-emerald-400 bg-white text-emerald-950' : 'border-amber-400 bg-white text-amber-950 ring-2 ring-amber-300 animate-pulse'}" onchange="window.handleRoomPairChange('${pmsCat}', this.value)">
                            <option value="">-- Select Channex Room --</option>
                            ${(window.channexRooms || []).map(cr => `
                                <option value="${cr.id}" ${cr.id === mapping.channexId ? 'selected' : ''}>
                                    ${cr.attributes?.title || cr.id} (${cr.attributes?.occupancy || 1} Pax)
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- CARD BODY: INHERITED RATE PLANS -->
                <div class="p-2">
                    ${!isMapped ? `
                        <div class="p-3 text-center text-amber-800 font-bold text-xs bg-amber-50/50 rounded border border-amber-100">
                            Select the matching Channex Room in the header above to load its rate plans.
                        </div>
                    ` : (roomPlans.length === 0 ? `
                        <div class="p-3 text-center text-slate-400 font-semibold text-xs bg-slate-50 rounded border border-slate-100">
                            No rate plans found in Channex for this room. Click "+ Create & Push Plan" above to create one.
                        </div>
                    ` : `
                        <div class="overflow-x-auto border border-slate-200 rounded">
                            <table class="w-full text-left text-[11px] border-collapse">
                                <thead class="bg-slate-800 text-[9px] font-black uppercase text-white border-b border-slate-900">
                                    <tr>
                                        <th class="py-1 px-2">Rate Plan Title</th>
                                        <th class="py-1 px-2 w-36">Sales Channel</th>
                                        <th class="py-1 px-2 w-32">Cancellation Policy</th>
                                        <th class="py-1 px-2 w-32">Product Type</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-semibold">
                                    ${roomPlans.map(plan => {
                                        let planMap = (window.channexRateMap || []).find(rm => rm.ratePlanId === plan.id);
                                        if (!planMap) {
                                            const pTitle = (plan.attributes?.title || '').toLowerCase();
                                            let chan = 'Default';
                                            if (pTitle.includes('booking.com') || pTitle.includes('bdc')) chan = 'Booking.com';
                                            else if (pTitle.includes('hostelworld') || pTitle.includes('hw')) chan = 'Hostelworld';
                                            else if (pTitle.includes('agoda')) chan = 'Agoda';
                                            else if (pTitle.includes('direct')) chan = 'Direct';

                                            const pol = (pTitle.includes('flexible') || pTitle.includes('ref')) && !pTitle.includes('non-') ? 'ref' : 'non-ref';
                                            const prod = pTitle.includes('event') || pTitle.includes('fmp') ? 'evt' : 'std';

                                            planMap = {
                                                ratePlanId: plan.id,
                                                ratePlanTitle: plan.attributes?.title || '',
                                                pmsCategory: pmsCat,
                                                channel: chan,
                                                policy: pol,
                                                product: prod
                                            };
                                            window.channexRateMap.push(planMap);
                                        }

                                        return `
                                            <tr class="hover:bg-slate-50 transition-colors">
                                                <td class="font-bold text-slate-800">${plan.attributes?.title || plan.id}</td>
                                                <td>
                                                    <select class="table-input font-bold" onchange="window.updateRatePlanMapping('${plan.id}', 'channel', this.value)">
                                                        <option value="Default" ${planMap.channel === 'Default' ? 'selected' : ''}>Default (1:1 Base)</option>
                                                        <option value="Direct" ${planMap.channel === 'Direct' ? 'selected' : ''}>Direct Engine</option>
                                                        <option value="Booking.com" ${planMap.channel === 'Booking.com' ? 'selected' : ''}>Booking.com</option>
                                                        <option value="Hostelworld" ${planMap.channel === 'Hostelworld' ? 'selected' : ''}>Hostelworld</option>
                                                        <option value="Agoda" ${planMap.channel === 'Agoda' ? 'selected' : ''}>Agoda</option>
                                                        <option value="Expedia" ${planMap.channel === 'Expedia' ? 'selected' : ''}>Expedia</option>
                                                        <option value="Airbnb" ${planMap.channel === 'Airbnb' ? 'selected' : ''}>Airbnb</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select class="table-input font-bold" onchange="window.updateRatePlanMapping('${plan.id}', 'policy', this.value)">
                                                        <option value="non-ref" ${planMap.policy === 'non-ref' ? 'selected' : ''}>Non-Refundable</option>
                                                        <option value="ref" ${planMap.policy === 'ref' ? 'selected' : ''}>Flexible (+%)</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select class="table-input font-bold" onchange="window.updateRatePlanMapping('${plan.id}', 'product', this.value)">
                                                        <option value="std" ${planMap.product === 'std' ? 'selected' : ''}>Standard Rate</option>
                                                        <option value="evt" ${planMap.product === 'evt' ? 'selected' : ''}>Event Package (EVT)</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }).join('');

    if (badge) {
        badge.innerText = `${mappedCount} of ${pmsCats.length} Rooms Paired`;
        badge.className = mappedCount === pmsCats.length 
            ? "text-[9.5px] font-black text-emerald-700 uppercase"
            : "text-[9.5px] font-black text-amber-700 uppercase";
    }
};

window.handleRoomPairChange = function(pmsCategory, selectedChannexId) {
    let mapping = (window.channexMap || []).find(m => m.pmsCategory === pmsCategory);
    if (!mapping) {
        mapping = { pmsCategory, channexId: selectedChannexId };
        window.channexMap.push(mapping);
    } else {
        mapping.channexId = selectedChannexId;
    }

    const crObj = (window.channexRooms || []).find(r => r.id === selectedChannexId);
    mapping.channexTitle = crObj ? (crObj.attributes?.title || '') : '';

    window.renderStep3Mapping();
};

window.updateRatePlanMapping = function(planId, field, value) {
    const item = (window.channexRateMap || []).find(r => r.ratePlanId === planId);
    if (item) {
        item[field] = value;
    }
};

// --- RATE PLAN CREATION MODAL ---

window.openCreateRatePlanModal = function() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (!modal) return;
    const checklist = document.getElementById('crp-room-checklist');
    if (checklist) {
        const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
        checklist.innerHTML = pmsCats.map(cat => `
            <label class="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer p-0.5 hover:bg-white rounded">
                <input type="checkbox" value="${cat}" class="crp-room-cb" checked>
                <span>${cat}</span>
            </label>
        `).join('');
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeCreateRatePlanModal = function() {
    const modal = document.getElementById('create-rate-plan-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
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
    document.querySelectorAll('.crp-room-cb').forEach(cb => { cb.checked = checked; });
};

window.executeCreateAndPushRatePlan = async function() {
    const apiKey = window.channexConfig?.apiKey;
    const propId = window.channexConfig?.propId;
    if (!apiKey || !propId) return window.customAlert("Error", "Channex credentials missing.");

    const title = document.getElementById('crp-title').value.trim();
    const channel = document.getElementById('crp-channel').value;
    const policy = document.getElementById('crp-policy').value;
    const selectedRooms = Array.from(document.querySelectorAll('.crp-room-cb:checked')).map(cb => cb.value);

    if (!title) return window.customAlert("Missing Field", "Please enter a rate plan title.");
    if (selectedRooms.length === 0) return window.customAlert("Missing Selection", "Select at least one room category.");

    const btn = document.getElementById('btn-confirm-push-rate');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerText = "Creating...";

    try {
        for (const pmsCat of selectedRooms) {
            const mapping = (window.channexMap || []).find(m => m.pmsCategory === pmsCat);
            if (!mapping || !mapping.channexId) continue;

            const payload = {
                rate_plan: {
                    title,
                    room_type_id: mapping.channexId,
                    property_id: propId,
                    currency: document.getElementById('prop-currency')?.value || 'THB',
                    auto_rate_settings: { is_active: false }
                }
            };

            await fetch(`https://app.channex.io/api/v1/rate_plans`, {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        window.closeCreateRatePlanModal();
        await window.fetchChannexData();
        window.customAlert("Created", `Rate plan "${title}" created and attached to selected rooms.`);

    } catch (err) {
        console.error("Create Rate Plan Error:", err);
        window.customAlert("Error", err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
};

// --- STEP 4: PRICING RULES & RELATIONAL LINKS ---

window.renderStep4Controls = function() {
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];
    const dormAnchorSel = document.getElementById('anchor-dorm-select');
    const privAnchorSel = document.getElementById('anchor-private-select');

    const opts = cats.map(c => `<option value="${c}">${c}</option>`).join('');

    if (dormAnchorSel) {
        dormAnchorSel.innerHTML = `<option value="">-- Select Dorm Anchor --</option>` + opts;
        dormAnchorSel.value = window.pricingRules.anchorDorm || '';
        dormAnchorSel.onchange = (e) => { window.pricingRules.anchorDorm = e.target.value; };
    }

    if (privAnchorSel) {
        privAnchorSel.innerHTML = `<option value="">-- Select Private Anchor --</option>` + opts;
        privAnchorSel.value = window.pricingRules.anchorPrivate || '';
        privAnchorSel.onchange = (e) => { window.pricingRules.anchorPrivate = e.target.value; };
    }

    window.renderRelationshipsTable();
    window.renderChannelRulesList();
};

window.renderRelationshipsTable = function() {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;

    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean))];

    if (!window.relationships || window.relationships.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-3 text-center text-slate-400 font-bold">
                    No linking rules defined. Click "+ Add Link Rule" above to create bidirectional rate offsets.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.relationships.map((rel, idx) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td>
                <select class="table-input font-bold" onchange="window.relationships[${idx}].anchor = this.value">
                    <option value="">-- Anchor --</option>
                    ${cats.map(c => `<option value="${c}" ${rel.anchor === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="table-input font-bold" onchange="window.relationships[${idx}].target = this.value">
                    <option value="">-- Target --</option>
                    ${cats.map(c => `<option value="${c}" ${rel.target === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-bold" onchange="window.relationships[${idx}].type = this.value">
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" value="${rel.val || 0}" class="table-input text-center font-bold" onchange="window.relationships[${idx}].val = parseFloat(this.value) || 0">
                </div>
            </td>
            <td>
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-bold bg-pink-50 text-pink-900 border-pink-300" onchange="window.relationships[${idx}].typeFmp = this.value">
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>- ฿</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>-%</option>
                    </select>
                    <input type="number" value="${rel.valFmp !== undefined ? rel.valFmp : rel.val || 0}" class="table-input text-center font-bold bg-pink-50 text-pink-900 border-pink-300" onchange="window.relationships[${idx}].valFmp = parseFloat(this.value) || 0">
                </div>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.removeRelationshipRow(${idx})" class="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer">
                    <i data-lucide="trash-2" size="12"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = function() {
    window.relationships.push({ anchor: '', target: '', type: '+', val: 100, typeFmp: '+', valFmp: 100 });
    window.renderRelationshipsTable();
};

window.removeRelationshipRow = function(index) {
    window.relationships.splice(index, 1);
    window.renderRelationshipsTable();
};

window.renderChannelRulesList = function() {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;

    window.pricingRules.channels = window.pricingRules.channels || {};
    window.pricingRules.channels['Default'] = window.pricingRules.channels['Default'] || { type: '=', val: 0 };
    window.pricingRules.channels['Direct'] = window.pricingRules.channels['Direct'] || { type: '-%', val: 10 };

    container.innerHTML = Object.entries(window.pricingRules.channels).map(([chan, rule]) => {
        const isMaster = (chan === (window.pricingRules.masterDriver || 'Direct'));
        const isDefault = (chan === 'Default');
        const isLocked = isMaster || isDefault;

        return `
            <div class="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded text-xs font-bold shadow-2xs">
                <span class="flex items-center gap-1.5">
                    <span class="text-slate-800">${chan}</span>
                    ${isMaster ? `<span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[8px] font-black uppercase">Master Anchor (0)</span>` : ''}
                </span>

                <div class="flex items-center gap-1">
                    <select class="table-input !w-20 font-bold ${isLocked ? 'bg-slate-100 opacity-60 pointer-events-none' : ''}" onchange="window.pricingRules.channels['${chan}'].type = this.value">
                        <option value="=" ${rule.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+" ${rule.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rule.type === '-' ? 'selected' : ''}>- ฿</option>
                        <option value="+%" ${rule.type === '+%' ? 'selected' : ''}>+%</option>
                        <option value="-%" ${rule.type === '-%' ? 'selected' : ''}>-%</option>
                    </select>

                    <input type="number" value="${rule.val || 0}" ${isLocked ? 'disabled' : ''} class="table-input !w-16 text-center font-bold ${isLocked ? 'bg-slate-100 opacity-60' : ''}" onchange="window.pricingRules.channels['${chan}'].val = parseFloat(this.value) || 0">

                    ${(!isDefault && !isMaster) ? `
                        <button type="button" onclick="delete window.pricingRules.channels['${chan}']; window.renderChannelRulesList();" class="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer">
                            <i data-lucide="trash-2" size="12"></i>
                        </button>
                    ` : '<div class="w-4"></div>'}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.addVerifiedChannelRule = function() {
    const name = prompt("Enter Channel Name (e.g. Booking.com, Agoda, Expedia):");
    if (!name || !name.trim()) return;
    const clean = cleanChannelKey(name);
    window.pricingRules.channels[clean] = { type: '+%', val: 10 };
    window.renderChannelRulesList();
};

window.toggleEventSettings = function(enabled) {
    const p = document.getElementById('event-curve-panel');
    if (p) p.classList.toggle('hidden', !enabled);
};

window.cycleRatesSpan = function() {
    window.ratesSpan = (window.ratesSpan === 2) ? 3 : (window.ratesSpan === 3 ? 4 : 2);
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `±${window.ratesSpan} Days`;
};

window.cycleRestrSpan = function() {
    window.restrSpan = (window.restrSpan === 6) ? 7 : (window.restrSpan === 7 ? 5 : 6);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `±${window.restrSpan} Days`;
};

// --- STEP 5: REVIEW & VERIFICATION ---

window.renderStep5Review = function() {
    const nameEl = document.getElementById('rev-prop-name');
    const codeEl = document.getElementById('rev-prop-code');
    const invCountEl = document.getElementById('rev-inv-count');
    const catCountEl = document.getElementById('rev-cat-count');
    const chanStatusEl = document.getElementById('rev-chan-status');
    const chanPlansEl = document.getElementById('rev-chan-plans');

    if (nameEl) nameEl.innerText = document.getElementById('prop-name')?.value || window.activePropertyId;
    if (codeEl) codeEl.innerText = document.getElementById('prop-short')?.value || '--';
    if (invCountEl) invCountEl.innerText = `${(window.compiledRooms || []).length} Units`;
    if (catCountEl) catCountEl.innerText = `${new Set((window.roomDefinitions || []).map(r => r.category)).size} Categories`;
    if (chanStatusEl) chanStatusEl.innerText = window.channexConfig?.propId ? 'Connected' : 'Not Connected';
    if (chanPlansEl) chanPlansEl.innerText = `${(window.channexRateMap || []).length} Rate Plans Mapped`;
};

window.launchApp = function(appType) {
    const code = document.getElementById('prop-short')?.value || window.activePropertyId;
    const q = code ? `?p=${encodeURIComponent(code)}` : '';
    window.location.href = `https://loren-6q.github.io/PMS/${appType}.html${q}`;
};

// --- DATABASE SAVE & LOAD ENGINE ---

window.savePropertyToDatabase = async function(showAlertMsg = true) {
    const canonId = window.activePropertyId;
    if (!canonId) return window.customAlert("Error", "No property selected to save.");

    const btnHeader = document.getElementById('btn-save-header');
    const btnFooter = document.getElementById('btn-save-footer');
    if (btnHeader) btnHeader.innerText = "SAVING...";
    if (btnFooter) btnFooter.innerText = "SAVING...";

    try {
        const propDoc = {
            id: canonId,
            name: document.getElementById('prop-name').value.trim() || canonId,
            short: document.getElementById('prop-short').value.trim().toUpperCase() || 'PROP',
            currency: document.getElementById('prop-currency').value || 'THB',
            timezone: document.getElementById('prop-timezone').value || 'Asia/Bangkok',
            address: document.getElementById('prop-address').value.trim() || '',
            email: document.getElementById('prop-email').value.trim() || '',
            phone: document.getElementById('prop-phone').value.trim() || '',
            logoUrl: document.getElementById('prop-logo-url').value.trim() || '',
            bannerUrl: document.getElementById('prop-banner-url').value.trim() || '',
            iconUrl: document.getElementById('prop-icon-url').value.trim() || '',
            paymentMethods: window.paymentMethods || [],
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: window.compiledRooms || [],
            channex: {
                apiKey: document.getElementById('chan-api-key').value.trim() || '',
                propId: document.getElementById('chan-prop-id').value.trim() || '',
                rateMultiplier: 100
            },
            channexMap: window.channexMap || [],
            channexRateMap: window.channexRateMap || [],
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', canonId), propDoc, { merge: true });

        // Save pricing rules
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`), {
            relationships: window.relationships || [],
            pricingRules: window.pricingRules || {},
            updatedAt: new Date().toISOString()
        }, { merge: true });

        if (showAlertMsg) window.customAlert("Saved", `Property configuration for ${propDoc.name} saved successfully.`);

    } catch (err) {
        console.error("Save Error:", err);
        window.customAlert("Save Error", err.message);
    } finally {
        if (btnHeader) btnHeader.innerHTML = '<i data-lucide="save" size="13"></i><span>SAVE</span>';
        if (btnFooter) btnFooter.innerHTML = '<i data-lucide="save" size="12"></i><span>SAVE</span>';
        if (window.lucide) window.lucide.createIcons();
    }
};

window.loadPropertyFromDatabase = async function(propId) {
    if (!propId) return;

    // Purge in-memory state so no cross-property bleed can occur
    window.activePropertyId = propId;
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
    window.pricingRules = { masterDriver: 'Direct', anchorPrivate: '', anchorDorm: '', stdRefType: '+%', stdRefVal: 25, evtRefType: '+%', evtRefVal: 25, channels: {} };
    window.relationships = [];

    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Loading ${propId}...`;

    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (snap.exists()) {
            const data = snap.data();
            window.currentPropertyConfig = data;

            document.getElementById('prop-name').value = data.name || propId;
            document.getElementById('prop-short').value = data.short || propId.toUpperCase();
            document.getElementById('prop-currency').value = data.currency || 'THB';
            document.getElementById('prop-timezone').value = data.timezone || 'Asia/Bangkok';
            document.getElementById('prop-address').value = data.address || '';
            document.getElementById('prop-email').value = data.email || '';
            document.getElementById('prop-phone').value = data.phone || '';

            document.getElementById('prop-logo-url').value = data.logoUrl || '';
            document.getElementById('prop-banner-url').value = data.bannerUrl || '';
            document.getElementById('prop-icon-url').value = data.iconUrl || '';
            window.updateLogoPreview('primary', data.logoUrl || '');
            window.updateLogoPreview('banner', data.bannerUrl || '');
            window.updateLogoPreview('icon', data.iconUrl || '');

            window.paymentMethods = data.paymentMethods || [];
            window.addonsList = data.addons || [];
            window.roomDefinitions = data.roomDefinitions || [];
            window.compiledRooms = data.rooms || [];

            if (data.channex) {
                document.getElementById('chan-api-key').value = data.channex.apiKey || '';
                document.getElementById('chan-prop-id').value = data.channex.propId || '';
                window.channexConfig = data.channex;
            }
            window.channexMap = data.channexMap || [];
            window.channexRateMap = data.channexRateMap || [];

            if (statusText) statusText.innerText = `Active: ${data.name || propId}`;
        }

        // Fetch pricing rules
        const priceSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        if (priceSnap.exists()) {
            const pData = priceSnap.data();
            window.relationships = pData.relationships || [];
            if (pData.pricingRules) window.pricingRules = pData.pricingRules;
        }

        window.renderPaymentMethodsTable();
        window.renderAddonsTable();
        window.renderRoomDefinitionsTable();
        window.renderBedPreviewDrawer();
        window.renderStep3Mapping();
        window.renderStep4Controls();

    } catch (err) {
        console.error("Load Property Error:", err);
        if (statusText) statusText.innerText = "Error loading property data.";
    }
};

window.switchSetupProperty = async function(propId) {
    if (!propId || propId === window.activePropertyId) return;
    await window.loadPropertyFromDatabase(propId);
};

// --- MODAL: CREATE NEW PROPERTY ---

window.openNewPropertyModal = function() {
    const m = document.getElementById('new-property-modal');
    if (!m) return;
    m.classList.remove('hidden');
    m.style.display = 'flex';
};

window.closeNewPropertyModal = function() {
    const m = document.getElementById('new-property-modal');
    if (!m) return;
    m.classList.add('hidden');
    m.style.display = 'none';
};

window.confirmCreateNewProperty = async function() {
    const name = document.getElementById('new-prop-input-name').value.trim();
    const shortCode = document.getElementById('new-prop-input-short').value.trim().toUpperCase();
    const slug = document.getElementById('new-prop-input-id').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    if (!name || !shortCode || !slug) {
        return window.customAlert("Missing Field", "Please provide a Name, Short Code, and Slug.");
    }

    try {
        const newDoc = {
            id: slug,
            name,
            short: shortCode,
            currency: 'THB',
            timezone: 'Asia/Bangkok',
            roomDefinitions: [],
            rooms: [],
            addons: [],
            paymentMethods: [],
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', slug), newDoc);

        const sel = document.getElementById('property-select');
        if (sel) {
            const opt = document.createElement('option');
            opt.value = slug;
            opt.innerText = `${name} (${shortCode})`;
            sel.appendChild(opt);
            sel.value = slug;
        }

        window.closeNewPropertyModal();
        await window.loadPropertyFromDatabase(slug);
        window.customAlert("Created", `New property ${name} created. Configure room inventory now.`);

    } catch (err) {
        console.error("Create Property Error:", err);
        window.customAlert("Error", err.message);
    }
};

// --- INITIAL ENGINE BOOTLOADER ---

async function initSetupEngine() {
    try {
        await signInAnonymously(auth);
    } catch (e) {
        console.warn("Auth note:", e);
    }

    const sel = document.getElementById('property-select');
    const statusText = document.getElementById('header-status-text');

    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        window.availableProperties = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (sel) {
            if (window.availableProperties.length === 0) {
                sel.innerHTML = `<option value="">No properties in database</option>`;
                if (statusText) statusText.innerText = "No properties found.";
                return;
            }

            sel.innerHTML = window.availableProperties.map(p => `
                <option value="${p.id}">${p.name || p.id} (${p.short || p.id.toUpperCase()})</option>
            `).join('');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const pParam = (urlParams.get('p') || '').trim();
        let targetId = window.availableProperties[0]?.id || '';

        if (pParam) {
            const matched = window.availableProperties.find(p => 
                p.id.toLowerCase() === pParam.toLowerCase() ||
                (p.short && p.short.toLowerCase() === pParam.toLowerCase())
            );
            if (matched) targetId = matched.id;
        }

        if (sel && targetId) sel.value = targetId;
        if (targetId) await window.loadPropertyFromDatabase(targetId);

    } catch (err) {
        console.error("Setup Init Error:", err);
        if (sel) sel.innerHTML = `<option value="">Database Connection Error</option>`;
        if (statusText) statusText.innerText = "Error connecting to Firestore.";
    }

    window.jumpStep(1);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetupEngine);
} else {
    setTimeout(initSetupEngine, 0);
}
