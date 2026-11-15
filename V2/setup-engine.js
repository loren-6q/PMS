// ==========================================================================
// setup-engine.js - Property Setup Wizard & Onboarding Engine
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc 
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

    // Re-render components whenever jumping steps to ensure fresh tables
    if (window.currentStep === 2 && typeof window.renderRoomDefinitionsTable === 'function') {
        window.renderRoomDefinitionsTable();
    } else if (window.currentStep === 3 && typeof window.renderStep3UnifiedMapping === 'function') {
        window.renderStep3UnifiedMapping();
    } else if (window.currentStep === 4) {
        if (typeof window.renderPaymentMethodsTable === 'function') window.renderPaymentMethodsTable();
        if (typeof window.renderAddonsTable === 'function') window.renderAddonsTable();
    } else if (window.currentStep === 5 && typeof window.updateStep5Review === 'function') {
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

const DEFAULT_PAYMENT_METHODS = [
    { key: "cash", label: "Cash", type: "revenue" },
    { key: "card", label: "Credit Card (POS)", type: "revenue" },
    { key: "qr", label: "Thai PromptPay / QR", type: "revenue" },
    { key: "transfer", label: "Bank Transfer", type: "revenue" },
    { key: "bdc-pay", label: "Booking.com Virtual Card", type: "revenue" },
    { key: "bdc-kp", label: "Booking.com Commission (Withheld)", type: "commission" },
    { key: "hw-kp", label: "Hostelworld Deposit (Withheld)", type: "commission" },
    { key: "agoda-pay", label: "Agoda eCard / Payout", type: "revenue" },
    { key: "agoda-kp", label: "Agoda Commission (Withheld)", type: "commission" },
    { key: "airbnb-pay", label: "Airbnb Payout", type: "revenue" }
];

const DEFAULT_ADDONS = [
    { id: "towel", name: "Towel Rental", price: 50, category: "Amenity" },
    { id: "late-checkout", name: "Late Checkout (2 PM)", price: 200, category: "Service" },
    { id: "ferry-ticket", name: "Ferry Ticket Transfer", price: 450, category: "Travel" },
    { id: "laundry", name: "Laundry Bag (1kg)", price: 60, category: "Service" }
];

// --- SECTION 3: STEP 1 (PROPERTY PROFILE & BRANDING) ---

window.updateLogoPreview = function(type, url) {
    const previewEl = document.getElementById(`preview-${type}`);
    if (!previewEl) return;
    if (url && url.startsWith('http')) {
        previewEl.src = url;
        previewEl.classList.remove('hidden');
    } else {
        previewEl.classList.add('hidden');
    }
};

// --- SECTION 4: STEP 2 (STANDARDIZED ROOM COMPILER, ARCHIVAL & RELOCATION) ---

// Machine delimiter for dorm beds: [Room Name] № [01..NN]
window.formatDormBedId = function(parentRoomName, bedNumber) {
    const cleanParent = String(parentRoomName || 'Dorm').trim();
    const paddedNum = String(bedNumber).padStart(2, '0');
    return `${cleanParent} № ${paddedNum}`;
};

window.compileRoomsFromDefinitions = function() {
    const compiled = [];

    window.roomDefinitions.forEach(def => {
        const rawName = (def.name || 'Room').trim();
        const cat = (def.category || 'Standard Room').trim();
        const total = Math.max(1, parseInt(def.beds || def.units || 1, 10));
        const rule = def.rule || 'private';
        const floor = def.floor || '1';
        const baseId = (def.id || rawName).trim();
        const isInactive = !!def.inactive;

        if (rule === 'private') {
            compiled.push({
                id: baseId,
                name: rawName,
                type: cat,
                category: cat,
                floor: floor,
                bed: 'private',
                bunk: 'private',
                rule: 'private',
                parentRoom: rawName,
                isDorm: false,
                capacity: total,
                inactive: isInactive
            });
        } else {
            for (let b = 1; b <= total; b++) {
                const bedId = window.formatDormBedId(rawName, b);
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
                    isDorm: true,
                    inactive: isInactive
                });
            }
        }
    });

    window.compiledRooms = compiled;

    const rBadge = document.getElementById('room-count-badge');
    const uBadge = document.getElementById('unit-count-badge');
    const activeDefs = window.roomDefinitions.filter(r => !r.inactive);
    const activeBeds = compiled.filter(r => !r.inactive);

    if (rBadge) rBadge.innerText = `${activeDefs.length} Active Rooms`;
    if (uBadge) uBadge.innerText = `${activeBeds.length} Active Beds`;
};

// Check reservations before room deletion or deactivation
window.getRoomBookingStats = async function(targetDef) {
    const canonProp = window.currentPropertyId;
    const todayStr = new Date().toISOString().split('T')[0];

    const targetIds = new Set();
    targetIds.add(targetDef.id);
    targetIds.add(targetDef.name);

    if (targetDef.rule !== 'private') {
        const total = Math.max(1, parseInt(targetDef.beds || 1, 10));
        for (let b = 1; b <= total; b++) {
            targetIds.add(window.formatDormBedId(targetDef.name, b));
            const letter = targetDef.name.replace(/^Dorm\s+/i, '').trim().toUpperCase();
            targetIds.add(`${letter}${String(b).padStart(2, '0')}`);
            targetIds.add(`${letter}-${b}`);
        }
    }

    let allBookings = window.staff || [];
    if (!allBookings.length && window.db) {
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
            allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn("Could not query bookings for audit:", e);
        }
    }

    const propBookings = allBookings.filter(b => (b.property || '') === canonProp && b.status !== 'cancelled');
    const pastBookings = [];
    const activeAndFutureBookings = [];

    propBookings.forEach(b => {
        const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
        if (rList.some(r => targetIds.has(r))) {
            if ((b.checkOut || '') < todayStr) pastBookings.push(b);
            else activeAndFutureBookings.push(b);
        }
    });

    return { pastBookings, activeAndFutureBookings };
};

window.deleteRoomDef = async function(index) {
    const def = window.roomDefinitions[index];
    if (!def) return;

    window.customAlert("Auditing Reservations...", `Checking reservations for "${def.name}"...`);
    const { pastBookings, activeAndFutureBookings } = await window.getRoomBookingStats(def);
    window.closeAlert();

    // 1. Future or currently in-house bookings -> must relocate first
    if (activeAndFutureBookings.length > 0) {
        return window.openRelocationModal(def, activeAndFutureBookings, pastBookings.length > 0);
    }

    // 2. Historical bookings exist -> archive (inactive), do not delete
    if (pastBookings.length > 0) {
        return window.customAlert(
            "Archive Room (Has Past Bookings)",
            `"${def.name}" has ${pastBookings.length} historical booking(s).\n\nTo preserve historical records and accounting, this room will be marked INACTIVE instead of deleted. It will be hidden from future calendars and OTAs, but will display on past dates where bookings exist.`,
            true,
            async () => {
                def.inactive = true;
                window.renderRoomDefinitionsTable();
                await window.savePropertyToDatabase(false);
            }
        );
    }

    // 3. Zero bookings -> safe to permanently remove
    window.customAlert(
        "Permanent Deletion",
        `Permanently delete "${def.name}"?\n\nThis room has 0 past or future bookings.`,
        true,
        async () => {
            window.roomDefinitions.splice(index, 1);
            window.renderRoomDefinitionsTable();
            await window.savePropertyToDatabase(false);
        }
    );
};

window.openRelocationModal = function(def, activeBookings, hasPast) {
    let modal = document.getElementById('relocation-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relocation-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    const availableTargets = window.roomDefinitions.filter(r => r.name !== def.name && !r.inactive);

    let html = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-2 border-slate-800">
            <div class="bg-amber-500 text-slate-900 p-3 font-black uppercase text-xs sm:text-sm flex items-center justify-between">
                <span>Active Bookings Detected (${activeBookings.length})</span>
                <button type="button" onclick="document.getElementById('relocation-modal').classList.add('hidden')" class="cursor-pointer font-bold text-base">&times;</button>
            </div>
            <div class="p-4 space-y-3 text-xs">
                <p class="font-bold text-slate-700">
                    <strong>${def.name}</strong> has <strong>${activeBookings.length} active or future booking(s)</strong>. Move these guests before closing the room:
                </p>
                <div class="max-h-36 overflow-y-auto border border-slate-200 rounded p-2 bg-slate-50 space-y-1">
    `;

    activeBookings.forEach(b => {
        html += `
            <div class="flex items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-1">
                <span class="font-bold text-slate-800">${b.firstName || ''} ${b.lastName || 'Guest'} (${b.bookId || b.id})</span>
                <span class="text-indigo-600 font-bold">${b.checkIn} &rarr; ${b.checkOut}</span>
            </div>
        `;
    });

    html += `
                </div>
                <div>
                    <label class="block font-black uppercase tracking-wider text-[10px] text-slate-600 mb-1">Move Active Guests To:</label>
                    <select id="relocate-target-room" class="w-full border border-slate-300 rounded p-1.5 font-bold uppercase cursor-pointer bg-white">
                        <option value="__UNASSIGNED__">-- UNASSIGNED TRAY --</option>
    `;

    availableTargets.forEach(t => {
        html += `<option value="${t.name}">${t.name} (${t.category})</option>`;
    });

    html += `
                    </select>
                </div>
                <div class="pt-2 border-t border-slate-200 flex justify-end gap-2">
                    <button type="button" onclick="document.getElementById('relocation-modal').classList.add('hidden')" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded uppercase cursor-pointer">Cancel</button>
                    <button type="button" onclick="window.executeBookingRelocation('${def.name}', ${hasPast})" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded uppercase shadow cursor-pointer">Relocate & Close</button>
                </div>
            </div>
        </div>
    `;

    modal.innerHTML = html;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.executeBookingRelocation = async function(roomName, hasPast) {
    const targetRoom = document.getElementById('relocate-target-room')?.value || '__UNASSIGNED__';
    const defIndex = window.roomDefinitions.findIndex(r => r.name === roomName);
    if (defIndex === -1) return;

    const modal = document.getElementById('relocation-modal');
    if (modal) modal.classList.add('hidden');

    window.customAlert("Relocating Reservations...", "Moving bookings and updating room status...");

    try {
        const { activeAndFutureBookings } = await window.getRoomBookingStats(window.roomDefinitions[defIndex]);
        const db = window.db;

        for (let b of activeAndFutureBookings) {
            const bRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', b.id);
            const newRoomList = (targetRoom === '__UNASSIGNED__') ? [""] : [targetRoom];
            await updateDoc(bRef, {
                rooms: newRoomList,
                room: newRoomList[0],
                notes: ((b.notes || '') + `\n[RELOCATED FROM CLOSED ROOM ${roomName} ON ${new Date().toLocaleDateString('en-GB')}]`).trim(),
                lastEditedAt: new Date().toISOString()
            });
        }

        if (hasPast) window.roomDefinitions[defIndex].inactive = true;
        else window.roomDefinitions.splice(defIndex, 1);

        await window.savePropertyToDatabase(false);
        window.closeAlert();
        window.customAlert("Relocation Complete", `Moved ${activeAndFutureBookings.length} booking(s). Room "${roomName}" is now closed.`);
        window.renderRoomDefinitionsTable();

    } catch (e) {
        console.error("Relocation Error:", e);
        window.closeAlert();
        window.customAlert("Relocation Failed", e.message);
    }
};

window.reactivateRoomDef = async function(index) {
    const def = window.roomDefinitions[index];
    if (!def) return;
    def.inactive = false;
    window.renderRoomDefinitionsTable();
    await window.savePropertyToDatabase(false);
};

// Batch Dorm Generator
window.toggleBatchDormPanel = function() {
    document.getElementById('batch-dorm-panel')?.classList.toggle('hidden');
};

window.applyBatchDorms = function() {
    const prefix = document.getElementById('batch-dorm-prefix')?.value.trim() || 'Dorm';
    const letters = (document.getElementById('batch-dorm-letters')?.value || 'A, B, C').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const cat = document.getElementById('batch-dorm-category')?.value.trim() || 'Standard Dorm';
    const beds = parseInt(document.getElementById('batch-dorm-beds')?.value, 10) || 10;
    const floor = document.getElementById('batch-dorm-floor')?.value.trim() || '1';
    const rule = document.getElementById('batch-dorm-rule')?.value || 'even-top';

    letters.forEach(letter => {
        const roomName = `${prefix} ${letter}`;
        const existingIdx = window.roomDefinitions.findIndex(r => r.name === roomName);
        const def = { id: roomName, name: roomName, category: cat, units: 2, beds: beds, floor: floor, rule: rule, inactive: false };
        if (existingIdx > -1) window.roomDefinitions[existingIdx] = def;
        else window.roomDefinitions.push(def);
    });

    window.toggleBatchDormPanel();
    window.renderRoomDefinitionsTable();
};

// Batch Private Room Generator
window.toggleBatchRoomPanel = function() {
    document.getElementById('batch-room-panel')?.classList.toggle('hidden');
};

window.applyBatchRooms = function() {
    const prefix = document.getElementById('batch-room-prefix')?.value.trim() || 'ROOM';
    const startNum = parseInt(document.getElementById('batch-room-start')?.value, 10) || 101;
    const count = parseInt(document.getElementById('batch-room-count')?.value, 10) || 5;
    const cat = document.getElementById('batch-room-category')?.value.trim() || 'Deluxe Private King';
    const floor = document.getElementById('batch-room-floor')?.value.trim() || '1';

    for (let i = 0; i < count; i++) {
        const roomName = `${prefix} ${startNum + i}`;
        const existingIdx = window.roomDefinitions.findIndex(r => r.name === roomName);
        const def = { id: roomName, name: roomName, category: cat, units: 1, beds: 1, floor: floor, rule: 'private', inactive: false };
        if (existingIdx > -1) window.roomDefinitions[existingIdx] = def;
        else window.roomDefinitions.push(def);
    }

    window.toggleBatchRoomPanel();
    window.renderRoomDefinitionsTable();
};

// Reorder Categories Modal
window.openReorderCategoriesModal = function() {
    let modal = document.getElementById('reorder-cats-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reorder-cats-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    const categories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    let listHtml = `
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border-2 border-slate-800">
            <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex items-center justify-between">
                <span>Reorder Categories</span>
                <button type="button" onclick="document.getElementById('reorder-cats-modal').classList.add('hidden')" class="cursor-pointer">&times;</button>
            </div>
            <div class="p-4 space-y-2 text-xs">
                <div id="reorder-cat-list" class="space-y-1.5 max-h-60 overflow-y-auto">
    `;

    categories.forEach((cat, idx) => {
        listHtml += `
            <div class="flex items-center justify-between p-2 rounded bg-slate-100 border border-slate-300 font-bold">
                <span>${cat}</span>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="window.moveCategory(${idx}, -1)" class="p-1 hover:bg-slate-200 rounded text-slate-700 cursor-pointer ${idx === 0 ? 'opacity-30' : ''}">&uarr;</button>
                    <button type="button" onclick="window.moveCategory(${idx}, 1)" class="p-1 hover:bg-slate-200 rounded text-slate-700 cursor-pointer ${idx === categories.length - 1 ? 'opacity-30' : ''}">&darr;</button>
                </div>
            </div>`;
    });

    listHtml += `
                </div>
                <div class="pt-3 border-t border-slate-200 flex justify-end">
                    <button type="button" onclick="document.getElementById('reorder-cats-modal').classList.add('hidden')" class="px-3 py-1 bg-slate-200 text-slate-700 font-bold rounded uppercase">Close</button>
                </div>
            </div>
        </div>`;

    modal.innerHTML = listHtml;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.moveCategory = function(idx, dir) {
    const categories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= categories.length) return;

    const temp = categories[idx];
    categories[idx] = categories[targetIdx];
    categories[targetIdx] = temp;

    const sortedDefs = [];
    categories.forEach(c => {
        window.roomDefinitions.filter(r => r.category === c).forEach(r => sortedDefs.push(r));
    });
    window.roomDefinitions.filter(r => !categories.includes(r.category)).forEach(r => sortedDefs.push(r));

    window.roomDefinitions = sortedDefs;
    window.renderRoomDefinitionsTable();
    window.openReorderCategoriesModal();
};

// --- RESTORED ALL BEDS PREVIEW DRAWER (FORMATTED CARDS & CHIPS) ---
window.toggleBedPreviewDrawer = function() {
    window.compileRoomsFromDefinitions();
    let drawer = document.getElementById('bed-preview-drawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'bed-preview-drawer';
        drawer.className = "allbeds-modal-overlay hidden";
        document.body.appendChild(drawer);
    }

    if (!drawer.classList.contains('hidden') && drawer.style.display !== 'none') {
        drawer.classList.add('hidden');
        drawer.style.display = 'none';
        return;
    }

    // Group compiled beds by parent room
    const roomsMap = new Map();
    window.compiledRooms.forEach(b => {
        const parent = b.parentRoom || b.name || b.id;
        if (!roomsMap.has(parent)) {
            roomsMap.set(parent, {
                name: parent,
                category: b.category,
                floor: b.floor,
                isDorm: b.isDorm,
                inactive: b.inactive,
                beds: []
            });
        }
        roomsMap.get(parent).beds.push(b);
    });

    const activeBedsCount = window.compiledRooms.filter(b => !b.inactive).length;
    const inactiveBedsCount = window.compiledRooms.filter(b => b.inactive).length;

    let html = `
        <div class="allbeds-modal-container">
            <div class="allbeds-header">
                <div class="flex items-center gap-2">
                    <i data-lucide="eye" size="16" class="text-indigo-400"></i>
                    <span class="font-black text-xs sm:text-sm uppercase tracking-wider">All Compiled Physical Inventory</span>
                    <span class="text-[10px] bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded font-black border border-indigo-700">
                        ${roomsMap.size} Rooms • ${activeBedsCount} Active Beds ${inactiveBedsCount > 0 ? `(${inactiveBedsCount} Inactive)` : ''}
                    </span>
                </div>
                <button type="button" onclick="document.getElementById('bed-preview-drawer').classList.add('hidden'); document.getElementById('bed-preview-drawer').style.display='none';" class="text-slate-400 hover:text-white cursor-pointer font-bold text-lg leading-none">&times;</button>
            </div>
            <div class="allbeds-body">
    `;

    roomsMap.forEach((roomData) => {
        html += `
            <div class="allbeds-room-card ${roomData.inactive ? 'opacity-50' : ''}">
                <div class="allbeds-room-header">
                    <div class="flex items-center gap-2">
                        <span class="font-black text-xs text-slate-800 uppercase tracking-wide">${roomData.name}</span>
                        <span class="text-[10px] font-bold text-slate-500 uppercase">(${roomData.category})</span>
                        ${roomData.inactive ? '<span class="text-[9px] bg-rose-100 text-rose-700 font-black px-1.5 py-0.2 rounded border border-rose-200 uppercase">ARCHIVED</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <span>Floor ${roomData.floor}</span>
                        <span>•</span>
                        <span>${roomData.beds.length} ${roomData.isDorm ? 'Bed(s)' : 'Unit'}</span>
                    </div>
                </div>
                <div class="allbeds-chip-grid">
        `;

        roomData.beds.forEach(bed => {
            const isTop = bed.bunk === 'top';
            const isBottom = bed.bunk === 'bottom';
            const bunkClass = isTop ? 'bunk-top' : (isBottom ? 'bunk-bottom' : 'bunk-single');
            const bunkArrow = isTop ? '↑' : (isBottom ? '↓' : '');
            const bunkLabel = isTop ? 'TOP' : (isBottom ? 'BOT' : (bed.isDorm ? 'BED' : 'ROOM'));

            html += `
                <div class="allbeds-bed-chip ${bed.inactive ? 'chip-inactive' : ''}" title="Canonical DB ID: ${bed.id}">
                    <span class="truncate">${bed.id}</span>
                    <span class="allbeds-bunk-indicator ${bunkClass}">${bunkLabel} ${bunkArrow}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    drawer.innerHTML = html;
    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
};

// --- ONE-TIME PERMANENT DATABASE STANDARDIZER MIGRATION ---
// Converts all legacy property room IDs & live reservation strings in Firestore directly to canonical:
// Private: [Room Name]
// Dorm:    [Room Name] № [01..NN]
window.standardizeAllPropertiesAndBookings = async function() {
    window.customAlert(
        "Permanent Database Standardization",
        "This utility will audit all properties and all bookings in Firestore.\n\nIt permanently converts all legacy bed formats (such as C301-1, A01, Dorm A Bed 1) into the canonical standard format ([Room Name] № [01..NN]).\n\nAll existing booking room assignments will be updated to match with exact 1-to-1 string equality so that runtime regex and guessing are permanently eliminated.\n\nA rolling backup will be created first.",
        true,
        async () => {
            window.customAlert("Standardizing Database...", "Auditing properties and reservations in Firestore. Please wait...");
            try {
                const curProp = window.currentPropertyId;
                const propSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', curProp));
                if (!propSnap.exists()) {
                    window.closeAlert();
                    return window.customAlert("Error", `Property ${curProp} not found in database.`);
                }

                const propData = propSnap.data();
                const roomDefs = Array.isArray(propData.roomDefinitions) ? propData.roomDefinitions : [];
                
                // 1. Build legacy-to-canonical translation dictionary
                const migrationMap = new Map();
                const canonicalRooms = [];

                roomDefs.forEach(def => {
                    const rawName = (def.name || 'Room').trim();
                    const cat = (def.category || 'Standard Room').trim();
                    const total = Math.max(1, parseInt(def.beds || def.units || 1, 10));
                    const rule = def.rule || 'private';
                    const floor = def.floor || '1';
                    const baseId = (def.id || rawName).trim();
                    const isInactive = !!def.inactive;

                    if (rule === 'private') {
                        canonicalRooms.push({
                            id: baseId,
                            name: rawName,
                            type: cat,
                            category: cat,
                            floor: floor,
                            bed: 'private',
                            bunk: 'private',
                            rule: 'private',
                            parentRoom: rawName,
                            isDorm: false,
                            capacity: total,
                            inactive: isInactive
                        });
                        migrationMap.set(baseId.toUpperCase(), baseId);
                        migrationMap.set(rawName.toUpperCase(), baseId);
                    } else {
                        const dormLetter = rawName.replace(/^Dorm\s+/i, '').trim().toUpperCase();
                        for (let b = 1; b <= total; b++) {
                            const canonicalBedId = window.formatDormBedId(rawName, b);
                            const paddedNum = String(b).padStart(2, '0');
                            let bunkType = 'single';
                            if (rule === 'odd-top') bunkType = (b % 2 !== 0) ? 'top' : 'bottom';
                            else if (rule === 'even-top') bunkType = (b % 2 === 0) ? 'top' : 'bottom';

                            canonicalRooms.push({
                                id: canonicalBedId,
                                name: `${rawName} Bed ${b}`,
                                type: cat,
                                category: cat,
                                floor: floor,
                                bed: bunkType,
                                bunk: bunkType,
                                icon: bunkType === 'top' ? 'top' : (bunkType === 'bottom' ? 'bot' : 'single'),
                                rule: rule,
                                parentRoom: rawName,
                                isDorm: true,
                                inactive: isInactive
                            });

                            // Map all legacy permutations to this canonical ID
                            migrationMap.set(canonicalBedId.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${rawName} Bed ${b}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${rawName}-${b}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${rawName} ${b}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${rawName} № ${b}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${rawName} № ${paddedNum}`.toUpperCase(), canonicalBedId);
                            
                            // SWIMS formats: C301-1, C301-01
                            migrationMap.set(`${dormLetter}-${b}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${dormLetter}-${paddedNum}`.toUpperCase(), canonicalBedId);

                            // LOUD formats: A01, B02, C05
                            migrationMap.set(`${dormLetter}${paddedNum}`.toUpperCase(), canonicalBedId);
                            migrationMap.set(`${dormLetter}${b}`.toUpperCase(), canonicalBedId);
                        }
                    }
                });

                // 2. Backup property
                const backupTimestamp = Date.now();
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${curProp}_std_${backupTimestamp}`), {
                    roomDefinitions: roomDefs,
                    rooms: canonicalRooms,
                    backedUpAt: new Date().toISOString()
                });

                // 3. Update property document with strictly standardized rooms
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', curProp), {
                    rooms: canonicalRooms,
                    updatedAt: new Date().toISOString()
                });

                // 4. Migrate bookings referencing old legacy formats in Firestore
                const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
                let updatedBookingsCount = 0;

                for (let docSnap of staffSnap.docs) {
                    const b = docSnap.data();
                    const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(b.property) : b.property;
                    if (sProp !== curProp) continue;

                    const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
                    let needsUpdate = false;
                    const newRooms = rList.map(rStr => {
                        if (!rStr) return "";
                        const cleanStr = String(rStr).trim().toUpperCase();
                        if (migrationMap.has(cleanStr)) {
                            const canonical = migrationMap.get(cleanStr);
                            if (canonical !== rStr) {
                                needsUpdate = true;
                                return canonical;
                            }
                        }
                        return rStr;
                    });

                    if (needsUpdate) {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', docSnap.id), {
                            rooms: newRooms,
                            room: newRooms[0] || "",
                            lastStandardizedAt: new Date().toISOString()
                        });
                        updatedBookingsCount++;
                    }
                }

                window.closeAlert();
                window.customAlert(
                    "Standardization Complete",
                    `Successfully standardized ${curProp}!\n\n• ${canonicalRooms.length} compiled physical bed/room rows updated in catalog.\n• ${updatedBookingsCount} booking records migrated to canonical № IDs in Firestore.\n\nAll bed assignments now use exact string equality.`
                );

                window.roomDefinitions = roomDefs;
                window.compiledRooms = canonicalRooms;
                window.renderRoomDefinitionsTable();

            } catch (err) {
                console.error("Standardization Error:", err);
                window.closeAlert();
                window.customAlert("Standardization Failed", err.message);
            }
        }
    );
};

// --- STREAMLINED STEP 2 TABLE WITH COMPACT CATEGORY BANNERS ---
window.renderRoomDefinitionsTable = function() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const datalist = document.getElementById('setup-category-datalist');
    const categories = Array.from(new Set(window.roomDefinitions.map(r => r.category).filter(Boolean)));
    if (datalist) datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');

    let currentCat = null;
    let catIndex = 0;
    let rowIndex = 0;

    // 1. Render Active Rooms with Category Transition Banners
    window.roomDefinitions.forEach((room, idx) => {
        if (room.inactive) return;
        rowIndex++;

        // Insert concise Category Banner on transition
        if (room.category !== currentCat) {
            currentCat = room.category;
            const sameCat = window.roomDefinitions.filter(r => !r.inactive && r.category === currentCat);
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const totalBeds = sameCat.reduce((s, r) => s + (parseInt(r.beds || r.units || 1, 10)), 0);

            const banner = document.createElement('tr');
            banner.className = `setup-cat-banner ${isDorm ? 'setup-cat-banner-dorm' : `setup-cat-banner-${catIndex % 6}`} border-y-2 border-slate-300 font-black text-xs uppercase`;
            banner.innerHTML = `
                <td colspan="7" class="py-1 px-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i data-lucide="${isDorm ? 'bed' : 'door-closed'}" size="14"></i>
                            <span class="tracking-wider text-slate-800">${currentCat}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] bg-white/80 px-1.5 py-0.2 rounded font-bold border border-slate-300">${sameCat.length} Rooms • ${totalBeds} Beds</span>
                            <span class="text-[9px] font-black uppercase tracking-widest px-1 py-0.2 rounded bg-slate-900 text-white">${isDorm ? 'DORM INVENTORY' : 'PRIVATE UNITS'}</span>
                        </div>
                    </div>
                </td>`;
            tbody.appendChild(banner);
            catIndex++;
        }

        // Room Row
        const tr = document.createElement('tr');
        tr.className = "bg-white hover:bg-slate-50 transition-colors border-b border-slate-200";
        tr.innerHTML = `
            <td class="text-center font-mono font-bold text-slate-400 text-[10px]">${rowIndex}</td>
            <td><input type="text" value="${room.name || ''}" class="table-input font-bold" onchange="window.roomDefinitions[${idx}].name = this.value; window.roomDefinitions[${idx}].id = this.value; window.compileRoomsFromDefinitions();"></td>
            <td><input type="text" list="setup-category-datalist" value="${room.category || ''}" class="table-input font-bold" onchange="window.roomDefinitions[${idx}].category = this.value; window.renderRoomDefinitionsTable();"></td>
            <td class="text-center"><input type="number" min="1" max="60" value="${room.beds || room.units || 1}" class="table-input text-center font-black" onchange="const v = parseInt(this.value, 10) || 1; window.roomDefinitions[${idx}].beds = v; window.roomDefinitions[${idx}].units = v; window.compileRoomsFromDefinitions();"></td>
            <td class="text-center"><input type="text" value="${room.floor || '1'}" class="table-input text-center font-bold" onchange="window.roomDefinitions[${idx}].floor = this.value"></td>
            <td>
                <select class="table-input font-bold" onchange="window.roomDefinitions[${idx}].rule = this.value; window.compileRoomsFromDefinitions();">
                    <option value="private" ${room.rule === 'private' ? 'selected' : ''}>PRIVATE</option>
                    <option value="even-top" ${room.rule === 'even-top' ? 'selected' : ''}>DORM (Top # Even)</option>
                    <option value="odd-top" ${room.rule === 'odd-top' ? 'selected' : ''}>DORM (Top # Odd)</option>
                    <option value="single" ${room.rule === 'single' ? 'selected' : ''}>DORM (Single Beds)</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.deleteRoomDef(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5" title="Delete or Deactivate">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 2. Render Collapsible Inactive Rooms Drawer at Bottom
    const inactive = window.roomDefinitions.filter(r => r.inactive);
    if (inactive.length > 0) {
        const headerTr = document.createElement('tr');
        headerTr.className = "bg-slate-800 text-slate-200 cursor-pointer select-none";
        headerTr.onclick = () => window.toggleInactiveRows();
        headerTr.innerHTML = `
            <td colspan="7" class="p-2 px-3 font-black text-xs uppercase tracking-wider">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i data-lucide="archive" size="14" class="text-amber-400"></i>
                        <span>ARCHIVED / INACTIVE ROOMS (${inactive.length})</span>
                        <span class="text-[9px] font-bold text-slate-400 normal-case">(Hidden on future calendars & OTAs, shown on past dates with bookings)</span>
                    </div>
                    <i data-lucide="chevron-down" id="inactive-chevron" size="14" class="transition-transform duration-200 rotate-[-90deg]"></i>
                </div>
            </td>`;
        tbody.appendChild(headerTr);

        window.roomDefinitions.forEach((room, idx) => {
            if (!room.inactive) return;
            const tr = document.createElement('tr');
            tr.className = "inactive-room-row hidden bg-slate-100/90 border-b border-slate-300 text-slate-500";
            tr.innerHTML = `
                <td class="text-center font-mono font-bold text-rose-500 text-[10px]">OFF</td>
                <td><span class="font-bold line-through px-2">${room.name}</span></td>
                <td><span class="font-semibold text-xs px-2">${room.category}</span></td>
                <td class="text-center font-bold">${room.beds || 1}</td>
                <td class="text-center">Floor ${room.floor || '1'}</td>
                <td><span class="font-mono text-[10px] uppercase">${room.rule || 'private'}</span></td>
                <td class="text-center">
                    <button type="button" onclick="window.reactivateRoomDef(${idx})" class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-[9px] uppercase cursor-pointer shadow-xs">
                        RESTORE
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    if (window.lucide) window.lucide.createIcons();
    window.compileRoomsFromDefinitions();
};

window.toggleInactiveRows = function() {
    const rows = document.querySelectorAll('.inactive-room-row');
    const ch = document.getElementById('inactive-chevron');
    if (!rows.length) return;
    const isHidden = rows[0].classList.contains('hidden');
    rows.forEach(r => r.classList.toggle('hidden', !isHidden));
    if (ch) ch.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
};

window.addBlankRoomDef = function() {
    window.roomDefinitions.push({
        id: `ROOM ${window.roomDefinitions.length + 1}`,
        name: `ROOM ${window.roomDefinitions.length + 1}`,
        category: "Standard Room",
        units: 1,
        beds: 1,
        floor: "1",
        rule: "private",
        inactive: false
    });
    window.renderRoomDefinitionsTable();
};

window.clearAllRoomDefs = function() {
    window.customAlert("Clear Inventory", "Are you sure you want to clear the room table?", true, () => {
        window.roomDefinitions = [];
        window.renderRoomDefinitionsTable();
    });
};

// --- SECTION 5: STEP 3 (CHANNEX MAPPING & RATE PLAN CREATOR) ---

window.fetchChannexData = async function() {
    const apiKey = document.getElementById('chan-api-key')?.value.trim();
    const propId = document.getElementById('chan-prop-id')?.value.trim();

    if (!apiKey || !propId) {
        return window.customAlert("Credentials Required", "Please enter both the Channex API Key and Property UUID.");
    }

    try {
        const headers = { "user-api-key": apiKey, "Content-Type": "application/json" };
        const host = "https://app.channex.io/api/v1";

        const rRes = await fetch(`${host}/room_types?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
        const rJson = await rRes.json();
        window.channexRooms = rJson.data || [];

        const pRes = await fetch(`${host}/rate_plans?filter[property_id]=${propId}&pagination[limit]=100`, { headers });
        const pJson = await pRes.json();
        const allPlans = pJson.data || [];

        // Filter out derived/OTA plans so only primary rate plans are displayed
        window.channexRatePlans = allPlans.filter(p => {
            const attr = p.attributes || {};
            const rel = p.relationships || {};
            const hasChannel = !!(rel.channel?.data?.id || attr.channel_id);
            const hasParent = !!(rel.parent_rate_plan?.data?.id || attr.parent_rate_plan_id);
            const isDerived = !!attr.ui_read_only || attr.is_derived === true;
            const title = (attr.title || '').toLowerCase();
            const isOta = /booking\.com|agoda|hostelworld|airbnb|expedia|ctrip|trip\.com/i.test(title);
            return !hasChannel && !hasParent && !isDerived && !isOta;
        });

        window.renderStep3UnifiedMapping();
        window.customAlert("Channex Fetched", `Fetched ${window.channexRooms.length} room types and ${window.channexRatePlans.length} primary rate plans.`);

    } catch (err) {
        console.error("Fetch Channex Error:", err);
        window.customAlert("Fetch Failed", err.message);
    }
};

window.renderStep3UnifiedMapping = function() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    container.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.filter(r => !r.inactive).map(r => r.category).filter(Boolean)));

    pmsCategories.forEach(pmsCat => {
        const mapping = window.channexMap.find(m => m.pmsCategory === pmsCat);
        const isMapped = !!(mapping && mapping.channexId);

        const card = document.createElement('div');
        // Visual indicator styling using style.css classes
        card.className = `rounded-lg p-3 mb-2.5 flex items-center justify-between gap-3 transition-all ${isMapped ? 'mapping-card-mapped' : 'mapping-card-unmapped'}`;

        let selectHtml = `<select class="table-input font-bold cursor-pointer" onchange="window.updateRoomTypeMapping('${pmsCat}', this.value)">
            <option value="">-- SELECT CHANNEX ROOM TYPE --</option>`;

        (window.channexRooms || []).forEach(cr => {
            const selected = mapping && mapping.channexId === cr.id ? 'selected' : '';
            selectHtml += `<option value="${cr.id}" ${selected}>${cr.attributes?.title || cr.id}</option>`;
        });
        selectHtml += `</select>`;

        card.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="${isMapped ? 'mapping-badge-mapped' : 'mapping-badge-unmapped'}">
                    ${isMapped ? 'MAPPED ✓' : 'UNMAPPED ⚠️'}
                </span>
                <span class="font-black text-xs uppercase text-slate-800">${pmsCat}</span>
            </div>
            <div class="w-72">${selectHtml}</div>
        `;
        container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
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
    }
    window.renderStep3UnifiedMapping();
};
// Cloud Persistence with Non-Destructive Merging & Automatic Rolling Backup
window.savePropertyToDatabase = async function(showMessage = true) {
    const btn = document.getElementById('btn-save-header');
    if (btn) { btn.disabled = true; btn.innerText = "SAVING..."; }

    try {
        const propId = window.currentPropertyId;
        window.compileRoomsFromDefinitions();

        // 1. Immutable Rolling Backup in Firestore before applying changes
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${propId}_${Date.now()}`);
        await setDoc(backupRef, {
            roomDefinitions: window.roomDefinitions,
            rooms: window.compiledRooms,
            savedAt: new Date().toISOString()
        });

        // 2. Safe Non-Destructive Fallbacks (Never overwrite with blank if field was not edited)
        const cfg = window.currentPropertyConfig || {};
        const getFieldVal = (id, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback !== undefined ? fallback : '';
            const v = el.value.trim();
            return v !== '' ? v : (fallback || '');
        };

        const dataToSave = {
            id: propId,
            name: getFieldVal('prop-name', cfg.name || propId),
            short: getFieldVal('prop-short', cfg.short || 'PROP'),
            currency: getFieldVal('prop-currency', cfg.currency || 'THB'),
            timezone: getFieldVal('prop-timezone', cfg.timezone || 'Asia/Bangkok'),
            address: getFieldVal('prop-address', cfg.address || ''),
            email: getFieldVal('prop-email', cfg.email || ''),
            phone: getFieldVal('prop-phone', cfg.phone || ''),
            logoUrl: getFieldVal('prop-logo-url', cfg.logoUrl || ''),
            bannerUrl: getFieldVal('prop-banner-url', cfg.bannerUrl || ''),
            iconUrl: getFieldVal('prop-icon-url', cfg.iconUrl || ''),
            payments: (window.paymentMethods && window.paymentMethods.length > 0) ? window.paymentMethods : (cfg.payments || DEFAULT_PAYMENT_METHODS),
            addons: (window.addonsList && window.addonsList.length > 0) ? window.addonsList : (cfg.addons || DEFAULT_ADDONS),
            roomDefinitions: window.roomDefinitions,
            rooms: window.compiledRooms,
            channex: {
                apiKey: getFieldVal('chan-api-key', cfg.channex?.apiKey || ''),
                propId: getFieldVal('chan-prop-id', cfg.channex?.propId || '')
            },
            channexMap: window.channexMap,
            channexRateMap: window.channexRateMap,
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), dataToSave, { merge: true });
        window.currentPropertyConfig = { ...dataToSave };

        // 3. Auto-Push Updated Capacity to Channex (Deducts any inactivated or deleted rooms immediately)
        if (dataToSave.channex.apiKey && dataToSave.channex.propId && window.triggerAutoSync) {
            const todayStr = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);
            const futureStr = futureDate.toISOString().split('T')[0];
            window.triggerAutoSync(todayStr, futureStr);
        }

        if (showMessage) {
            window.customAlert("Saved", "Property setup successfully saved, backed up, and synced.");
        }
    } catch (err) {
        console.error("Save Error:", err);
        window.customAlert("Save Error", err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
        if (window.lucide) window.lucide.createIcons();
    }
};

window.restoreDefaultAddonsAndPayments = function() {
    window.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
    window.addonsList = [...DEFAULT_ADDONS];
    window.renderPaymentMethodsTable();
    window.renderAddonsTable();
    window.customAlert("Restored", "Default payment methods and add-ons reloaded. Click SAVE in the top bar to persist.");
};

window.renderStep3UnifiedMapping = function() {
    const container = document.getElementById('unified-mapping-container');
    if (!container) return;
    container.innerHTML = '';

    const pmsCategories = Array.from(new Set(window.roomDefinitions.filter(r => !r.inactive).map(r => r.category).filter(Boolean)));

    pmsCategories.forEach(pmsCat => {
        const mapping = window.channexMap.find(m => m.pmsCategory === pmsCat);
        const card = document.createElement('div');
        card.className = "bg-white border border-slate-300 rounded p-2 mb-2 flex items-center justify-between gap-2";

        let selectHtml = `<select class="table-input font-bold" onchange="window.updateRoomTypeMapping('${pmsCat}', this.value)">
            <option value="">-- SELECT CHANNEX ROOM TYPE --</option>`;

        (window.channexRooms || []).forEach(cr => {
            const selected = mapping && mapping.channexId === cr.id ? 'selected' : '';
            selectHtml += `<option value="${cr.id}" ${selected}>${cr.attributes?.title || cr.id}</option>`;
        });
        selectHtml += `</select>`;

        card.innerHTML = `
            <span class="font-black text-xs uppercase">${pmsCat}</span>
            <div class="w-72">${selectHtml}</div>
        `;
        container.appendChild(card);
    });
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
    }
};

// Rate Plan Creator Modal
window.openCreateRatePlanModal = function() {
    let modal = document.getElementById('create-rate-plan-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-rate-plan-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    const categories = Array.from(new Set(window.roomDefinitions.filter(r => !r.inactive).map(r => r.category).filter(Boolean)));

    let html = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-slate-800">
            <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex items-center justify-between">
                <span>Create Channex Rate Plan</span>
                <button type="button" onclick="document.getElementById('create-rate-plan-modal').classList.add('hidden')" class="cursor-pointer">&times;</button>
            </div>
            <div class="p-4 space-y-3 text-xs">
                <div>
                    <label class="block font-black text-slate-700 uppercase text-[10px] mb-1">Preset Template:</label>
                    <div class="flex gap-1">
                        <button type="button" onclick="window.applyRatePlanPreset('Standard Non-Refundable', 'DEFAULT', 'non-ref')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 border rounded font-bold text-[10px]">Non-Ref</button>
                        <button type="button" onclick="window.applyRatePlanPreset('Flexible Rate', 'DEFAULT', 'ref')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 border rounded font-bold text-[10px]">Flexible</button>
                        <button type="button" onclick="window.applyRatePlanPreset('Event Package (EVT)', 'DEFAULT', 'evt')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 border rounded font-bold text-[10px]">Event Pkg</button>
                    </div>
                </div>
                <div>
                    <label class="block font-black text-slate-700 uppercase text-[10px] mb-1">Plan Title:</label>
                    <input type="text" id="crp-title" class="table-input font-bold" placeholder="e.g. Standard Non-Refundable">
                </div>
                <div>
                    <label class="block font-black text-slate-700 uppercase text-[10px] mb-1">Target Categories:</label>
                    <div class="space-y-1 max-h-36 overflow-y-auto border p-2 rounded bg-slate-50">
    `;

    categories.forEach(c => {
        html += `
            <label class="flex items-center gap-1.5 font-bold cursor-pointer">
                <input type="checkbox" class="crp-cat-chk" value="${c}" checked>
                <span>${c}</span>
            </label>
        `;
    });

    html += `
                    </div>
                </div>
                <div class="pt-2 border-t flex justify-end gap-2">
                    <button type="button" onclick="document.getElementById('create-rate-plan-modal').classList.add('hidden')" class="px-3 py-1 bg-slate-200 rounded font-bold uppercase">Cancel</button>
                    <button type="button" onclick="window.executeCreateAndPushRatePlan()" class="px-3 py-1 bg-indigo-600 text-white rounded font-black uppercase shadow">Create & Map</button>
                </div>
            </div>
        </div>
    `;

    modal.innerHTML = html;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.applyRatePlanPreset = function(title, channel, policy) {
    const titleInput = document.getElementById('crp-title');
    if (titleInput) titleInput.value = title;
};

window.executeCreateAndPushRatePlan = function() {
    const title = document.getElementById('crp-title')?.value.trim();
    if (!title) return window.customAlert("Validation Error", "Please provide a rate plan title.");

    const chks = document.querySelectorAll('.crp-cat-chk:checked');
    chks.forEach(chk => {
        const cat = chk.value;
        const planId = `plan_${Math.random().toString(36).substr(2, 8)}`;
        window.channexRateMap.push({
            pmsCategory: cat,
            ratePlanId: planId,
            ratePlanTitle: `${cat} - ${title}`
        });
    });

    document.getElementById('create-rate-plan-modal')?.classList.add('hidden');
    window.customAlert("Rate Plans Created", `Generated rate plans for ${chks.length} category(ies).`);
};

// --- SECTION 6: STEP 4 (PAYMENT METHODS & ADD-ONS) ---

window.renderPaymentMethodsTable = function() {
    const tbody = document.getElementById('payment-methods-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.paymentMethods.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200";
        tr.innerHTML = `
            <td class="font-mono text-xs font-bold text-slate-500">${m.key}</td>
            <td><input type="text" value="${m.label}" class="table-input font-bold" onchange="window.paymentMethods[${idx}].label = this.value"></td>
            <td>
                <select class="table-input font-bold" onchange="window.paymentMethods[${idx}].type = this.value">
                    <option value="revenue" ${m.type === 'revenue' ? 'selected' : ''}>Collected Revenue</option>
                    <option value="commission" ${m.type === 'commission' ? 'selected' : ''}>OTA Withheld (Commission)</option>
                </select>
            </td>
            <td class="text-center">
                <button type="button" onclick="window.paymentMethods.splice(${idx}, 1); window.renderPaymentMethodsTable();" class="text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.renderAddonsTable = function() {
    const tbody = document.getElementById('addons-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.addonsList.forEach((a, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200";
        tr.innerHTML = `
            <td><input type="text" value="${a.name}" class="table-input font-bold" onchange="window.addonsList[${idx}].name = this.value"></td>
            <td class="text-center"><input type="number" value="${a.price}" class="table-input text-center font-black" onchange="window.addonsList[${idx}].price = parseFloat(this.value) || 0"></td>
            <td><input type="text" value="${a.category || 'General'}" class="table-input font-bold" onchange="window.addonsList[${idx}].category = this.value"></td>
            <td class="text-center">
                <button type="button" onclick="window.addonsList.splice(${idx}, 1); window.renderAddonsTable();" class="text-slate-400 hover:text-rose-600 cursor-pointer">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

// --- SECTION 7: STEP 5 (DEPLOYMENT REVIEW & PERSISTENCE) ---

window.updateStep5Review = function() {
    const summaryEl = document.getElementById('review-summary-box');
    if (!summaryEl) return;

    const activeRooms = window.roomDefinitions.filter(r => !r.inactive);
    const inactiveRooms = window.roomDefinitions.filter(r => r.inactive);
    const activeBeds = window.compiledRooms.filter(r => !r.inactive);

    summaryEl.innerHTML = `
        <div class="space-y-2 text-xs">
            <div class="flex justify-between py-1 border-b border-slate-200">
                <span class="font-bold text-slate-600">Property Code:</span>
                <span class="font-mono font-black text-indigo-700">${window.currentPropertyId}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-200">
                <span class="font-bold text-slate-600">Active Inventory:</span>
                <span class="font-black text-slate-800">${activeRooms.length} Rooms • ${activeBeds.length} Beds</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-200">
                <span class="font-bold text-slate-600">Archived / Inactive:</span>
                <span class="font-black text-slate-500">${inactiveRooms.length} Closed Rooms</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-200">
                <span class="font-bold text-slate-600">Channex Mapped Categories:</span>
                <span class="font-black text-emerald-700">${window.channexMap.length} of ${new Set(activeRooms.map(r => r.category)).size}</span>
            </div>
        </div>
    `;
};

// Cloud Persistence with Automatic Rolling Backup and Channex Availability Push
window.savePropertyToDatabase = async function(showMessage = true) {
    const btn = document.getElementById('btn-save-header');
    if (btn) { btn.disabled = true; btn.innerText = "SAVING..."; }

    try {
        const propId = window.currentPropertyId;
        window.compileRoomsFromDefinitions();

        // 1. Immutable Rolling Backup in Firestore before applying changes
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${propId}_${Date.now()}`);
        await setDoc(backupRef, {
            roomDefinitions: window.roomDefinitions,
            rooms: window.compiledRooms,
            savedAt: new Date().toISOString()
        });

        // 2. Persist to Firestore property document
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
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), dataToSave, { merge: true });
        window.currentPropertyConfig = { ...dataToSave };

        // 3. Auto-Push Updated Capacity to Channex (Deducts any inactivated or deleted rooms immediately)
        if (dataToSave.channex.apiKey && dataToSave.channex.propId && window.triggerAutoSync) {
            const todayStr = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);
            const futureStr = futureDate.toISOString().split('T')[0];
            window.triggerAutoSync(todayStr, futureStr);
        }

        if (showMessage) {
            window.customAlert("Saved", "Property setup successfully saved, backed up, and synced.");
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

            window.renderPaymentMethodsTable();
            window.renderAddonsTable();
            window.renderRoomDefinitionsTable();
            window.renderStep3UnifiedMapping();
        }
    } catch (err) {
        console.error("Load Error:", err);
    }
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
