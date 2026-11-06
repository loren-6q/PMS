// ==========================================================================
// pms/pms-folio-actions.js - Folio Mutations (Save, Split, Merge, Delete, Dup)
// Wild & Wandering Property Management System
// ==========================================================================

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --- State, Store & Context Resolvers ---
const getDb = () => window.db;
const getAppId = () => window.appId || 'hotel-pms-v1';
const getStaff = () => window.staff || [];
const getHotelRooms = () => window.hotelRooms || [];
const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

// --- Active Property ID Resolver ---
const getPropId = () => {
    const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
    return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
};

// --------------------------------------------------------------------------
// 1. RESERVATION PERSISTENCE (SAVE / DELETE / DUPLICATE)
// --------------------------------------------------------------------------

// --- Master Save Reservation Engine ---
export const saveBooking = async (keepOpen = false) => {
    if (window.currentUserRole === 'staff') return;
    const sB = $('save-guest-btn') || $('save-btn');
    if (sB?.disabled) return;
    if (sB) { sB.disabled = true; sB.innerHTML = 'SAVING...'; }

    try {
        const cI = $('check-in')?.value, cO = $('check-out')?.value;
        if (cI >= cO) {
            if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
            if (window.lucide) window.lucide.createIcons();
            return window.showAlert ? window.showAlert("INVALID DATES:\nDeparture must be after arrival.") : alert("Invalid Dates");
        }

        const idI = $('guest-id');
        const id = idI?.value || Math.random().toString(36).substr(2, 9);
        if (idI) idI.value = id;

        const bId = $('booking-id')?.value.trim() || '';
        const curProp = getPropId();
        const linkCodeVal = $('link-code')?.value.trim().toUpperCase() || '';

        if (bId) {
            const dupe = getStaff().find(s => {
                const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                if (sProp !== curProp || s.bookId !== bId || s.id === id || !isOcc) return false;
                
                const parseFn = window.parseYMD || (str => Date.parse(str));
                const isLinked = linkCodeVal && s.linkedId && linkCodeVal === s.linkedId;
                const isContiguousOrSplit = parseFn(cI) >= parseFn(s.checkOut) || parseFn(cO) <= parseFn(s.checkIn);
                if (isLinked || isContiguousOrSplit) return false;

                return true;
            });
            if (dupe) {
                if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
                if (window.lucide) window.lucide.createIcons();
                if (window.closeModal) window.closeModal('email-modal');
                if (window.showAlert) {
                    window.showAlert(`Duplicate Blocked:\nBooking ID ${bId} already exists in the system!\n\nOpening original record now...`);
                    setTimeout(() => { if (window.closeAlert) window.closeAlert(); if (window.editStaff) window.editStaff(dupe.id); }, 2500);
                }
                return;
            }
        }

        const rL = Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean);
        const stat = $('guest-status-hidden')?.value || 'future';

        const isOccStatus = window.isOccupyingBooking ? window.isOccupyingBooking(stat) : (stat !== 'cancelled');

        if (isOccStatus) {
            const occupiedNow = window.getOccupiedRooms ? window.getOccupiedRooms(cI, cO, id) : new Set();
            const parseYMD = window.parseYMD || (s => Date.parse(s));
            for (let r of rL) {
                if (occupiedNow.has(r)) {
                    const conflictBooking = getStaff().find(s => {
                        if (s.id === id) return false;
                        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
                        if (sProp !== curProp) return false;
                        const isOcc = window.isOccupyingBooking ? window.isOccupyingBooking(s.status) : (s.status !== 'cancelled');
                        if (!isOcc) return false;
                        if (parseYMD(cI) >= parseYMD(s.checkOut) || parseYMD(cO) <= parseYMD(s.checkIn)) return false;
                        return getRooms(s).includes(r);
                    });
                    if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
                    if (window.lucide) window.lucide.createIcons();
                    return window.showAlert ? window.showAlert(`ROOM OVERLAP ERROR:\n\nRoom ${r} is already assigned to ${conflictBooking?.firstName || ''} ${conflictBooking?.lastName || 'another guest'} during these dates.`) : alert(`Room ${r} is occupied.`);
                }
            }
        }

        const ext = getStaff().find(s => s.id === id);
        const now = new Date().toISOString();
        const userEmail = window.currentUserEmail || 'admin';

        const ent = {
            id,
            property: curProp,
            firstName: $('first-name')?.value.trim().toUpperCase() || '',
            lastName: $('last-name')?.value.trim().toUpperCase() || '',
            status: stat,
            bookedType: $('booked-type')?.value || '',
            room: rL[0] || "",
            rooms: rL,
            checkIn: cI,
            checkOut: cO,
            pax: parseInt($('pax-count')?.value, 10) || 1,
            country: $('guest-country')?.value || '',
            phone: $('phone')?.value || '',
            email: $('email')?.value || '',
            source: $('booking-source')?.value || 'direct',
            bookDate: $('booking-date')?.value || '',
            bookId: $('booking-id')?.value || '',
            linkedId: linkCodeVal,
            totalPrice: Number($('total-price')?.value) || 0,
            netPrice: Number($('net-price')?.value) || 0,
            netOverride: $('net-price')?.dataset.override === 'true',
            badCC: $('bad-cc-box')?.dataset.bad === 'true',
            payments: Array.from($$('.payment-row') || []).map(r => ({
                date: r.querySelector('.pay-date')?.value || '',
                amt: Number(r.querySelector('.pay-amt')?.value) || 0,
                method: r.querySelector('.pay-method')?.value || 'cash'
            })),
            extraCharges: window.activeExtraCharges || [],
            emailConfirm: parseInt($('email-confirm-btn')?.dataset?.state || 0, 10),
            emailPrePost: parseInt($('email-prepost-btn')?.dataset?.state || 0, 10) > 0 ? (parseInt($('email-prepost-btn')?.dataset?.state, 10) === 1 ? 'sent' : 'confirmed') : false,
            emailSpecial: parseInt($('email-special-btn')?.dataset?.state || 0, 10) === 1,
            refundability: parseInt($('refund-btn')?.dataset?.state || 0, 10) === 1 ? 'non-ref' : (parseInt($('refund-btn')?.dataset?.state || 0, 10) === 2 ? 'ref' : 'unknown'),
            upgrade: parseInt($('upgrade-btn')?.dataset?.state || 0, 10) > 0 ? (parseInt($('upgrade-btn')?.dataset?.state, 10) === 1 ? 'free' : 'paid') : 'none',
            rating: parseInt($('rating-btn')?.dataset?.state || 0, 10) > 0 ? (parseInt($('rating-btn')?.dataset?.state, 10) === 1 ? 'good' : 'bad') : 'none',
            extended: parseInt($('ext-btn')?.dataset?.state || 0, 10) === 1,
            notes: $('guest-notes')?.value || '',
            createdAt: ext?.createdAt || now,
            createdBy: ext?.createdBy || userEmail,
            lastEditedAt: now,
            lastEditedBy: userEmail,
            auditLog: Array.isArray(ext?.auditLog) ? ext.auditLog : []
        };

        const diff = window.generateAuditDiff ? window.generateAuditDiff(ext, ent) : "Saved.";
        ent.auditLog.push({ ts: now, user: userEmail, msg: diff });

        const db = getDb();
        const appId = getAppId();
        
        let fsModule = window.fs;
        if (!fsModule || !fsModule.setDoc) {
            fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        }
        const { doc, setDoc } = fsModule;

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), ent);

        const hotelRooms = getHotelRooms();
        const bookingRoomTypes = Array.from(new Set([
            ...rL.map(rId => {
                const hr = hotelRooms.find(hr => hr.id === rId);
                return hr ? hr.type : null;
            }).filter(Boolean),
            $('booked-type')?.value,
            ext?.bookedType
        ])).filter(Boolean);

        const earliestIn = ext?.checkIn && ext.checkIn < cI ? ext.checkIn : cI;
        const latestOut = ext?.checkOut && ext.checkOut > cO ? ext.checkOut : cO;

        if (window.triggerAutoSync) window.triggerAutoSync(earliestIn, latestOut, bookingRoomTypes, ent);
        if (!keepOpen && window.closeGuestModal) window.closeGuestModal();
    } catch (err) {
        console.error("Save Error:", err);
        if (window.showAlert) window.showAlert("Save encountered an error. Please verify your connection.\n\nError: " + err.message);
    } finally {
        if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
        if (window.lucide) window.lucide.createIcons();
    }
};

// --- Permanently Delete Booking Record ---
export const requestDelete = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const curProp = getPropId();
    const s = getStaff().find(x => x.id === id);
    const name = s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Guest';

    const performDelete = async () => {
        const db = getDb();
        const appId = getAppId();
        let fsModule = window.fs;
        if (!fsModule || !fsModule.deleteDoc) {
            fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        }
        const { doc, deleteDoc } = fsModule;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
            if (window.triggerAutoSync && s) {
                const hotelRooms = getHotelRooms();
                const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
                window.triggerAutoSync(s.checkIn, s.checkOut, types, null, id);
            }
            if (window.closeGuestModal) window.closeGuestModal();
        } catch (err) {
            console.error("Delete Error:", err);
            if (window.showAlert) window.showAlert("Delete Error: " + err.message);
        }
    };

    if (window.showAlert) {
        window.showAlert(`Permanently delete booking for ${name} (${s?.bookId || id})?`, true, performDelete);
    } else {
        performDelete();
    }
};

// --- Clone Booking Details into New Reservation Form ---
export const requestDuplicate = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const s = getStaff().find(x => x.id === id);
    if (!s) return;

    const clone = JSON.parse(JSON.stringify(s));
    delete clone.id;
    delete clone.bookId;
    clone.status = 'future';
    clone.payments = [];
    clone.extraCharges = [];
    clone.notes = (clone.notes ? clone.notes + '\n' : '') + `[DUPLICATED FROM PREVIOUS BOOKING ${s.bookId || s.id}]`;

    if (window.populateStaffForm) window.populateStaffForm(clone);
    if (window.showAlert) window.showAlert("Booking details duplicated as a new reservation.\nPlease assign dates, room, and save.");
};

// --------------------------------------------------------------------------
// 2. STAY SEGMENTATION & SPLIT ACTIONS
// --------------------------------------------------------------------------

// --- Populate Room Options for Split Destination Leg ---
export const populateSplitRoomDropdown = (splitStart, splitEnd, excludeId) => {
    const container = $('split-room-dropdown-container');
    if (!container) return;
    const occ = window.getOccupiedRooms ? window.getOccupiedRooms(splitStart, splitEnd, excludeId) : new Set();
    const hotelRooms = getHotelRooms().filter(r => !r.inactive);

    let optHtml = `<label class="field-label text-left mb-1">Destination Room for Leg 2</label>
        <select id="split-room-target" class="input-base !text-xs !p-2 uppercase cursor-pointer">
        <option value="">-- AUTO SUGGEST / SAME TYPE --</option>`;

    let cg = '';
    hotelRooms.forEach(r => {
        if (r.type !== cg) {
            if (cg !== '') optHtml += `</optgroup>`;
            optHtml += `<optgroup label="--- ${r.type.toUpperCase()} ---">`;
            cg = r.type;
        }
        const isOccupied = occ.has(r.id);
        const bunkArrow = (r.bunk === 'top' || r.bed === 'top') ? ' ↑' : ((r.bunk === 'bottom' || r.bunk === 'bot' || r.bed === 'bottom' || r.bed === 'bot') ? ' ↓' : '');
        optHtml += `<option value="${r.id}" ${isOccupied ? 'disabled class="text-slate-400"' : 'class="font-bold"'}>${r.id}${bunkArrow}${isOccupied ? ' (OCCUPIED)' : ''}</option>`;
    });
    if (cg !== '') optHtml += `</optgroup>`;
    optHtml += `</select>`;
    container.innerHTML = optHtml;
};

// --- Open Stay Split Configuration Modal ---
export const requestSplit = () => {
    const id = $('guest-id')?.value;
    const cI = $('check-in')?.value;
    const cO = $('check-out')?.value;
    if (!id || !cI || !cO) return;

    const s = getStaff().find(x => x.id === id);
    const parseFn = window.parseYMD || (str => Date.parse(str));
    const ms = parseFn(cO) - parseFn(cI);
    const nights = Math.round(ms / 86400000);
    if (nights <= 1) return window.showAlert ? window.showAlert("Cannot split a 1-night stay.") : alert("Cannot split 1-night stay.");

    const dIn = new Date(cI + "T12:00:00Z");
    dIn.setUTCDate(dIn.getUTCDate() + Math.floor(nights / 2));
    const midYMD = dIn.toISOString().split('T')[0];

    const dateInp = $('split-date');
    if (dateInp) {
        dateInp.value = midYMD;
        dateInp.min = cI;
        dateInp.max = cO;
        dateInp.onchange = () => populateSplitRoomDropdown(dateInp.value, cO, id);
    }

    populateSplitRoomDropdown(midYMD, cO, id);

    const m = $('split-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
};

// --- Execute Stay Split & Generate Linked Leg Record ---
export const confirmSplit = async () => {
    const id = $('guest-id')?.value;
    const splitDate = $('split-date')?.value;
    const chosenRoom = $('split-room-target')?.value;
    if (!id || !splitDate) return;

    const s = getStaff().find(x => x.id === id);
    if (!s) return;
    if (splitDate <= s.checkIn || splitDate >= s.checkOut) {
        return window.showAlert ? window.showAlert("Split date must be between Check-in and Check-out.") : alert("Invalid split date");
    }

    const parseFn = window.parseYMD || (str => Date.parse(str));
    const totalNights = Math.max(1, Math.round((parseFn(s.checkOut) - parseFn(s.checkIn)) / 86400000));
    const leg1Nights = Math.max(1, Math.round((parseFn(splitDate) - parseFn(s.checkIn)) / 86400000));
    const leg2Nights = Math.max(1, totalNights - leg1Nights);

    const leg1Price = Number(((s.totalPrice / totalNights) * leg1Nights).toFixed(2));
    const leg2Price = Number((s.totalPrice - leg1Price).toFixed(2));

    const linkCode = s.linkedId || `LK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const db = getDb();
    const appId = getAppId();
    let fsModule = window.fs;
    if (!fsModule || !fsModule.setDoc) {
        fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    }
    const { doc, setDoc, updateDoc } = fsModule;
    const newLegId = Math.random().toString(36).substr(2, 9);
    const curProp = getPropId();

    let leg2Room = chosenRoom;
    if (!leg2Room) {
        const occ = window.getOccupiedRooms ? window.getOccupiedRooms(splitDate, s.checkOut, id) : new Set();
        const hotelRooms = getHotelRooms();
        const freeRoom = hotelRooms.find(r => !r.inactive && r.type === (s.bookedType || '') && !occ.has(r.id));
        leg2Room = freeRoom ? freeRoom.id : (s.rooms?.[0] || "");
    }

    const leg2Booking = {
        ...JSON.parse(JSON.stringify(s)),
        id: newLegId,
        property: curProp,
        checkIn: splitDate,
        checkOut: s.checkOut,
        rooms: leg2Room ? [leg2Room] : [],
        room: leg2Room || "",
        totalPrice: leg2Price,
        netPrice: Number((leg2Price * 0.82).toFixed(2)),
        payments: [],
        extraCharges: [],
        linkedId: linkCode,
        notes: (s.notes ? s.notes + '\n' : '') + `[SPLIT SEGMENT - LEG 2 FROM ${s.checkIn} STAY]`,
        createdAt: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: splitDate,
            totalPrice: leg1Price,
            netPrice: Number((leg1Price * 0.82).toFixed(2)),
            linkedId: linkCode,
            lastEditedAt: new Date().toISOString(),
            notes: (s.notes ? s.notes + '\n' : '') + `[SPLIT SEGMENT - LEG 1 ENDS ${splitDate}]`
        });

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newLegId), leg2Booking);

        if (window.triggerAutoSync) {
            const hotelRooms = getHotelRooms();
            const types = [...(s.rooms || []), leg2Room].map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
            window.triggerAutoSync(s.checkIn, s.checkOut, types);
        }

        if (window.closeModal) window.closeModal('split-modal');
        if (window.closeGuestModal) window.closeGuestModal();
        if (window.showAlert) window.showAlert(`Booking split successfully!\n\nLeg 1: ${s.checkIn} → ${splitDate}\nLeg 2: ${splitDate} → ${s.checkOut} (Room: ${leg2Room || 'Same'})\n\nLinked with code: ${linkCode}`);
    } catch (err) {
        console.error("Split Error:", err);
        if (window.showAlert) window.showAlert("Error splitting booking: " + err.message);
    }
};

// --------------------------------------------------------------------------
// 3. CONTIGUOUS RESERVATION MERGE ACTIONS
// --------------------------------------------------------------------------

// --- Search & Display Adjacent Bookings to Merge ---
export const requestMerge = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const cur = getStaff().find(x => x.id === id);
    if (!cur) return;

    const curProp = getPropId();
    const parseFn = window.parseYMD || (str => Date.parse(str));
    const curIn = parseFn(cur.checkIn);
    const curOut = parseFn(cur.checkOut);

    const candidates = getStaff().filter(s => {
        if (s.id === id) return false;
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return false;
        if (s.status === 'cancelled' || s.status === 'noshow') return false;

        const sIn = parseFn(s.checkIn);
        const sOut = parseFn(s.checkOut);
        const isAdjacentBefore = Math.abs(sOut - curIn) <= (2 * 86400000);
        const isAdjacentAfter = Math.abs(sIn - curOut) <= (2 * 86400000);
        const sharesLink = cur.linkedId && s.linkedId && cur.linkedId === s.linkedId;
        const sharesName = cur.lastName && s.lastName && cur.lastName.toUpperCase() === s.lastName.toUpperCase();

        return isAdjacentBefore || isAdjacentAfter || sharesLink || sharesName;
    });

    if (candidates.length === 0) {
        return window.showAlert ? window.showAlert("No adjacent or matching bookings found nearby to merge with.") : alert("No candidates to merge");
    }

    candidates.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (a.linkedId && a.linkedId === cur.linkedId) scoreA += 50;
        if (b.linkedId && b.linkedId === cur.linkedId) scoreB += 50;
        if (a.lastName && a.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
        if (b.lastName && b.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
        if (parseFn(a.checkOut) === curIn || parseFn(a.checkIn) === curOut) scoreA += 40;
        if (parseFn(b.checkOut) === curIn || parseFn(b.checkIn) === curOut) scoreB += 40;
        return scoreB - scoreA;
    });

    const targetSelect = $('merge-target');
    if (targetSelect) {
        targetSelect.innerHTML = candidates.map((c, idx) => {
            const isBest = idx === 0;
            const rStr = (c.rooms || []).join(',') || c.room || 'No Room';
            return `<option value="${c.id}">${isBest ? '⭐ ' : ''}${c.lastName || 'Guest'}, ${c.firstName || ''} (${c.checkIn} to ${c.checkOut}) [${rStr}]</option>`;
        }).join('');
    }

    const m = $('merge-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
};

// --- Execute Contiguous Merge & Absorb Target Stay ---
export const confirmMerge = async () => {
    const id = $('guest-id')?.value;
    const targetId = $('merge-target')?.value;
    if (!id || !targetId) return;

    const primary = getStaff().find(x => x.id === id);
    const absorbed = getStaff().find(x => x.id === targetId);
    if (!primary || !absorbed) return;

    const combinedPayments = [...(primary.payments || []), ...(absorbed.payments || [])];
    const combinedCharges = [...(primary.extraCharges || []), ...(absorbed.extraCharges || [])];
    const combinedTotal = Number(((primary.totalPrice || 0) + (absorbed.totalPrice || 0)).toFixed(2));
    const combinedNet = Number(((primary.netPrice || 0) + (absorbed.netPrice || 0)).toFixed(2));

    const earliestIn = primary.checkIn < absorbed.checkIn ? primary.checkIn : absorbed.checkIn;
    const latestOut = primary.checkOut > absorbed.checkOut ? primary.checkOut : absorbed.checkOut;

    const mergeNote = `\n\n[MERGED WITH BOOKING ${absorbed.bookId || absorbed.id} on ${new Date().toLocaleDateString('en-GB')}]\n` +
                      `• Absorbed Dates: ${absorbed.checkIn} to ${absorbed.checkOut}\n` +
                      `• Absorbed Room: ${(absorbed.rooms || []).join(',') || absorbed.room}\n` +
                      `• Absorbed Total: ฿${absorbed.totalPrice || 0}\n` +
                      (absorbed.notes ? `• Absorbed Notes: ${absorbed.notes}` : '');

    const db = getDb();
    const appId = getAppId();
    let fsModule = window.fs;
    if (!fsModule || !fsModule.updateDoc) {
        fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    }
    const { doc, updateDoc, deleteDoc } = fsModule;

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkIn: earliestIn,
            checkOut: latestOut,
            totalPrice: combinedTotal,
            netPrice: combinedNet,
            payments: combinedPayments,
            extraCharges: combinedCharges,
            extended: true,
            notes: ((primary.notes || '') + mergeNote).trim(),
            lastEditedAt: new Date().toISOString()
        });

        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId));

        if (window.triggerAutoSync) {
            const hotelRooms = getHotelRooms();
            const types = [...(primary.rooms || []), ...(absorbed.rooms || [])].map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
            window.triggerAutoSync(earliestIn, latestOut, types);
        }

        if (window.closeModal) window.closeModal('merge-modal');
        if (window.closeGuestModal) window.closeGuestModal();
        if (window.showAlert) window.showAlert(`Bookings successfully merged into ${primary.bookId || id}!\n\nNew Stay: ${earliestIn} to ${latestOut}\nTotal: ฿${combinedTotal}`);
    } catch (err) {
        console.error("Merge Error:", err);
        if (window.showAlert) window.showAlert("Error merging bookings: " + err.message);
    }
};

// --------------------------------------------------------------------------
// 4. EARLY DEPARTURE & REVERSAL CONTROLLERS
// --------------------------------------------------------------------------

let currentEcoBooking = null;
let currentEcoStayedAmt = 0;
let currentEcoUnstayedAmt = 0;
let currentEcoStayedNts = 0;
let currentEcoUnstayedNts = 0;

// --- Open Early Checkout Modal ---
export const requestEarlyCheckout = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const s = getStaff().find(x => x.id === id);
    if (!s) return;

    const todayStr = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
    if (s.checkOut <= s.checkIn) {
        return window.customAlert ? window.customAlert("Invalid Stay", "Booking check-out is already on or before check-in.") : null;
    }

    currentEcoBooking = s;

    // Populate modal headers
    const nameEl = $('eco-guest-name');
    const idEl = $('eco-booking-id');
    const datesEl = $('eco-stay-dates');
    const dateInput = $('eco-date');

    if (nameEl) nameEl.innerText = `${s.firstName || ''} ${s.lastName || 'GUEST'}`.trim();
    if (idEl) idEl.innerText = s.bookId || s.id;
    if (datesEl) datesEl.innerText = `${s.checkIn} → ${s.checkOut}`;

    if (dateInput) {
        dateInput.min = s.checkIn;
        const maxDate = new Date(s.checkOut + "T12:00:00Z");
        maxDate.setUTCDate(maxDate.getUTCDate() - 1);
        dateInput.max = maxDate.toISOString().split('T')[0];

        if (todayStr >= s.checkIn && todayStr < s.checkOut) {
            dateInput.value = todayStr;
        } else {
            dateInput.value = dateInput.max;
        }
    }

    recalcEarlyCheckoutModal();

    const m = $('early-checkout-modal');
    if (m) {
        m.classList.add('active');
        m.style.display = 'flex';
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
};

// --- Recalculate Live Stayed vs Unstayed Breakdown ---
export const recalcEarlyCheckoutModal = () => {
    if (!currentEcoBooking) return;
    const s = currentEcoBooking;
    const targetOut = $('eco-date')?.value;
    if (!targetOut) return;

    const parseFn = window.parseYMD || (str => Date.parse(str));
    const totalNights = Math.max(1, Math.round((parseFn(s.checkOut) - parseFn(s.checkIn)) / 86400000));
    const stayedNights = Math.max(0, Math.round((parseFn(targetOut) - parseFn(s.checkIn)) / 86400000));
    const unstayedNights = Math.max(0, totalNights - stayedNights);

    currentEcoStayedNts = stayedNights;
    currentEcoUnstayedNts = unstayedNights;

    const hasItemized = Array.isArray(s.nightlyRates) && s.nightlyRates.length > 0;
    let stayedAmt = 0;
    let unstayedAmt = 0;

    if (hasItemized) {
        stayedAmt = s.nightlyRates
            .filter(r => r.date >= s.checkIn && r.date < targetOut)
            .reduce((sum, r) => sum + (parseFloat(r.rate) || 0), 0);
        unstayedAmt = s.nightlyRates
            .filter(r => r.date >= targetOut && r.date < s.checkOut)
            .reduce((sum, r) => sum + (parseFloat(r.rate) || 0), 0);
        stayedAmt = Number(stayedAmt.toFixed(2));
        unstayedAmt = Number(unstayedAmt.toFixed(2));
    } else {
        const curTotal = parseFloat(s.totalPrice) || 0;
        const avg = curTotal / totalNights;
        unstayedAmt = Number((avg * unstayedNights).toFixed(2));
        stayedAmt = Number((curTotal - unstayedAmt).toFixed(2));
    }

    currentEcoStayedAmt = stayedAmt;
    currentEcoUnstayedAmt = unstayedAmt;

    if ($('eco-stayed-nts')) $('eco-stayed-nts').innerText = stayedNights;
    if ($('eco-stayed-amt')) $('eco-stayed-amt').innerText = `฿${stayedAmt.toLocaleString()}`;
    if ($('eco-unstayed-nts')) $('eco-unstayed-nts').innerText = unstayedNights;
    if ($('eco-unstayed-amt')) $('eco-unstayed-amt').innerText = `฿${unstayedAmt.toLocaleString()}`;
    if ($('eco-rate-note')) $('eco-rate-note').innerText = hasItemized ? 'Calculated using itemized daily rates' : 'Calculated using average daily rate';
    if ($('eco-btn-refund-sub')) $('eco-btn-refund-sub').innerText = `Deduct ฿${unstayedAmt.toLocaleString()}`;
};

// --- Execute Early Checkout (Refund or Penalty) ---
export const confirmEarlyCheckout = async (mode) => {
    if (!currentEcoBooking) return;
    const targetOut = $('eco-date')?.value;
    if (!targetOut) return;

    const id = currentEcoBooking.id;
    const s = getStaff().find(x => x.id === id) || currentEcoBooking;

    const todayStr = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
    const originalTotal = parseFloat(s.totalPrice) || 0;
    const db = getDb();
    const appId = getAppId();

    let fsModule = window.fs;
    if (!fsModule || !fsModule.updateDoc) {
        fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    }
    const { doc, updateDoc } = fsModule;

    // Filter out any preexisting penalty before appending
    let extraCharges = (Array.isArray(s.extraCharges) ? [...s.extraCharges] : [])
        .filter(c => !c.desc?.includes('EARLY DEPARTURE PENALTY'));

    let newTotalPrice = originalTotal;
    let penaltyId = null;

    if (mode === 'refund') {
        // Mode A: Room charges reduced to stayed nights only
        newTotalPrice = currentEcoStayedAmt;
    } else {
        // Mode B: Full charge retained. Room is Stayed Portion, difference itemized as Penalty Fee
        newTotalPrice = originalTotal;
        penaltyId = 'ec_penalty_' + Date.now();
        extraCharges.push({
            id: penaltyId,
            desc: `EARLY DEPARTURE PENALTY (${currentEcoUnstayedNts} NT${currentEcoUnstayedNts === 1 ? '' : 'S'})`,
            amount: currentEcoUnstayedAmt,
            amt: currentEcoUnstayedAmt,
            date: targetOut
        });
    }

    const earlySnapshot = {
        originalCheckOut: s.checkOut,
        originalTotalPrice: originalTotal,
        departureDate: targetOut,
        stayedNights: currentEcoStayedNts,
        unstayedNights: currentEcoUnstayedNts,
        unstayedAmount: currentEcoUnstayedAmt,
        stayedAmount: currentEcoStayedAmt,
        mode: mode,
        penaltyId: penaltyId,
        ts: new Date().toISOString()
    };

    const noteMsg = `\n[EARLY CHECKOUT on ${todayStr}] Departed on ${targetOut} (${currentEcoUnstayedNts} nts early, original departure: ${s.checkOut}). ` +
        (mode === 'refund' 
            ? `Deducted ฿${currentEcoUnstayedAmt.toLocaleString()} unstayed room charges. New Folio Total: ฿${newTotalPrice.toLocaleString()}.` 
            : `Kept full charge of ฿${originalTotal.toLocaleString()} (฿${currentEcoStayedAmt.toLocaleString()} room + ฿${currentEcoUnstayedAmt.toLocaleString()} penalty fee).`);

    const updatedNotes = ((s.notes || '') + noteMsg).trim();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: targetOut,
            status: 'early',
            totalPrice: newTotalPrice,
            extraCharges: extraCharges,
            earlyCheckout: earlySnapshot,
            notes: updatedNotes,
            lastEditedAt: new Date().toISOString()
        });

        if (window.triggerAutoSync) {
            const hotelRooms = getHotelRooms();
            const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
            window.triggerAutoSync(targetOut, s.checkOut, types);
        }

        // Synchronize in-memory objects and active form immediately
        s.checkOut = targetOut;
        s.status = 'early';
        s.totalPrice = newTotalPrice;
        s.extraCharges = extraCharges;
        s.earlyCheckout = earlySnapshot;
        s.notes = updatedNotes;
        window.activeExtraCharges = [...extraCharges];

        if (window.closeModal) window.closeModal('early-checkout-modal');
        if (window.openGuestModal) window.openGuestModal(s);
        if ($('guest-notes')) $('guest-notes').value = updatedNotes;
        if (window.renderExtraCharges) window.renderExtraCharges();
        if (window.calcFinancials) window.calcFinancials();

        if (window.showToast) {
            window.showToast(
                "Early Checkout", 
                `Departed on ${targetOut}. ${mode === 'refund' ? `Deducted ฿${currentEcoUnstayedAmt.toLocaleString()}` : `Itemized ฿${currentEcoUnstayedAmt.toLocaleString()} penalty fee`}.`
            );
        }
    } catch (err) {
        console.error("Early Checkout Error:", err);
        if (window.customAlert) window.customAlert("Error", "Error processing early checkout: " + err.message);
    }
};

// --- Revert Early Checkout (With Collision Check & Penalty Removal) ---
export const undoEarlyCheckout = async () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const s = getStaff().find(x => x.id === id);
    if (!s || !s.earlyCheckout) return;

    const originalOut = s.earlyCheckout.originalCheckOut;
    const originalTotal = s.earlyCheckout.originalTotalPrice !== undefined ? s.earlyCheckout.originalTotalPrice : s.totalPrice;
    const penaltyId = s.earlyCheckout.penaltyId;
    const rL = s.rooms || [s.room];

    const occ = window.getOccupiedRooms ? window.getOccupiedRooms(s.checkOut, originalOut, id) : new Set();
    for (let r of rL) {
        if (occ.has(r)) {
            return window.customAlert ? window.customAlert("Collision Detected", `Cannot revert early checkout. Room ${r} is already occupied between ${s.checkOut} and ${originalOut}.`) : null;
        }
    }

    const todayStr = window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0];
    const db = getDb();
    const appId = getAppId();
    let fsModule = window.fs;
    if (!fsModule || !fsModule.updateDoc) {
        fsModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    }
    const { doc, updateDoc } = fsModule;

    // Purge penalty charges from extra charges
    let extraCharges = (Array.isArray(s.extraCharges) ? [...s.extraCharges] : [])
        .filter(c => c.id !== penaltyId && !c.desc?.includes('EARLY DEPARTURE PENALTY'));

    const revertMsg = `\n[EARLY CHECKOUT REVERTED on ${todayStr}] Restored original departure ${originalOut} and total ฿${originalTotal.toLocaleString()}.`;
    const updatedNotes = ((s.notes || '') + revertMsg).trim();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: originalOut,
            status: 'here',
            totalPrice: originalTotal,
            extraCharges: extraCharges,
            earlyCheckout: null,
            notes: updatedNotes,
            lastEditedAt: new Date().toISOString()
        });

        if (window.triggerAutoSync) {
            const hotelRooms = getHotelRooms();
            const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
            window.triggerAutoSync(s.checkOut, originalOut, types);
        }

        // Synchronize in-memory objects and active form immediately
        s.checkOut = originalOut;
        s.status = 'here';
        s.totalPrice = originalTotal;
        s.extraCharges = extraCharges;
        s.earlyCheckout = null;
        s.notes = updatedNotes;
        window.activeExtraCharges = [...extraCharges];

        if (window.openGuestModal) window.openGuestModal(s);
        if ($('guest-notes')) $('guest-notes').value = updatedNotes;
        if (window.renderExtraCharges) window.renderExtraCharges();
        if (window.calcFinancials) window.calcFinancials();

        if (window.showToast) {
            window.showToast("Restored", `Early checkout reverted. Stay restored to ${originalOut}.`);
        }
    } catch (err) {
        console.error("Undo Early Checkout Error:", err);
        if (window.customAlert) window.customAlert("Error", "Error reverting early checkout: " + err.message);
    }
};

// --------------------------------------------------------------------------
// 5. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

window.saveBooking = saveBooking;
window.requestDelete = requestDelete;
window.requestDuplicate = requestDuplicate;
window.requestSplit = requestSplit;
window.confirmSplit = confirmSplit;
window.requestMerge = requestMerge;
window.confirmMerge = confirmMerge;
window.populateSplitRoomDropdown = populateSplitRoomDropdown;
window.requestEarlyCheckout = requestEarlyCheckout;
window.recalcEarlyCheckoutModal = recalcEarlyCheckoutModal;
window.confirmEarlyCheckout = confirmEarlyCheckout;
window.undoEarlyCheckout = undoEarlyCheckout;
