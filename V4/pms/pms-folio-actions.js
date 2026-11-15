// ==========================================================================
// pms/pms-folio-actions.js - Folio Mutations (Save, Split, Merge, Delete, Dup)
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { toCanonicalPropId } from '../core/properties.js';
import { isOccupyingBooking } from '../core/occupancy.js';
import { customAlert } from '../core/ui-dialogs.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --- State, Store & Context Resolvers ---
const getStaff = () => window.staff || [];
const getHotelRooms = () => window.hotelRooms || [];
const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));
const getPropId = () => toCanonicalPropId(window.currentPropertyId || 'swims_resort');

// --------------------------------------------------------------------------
// 1. RESERVATION PERSISTENCE (SAVE / DELETE / DUPLICATE)
// --------------------------------------------------------------------------

export const saveBooking = async (keepOpen = false) => {
    if (window.currentUserRole === 'staff') return;
    const sB = $('save-booking-btn') || $('save-guest-btn') || $('save-btn');
    if (sB?.disabled) return;
    if (sB) { sB.disabled = true; sB.innerHTML = 'SAVING...'; }

    try {
        const cI = $('check-in')?.value;
        const cO = $('check-out')?.value;
        if (!cI || !cO || cI >= cO) {
            if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
            if (window.lucide) window.lucide.createIcons();
            return customAlert("Invalid Dates", "Departure date must be after arrival date.");
        }

        const idI = $('guest-id');
        const id = idI?.value || Math.random().toString(36).substr(2, 9);
        if (idI) idI.value = id;

        const bId = $('booking-id')?.value.trim() || '';
        const curProp = getPropId();
        const linkCodeVal = $('link-code')?.value.trim().toUpperCase() || '';

        // Prevent Duplicate Booking IDs
        if (bId) {
            const dupe = getStaff().find(s => {
                if (toCanonicalPropId(s.property) !== curProp || s.bookId !== bId || s.id === id) return false;
                if (!isOccupyingBooking(s.status, true)) return false;

                const isLinked = linkCodeVal && s.linkedId && linkCodeVal === s.linkedId;
                const isContiguousOrSplit = parseYMD(cI) >= parseYMD(s.checkOut) || parseYMD(cO) <= parseYMD(s.checkIn);
                return !(isLinked || isContiguousOrSplit);
            });

            if (dupe) {
                if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
                if (window.lucide) window.lucide.createIcons();
                customAlert("Duplicate Blocked", `Booking ID ${bId} already exists in the system!\n\nOpening original record now...`);
                setTimeout(() => { if (window.editStaff) window.editStaff(dupe.id); }, 2000);
                return;
            }
        }

        const rawRooms = Array.from($$('.assigned-room-select') || []).map(sel => sel.value.trim());
        const rL = rawRooms.length > 0 ? rawRooms : [""];
        const assignedRooms = rL.filter(Boolean);
        const rawStat = $('guest-status-hidden')?.value || 'future';
        const stat = rawStat === 'noshow' ? 'no-show' : rawStat;

        // Room Overlap Collision Guard
        if (assignedRooms.length > 0 && isOccupyingBooking(stat, true)) {
            const occupiedNow = window.getOccupiedRooms ? window.getOccupiedRooms(cI, cO, id) : new Set();
            for (let r of assignedRooms) {
                if (occupiedNow.has(r.toUpperCase())) {
                    const conflict = getStaff().find(s => {
                        if (s.id === id || toCanonicalPropId(s.property) !== curProp) return false;
                        if (!isOccupyingBooking(s.status, true)) return false;
                        if (parseYMD(cI) >= parseYMD(s.checkOut) || parseYMD(cO) <= parseYMD(s.checkIn)) return false;
                        return getRooms(s).includes(r);
                    });
                    if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
                    if (window.lucide) window.lucide.createIcons();
                    return customAlert("Room Overlap", `Room ${r} is already assigned to ${conflict?.firstName || ''} ${conflict?.lastName || 'another guest'} during these dates.`);
                }
            }
        }

        const ext = getStaff().find(s => s.id === id);
        const now = new Date().toISOString();
        const userEmail = (window.currentUserEmail || 'admin').toUpperCase();

        const refState = parseInt($('refund-btn')?.dataset?.state || 0, 10);
        const refundabilityVal = refState === 1 ? 'non-ref' : (refState === 2 ? 'ref' : '');

        const ent = {
            id,
            property: curProp,
            firstName: $('first-name')?.value.trim().toUpperCase() || '',
            lastName: $('last-name')?.value.trim().toUpperCase() || '',
            status: stat,
            bookedType: $('booked-type')?.value || '',
            room: assignedRooms[0] || "",
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
            refundability: refundabilityVal,
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

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), ent);

        const hotelRooms = getHotelRooms();
        const bookingRoomTypes = Array.from(new Set([
            ...assignedRooms.map(rId => { const hr = hotelRooms.find(h => h.id === rId); return hr?.category || hr?.type; }).filter(Boolean),
            $('booked-type')?.value,
            ext?.bookedType
        ])).filter(Boolean);

        const earliestIn = ext?.checkIn && ext.checkIn < cI ? ext.checkIn : cI;
        const latestOut = ext?.checkOut && ext.checkOut > cO ? ext.checkOut : cO;

        if (window.triggerAutoSync) window.triggerAutoSync(earliestIn, latestOut, bookingRoomTypes, ent);
        if (!keepOpen && window.closeGuestModal) window.closeGuestModal();
    } catch (err) {
        console.error("Save Error:", err);
        customAlert("Save Error", "Save encountered an error. Please verify your connection.\n\n" + err.message);
    } finally {
        if (sB) { sB.disabled = false; sB.innerHTML = '<i data-lucide="check" size="14"></i> <span>SAVE</span>'; }
        if (window.lucide) window.lucide.createIcons();
    }
};

export const requestDelete = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const s = getStaff().find(x => x.id === id);
    const name = s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Guest';

    customAlert(
        "Delete Booking",
        `Permanently delete booking for ${name} (${s?.bookId || id})? This cannot be undone.`,
        true,
        async () => {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
                if (window.triggerAutoSync && s) {
                    const hotelRooms = getHotelRooms();
                    const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
                    window.triggerAutoSync(s.checkIn, s.checkOut, types, null, id);
                }
                if (window.closeGuestModal) window.closeGuestModal();
                if (window.showToast) window.showToast("Deleted", `Booking ${s?.bookId || id} removed.`);
            } catch (err) {
                console.error("Delete Error:", err);
                customAlert("Delete Error", err.message);
            }
        }
    );
};

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

    if (window.populateFolioForm) window.populateFolioForm(clone);
    customAlert("Duplicated", "Booking cloned as a new reservation. Assign dates, room, and save.");
};

// --------------------------------------------------------------------------
// 2. STAY SEGMENTATION & SPLIT ACTIONS
// --------------------------------------------------------------------------

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

export const requestSplit = () => {
    const id = $('guest-id')?.value;
    const cI = $('check-in')?.value;
    const cO = $('check-out')?.value;
    if (!id || !cI || !cO) return;

    const ms = parseYMD(cO) - parseYMD(cI);
    const nights = Math.round(ms / 86400000);
    if (nights <= 1) return customAlert("Cannot Split", "Cannot split a 1-night stay.");

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

export const confirmSplit = async () => {
    const id = $('guest-id')?.value;
    const splitDate = $('split-date')?.value;
    const chosenRoom = $('split-room-target')?.value;
    if (!id || !splitDate) return;

    const s = getStaff().find(x => x.id === id);
    if (!s) return;
    if (splitDate <= s.checkIn || splitDate >= s.checkOut) {
        return customAlert("Invalid Split Date", "Split date must be between Check-in and Check-out.");
    }

    const totalNights = Math.max(1, Math.round((parseYMD(s.checkOut) - parseYMD(s.checkIn)) / 86400000));
    const leg1Nights = Math.max(1, Math.round((parseYMD(splitDate) - parseYMD(s.checkIn)) / 86400000));
    const leg2Nights = Math.max(1, totalNights - leg1Nights);

    const leg1Price = Number(((s.totalPrice / totalNights) * leg1Nights).toFixed(2));
    const leg2Price = Number((s.totalPrice - leg1Price).toFixed(2));

    const linkCode = s.linkedId || `LK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
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
        customAlert("Split Complete", `Booking split successfully!\n\nLeg 1: ${s.checkIn} → ${splitDate}\nLeg 2: ${splitDate} → ${s.checkOut} (Room: ${leg2Room || 'Same'})\n\nLinked with code: ${linkCode}`);
    } catch (err) {
        console.error("Split Error:", err);
        customAlert("Split Error", err.message);
    }
};

// --------------------------------------------------------------------------
// 3. CONTIGUOUS RESERVATION MERGE ACTIONS
// --------------------------------------------------------------------------

export const requestMerge = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const cur = getStaff().find(x => x.id === id);
    if (!cur) return;

    const curProp = getPropId();
    const curIn = parseYMD(cur.checkIn);
    const curOut = parseYMD(cur.checkOut);

    const candidates = getStaff().filter(s => {
        if (s.id === id || toCanonicalPropId(s.property) !== curProp) return false;
        if (!isOccupyingBooking(s.status, true)) return false;

        const sIn = parseYMD(s.checkIn);
        const sOut = parseYMD(s.checkOut);
        const isAdjacentBefore = Math.abs(sOut - curIn) <= (2 * 86400000);
        const isAdjacentAfter = Math.abs(sIn - curOut) <= (2 * 86400000);
        const sharesLink = cur.linkedId && s.linkedId && cur.linkedId === s.linkedId;
        const sharesName = cur.lastName && s.lastName && cur.lastName.toUpperCase() === s.lastName.toUpperCase();

        return isAdjacentBefore || isAdjacentAfter || sharesLink || sharesName;
    });

    if (candidates.length === 0) {
        return customAlert("No Bookings Found", "No adjacent or matching bookings found nearby to merge with.");
    }

    candidates.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (a.linkedId && a.linkedId === cur.linkedId) scoreA += 50;
        if (b.linkedId && b.linkedId === cur.linkedId) scoreB += 50;
        if (a.lastName && a.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
        if (b.lastName && b.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
        if (parseYMD(a.checkOut) === curIn || parseYMD(a.checkIn) === curOut) scoreA += 40;
        if (parseYMD(b.checkOut) === curIn || parseYMD(b.checkIn) === curOut) scoreB += 40;
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
        customAlert("Merge Complete", `Bookings successfully merged into ${primary.bookId || id}!\n\nNew Stay: ${earliestIn} to ${latestOut}\nTotal: ฿${combinedTotal}`);
    } catch (err) {
        console.error("Merge Error:", err);
        customAlert("Merge Error", err.message);
    }
};

// --------------------------------------------------------------------------
// 4. EARLY DEPARTURE & REVERSAL CONTROLLERS
// --------------------------------------------------------------------------

let currentEcoBooking = null;

function calculateStayMath(booking, targetOutDate) {
    const originalOut = (booking.earlyCheckout && booking.earlyCheckout.originalCheckOut) 
        ? booking.earlyCheckout.originalCheckOut 
        : booking.checkOut;

    const originalTotal = (booking.earlyCheckout && booking.earlyCheckout.originalTotalPrice !== undefined)
        ? booking.earlyCheckout.originalTotalPrice
        : (parseFloat(booking.totalPrice) || 0);

    const inMs = parseYMD(booking.checkIn);
    const origOutMs = parseYMD(originalOut);
    const targetOutMs = parseYMD(targetOutDate);

    const totalNights = Math.max(1, Math.round((origOutMs - inMs) / 86400000));
    const stayedNights = Math.max(0, Math.round((targetOutMs - inMs) / 86400000));
    const unstayedNights = Math.max(0, totalNights - stayedNights);

    const existingOtherCharges = (Array.isArray(booking.extraCharges) ? booking.extraCharges : [])
        .filter(c => !c.desc?.includes('EARLY DEPARTURE PENALTY'))
        .reduce((sum, c) => sum + (parseFloat(c.amt || c.amount || 0) || 0), 0);

    const originalRoomPrice = Math.max(0, originalTotal - existingOtherCharges);

    let stayedAmt = 0;
    let unstayedAmt = 0;
    const hasItemized = Array.isArray(booking.nightlyRates) && booking.nightlyRates.length > 0;

    if (hasItemized) {
        stayedAmt = booking.nightlyRates
            .filter(r => r.date >= booking.checkIn && r.date < targetOutDate)
            .reduce((sum, r) => sum + (parseFloat(r.rate) || 0), 0);
        unstayedAmt = booking.nightlyRates
            .filter(r => r.date >= targetOutDate && r.date < originalOut)
            .reduce((sum, r) => sum + (parseFloat(r.rate) || 0), 0);
        stayedAmt = Number(stayedAmt.toFixed(2));
        unstayedAmt = Number(unstayedAmt.toFixed(2));
    } else {
        const avg = originalRoomPrice / totalNights;
        stayedAmt = Number((avg * stayedNights).toFixed(2));
        unstayedAmt = Number((originalRoomPrice - stayedAmt).toFixed(2));
    }

    return {
        originalOut,
        originalTotal,
        originalRoomPrice,
        existingOtherCharges,
        totalNights,
        stayedNights,
        unstayedNights,
        stayedAmt,
        unstayedAmt,
        hasItemized
    };
}

export const requestEarlyCheckout = () => {
    const id = $('guest-id')?.value;
    if (!id) return;
    const s = getStaff().find(x => x.id === id);
    if (!s) return;

    currentEcoBooking = s;

    const todayStr = getLocalYMD(new Date());
    const originalOut = (s.earlyCheckout && s.earlyCheckout.originalCheckOut) ? s.earlyCheckout.originalCheckOut : s.checkOut;

    if ($('eco-guest-name')) $('eco-guest-name').innerText = `${s.firstName || ''} ${s.lastName || 'GUEST'}`.trim();
    if ($('eco-booking-id')) $('eco-booking-id').innerText = s.bookId || s.id;
    if ($('eco-stay-dates')) $('eco-stay-dates').innerText = `${s.checkIn} → ${originalOut}`;

    const origTotal = (s.earlyCheckout && s.earlyCheckout.originalTotalPrice !== undefined) ? s.earlyCheckout.originalTotalPrice : (parseFloat(s.totalPrice) || 0);
    if ($('eco-orig-total')) $('eco-orig-total').innerText = `฿${origTotal.toLocaleString()}`;

    const dateInput = $('eco-date');
    if (dateInput) {
        dateInput.min = s.checkIn;
        const maxDate = new Date(originalOut + "T12:00:00Z");
        maxDate.setUTCDate(maxDate.getUTCDate() - 1);
        dateInput.max = maxDate.toISOString().split('T')[0];

        if (todayStr >= s.checkIn && todayStr < originalOut) {
            dateInput.value = todayStr;
        } else {
            const nextDay = new Date(s.checkIn + "T12:00:00Z");
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            dateInput.value = nextDay.toISOString().split('T')[0];
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

export const recalcEarlyCheckoutModal = () => {
    if (!currentEcoBooking) return;
    const targetOut = $('eco-date')?.value;
    if (!targetOut) return;

    const math = calculateStayMath(currentEcoBooking, targetOut);

    if ($('eco-stayed-nts')) $('eco-stayed-nts').innerText = math.stayedNights;
    if ($('eco-stayed-amt')) $('eco-stayed-amt').innerText = `฿${math.stayedAmt.toLocaleString()}`;
    if ($('eco-unstayed-nts')) $('eco-unstayed-nts').innerText = math.unstayedNights;
    if ($('eco-unstayed-amt')) $('eco-unstayed-amt').innerText = `฿${math.unstayedAmt.toLocaleString()}`;
    if ($('eco-rate-note')) $('eco-rate-note').innerText = math.hasItemized ? 'Calculated using itemized daily rates' : 'Calculated using average daily rate';
    if ($('eco-btn-refund-sub')) $('eco-btn-refund-sub').innerText = `Deduct ฿${math.unstayedAmt.toLocaleString()}`;
    if ($('eco-btn-penalty-sub')) $('eco-btn-penalty-sub').innerText = `Itemize ฿${math.unstayedAmt.toLocaleString()} fee`;
};

export const confirmEarlyCheckout = async (mode) => {
    if (!currentEcoBooking) return;
    const targetOut = $('eco-date')?.value;
    if (!targetOut) return;

    const id = currentEcoBooking.id;
    const s = getStaff().find(x => x.id === id) || currentEcoBooking;
    const math = calculateStayMath(s, targetOut);
    const todayStr = getLocalYMD(new Date());

    let extraCharges = (Array.isArray(s.extraCharges) ? [...s.extraCharges] : [])
        .filter(c => !c.desc?.includes('EARLY DEPARTURE PENALTY'));

    let newTotalPrice = 0;
    let penaltyId = null;

    if (mode === 'refund') {
        newTotalPrice = Number((math.stayedAmt + math.existingOtherCharges).toFixed(2));
    } else {
        penaltyId = 'ec_penalty_' + Date.now();
        extraCharges.push({
            id: penaltyId,
            desc: `EARLY DEPARTURE PENALTY (${math.unstayedNights} NT${math.unstayedNights === 1 ? '' : 'S'})`,
            amount: math.unstayedAmt,
            amt: math.unstayedAmt,
            date: targetOut
        });
        newTotalPrice = Number((math.stayedAmt + math.unstayedAmt + math.existingOtherCharges).toFixed(2));
    }

    const earlySnapshot = {
        originalCheckOut: math.originalOut,
        originalTotalPrice: math.originalTotal,
        departureDate: targetOut,
        stayedNights: math.stayedNights,
        unstayedNights: math.unstayedNights,
        stayedAmount: math.stayedAmt,
        unstayedAmount: math.unstayedAmt,
        mode: mode,
        penaltyId: penaltyId,
        ts: new Date().toISOString()
    };

    const noteMsg = `\n[EARLY CHECKOUT on ${todayStr}] Departed on ${targetOut} (${math.unstayedNights} nts early, original departure: ${math.originalOut}). ` +
        (mode === 'refund' 
            ? `Deducted ฿${math.unstayedAmt.toLocaleString()} unstayed room charges. New Folio Total: ฿${newTotalPrice.toLocaleString()}.` 
            : `Kept full charge of ฿${newTotalPrice.toLocaleString()} (฿${math.stayedAmt.toLocaleString()} room + ฿${math.unstayedAmt.toLocaleString()} penalty fee).`);

    const updatedNotes = ((s.notes || '') + noteMsg).trim();

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: targetOut,
            status: 'early out',
            totalPrice: newTotalPrice,
            extraCharges: extraCharges,
            earlyCheckout: earlySnapshot,
            notes: updatedNotes,
            lastEditedAt: new Date().toISOString()
        });

        if (window.triggerAutoSync) {
            const hotelRooms = getHotelRooms();
            const types = (s.rooms || []).map(r => hotelRooms.find(hr => hr.id === r)?.type).filter(Boolean);
            window.triggerAutoSync(targetOut, math.originalOut, types);
        }

        s.checkOut = targetOut;
        s.status = 'early out';
        s.totalPrice = newTotalPrice;
        s.extraCharges = extraCharges;
        s.earlyCheckout = earlySnapshot;
        s.notes = updatedNotes;
        window.activeExtraCharges = [...extraCharges];

        const staffList = window.staff || [];
        const staffIdx = staffList.findIndex(x => x.id === id);
        if (staffIdx > -1) {
            staffList[staffIdx] = { ...s };
        }

        if (window.closeModal) window.closeModal('early-checkout-modal');
        if (window.openGuestModal) window.openGuestModal(s);
        if ($('guest-notes')) $('guest-notes').value = updatedNotes;
        if (window.renderExtraCharges) window.renderExtraCharges();
        if (window.calcFinancials) window.calcFinancials();

        if (window.showToast) {
            window.showToast(
                "Early Checkout", 
                `Departed on ${targetOut}. ${mode === 'refund' ? `Deducted ฿${math.unstayedAmt.toLocaleString()}` : `Itemized ฿${math.unstayedAmt.toLocaleString()} penalty fee`}.`
            );
        }
        
    } catch (err) {
        console.error("Early Checkout Error:", err);
        customAlert("Error", "Error processing early checkout: " + err.message);
    }
};

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
            return customAlert("Collision Detected", `Cannot revert early checkout. Room ${r} is already occupied between ${s.checkOut} and ${originalOut}.`);
        }
    }

    const todayStr = getLocalYMD(new Date());

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

        s.checkOut = originalOut;
        s.status = 'here';
        s.totalPrice = originalTotal;
        s.extraCharges = extraCharges;
        s.earlyCheckout = null;
        s.notes = updatedNotes;
        window.activeExtraCharges = [...extraCharges];

        const staffList = window.staff || [];
        const staffIdx = staffList.findIndex(x => x.id === id);
        if (staffIdx > -1) {
            staffList[staffIdx] = { ...s };
        }

        if (window.openGuestModal) window.openGuestModal(s);
        if ($('guest-notes')) $('guest-notes').value = updatedNotes;
        if (window.renderExtraCharges) window.renderExtraCharges();
        if (window.calcFinancials) window.calcFinancials();

        if (window.showToast) {
            window.showToast("Restored", `Early checkout reverted. Stay restored to ${originalOut}.`);
        }
    } catch (err) {
        console.error("Undo Early Checkout Error:", err);
        customAlert("Error", "Error reverting early checkout: " + err.message);
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
