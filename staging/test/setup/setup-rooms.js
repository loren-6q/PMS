// ==========================================================================
// setup/setup-rooms.js - Physical Inventory Compiler, Batch Builder & Guards
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
                <td colspan="7" class="py-1 px-3 bg-slate-200">
                    <div class="flex items-center justify-between">
                        <span class="tracking-wider text-slate-800 font-black">${currentCat}</span>
                        <span class="text-[10px] bg-white/80 px-1.5 py-0.2 rounded font-bold border border-slate-300">
                            ${sameCat.length} Rooms • ${totalBeds} Beds (${isDorm ? 'DORM' : 'PRIVATE'})
                        </span>
                    </div>
                </td>`;
            tbody.appendChild(banner);
        }

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
                <button type="button" onclick="window.deleteRoomDef(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5">
                    <i data-lucide="trash-2" size="13"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 2. Render Inactive / Archived Rooms Collapsible Drawer
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
                <td><span class="font-mono text-[10px] uppercase">${room.rule || 'private'}</span></td>
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

export async function deleteRoomDef(index) {
    const def = (window.roomDefinitions || [])[index];
    if (!def) return;

    customAlert("Auditing Reservations...", `Checking reservations for "${def.name}"...`);
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
        return customAlert(
            "Archive Room",
            `"${def.name}" has ${pastBookings.length} historical booking(s).\n\nTo preserve historical reports, this room will be marked INACTIVE instead of deleted.`,
            true,
            () => {
                def.inactive = true;
                renderRoomDefinitionsTable();
            }
        );
    }

    customAlert(
        "Permanent Deletion",
        `Delete "${def.name}"? This room has 0 bookings.`,
        true,
        () => {
            window.roomDefinitions.splice(index, 1);
            renderRoomDefinitionsTable();
        }
    );
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
                <button type="button" onclick="document.getElementById('relocation-modal').classList.add('hidden')" class="font-bold text-base cursor-pointer">&times;</button>
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
                    <button type="button" onclick="document.getElementById('relocation-modal').classList.add('hidden')" class="px-3 py-1 bg-slate-200 rounded font-black uppercase cursor-pointer">Cancel</button>
                    <button type="button" onclick="window.executeBookingRelocation('${def.name}', ${hasPast})" class="px-3 py-1 bg-indigo-600 text-white rounded font-black uppercase shadow-xs cursor-pointer">Relocate & Close</button>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
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

        document.getElementById('relocation-modal')?.classList.add('hidden');
        renderRoomDefinitionsTable();
        customAlert("Relocation Complete", `Moved ${targetBookings.length} booking(s). Room "${roomName}" closed.`);

    } catch (e) {
        customAlert("Relocation Failed", e.message);
    }
}

export function openReorderCategoriesModal() {
    const modal = document.getElementById('reorder-categories-modal');
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

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeReorderCategoriesModal() {
    const modal = document.getElementById('reorder-categories-modal');
    if (modal) modal.classList.add('hidden');
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

export function toggleBedPreviewDrawer() {
    compileRoomsFromDefinitions();
    let drawer = document.getElementById('bed-preview-drawer-modal');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'bed-preview-drawer-modal';
        drawer.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4";
        document.body.appendChild(drawer);
    }

    const isHidden = drawer.classList.contains('hidden');
    if (!isHidden) {
        drawer.classList.add('hidden');
        drawer.style.display = 'none';
        return;
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
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border-2 border-slate-800">
            <div class="bg-slate-900 text-white p-3 font-black uppercase text-xs flex justify-between items-center">
                <span>All Compiled Physical Units (${window.compiledRooms.length})</span>
                <button type="button" onclick="document.getElementById('bed-preview-drawer-modal').classList.add('hidden')" class="font-bold text-base cursor-pointer">&times;</button>
            </div>
            <div class="p-3 space-y-2 overflow-y-auto flex-1">
    `;

    roomsMap.forEach((roomData) => {
        html += `
            <div class="p-2 rounded border border-slate-200 bg-slate-50 ${roomData.inactive ? 'opacity-50' : ''}">
                <div class="flex justify-between items-center mb-1 text-[11px] font-black uppercase">
                    <span class="text-indigo-900">${roomData.name} <span class="text-slate-400">(${roomData.category})</span></span>
                    <span class="text-slate-500">Floor ${roomData.floor} • ${roomData.beds.length} ${roomData.isDorm ? 'Beds' : 'Unit'}</span>
                </div>
                <div class="flex flex-wrap gap-1">
        `;
        roomData.beds.forEach(bed => {
            html += `
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-slate-300 bg-white shadow-2xs">
                    ${bed.id}
                </span>
            `;
        });
        html += `</div></div>`;
    });

    html += `</div></div>`;
    drawer.innerHTML = html;
    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
}

export function toggleBatchDormPanel() {
    document.getElementById('batch-dorm-panel')?.classList.toggle('hidden');
}

export function toggleBatchRoomPanel() {
    document.getElementById('batch-room-panel')?.classList.toggle('hidden');
}

export function executeBatchDormGenerate() {
    const name = document.getElementById('gen-dorm-name')?.value.trim() || 'DORM A';
    const cat = document.getElementById('gen-dorm-cat')?.value.trim() || 'Standard Quad Dorm';
    const beds = parseInt(document.getElementById('gen-dorm-beds')?.value, 10) || 4;
    const floor = document.getElementById('gen-dorm-floor')?.value.trim() || '1';
    const rule = document.getElementById('gen-dorm-rule')?.value || 'odd-top';

    window.roomDefinitions = window.roomDefinitions || [];
    window.roomDefinitions.push({ id: name, name, category: cat, beds, floor, rule, inactive: false });
    document.getElementById('batch-dorm-panel')?.classList.add('hidden');
    renderRoomDefinitionsTable();
}

export function executeBatchRoomGenerate() {
    const prefix = document.getElementById('gen-room-prefix')?.value.trim() || 'ROOM ';
    const cat = document.getElementById('gen-room-cat')?.value.trim() || 'Deluxe King Room';
    const start = parseInt(document.getElementById('gen-room-start')?.value, 10) || 1;
    const end = parseInt(document.getElementById('gen-room-end')?.value, 10) || 4;
    const floor = document.getElementById('gen-room-floor')?.value.trim() || '1';

    window.roomDefinitions = window.roomDefinitions || [];
    for (let i = start; i <= end; i++) {
        const name = `${prefix}${i}`;
        window.roomDefinitions.push({ id: name, name, category: cat, beds: 1, floor, rule: 'private', inactive: false });
    }
    document.getElementById('batch-room-panel')?.classList.add('hidden');
    renderRoomDefinitionsTable();
}

export function addBlankRoomDef() {
    window.roomDefinitions = window.roomDefinitions || [];
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
    renderRoomDefinitionsTable();
}

export function clearAllRoomDefs() {
    customAlert("Clear Rooms", "Delete all room definitions?", true, () => {
        window.roomDefinitions = [];
        renderRoomDefinitionsTable();
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
    window.openReorderCategoriesModal = openReorderCategoriesModal;
    window.closeReorderCategoriesModal = closeReorderCategoriesModal;
    window.moveCategory = moveCategory;
    window.toggleBedPreviewDrawer = toggleBedPreviewDrawer;
    window.toggleBatchDormPanel = toggleBatchDormPanel;
    window.toggleBatchRoomPanel = toggleBatchRoomPanel;
    window.executeBatchDormGenerate = executeBatchDormGenerate;
    window.executeBatchRoomGenerate = executeBatchRoomGenerate;
    window.addBlankRoomDef = addBlankRoomDef;
    window.clearAllRoomDefs = clearAllRoomDefs;
}
