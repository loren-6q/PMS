// ==========================================================================
// setup/setup-rooms.js - Physical Inventory Compiler, Wizard & Guards
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';

// Canonical № Bed Formatter: [Room Name] № [01..NN]
export function formatDormBedId(parentRoomName, bedNumber) {
    const cleanParent = String(parentRoomName || 'Dorm').trim();
    const paddedNum = String(bedNumber).padStart(2, '0');
    return `${cleanParent} № ${paddedNum}`;
}

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

        // Guardrail: Ensure every room has an immutable permanent ID
        if (!def.id || def.id.startsWith('room_')) {
            def.id = (rawName || `rm_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`).trim();
        }
        const baseId = def.id.trim();
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

    if (rBadge) rBadge.innerText = `${activeDefs.length} Rooms`;
    if (uBadge) uBadge.innerText = `${activeBeds.length} Beds Total`;

    return compiled;
}

export function renderRoomDefinitionsTable() {
    const tbody = document.getElementById('room-def-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    clusterDefinitionsByCategory();

    const definitions = window.roomDefinitions || [];
    const datalist = document.getElementById('setup-category-datalist');
    const categories = Array.from(new Set(definitions.map(r => r.category).filter(Boolean)));
    if (datalist) datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');

    let currentCat = null;
    let rowIndex = 0;

    definitions.forEach((room, idx) => {
        if (room.inactive) return;
        rowIndex++;

        // Folder Category Header matching Screenshot 3
        if (room.category !== currentCat) {
            currentCat = room.category;
            const sameCat = definitions.filter(r => !r.inactive && r.category === currentCat);
            const isDorm = sameCat.some(r => r.rule !== 'private');
            const totalUnits = isDorm
                ? sameCat.reduce((s, r) => s + parseInt(r.beds || r.units || 1, 10), 0)
                : sameCat.length;

            const banner = document.createElement('tr');
            banner.className = "setup-cat-banner";
            banner.innerHTML = `
                <td colspan="7" class="py-1 px-2.5 bg-slate-100 border-y border-slate-200">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i data-lucide="folder" size="14" class="text-slate-500"></i>
                            <span class="tracking-wide text-slate-900 font-black text-xs uppercase">${currentCat}</span>
                        </div>
                        <span class="text-[9.5px] bg-white text-slate-600 px-2 py-0.5 rounded-full font-bold border border-slate-200 shadow-2xs">
                            ${sameCat.length} ROOMS • ${totalUnits} TOTAL UNITS
                        </span>
                    </div>
                </td>`;
            tbody.appendChild(banner);
        }

        const sameCatActive = definitions.filter(r => !r.inactive && r.category === room.category);
        const posInCat = sameCatActive.findIndex(r => r === room);
        const isFirstInCat = posInCat === 0;
        const isLastInCat = posInCat === sameCatActive.length - 1;

        const tr = document.createElement('tr');
        tr.className = "bg-white hover:bg-slate-50/60 transition-colors border-b border-slate-200 text-xs";
        tr.innerHTML = `
            <td class="text-center py-1 px-1.5 font-mono text-[10px] text-slate-500">
                <div class="flex items-center justify-center gap-1">
                    <span class="font-bold w-4 text-center">${rowIndex}</span>
                    <div class="flex flex-col">
                        <button type="button" onclick="window.moveRoomWithinCategory(${idx}, -1)" class="text-slate-400 hover:text-slate-800 leading-none cursor-pointer ${isFirstInCat ? 'opacity-20 pointer-events-none' : ''}" title="Move Up">▲</button>
                        <button type="button" onclick="window.moveRoomWithinCategory(${idx}, 1)" class="text-slate-400 hover:text-slate-800 leading-none cursor-pointer ${isLastInCat ? 'opacity-20 pointer-events-none' : ''}" title="Move Down">▼</button>
                    </div>
                </div>
            </td>
            <td><input type="text" value="${room.name || ''}" class="table-input font-bold" onchange="window.roomDefinitions[${idx}].name = this.value.trim(); window.compileRoomsFromDefinitions();"></td>
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

    const inactive = definitions.filter(r => r.inactive);
    if (inactive.length > 0) {
        const headerTr = document.createElement('tr');
        headerTr.className = "bg-slate-100 border-y border-slate-300 text-slate-700 cursor-pointer select-none";
        headerTr.onclick = () => window.toggleInactiveRows();
        headerTr.innerHTML = `
            <td colspan="7" class="p-1.5 px-3 font-black text-xs uppercase tracking-wider">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i data-lucide="archive" size="14" class="text-amber-600"></i>
                        <span>ARCHIVED / INACTIVE ROOMS (${inactive.length})</span>
                    </div>
                    <i data-lucide="chevron-down" id="inactive-chevron" size="14" class="transition-transform duration-200 rotate-[-90deg]"></i>
                </div>
            </td>`;
        tbody.appendChild(headerTr);

        definitions.forEach((room, idx) => {
            if (!room.inactive) return;
            const tr = document.createElement('tr');
            tr.className = "inactive-room-row hidden bg-slate-50 border-b border-slate-200 text-slate-500";
            tr.innerHTML = `
                <td class="text-center font-mono font-bold text-rose-500 text-[10px]">OFF</td>
                <td><span class="font-bold line-through px-2">${room.name}</span></td>
                <td><span class="font-semibold text-xs px-2">${room.category}</span></td>
                <td class="text-center font-bold">${room.beds || 1}</td>
                <td class="text-center">Floor ${room.floor || '1'}</td>
                <td class="text-center"><span class="font-mono text-[10px] uppercase">${room.rule || 'private'}</span></td>
                <td class="text-center">
                    <button type="button" onclick="window.reactivateRoomDef(${idx})" class="btn-setup-save !py-0.5 !px-2 !text-[9px]">
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

let pendingDeleteAction = null;

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

        const titleEl = document.getElementById('delete-room-confirm-title');
        const msgEl = document.getElementById('delete-room-confirm-msg');
        const btnEl = document.getElementById('delete-room-confirm-btn');
        const modal = document.getElementById('delete-room-confirm-modal');

        if (pastBookings.length > 0) {
            if (titleEl) titleEl.innerText = "Archive Room (Has Booking History)";
            if (msgEl) msgEl.innerText = `"${def.name}" has ${pastBookings.length} historical booking(s). To preserve reports and past ledgers, this room will be marked ARCHIVED (INACTIVE) instead of permanently deleted.`;
            if (btnEl) {
                btnEl.innerText = "Archive Room";
                btnEl.className = "btn-setup-save !bg-amber-600 hover:!bg-amber-700 !text-[10px]";
            }
            pendingDeleteAction = () => {
                def.inactive = true;
                renderRoomDefinitionsTable();
            };
        } else {
            if (titleEl) titleEl.innerText = "Permanent Deletion";
            if (msgEl) msgEl.innerText = `Permanently delete "${def.name}"? This room has 0 bookings and will be removed immediately.`;
            if (btnEl) {
                btnEl.innerText = "Delete Permanently";
                btnEl.className = "btn-setup-save !bg-rose-600 hover:!bg-rose-700 !text-[10px]";
            }
            pendingDeleteAction = () => {
                window.roomDefinitions.splice(index, 1);
                renderRoomDefinitionsTable();
            };
        }

        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

    } catch (err) {
        console.error("[Room Audit Error]:", err);
        customAlert("Error", "Could not audit bookings: " + err.message);
    }
}

export function confirmRoomDeletion() {
    if (typeof pendingDeleteAction === 'function') {
        pendingDeleteAction();
        pendingDeleteAction = null;
    }
    closeRoomDeleteConfirmModal();
}

export function closeRoomDeleteConfirmModal() {
    const modal = document.getElementById('delete-room-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function openRelocationModal(def, futureBookings, hasPast) {
    const modal = document.getElementById('relocation-modal');
    const select = document.getElementById('relocate-target-room');
    const title = document.getElementById('relocation-title-badge');
    const msg = document.getElementById('relocation-msg-text');
    const actionBtn = document.getElementById('relocation-confirm-btn');

    const availableTargets = (window.roomDefinitions || []).filter(r => r.name !== def.name && !r.inactive);

    if (title) title.innerText = `Active Bookings Detected (${futureBookings.length})`;
    if (msg) msg.innerText = `Move these ${futureBookings.length} guest(s) before closing "${def.name}":`;
    if (select) {
        select.innerHTML = `<option value="__UNASSIGNED__">-- UNASSIGNED TRAY --</option>` +
            availableTargets.map(t => `<option value="${t.name}">${t.name} (${t.category})</option>`).join('');
    }
    if (actionBtn) {
        actionBtn.onclick = () => window.executeBookingRelocation(def.name, hasPast);
    }

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
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

        closeRelocationModal();
        renderRoomDefinitionsTable();
        customAlert("Relocation Complete", `Moved ${targetBookings.length} booking(s). Room "${roomName}" closed.`);

    } catch (e) {
        customAlert("Relocation Failed", e.message);
    }
}

export function openReorderCategoriesModal() {
    const modal = document.getElementById('reorder-categories-modal');
    const listEl = document.getElementById('reorder-cat-list');
    if (!modal || !listEl) return;

    const categories = Array.from(new Set((window.roomDefinitions || []).filter(r => !r.inactive).map(r => r.category.trim()).filter(Boolean)));

    listEl.innerHTML = categories.map((cat, idx) => `
        <div class="flex items-center justify-between p-2 rounded bg-white border border-slate-200 font-bold text-xs">
            <span>${cat}</span>
            <div class="flex items-center gap-1">
                <button type="button" onclick="window.moveCategory(${idx}, -1)" class="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer ${idx === 0 ? 'opacity-30' : ''}">▲</button>
                <button type="button" onclick="window.moveCategory(${idx}, 1)" class="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer ${idx === categories.length - 1 ? 'opacity-30' : ''}">▼</button>
            </div>
        </div>
    `).join('');

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

export function toggleBedPreviewDrawer() {
    const drawer = document.getElementById('bed-preview-drawer-modal');
    if (drawer && !drawer.classList.contains('hidden') && drawer.style.display !== 'none') {
        closeBedPreviewDrawer();
    } else {
        openBedPreviewDrawer();
    }
}

export function openBedPreviewDrawer() {
    compileRoomsFromDefinitions();
    const drawer = document.getElementById('bed-preview-drawer-modal');
    const container = document.getElementById('bed-preview-content');
    const countBadge = document.getElementById('bed-preview-count-badge');
    if (!drawer || !container) return;

    if (countBadge) countBadge.innerText = `${window.compiledRooms.length} Beds Total`;

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

    let html = '';
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
                let bedLabel = `№ ${String(bed.bedNumber || (bIdx + 1)).padStart(2, '0')}`;
                if (bed.id && bed.id.includes('№')) {
                    bedLabel = `№ ${bed.id.split('№')[1].trim()}`;
                }

                if (bed.bunk === 'top') {
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-emerald-300 bg-emerald-100 text-emerald-800 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">▲ TOP</span> ${bedLabel}
                        </span>`;
                } else if (bed.bunk === 'bottom') {
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-amber-300 bg-amber-100 text-amber-900 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">▼ BOT</span> ${bedLabel}
                        </span>`;
                } else {
                    html += `
                        <span class="px-2 py-1 rounded text-[10px] font-mono font-black border border-sky-300 bg-sky-100 text-sky-800 shadow-2xs flex items-center gap-1">
                            <span class="text-[9px]">● BED</span> ${bedLabel}
                        </span>`;
                }
            } else {
                html += `
                    <span class="px-2.5 py-1 rounded text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-2xs">
                        Private Unit
                    </span>`;
            }
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
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

let wizardState = {
    type: 'private',
    count: 1,
    category: '',
    floor: '1',
    dormBeds: 4,
    dormRule: 'odd-top',
    namingMode: 'prefix',
    prefix: 'Room ',
    startNum: 1,
    customNames: ''
};

export function openRoomCreatorWizard(initialType = 'private') {
    wizardState.type = initialType;
    const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
    wizardState.category = existingCats[0] || (initialType === 'dorm' ? 'Standard Quad Dorm' : 'Deluxe Room');
    wizardState.prefix = initialType === 'dorm' ? 'Dorm ' : 'Room ';

    const modal = document.getElementById('room-creator-wizard-modal');
    if (!modal) return;

    syncWizardUiToState();
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

export function setWizardType(type) {
    wizardState.type = type;
    wizardState.prefix = type === 'dorm' ? 'Dorm ' : 'Room ';
    syncWizardUiToState();
}

export function handleWizardCatSelect(val) {
    const newCatInput = document.getElementById('wiz-cat-new-input');
    if (val === '__NEW__') {
        wizardState.category = '';
        if (newCatInput) {
            newCatInput.classList.remove('hidden');
            newCatInput.focus();
        }
    } else {
        wizardState.category = val;
        if (newCatInput) newCatInput.classList.add('hidden');
    }
    updateWizardPreviewPills();
}

export function updateWizardState(key, val) {
    wizardState[key] = val;
    updateWizardPreviewPills();
}

function syncWizardUiToState() {
    const btnPriv = document.getElementById('wiz-btn-priv');
    const btnDorm = document.getElementById('wiz-btn-dorm');
    const dormSection = document.getElementById('wiz-dorm-options-section');
    const countInput = document.getElementById('wiz-count');
    const floorInput = document.getElementById('wiz-floor');
    const catSelect = document.getElementById('wiz-cat-select');
    const prefixInput = document.getElementById('wiz-prefix');
    const startNumInput = document.getElementById('wiz-start-num');
    const customNamesArea = document.getElementById('wiz-custom-names');
    const prefixBox = document.getElementById('wiz-prefix-box');
    const customBox = document.getElementById('wiz-custom-box');

    const isDorm = wizardState.type === 'dorm';

    if (btnPriv) btnPriv.className = `p-2 rounded font-black text-xs uppercase border cursor-pointer transition-colors ${!isDorm ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-300'}`;
    if (btnDorm) btnDorm.className = `p-2 rounded font-black text-xs uppercase border cursor-pointer transition-colors ${isDorm ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-300'}`;
    if (dormSection) dormSection.classList.toggle('hidden', !isDorm);

    if (countInput) countInput.value = wizardState.count;
    if (floorInput) floorInput.value = wizardState.floor;
    if (prefixInput) prefixInput.value = wizardState.prefix;
    if (startNumInput) startNumInput.value = wizardState.startNum;
    if (customNamesArea) customNamesArea.value = wizardState.customNames;

    if (prefixBox && customBox) {
        prefixBox.classList.toggle('hidden', wizardState.namingMode !== 'prefix');
        customBox.classList.toggle('hidden', wizardState.namingMode === 'prefix');
    }

    if (catSelect) {
        const existingCats = Array.from(new Set((window.roomDefinitions || []).map(r => r.category).filter(Boolean)));
        catSelect.innerHTML = existingCats.map(c => `<option value="${c}" ${c === wizardState.category ? 'selected' : ''}>${c}</option>`).join('') +
            `<option value="__NEW__">+ Enter New Category...</option>`;
    }

    updateWizardPreviewPills();
}

function getWizardNamesList() {
    const list = [];
    if (wizardState.namingMode === 'prefix') {
        const count = Math.max(1, wizardState.count || 1);
        const start = wizardState.startNum || 1;
        const prefix = wizardState.prefix || 'Room ';
        for (let i = 0; i < count; i++) {
            list.push(`${prefix}${start + i}`);
        }
    } else {
        const raw = (wizardState.customNames || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        list.push(...raw);
    }
    return list;
}

function updateWizardPreviewPills() {
    const container = document.getElementById('wiz-preview-pills');
    if (!container) return;

    const names = getWizardNamesList();
    const isDorm = wizardState.type === 'dorm';
    const beds = isDorm ? (wizardState.dormBeds || 4) : 1;

    if (names.length === 0) {
        container.innerHTML = `<span class="text-slate-400 italic text-[10px]">No rooms configured yet.</span>`;
        return;
    }

    container.innerHTML = names.map(n => `
        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white border border-slate-300 text-slate-700 shadow-2xs">
            ${n} <span class="text-indigo-600 font-normal">(${beds} ${isDorm ? 'beds' : 'bed'})</span>
        </span>
    `).join('');
}

export function executeWizardGenerate() {
    const names = getWizardNamesList();
    if (names.length === 0) return customAlert("Input Required", "Enter at least one room name.");

    const newCatVal = document.getElementById('wiz-cat-new-input')?.value.trim();
    const cat = newCatVal || (wizardState.category || '').trim() || (wizardState.type === 'dorm' ? 'Standard Dorm' : 'Standard Room');
    const floor = (wizardState.floor || '1').trim();
    const isDorm = wizardState.type === 'dorm';
    const beds = isDorm ? Math.max(1, parseInt(wizardState.dormBeds, 10) || 4) : 1;
    const rule = isDorm ? (wizardState.dormRule || 'odd-top') : 'private';

    window.roomDefinitions = window.roomDefinitions || [];

    names.forEach(name => {
        const uniqueId = `rm_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        window.roomDefinitions.push({
            id: uniqueId,
            name: name.trim(),
            category: cat,
            beds: beds,
            units: beds,
            floor: floor,
            rule: rule,
            inactive: false
        });
    });

    clusterDefinitionsByCategory();
    closeRoomCreatorWizard();
    renderRoomDefinitionsTable();
    customAlert("Rooms Created", `Added ${names.length} room(s) under "${cat}".`);
}

export function clearAllRoomDefs() {
    const titleEl = document.getElementById('delete-room-confirm-title');
    const msgEl = document.getElementById('delete-room-confirm-msg');
    const btnEl = document.getElementById('delete-room-confirm-btn');
    const modal = document.getElementById('delete-room-confirm-modal');

    if (titleEl) titleEl.innerText = "Clear All Room Inventory";
    if (msgEl) msgEl.innerText = "Permanently wipe all room definitions? This cannot be undone.";
    if (btnEl) {
        btnEl.innerText = "Wipe All Rooms";
        btnEl.className = "btn-setup-save !bg-rose-600 hover:!bg-rose-700 !text-[10px]";
    }
    pendingDeleteAction = () => {
        window.roomDefinitions = [];
        renderRoomDefinitionsTable();
    };

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

if (typeof window !== 'undefined') {
    window.formatDormBedId = formatDormBedId;
    window.compileRoomsFromDefinitions = compileRoomsFromDefinitions;
    window.renderRoomDefinitionsTable = renderRoomDefinitionsTable;
    window.moveRoomWithinCategory = moveRoomWithinCategory;
    window.toggleInactiveRows = toggleInactiveRows;
    window.reactivateRoomDef = reactivateRoomDef;
    window.deleteRoomDef = deleteRoomDef;
    window.confirmRoomDeletion = confirmRoomDeletion;
    window.closeRoomDeleteConfirmModal = closeRoomDeleteConfirmModal;
    window.openRelocationModal = openRelocationModal;
    window.closeRelocationModal = closeRelocationModal;
    window.executeBookingRelocation = executeBookingRelocation;
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
    window.clearAllRoomDefs = clearAllRoomDefs;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBedPreviewDrawer();
            closeRoomCreatorWizard();
            closeReorderCategoriesModal();
            closeRoomDeleteConfirmModal();
            closeRelocationModal();
            if (typeof window.closeNewPropertyModal === 'function') window.closeNewPropertyModal();
            if (typeof window.closeCreateRatePlanModal === 'function') window.closeCreateRatePlanModal();
        }
    });
}
