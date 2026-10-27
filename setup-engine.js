// ==========================================================================
// setup-engine.js - Property Setup Wizard Controller & Cloud Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --------------------------------------------------------------------------
// SECTION 1: Firebase Initialization & Global State
// --------------------------------------------------------------------------
const firebaseConfig = { 
    apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU", 
    authDomain: "swimspms.firebaseapp.com", 
    projectId: "swimspms", 
    storageBucket: "swimspms.firebasestorage.app", 
    messagingSenderId: "989960113115", 
    appId: "1:989960113115:web:a99e08a23a36ff4289f5fe" 
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'hotel-pms-v1';

window.db = db;
window.appId = appId;
window.storage = storage;
window.currentStep = 1;
window.activePropertyId = '';
window.availableProperties = [];
window.currentPropertyData = null;

window.roomDefinitions = [];
window.compiledRooms = []; 
window.addons = [];
window.channelRules = [];
window.channexMap = [];
window.channexRateMap = [];
window.relationships = [];

window.ratesSpan = 2;
window.restrSpan = 6;

// --------------------------------------------------------------------------
// SECTION 2: Brand Assets & Logo Upload Controller
// --------------------------------------------------------------------------
window.updateLogoPreview = (type, url) => {
    const previewEl = document.getElementById(`preview-logo-${type}`);
    if (previewEl && url) previewEl.src = url;
    if (type === 'icon' || type === 'primary') {
        const navIcon = document.getElementById('nav-brand-icon');
        if (navIcon && url) navIcon.src = url;
    }
};

window.resetLogosToDefault = () => {
    const defaultIcon = "https://loren-6q.github.io/PMS/gfx/WWicon.png";
    document.getElementById('prop-logo-url').value = defaultIcon;
    document.getElementById('prop-banner-url').value = defaultIcon;
    document.getElementById('prop-icon-url').value = defaultIcon;
    window.updateLogoPreview('primary', defaultIcon);
    window.updateLogoPreview('banner', defaultIcon);
    window.updateLogoPreview('icon', defaultIcon);
};

window.handleLogoFileUpload = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const propId = window.activePropertyId || 'default';
    const statusEl = document.getElementById('header-status-text');
    if (statusEl) statusEl.textContent = `Uploading ${type} logo...`;

    try {
        const storageRef = ref(storage, `properties/${propId}/logo_${type}_${Date.now()}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);

        const inputId = type === 'primary' ? 'prop-logo-url' : (type === 'banner' ? 'prop-banner-url' : 'prop-icon-url');
        const targetInput = document.getElementById(inputId);
        if (targetInput) targetInput.value = downloadUrl;
        window.updateLogoPreview(type, downloadUrl);

        if (statusEl) statusEl.textContent = `Uploaded ${type} logo successfully!`;
    } catch (err) {
        console.error("Logo upload error:", err);
        window.customAlert("Upload Failed", err.message);
    }
};

// --------------------------------------------------------------------------
// SECTION 3: Firestore Batch Cascade Room Rename
// --------------------------------------------------------------------------
window.cascadeRenameCategory = async (oldCategory, newCategory) => {
    if (!oldCategory || !newCategory || oldCategory === newCategory) return;
    const propId = window.activePropertyId;

    try {
        const batch = writeBatch(db);
        const staffRef = collection(db, 'artifacts', appId, 'public', 'data', 'staff');
        const q = query(staffRef, where('property', '==', propId));
        const snap = await getDocs(q);

        let updatedCount = 0;
        snap.forEach(docSnap => {
            const data = docSnap.data();
            let needsUpdate = false;
            const patch = {};

            if (data.bookedType && data.bookedType.toUpperCase() === oldCategory.toUpperCase()) {
                patch.bookedType = newCategory;
                needsUpdate = true;
            }
            if (data.category && data.category.toUpperCase() === oldCategory.toUpperCase()) {
                patch.category = newCategory;
                needsUpdate = true;
            }

            if (needsUpdate) {
                batch.update(docSnap.ref, patch);
                updatedCount++;
            }
        });

        await batch.commit();
        console.log(`✅ Cascaded category rename "${oldCategory}" -> "${newCategory}" across ${updatedCount} bookings.`);
    } catch (err) {
        console.warn("Cascade rename warning:", err);
    }
};

// --------------------------------------------------------------------------
// SECTION 4: Stepper Navigation & Modal Helpers
// --------------------------------------------------------------------------
window.toggleCardSection = (contentId, chevronId) => {
    const content = document.getElementById(contentId);
    const chev = document.getElementById(chevronId);
    if (!content) return;
    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden', !isHidden);
    if (chev) {
        chev.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
};

window._modalResolve = null;
window.customAlert = (title, msg, isConfirm = false) => {
    return new Promise((resolve) => {
        window._modalResolve = resolve;
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = msg;
        document.getElementById('modal-cancel-btn').classList.toggle('hidden', !isConfirm);
        document.getElementById('custom-app-modal').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    });
};

window.closeCustomModal = (res) => {
    document.getElementById('custom-app-modal').classList.add('hidden');
    if (window._modalResolve) {
        window._modalResolve(res);
        window._modalResolve = null;
    }
};

window.jumpStep = (step) => {
    if (step < 1 || step > 5) return;
    window.currentStep = step;

    for (let i = 1; i <= 5; i++) {
        const section = document.getElementById(`step-content-${i}`);
        const pill = document.getElementById(`pill-step-${i}`);
        const badge = document.getElementById(`badge-step-${i}`);

        if (section) section.classList.toggle('hidden', i !== step);

        if (pill && badge) {
            pill.classList.remove('active', 'completed');
            badge.classList.remove('bg-white', 'text-indigo-700', 'bg-emerald-600', 'text-white', 'bg-slate-100', 'text-slate-600');

            if (i === step) {
                pill.classList.add('active');
                badge.classList.add('bg-white', 'text-indigo-700');
            } else if (i < step) {
                pill.classList.add('completed');
                badge.classList.add('bg-emerald-600', 'text-white');
            } else {
                badge.classList.add('bg-slate-100', 'text-slate-600');
            }
        }
    }

    document.getElementById('btn-prev-step').disabled = step === 1;
    const nextBtn = document.getElementById('btn-next-step');
    if (step === 5) {
        nextBtn.innerHTML = '<span>Finish Setup</span> <i data-lucide="check" size="13"></i>';
    } else {
        nextBtn.innerHTML = '<span>Continue</span> <i data-lucide="arrow-right" size="13"></i>';
    }

    document.getElementById('wizard-step-indicator').textContent = `Step ${step} of 5`;

    if (step === 3) window.renderUnifiedRateMapping();
    if (step === 4) {
        window.populateAnchorDropdowns();
        window.renderRelationships();
        window.renderEventCurveTables();
    }
    if (step === 5) window.populateReviewSummary();
    if (window.lucide) window.lucide.createIcons();
};

window.nextStep = () => {
    if (window.currentStep === 5) {
        window.savePropertyToDatabase(false).then(() => {
            window.customAlert("Setup Complete", "Configuration saved to database. Launching Channel Manager...").then(() => {
                window.launchApp('cm');
            });
        });
        return;
    }
    window.jumpStep(window.currentStep + 1);
};

window.prevStep = () => {
    window.jumpStep(window.currentStep - 1);
};

// --------------------------------------------------------------------------
// SECTION 5: Step 1 - Folio Add-ons Controller
// --------------------------------------------------------------------------
function loadDefaultAddons() {
    return [
        { id: 'add_upg', name: 'Paid Room Upgrade', category: 'Room', price: 300, unit: 'flat' },
        { id: 'add_late', name: 'Late Check-out (Until 2 PM)', category: 'Room', price: 300, unit: 'flat' },
        { id: 'add_early', name: 'Early Check-in', category: 'Room', price: 200, unit: 'flat' },
        { id: 'add_ferry', name: 'Ferry Transfer', category: 'Transport', price: 400, unit: 'per trip' },
        { id: 'add_scooter', name: 'Scooter Rental (24h)', category: 'Rental', price: 250, unit: 'per day' },
        { id: 'add_laundry', name: 'Laundry Service', category: 'Service', price: 80, unit: 'per kg' },
        { id: 'add_deposit', name: 'Key / Towel Deposit', category: 'Service', price: 200, unit: 'deposit' }
    ];
}

window.renderAddonsTable = () => {
    const body = document.getElementById('addon-list-body');
    if (!body) return;

    if (window.addons.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-400 font-semibold italic">No add-ons created. Click "+ Add Item".</td></tr>`;
        return;
    }

    body.innerHTML = window.addons.map((item, idx) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-1 text-center">
                <div class="flex items-center justify-center gap-0.5">
                    <button onclick="window.moveAddon(${idx}, -1)" ${idx === 0 ? 'disabled class="opacity-20"' : 'class="cursor-pointer hover:text-indigo-600"'} title="Move Up">
                        <i data-lucide="chevron-up" size="13"></i>
                    </button>
                    <button onclick="window.moveAddon(${idx}, 1)" ${idx === window.addons.length - 1 ? 'disabled class="opacity-20"' : 'class="cursor-pointer hover:text-indigo-600"'} title="Move Down">
                        <i data-lucide="chevron-down" size="13"></i>
                    </button>
                </div>
            </td>
            <td class="p-1">
                <input type="text" value="${item.name || ''}" onchange="window.addons[${idx}].name = this.value" class="table-input font-bold text-slate-800" placeholder="Product name...">
            </td>
            <td class="p-1">
                <select onchange="window.addons[${idx}].category = this.value" class="table-input font-medium">
                    <option value="Room" ${item.category === 'Room' ? 'selected' : ''}>Room</option>
                    <option value="Transport" ${item.category === 'Transport' ? 'selected' : ''}>Transport</option>
                    <option value="Rental" ${item.category === 'Rental' ? 'selected' : ''}>Rental</option>
                    <option value="Service" ${item.category === 'Service' ? 'selected' : ''}>Service</option>
                    <option value="Tour" ${item.category === 'Tour' ? 'selected' : ''}>Tour</option>
                    <option value="F&B" ${item.category === 'F&B' ? 'selected' : ''}>F&B</option>
                </select>
            </td>
            <td class="p-1">
                <input type="number" value="${item.price !== undefined ? item.price : 0}" onchange="window.addons[${idx}].price = parseFloat(this.value) || 0" class="table-input font-mono font-bold text-slate-900 text-center">
            </td>
            <td class="p-1">
                <select onchange="window.addons[${idx}].unit = this.value" class="table-input font-medium">
                    <option value="flat" ${item.unit === 'flat' ? 'selected' : ''}>flat</option>
                    <option value="per trip" ${item.unit === 'per trip' ? 'selected' : ''}>per trip</option>
                    <option value="per day" ${item.unit === 'per day' ? 'selected' : ''}>per day</option>
                    <option value="per kg" ${item.unit === 'per kg' ? 'selected' : ''}>per kg</option>
                    <option value="deposit" ${item.unit === 'deposit' ? 'selected' : ''}>deposit</option>
                </select>
            </td>
            <td class="p-1 text-center">
                <button onclick="window.confirmRemoveAddon(${idx})" class="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-0.5" title="Delete">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        </tr>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.moveAddon = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= window.addons.length) return;
    const item = window.addons.splice(idx, 1)[0];
    window.addons.splice(targetIdx, 0, item);
    window.renderAddonsTable();
};

window.addBlankAddonRow = () => {
    window.addons.push({
        id: `add_${Date.now()}`,
        name: 'New Folio Item',
        category: 'Service',
        price: 100,
        unit: 'flat'
    });
    window.renderAddonsTable();
};

window.confirmRemoveAddon = async (idx) => {
    const item = window.addons[idx];
    const confirmed = await window.customAlert("Delete Add-on", `Are you sure you want to remove "${item?.name || 'this item'}"?`, true);
    if (confirmed) {
        window.addons.splice(idx, 1);
        window.renderAddonsTable();
    }
};

// --------------------------------------------------------------------------
// SECTION 6: Step 2 - Room Setup, Extrapolation & Batch Generators
// --------------------------------------------------------------------------
window.compileBedsFromDefinitions = () => {
    const compiled = [];
    window.roomDefinitions.forEach(def => {
        const roomName = (def.roomName || '').trim();
        const category = (def.category || '').trim();
        const floor = (def.floor || '1').trim();
        const count = parseInt(def.units, 10) || 1;
        const rule = def.bunkRule || 'odd-top';
        const isDorm = (def.type === 'dorm') || category.toLowerCase().includes('dorm') || rule !== 'private';

        if (!isDorm || count === 1) {
            compiled.push({
                id: roomName,
                name: roomName,
                category: category,
                type: category,
                floor: floor,
                bunk: 'Private Unit',
                parentRoom: roomName,
                bedIndex: 1,
                status: 'clean'
            });
        } else {
            const cleanPrefix = roomName.trim().replace(/[-_\s]+$/, '');
            for (let i = 1; i <= count; i++) {
                const bedNum = String(i).padStart(2, '0');
                const bedId = `${cleanPrefix}${bedNum}`;

                let bunkPos = 'Single Bed';
                if (rule === 'odd-top') bunkPos = (i % 2 !== 0) ? 'Top Bunk' : 'Bottom Bunk';
                else if (rule === 'even-top') bunkPos = (i % 2 === 0) ? 'Top Bunk' : 'Bottom Bunk';

                compiled.push({
                    id: bedId,
                    name: bedId,
                    category: category,
                    type: category,
                    floor: floor,
                    bunk: bunkPos,
                    parentRoom: roomName,
                    bedIndex: i,
                    status: 'clean'
                });
            }
        }
    });
    window.compiledRooms = compiled;
    return compiled;
};

window.toggleBatchDormPanel = (force) => {
    const panel = document.getElementById('batch-dorm-panel');
    if (!panel) return;
    const show = (force !== undefined) ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    if (show) document.getElementById('batch-room-panel')?.classList.add('hidden');
};

window.toggleBatchRoomPanel = (force) => {
    const panel = document.getElementById('batch-room-panel');
    if (!panel) return;
    const show = (force !== undefined) ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    if (show) document.getElementById('batch-dorm-panel')?.classList.add('hidden');
};

window.executeBatchDormGenerate = () => {
    const name = document.getElementById('gen-dorm-name').value.trim();
    const cat = document.getElementById('gen-dorm-cat').value.trim();
    const beds = parseInt(document.getElementById('gen-dorm-beds').value, 10) || 6;
    const floor = document.getElementById('gen-dorm-floor').value.trim() || '1';
    const rule = document.getElementById('gen-dorm-rule').value;

    if (!name) return window.customAlert("Missing Info", "Please provide a Dorm Room Name.");
    if (!cat) return window.customAlert("Missing Info", "Please provide a Category Name.");

    window.roomDefinitions.unshift({
        roomName: name,
        category: cat,
        units: beds,
        floor: floor,
        bunkRule: rule,
        type: 'dorm',
        isNew: true
    });

    window.toggleBatchDormPanel(false);
    window.renderRoomDefTable();
    window.populateAnchorDropdowns();
    window.renderUnifiedRateMapping();
};

window.executeBatchRoomGenerate = () => {
    const prefix = document.getElementById('gen-room-prefix').value;
    const cat = document.getElementById('gen-room-cat').value.trim();
    const startNum = parseInt(document.getElementById('gen-room-start').value, 10) || 1;
    const endNum = parseInt(document.getElementById('gen-room-end').value, 10) || 4;
    const floor = document.getElementById('gen-room-floor').value.trim() || '1';

    if (!cat) return window.customAlert("Missing Info", "Please provide a Category Name.");
    if (endNum < startNum) return window.customAlert("Invalid Numbers", "End number must be greater than or equal to start number.");

    for (let i = startNum; i <= endNum; i++) {
        const roomNum = String(i).padStart(2, '0');
        const fullName = `${prefix}${roomNum}`.trim();
        window.roomDefinitions.push({
            roomName: fullName,
            category: cat,
            units: 1,
            floor: floor,
            bunkRule: 'private',
            type: 'private',
            isNew: true
        });
    }

    window.toggleBatchRoomPanel(false);
    window.renderRoomDefTable();
    window.populateAnchorDropdowns();
    window.renderUnifiedRateMapping();
};

window.addBlankRoomDef = () => {
    const cats = Array.from(new Set(window.roomDefinitions.map(r => r.category))).filter(Boolean);
    const defaultCat = cats[0] || 'Standard Category';
    const newRoom = {
        roomName: `ROOM ${window.roomDefinitions.length + 1}`,
        category: defaultCat,
        units: 1,
        floor: '1',
        bunkRule: 'private',
        type: 'private',
        isNew: true
    };
    window.roomDefinitions.unshift(newRoom);
    window.renderRoomDefTable();
    window.populateAnchorDropdowns();
    window.renderUnifiedRateMapping();
};

window.clearAllRoomDefs = async () => {
    const confirmed = await window.customAlert("Clear Room Inventory", "Are you sure you want to remove all rooms from this property setup?", true);
    if (confirmed) {
        window.roomDefinitions = [];
        window.renderRoomDefTable();
        window.populateAnchorDropdowns();
        window.renderUnifiedRateMapping();
    }
};

window.updateRoomDef = (idx, field, value) => {
    if (!window.roomDefinitions[idx]) return;
    if (field === 'units') {
        window.roomDefinitions[idx].units = Math.max(1, parseInt(value, 10) || 1);
    } else {
        window.roomDefinitions[idx][field] = value;
    }
    window.compileBedsFromDefinitions();
    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.textContent = `${window.roomDefinitions.length} Rooms`;
    if (uBadge) uBadge.textContent = `${window.compiledRooms.length} Beds/Units Total`;
    window.renderBedPreviewDrawer();
    if (field === 'category') {
        window.populateAnchorDropdowns();
        window.renderUnifiedRateMapping();
    }
};

window.confirmRemoveRoomDef = async (idx) => {
    const room = window.roomDefinitions[idx];
    const name = room ? (room.roomName || 'this room') : 'this room';
    const confirmed = await window.customAlert("Delete Room", `Are you sure you want to remove "${name}" from inventory?`, true);
    if (confirmed) {
        window.roomDefinitions.splice(idx, 1);
        window.renderRoomDefTable();
        window.populateAnchorDropdowns();
        window.renderUnifiedRateMapping();
    }
};

window.toggleBedPreviewDrawer = () => {
    const drawer = document.getElementById('bed-preview-drawer');
    const btn = document.getElementById('btn-toggle-bed-preview');
    if (!drawer) return;
    const isHidden = drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !isHidden);
    if (btn) {
        btn.classList.toggle('bg-indigo-600', isHidden);
        btn.classList.toggle('text-white', isHidden);
        btn.classList.toggle('bg-indigo-50', !isHidden);
        btn.classList.toggle('text-indigo-800', !isHidden);
    }
    if (isHidden) {
        window.renderBedPreviewDrawer();
    }
};

window.renderRoomDefTable = () => {
    const body = document.getElementById('room-def-list-body');
    window.compileBedsFromDefinitions();

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    if (rBadge) rBadge.textContent = `${window.roomDefinitions.length} Rooms`;
    if (uBadge) uBadge.textContent = `${window.compiledRooms.length} Beds/Units Total`;
    if (!body) return;

    if (window.roomDefinitions.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-semibold italic">No rooms created. Click "+ Add Room" or use BATCH DORM / BATCH ROOM above.</td></tr>`;
        return;
    }

    const categoryOrder = [];
    const groupedMap = {};

    window.roomDefinitions.forEach((def, originalIdx) => {
        const normCat = (def.category || 'Standard Category').trim();
        const key = normCat.toUpperCase();
        if (!groupedMap[key]) {
            groupedMap[key] = {
                displayName: normCat,
                rooms: []
            };
            categoryOrder.push(key);
        }
        groupedMap[key].rooms.push({ def, originalIdx });
    });

    let html = '';

    categoryOrder.forEach(catKey => {
        const group = groupedMap[catKey];
        const catRooms = group.rooms;
        const catCount = catRooms.length;
        const catUnits = catRooms.reduce((sum, r) => sum + (parseInt(r.def.units, 10) || 1), 0);
        const curCat = group.displayName;

        html += `
        <tr class="bg-slate-200 text-slate-800 border-y border-slate-300">
            <td colspan="6" class="py-1 px-3 text-[10px] uppercase font-bold tracking-wider">
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center gap-2 flex-1 min-w-0 pr-3">
                        <i data-lucide="folder" size="13" class="text-slate-600 shrink-0"></i>
                        <input type="text" value="${curCat}" onchange="window.renameCategoryGroup('${curCat.replace(/'/g, "\\'")}', this.value)" class="bg-transparent font-black text-slate-900 text-xs uppercase border-b border-transparent focus:border-indigo-500 focus:bg-white outline-none rounded px-1 w-full max-w-xl transition-all cursor-pointer" title="Click to rename category across all grouped rooms">
                    </div>
                    <span class="text-[9px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 shrink-0">
                        ${catCount} Rooms • ${catUnits} Total Units
                    </span>
                </div>
            </td>
        </tr>`;

        catRooms.forEach(({ def: item, originalIdx: idx }) => {
            const isNewHighlight = item.isNew ? 'bg-amber-50/80 border-l-4 border-l-amber-500' : 'hover:bg-slate-50';

            html += `
            <tr class="${isNewHighlight} transition-colors">
                <td class="p-1.5">
                    <div class="flex items-center gap-1">
                        <input type="text" value="${item.roomName || ''}" onchange="window.updateRoomDef(${idx}, 'roomName', this.value)" class="table-input font-black text-slate-900" placeholder="Room Name">
                        ${item.isNew ? '<span class="px-1 py-0.2 rounded text-[8px] font-black uppercase bg-amber-200 text-amber-900 shadow-2xs">NEW</span>' : ''}
                    </div>
                </td>
                <td class="p-1.5">
                    <input type="text" value="${item.category || ''}" onchange="window.updateRoomDef(${idx}, 'category', this.value)" class="table-input font-bold text-slate-800" placeholder="Category">
                </td>
                <td class="p-1.5 text-center">
                    <input type="number" min="1" max="60" value="${item.units || 1}" onchange="window.updateRoomDef(${idx}, 'units', this.value)" class="table-input font-black text-center !w-16">
                </td>
                <td class="p-1.5">
                    <input type="text" value="${item.floor || '1'}" onchange="window.updateRoomDef(${idx}, 'floor', this.value)" class="table-input font-bold text-slate-600" placeholder="Floor">
                </td>
                <td class="p-1.5">
                    <select onchange="window.updateRoomDef(${idx}, 'bunkRule', this.value)" class="table-input font-bold text-slate-800">
                        <option value="odd-top" ${item.bunkRule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                        <option value="even-top" ${item.bunkRule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                        <option value="single" ${item.bunkRule === 'single' ? 'selected' : ''}>DORM (Single Beds)</option>
                        <option value="private" ${item.bunkRule === 'private' ? 'selected' : ''}>Private Room</option>
                    </select>
                </td>
                <td class="p-1.5 text-center">
                    <button onclick="window.confirmRemoveRoomDef(${idx})" class="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-0.5" title="Delete Room">
                        <i data-lucide="trash-2" size="13"></i>
                    </button>
                </td>
            </tr>`;
        });
    });

    body.innerHTML = html;
    window.renderBedPreviewDrawer();
    if (window.lucide) window.lucide.createIcons();
};

window.renameCategoryGroup = (oldCat, newCat) => {
    const clean = (newCat || '').trim();
    if (!clean || clean === oldCat) return;

    window.roomDefinitions.forEach(r => {
        if ((r.category || '').trim().toUpperCase() === oldCat.toUpperCase()) {
            r.category = clean;
        }
    });

    window.cascadeRenameCategory(oldCat, clean);
    window.renderRoomDefTable();
    window.populateAnchorDropdowns();
    window.renderUnifiedRateMapping();
};

window.renderBedPreviewDrawer = () => {
    const container = document.getElementById('bed-preview-groups');
    if (!container) return;

    const roomGroups = {};
    window.roomDefinitions.forEach(def => {
        roomGroups[def.roomName] = {
            roomName: def.roomName,
            category: def.category,
            floor: def.floor,
            bunkRule: def.bunkRule || 'odd-top',
            beds: []
        };
    });

    window.compiledRooms.forEach(bed => {
        const parentKey = bed.parentRoom || window.roomDefinitions[0]?.roomName || 'General';
        if (!roomGroups[parentKey]) {
            roomGroups[parentKey] = { roomName: parentKey, category: bed.type, floor: bed.floor, bunkRule: 'odd-top', beds: [] };
        }
        roomGroups[parentKey].beds.push(bed);
    });

    container.innerHTML = Object.values(roomGroups).map(g => {
        const isDorm = g.bunkRule !== 'private';
        let pairsHtml = '';

        if (!isDorm) {
            pairsHtml = g.beds.map(b => `
                <div class="flex flex-col border border-slate-300 rounded bg-slate-50 p-1 w-20 text-center shadow-2xs">
                    <span class="text-[8px] font-black uppercase text-slate-400 mb-0.5">Private</span>
                    <span class="text-[9px] font-mono font-black text-indigo-950 py-1 bg-white border border-slate-200 rounded">${b.name}</span>
                </div>
            `).join('');
        } else if (g.bunkRule === 'single') {
            pairsHtml = g.beds.map(b => `
                <div class="flex flex-col border border-slate-300 rounded bg-slate-50 p-1 w-20 text-center shadow-2xs">
                    <span class="text-[8px] font-black uppercase text-emerald-700 mb-0.5">Single</span>
                    <span class="text-[9px] font-mono font-black text-emerald-950 py-1 bg-white border border-emerald-200 rounded">${b.name}</span>
                </div>
            `).join('');
        } else {
            const pairs = [];
            for (let i = 0; i < g.beds.length; i += 2) {
                pairs.push({
                    top: g.beds[i],
                    btm: g.beds[i + 1] || null
                });
            }

            pairsHtml = pairs.map((pair, pIdx) => `
                <div class="flex flex-col border border-slate-300 rounded bg-slate-50 p-1 w-20 text-center shadow-2xs">
                    <span class="text-[8px] font-black uppercase text-slate-400 mb-0.5">Bunk ${pIdx + 1}</span>
                    ${pair.top ? `<span class="text-[9px] font-mono font-black bg-amber-100 text-amber-900 border border-amber-300 rounded py-0.5 px-0.5">${pair.top.name} <span class="text-[7px] font-sans font-bold">TOP</span></span>` : ''}
                    ${pair.btm ? `<span class="text-[9px] font-mono font-black bg-emerald-100 text-emerald-900 border border-emerald-300 rounded py-0.5 px-0.5 mt-1">${pair.btm.name} <span class="text-[7px] font-sans font-bold">BTM</span></span>` : '<span class="text-[8px] text-slate-300 italic mt-1">--</span>'}
                </div>
            `).join('');
        }

        return `
        <div class="bg-white p-2.5 rounded-lg border border-slate-300 shadow-xs flex flex-col min-w-[200px] shrink-0">
            <div class="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-200">
                <span class="font-black text-slate-900 text-xs uppercase flex items-center gap-1.5">
                    <i data-lucide="door-open" size="13" class="text-indigo-600"></i> ${g.roomName}
                </span>
                <span class="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">${g.beds.length} Bed(s)</span>
            </div>
            <div class="text-[9px] text-slate-500 font-semibold mb-2">
                ${g.category} • Floor ${g.floor}
            </div>
            <div class="flex flex-wrap gap-1.5">
                ${pairsHtml}
            </div>
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

// --------------------------------------------------------------------------
// SECTION 7: Step 3 - Channex API & Multi-Room Rate Plan Tool
// --------------------------------------------------------------------------
window.openCreateRatePlanModal = () => {
    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category))).filter(Boolean);
    if (pmsCategories.length === 0) {
        return window.customAlert("Inventory Empty", "Add rooms in Step 2 first.");
    }

    const checklist = document.getElementById('crp-room-checklist');
    if (checklist) {
        checklist.innerHTML = pmsCategories.map(cat => `
            <label class="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer hover:bg-slate-100 p-1 rounded">
                <input type="checkbox" value="${cat}" class="crp-room-check accent-indigo-600" checked>
                <span>${cat}</span>
            </label>
        `).join('');
    }

    document.getElementById('create-rate-plan-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.closeCreateRatePlanModal = () => {
    document.getElementById('create-rate-plan-modal').classList.add('hidden');
};

window.toggleAllTargetRooms = (select) => {
    document.querySelectorAll('.crp-room-check').forEach(chk => { chk.checked = select; });
};

window.applyRatePlanPreset = (title, channel, policy, product) => {
    document.getElementById('crp-title').value = title;
    document.getElementById('crp-channel').value = channel;
    document.getElementById('crp-policy').value = policy;
    window._crpProduct = product;
};

window.executeCreateAndPushRatePlan = async () => {
    const apiKey = document.getElementById('chan-api-key').value.trim();
    const propId = document.getElementById('chan-prop-id').value.trim();
    const title = document.getElementById('crp-title').value.trim();
    const channel = document.getElementById('crp-channel').value;
    const policy = document.getElementById('crp-policy').value;
    const product = window._crpProduct || 'std';

    if (!apiKey || !propId) {
        return window.customAlert("Missing Credentials", "Enter Channex API Key and Property ID before pushing rate plans.");
    }
    if (!title) {
        return window.customAlert("Missing Title", "Please enter a Rate Plan Title.");
    }

    const selectedRooms = Array.from(document.querySelectorAll('.crp-room-check:checked')).map(chk => chk.value);
    if (selectedRooms.length === 0) {
        return window.customAlert("No Rooms Selected", "Select at least one room category to push this plan to.");
    }

    window.closeCreateRatePlanModal();
    window.customAlert("Pushing Rate Plans", `Creating "${title}" across ${selectedRooms.length} room types in Channex...`);

    let successCount = 0;
    const btn = document.getElementById('btn-confirm-push-rate');
    if (btn) btn.disabled = true;

    try {
        for (const cat of selectedRooms) {
            let mappedRoom = (window.channexMap || []).find(m => (m.pmsCategory || '').toUpperCase() === cat.toUpperCase());
            let roomId = mappedRoom?.channexId;

            if (!roomId) {
                const isDorm = cat.toLowerCase().includes('dorm');
                const rtRes = await fetch("https://app.channex.io/api/v1/room_types", {
                    method: "POST",
                    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        room_type: {
                            property_id: propId,
                            title: cat,
                            adult_spaces: isDorm ? 10 : 2,
                            child_spaces: 0
                        }
                    })
                });
                if (rtRes.ok) {
                    const rtJson = await rtRes.json();
                    roomId = rtJson.data?.id;
                    window.channexMap.push({ channexId: roomId, channexTitle: cat, pmsCategory: cat });
                }
            }

            if (!roomId) continue;

            const rpRes = await fetch("https://app.channex.io/api/v1/rate_plans", {
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

            if (rpRes.ok) {
                const rpJson = await rpRes.json();
                window.channexRateMap.push({
                    ratePlanId: rpJson.data?.id,
                    ratePlanTitle: title,
                    roomTypeId: roomId,
                    channexRoomTitle: cat,
                    pmsCategory: cat,
                    channel: channel,
                    policy: policy,
                    product: product,
                    rateSource: product
                });
                successCount++;
            }
        }

        window.renderUnifiedRateMapping();
        window.customAlert("Success", `Successfully pushed "${title}" to ${successCount} room types in Channex!`);
    } catch (err) {
        console.error("Rate push error:", err);
        window.customAlert("Push Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.renderUnifiedRateMapping = () => {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;

    const pmsCategories = Array.from(new Set(window.roomDefinitions.map(r => r.category))).filter(Boolean);
    const channexRooms = window.channexMap || [];
    const isEventsEnabled = document.getElementById('toggle-events')?.checked;

    if (pmsCategories.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 font-semibold italic">No room categories exist. Add rooms in Step 2 first.</div>`;
        return;
    }

    container.innerHTML = pmsCategories.map((cat) => {
        const roomMapping = channexRooms.find(m => (m.pmsCategory || '').toUpperCase() === cat.toUpperCase());
        const channexRoomId = roomMapping?.channexId || '';

        const childPlans = (window.channexRateMap || []).filter(r => 
            (channexRoomId && r.roomTypeId === channexRoomId) || 
            ((r.pmsCategory || '').toUpperCase() === cat.toUpperCase() && (!r.roomTypeId || r.roomTypeId === channexRoomId))
        );

        const planRowsHtml = childPlans.length === 0 
            ? `<tr><td colspan="3" class="p-2.5 text-center text-slate-400 italic text-[10px]">No active rate plans linked. Click "+ Create & Push Plan" above to add rate plans to this room.</td></tr>`
            : childPlans.map(r => {
                const globalIdx = window.channexRateMap.findIndex(x => x.ratePlanId === r.ratePlanId);
                const isEvt = r.product === 'evt';
                const curChan = (r.channel === 'Default' || !r.channel) ? 'DEFAULT' : r.channel;

                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-900 text-[11px]">${r.ratePlanTitle}</span>
                            ${isEventsEnabled ? `
                            <button onclick="window.toggleRatePlanProduct(${globalIdx})" class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase cursor-pointer border ${isEvt ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-slate-100 text-slate-600 border-slate-200'}">
                                ${isEvt ? '⚡ Event PKG' : 'STD Rate'}
                            </button>` : ''}
                        </div>
                        <span class="text-[9px] font-mono text-slate-400">ID: ...${(r.ratePlanId || '').slice(-8)}</span>
                    </td>
                    <td class="p-1.5 w-48">
                        <select onchange="window.updateRateMapPlan(${globalIdx}, 'channel', this.value)" class="table-input font-bold text-slate-800">
                            <option value="DEFAULT" ${curChan === 'DEFAULT' ? 'selected' : ''}>DEFAULT (Standard Pipe)</option>
                            <option value="Booking.com" ${curChan === 'Booking.com' ? 'selected' : ''}>Booking.com</option>
                            <option value="Hostelworld" ${curChan === 'Hostelworld' ? 'selected' : ''}>Hostelworld</option>
                            <option value="Agoda" ${curChan === 'Agoda' ? 'selected' : ''}>Agoda</option>
                            <option value="Expedia" ${curChan === 'Expedia' ? 'selected' : ''}>Expedia</option>
                            <option value="Airbnb" ${curChan === 'Airbnb' ? 'selected' : ''}>Airbnb</option>
                        </select>
                    </td>
                    <td class="p-1.5 w-44">
                        <select onchange="window.updateRateMapPlan(${globalIdx}, 'policy', this.value)" class="table-input font-bold ${r.policy === 'ref' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'text-slate-800'}">
                            <option value="non-ref" ${r.policy === 'non-ref' ? 'selected' : ''}>Non-Refundable</option>
                            <option value="ref" ${r.policy === 'ref' ? 'selected' : ''}>Refundable (+%)</option>
                        </select>
                    </td>
                </tr>`;
            }).join('');

        const channexRoomOptions = channexRooms.map(cr => `
            <option value="${cr.channexId}" ${cr.channexId === channexRoomId ? 'selected' : ''}>
                ${cr.channexTitle} (...${cr.channexId.slice(-6)})
            </option>
        `).join('');

        return `
        <div class="border border-indigo-200 rounded-lg p-3 bg-white shadow-xs">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2 mb-2 bg-slate-50 -mx-3 -mt-3 p-3 rounded-t-lg">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-6 h-6 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                        <i data-lucide="door-open" size="14"></i>
                    </span>
                    <span class="font-black text-slate-900 text-xs uppercase truncate">${cat}</span>
                </div>
                <div class="flex items-center gap-2">
                    <label class="label-base text-slate-500 mb-0 whitespace-nowrap">Channex Room:</label>
                    <select onchange="window.pairCategoryToChannexRoom('${cat.replace(/'/g, "\\'")}', this.value)" class="table-input !w-60 font-bold text-indigo-900 bg-white">
                        <option value="">-- Unmapped / Not Connected --</option>
                        ${channexRoomOptions}
                    </select>
                </div>
            </div>

            <div class="overflow-x-auto border border-slate-200 rounded">
                <table class="w-full text-left text-[11px] border-collapse">
                    <thead class="bg-slate-100 text-[9px] font-black uppercase text-slate-600 border-b border-slate-200">
                        <tr>
                            <th class="p-1.5">Rate Plan Name</th>
                            <th class="p-1.5 w-48">Sales Channel</th>
                            <th class="p-1.5 w-44">Cancellation Policy</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 font-semibold">
                        ${planRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.pairCategoryToChannexRoom = (pmsCat, channexRoomId) => {
    (window.channexMap || []).forEach(m => {
        if (m.pmsCategory === pmsCat) m.pmsCategory = '';
        if (m.channexId === channexRoomId) m.pmsCategory = pmsCat;
    });

    (window.channexRateMap || []).forEach(rp => {
        if (rp.roomTypeId === channexRoomId) rp.pmsCategory = pmsCat;
    });

    window.renderUnifiedRateMapping();
};

window.updateRateMapPlan = (globalIdx, field, value) => {
    if (window.channexRateMap[globalIdx]) {
        window.channexRateMap[globalIdx][field] = value;
    }
};

window.toggleRatePlanProduct = (globalIdx) => {
    if (window.channexRateMap[globalIdx]) {
        const cur = window.channexRateMap[globalIdx].product;
        const next = cur === 'evt' ? 'std' : 'evt';
        window.channexRateMap[globalIdx].product = next;
        window.channexRateMap[globalIdx].rateSource = next;
        window.renderUnifiedRateMapping();
    }
};

window.fetchChannexData = async () => {
    const apiKey = document.getElementById('chan-api-key').value.trim();
    const propId = document.getElementById('chan-prop-id').value.trim();
    if (!apiKey || !propId) {
        return window.customAlert("Missing Credentials", "Please enter both Channex API Key and Property ID.");
    }

    window.customAlert("Connecting", "Querying Channex API for active rooms and rate plans...");
    try {
        const roomRes = await fetch(`https://app.channex.io/api/v1/room_types?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        if (!roomRes.ok) throw new Error("Channex room fetch failed: " + roomRes.statusText);
        const roomJson = await roomRes.json();
        const chRooms = roomJson.data || [];

        const rateRes = await fetch(`https://app.channex.io/api/v1/rate_plans/options?filter[property_id]=${propId}`, {
            headers: { "user-api-key": apiKey, "Content-Type": "application/json" }
        });
        if (!rateRes.ok) throw new Error("Channex rate plan fetch failed: " + rateRes.statusText);
        const rateJson = await rateRes.json();
        const chPlans = rateJson.data || [];

        const categories = Array.from(new Set(window.roomDefinitions.map(r => r.category))).filter(Boolean);
        window.channexMap = chRooms.map(cr => {
            const title = cr.attributes?.title || '';
            const cleanCh = title.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            let matchedPms = categories.find(cat => {
                const cleanPms = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanPms === cleanCh || cleanPms.includes(cleanCh) || cleanCh.includes(cleanPms);
            }) || '';

            return {
                channexId: cr.id,
                channexTitle: title,
                pmsCategory: matchedPms
            };
        });

        const roomNameMap = {};
        chRooms.forEach(r => { roomNameMap[r.id] = r.attributes?.title || ''; });

        window.channexRateMap = chPlans.map(p => {
            const title = p.attributes?.title || '';
            const parentRoomId = p.attributes?.room_type_id || p.relationships?.room_type?.data?.id || '';
            const parentRoomName = roomNameMap[parentRoomId] || '';
            const mappedRule = window.channexMap.find(m => m.channexId === parentRoomId);
            
            const isBdc = /bdc|booking/i.test(title);
            const isRef = /ref|refundable|flexible/i.test(title) && !/non-?ref/i.test(title);
            const isEvt = /evt|fmp|party|pkg/i.test(title);

            return {
                ratePlanId: p.id,
                ratePlanTitle: title,
                roomTypeId: parentRoomId,
                channexRoomTitle: parentRoomName,
                pmsCategory: mappedRule ? mappedRule.pmsCategory : '',
                channel: isBdc ? 'Booking.com' : 'DEFAULT',
                policy: isRef ? 'ref' : 'non-ref',
                product: isEvt ? 'evt' : 'std',
                rateSource: isEvt ? 'evt' : 'std'
            };
        });

        const connBadge = document.getElementById('channex-conn-badge');
        connBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Connected';
        connBadge.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200';

        window.renderUnifiedRateMapping();
        window.customAlert("Success", `Connected! Retrieved ${chRooms.length} room types and ${chPlans.length} primary rate plans from Channex.`);
    } catch (err) {
        window.customAlert("Connection Error", err.message);
    }
};

// --------------------------------------------------------------------------
// SECTION 8: Step 4 - Pricing Rules, Relational Engine & Curves
// --------------------------------------------------------------------------
window.populateAnchorDropdowns = () => {
    const categories = Array.from(new Set(window.roomDefinitions.map(i => i.category))).filter(Boolean);
    const dormCats = Array.from(new Set(window.roomDefinitions.filter(i => (i.category || '').toLowerCase().includes('dorm')).map(i => i.category)));
    const privCats = Array.from(new Set(window.roomDefinitions.filter(i => !(i.category || '').toLowerCase().includes('dorm')).map(i => i.category)));

    const dormSel = document.getElementById('anchor-dorm-select');
    const privSel = document.getElementById('anchor-private-select');

    const dormPool = dormCats.length > 0 ? dormCats : categories;
    const privPool = privCats.length > 0 ? privCats : categories;

    if (dormSel) dormSel.innerHTML = dormPool.map(c => `<option value="${c}">${c}</option>`).join('');
    if (privSel) privSel.innerHTML = privPool.map(c => `<option value="${c}">${c}</option>`).join('');
};

window.renderRelationships = () => {
    const tbody = document.getElementById('relationships-table-body');
    if (!tbody) return;

    const categories = Array.from(new Set(window.roomDefinitions.map(i => i.category))).filter(Boolean);
    const isEvtOn = document.getElementById('toggle-events')?.checked;

    document.querySelectorAll('.evt-col-header').forEach(el => {
        el.style.display = isEvtOn ? 'table-cell' : 'none';
    });

    if (window.relationships.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-400 font-semibold italic">No room offset links configured. Click "+ Add Link Rule".</td></tr>`;
        return;
    }

    tbody.innerHTML = window.relationships.map((rel, idx) => {
        const anchorOpts = categories.map(c => `<option value="${c}" ${c === rel.anchor ? 'selected' : ''}>${c}</option>`).join('');
        const targetOpts = categories.map(c => `<option value="${c}" ${c === rel.target ? 'selected' : ''}>${c}</option>`).join('');

        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-1">
                <select onchange="window.relationships[${idx}].anchor = this.value" class="table-input font-bold text-slate-800">
                    ${anchorOpts}
                </select>
            </td>
            <td class="p-1">
                <select onchange="window.relationships[${idx}].target = this.value" class="table-input font-bold text-indigo-900 bg-indigo-50/50">
                    ${targetOpts}
                </select>
            </td>
            <td class="p-1">
                <div class="flex items-center gap-1">
                    <select onchange="window.relationships[${idx}].type = this.value" class="table-input !w-20 font-bold text-center">
                        <option value="=" ${rel.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.type === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.type === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.type === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.type === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" value="${rel.val !== undefined ? rel.val : 0}" onchange="window.relationships[${idx}].val = parseFloat(this.value) || 0" class="table-input font-black text-center !w-16">
                </div>
            </td>
            <td class="p-1 ${isEvtOn ? '' : 'hidden'} evt-rule-cell">
                <div class="flex items-center gap-1 bg-pink-50 p-0.5 rounded border border-pink-200">
                    <select onchange="window.relationships[${idx}].typeFmp = this.value" class="table-input !w-20 font-black text-pink-700 text-center">
                        <option value="=" ${rel.typeFmp === '=' ? 'selected' : ''}>SYNC (=)</option>
                        <option value="+%" ${rel.typeFmp === '+%' ? 'selected' : ''}>+ %</option>
                        <option value="-%" ${rel.typeFmp === '-%' ? 'selected' : ''}>- %</option>
                        <option value="+" ${rel.typeFmp === '+' ? 'selected' : ''}>+ ฿</option>
                        <option value="-" ${rel.typeFmp === '-' ? 'selected' : ''}>- ฿</option>
                    </select>
                    <input type="number" value="${rel.valFmp !== undefined ? rel.valFmp : 0}" onchange="window.relationships[${idx}].valFmp = parseFloat(this.value) || 0" class="table-input font-black text-center !w-16 text-pink-800">
                </div>
            </td>
            <td class="p-1 text-center">
                <button onclick="window.confirmRemoveRelationship(${idx})" class="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-0.5" title="Delete">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.addRelationshipRow = () => {
    const categories = Array.from(new Set(window.roomDefinitions.map(i => i.category))).filter(Boolean);
    window.relationships.push({
        anchor: categories[0] || 'Anchor Room',
        target: categories[1] || categories[0] || '',
        type: '=',
        val: 0,
        typeFmp: '=',
        valFmp: 0
    });
    window.renderRelationships();
};

window.confirmRemoveRelationship = async (idx) => {
    const confirmed = await window.customAlert("Delete Pricing Link", "Remove this room pricing link rule?", true);
    if (confirmed) {
        window.relationships.splice(idx, 1);
        window.renderRelationships();
    }
};

window.renderChannelRules = () => {
    const container = document.getElementById('channel-rules-container');
    if (!container) return;

    container.innerHTML = window.channelRules.map((rule, idx) => {
        const isProtected = rule.channel === 'DEFAULT' || rule.channel === 'DIRECT';
        return `
        <div class="flex items-center justify-between p-1.5 rounded border border-slate-200 bg-white">
            <div class="flex flex-col">
                <span class="font-bold text-slate-800 text-xs">${rule.channel}</span>
                <span class="text-[8.5px] font-semibold text-slate-400">${rule.desc || ''}</span>
            </div>
            <div class="flex items-center gap-1">
                <select onchange="window.channelRules[${idx}].type = this.value" class="table-input !w-20 font-bold text-center !py-0.5">
                    <option value="=" ${rule.type === '=' ? 'selected' : ''}>SYNC (=)</option>
                    <option value="+%" ${rule.type === '+%' ? 'selected' : ''}>+ %</option>
                    <option value="-%" ${rule.type === '-%' ? 'selected' : ''}>- %</option>
                    <option value="+" ${rule.type === '+' ? 'selected' : ''}>+ ฿</option>
                    <option value="-" ${rule.type === '-' ? 'selected' : ''}>- ฿</option>
                </select>
                <input type="number" value="${rule.val || 0}" onchange="window.channelRules[${idx}].val = parseFloat(this.value) || 0" class="table-input !w-16 !py-0.5 text-center font-black">
                ${!isProtected ? `
                <button onclick="window.confirmRemoveChannelRule(${idx})" class="text-slate-400 hover:text-red-600 cursor-pointer p-0.5 ml-1" title="Delete">
                    <i data-lucide="trash-2" size="13"></i>
                </button>` : '<span class="w-4"></span>'}
            </div>
        </div>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.addVerifiedChannelRule = () => {
    const used = window.channelRules.map(r => r.channel);
    const verified = ['Booking.com', 'Hostelworld', 'Agoda', 'Expedia', 'Airbnb', 'Trip.com'];
    const available = verified.find(ch => !used.includes(ch)) || 'Trip.com';
    window.channelRules.push({ id: `cr_${Date.now()}`, channel: available, desc: 'OTA Channel', type: '+%', val: 10 });
    window.renderChannelRules();
};

window.confirmRemoveChannelRule = async (idx) => {
    const rule = window.channelRules[idx];
    const confirmed = await window.customAlert("Delete Channel Rule", `Remove rule adjustment for "${rule.channel}"?`, true);
    if (confirmed) {
        window.channelRules.splice(idx, 1);
        window.renderChannelRules();
    }
};

window.toggleEventSettings = (enabled) => {
    document.getElementById('evt-ref-row').style.display = enabled ? 'block' : 'none';
    document.getElementById('event-curve-panel').classList.toggle('hidden', !enabled);
    window.renderRelationships();
};

const SPAN_CYCLE = [2, 4, 6, 7];

window.cycleRatesSpan = () => {
    const curIdx = SPAN_CYCLE.indexOf(window.ratesSpan);
    window.ratesSpan = SPAN_CYCLE[(curIdx + 1) % SPAN_CYCLE.length];
    const pill = document.getElementById('rates-span-pill');
    if (pill) pill.textContent = `±${window.ratesSpan} Days`;
    window.renderEventPriceTable();
};

window.cycleRestrSpan = () => {
    const curIdx = SPAN_CYCLE.indexOf(window.restrSpan);
    window.restrSpan = SPAN_CYCLE[(curIdx + 1) % SPAN_CYCLE.length];
    const pill = document.getElementById('restr-span-pill');
    if (pill) pill.textContent = `±${window.restrSpan} Days`;
    window.renderEventRestrTable();
};

window.renderEventCurveTables = (customBaselines = null) => {
    if (customBaselines) window.savedEventBaselines = customBaselines;
    window.renderEventPriceTable();
    window.renderEventRestrTable();
};

window.renderEventPriceTable = () => {
    const b = window.savedEventBaselines || {};
    const pThead = document.getElementById('event-price-thead');
    const pTbody = document.getElementById('event-price-tbody');
    const spanPill = document.getElementById('rates-span-pill');
    if (spanPill) spanPill.textContent = `±${window.ratesSpan} Days`;
    if (!pThead || !pTbody) return;

    const span = window.ratesSpan || 2;
    const offsets = [];
    for (let i = -span; i <= span; i++) offsets.push(i);

    pThead.innerHTML = `
        <tr class="text-[9px] font-black uppercase text-slate-500 border-b border-pink-200">
            <th class="p-1 text-left w-24">Segment</th>
            <th class="p-1">Std Base</th>
            <th class="p-1 text-pink-700">EVT Pkg</th>
            ${offsets.map(off => off === 0 
                ? `<th class="p-1 text-amber-700 font-black">Peak (0)</th>` 
                : `<th class="p-1">EVT ${off > 0 ? '+' + off : off}</th>`).join('')}
        </tr>
    `;

    const getPPrice = (off, pfx) => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const defVal = off === 0 ? (pfx === 'p' ? 5999 : 2499) : (pfx === 'p' ? 1099 : 299);
        return b[`${pfx}_${tag}`] !== undefined ? b[`${pfx}_${tag}`] : defVal;
    };

    pTbody.innerHTML = `
        <tr>
            <td class="p-1 font-bold text-indigo-900 text-left">Privates</td>
            <td class="p-1"><input type="number" id="base-p-std" class="table-input !py-0.5 text-center !w-14" value="${b.p_base || 899}"></td>
            <td class="p-1"><input type="number" id="base-p-pkg" class="table-input !py-0.5 text-center !w-14 text-pink-700" value="${b.p_pkg || 1000}"></td>
            ${offsets.map(off => `<td class="p-1"><input type="number" id="base-p-${off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off)}" class="table-input !py-0.5 text-center !w-14 ${off === 0 ? 'font-black text-amber-800 bg-amber-50 border-amber-300' : ''}" value="${getPPrice(off, 'p')}"></td>`).join('')}
        </tr>
        <tr>
            <td class="p-1 font-bold text-orange-900 text-left">Dorms</td>
            <td class="p-1"><input type="number" id="base-d-std" class="table-input !py-0.5 text-center !w-14" value="${b.d_base || 199}"></td>
            <td class="p-1"><input type="number" id="base-d-pkg" class="table-input !py-0.5 text-center !w-14 text-pink-700" value="${b.d_pkg || 200}"></td>
            ${offsets.map(off => `<td class="p-1"><input type="number" id="base-d-${off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off)}" class="table-input !py-0.5 text-center !w-14 ${off === 0 ? 'font-black text-amber-800 bg-amber-50 border-amber-300' : ''}" value="${getPPrice(off, 'd')}"></td>`).join('')}
        </tr>
    `;
};

window.renderEventRestrTable = () => {
    const b = window.savedEventBaselines || {};
    const rThead = document.getElementById('event-restr-thead');
    const rTbody = document.getElementById('event-restr-tbody');
    const spanPill = document.getElementById('restr-span-pill');
    if (spanPill) spanPill.textContent = `±${window.restrSpan} Days`;
    if (!rThead || !rTbody) return;

    const span = window.restrSpan || 6;
    const offsets = [];
    for (let i = -span; i <= span; i++) offsets.push(i);

    rThead.innerHTML = `
        <tr class="text-[9px] font-black uppercase text-slate-500 border-b border-pink-200">
            <th class="p-1 text-left w-36">Restriction Rule</th>
            ${offsets.map(off => off === 0 
                ? `<th class="p-1 text-amber-700 font-black">Peak (0)</th>` 
                : `<th class="p-1">EVT ${off > 0 ? '+' + off : off}</th>`).join('')}
        </tr>
    `;

    const getHybridVal = (prefix, off, defVal = "") => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        const through = b[`${prefix}_${tag}`];
        const arr = b[`${prefix}arr_${tag}`];
        return (arr ? `${arr}▸` : (through || "")) || defVal;
    };

    const getBoolVal = (prefix, off) => {
        const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
        return !!b[`${prefix}_${tag}`];
    };

    rTbody.innerHTML = `
        <tr>
            <td class="p-1 text-left font-bold text-slate-700">Min Stay / Arrival</td>
            ${offsets.map(off => {
                const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
                const defVal = off === 0 ? '3▸' : (Math.abs(off) <= 1 ? '2' : '');
                return `<td class="p-1"><input type="text" id="restr-min-${tag}" class="table-input !py-0.5 text-center !w-14 font-black ${off === 0 ? 'text-amber-800 bg-amber-50' : ''}" value="${getHybridVal('r_min', off, defVal)}"></td>`;
            }).join('')}
        </tr>
        <tr>
            <td class="p-1 text-left font-bold text-slate-700">Max Stay / Arrival</td>
            ${offsets.map(off => {
                const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
                return `<td class="p-1"><input type="text" id="restr-max-${tag}" class="table-input !py-0.5 text-center !w-14 font-bold text-slate-500" placeholder="-" value="${getHybridVal('r_max', off, '')}"></td>`;
            }).join('')}
        </tr>
        <tr>
            <td class="p-1 text-left font-bold text-slate-700">Closed to Arrival (CTA)</td>
            ${offsets.map(off => {
                const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
                return `<td class="p-1"><input type="checkbox" id="restr-cta-${tag}" ${getBoolVal('r_cta', off) ? 'checked' : ''} class="accent-indigo-600 cursor-pointer"></td>`;
            }).join('')}
        </tr>
        <tr>
            <td class="p-1 text-left font-bold text-slate-700">Closed to Departure (CTD)</td>
            ${offsets.map(off => {
                const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
                return `<td class="p-1"><input type="checkbox" id="restr-ctd-${tag}" ${getBoolVal('r_ctd', off) ? 'checked' : ''} class="accent-indigo-600 cursor-pointer"></td>`;
            }).join('')}
        </tr>
    `;
};

// --------------------------------------------------------------------------
// SECTION 9: Step 5 - Review, Summary & Launch Handlers
// --------------------------------------------------------------------------
window.populateReviewSummary = () => {
    window.compileBedsFromDefinitions();
    document.getElementById('rev-prop-name').textContent = document.getElementById('prop-name').value || '--';
    document.getElementById('rev-prop-code').textContent = `Code: ${document.getElementById('prop-short').value || '--'}`;
    document.getElementById('rev-inv-count').textContent = `${window.compiledRooms.length} Beds/Units (${window.roomDefinitions.length} Rooms)`;

    const cats = Array.from(new Set(window.roomDefinitions.map(i => i.category))).filter(Boolean);
    document.getElementById('rev-cat-count').textContent = `${cats.length} Categories`;

    const apiKey = document.getElementById('chan-api-key').value.trim();
    document.getElementById('rev-chan-status').textContent = apiKey ? 'Connected' : 'Not Connected';
    document.getElementById('rev-chan-plans').textContent = `${window.channexRateMap.length} Rate Plans`;

    const eventsOn = document.getElementById('toggle-events').checked;
    document.getElementById('rev-events-status').textContent = `Events: ${eventsOn ? 'Active' : 'Off'}`;
};

window.savePropertyToDatabase = async (notify = true) => {
    const propId = window.activePropertyId;
    if (!propId) {
        return window.customAlert("No Property Selected", "Select or create a property first.");
    }

    const btnHeader = document.getElementById('btn-save-header');
    const btnFooter = document.getElementById('btn-save-footer');
    if (btnHeader) btnHeader.disabled = true;
    if (btnFooter) btnFooter.disabled = true;

    try {
        window.compileBedsFromDefinitions();
        window.roomDefinitions.forEach(d => delete d.isNew);

        const chRulesObj = {};
        window.channelRules.forEach(r => {
            chRulesObj[r.channel] = { type: r.type || '=', val: r.val || 0 };
        });

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), {
            name: document.getElementById('prop-name').value,
            short: document.getElementById('prop-short').value,
            currency: document.getElementById('prop-currency').value,
            timezone: document.getElementById('prop-timezone').value,
            address: document.getElementById('prop-address')?.value.trim() || '',
            email: document.getElementById('prop-email')?.value.trim() || '',
            phone: document.getElementById('prop-phone')?.value.trim() || '',
            website: document.getElementById('prop-website')?.value.trim() || '',
            logoUrl: document.getElementById('prop-logo-url')?.value.trim() || '',
            bannerUrl: document.getElementById('prop-banner-url')?.value.trim() || '',
            iconUrl: document.getElementById('prop-icon-url')?.value.trim() || '',
            enableEventRates: document.getElementById('toggle-events').checked,
            roomDefinitions: window.roomDefinitions, 
            rooms: window.compiledRooms, 
            addons: window.addons,
            channex: {
                apiKey: document.getElementById('chan-api-key').value.trim(),
                propId: document.getElementById('chan-prop-id').value.trim()
            },
            channexMap: window.channexMap,
            channexRateMap: window.channexRateMap
        }, { merge: true });

        const maxSpan = Math.max(window.ratesSpan || 2, window.restrSpan || 6);
        const offsets = [];
        for (let i = -maxSpan; i <= maxSpan; i++) offsets.push(i);

        const baselines = {
            p_base: parseFloat(document.getElementById('base-p-std')?.value) || 899,
            p_pkg: parseFloat(document.getElementById('base-p-pkg')?.value) || 1000,
            d_base: parseFloat(document.getElementById('base-d-std')?.value) || 199,
            d_pkg: parseFloat(document.getElementById('base-d-pkg')?.value) || 200,
            ratesSpan: window.ratesSpan || 2,
            restrSpan: window.restrSpan || 6
        };

        offsets.forEach(off => {
            const tag = off < 0 ? 'm' + Math.abs(off) : (off === 0 ? '0' : 'p' + off);
            const pPrice = parseFloat(document.getElementById(`base-p-${tag}`)?.value);
            const dPrice = parseFloat(document.getElementById(`base-d-${tag}`)?.value);
            if (!isNaN(pPrice)) baselines[`p_${tag}`] = pPrice;
            if (!isNaN(dPrice)) baselines[`d_${tag}`] = dPrice;

            const minRaw = document.getElementById(`restr-min-${tag}`)?.value || '';
            const maxRaw = document.getElementById(`restr-max-${tag}`)?.value || '';

            baselines[`r_min_${tag}`] = minRaw.includes('▸') ? null : (parseInt(minRaw, 10) || null);
            baselines[`r_minarr_${tag}`] = minRaw.includes('▸') ? (parseInt(minRaw, 10) || null) : null;
            baselines[`r_max_${tag}`] = maxRaw.includes('▸') ? null : (parseInt(maxRaw, 10) || null);
            baselines[`r_maxarr_${tag}`] = maxRaw.includes('▸') ? (parseInt(maxRaw, 10) || null) : null;

            baselines[`r_cta_${tag}`] = !!document.getElementById(`restr-cta-${tag}`)?.checked;
            baselines[`r_ctd_${tag}`] = !!document.getElementById(`restr-ctd-${tag}`)?.checked;
        });

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`), {
            pricingRules: {
                anchorPrivate: document.getElementById('anchor-private-select')?.value || '',
                anchorDorm: document.getElementById('anchor-dorm-select')?.value || '',
                stdRefVal: parseFloat(document.getElementById('rule-std-ref').value) || 25,
                evtRefVal: parseFloat(document.getElementById('rule-evt-ref').value) || 25,
                channels: chRulesObj
            },
            autofillBaselines: baselines,
            relationships: window.relationships,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        window.renderRoomDefTable();

        if (notify) {
            window.customAlert("Saved", `All setup parameters, room definitions (${window.roomDefinitions.length} rooms / ${window.compiledRooms.length} beds), and pricing rules saved to database!`);
        }
    } catch (err) {
        console.error("Save error:", err);
        if (notify) window.customAlert("Save Error", err.message);
    } finally {
        if (btnHeader) btnHeader.disabled = false;
        if (btnFooter) btnFooter.disabled = false;
    }
};

window.launchApp = (appKey) => {
    const shortCode = document.getElementById('prop-short').value || 'SWIMS';
    if (appKey === 'cm') {
        window.location.href = `cm.html?p=${shortCode}`;
    } else if (appKey === 'pms') {
        window.location.href = `pms.html?p=${shortCode}`;
    }
};

// --------------------------------------------------------------------------
// SECTION 10: Database Persistence & Property Switcher
// --------------------------------------------------------------------------
window.loadAllPropertiesList = async () => {
    try {
        const propsRef = collection(db, 'artifacts', appId, 'public', 'data', 'properties');
        const propsSnap = await getDocs(propsRef);
        const list = [];
        propsSnap.forEach(d => list.push({ id: d.id, ...d.data() }));
        window.availableProperties = list;

        const sel = document.getElementById('property-select');
        if (sel && list.length > 0) {
            sel.innerHTML = list.map(p => `
                <option value="${p.id}">${p.name || p.title || p.id}</option>
            `).join('');
        }
    } catch(e) {
        console.warn("Could not list properties:", e);
    }
};

window.loadPropertyFromDatabase = async (propId) => {
    const statusEl = document.getElementById('header-status-text');
    if (statusEl) statusEl.textContent = "Loading configuration from database...";

    try {
        const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        if (!docSnap.exists()) {
            if (statusEl) statusEl.textContent = "Property loaded in local memory.";
            return;
        }

        const prop = docSnap.data();
        window.currentPropertyData = prop;

        // 1. Profile & Logos
        document.getElementById('prop-name').value = prop.name || prop.title || propId;
        document.getElementById('prop-short').value = prop.short || propId.slice(0, 5).toUpperCase();
        document.getElementById('prop-currency').value = prop.currency || 'THB';
        document.getElementById('prop-timezone').value = prop.timezone || 'Asia/Bangkok';
        document.getElementById('prop-address').value = prop.address || '';
        document.getElementById('prop-email').value = prop.email || '';
        document.getElementById('prop-phone').value = prop.phone || '';
        document.getElementById('prop-website').value = prop.website || '';

        const defaultIcon = "https://loren-6q.github.io/PMS/gfx/WWicon.png";
        document.getElementById('prop-logo-url').value = prop.logoUrl || defaultIcon;
        document.getElementById('prop-banner-url').value = prop.bannerUrl || defaultIcon;
        document.getElementById('prop-icon-url').value = prop.iconUrl || defaultIcon;
        window.updateLogoPreview('primary', prop.logoUrl || defaultIcon);
        window.updateLogoPreview('banner', prop.bannerUrl || defaultIcon);
        window.updateLogoPreview('icon', prop.iconUrl || defaultIcon);

        // 2. Channex Credentials
        const apiKey = prop.channex?.apiKey || '';
        const chanPropId = prop.channex?.propId || '';
        document.getElementById('chan-api-key').value = apiKey;
        document.getElementById('chan-prop-id').value = chanPropId;

        const connBadge = document.getElementById('channex-conn-badge');
        if (apiKey && chanPropId) {
            connBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Connected';
            connBadge.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200';
        } else {
            connBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Not Connected';
            connBadge.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200';
        }

        // 3. Room Inventory
        if (Array.isArray(prop.roomDefinitions) && prop.roomDefinitions.length > 0) {
            window.roomDefinitions = prop.roomDefinitions;
        } else if (Array.isArray(prop.rooms) && prop.rooms.length > 0) {
            window.roomDefinitions = prop.rooms.map(r => ({
                roomName: r.name || r.id,
                category: r.category || r.type || 'Standard',
                units: 1,
                floor: r.floor || '1',
                bunkRule: 'private',
                type: 'private'
            }));
        } else {
            window.roomDefinitions = [];
        }
        window.compileBedsFromDefinitions();

        // 4. Rate Plans & Addons
        window.channexMap = Array.isArray(prop.channexMap) ? prop.channexMap : [];
        window.channexRateMap = Array.isArray(prop.channexRateMap) ? prop.channexRateMap : [];
        window.addons = (Array.isArray(prop.addons) && prop.addons.length > 0) ? prop.addons : loadDefaultAddons();

        // 5. Pricing Rules
        const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        const pricingData = pricingSnap.exists() ? pricingSnap.data() : {};
        const rules = pricingData.pricingRules || {};

        document.getElementById('rule-std-ref').value = rules.stdRefVal !== undefined ? rules.stdRefVal : 25;
        document.getElementById('rule-evt-ref').value = rules.evtRefVal !== undefined ? rules.evtRefVal : 25;

        const hasEvents = prop.enableEventRates !== undefined ? !!prop.enableEventRates : false;
        document.getElementById('toggle-events').checked = hasEvents;
        window.toggleEventSettings(hasEvents);

        if (Array.isArray(pricingData.relationships) && pricingData.relationships.length > 0) {
            window.relationships = pricingData.relationships;
        }

        const storedChannels = rules.channels || {};
        const defaultChannels = [
            { channel: 'DEFAULT', desc: 'Standard OTA Pipe', type: '=', val: 0 },
            { channel: 'DIRECT', desc: 'Direct Website Engine', type: '=', val: 0 },
            { channel: 'Booking.com', desc: 'BDC Channel', type: '=', val: 0 },
            { channel: 'Hostelworld', desc: 'HW Channel', type: '+%', val: 15 },
            { channel: 'Agoda', desc: 'Agoda Channel', type: '=', val: 0 }
        ];

        window.channelRules = defaultChannels.map(dc => {
            const chName = dc.channel;
            const st = storedChannels[chName];
            return {
                id: `cr_${chName.replace(/\s+/g, '')}`,
                channel: chName,
                desc: dc.desc,
                type: st?.type || dc.type,
                val: st?.val !== undefined ? st.val : dc.val
            };
        });

        const autoBase = pricingData.autofillBaselines || {};
        if (autoBase.ratesSpan) window.ratesSpan = autoBase.ratesSpan;
        if (autoBase.restrSpan) window.restrSpan = autoBase.restrSpan;

        window.renderAddonsTable();
        window.renderRoomDefTable();
        window.renderUnifiedRateMapping();
        window.renderChannelRules();
        window.populateAnchorDropdowns();
        window.renderRelationships();
        window.renderEventCurveTables(autoBase);
        window.populateReviewSummary();

        const pCode = document.getElementById('prop-short').value;
        document.getElementById('btn-goto-pms').href = `pms.html?p=${pCode}`;
        document.getElementById('btn-goto-cm').href = `cm.html?p=${pCode}`;
        if (statusEl) statusEl.textContent = `Loaded ${window.compiledRooms.length} beds (${window.roomDefinitions.length} rooms) for ${prop.name || propId}`;

    } catch (err) {
        console.error("Load property error:", err);
        if (statusEl) statusEl.textContent = "Error loading property: " + err.message;
    }
};

window.switchSetupProperty = (propId) => {
    if (!propId) return;
    window.activePropertyId = propId;
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('p', propId);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
    window.loadPropertyFromDatabase(propId);
};

window.openNewPropertyModal = () => {
    document.getElementById('new-prop-input-name').value = '';
    document.getElementById('new-prop-input-short').value = '';
    document.getElementById('new-prop-input-id').value = '';
    document.getElementById('new-property-modal').classList.remove('hidden');
};

window.closeNewPropertyModal = () => {
    document.getElementById('new-property-modal').classList.add('hidden');
};

window.confirmCreateNewProperty = async () => {
    const name = document.getElementById('new-prop-input-name').value.trim();
    const short = document.getElementById('new-prop-input-short').value.trim().toUpperCase();
    let slug = document.getElementById('new-prop-input-id').value.trim().toLowerCase();

    if (!name) return window.customAlert("Missing Field", "Please enter a Property Name.");
    if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    window.closeNewPropertyModal();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', slug), {
            name: name,
            short: short || slug.toUpperCase(),
            currency: 'THB',
            timezone: 'Asia/Bangkok',
            enableEventRates: false,
            roomDefinitions: [],
            rooms: [],
            addons: loadDefaultAddons(),
            channex: { apiKey: '', propId: '' },
            channexMap: [],
            channexRateMap: []
        }, { merge: true });

        await window.loadAllPropertiesList();
        const sel = document.getElementById('property-select');
        if (sel) sel.value = slug;
        await window.switchSetupProperty(slug);
        window.customAlert("Property Created", `Successfully created ${name}!`);
    } catch(err) {
        console.error("Create property error:", err);
        window.customAlert("Error", "Could not create property: " + err.message);
    }
};

// --------------------------------------------------------------------------
// SECTION 11: Boot & Lifecycle Listeners
// --------------------------------------------------------------------------
async function initAuthAndLoad() {
    try {
        if (typeof window.__initial_auth_token !== 'undefined') {
            try { await signInWithCustomToken(auth, window.__initial_auth_token); }
            catch (e) { await signInAnonymously(auth); }
        } else {
            await signInAnonymously(auth);
        }
    } catch (err) {
        console.warn("Auth initialization notice:", err);
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
}

document.addEventListener('DOMContentLoaded', () => {
    initAuthAndLoad();
    window.jumpStep(1);
});
