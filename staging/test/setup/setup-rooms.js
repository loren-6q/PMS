// ==========================================================================
// setup/setup-rooms.js - Physical Inventory Compiler, Unified Wizard & Guards
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';

// Canonical № Bed Formatter (Enforces standard delimiter [Room Name] № [01..NN])
export function formatDormBedId(parentRoomName, bedNumber) {
    const cleanParent = String(parentRoomName || 'Dorm').trim();
    const paddedNum = String(bedNumber).padStart(2, '0');
    return `${cleanParent} № ${paddedNum}`;
}

/**
 * Clusters definitions so all rooms of the same category are contiguous.
 * Preserves the order of categories and the relative order of rooms within them.
 */
export function clusterDefinitionsByCategory(defs = null) {
    const source = defs || window.roomDefinitions || [];
    const categoryOrder = [];
    const grouped = new Map();

    source.forEach(room => {
        const cat = (room.category || 'Standard Room').trim();
        if (!grouped.has(cat)) {
            grouped.set(cat, []);
            categoryOrder.push(cat);
        }
        grouped.get(cat).push(room);
    });

    const clustered = [];
    categoryOrder.forEach(cat => {
        grouped.get(cat).forEach(r => clustered.push(r));
    });

    window.roomDefinitions = clustered;
    return clustered;
}

export function compileRoomsFromDefinitions() {
    const compiled = [];
    const definitions = window.roomDefinitions || [];

    definitions.forEach(def => {
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
                floor,
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
                const bedId = formatDormBedId(rawName, b);
                let bunkType = 'single';
                if (rule === 'odd-top') bunkType = (b % 2 !== 0) ? 'top' : 'bottom';
                else if (rule === 'even-top') bunkType = (b % 2 === 0) ? 'top' : 'bottom';

                compiled.push({
                    id: bedId,
                    name: `${rawName} Bed ${b}`,
                    bedNumber: b,
                    type: cat,
                    category: cat,
                    floor,
                    bed: bunkType,
                    bunk: bunkType,
                    icon: bunkType === 'top' ? 'top' : (bunkType === 'bottom' ? 'bot' : 'single'),
                    rule,
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
    const activeDefs = definitions.filter(r => !r.inactive);
    const activeBeds = compiled.filter(r => !r.inactive);

    if (rBadge) rBadge.innerText = `${activeDefs.length} Active Rooms`;
    if (uBadge) uBadge.innerText = `${activeBeds.length} Active Beds`;

    return compiled;
}

export function renderRoomDefinitionsTable() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Cluster definitions so same categories never split into multiple banners
    clusterDefinitionsByCategory();

    const definitions = window.roomDefinitions || [];
    const datalist = document.getElementById('setup-category-datalist');
    const categories = Array.from(new Set(definitions.map(r => r.category).filter(Boolean)));
    if (datalist) datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');

    let currentCat = null;
    let rowIndex = 0;

    // 1. Render Active Rooms
    definitions.forEach((room, idx) => {
        if (room.inactive) return;
        rowIndex++;

        // Category Transition Banner
        if (room.category !== currentCat) {
            currentCat = room.category;
            const sameCat = definitions.filter(r => !r.inactive && r.category === currentCat);
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const totalBeds = sameCat.reduce((s, r) => s + parseInt(r.beds || r.units || 1, 10), 0);

            const banner = document.createElement('tr');
            banner.className = `setup-cat-banner ${isDorm ? 'setup-cat-banner-dorm' : ''} border-y-2 border-slate-300 font-black text-xs uppercase`;
            banner.innerHTML = `
                <td colspan="7" class="py-1.5 px-3 bg-slate-200">
                    <div class="flex items-center justify-between">
                        <span class="tracking-wider text-slate-800 font-black">${currentCat}</span>
                        <span class="text-[10px] bg-white/80 px-2 py-0.5 rounded font-bold border border-slate-300">
                            ${sameCat.length} Rooms • ${totalBeds} Beds (${isDorm ? 'DORM' : 'PRIVATE'})
                        </span>
                    </div>
                </td>`;
            tbody.appendChild(banner);
        }

        // Intra-category position check for ordering buttons
        const sameCatActive = definitions.filter(r => !r.inactive && r.category === room.category);
        const posInCat = sameCatActive.findIndex(r => r === room);
        const isFirstInCat = posInCat === 0;
        const isLastInCat = posInCat === sameCatActive.length - 1;

        const tr = document.createElement('tr');
        tr.className = "bg-white hover:bg-slate-50 transition-colors border-b border-slate-200 text-xs";
        tr.innerHTML = `
            <td class="text-center py-1 px-1.5 font-mono text-[10px] text-slate-500">
                <div class="flex items-center justify-center gap-1">
                    <span class="font-bold w-4 text-center">${rowIndex}</span>
                    <div class="flex flex-col">
                        <button type="button" onclick="window.moveRoomWithinCategory(${idx}, -1)" class="text-slate-400 hover:text-slate-800 leading-none cursor-pointer ${isFirstInCat ? 'opacity-20 pointer-events-none' : ''}" title="Move Room Up">▲</button>
                        <button type="button" onclick="window.moveRoomWithinCategory(${idx}, 1)" class="text-slate-400 hover:text-slate-800 leading-none cursor-pointer ${isLastInCat ? 'opacity-20 pointer-events-none' : ''}" title="Move Room Down">▼</button>
                    </div>
                </div>
            </td>
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
                <button type="button" onclick="window.deleteRoomDef(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5" title="Delete or Archive Room">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 2. Render Inactive / Archived Rooms Drawer
    const inactive = definitions.filter(r => r.inactive);
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
                    </div>
                    <i data-lucide="chevron-down" id="inactive-chevron" size="14" class="transition-transform duration-200 rotate-[-90deg]"></i>
                </div>
            </td>`;
        tbody.appendChild(headerTr);

        definitions.forEach((room, idx) => {
            if (!room.inactive) return;
            const tr = document.createElement('tr');
            tr.className = "inactive-room-row hidden bg-slate-100/90 border-b border-slate-300 text-slate-500";
            tr.innerHTML = `
                <td class="text-center font-mono font-bold text-rose-500 text-[10px]">OFF</td>
                <td><span class="font-bold line-through px-2">${room.name}</span></td>
                <td><span class="font-semibold text-xs px-2">${room.category}</span></td>
                <td class="text-center font-bold">${room.beds || 1}</td>
                <td class="text-center">Floor ${room.floor || '1'}</td>
                <td class="text-center"><span class="font-mono text-[10px] uppercase">${room.rule || 'private'}</span></td>
                <td class="text-center">
                    <button type="button" onclick="window.reactivateRoomDef(${idx})" class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-[9px] uppercase cursor-pointer shadow-xs">
                        RESTORE
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    compileRoomsFromDefinitions();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// In-category room reordering
export function moveRoomWithinCategory(idx, dir) {
    const defs = window.roomDefinitions || [];
    const targetRoom = defs[idx];
    if (!targetRoom) return;

    const sameCatIndices = [];
    defs.forEach((r, i) => {
        if (!r.inactive && r.category === targetRoom.category) {
            sameCatIndices.push(i);
        }
    });

    const currPos = sameCatIndices.indexOf(idx);
    const targetPos = currPos + dir;
    if (targetPos < 0 || targetPos >= sameCatIndices.length) return;

    const swapIdx = sameCatIndices[targetPos];
    const temp = defs[idx];
    defs[idx] = defs[swapIdx];
    defs[swapIdx] = temp;

    renderRoomDefinitionsTable();
}

export function toggleInactiveRows() {
    const rows = document.querySelectorAll('.inactive-room-row');
    const ch = document.getElementById('inactive-chevron');
    if (!rows.length) return;
    const isHidden = rows[0].classList.contains('hidden');
    rows.forEach(r => r.classList.toggle('hidden', !isHidden));
    if (ch) ch.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

export function reactivateRoomDef(index) {
    if (!window.roomDefinitions?.[index]) return;
    window.roomDefinitions[index].inactive = false;
    renderRoomDefinitionsTable();
}

// --- ROOM DELETION & AUDIT GUARD (With In-Page Modal, No System Alerts) ---

export async function deleteRoomDef(index) {
    const def = (window.roomDefinitions || [])[index];
    if (!def) return;

    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const allBookings = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const todayStr = new Date().toISOString().split('T')[0];
        const canonProp = window.currentPropertyId || 'swims_resort';

        const targetBookings = allBookings.filter(b => {
            const prop = (b.property || 'swims_resort').toLowerCase();
            if (prop !== canonProp.toLowerCase() || b.status === 'cancelled') return false;
            const rList = Array.isArray(b.rooms) && b.rooms.length ? b.rooms : (b.room ? [b.room] : []);
            return rList.some(r => String(r).toUpperCase().includes(def.name.toUpperCase()));
        });

        const futureBookings = targetBookings.filter(b => (b.checkOut || '') >= todayStr);
        const pastBookings = targetBookings.filter(b => (b.checkOut || '') < todayStr);

        if (futureBookings.length > 0) {
            return openRelocationModal(def, futureBookings, pastBookings.length > 0);
        }

        if (pastBookings.length > 0) {
            return showRoomDeleteConfirmModal({
                title: "Archive Room (Has History)",
                message: `"${def.name}" has ${pastBookings.length} historical booking(s). To preserve historical balances and reporting, this room will be marked ARCHIVED (INACTIVE) instead of permanently deleted.`,
                confirmLabel: "Archive Room",
                confirmClass: "bg-amber-600 hover:bg-amber-700",
                onConfirm: () => {
                    def.inactive = true;
                    renderRoomDefinitionsTable();
                }
            });
        }

        showRoomDeleteConfirmModal({
            title: "Permanent Deletion",
            message: `Permanently delete "${def.name}"? This room has 0 bookings and will be removed immediately.`,
            confirmLabel: "Delete Permanently",
            confirmClass: "bg-rose-600 hover:bg-rose-700",
            onConfirm: () => {
                window.roomDefinitions.splice(index, 1);
                renderRoomDefinitionsTable();
            }
        });

    } catch (err) {
        console.error("[Room Audit Error]:", err);
        customAlert("Error", "Could not audit bookings: " + err.message);
    }
}

export function showRoomDeleteConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm }) {
    let modal = document.getElementById('delete-room-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'delete-room-confirm-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300">
            <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex justify-between items-center">
                <span>${title}</span>
                <button type="button" onclick="window.closeRoomDeleteConfirmModal()" class="text-slate-400 hover:text-white text-base cursor-pointer leading-none">&times;</button>
            </div>
            <div class="p-4 space-y-3 text-xs text-slate-700">
                <p class="font-bold leading-relaxed">${message}</p>
                <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
                    <button type="button" onclick="window.closeRoomDeleteConfirmModal()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-black uppercase text-[10px] cursor-pointer">
                        Cancel
                    </button>
                    <button type="button" id="confirm-del-btn" class="px-3 py-1.5 text-white rounded font-black uppercase text-[10px] shadow-xs cursor-pointer ${confirmClass}">
                        ${confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('confirm-del-btn').onclick = () => {
        window.closeRoomDeleteConfirmModal();
        if (typeof onConfirm === 'function') onConfirm();
    };

    modal.onclick = (e) => {
        if (e.target === modal) window.closeRoomDeleteConfirmModal();
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeRoomDeleteConfirmModal() {
    const modal = document.getElementById('delete-room-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function openRelocationModal(def, futureBookings, hasPast) {
    let modal = document.getElementById('relocation-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'relocation-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    const availableTargets = (window.roomDefinitions || []).filter(r => r.name !== def.name && !r.inactive);

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-2 border-slate-800">
            <div class="bg-amber-500 text-slate-900 p-3 font-black uppercase text-xs flex justify-between items-center">
                <span>Active Bookings Detected (${futureBookings.length})</span>
                <button type="button" onclick="window.closeRelocationModal()" class="font-bold text-base cursor-pointer">&times;</button>
            </div>
            <div class="p-4 space-y-3 text-xs">
                <p class="font-bold text-slate-700">Move these ${futureBookings.length} guest(s) before closing "${def.name}":</p>
                <div>
                    <label class="block font-black uppercase text-[10px] text-slate-500 mb-1">Move To Room:</label>
                    <select id="relocate-target-room" class="w-full border border-slate-300 rounded p-1.5 font-bold uppercase bg-white">
                        <option value="__UNASSIGNED__">-- UNASSIGNED TRAY --</option>
                        ${availableTargets.map(t => `<option value="${t.name}">${t.name} (${t.category})</option>`).join('')}
                    </select>
                </div>
                <div class="pt-2 border-t flex justify-end gap-2">
                    <button type="button" onclick="window.closeRelocationModal()" class="px-3 py-1 bg-slate-200 rounded font-black uppercase cursor-pointer">Cancel</button>
                    <button type="button" onclick="window.executeBookingRelocation('${def.name}', ${hasPast})" class="px-3 py-1 bg-indigo-600 text-white rounded font-black uppercase shadow-xs cursor-pointer">Relocate & Close</button>
                </div>
            </div>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) window.closeRelocationModal();
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeRelocationModal() {
    const modal = document.getElementById('relocation-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export async function executeBookingRelocation(roomName, hasPast) {
    const targetRoom = document.getElementById('relocate-target-room')?.value || '__UNASSIGNED__';
    const defIndex = (window.roomDefinitions || []).findIndex(r => r.name === roomName);
    if (defIndex === -1) return;

    try {
        const staffSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'staff'));
        const targetBookings = staffSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(b => (b.rooms || []).includes(roomName) || b.room === roomName);

        for (let b of targetBookings) {
            const bRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', b.id);
            const newRooms = targetRoom === '__UNASSIGNED__' ? [""] : [targetRoom];
            await updateDoc(bRef, {
                rooms: newRooms,
                room: newRooms[0],
                notes: ((b.notes || '') + `\n[RELOCATED FROM CLOSED ROOM ${roomName} ON ${new Date().toLocaleDateString('en-GB')}]`).trim()
            });
        }

        if (hasPast) window.roomDefinitions[defIndex].inactive = true;
        else window.roomDefinitions.splice(defIndex, 1);

        window.closeRelocationModal();
        renderRoomDefinitionsTable();
        customAlert("Relocation Complete", `Moved ${targetBookings.length} booking(s). Room "${roomName}" closed.`);

    } catch (e) {
        customAlert("Relocation Failed", e.message);
    }
}

// --- CATEGORY REORDER MODAL (Fixed Close Handler) ---

export function openReorderCategoriesModal() {
    let modal = document.getElementById('reorder-categories-modal');
    if (!modal) return;

    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    const listEl = document.getElementById('reorder-cat-list');
    if (listEl) {
        listEl.innerHTML = categories.map((cat, idx) => `
            <div class="flex items-center justify-between p-2 rounded bg-white border border-slate-200 font-bold text-xs">
                <span>${cat}</span>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="window.moveCategory(${idx}, -1)" class="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer ${idx === 0 ? 'opacity-30' : ''}">▲</button>
                    <button type="button" onclick="window.moveCategory(${idx}, 1)" class="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer ${idx === categories.length - 1 ? 'opacity-30' : ''}">▼</button>
                </div>
            </div>
        `).join('');
    }

    modal.onclick = (e) => {
        if (e.target === modal) window.closeReorderCategoriesModal();
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeReorderCategoriesModal() {
    const modal = document.getElementById('reorder-categories-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function moveCategory(idx, dir) {
    const categories = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
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
    renderRoomDefinitionsTable();
    openReorderCategoriesModal();
}

// --- ALL BEDS COMPILED PREVIEW DRAWER (Alternating Colors, Clean Bed Tags & Fixed Close) ---

export function toggleBedPreviewDrawer() {
    let drawer = document.getElementById('bed-preview-drawer-modal');
    if (drawer && !drawer.classList.contains('hidden') && drawer.style.display !== 'none') {
        window.closeBedPreviewDrawer();
        return;
    }
    openBedPreviewDrawer();
}

export function openBedPreviewDrawer() {
    compileRoomsFromDefinitions();
    let drawer = document.getElementById('bed-preview-drawer-modal');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'bed-preview-drawer-modal';
        drawer.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(drawer);
    }

    const roomsMap = new Map();
    (window.compiledRooms || []).forEach(b => {
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

    let html = `
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-300">
            <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex justify-between items-center">
                <span>All Compiled Physical Units (${window.compiledRooms.length} Beds)</span>
                <button type="button" onclick="window.closeBedPreviewDrawer()" class="text-slate-400 hover:text-white text-base cursor-pointer leading-none">&times;</button>
            </div>
            <div class="p-4 space-y-3 overflow-y-auto flex-1">
    `;

    roomsMap.forEach((roomData) => {
        html += `
            <div class="p-2.5 rounded-lg border border-slate-200 bg-slate-50 ${roomData.inactive ? 'opacity-50' : ''}">
                <div class="flex justify-between items-center mb-2 text-xs font-black uppercase">
                    <span class="text-indigo-950">${roomData.name} <span class="text-slate-400 font-semibold lowercase">(${roomData.category})</span></span>
                    <span class="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                        Floor ${roomData.floor} • ${roomData.beds.length} ${roomData.isDorm ? 'Beds' : 'Unit'}
                    </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
        `;

        roomData.beds.forEach((bed, bIdx) => {
            if (roomData.isDorm) {
                // Extract clean bed label without repeating room name
                let bedLabel = `№ ${String(bed.bedNumber || (bIdx + 1)).padStart(2, '0')}`;
                if (bed.id && bed.id.includes('№')) {
                    bedLabel = `№ ${bed.id.split('№')[1].trim()}`;
                }

                if (bed.bunk === 'top') {
                    // Top Bunk: Emerald Green
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-emerald-300 bg-emerald-100 text-emerald-800 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">▲ TOP</span> ${bedLabel}
                        </span>`;
                } else if (bed.bunk === 'bottom') {
                    // Bottom Bunk: Amber Yellow
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-amber-300 bg-amber-100 text-amber-900 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">▼ BOT</span> ${bedLabel}
                        </span>`;
                } else {
                    // Single Dorm Bed: Sky Blue
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-sky-300 bg-sky-100 text-sky-800 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">● BED</span> ${bedLabel}
                        </span>`;
                }
            } else {
                // Private Room: Indigo Pill
                html += `
                    <span class="px-2.5 py-1 rounded text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-2xs">
                        Entire Room Unit
                    </span>`;
            }
        });

        html += `</div></div>`;
    });

    html += `
            </div>
            <div class="p-2.5 bg-slate-100 border-t border-slate-200 flex justify-end">
                <button type="button" onclick="window.closeBedPreviewDrawer()" class="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase rounded cursor-pointer">
                    Close
                </button>
            </div>
        </div>
    `;

    drawer.innerHTML = html;
    drawer.onclick = (e) => {
        if (e.target === drawer) window.closeBedPreviewDrawer();
    };

    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
}

export function closeBedPreviewDrawer() {
    const drawer = document.getElementById('bed-preview-drawer-modal');
    if (drawer) {
        drawer.classList.add('hidden');
        drawer.style.display = 'none';
    }
}

// --- UNIFIED ROOM CREATOR WIZARD (Step-by-step Room & Dorm Generator) ---

let wizardState = {
    type: 'private',        // 'private' | 'dorm'
    count: 1,
    category: '',
    floor: '1',
    dormBeds: 4,
    dormRule: 'odd-top',
    namingMode: 'prefix',  // 'prefix' | 'custom'
    prefix: 'Room ',
    startNum: 1,
    padZero: false,
    customNames: ''
};

export function openRoomCreatorWizard(initialType = 'private') {
    wizardState.type = initialType;
    const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    wizardState.category = existingCats[0] || (initialType === 'dorm' ? 'Standard Quad Dorm' : 'Deluxe Room');
    wizardState.prefix = initialType === 'dorm' ? 'Dorm ' : 'Room ';

    let modal = document.getElementById('room-creator-wizard-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'room-creator-wizard-modal';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    renderWizardModalContent();
    modal.onclick = (e) => {
        if (e.target === modal) window.closeRoomCreatorWizard();
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeRoomCreatorWizard() {
    const modal = document.getElementById('room-creator-wizard-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

function renderWizardModalContent() {
    const modal = document.getElementById('room-creator-wizard-modal');
    if (!modal) return;

    const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    const isDorm = wizardState.type === 'dorm';

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300 flex flex-col text-xs">
            <div class="bg-slate-900 text-white p-3 font-black uppercase flex justify-between items-center">
                <span class="flex items-center gap-1.5">
                    <i data-lucide="plus-circle" size="14" class="text-indigo-400"></i> Room & Inventory Creator
                </span>
                <button type="button" onclick="window.closeRoomCreatorWizard()" class="text-slate-400 hover:text-white text-base leading-none cursor-pointer">&times;</button>
            </div>

            <div class="p-4 space-y-3.5 overflow-y-auto max-h-[75vh]">
                <!-- Step 1: Type Selection Pills -->
                <div>
                    <label class="block font-black uppercase text-[10px] text-slate-500 mb-1">1. Inventory Type</label>
                    <div class="grid grid-cols-2 gap-2">
                        <button type="button" onclick="window.setWizardType('private')" class="p-2 rounded font-black text-xs uppercase border cursor-pointer transition-colors ${!isDorm ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'}">
                            Private Room
                        </button>
                        <button type="button" onclick="window.setWizardType('dorm')" class="p-2 rounded font-black text-xs uppercase border cursor-pointer transition-colors ${isDorm ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'}">
                            Dorm (Shared Beds)
                        </button>
                    </div>
                </div>

                <!-- Step 2: Quantity & Category -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block font-black uppercase text-[10px] text-slate-500 mb-1">Number of Rooms</label>
                        <input type="number" id="wiz-count" min="1" max="50" value="${wizardState.count}" class="w-full border border-slate-300 rounded p-1.5 font-black text-center" oninput="window.updateWizardState('count', parseInt(this.value, 10) || 1)">
                    </div>
                    <div>
                        <label class="block font-black uppercase text-[10px] text-slate-500 mb-1">Floor Level</label>
                        <input type="text" id="wiz-floor" value="${wizardState.floor}" class="w-full border border-slate-300 rounded p-1.5 font-bold text-center" oninput="window.updateWizardState('floor', this.value)">
                    </div>
                </div>

                <div>
                    <label class="block font-black uppercase text-[10px] text-slate-500 mb-1">Category (Room Type)</label>
                    <div class="space-y-1">
                        <select id="wiz-cat-select" class="w-full border border-slate-300 rounded p-1.5 font-bold bg-white" onchange="window.handleWizardCatSelect(this.value)">
                            ${existingCats.map(c => `<option value="${c}" ${c === wizardState.category ? 'selected' : ''}>${c}</option>`).join('')}
                            <option value="__NEW__">+ Enter New Category Name...</option>
                        </select>
                        <input type="text" id="wiz-cat-new-input" placeholder="Type new category name..." class="w-full border border-indigo-300 bg-indigo-50/50 rounded p-1.5 font-bold ${wizardState.isCustomCat ? '' : 'hidden'}" oninput="window.updateWizardState('category', this.value)">
                    </div>
                </div>

                <!-- Step 3: Dorm Settings (Only visible if dorm) -->
                ${isDorm ? `
                    <div class="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200 space-y-2">
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block font-black uppercase text-[10px] text-indigo-900 mb-1">Beds Per Room</label>
                                <input type="number" min="1" max="60" value="${wizardState.dormBeds}" class="w-full border border-indigo-300 rounded p-1.5 font-black text-center bg-white" oninput="window.updateWizardState('dormBeds', parseInt(this.value, 10) || 4)">
                            </div>
                            <div>
                                <label class="block font-black uppercase text-[10px] text-indigo-900 mb-1">Bunk Logic</label>
                                <select class="w-full border border-indigo-300 rounded p-1.5 font-bold bg-white" onchange="window.updateWizardState('dormRule', this.value)">
                                    <option value="odd-top" ${wizardState.dormRule === 'odd-top' ? 'selected' : ''}>Odd # Top (1,3..)</option>
                                    <option value="even-top" ${wizardState.dormRule === 'even-top' ? 'selected' : ''}>Even # Top (2,4..)</option>
                                    <option value="single" ${wizardState.dormRule === 'single' ? 'selected' : ''}>All Single Beds</option>
                                </select>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Step 4: Naming Configuration -->
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="block font-black uppercase text-[10px] text-slate-500">Naming Pattern</label>
                        <div class="flex items-center gap-2">
                            <label class="font-bold text-[10px] flex items-center gap-1 cursor-pointer">
                                <input type="radio" name="wiz-mode" value="prefix" ${wizardState.namingMode === 'prefix' ? 'checked' : ''} onchange="window.updateWizardState('namingMode', 'prefix')"> Auto-Sequence
                            </label>
                            <label class="font-bold text-[10px] flex items-center gap-1 cursor-pointer">
                                <input type="radio" name="wiz-mode" value="custom" ${wizardState.namingMode === 'custom' ? 'checked' : ''} onchange="window.updateWizardState('namingMode', 'custom')"> Custom List
                            </label>
                        </div>
                    </div>

                    ${wizardState.namingMode === 'prefix' ? `
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-2">
                                <input type="text" placeholder="Prefix (e.g. Deluxe )" value="${wizardState.prefix}" class="w-full border border-slate-300 rounded p-1.5 font-bold" oninput="window.updateWizardState('prefix', this.value)">
                            </div>
                            <div>
                                <input type="number" min="1" placeholder="Start" value="${wizardState.startNum}" class="w-full border border-slate-300 rounded p-1.5 font-bold text-center" oninput="window.updateWizardState('startNum', parseInt(this.value, 10) || 1)">
                            </div>
                        </div>
                    ` : `
                        <textarea placeholder="Enter room names (comma or line separated)..." class="w-full border border-slate-300 rounded p-1.5 font-bold h-16" oninput="window.updateWizardState('customNames', this.value)">${wizardState.customNames}</textarea>
                    `}
                </div>

                <!-- Step 5: Live Generation Preview -->
                <div class="p-2.5 rounded bg-slate-100 border border-slate-200">
                    <span class="block font-black uppercase text-[9px] text-slate-400 mb-1">Preview of generated rooms:</span>
                    <div id="wiz-preview-pills" class="flex flex-wrap gap-1"></div>
                </div>
            </div>

            <!-- Footer Actions -->
            <div class="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                <button type="button" onclick="window.closeRoomCreatorWizard()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold uppercase rounded cursor-pointer">Cancel</button>
                <button type="button" onclick="window.executeWizardGenerate()" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase rounded shadow-xs cursor-pointer flex items-center gap-1">
                    <i data-lucide="plus" size="13"></i> Create Rooms
                </button>
            </div>
        </div>
    `;

    updateWizardPreviewPills();
    if (window.lucide) window.lucide.createIcons();
}

export function setWizardType(type) {
    wizardState.type = type;
    wizardState.prefix = type === 'dorm' ? 'Dorm ' : 'Room ';
    renderWizardModalContent();
}

export function handleWizardCatSelect(val) {
    if (val === '__NEW__') {
        wizardState.isCustomCat = true;
        wizardState.category = '';
    } else {
        wizardState.isCustomCat = false;
        wizardState.category = val;
    }
    renderWizardModalContent();
}

export function updateWizardState(key, val) {
    wizardState[key] = val;
    updateWizardPreviewPills();
}

function getWizardNamesList() {
    const list = [];
    if (wizardState.namingMode === 'prefix') {
        const count = Math.max(1, wizardState.count || 1);
        const start = wizardState.startNum || 1;
        const prefix = wizardState.prefix || 'Room ';
        for (let i = 0; i < count; i++) {
            const num = start + i;
            list.push(`${prefix}${num}`);
        }
    } else {
        const raw = (wizardState.customNames || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        list.push(...raw);
        if (list.length === 0) list.push('Room 1');
    }
    return list;
}

function updateWizardPreviewPills() {
    const container = document.getElementById('wiz-preview-pills');
    if (!container) return;

    const names = getWizardNamesList();
    const isDorm = wizardState.type === 'dorm';
    const beds = isDorm ? (wizardState.dormBeds || 4) : 1;

    container.innerHTML = names.map(n => `
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white border border-slate-300 text-slate-700">
            ${n} <span class="text-indigo-600 font-normal">(${beds} ${isDorm ? 'beds' : 'bed'})</span>
        </span>
    `).join('') + (names.length === 0 ? `<span class="text-slate-400 italic">No rooms to generate</span>` : '');
}

export function executeWizardGenerate() {
    const names = getWizardNamesList();
    if (names.length === 0) return customAlert("Input Required", "Please specify at least one room name.");

    const cat = (wizardState.category || '').trim() || (wizardState.type === 'dorm' ? 'Standard Dorm' : 'Standard Room');
    const floor = (wizardState.floor || '1').trim();
    const isDorm = wizardState.type === 'dorm';
    const beds = isDorm ? Math.max(1, parseInt(wizardState.dormBeds, 10) || 4) : 1;
    const rule = isDorm ? (wizardState.dormRule || 'odd-top') : 'private';

    window.roomDefinitions = window.roomDefinitions || [];

    names.forEach(name => {
        window.roomDefinitions.push({
            id: name,
            name: name,
            category: cat,
            beds: beds,
            units: beds,
            floor: floor,
            rule: rule,
            inactive: false
        });
    });

    clusterDefinitionsByCategory();
    window.closeRoomCreatorWizard();
    renderRoomDefinitionsTable();

    customAlert("Rooms Created", `Added ${names.length} room(s) under "${cat}".`);
}

// Global Aliases to make all existing buttons in setup.html trigger the unified wizard
export function toggleBatchRoomPanel() {
    openRoomCreatorWizard('private');
}

export function toggleBatchDormPanel() {
    openRoomCreatorWizard('dorm');
}

export function addBlankRoomDef() {
    openRoomCreatorWizard('private');
}

export function clearAllRoomDefs() {
    showRoomDeleteConfirmModal({
        title: "Clear All Inventory",
        message: "Are you sure you want to delete ALL room definitions? This will wipe your room setup.",
        confirmLabel: "Wipe All Rooms",
        confirmClass: "bg-rose-600 hover:bg-rose-700",
        onConfirm: () => {
            window.roomDefinitions = [];
            renderRoomDefinitionsTable();
        }
    });
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.formatDormBedId = formatDormBedId;
    window.compileRoomsFromDefinitions = compileRoomsFromDefinitions;
    window.renderRoomDefinitionsTable = renderRoomDefinitionsTable;
    window.toggleInactiveRows = toggleInactiveRows;
    window.reactivateRoomDef = reactivateRoomDef;
    window.deleteRoomDef = deleteRoomDef;
    window.moveRoomWithinCategory = moveRoomWithinCategory;
    window.openReorderCategoriesModal = openReorderCategoriesModal;
    window.closeReorderCategoriesModal = closeReorderCategoriesModal;
    window.moveCategory = moveCategory;
    window.toggleBedPreviewDrawer = toggleBedPreviewDrawer;
    window.openBedPreviewDrawer = openBedPreviewDrawer;
    window.closeBedPreviewDrawer = closeBedPreviewDrawer;
    window.openRoomCreatorWizard = openRoomCreatorWizard;
    window.closeRoomCreatorWizard = closeRoomCreatorWizard;
    window.setWizardType = setWizardType;
    window.handleWizardCatSelect = handleWizardCatSelect;
    window.updateWizardState = updateWizardState;
    window.executeWizardGenerate = executeWizardGenerate;
    window.closeRoomDeleteConfirmModal = closeRoomDeleteConfirmModal;
    window.closeRelocationModal = closeRelocationModal;
    window.executeBookingRelocation = executeBookingRelocation;
    window.toggleBatchDormPanel = toggleBatchDormPanel;
    window.toggleBatchRoomPanel = toggleBatchRoomPanel;
    window.addBlankRoomDef = addBlankRoomDef;
    window.clearAllRoomDefs = clearAllRoomDefs;

    // Global keyboard listener to close open modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeBedPreviewDrawer();
            window.closeRoomCreatorWizard();
            window.closeReorderCategoriesModal();
            window.closeRoomDeleteConfirmModal();
            window.closeRelocationModal();
        }
    });
}
