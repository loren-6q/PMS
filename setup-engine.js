// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// Wild & Wandering Property Management System
// Complete, Unabridged Full-Feature Implementation
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, query, where 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, ref as storageRef, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- FIREBASE INITIALIZATION ---
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

// --- CLIENT-SIDE INSTANT IMAGE COMPRESSOR ---
async function compressImage(file, maxWidth = 1200, maxHeight = 400, quality = 0.82) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            return resolve({ blob: file, dataUrl: '' });
        }
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
                    resolve({
                        blob: blob || file,
                        dataUrl: canvas.toDataURL(mime, quality)
                    });
                }, mime, quality);
            };
            img.onerror = () => resolve({ blob: file, dataUrl: e.target.result });
            img.src = e.target.result;
        };
        reader.onerror = () => resolve({ blob: file, dataUrl: '' });
        reader.readAsDataURL(file);
    });
}

function normalizeChannelName(raw) {
    if (!raw) return 'Default';
    const s = String(raw).trim();
    if (/^default$/i.test(s)) return 'Default';
    if (/^direct(\s*website)?$/i.test(s)) return 'Direct';
    if (/booking|bdc/i.test(s)) return 'Booking.com';
    if (/hostelworld|hw/i.test(s)) return 'Hostelworld';
    if (/agoda/i.test(s)) return 'Agoda';
    if (/expedia/i.test(s)) return 'Expedia';
    if (/airbnb/i.test(s)) return 'Airbnb';
    return s;
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

// --- GLOBAL WIZARD STATE ---
window.currentStep = 1;
window.totalSteps = 5;
window.activePropertyId = '';
window.availableProperties = [];
window.currentPropertyConfig = {};
window.roomDefinitions = [];
window.compiledRooms = [];
window.addonsList = [];
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
    channels: {
        'Default': { type: '=', val: 0 },
        'Direct': { type: '-%', val: 10 },
        'Booking.com': { type: '=', val: 0 },
        'Hostelworld': { type: '+%', val: 15 },
        'Agoda': { type: '=', val: 0 },
        'Expedia': { type: '=', val: 0 }
    }
};
window.relationships = [];
window.savedAutofillBaselines = {};
window.ratesSpan = 2;
window.restrSpan = 6;

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

window.updateFavicon = (iconUrl) => {
    const url = iconUrl || DEFAULT_WW_ICON;
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = url;
};

// --- STEP NAVIGATION & STEP DISPLAY ---
window.jumpStep = (step) => {
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
            if (pill) { pill.classList.remove('active', 'completed'); }
            if (badge) { badge.className = "w-5 h-5 rounded bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0 border border-slate-200"; }
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
            nextBtn.innerHTML = `<span>Save All</span> <i data-lucide="check" size="13"></i>`;
            nextBtn.onclick = () => window.savePropertyToDatabase(true);
        } else {
            nextBtn.innerHTML = `<span>Continue</span> <i data-lucide="arrow-right" size="13"></i>`;
            nextBtn.onclick = () => window.nextStep();
        }
    }

    if (s === 3) window.renderUnifiedMappingCards();
    if (s === 4) window.renderPricingStepRules();
    if (s === 5) window.renderReviewLaunchStep();

    if (window.lucide) window.lucide.createIcons();
};

window.nextStep = () => { if (window.currentStep < 5) window.jumpStep(window.currentStep + 1); };
window.prevStep = () => { if (window.currentStep > 1) window.jumpStep(window.currentStep - 1); };

window.toggleCardSection = (sectionId, chevronId, forceState = null) => {
    const sec = document.getElementById(sectionId);
    const icon = document.getElementById(chevronId);
    if (!sec) return;
    const shouldShow = forceState !== null ? forceState : sec.classList.contains('hidden');
    if (shouldShow) {
        sec.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        sec.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
};

let _customModalCallback = null;
window.customAlert = (title, message, isConfirm = false, onConfirm = null) => {
    const modal = document.getElementById('custom-app-modal');
    if (!modal) return alert(`${title}\n\n${message}`);
    const t = document.getElementById('modal-title');
    const b = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const confirmBtn = document.getElementById('modal-confirm-btn');

    if (t) t.innerText = title || "Notification";
    if (b) b.innerText = message || "";

    _customModalCallback = onConfirm;

    if (cancelBtn) {
        if (isConfirm) cancelBtn.classList.remove('hidden');
        else cancelBtn.classList.add('hidden');
    }

    if (confirmBtn) {
        confirmBtn.innerText = isConfirm ? "Confirm" : "OK";
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
};

window.closeCustomModal = (confirmed) => {
    const modal = document.getElementById('custom-app-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (confirmed && typeof _customModalCallback === 'function') {
        const cb = _customModalCallback;
        _customModalCallback = null;
        cb();
    } else {
        _customModalCallback = null;
    }
};

// --- LOGO MANAGEMENT ---
window.updateLogoPreview = (type, url) => {
    const cleanUrl = (url || '').trim() || DEFAULT_WW_ICON;
    if (type === 'primary') {
        const img = document.getElementById('preview-logo-primary');
        const inp = document.getElementById('prop-logo-url');
        if (img) img.src = cleanUrl;
        if (inp && inp.value !== cleanUrl) inp.value = cleanUrl;
    } else if (type === 'banner') {
        const img = document.getElementById('preview-logo-banner');
        const inp = document.getElementById('prop-banner-url');
        if (img) img.src = cleanUrl;
        if (inp && inp.value !== cleanUrl) inp.value = cleanUrl;
    } else if (type === 'icon') {
        const img = document.getElementById('preview-logo-icon');
        const inp = document.getElementById('prop-icon-url');
        if (img) img.src = cleanUrl;
        if (inp && inp.value !== cleanUrl) inp.value = cleanUrl;
    }
};

window.resetLogosToDefault = () => {
    window.updateLogoPreview('primary', DEFAULT_WW_ICON);
    window.updateLogoPreview('banner', DEFAULT_WW_ICON);
    window.updateLogoPreview('icon', DEFAULT_WW_ICON);
};

window.handleLogoFileUpload = async (event, logoType) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    const propId = window.activePropertyId || 'swims_resort';
    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Optimizing ${logoType} image...`;

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
        if (statusText) statusText.innerText = `Uploading ${logoType} logo...`;
        const sRef = storageRef(storage, storagePath);
        await uploadBytes(sRef, compressed.blob);
        const downloadUrl = await getDownloadURL(sRef);
        window.updateLogoPreview(logoType, downloadUrl);
        if (statusText) statusText.innerText = "Logo saved!";
        window.customAlert("Success", `${logoType.toUpperCase()} logo uploaded successfully.`);
    } catch (err) {
        console.warn("Storage upload failed, keeping compressed thumbnail DataURL:", err);
        if (statusText) statusText.innerText = "Logo saved locally.";
    }
};

// --- ADDONS MANAGEMENT ---
window.moveAddon = (idx, direction) => {
    if (!Array.isArray(window.addonsList)) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= window.addonsList.length) return;
    
    const temp = window.addonsList[idx];
    window.addonsList[idx] = window.addonsList[targetIdx];
    window.addonsList[targetIdx] = temp;
    
    window.addonsList.forEach((item, i) => { item.order = i + 1; });
    window.renderAddonsTable();
};

let _draggedAddonIdx = null;

window.handleAddonDragStart = (e, idx) => {
    _draggedAddonIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('tr')?.classList.add('opacity-40');
};

window.handleAddonDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleAddonDrop = (e, targetIdx) => {
    e.preventDefault();
    if (_draggedAddonIdx === null || _draggedAddonIdx === targetIdx) return;
    const movedItem = window.addonsList.splice(_draggedAddonIdx, 1)[0];
    window.addonsList.splice(targetIdx, 0, movedItem);
    window.addonsList.forEach((item, i) => { item.order = i + 1; });
    _draggedAddonIdx = null;
    window.renderAddonsTable();
};

window.handleAddonDragEnd = (e) => {
    _draggedAddonIdx = null;
    e.target.closest('tr')?.classList.remove('opacity-40');
};

window.renderAddonsTable = () => {
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

    let html = '';
    window.addonsList.forEach((item, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === window.addonsList.length - 1;
        html += `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100" data-addon-id="${item.id}"
            ondragover="window.handleAddonDragOver(event)"
            ondrop="window.handleAddonDrop(event, ${idx})">
            <td class="p-1.5 text-center font-mono font-bold text-slate-500 text-[10px] whitespace-nowrap">
                <div class="flex items-center justify-center gap-1">
                    <span class="cursor-grab text-slate-400 hover:text-slate-700 drag-handle" 
                          draggable="true" 
                          ondragstart="window.handleAddonDragStart(event, ${idx})"
                          ondragend="window.handleAddonDragEnd(event)"
                          title="Drag to reorder">
                        <i data-lucide="grip-vertical" size="13"></i>
                    </span>
                    <span class="w-4 text-center text-slate-600">${idx + 1}</span>
                    <div class="flex flex-col ml-0.5">
                        <button type="button" onclick="window.moveAddon(${idx}, -1)" ${isFirst ? 'disabled' : ''} class="text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed leading-none p-0.5" title="Move Up">
                            <i data-lucide="chevron-up" size="11"></i>
                        </button>
                        <button type="button" onclick="window.moveAddon(${idx}, 1)" ${isLast ? 'disabled' : ''} class="text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed leading-none p-0.5" title="Move Down">
                            <i data-lucide="chevron-down" size="11"></i>
                        </button>
                    </div>
                </div>
            </td>
            <td class="p-1.5">
                <input type="text" class="table-input font-bold" value="${item.name || ''}" onchange="window.updateAddonField(${idx}, 'name', this.value)">
            </td>
            <td class="p-1.5">
                <input type="text" class="table-input" value="${item.category || 'General'}" onchange="window.updateAddonField(${idx}, 'category', this.value)">
            </td>
            <td class="p-1.5">
                <input type="number" step="any" class="table-input font-black text-center text-emerald-700" value="${item.price || 0}" onchange="window.updateAddonField(${idx}, 'price', parseFloat(this.value)||0)">
            </td>
            <td class="p-1.5">
                <select class="table-input font-medium" onchange="window.updateAddonField(${idx}, 'type', this.value)">
                    <option value="one-off" ${item.type === 'one-off' ? 'selected' : ''}>One-Off</option>
                    <option value="per-day" ${item.type === 'per-day' ? 'selected' : ''}>Per Day</option>
                    <option value="per-item" ${item.type === 'per-item' ? 'selected' : ''}>Per Item</option>
                </select>
            </td>
            <td class="p-1.5 text-center">
                <button type="button" onclick="window.removeAddonRow(${idx})" class="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.addBlankAddonRow = () => {
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

window.removeAddonRow = (idx) => {
    if (window.addonsList && window.addonsList[idx]) {
        window.addonsList.splice(idx, 1);
        window.renderAddonsTable();
    }
};

window.updateAddonField = (idx, field, value) => {
    if (window.addonsList && window.addonsList[idx]) {
        window.addonsList[idx][field] = value;
    }
};

// --- ROOM INVENTORY DEFINITIONS & GENERATORS ---
window.toggleBatchDormPanel = (forceState = null) => {
    const p = document.getElementById('batch-dorm-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    p.classList.toggle('hidden', !shouldShow);
};

window.toggleBatchRoomPanel = (forceState = null) => {
    const p = document.getElementById('batch-room-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    p.classList.toggle('hidden', !shouldShow);
};

window.executeBatchDormGenerate = () => {
    const roomName = document.getElementById('gen-dorm-name')?.value.trim() || 'DORM A';
    const catName = document.getElementById('gen-dorm-cat')?.value.trim() || 'Standard 6-Bed Dorm';
    const bedCount = parseInt(document.getElementById('gen-dorm-beds')?.value, 10) || 6;
    const floor = document.getElementById('gen-dorm-floor')?.value.trim() || '1';
    const rule = document.getElementById('gen-dorm-rule')?.value || 'odd-top';

    const cleanRoomName = roomName.toUpperCase();
    const cleanCatName = catName;

    const existing = window.roomDefinitions.find(r => r.name.toUpperCase() === cleanRoomName);
    if (existing) {
        existing.category = cleanCatName;
        existing.count = bedCount;
        existing.floor = floor;
        existing.rule = rule;
        existing.isDorm = true;
    } else {
        window.roomDefinitions.push({
            id: 'room_' + Math.random().toString(36).substr(2, 7),
            name: cleanRoomName,
            category: cleanCatName,
            count: bedCount,
            floor: floor,
            rule: rule,
            isDorm: true
        });
    }

    window.toggleBatchDormPanel(false);
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

window.executeBatchRoomGenerate = () => {
    const prefix = document.getElementById('gen-room-prefix')?.value || 'ROOM ';
    const catName = document.getElementById('gen-room-cat')?.value.trim() || 'Deluxe King Room';
    const startNum = parseInt(document.getElementById('gen-room-start')?.value, 10) || 1;
    const endNum = parseInt(document.getElementById('gen-room-end')?.value, 10) || 4;
    const floor = document.getElementById('gen-room-floor')?.value.trim() || '1';

    if (startNum > endNum) {
        return window.customAlert("Validation Error", "Start number must be less than or equal to End number.");
    }

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
                floor: floor,
                rule: 'private',
                isDorm: false
            });
        }
    }

    window.toggleBatchRoomPanel(false);
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

// IMMUTABLE ID PRESERVATION: Compiles beds without rewriting existing physical IDs
window.compileRoomsFromDefinitions = () => {
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

window.renderRoomDefinitionsTable = () => {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;

    if (!window.roomDefinitions || window.roomDefinitions.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="7" class="p-6 text-center text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                No rooms configured. Use "BATCH DORM" or "BATCH ROOM" above to generate your inventory.
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = window.roomDefinitions.map((def, idx) => `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100" data-room-idx="${idx}">
            <td class="p-1.5 text-center font-mono font-bold text-slate-500 text-[10px]">${idx + 1}</td>
            <td class="p-1.5"><input type="text" class="table-input font-bold" value="${def.name || ''}" onchange="window.roomDefinitions[${idx}].name = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="p-1.5"><input type="text" class="table-input font-bold text-indigo-700" value="${def.category || ''}" onchange="window.roomDefinitions[${idx}].category = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="p-1.5 text-center"><input type="number" min="1" max="60" class="table-input font-black text-center !w-16 mx-auto" value="${def.count || 1}" onchange="window.roomDefinitions[${idx}].count = parseInt(this.value,10)||1; window.compileRoomsFromDefinitions();"></td>
            <td class="p-1.5"><input type="text" class="table-input text-center !w-20" value="${def.floor || '1'}" onchange="window.roomDefinitions[${idx}].floor = this.value; window.compileRoomsFromDefinitions();"></td>
            <td class="p-1.5">
                <select class="table-input font-semibold" onchange="window.roomDefinitions[${idx}].rule = this.value; window.roomDefinitions[${idx}].isDorm = (this.value !== 'private'); window.compileRoomsFromDefinitions();">
                    <option value="odd-top" ${def.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="even-top" ${def.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="single" ${def.rule === 'single' ? 'selected' : ''}>DORM (Single)</option>
                    <option value="private" ${def.rule === 'private' ? 'selected' : ''}>PRIVATE ROOM</option>
                </select>
            </td>
            <td class="p-1.5 text-center">
                <button type="button" onclick="window.roomDefinitions.splice(${idx}, 1); window.compileRoomsFromDefinitions(); window.renderRoomDefinitionsTable();" class="p-1 text-slate-400 hover:text-rose-600"><i data-lucide="trash-2" size="13"></i></button>
            </td>
        </tr>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.renderBedPreviewDrawer = () => {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;

    const grouped = {};
    (window.compiledRooms || []).forEach(r => {
        const p = r.parentRoom || r.id;
        if (!grouped[p]) grouped[p] = [];
        grouped[p].push(r);
    });

    container.innerHTML = Object.keys(grouped).map(p => `
        <div class="bg-white p-2 rounded border border-slate-300 shadow-2xs min-w-[130px]">
            <div class="font-black text-slate-800 text-[11px] border-b border-slate-200 pb-1 mb-1 flex items-center justify-between">
                <span>${p}</span><span class="text-[9px] text-slate-400">Fl. ${grouped[p][0]?.floor || 1}</span>
            </div>
            <div class="flex flex-wrap gap-1">
                ${grouped[p].map(u => `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 border border-slate-200">${u.id}</span>`).join('')}
            </div>
        </div>
    `).join('');
};

window.toggleBedPreviewDrawer = (force) => {
    const d = document.getElementById('bed-preview-drawer');
    if (d) d.classList.toggle('hidden', force !== undefined ? !force : undefined);
};

window.clearAllRoomDefs = () => {
    window.customAlert("Clear Rooms", "Wipe all configured rooms?", true, () => {
        window.roomDefinitions = [];
        window.compileRoomsFromDefinitions();
        window.renderRoomDefinitionsTable();
    });
};

window.addBlankRoomDef = () => {
    window.roomDefinitions.push({ id: 'room_' + Date.now(), name: `ROOM ${window.roomDefinitions.length + 1}`, category: 'Standard Room', count: 1, floor: '1', rule: 'private', isDorm: false });
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

// --- CHANNEX REST INTEGRATION & RATE PLAN CREATOR ---
window.fetchChannexData = async () => {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Credentials Required", "Enter both your Channex API Key and Channex Property ID.");
    }

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

        const optRes = await fetch(`https://app.channex.io/api/v1/rate_plans/options?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        const optJson = await optRes.json();
        const cleanRatePlans = optJson.data || [];

        window.channexConfig = { apiKey, propId, rateMultiplier: 100 };
        window.channexRooms = channexRooms;
        window.channexRatePlans = cleanRatePlans;

        window.channexMap = channexRooms.map(cr => {
            const crTitle = cr.attributes?.title || '';
            const existing = (window.channexMap || []).find(m => m.channexId === cr.id);
            let matchedCat = existing?.pmsCategory || '';

            if (!matchedCat) {
                const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
                matchedCat = pmsCats.find(c => c.toLowerCase() === crTitle.toLowerCase() || crTitle.toLowerCase().includes(c.toLowerCase())) || pmsCats[0] || '';
            }

            return { channexId: cr.id, channexTitle: crTitle, pmsCategory: matchedCat };
        });

        window.renderUnifiedMappingCards();
        window.customAlert("Channex Connected", `Fetched ${channexRooms.length} Room Types and ${cleanRatePlans.length} Rate Plans.`);
    } catch (err) {
        console.error("Channex fetch error:", err);
        window.customAlert("Connection Failed", err.message);
    }
};

window.openCreateRatePlanModal = () => {
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

window.closeCreateRatePlanModal = () => {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.applyRatePlanPreset = (title, channel, policy) => {
    const t = document.getElementById('crp-title');
    const c = document.getElementById('crp-channel');
    const p = document.getElementById('crp-policy');
    if (t) t.value = title;
    if (c) c.value = channel;
    if (p) p.value = policy;
};

window.toggleAllTargetRooms = (checked) => {
    document.querySelectorAll('.crp-cat-box').forEach(cb => cb.checked = !!checked);
};

// Exact Channex REST endpoint invocation
window.executeCreateAndPushRatePlan = async () => {
    const title = document.getElementById('crp-title')?.value.trim();
    const channel = document.getElementById('crp-channel')?.value || 'DEFAULT';
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
            // Local fallback
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

    window.closeCreateRatePlanModal();
    window.renderUnifiedMappingCards();
    window.customAlert("Rate Plans Ready", `Saved "${title}" across ${pushedCount} categories.`);
};

window.renderUnifiedMappingCards = () => {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    if (pmsCats.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs font-bold text-slate-400">Define rooms in Step 2 first.</div>`;
        return;
    }

    container.innerHTML = pmsCats.map(cat => {
        const plans = (window.channexRateMap || []).filter(p => p.pmsCategory === cat);
        return `
            <div class="bg-white border border-slate-300 rounded-lg p-3 shadow-xs">
                <div class="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <span class="font-black text-xs uppercase text-slate-800">${cat}</span>
                    <span class="text-[10px] font-bold text-slate-500">${plans.length} Mapped Rate Plans</span>
                </div>
                <div class="space-y-1">
                    ${plans.map(p => `
                        <div class="flex items-center justify-between text-xs p-1.5 rounded bg-slate-50 border border-slate-200">
                            <span class="font-bold text-slate-700">${p.ratePlanTitle}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">${p.channel}</span>
                                <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${p.policy === 'ref' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${p.policy}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
};

// --- STEP 4 PRICING & CHANNELS ---
window.renderPricingStepRules = () => {
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    const dormSelect = document.getElementById('anchor-dorm-select');
    const privSelect = document.getElementById('anchor-private-select');

    const opts = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (dormSelect) { dormSelect.innerHTML = opts; dormSelect.value = window.pricingRules.anchorDorm || cats.find(c => c.toLowerCase().includes('dorm')) || cats[0] || ''; }
    if (privSelect) { privSelect.innerHTML = opts; privSelect.value = window.pricingRules.anchorPrivate || cats.find(c => !c.toLowerCase().includes('dorm')) || cats[0] || ''; }

    const stdRefInput = document.getElementById('rule-std-ref');
    if (stdRefInput) stdRefInput.value = window.pricingRules.stdRefVal || 25;

    window.renderRelationships();
    window.renderChannelRulesList();
};

window.renderRelationships = () => {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    const catOpts = cats.map(c => `<option value="${c}">${c}</option>`).join('');

    tbody.innerHTML = (window.relationships || []).map((rel, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
            <td class="p-1.5"><select class="table-input font-bold" onchange="window.relationships[${idx}].anchor = this.value"><option value="unlinked">-- Unlinked --</option>${catOpts}</select></td>
            <td class="p-1.5"><select class="table-input font-bold" onchange="window.relationships[${idx}].target = this.value">${catOpts}</select></td>
            <td class="p-1.5">
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
            <td class="p-1.5 evt-col-cell">
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
            <td class="p-1.5 text-center"><button type="button" onclick="window.relationships.splice(${idx}, 1); window.renderRelationships();" class="text-slate-400 hover:text-rose-600"><i data-lucide="trash-2" size="13"></i></button></td>
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

window.addRelationshipRow = () => {
    const cats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    window.relationships.push({ anchor: cats[0] || '', target: cats[1] || cats[0] || '', type: '=', val: 0, typeFmp: '=', valFmp: 0 });
    window.renderRelationships();
};

window.renderChannelRulesList = () => {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;
    const channels = window.pricingRules.channels || {};

    container.innerHTML = Object.keys(channels).map(ch => `
        <div class="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200">
            <span class="font-bold text-xs text-slate-800">${ch}</span>
            <div class="flex items-center gap-1">
                <select class="table-input !w-20 font-black text-center !py-0.5" onchange="window.pricingRules.channels['${ch}'].type = this.value">
                    <option value="=" ${channels[ch].type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${channels[ch].type === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${channels[ch].type === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+" ${channels[ch].type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${channels[ch].type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" step="any" class="table-input font-bold text-center !w-16 !py-0.5" value="${channels[ch].val || 0}" onchange="window.pricingRules.channels['${ch}'].val = parseFloat(this.value)||0">
            </div>
        </div>
    `).join('');
};

window.addVerifiedChannelRule = () => {
    const ch = prompt("Enter Channel Name (e.g. Airbnb):");
    if (ch && ch.trim()) {
        window.pricingRules.channels[ch.trim()] = { type: '+%', val: 10 };
        window.renderChannelRulesList();
    }
};

window.renderReviewLaunchStep = () => {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setTxt('rev-prop-name', document.getElementById('prop-name')?.value || window.activePropertyId);
    setTxt('rev-prop-code', document.getElementById('prop-short')?.value || '');
    setTxt('rev-inv-count', `${(window.compiledRooms || []).length} Units`);
    setTxt('rev-cat-count', `${(window.roomDefinitions || []).length} Categories`);
    setTxt('rev-chan-status', window.channexConfig?.propId ? 'Configured' : 'Offline / Standalone');
    setTxt('rev-chan-plans', `${(window.channexRateMap || []).length} Plans Mapped`);
};

window.launchApp = (appKey) => {
    const pCode = (document.getElementById('prop-short')?.value || window.activePropertyId || 'SWIMS').toUpperCase();
    window.location.href = `${appKey}.html?p=${encodeURIComponent(pCode)}`;
};

// --- DATABASE LOAD & SAVE ---
window.loadPropertyFromDatabase = async (propId) => {
    if (!propId) return;
    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Loading ${propId}...`;

    try {
        const propDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (!propDoc.exists()) throw new Error(`Property ${propId} not found in database.`);

        const pData = propDoc.data() || {};
        window.currentPropertyConfig = pData;
        window.activePropertyId = propId;

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
        window.channexMap = pData.channexMap || [];
        window.channexRateMap = pData.channexRateMap || [];

        const pPricingDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        if (pPricingDoc.exists()) {
            const pDataPricing = pPricingDoc.data() || {};
            window.relationships = pDataPricing.relationships || [];
            window.pricingRules = { ...window.pricingRules, ...(pDataPricing.pricingRules || {}) };
        }

        if (statusText) statusText.innerText = `Active: ${pData.name || propId}`;
    } catch (err) {
        console.error("Load error:", err);
        if (statusText) statusText.innerText = `Error: ${err.message}`;
    }
};

window.savePropertyToDatabase = async (showModal = true) => {
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
            logoUrl: DEFAULT_WW_ICON,
            bannerUrl: DEFAULT_WW_ICON,
            iconUrl: DEFAULT_WW_ICON,
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: window.compiledRooms || [],
            channex: {
                apiKey: getVal('chan-api-key') || window.channexConfig.apiKey || '',
                propId: getVal('chan-prop-id') || window.channexConfig.propId || '',
                rateMultiplier: 100
            },
            channexMap: window.channexMap || [],
            channexRateMap: window.channexRateMap || [],
            enableEventRates: false,
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

        if (statusText) statusText.innerText = `Saved ${name}!`;
        if (showModal) window.customAlert("Success", `Configuration for "${name}" (${short}) saved.`);
    } catch (err) {
        console.error("Save error:", err);
        if (statusText) statusText.innerText = "Error saving property!";
        window.customAlert("Save Error", err.message);
    }
};

window.switchSetupProperty = async (propId) => {
    if (!propId || propId === window.activePropertyId) return;
    window.activePropertyId = propId;
    await window.loadPropertyFromDatabase(propId);
    window.jumpStep(1);
};

// --- INITIALIZER WITH STATE CHECK ---
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
