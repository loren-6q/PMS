// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// Wild & Wandering Property Management System
// Hosted at: https://loren-6q.github.io/PMS/setup-engine.js
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

// --- CLIENT-SIDE INSTANT IMAGE COMPRESSOR (Prevents 1MB Firestore Crash & Slow Uploads) ---
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

// --- CHANNEL NAME CANONICALIZER & DEDUPLICATOR ---
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

// --- FIRESTORE DEEP SANITIZER (Guarantees Zero 'undefined' Values) ---
function sanitizeForFirestore(data) {
    if (data === undefined) return null;
    if (data === null) return null;
    if (Array.isArray(data)) {
        return data.map(item => sanitizeForFirestore(item));
    }
    if (typeof data === 'object' && !(data instanceof Date)) {
        const cleaned = {};
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined) {
                cleaned[key] = sanitizeForFirestore(val);
            } else {
                cleaned[key] = null;
            }
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
window.ratesSpan = 2; // ±2 Days
window.restrSpan = 6; // ±6 Days

const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

// --- DYNAMIC FAVICON SWITCHER ---
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
    const appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (appleLink) appleLink.href = url;
};

// --- NAVIGATION & STEP CONTROLLERS ---
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

window.nextStep = () => {
    if (window.currentStep < 5) window.jumpStep(window.currentStep + 1);
};

window.prevStep = () => {
    if (window.currentStep > 1) window.jumpStep(window.currentStep - 1);
};

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
    if (!modal) return;
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

// --------------------------------------------------------------------------
// SECTION 3: Step 1 - Brand Asset Manager & Add-ons Catalogue
// --------------------------------------------------------------------------
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

    const propId = window.activePropertyId || 'loud_samui';
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
        window.customAlert("Success", `${logoType.toUpperCase()} logo optimized and uploaded successfully.`);
    } catch (err) {
        console.warn("Storage upload failed, keeping optimized thumbnail DataURL:", err);
        if (statusText) statusText.innerText = "Logo saved locally.";
    }
};

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
            { id: 'add_1', order: 1, name: 'Ferry Ticket (Koh Phangan / Tao)', category: 'Transfer', price: 400, type: 'per-item' },
            { id: 'add_2', order: 2, name: 'Van Transfer (Airport / Pier)', category: 'Transfer', price: 300, type: 'per-item' },
            { id: 'add_3', order: 3, name: 'Scooter Rental (24 Hours)', category: 'Rental', price: 250, type: 'per-day' },
            { id: 'add_4', order: 4, name: 'Laundry Service (Per Bag)', category: 'Service', price: 100, type: 'per-item' },
            { id: 'add_5', order: 5, name: 'Late Check-out (Until 3 PM)', category: 'Stay', price: 300, type: 'one-off' },
            { id: 'add_6', order: 6, name: 'Full Moon Warm-Up Drink Package', category: 'F&B', price: 350, type: 'one-off' }
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
                    <option value="one-off" ${item.type === 'one-off' ? 'selected' : ''}>One-Off Charge</option>
                    <option value="per-day" ${item.type === 'per-day' ? 'selected' : ''}>Per Day</option>
                    <option value="per-item" ${item.type === 'per-item' ? 'selected' : ''}>Per Item / Qty</option>
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

// --------------------------------------------------------------------------
// SECTION 4: Step 2 - Room Inventory & Cascade Renamer
// --------------------------------------------------------------------------
window.toggleBatchDormPanel = (forceState = null) => {
    const p = document.getElementById('batch-dorm-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    if (shouldShow) p.classList.remove('hidden');
    else p.classList.add('hidden');
};

window.toggleBatchRoomPanel = (forceState = null) => {
    const p = document.getElementById('batch-room-panel');
    if (!p) return;
    const shouldShow = forceState !== null ? forceState : p.classList.contains('hidden');
    if (shouldShow) p.classList.remove('hidden');
    else p.classList.add('hidden');
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

window.compileRoomsFromDefinitions = () => {
    const existingRooms = window.compiledRooms || window.currentPropertyConfig?.rooms || [];
    const existingByParent = {};
    existingRooms.forEach(r => {
        const p = (r.parentRoom || r.id).toUpperCase().trim();
        if (!existingByParent[p]) existingByParent[p] = [];
        existingByParent[p].push(r);
    });

    const compiled = [];

    (window.roomDefinitions || []).forEach((def, defIdx) => {
        const rawName = (def.name || def.id || `ROOM ${defIdx + 1}`).trim();
        const category = (def.category || 'Standard Room').trim();
        const floor = (def.floor || '1').trim();
        const total = parseInt(def.count, 10) || 1;

        // PRIVATE ROOM RULE: If rule is 'private' or isDorm is false, it is strictly a single private room unit.
        // Even with 2 beds (Twin) or 3 beds (Triple), a private room is ONE unit and must produce only ONE line on the calendar.
        const isPrivate = def.rule === 'private' || def.isDorm === false;
        const isDorm = !isPrivate;

        if (isDorm) {
            const parentKey = rawName.toUpperCase();
            const existingBeds = existingByParent[parentKey] || 
                                 existingByParent[parentKey.replace(/^DORM\s+/i, '')] ||
                                 existingByParent[`DORM ${parentKey}`] || [];

            // Detect prefix from existing beds or room letter
            let pfx = '';
            if (existingBeds.length > 0 && existingBeds[0].id) {
                const m = existingBeds[0].id.match(/^([A-Za-z]+)/);
                if (m) pfx = m[1].toUpperCase();
            }
            if (!pfx) {
                const m = rawName.match(/(?:DORM\s+)?([A-Za-z]+)$/i);
                if (m && m[1].length <= 2) {
                    pfx = m[1].toUpperCase();
                }
            }

            for (let b = 1; b <= total; b++) {
                let bunkTag = 'single';
                if (def.rule === 'odd-top') bunkTag = (b % 2 === 1) ? 'top' : 'bottom';
                else if (def.rule === 'even-top') bunkTag = (b % 2 === 0) ? 'top' : 'bottom';

                let bedId = '';
                if (existingBeds[b - 1] && existingBeds[b - 1].id) {
                    bedId = existingBeds[b - 1].id;
                } else if (pfx) {
                    bedId = `${pfx}${String(b).padStart(2, '0')}`;
                } else if (/^\d+$/.test(rawName) || /DORM\s+\d+/i.test(rawName)) {
                    const num = rawName.replace(/\D/g, '');
                    bedId = `${num}-${String(b).padStart(2, '0')}`;
                } else {
                    bedId = `${rawName}-${String(b).padStart(2, '0')}`;
                }

                compiled.push({
                    id: bedId,
                    type: category,
                    category: category,
                    floor: floor,
                    bed: bunkTag,
                    bunk: bunkTag,
                    icon: bunkTag,
                    parentRoom: rawName,
                    isDorm: true
                });
            }
        } else {
            // Exactly ONE entry on the calendar for this private room, recording bedCount
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
                isDorm: false
            });
        }
    });

    // Group contiguously by category so the PMS calendar renders clean, unified sections
    compiled.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.id.localeCompare(b.id, undefined, { numeric: true });
    });

    window.compiledRooms = compiled;

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.innerText = `${(window.roomDefinitions || []).length} Rooms`;
    if (uBadge) uBadge.innerText = `${compiled.length} Beds/Units Total`;

    window.renderBedPreviewDrawer();
};

// Read current inputs directly from DOM before saving or re-rendering
window.syncRoomDefsFromDOM = () => {
    const rows = document.querySelectorAll('#room-def-list-body tr[data-room-idx]');
    if (!rows || rows.length === 0) return;
    rows.forEach(tr => {
        const idx = parseInt(tr.dataset.roomIdx, 10);
        if (window.roomDefinitions && window.roomDefinitions[idx]) {
            const inputs = tr.querySelectorAll('input, select');
            if (inputs[0] && inputs[0].value.trim()) window.roomDefinitions[idx].name = inputs[0].value.trim();
            if (inputs[1] && inputs[1].value.trim()) window.roomDefinitions[idx].category = inputs[1].value.trim();
            if (inputs[2]) window.roomDefinitions[idx].count = parseInt(inputs[2].value, 10) || 1;
            if (inputs[3]) window.roomDefinitions[idx].floor = inputs[3].value.trim() || '1';
            if (inputs[4]) {
                window.roomDefinitions[idx].rule = inputs[4].value;
                window.roomDefinitions[idx].isDorm = inputs[4].value !== 'private';
            }
        }
    });
};

window.renderRoomDefinitionsTable = () => {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;

    if (!window.roomDefinitions || window.roomDefinitions.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-6 text-center text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                No rooms configured. Use "BATCH DORM" or "BATCH ROOM" above to generate your inventory.
            </td>
        </tr>`;
        return;
    }

    // Populate Category Datalist for autocomplete
    const catList = document.getElementById('setup-category-datalist');
    if (catList) {
        const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
        catList.innerHTML = existingCats.map(c => `<option value="${c}"></option>`).join('');
    }

    let html = '';
    window.roomDefinitions.forEach((def, idx) => {
        html += `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100" data-room-idx="${idx}">
            <td class="p-1.5">
                <input type="text" class="table-input font-bold" value="${def.name || ''}" onchange="window.updateRoomDefField(${idx}, 'name', this.value)">
            </td>
            <td class="p-1.5">
                <input type="text" list="setup-category-datalist" class="table-input font-bold text-indigo-700" value="${def.category || ''}" onchange="window.updateRoomDefField(${idx}, 'category', this.value)">
            </td>
            <td class="p-1.5 text-center">
                <input type="number" min="1" max="60" class="table-input font-black text-center !w-16 mx-auto" value="${def.count || 1}" onchange="window.updateRoomDefField(${idx}, 'count', parseInt(this.value,10)||1)">
            </td>
            <td class="p-1.5">
                <input type="text" class="table-input text-center !w-20" value="${def.floor || '1'}" onchange="window.updateRoomDefField(${idx}, 'floor', this.value)">
            </td>
            <td class="p-1.5">
                <select class="table-input font-semibold" onchange="window.updateRoomDefField(${idx}, 'rule', this.value)">
                    <option value="odd-top" ${def.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="even-top" ${def.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="single" ${def.rule === 'single' ? 'selected' : ''}>DORM (Single Beds)</option>
                    <option value="private" ${def.rule === 'private' ? 'selected' : ''}>PRIVATE ROOM</option>
                </select>
            </td>
            <td class="p-1.5 text-center">
                <button type="button" onclick="window.deleteRoomDef(${idx})" class="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.updateRoomDefField = (idx, field, val) => {
    if (window.roomDefinitions && window.roomDefinitions[idx]) {
        window.roomDefinitions[idx][field] = val;
        window.compileRoomsFromDefinitions();
    }
};

window.deleteRoomDef = (idx) => {
    if (window.roomDefinitions && window.roomDefinitions[idx]) {
        window.roomDefinitions.splice(idx, 1);
        window.compileRoomsFromDefinitions();
        window.renderRoomDefinitionsTable();
    }
};

window.clearAllRoomDefs = () => {
    window.customAlert("Clear Inventory", "Are you sure you want to clear all room definitions?", true, () => {
        window.roomDefinitions = [];
        window.compileRoomsFromDefinitions();
        window.renderRoomDefinitionsTable();
    });
};

window.addBlankRoomDef = () => {
    window.roomDefinitions = window.roomDefinitions || [];
    window.roomDefinitions.push({
        id: 'room_' + Math.random().toString(36).substr(2, 7),
        name: 'ROOM ' + (window.roomDefinitions.length + 1),
        category: 'Standard Room',
        count: 1,
        floor: '1',
        rule: 'private',
        isDorm: false
    });
    window.compileRoomsFromDefinitions();
    window.renderRoomDefinitionsTable();
};

// --- AUTOMATIC CASCADE RENAMING ENGINE ---
window.handleCategoryNameChange = async (idx, newCatName, oldCatName) => {
    const cleanNew = (newCatName || '').trim();
    const cleanOld = (oldCatName || '').trim();
    if (!cleanNew || cleanNew === cleanOld) return;

    if (window.roomDefinitions && window.roomDefinitions[idx]) {
        window.roomDefinitions[idx].category = cleanNew;
    }
    window.compileRoomsFromDefinitions();

    window.customAlert(
        "Cascade Rename Category",
        `Update all bookings, relational pricing rules, and rate anchors from "${cleanOld}" to "${cleanNew}"?`,
        true,
        async () => {
            await window.cascadeRenameCategory(cleanOld, cleanNew);
        }
    );
};

window.cascadeRenameCategory = async (oldCat, newCat) => {
    if (!oldCat || !newCat || oldCat === newCat) return;
    const curProp = window.activePropertyId;
    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Cascading rename: ${oldCat} → ${newCat}...`;

    try {
        const batch = writeBatch(db);

        // 1. Cascade to bookings collection (staff)
        const staffRef = collection(db, 'artifacts', appId, 'public', 'data', 'staff');
        const qStaff = query(staffRef, where('property', '==', curProp));
        const staffSnap = await getDocs(qStaff);

        let staffUpdated = 0;
        staffSnap.forEach(docSnap => {
            const data = docSnap.data();
            let dirty = false;
            const updateObj = {};

            if (data.category === oldCat) { updateObj.category = newCat; dirty = true; }
            if (data.bookedType === oldCat) { updateObj.bookedType = newCat; dirty = true; }
            if (data.roomType === oldCat) { updateObj.roomType = newCat; dirty = true; }

            if (dirty) {
                batch.update(docSnap.ref, updateObj);
                staffUpdated++;
            }
        });

        // 2. Cascade to pricing master document
        const canonId = curProp;
        const pricingRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${canonId}`);
        const pSnap = await getDoc(pricingRef);

        if (pSnap.exists()) {
            const pData = pSnap.data();
            let pDirty = false;

            if (Array.isArray(pData.relationships)) {
                pData.relationships.forEach(rel => {
                    if (rel.anchor === oldCat) { rel.anchor = newCat; pDirty = true; }
                    if (rel.target === oldCat) { rel.target = newCat; pDirty = true; }
                });
                pDirty = true;
            }
            if (pData.pricingRules) {
                if (pData.pricingRules.anchorPrivate === oldCat) { pData.pricingRules.anchorPrivate = newCat; pDirty = true; }
                if (pData.pricingRules.anchorDorm === oldCat) { pData.pricingRules.anchorDorm = newCat; pDirty = true; }
            }
            if (pData.autofillBaselines) {
                if (pData.autofillBaselines.anchor_p === oldCat) { pData.autofillBaselines.anchor_p = newCat; pDirty = true; }
                if (pData.autofillBaselines.anchor_d === oldCat) { pData.autofillBaselines.anchor_d = newCat; pDirty = true; }
            }

            if (pDirty) {
                batch.set(pricingRef, sanitizeForFirestore(pData), { merge: true });
            }
        }

        // 3. Update active memory rules
        (window.relationships || []).forEach(rel => {
            if (rel.anchor === oldCat) rel.anchor = newCat;
            if (rel.target === oldCat) rel.target = newCat;
        });
        if (window.pricingRules) {
            if (window.pricingRules.anchorPrivate === oldCat) window.pricingRules.anchorPrivate = newCat;
            if (window.pricingRules.anchorDorm === oldCat) window.pricingRules.anchorDorm = newCat;
        }

        await batch.commit();
        if (statusText) statusText.innerText = `Renamed ${oldCat} → ${newCat} (${staffUpdated} bookings updated)`;
        window.customAlert("Cascade Complete", `Successfully updated category across ${staffUpdated} bookings and all pricing rules.`);
    } catch (err) {
        console.error("Cascade rename error:", err);
        window.customAlert("Cascade Error", "Could not complete cascade update: " + err.message);
    }
};

window.toggleBedPreviewDrawer = (forceState = null) => {
    const d = document.getElementById('bed-preview-drawer');
    if (!d) return;
    const shouldShow = forceState !== null ? forceState : d.classList.contains('hidden');
    if (shouldShow) d.classList.remove('hidden');
    else d.classList.add('hidden');
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

    let html = '';
    Object.keys(grouped).forEach(parentName => {
        const units = grouped[parentName];
        html += `
        <div class="bg-white p-2 rounded border border-slate-300 shadow-2xs min-w-[140px]">
            <div class="font-black text-slate-800 text-[11px] border-b border-slate-200 pb-1 mb-1.5 flex items-center justify-between">
                <span>${parentName}</span>
                <span class="text-[9px] font-bold text-slate-400">Fl. ${units[0]?.floor || 1}</span>
            </div>
            <div class="flex flex-wrap gap-1">
                ${units.map(u => `
                    <span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold ${u.bunk === 'top' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : (u.bunk === 'bottom' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200')}">
                        ${u.id}
                    </span>
                `).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
};

// --------------------------------------------------------------------------
// SECTION 5: Step 3 - Channex API & Multi-Room Rate Plan Creation Tool
// --------------------------------------------------------------------------
window.fetchChannexData = async () => {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Credentials Required", "Enter both your Channex API Key and Channex Property ID.");
    }

    const badge = document.getElementById('channex-conn-badge');
    if (badge) badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Connecting...`;

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

        if (badge) badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Connected (${channexRooms.length} Rooms, ${cleanRatePlans.length} Plans)`;
        window.renderUnifiedMappingCards();
        window.customAlert("Channex Connected", `Successfully fetched ${channexRooms.length} Room Types and ${cleanRatePlans.length} Rate Plans.`);
    } catch (err) {
        console.error("Channex fetch error:", err);
        if (badge) badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Connection Failed`;
        window.customAlert("Connection Failed", err.message);
    }
};

window.renderUnifiedMappingCards = () => {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;

    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    if (pmsCats.length === 0) {
        container.innerHTML = `
        <div class="bg-white p-6 rounded-lg border border-slate-300 text-center text-xs font-bold text-slate-400">
            No PMS room categories found. Define your rooms in Step 2 first.
        </div>`;
        return;
    }

    const channexRooms = window.channexRooms || [];
    const channexPlans = window.channexRatePlans || [];

    const getChannelBadge = (ch) => {
        const c = (ch || '').toLowerCase();
        if (c.includes('booking') || c.includes('bdc')) return `<span class="bg-[#003580] text-white px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Booking.com</span>`;
        if (c.includes('hostelworld') || c.includes('hw')) return `<span class="bg-[#F15A24] text-white px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Hostelworld</span>`;
        if (c.includes('agoda')) return `<span class="bg-[#87B2D6] text-white px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Agoda</span>`;
        if (c.includes('airbnb') || c.includes('abnb')) return `<span class="bg-[#FF5A5F] text-white px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Airbnb</span>`;
        if (c.includes('expedia') || c.includes('exp')) return `<span class="bg-[#facc15] text-[#003580] px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Expedia</span>`;
        return `<span class="bg-slate-700 text-white px-2 py-0.5 text-[9px] font-black rounded shadow-2xs tracking-wide">Base (Standard)</span>`;
    };

    const getChannelBorderAccent = (ch) => {
        const c = (ch || '').toLowerCase();
        if (c.includes('booking') || c.includes('bdc')) return 'border-l-4 border-l-[#003580]';
        if (c.includes('hostelworld') || c.includes('hw')) return 'border-l-4 border-l-[#F15A24]';
        if (c.includes('agoda')) return 'border-l-4 border-l-[#87B2D6]';
        if (c.includes('airbnb') || c.includes('abnb')) return 'border-l-4 border-l-[#FF5A5F]';
        if (c.includes('expedia') || c.includes('exp')) return 'border-l-4 border-l-[#facc15]';
        return 'border-l-4 border-l-slate-400';
    };

    let html = '';
    pmsCats.forEach(cat => {
        const mappedRoom = (window.channexMap || []).find(m => m.pmsCategory === cat);
        const mappedChannexId = mappedRoom?.channexId || '';

        const plansForThisRoom = channexPlans.filter(p => {
            const pRoomId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id;
            return pRoomId && pRoomId === mappedChannexId;
        });

        const isMapped = !!mappedChannexId;

        html += `
        <div class="bg-white border ${isMapped ? 'border-slate-300 shadow-xs' : 'border-amber-300 bg-amber-50/20 shadow-xs'} rounded-lg overflow-hidden mb-3">
            <div class="bg-slate-100/90 border-b border-slate-300 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full ${isMapped ? 'bg-emerald-500 shadow-xs' : 'bg-amber-400 animate-pulse'}"></span>
                    <h3 class="text-xs font-black uppercase tracking-wider text-slate-800">${cat}</h3>
                    <span class="text-[9.5px] px-1.5 py-0.5 rounded font-bold ${isMapped ? 'bg-white text-slate-600 border border-slate-200' : 'bg-amber-100 text-amber-800 font-black border border-amber-300'}">
                        ${plansForThisRoom.length} Rate Plans ${isMapped ? '' : '• Unmapped'}
                    </span>
                </div>

                <div class="flex items-center gap-1.5">
                    <label class="text-[9.5px] font-black uppercase text-slate-500">Channex Room:</label>
                    <select class="table-input font-bold ${isMapped ? 'text-indigo-700 bg-white' : 'text-amber-800 border-amber-300 bg-amber-50'} !w-56" onchange="window.updateRoomMappingPair('${cat}', this.value)">
                        <option value="">-- Unmapped --</option>
                        ${channexRooms.map(cr => `
                            <option value="${cr.id}" ${cr.id === mappedChannexId ? 'selected' : ''}>${cr.attributes?.title || cr.id}</option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-[11px] border-collapse border-b border-slate-200">
                    <thead class="bg-slate-800 text-[9.5px] font-black uppercase text-slate-200 border-b border-slate-900">
                        <tr>
                            <th class="p-2 border-r border-slate-700">Rate Plan Title</th>
                            <th class="p-2 w-36 text-center border-r border-slate-700">Channel</th>
                            <th class="p-2 w-28 text-center border-r border-slate-700">Policy</th>
                            <th class="p-2 w-28 text-center border-r border-slate-700">Product</th>
                            <th class="p-2 text-center w-24">Channex ID</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 font-semibold">
                        ${plansForThisRoom.length > 0 ? plansForThisRoom.map((p, pIdx) => {
                            const title = p.attributes?.title || p.id;
                            const isRef = /ref|flexible/i.test(title) && !/non-?ref/i.test(title);
                            const isBdc = /bdc|booking/i.test(title);
                            const isHw = /hw|hostelworld/i.test(title);
                            const isAgo = /agoda/i.test(title);
                            const isExp = /expedia/i.test(title);
                            const isEvt = /evt|fmp|event|pkg/i.test(title);

                            let chanName = 'Default';
                            if (isBdc) chanName = 'Booking.com';
                            else if (isHw) chanName = 'Hostelworld';
                            else if (isAgo) chanName = 'Agoda';
                            else if (isExp) chanName = 'Expedia';

                            const borderAccent = getChannelBorderAccent(chanName);
                            const zebraClass = pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';

                            return `
                            <tr class="${zebraClass} hover:bg-indigo-50/50 transition-colors ${borderAccent}">
                                <td class="p-2 font-bold text-slate-800 border-r border-slate-200">${title}</td>
                                <td class="p-2 text-center border-r border-slate-200">${getChannelBadge(chanName)}</td>
                                <td class="p-2 text-center border-r border-slate-200">
                                    <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isRef ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}">
                                        ${isRef ? 'REFUNDABLE' : 'NON-REF'}
                                    </span>
                                </td>
                                <td class="p-2 text-center border-r border-slate-200">
                                    <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isEvt ? 'bg-pink-100 text-pink-700 border border-pink-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                                        ${isEvt ? 'EVENT' : 'STANDARD'}
                                    </span>
                                </td>
                                <td class="p-2 text-center">
                                    <span class="font-mono text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">...${p.id.slice(-6)}</span>
                                </td>
                            </tr>`;
                        }).join('') : `
                        <tr>
                            <td colspan="5" class="p-4 text-center text-slate-400 italic text-[11px] bg-slate-50">
                                No rate plans found in Channex for this room type. Click "+ Create & Push Plan" above to create them automatically.
                            </td>
                        </tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
    });

    container.innerHTML = html;
};

window.updateRoomMappingPair = (pmsCat, channexRoomId) => {
    window.channexMap = window.channexMap || [];
    const existing = window.channexMap.find(m => m.pmsCategory === pmsCat);
    const cr = (window.channexRooms || []).find(r => r.id === channexRoomId);
    const crTitle = cr ? cr.attributes?.title : '';

    if (existing) {
        existing.channexId = channexRoomId;
        existing.channexTitle = crTitle || '';
    } else {
        window.channexMap.push({ channexId: channexRoomId, channexTitle: crTitle || '', pmsCategory: pmsCat });
    }
    window.renderUnifiedMappingCards();
};

// --- MULTI-ROOM RATE PLAN CREATION MODAL TOOL ---
window.openCreateRatePlanModal = () => {
    const modal = document.getElementById('create-rate-plan-modal');
    if (!modal) return;

    const checklist = document.getElementById('crp-room-checklist');
    if (checklist) {
        const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
        checklist.innerHTML = pmsCats.map(cat => `
            <label class="flex items-center gap-2 p-1 rounded hover:bg-white cursor-pointer text-xs font-bold text-slate-800">
                <input type="checkbox" value="${cat}" class="crp-room-check row-checkbox" checked>
                <span>${cat}</span>
            </label>
        `).join('');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
};

window.closeCreateRatePlanModal = () => {
    const modal = document.getElementById('create-rate-plan-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.applyRatePlanPreset = (title, channel, policy, product) => {
    const titleEl = document.getElementById('crp-title');
    const chanEl = document.getElementById('crp-channel');
    const polEl = document.getElementById('crp-policy');

    if (titleEl) titleEl.value = title;
    if (chanEl) chanEl.value = channel;
    if (polEl) polEl.value = policy;
};

window.toggleAllTargetRooms = (checked) => {
    document.querySelectorAll('.crp-room-check').forEach(cb => { cb.checked = !!checked; });
};

window.executeCreateAndPushRatePlan = async () => {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();
    const planTitle = document.getElementById('crp-title')?.value.trim();
    const channel = document.getElementById('crp-channel')?.value || 'DEFAULT';
    const policy = document.getElementById('crp-policy')?.value || 'non-ref';

    if (!apiKey || !propId) return window.customAlert("Error", "Channex API Key and Property ID must be entered.");
    if (!planTitle) return window.customAlert("Error", "Enter a title for the rate plan.");

    const selectedCats = Array.from(document.querySelectorAll('.crp-room-check:checked')).map(cb => cb.value);
    if (selectedCats.length === 0) return window.customAlert("Selection Required", "Select at least one room category to push to.");

    const btn = document.getElementById('btn-confirm-push-rate');
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="animate-pulse">Pushing to Channex...</span>`; }

    let createdCount = 0;
    let failedRooms = [];

    for (const cat of selectedCats) {
        const mapped = (window.channexMap || []).find(m => m.pmsCategory === cat);
        const roomId = mapped?.channexId;

        if (!roomId) {
            failedRooms.push(`${cat} (Not mapped to Channex)`);
            continue;
        }

        try {
            const res = await fetch(`https://app.channex.io/api/v1/rate_plans`, {
                method: "POST",
                headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({
                    rate_plan: {
                        property_id: propId,
                        room_type_id: roomId,
                        title: planTitle,
                        options: [{ occupancy: 1, rate: 100 }]
                    }
                })
            });

            if (res.ok) {
                const json = await res.json();
                createdCount++;
                window.channexRatePlans = window.channexRatePlans || [];
                window.channexRatePlans.push(json.data);
            } else {
                failedRooms.push(cat);
            }
        } catch (e) {
            failedRooms.push(cat);
        }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="cloud-upload" size="13"></i> Push to Selected Rooms`; }
    window.closeCreateRatePlanModal();
    window.renderUnifiedMappingCards();

    let msg = `Created and pushed "${planTitle}" across ${createdCount} room categories in Channex!`;
    if (failedRooms.length > 0) msg += `\n\nFailed / Unmapped: ${failedRooms.join(', ')}`;
    window.customAlert("Rate Plan Creation Complete", msg);
};

// --------------------------------------------------------------------------
// SECTION 6: Step 4 - Pricing Rules, Relational Links & Event Curves
// --------------------------------------------------------------------------
window.renderPricingStepRules = () => {
    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    const dormAnchorSel = document.getElementById('anchor-dorm-select');
    const privAnchorSel = document.getElementById('anchor-private-select');

    const defaultDorm = pmsCats.find(c => c.toLowerCase().includes('dorm') || c.toLowerCase().includes('bed')) || pmsCats[0] || '';
    const defaultPriv = pmsCats.find(c => !c.toLowerCase().includes('dorm') && !c.toLowerCase().includes('bed')) || pmsCats[1] || pmsCats[0] || '';

    if (dormAnchorSel) {
        dormAnchorSel.innerHTML = pmsCats.map(c => `
            <option value="${c}" ${(window.pricingRules.anchorDorm === c || (!window.pricingRules.anchorDorm && c === defaultDorm)) ? 'selected' : ''}>${c}</option>
        `).join('');
    }
    if (privAnchorSel) {
        privAnchorSel.innerHTML = pmsCats.map(c => `
            <option value="${c}" ${(window.pricingRules.anchorPrivate === c || (!window.pricingRules.anchorPrivate && c === defaultPriv)) ? 'selected' : ''}>${c}</option>
        `).join('');
    }

    window.renderRelationshipsTable();
    window.renderChannelRulesList();
    window.renderEventPriceTable();
    window.renderEventRestrTable();
};

window.renderRelationshipsTable = () => {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;

    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    if (!window.relationships || window.relationships.length === 0) {
        window.relationships = [];
        if (pmsCats.length > 1) {
            window.relationships.push({
                anchor: pmsCats[0],
                target: pmsCats[1],
                type: '+',
                val: 300,
                typeFmp: '+',
                valFmp: 500
            });
        }
    }

    let html = '';
    window.relationships.forEach((rel, idx) => {
        html += `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100" data-rel-idx="${idx}">
            <td class="p-1.5">
                <select class="table-input font-bold" onchange="window.updateRelationshipField(${idx}, 'anchor', this.value)">
                    ${pmsCats.map(c => `<option value="${c}" ${c === rel.anchor ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td class="p-1.5">
                <select class="table-input font-bold" onchange="window.updateRelationshipField(${idx}, 'target', this.value)">
                    ${pmsCats.map(c => `<option value="${c}" ${c === rel.target ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td class="p-1.5">
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-black" onchange="window.updateRelationshipField(${idx}, 'type', this.value)">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>- %</option>
                    </select>
                    <input type="number" step="any" class="table-input font-bold text-center !w-20" value="${rel.val || 0}" onchange="window.updateRelationshipField(${idx}, 'val', parseFloat(this.value)||0)">
                </div>
            </td>
            <td class="p-1.5 evt-col-cell">
                <div class="flex items-center gap-1">
                    <select class="table-input !w-16 font-black text-pink-700 bg-pink-50" onchange="window.updateRelationshipField(${idx}, 'typeFmp', this.value)">
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>=</option>
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>- ฿</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>- %</option>
                    </select>
                    <input type="number" step="any" class="table-input font-bold text-center !w-20 text-pink-800 bg-pink-50" value="${rel.valFmp || 0}" onchange="window.updateRelationshipField(${idx}, 'valFmp', parseFloat(this.value)||0)">
                </div>
            </td>
            <td class="p-1.5 text-center">
                <button type="button" onclick="window.removeRelationshipRow(${idx})" class="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = () => {
    const pmsCats = [...new Set((window.roomDefinitions || []).map(r => r.category))];
    window.relationships = window.relationships || [];
    window.relationships.push({
        anchor: pmsCats[0] || 'Anchor Room',
        target: pmsCats[1] || pmsCats[0] || 'Target Room',
        type: '+',
        val: 200,
        typeFmp: '+',
        valFmp: 300
    });
    window.renderRelationshipsTable();
};

window.removeRelationshipRow = (idx) => {
    if (window.relationships && window.relationships[idx]) {
        window.relationships.splice(idx, 1);
        window.renderRelationshipsTable();
    }
};

window.updateRelationshipField = (idx, field, val) => {
    if (window.relationships && window.relationships[idx]) {
        window.relationships[idx][field] = val;
    }
};

// --- CANONICAL CHANNEL RULES RENDERER ---
window.renderChannelRulesList = () => {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;

    // Deduplicate any mixed casing from Firestore memory into single canonical keys
    const rawChannels = window.pricingRules.channels || {};
    const cleanChannels = {};

    Object.keys(rawChannels).forEach(rawK => {
        const canonical = normalizeChannelName(rawK);
        if (!cleanChannels[canonical]) {
            cleanChannels[canonical] = rawChannels[rawK];
        }
    });

    // Ensure all standard operational channels exist once
    if (!cleanChannels['Default']) cleanChannels['Default'] = { type: '=', val: 0 };
    if (!cleanChannels['Direct']) cleanChannels['Direct'] = { type: '-%', val: 10 };
    if (!cleanChannels['Booking.com']) cleanChannels['Booking.com'] = { type: '=', val: 0 };
    if (!cleanChannels['Hostelworld']) cleanChannels['Hostelworld'] = { type: '+%', val: 15 };
    if (!cleanChannels['Agoda']) cleanChannels['Agoda'] = { type: '=', val: 0 };
    if (!cleanChannels['Expedia']) cleanChannels['Expedia'] = { type: '=', val: 0 };

    window.pricingRules.channels = cleanChannels;

    const channelBadges = {
        'Default': 'bg-slate-700 text-white',
        'Direct': 'bg-teal-600 text-white',
        'Booking.com': 'bg-[#003580] text-white',
        'Hostelworld': 'bg-[#F15A24] text-white',
        'Agoda': 'bg-[#87B2D6] text-white',
        'Expedia': 'bg-[#facc15] text-[#003580]',
        'Airbnb': 'bg-[#FF5A5F] text-white'
    };

    let html = '';
    Object.keys(cleanChannels).forEach(ch => {
        const rule = cleanChannels[ch] || { type: '=', val: 0 };
        const badgeClass = channelBadges[ch] || 'bg-indigo-600 text-white';

        html += `
        <div class="flex items-center justify-between p-2 rounded bg-white border border-amber-200 shadow-2xs">
            <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[9.5px] font-black uppercase ${badgeClass}">${ch}</span>
                <span class="font-bold text-slate-700 text-xs">${ch === 'Default' ? 'Default Channex Feed' : (ch === 'Direct' ? 'Direct Booking Engine' : `${ch} OTA Adjustment`)}</span>
            </div>
            <div class="flex items-center gap-1.5">
                <select class="table-input !w-20 font-black text-center" onchange="window.updateChannelRuleField('${ch}', 'type', this.value)">
                    <option value="=" ${rule.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${rule.type === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${rule.type === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+" ${rule.type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${rule.type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" step="any" class="table-input font-bold text-center !w-16" value="${rule.val || 0}" onchange="window.updateChannelRuleField('${ch}', 'val', parseFloat(this.value)||0)">
            </div>
        </div>`;
    });
    container.innerHTML = html;
};

window.updateChannelRuleField = (ch, field, val) => {
    window.pricingRules.channels = window.pricingRules.channels || {};
    window.pricingRules.channels[ch] = window.pricingRules.channels[ch] || { type: '=', val: 0 };
    window.pricingRules.channels[ch][field] = val;
};

window.addVerifiedChannelRule = () => {
    const chName = prompt("Enter Channel Name (e.g. Airbnb, Trip.com):");
    if (!chName || !chName.trim()) return;
    const clean = normalizeChannelName(chName.trim());
    window.pricingRules.channels = window.pricingRules.channels || {};
    if (window.pricingRules.channels[clean]) {
        return window.customAlert("Channel Exists", `A rule for ${clean} already exists.`);
    }
    window.pricingRules.channels[clean] = { type: '+%', val: 10 };
    window.renderChannelRulesList();
};

// --- EVENT PRICING CURVES (±2D Rates, ±6D Restrictions) ---
window.toggleEventSettings = (enabled) => {
    const p = document.getElementById('event-curve-panel');
    if (p) {
        if (enabled) p.classList.remove('hidden');
        else p.classList.add('hidden');
    }
    document.querySelectorAll('.evt-col-header, .evt-col-cell, #evt-ref-row').forEach(el => {
        el.style.display = enabled ? '' : 'none';
    });
};

window.cycleRatesSpan = () => {
    window.ratesSpan = (window.ratesSpan === 2) ? 3 : 2;
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.innerText = `±${window.ratesSpan} Days`;
    window.renderEventPriceTable();
};

window.cycleRestrSpan = () => {
    window.restrSpan = (window.restrSpan === 6) ? 7 : (window.restrSpan === 7 ? 2 : 6);
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.innerText = `±${window.restrSpan} Days`;
    window.renderEventRestrTable();
};

window.renderEventPriceTable = () => {
    const thead = document.getElementById('event-price-thead');
    const tbody = document.getElementById('event-price-tbody');
    if (!thead || !tbody) return;

    const span = window.ratesSpan || 2;
    const offsets = [];
    for (let i = -span; i <= span; i++) offsets.push(i);

    thead.innerHTML = `
        <tr class="bg-pink-100/70 text-[9px] font-black uppercase text-pink-950 border-b border-pink-200">
            <th class="p-1.5 text-left w-28">Segment</th>
            <th class="p-1.5 w-20">Std Base</th>
            <th class="p-1.5 w-20 text-pink-700">Pkg Base</th>
            ${offsets.map(o => `
                <th class="p-1.5 ${o === 0 ? 'bg-amber-200 text-amber-950 font-black' : ''}">
                    ${o === 0 ? 'Peak (0)' : (o > 0 ? `+${o}D` : `${o}D`)}
                </th>
            `).join('')}
        </tr>`;

    const b = window.savedAutofillBaselines || {};
    tbody.innerHTML = `
        <tr>
            <td class="p-1.5 text-left font-bold text-indigo-900">Privates</td>
            <td class="p-1"><input type="number" class="table-input text-center font-bold" id="w-p-base" value="${b.p_base || 899}"></td>
            <td class="p-1"><input type="number" class="table-input text-center font-bold text-pink-700" id="w-p-pkg" value="${b.p_pkg || 1000}"></td>
            ${offsets.map(o => {
                const tag = o < 0 ? `m${Math.abs(o)}` : (o === 0 ? '0' : `p${o}`);
                const defVal = (o === 0 ? (b.p_0 || 5999) : (b[`p_${tag}`] || 1999));
                return `<td class="p-1"><input type="number" class="table-input text-center font-black ${o === 0 ? 'text-amber-700 bg-amber-50 border-amber-300' : ''}" id="w-p-${tag}" value="${defVal}"></td>`;
            }).join('')}
        </tr>
        <tr>
            <td class="p-1.5 text-left font-bold text-orange-900">Dorms</td>
            <td class="p-1"><input type="number" class="table-input text-center font-bold" id="w-d-base" value="${b.d_base || 199}"></td>
            <td class="p-1"><input type="number" class="table-input text-center font-bold text-pink-700" id="w-d-pkg" value="${b.d_pkg || 200}"></td>
            ${offsets.map(o => {
                const tag = o < 0 ? `m${Math.abs(o)}` : (o === 0 ? '0' : `p${o}`);
                const defVal = (o === 0 ? (b.d_0 || 2499) : (b[`d_${tag}`] || 799));
                return `<td class="p-1"><input type="number" class="table-input text-center font-black ${o === 0 ? 'text-amber-700 bg-amber-50 border-amber-300' : ''}" id="w-d-${tag}" value="${defVal}"></td>`;
            }).join('')}
        </tr>`;
};

window.renderEventRestrTable = () => {
    const thead = document.getElementById('event-restr-thead');
    const tbody = document.getElementById('event-restr-tbody');
    if (!thead || !tbody) return;

    const span = window.restrSpan || 6;
    const offsets = [];
    for (let i = -span; i <= span; i++) offsets.push(i);

    thead.innerHTML = `
        <tr class="bg-indigo-100/70 text-[9px] font-black uppercase text-indigo-950 border-b border-indigo-200">
            <th class="p-1.5 text-left w-32">Restriction</th>
            ${offsets.map(o => `
                <th class="p-1 text-center ${o === 0 ? 'bg-amber-200 text-amber-950 font-black' : ''}">
                    ${o === 0 ? 'Peak' : (o > 0 ? `+${o}` : `${o}`)}
                </th>
            `).join('')}
        </tr>`;

    const b = window.savedAutofillBaselines || {};

    tbody.innerHTML = `
        <tr class="border-b border-slate-100">
            <td class="p-1.5 text-left font-bold text-slate-700">Min Stay</td>
            ${offsets.map(o => {
                const tag = o < 0 ? `m${Math.abs(o)}` : (o === 0 ? '0' : `p${o}`);
                const val = b[`r_min_${tag}`] !== undefined ? b[`r_min_${tag}`] : (Math.abs(o) <= 1 ? 3 : '');
                return `<td class="p-1"><input type="text" class="table-input !p-0.5 text-center font-bold" id="w-r-min-${tag}" value="${val}"></td>`;
            }).join('')}
        </tr>
        <tr>
            <td class="p-1.5 text-left font-bold text-slate-700">Closed Arr (CTA)</td>
            ${offsets.map(o => {
                const tag = o < 0 ? `m${Math.abs(o)}` : (o === 0 ? '0' : `p${o}`);
                const chk = !!b[`r_cta_${tag}`];
                return `<td class="p-1 text-center"><input type="checkbox" class="row-checkbox" id="w-r-cta-${tag}" ${chk ? 'checked' : ''}></td>`;
            }).join('')}
        </tr>`;
};

// --------------------------------------------------------------------------
// SECTION 7: Step 5 - Review & Launch
// --------------------------------------------------------------------------
window.renderReviewLaunchStep = () => {
    const pName = document.getElementById('prop-name')?.value || window.activePropertyId;
    const pShort = document.getElementById('prop-short')?.value || '';
    const defCount = (window.roomDefinitions || []).length;
    const unitCount = (window.compiledRooms || []).length;
    const plansCount = (window.channexRatePlans || []).length;
    const hasEvents = document.getElementById('toggle-events')?.checked;

    const rName = document.getElementById('rev-prop-name');
    const rCode = document.getElementById('rev-prop-code');
    const rInv = document.getElementById('rev-inv-count');
    const rCat = document.getElementById('rev-cat-count');
    const rChan = document.getElementById('rev-chan-status');
    const rPlans = document.getElementById('rev-chan-plans');
    const rEvents = document.getElementById('rev-events-status');

    if (rName) rName.innerText = pName;
    if (rCode) rCode.innerText = `Code: ${pShort}`;
    if (rInv) rInv.innerText = `${unitCount} Beds / Units`;
    if (rCat) rCat.innerText = `${defCount} Categories`;
    if (rChan) rChan.innerText = window.channexConfig?.propId ? 'Configured' : 'Offline / Standalone';
    if (rPlans) rPlans.innerText = `${plansCount} Plans in Channex`;
    if (rEvents) rEvents.innerText = hasEvents ? 'Events: ACTIVE (±2D Curve)' : 'Events: Standard Flat';
};

window.launchApp = (appKey) => {
    const shortCode = document.getElementById('prop-short')?.value || window.activePropertyId || 'LOUD';
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.protocol === 'file:';
    const baseUrl = isLocal ? '' : 'https://loren-6q.github.io/PMS/';
    if (appKey === 'cm') {
        window.location.href = `${baseUrl}cm.html?p=${encodeURIComponent(shortCode)}`;
    } else if (appKey === 'pms') {
        window.location.href = `${baseUrl}pms.html?p=${encodeURIComponent(shortCode)}`;
    }
};

// --------------------------------------------------------------------------
// SECTION 8: Database Load & Save
// --------------------------------------------------------------------------
window.loadPropertyFromDatabase = async (propId) => {
    if (!propId) return;
    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = `Loading ${propId}...`;

    try {
        const propDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (!propDoc.exists()) throw new Error(`Property ${propId} not found.`);

        const pData = propDoc.data() || {};
        window.currentPropertyConfig = pData;
        window.activePropertyId = propId;

        // Populate Step 1 Profile
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setVal('prop-name', pData.name || propId);
        setVal('prop-short', (pData.short || pData.shortCode || propId).toUpperCase());
        setVal('prop-currency', pData.currency || 'THB');
        setVal('prop-timezone', pData.timezone || 'Asia/Bangkok');
        setVal('prop-address', pData.address || '');
        setVal('prop-email', pData.email || '');
        setVal('prop-phone', pData.phone || '');
        setVal('prop-website', pData.website || '');

        // Logos & Favicon
        const activeIcon = pData.iconUrl || pData.logoUrl || DEFAULT_WW_ICON;
        window.updateLogoPreview('primary', pData.logoUrl || DEFAULT_WW_ICON);
        window.updateLogoPreview('banner', pData.bannerUrl || DEFAULT_WW_ICON);
        window.updateLogoPreview('icon', activeIcon);
        window.updateFavicon(activeIcon);

        const navBrandIcon = document.getElementById('nav-brand-icon');
        if (navBrandIcon) navBrandIcon.src = activeIcon;

        // Add-ons (Safely mapped)
        window.addonsList = (pData.addons || []).map((item, idx) => ({
            id: item.id || `add_${idx + 1}`,
            order: item.order || (idx + 1),
            name: item.name || 'Service Item',
            category: item.category || 'Service',
            price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
            type: item.type || 'one-off'
        }));
        window.renderAddonsTable();

        // Step 2 Rooms: Faithful reconstruction without mangling private room names
        window.roomDefinitions = pData.roomDefinitions || [];
        if (window.roomDefinitions.length === 0 && Array.isArray(pData.rooms) && pData.rooms.length > 0) {
            const defs = [];
            const dormMap = {};

            pData.rooms.forEach((r, rIdx) => {
                const cat = r.type || r.category || 'Standard Room';
                const isExplicitDorm = r.isDorm === true || cat.toLowerCase().includes('dorm') || r.bunk === 'top' || r.bunk === 'bottom';

                if (isExplicitDorm) {
                    let parent = r.parentRoom;
                    if (!parent && r.id && r.id.includes('-')) parent = r.id.split('-')[0].trim();
                    if (!parent) parent = cat;

                    if (!dormMap[parent]) {
                        dormMap[parent] = {
                            id: 'room_' + (defs.length + Object.keys(dormMap).length + 1),
                            name: parent,
                            category: cat,
                            count: 0,
                            floor: r.floor || '1',
                            rule: r.bunk === 'even-top' ? 'even-top' : 'odd-top',
                            isDorm: true
                        };
                    }
                    dormMap[parent].count++;
                } else {
                    defs.push({
                        id: 'room_' + (defs.length + 1),
                        name: r.id || r.name || `ROOM ${rIdx + 1}`,
                        category: cat,
                        count: 1,
                        floor: r.floor || '1',
                        rule: 'private',
                        isDorm: false
                    });
                }
            });

            window.roomDefinitions = [...Object.values(dormMap), ...defs];
        }

        // Store original categories baseline for clean save-time rename cascading
        window._originalCategories = {};
        (window.roomDefinitions || []).forEach(d => {
            if (d.name) window._originalCategories[d.name] = d.category;
        });

        // PRESERVE original database rooms on load
        if (Array.isArray(pData.rooms) && pData.rooms.length > 0) {
            window.compiledRooms = pData.rooms;
            const rBadge = document.getElementById('room-count-badge');
            const uBadge = document.getElementById('unit-count-badge');
            if (rBadge) rBadge.innerText = `${(window.roomDefinitions || []).length} Rooms`;
            if (uBadge) uBadge.innerText = `${window.compiledRooms.length} Beds/Units Total`;
            window.renderBedPreviewDrawer();
        } else {
            window.compileRoomsFromDefinitions();
        }

        window.renderRoomDefinitionsTable();

        // Step 3 Channex: Preserve existing credentials & check localStorage fallbacks
        const storedLocalMaster = localStorage.getItem('cm_master_channex_api_key') || '';
        let localPropConf = {};
        try { localPropConf = JSON.parse(localStorage.getItem(`cm_channex_${propId}`) || '{}'); } catch(e) {}

        const docChannex = pData.channex || pData.channexConfig || {};
        window.channexConfig = {
            apiKey: docChannex.apiKey || localPropConf.apiKey || storedLocalMaster || '',
            propId: docChannex.propId || localPropConf.propId || '',
            rateMultiplier: docChannex.rateMultiplier || 100
        };

        setVal('chan-api-key', window.channexConfig.apiKey || '');
        setVal('chan-prop-id', window.channexConfig.propId || '');

        window.channexMap = (pData.channexMap || []).map(m => ({
            channexId: m.channexId || '',
            channexTitle: m.channexTitle || '',
            pmsCategory: m.pmsCategory || ''
        }));

        window.channexRateMap = (pData.channexRateMap || []).map(m => ({
            ratePlanId: m.ratePlanId || '',
            ratePlanTitle: m.ratePlanTitle || '',
            channexRoomTitle: m.channexRoomTitle || '',
            pmsCategory: m.pmsCategory || '',
            channel: m.channel || 'Default',
            product: m.product || 'std',
            policy: m.policy || 'non-ref',
            rateSource: m.rateSource || 'std'
        }));

        // Step 4 Pricing & Curves
        const pPricingDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        if (pPricingDoc.exists()) {
            const pricingData = pPricingDoc.data() || {};
            window.relationships = pricingData.relationships || [];
            
            // Clean pricing rules from any contaminated casing variants
            const loadedChannels = pricingData.pricingRules?.channels || {};
            const sanitizedChannels = {};
            Object.keys(loadedChannels).forEach(k => {
                const canon = normalizeChannelName(k);
                if (!sanitizedChannels[canon]) {
                    sanitizedChannels[canon] = loadedChannels[k];
                }
            });

            window.pricingRules = {
                ...(pricingData.pricingRules || window.pricingRules),
                channels: sanitizedChannels
            };
            window.savedAutofillBaselines = pricingData.autofillBaselines || {};
        }

        const eventsToggle = document.getElementById('toggle-events');
        const hasEvents = !!(pData.enableEventRates || (pData.events && pData.events.length > 0));
        if (eventsToggle) {
            eventsToggle.checked = hasEvents;
            window.toggleEventSettings(hasEvents);
        }

        // Update Nav Links
        const pCode = (pData.short || pData.shortCode || propId).toUpperCase();
        const navPms = document.getElementById('btn-goto-pms');
        const navCm = document.getElementById('btn-goto-cm');
        const baseUrl = (window.location.hostname === 'localhost' || window.location.protocol === 'file:') ? '' : 'https://loren-6q.github.io/PMS/';
        if (navPms) navPms.href = `${baseUrl}pms.html?p=${encodeURIComponent(pCode)}`;
        if (navCm) navCm.href = `${baseUrl}cm.html?p=${encodeURIComponent(pCode)}`;

        if (statusText) statusText.innerText = `Loaded ${pData.name || propId}`;
    } catch (err) {
        console.error("Load property error:", err);
        if (statusText) statusText.innerText = `Error loading: ${err.message}`;
    }
};

window.savePropertyToDatabase = async (showModal = true) => {
    const propId = window.activePropertyId;
    if (!propId) return window.customAlert("Error", "No active property selected.");

    const statusText = document.getElementById('header-status-text');
    if (statusText) statusText.innerText = "Saving property configuration...";

    // Sync any uncommitted edits directly from the DOM before saving
    window.syncRoomDefsFromDOM();

    try {
        const getVal = id => {
            const el = document.getElementById(id);
            return el && el.value !== undefined ? el.value.trim() : '';
        };

        const name = getVal('prop-name') || propId;
        const short = (getVal('prop-short') || propId).toUpperCase();
        const currency = getVal('prop-currency') || 'THB';
        const timezone = getVal('prop-timezone') || 'Asia/Bangkok';
        const address = getVal('prop-address');
        const email = getVal('prop-email');
        const phone = getVal('prop-phone');
        const website = getVal('prop-website');

        const logoUrl = getVal('prop-logo-url') || DEFAULT_WW_ICON;
        const bannerUrl = getVal('prop-banner-url') || DEFAULT_WW_ICON;
        const iconUrl = getVal('prop-icon-url') || DEFAULT_WW_ICON;

        const enableEventRates = !!document.getElementById('toggle-events')?.checked;

        // SAFE ROOM COMPILE: Only compile if definitions exist; never wipe rooms if definitions were empty
        if ((!window.roomDefinitions || window.roomDefinitions.length === 0) && Array.isArray(window.currentPropertyConfig?.rooms) && window.currentPropertyConfig.rooms.length > 0) {
            console.warn("Safety lock: Preserving existing rooms as definitions are empty.");
            window.compiledRooms = window.currentPropertyConfig.rooms;
        } else {
            window.compileRoomsFromDefinitions();
        }

        // Detect any category renames made by the user to cascade AT SAVE TIME only
        const categoryRenames = [];
        (window.roomDefinitions || []).forEach(def => {
            const orig = (window._originalCategories || {})[def.name];
            if (orig && def.category && orig !== def.category) {
                categoryRenames.push({ oldCat: orig, newCat: def.category });
            }
        });

        // SAFE CHANNEX PRESERVATION: Never wipe Channex keys if user didn't open Step 3
        const existingChan = window.currentPropertyConfig?.channex || {};
        const chanApiKey = getVal('chan-api-key') || window.channexConfig?.apiKey || existingChan.apiKey || localStorage.getItem('cm_master_channex_api_key') || '';
        const chanPropId = getVal('chan-prop-id') || window.channexConfig?.propId || existingChan.propId || '';

        const effectiveChanMap = (window.channexMap && window.channexMap.length > 0)
            ? window.channexMap
            : (window.currentPropertyConfig?.channexMap || []);

        const effectiveChanRateMap = (window.channexRateMap && window.channexRateMap.length > 0)
            ? window.channexRateMap
            : (window.currentPropertyConfig?.channexRateMap || []);

        const propertyPayload = {
            name,
            short,
            shortCode: short,
            currency,
            timezone,
            address,
            email,
            phone,
            website,
            logoUrl,
            bannerUrl,
            iconUrl,
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: window.compiledRooms || [],
            channex: {
                apiKey: chanApiKey,
                propId: chanPropId,
                rateMultiplier: 100
            },
            channexMap: effectiveChanMap,
            channexRateMap: effectiveChanRateMap,
            enableEventRates,
            updatedAt: new Date().toISOString()
        };

        // 1. Save to Properties document (Deep Sanitized)
        await setDoc(
            doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), 
            sanitizeForFirestore(propertyPayload), 
            { merge: true }
        );

        // 2. Cascade category renames to bookings and pricing rules if any were changed
        if (categoryRenames.length > 0) {
            try {
                const batch = writeBatch(db);
                const staffRef = collection(db, 'artifacts', appId, 'public', 'data', 'staff');
                const qStaff = query(staffRef, where('property', '==', propId));
                const staffSnap = await getDocs(qStaff);

                staffSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    let dirty = false;
                    const updateObj = {};

                    categoryRenames.forEach(({ oldCat, newCat }) => {
                        if (data.category === oldCat) { updateObj.category = newCat; dirty = true; }
                        if (data.bookedType === oldCat) { updateObj.bookedType = newCat; dirty = true; }
                        if (data.roomType === oldCat) { updateObj.roomType = newCat; dirty = true; }
                    });

                    if (dirty) batch.update(docSnap.ref, updateObj);
                });

                const pricingRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`);
                const pSnap = await getDoc(pricingRef);
                if (pSnap.exists()) {
                    const pData = pSnap.data();
                    let pDirty = false;
                    categoryRenames.forEach(({ oldCat, newCat }) => {
                        if (Array.isArray(pData.relationships)) {
                            pData.relationships.forEach(rel => {
                                if (rel.anchor === oldCat) { rel.anchor = newCat; pDirty = true; }
                                if (rel.target === oldCat) { rel.target = newCat; pDirty = true; }
                            });
                        }
                        if (pData.pricingRules) {
                            if (pData.pricingRules.anchorPrivate === oldCat) { pData.pricingRules.anchorPrivate = newCat; pDirty = true; }
                            if (pData.pricingRules.anchorDorm === oldCat) { pData.pricingRules.anchorDorm = newCat; pDirty = true; }
                        }
                    });
                    if (pDirty) batch.set(pricingRef, sanitizeForFirestore(pData), { merge: true });
                }

                await batch.commit();
                // Update baseline so subsequent saves don't re-cascade
                (window.roomDefinitions || []).forEach(d => {
                    if (d.name) window._originalCategories[d.name] = d.category;
                });
            } catch (cascadeErr) {
                console.warn("Cascade rename note:", cascadeErr);
            }
        }

        // 3. Save Pricing Rules & Channel Adjustments to pricing master document
        try {
            const dormAnchor = document.getElementById('anchor-dorm-select')?.value;
            const privAnchor = document.getElementById('anchor-private-select')?.value;
            if (dormAnchor) window.pricingRules.anchorDorm = dormAnchor;
            if (privAnchor) window.pricingRules.anchorPrivate = privAnchor;

            const stdRefVal = parseFloat(document.getElementById('rule-std-ref')?.value);
            const evtRefVal = parseFloat(document.getElementById('rule-evt-ref')?.value);
            if (!isNaN(stdRefVal)) window.pricingRules.stdRefVal = stdRefVal;
            if (!isNaN(evtRefVal)) window.pricingRules.evtRefVal = evtRefVal;

            // Harvest event pricing curves if configured
            const harvestVal = id => {
                const el = document.getElementById(id);
                return el ? (parseFloat(el.value) || 0) : 0;
            };
            window.savedAutofillBaselines = window.savedAutofillBaselines || {};
            const b = window.savedAutofillBaselines;
            if (document.getElementById('w-p-base')) b.p_base = harvestVal('w-p-base');
            if (document.getElementById('w-p-pkg')) b.p_pkg = harvestVal('w-p-pkg');
            if (document.getElementById('w-p-0')) b.p_0 = harvestVal('w-p-0');
            if (document.getElementById('w-d-base')) b.d_base = harvestVal('w-d-base');
            if (document.getElementById('w-d-pkg')) b.d_pkg = harvestVal('w-d-pkg');
            if (document.getElementById('w-d-0')) b.d_0 = harvestVal('w-d-0');

            const pricingDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`);
            await setDoc(pricingDocRef, sanitizeForFirestore({
                pricingRules: window.pricingRules,
                relationships: window.relationships || [],
                autofillBaselines: window.savedAutofillBaselines,
                updatedAt: new Date().toISOString()
            }), { merge: true });
        } catch (pricingSaveErr) {
            console.warn("Pricing rules save note:", pricingSaveErr);
        }

        if (statusText) statusText.innerText = `Saved ${name} successfully`;
        if (showModal) {
            window.customAlert("Property Saved", `Configuration for "${name}" (${short}) saved successfully.`);
        }
    } catch (err) {
        console.error("Save property error:", err);
        if (statusText) statusText.innerText = "Error saving property!";
        window.customAlert("Save Error", err.message);
    }
};

// --------------------------------------------------------------------------
// SECTION 9: Property Switcher & Creation Modal
// --------------------------------------------------------------------------
window.loadAllPropertiesList = async () => {
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const list = [];
        snap.forEach(d => {
            const data = d.data() || {};
            list.push({ id: d.id, ...data });
        });

        window.availableProperties = list;
        const sel = document.getElementById('property-select');
        if (sel) {
            sel.innerHTML = list.map(p => `
                <option value="${p.id}" ${p.id === window.activePropertyId ? 'selected' : ''}>
                    ${p.name || p.id} (${(p.short || p.shortCode || p.id).toUpperCase()})
                </option>
            `).join('');
        }
    } catch (err) {
        console.error("Load properties list error:", err);
    }
};

window.switchSetupProperty = async (propId) => {
    if (!propId || propId === window.activePropertyId) return;
    window.activePropertyId = propId;
    const shortCode = (window.availableProperties.find(p => p.id === propId)?.short || propId).toUpperCase();
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('p', shortCode);
        window.history.replaceState({}, '', url.toString());
    } catch(e) {}
    await window.loadPropertyFromDatabase(propId);
    window.jumpStep(1);
};

window.openNewPropertyModal = () => {
    const modal = document.getElementById('new-property-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeNewPropertyModal = () => {
    const modal = document.getElementById('new-property-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.confirmCreateNewProperty = async () => {
    const name = document.getElementById('new-prop-input-name')?.value.trim();
    const short = document.getElementById('new-prop-input-short')?.value.trim().toUpperCase();
    const id = document.getElementById('new-prop-input-id')?.value.trim().toLowerCase();

    if (!name || !short || !id) {
        return window.customAlert("Fields Required", "Please provide Property Name, Short Code, and Property ID / Slug.");
    }

    const slug = id.replace(/[^a-z0-9_-]/g, '_');

    try {
        const newPayload = {
            name,
            short,
            shortCode: short,
            currency: 'THB',
            timezone: 'Asia/Bangkok',
            logoUrl: DEFAULT_WW_ICON,
            bannerUrl: DEFAULT_WW_ICON,
            iconUrl: DEFAULT_WW_ICON,
            addons: [],
            roomDefinitions: [],
            rooms: [],
            enableEventRates: false,
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', slug), sanitizeForFirestore(newPayload));
        window.closeNewPropertyModal();
        await window.loadAllPropertiesList();
        const sel = document.getElementById('property-select');
        if (sel) sel.value = slug;
        await window.loadPropertyFromDatabase(slug);
        window.customAlert("Property Created", `"${name}" (${short}) created successfully. Start by configuring rooms in Step 2!`);
    } catch (err) {
        console.error("Create property error:", err);
        window.customAlert("Error", "Could not create property: " + err.message);
    }
};

// --------------------------------------------------------------------------
// SECTION 10: Boot & Initializer
// --------------------------------------------------------------------------
async function initSetupEngine() {
    try {
        if (typeof window.__initial_auth_token !== 'undefined') {
            try { await signInWithCustomToken(auth, window.__initial_auth_token); }
            catch (e) { await signInAnonymously(auth); }
        } else {
            await signInAnonymously(auth);
        }
    } catch (err) {
        console.warn("Auth initialization note:", err);
    }

    await window.loadAllPropertiesList();

    const urlParams = new URLSearchParams(window.location.search);
    const pParam = (urlParams.get('p') || '').toLowerCase();

    let targetId = window.availableProperties[0]?.id || 'loud_samui';
    if (pParam) {
        const found = window.availableProperties.find(p => 
            p.id.toLowerCase() === pParam || 
            (p.short && p.short.toLowerCase() === pParam)
        );
        if (found) targetId = found.id;
    }

    const sel = document.getElementById('property-select');
    if (sel) sel.value = targetId;
    window.activePropertyId = targetId;

    await window.loadPropertyFromDatabase(targetId);
    window.jumpStep(1);
}

document.addEventListener('DOMContentLoaded', () => {
    initSetupEngine();
});
