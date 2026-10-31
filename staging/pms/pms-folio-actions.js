// ==========================================================================
// pms/pms-folio-actions.js - Reservation Mutations (Save, Split, Merge, Delete)
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { isOccupyingBooking } from '../core/occupancy.js';
import { customAlert } from '../core/ui-dialogs.js';
import { activeExtraCharges } from './pms-folio-ledger.js';
import { closeGuestModal } from './pms-folio-modal.js';

// --- 1. Master Booking Save & Overlap Collision Guard ---
export async function saveBooking() {
    const btn = document.getElementById('save-guest-btn');
    if (btn) btn.disabled = true;

    try {
        const cIn = document.getElementById('check-in')?.value;
        const cOut = document.getElementById('check-out')?.value;

        if (!cIn || !cOut || cIn >= cOut) {
            throw new Error("Invalid Dates: Departure must be strictly after arrival.");
        }

        const todayStr = getLocalYMD(new Date());
        const stat = document.getElementById('guest-status-hidden')?.value || 'future';

        // Guard: Prevent setting status to LEFT or EARLY OUT if checkout date is in the future
        if ((stat === 'left' || stat === 'early') && cOut > todayStr) {
            throw new Error(`Invalid Status: Guest check-out is set to ${cOut} (in the future).\n\nTo release the bed for future dates and adjust rates, please use the "Early Checkout" button.`);
        }

        const id = document.getElementById('guest-id')?.value || ('bk_' + Date.now());
        const propId = window.currentPropertyId || 'swims_resort';
        const bookId = document.getElementById('booking-id')?.value.trim() || '';
        const linkCode = document.getElementById('link-code')?.value.trim().toUpperCase() || '';

        const rList = Array.from(document.querySelectorAll('.assigned-room-select') || [])
            .map(s => s.value)
            .filter(Boolean);

        const hasAssignedRoom = rList.length > 0 && rList[0] !== "";

        // Duplicate Booking ID Guard (allows shared ID if linked or contiguous)
        if (bookId) {
            const dupe = (window.staff || []).find(s => {
                if (s.id === id || s.status === 'cancelled') return false;
                const sProp = (s.property || 'swims_resort').toLowerCase();
                if (sProp !== propId.toLowerCase()) return false;
                if (!s.bookId || String(s.bookId).trim() !== bookId) return false;

                const isLinked = linkCode && s.linkedId && linkCode === s.linkedId;
                const isContiguous = parseYMD(cIn) >= parseYMD(s.checkOut) || parseYMD(cOut) <= parseYMD(s.checkIn);
                return !isLinked && !isContiguous;
            });

            if (dupe) {
                setTimeout(() => {
                    if (typeof window.editStaff === 'function') window.editStaff(dupe.id);
                }, 2000);
                throw new Error(`Duplicate Blocked: Booking ID "${bookId}" already exists for ${dupe.firstName || ''} ${dupe.lastName || 'Guest'}.\n\nOpening existing record...`);
            }
        }

        // Room Overlap Collision Guard (Enforces Strict Occupancy Law)
        if (isOccupyingBooking(stat, hasAssignedRoom)) {
            const sU = parseYMD(cIn);
            const eU = parseYMD(cOut);

            for (let room of rList) {
                const conflict = (window.staff || []).find(s => {
                    if (s.id === id) return false;
                    const sProp = (s.property || 'swims_resort').toLowerCase();
                    if (sProp !== propId.toLowerCase()) return false;

                    const srList = Array.isArray(s.rooms) && s.rooms.length ? s.rooms : (s.room ? [s.room] : []);
                    const sHasRoom = srList.length > 0 && srList[0] !== "";
                    if (!isOccupyingBooking(s.status, sHasRoom)) return false;

                    if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
                        return srList.includes(room);
                    }
                    return false;
                });

                if (conflict) {
                    throw new Error(`Room Collision: Room "${room}" is already occupied by ${conflict.firstName || ''} ${conflict.lastName || 'Guest'} during these dates.`);
                }
            }
        }

        const payments = Array.from(document.querySelectorAll('.payment-row') || []).map(row => ({
            date: row.querySelector('.pay-date')?.value || todayStr,
            amt: parseFloat(row.querySelector('.pay-amt')?.value) || 0,
            method: row.querySelector('.pay-method')?.value || 'cash'
        }));

        const existingBooking = (window.staff || []).find(b => b.id === id);
        const now = new Date().toISOString();
        const userEmail = window.currentUserEmail || 'admin';

        // Read and persist all 7 multi-state pills (Restored from Monolith)
        const emailConfirmState = parseInt(document.getElementById('email-confirm-btn')?.dataset?.state || 0, 10);
        const emailPrePostState = parseInt(document.getElementById('email-prepost-btn')?.dataset?.state || 0, 10);
        const emailSpecialState = parseInt(document.getElementById('email-special-btn')?.dataset?.state || 0, 10);
        const refundState = parseInt(document.getElementById('refund-btn')?.dataset?.state || 0, 10);
        const upgradeState = parseInt(document.getElementById('upgrade-btn')?.dataset?.state || 0, 10);
        const ratingState = parseInt(document.getElementById('rating-btn')?.dataset?.state || 0, 10);
        const extState = parseInt(document.getElementById('ext-btn')?.dataset?.state || 0, 10);

        const bookingPayload = {
            id,
            property: propId,
            firstName: document.getElementById('first-name')?.value.trim().toUpperCase() || '',
            lastName: document.getElementById('last-name')?.value.trim().toUpperCase() || 'GUEST',
            phone: document.getElementById('phone')?.value.trim() || '',
            email: document.getElementById('email')?.value.trim() || '',
            country: document.getElementById('guest-country')?.value.trim() || '',
            checkIn: cIn,
            checkOut: cOut,
            pax: parseInt(document.getElementById('pax-count')?.value, 10) || 1,
            bookedType: document.getElementById('booked-type')?.value.trim() || '',
            room: rList[0] || '',
            rooms: rList,
            totalPrice: parseFloat(document.getElementById('total-price')?.value) || 0,
            netPrice: parseFloat(document.getElementById('net-price')?.value) || 0,
            netOverride: document.getElementById('net-price')?.dataset.override === 'true',
            badCC: document.getElementById('bad-cc-box')?.dataset.bad === 'true',
            notes: document.getElementById('guest-notes')?.value || '',
            source: document.getElementById('booking-source')?.value || 'direct',
            bookDate: document.getElementById('booking-date')?.value || todayStr,
            bookId: bookId,
            linkedId: linkCode,
            status: stat,
            payments,
            extraCharges: activeExtraCharges || [],
            nightlyRates: existingBooking?.nightlyRates || null,
            emailConfirm: emailConfirmState,
            emailPrePost: emailPrePostState > 0 ? (emailPrePostState === 1 ? 'sent' : 'confirmed') : false,
            emailSpecial: emailSpecialState === 1,
            refundability: refundState === 1 ? 'non-ref' : (refundState === 2 ? 'ref' : 'unknown'),
            upgrade: upgradeState > 0 ? (upgradeState === 1 ? 'free' : 'paid') : 'none',
            rating: ratingState > 0 ? (ratingState === 1 ? 'good' : 'bad') : 'none',
            extended: extState === 1,
            earlyCheckoutMeta: existingBooking?.earlyCheckoutMeta || null,
            createdAt: existingBooking?.createdAt || now,
            createdBy: existingBooking?.createdBy || userEmail,
            lastEditedAt: now,
            lastEditedBy: userEmail,
            auditLog: Array.isArray(existingBooking?.auditLog) ? existingBooking.auditLog : []
        };

        // Detailed Audit Diff Logging (Restored from Monolith)
        const diffSummary = existingBooking
            ? `Dates: ${cIn}..${cOut} | Status: ${stat} | Rooms: [${rList.join(',')}] | Total: ฿${bookingPayload.totalPrice}`
            : `Created reservation for ${bookingPayload.lastName} (${bookingPayload.bookId || id})`;
        bookingPayload.auditLog.push({ ts: now, user: userEmail, msg: diffSummary });

        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', id);
        await setDoc(docRef, bookingPayload, { merge: true });

        // Trigger Outbox Auto-Sync to Channex (Restored from Monolith)
        if (typeof window.triggerAutoSync === 'function') {
            const earliestIn = existingBooking?.checkIn && existingBooking.checkIn < cIn ? existingBooking.checkIn : cIn;
            const latestOut = existingBooking?.checkOut && existingBooking.checkOut > cOut ? existingBooking.checkOut : cOut;
            window.triggerAutoSync(earliestIn, latestOut, [bookingPayload.bookedType]);
        }

        closeGuestModal();
        customAlert("Saved", `Booking for ${bookingPayload.lastName} saved successfully.`);

    } catch (err) {
        console.error("[PMS Save Error]:", err);
        customAlert("Save Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// --- 2. Permanent Deletion Handler ---
export function requestDelete() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const booking = (window.staff || []).find(b => b.id === id);

    customAlert(
        "Permanent Delete",
        `Permanently delete booking for ${booking?.lastName || 'Guest'} (${booking?.bookId || id})? This cannot be undone.`,
        true,
        async () => {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));

                // Dispatch Channex sync on deletion (Restored from Monolith)
                if (typeof window.triggerAutoSync === 'function' && booking) {
                    window.triggerAutoSync(booking.checkIn, booking.checkOut, [booking.bookedType], null, id);
                }

                closeGuestModal();
                customAlert("Deleted", "Reservation removed from system.");
            } catch (err) {
                customAlert("Delete Failed", err.message);
            }
        }
    );
}

// --- 3. Duplicate Booking Handler ---
export function requestDuplicate() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const s = (window.staff || []).find(x => x.id === id);
    if (!s) return;

    const clone = JSON.parse(JSON.stringify(s));
    delete clone.id;
    delete clone.bookId;
    clone.status = 'future';
    clone.payments = [];
    clone.extraCharges = [];
    clone.linkedId = 'LK-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    clone.notes = `[DUPLICATE of ${s.lastName} (${s.bookId || s.id})]\n` + (clone.notes || '');

    if (typeof window.populateFolioForm === 'function') {
        window.populateFolioForm(clone);
    }

    customAlert("Duplicating...", "Details cloned as a new reservation.\nPlease assign dates, room, and click Save.");
}

// --- 4. Split Stay Cutter (Leg 1 & Leg 2 with True Nightly Rates) ---
export function requestSplit() {
    const id = document.getElementById('guest-id')?.value;
    const cIn = document.getElementById('check-in')?.value;
    const cOut = document.getElementById('check-out')?.value;
    if (!id || !cIn || !cOut) return;

    const ms = parseYMD(cOut) - parseYMD(cIn);
    const nights = Math.round(ms / 86400000);
    if (nights <= 1) {
        return customAlert("Notice", "Cannot split a 1-night stay.");
    }

    const modal = document.getElementById('split-modal');
    const input = document.getElementById('split-date');
    if (modal && input) {
        const dIn = new Date(cIn + "T12:00:00Z");
        dIn.setUTCDate(dIn.getUTCDate() + Math.floor(nights / 2));
        input.value = dIn.toISOString().split('T')[0];
        input.min = cIn;
        input.max = cOut;
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

export async function confirmSplit() {
    const id = document.getElementById('guest-id')?.value;
    const splitDate = document.getElementById('split-date')?.value;
    const cIn = document.getElementById('check-in')?.value;
    const cOut = document.getElementById('check-out')?.value;

    if (!splitDate || splitDate <= cIn || splitDate >= cOut) {
        return customAlert("Invalid Date", "Split date must fall strictly between check-in and check-out.");
    }

    const s = (window.staff || []).find(b => b.id === id);
    if (!s) return;

    try {
        const totalNights = Math.max(1, Math.round((parseYMD(cOut) - parseYMD(cIn)) / 86400000));
        const leg1Nights = Math.max(1, Math.round((parseYMD(splitDate) - parseYMD(cIn)) / 86400000));
        const leg2Nights = Math.max(1, totalNights - leg1Nights);

        let leg1Price = 0;
        let leg2Price = 0;
        let leg1Nightly = null;
        let leg2Nightly = null;

        // Tier 1: Check for True Nightly Rates
        if (s.nightlyRates && typeof s.nightlyRates === 'object') {
            leg1Nightly = {};
            leg2Nightly = {};
            Object.keys(s.nightlyRates).forEach(dStr => {
                const rate = Number(s.nightlyRates[dStr]) || 0;
                if (dStr < splitDate) {
                    leg1Price += rate;
                    leg1Nightly[dStr] = rate;
                } else {
                    leg2Price += rate;
                    leg2Nightly[dStr] = rate;
                }
            });
            leg1Price = Number(leg1Price.toFixed(2));
            leg2Price = Number(leg2Price.toFixed(2));
        } else {
            // Tier 2: Proportional Nightly Average Fallback
            leg1Price = Number(((s.totalPrice / totalNights) * leg1Nights).toFixed(2));
            leg2Price = Number((s.totalPrice - leg1Price).toFixed(2));
        }

        const linkCode = s.linkedId || ('LK-' + Math.random().toString(36).substr(2, 6).toUpperCase());
        const newLegId = 'bk_' + Date.now();

        // 1. Shorten current leg
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: splitDate,
            totalPrice: leg1Price,
            netPrice: Number((leg1Price * 0.82).toFixed(2)),
            nightlyRates: leg1Nightly,
            linkedId: linkCode,
            notes: (s.notes ? s.notes + '\n' : '') + `[SPLIT STAY - LEG 1 ENDS ${splitDate}]`,
            lastEditedAt: new Date().toISOString()
        });

        // 2. Insert new leg starting on splitDate (ready in unassigned tray)
        const newLeg = {
            id: newLegId,
            property: window.currentPropertyId || 'swims_resort',
            firstName: s.firstName || '',
            lastName: s.lastName || 'GUEST',
            checkIn: splitDate,
            checkOut: cOut,
            rooms: [""],
            room: "",
            bookedType: s.bookedType || '',
            status: 'future',
            totalPrice: leg2Price,
            netPrice: Number((leg2Price * 0.82).toFixed(2)),
            nightlyRates: leg2Nightly,
            payments: [],
            extraCharges: [],
            linkedId: linkCode,
            notes: `[SPLIT STAY - LEG 2 FROM ${cIn} STAY]`,
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newLegId), newLeg);

        if (typeof window.triggerAutoSync === 'function') {
            window.triggerAutoSync(cIn, cOut, [s.bookedType]);
        }

        const modal = document.getElementById('split-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }

        closeGuestModal();
        customAlert("Split Complete", `Stay split on ${splitDate}.\nLeg 1 (${leg1Nights} nts): ฿${leg1Price}\nLeg 2 (${leg2Nights} nts): ฿${leg2Price}\nLinked: ${linkCode}`);

    } catch (err) {
        console.error("[Split Error]:", err);
        customAlert("Split Error", err.message);
    }
}

// --- 5. Contiguous Booking Merger (Absorb Adjacent Segment) ---
export function requestMerge() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const cur = (window.staff || []).find(b => b.id === id);
    if (!cur) return;

    const curProp = window.currentPropertyId || 'swims_resort';
    const curIn = parseYMD(cur.checkIn);
    const curOut = parseYMD(cur.checkOut);

    // Strict Gate: Only show contiguous / adjacent bookings (check-out matches check-in)
    const candidates = (window.staff || []).filter(s => {
        if (s.id === id || s.status === 'cancelled' || s.status === 'noshow') return false;
        const sProp = (s.property || 'swims_resort').toLowerCase();
        if (sProp !== curProp.toLowerCase()) return false;

        const sIn = parseYMD(s.checkIn);
        const sOut = parseYMD(s.checkOut);

        // Strict 1-day adjacency check (prevents bridging non-contiguous dates)
        const isDirectlyBefore = Math.abs(sOut - curIn) <= 86400000;
        const isDirectlyAfter = Math.abs(sIn - curOut) <= 86400000;

        return isDirectlyBefore || isDirectlyAfter;
    });

    if (candidates.length === 0) {
        return customAlert("No Match", "No contiguous bookings found directly before or after this reservation to merge with.");
    }

    // Rank candidates: shared link code (+50), matching last name (+30)
    candidates.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (a.linkedId && a.linkedId === cur.linkedId) scoreA += 50;
        if (b.linkedId && b.linkedId === cur.linkedId) scoreB += 50;
        if (a.lastName && a.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreA += 30;
        if (b.lastName && b.lastName.toUpperCase() === cur.lastName.toUpperCase()) scoreB += 30;
        return scoreB - scoreA;
    });

    const modal = document.getElementById('merge-modal');
    const sel = document.getElementById('merge-target');
    if (!modal || !sel) return;

    sel.innerHTML = `<option value="">-- SELECT BOOKING TO ABSORB --</option>` +
        candidates.map((c, idx) => `
            <option value="${c.id}">${idx === 0 ? '⭐ ' : ''}${c.lastName || 'Guest'}, ${c.firstName || ''} (${c.checkIn} → ${c.checkOut}) [${c.bookId || c.id}]</option>
        `).join('');

    modal.classList.add('active');
    modal.style.display = 'flex';
}

export async function confirmMerge() {
    const id = document.getElementById('guest-id')?.value;
    const targetId = document.getElementById('merge-target')?.value;
    if (!id || !targetId) return;

    const primary = (window.staff || []).find(b => b.id === id);
    const absorbed = (window.staff || []).find(b => b.id === targetId);
    if (!primary || !absorbed) return;

    try {
        const combinedPayments = [...(primary.payments || []), ...(absorbed.payments || [])];
        const combinedCharges = [...(primary.extraCharges || []), ...(absorbed.extraCharges || [])];
        const combinedTotal = Number(((primary.totalPrice || 0) + (absorbed.totalPrice || 0)).toFixed(2));
        const combinedNet = Number(((primary.netPrice || 0) + (absorbed.netPrice || 0)).toFixed(2));

        // Merge nightly rates if present
        let combinedNightly = null;
        if (primary.nightlyRates || absorbed.nightlyRates) {
            combinedNightly = { ...(absorbed.nightlyRates || {}), ...(primary.nightlyRates || {}) };
        }

        const earliestIn = primary.checkIn < absorbed.checkIn ? primary.checkIn : absorbed.checkIn;
        const latestOut = primary.checkOut > absorbed.checkOut ? primary.checkOut : absorbed.checkOut;

        const mergeNotes = `\n\n[MERGED WITH BOOKING ${absorbed.bookId || absorbed.id} ON ${new Date().toLocaleDateString('en-GB')}]\n` +
            `• Absorbed Dates: ${absorbed.checkIn} to ${absorbed.checkOut}\n` +
            `• Absorbed Total: ฿${absorbed.totalPrice || 0}\n` +
            (absorbed.notes ? `• Absorbed Notes: ${absorbed.notes}` : '');

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkIn: earliestIn,
            checkOut: latestOut,
            totalPrice: combinedTotal,
            netPrice: combinedNet,
            nightlyRates: combinedNightly,
            payments: combinedPayments,
            extraCharges: combinedCharges,
            notes: (primary.notes || '') + mergeNotes,
            lastEditedAt: new Date().toISOString()
        });

        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', targetId));

        if (typeof window.triggerAutoSync === 'function') {
            window.triggerAutoSync(earliestIn, latestOut, [primary.bookedType, absorbed.bookedType]);
        }

        const modal = document.getElementById('merge-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }

        closeGuestModal();
        customAlert("Merge Complete", `Bookings merged into ${primary.bookId || id}.\nNew Stay: ${earliestIn} → ${latestOut}\nTotal: ฿${combinedTotal}`);

    } catch (err) {
        customAlert("Merge Failed", err.message);
    }
}

// --- 6. Early Checkout & 1-Click Snapshot Reversal ---
export async function executeEarlyCheckout(targetDepartureDate, actionType = 'charged', refundAmt = 0) {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const b = (window.staff || []).find(x => x.id === id);
    if (!b) return;

    const todayStr = getLocalYMD(new Date());
    const newOut = targetDepartureDate || todayStr;

    if (newOut <= b.checkIn) {
        return customAlert("Error", "Early checkout date must be after check-in.");
    }
    if (newOut >= b.checkOut) {
        return customAlert("Error", "Early checkout date must be earlier than current departure.");
    }

    try {
        const parseFn = parseYMD;
        const totalNights = Math.max(1, Math.round((parseFn(b.checkOut) - parseFn(b.checkIn)) / 86400000));
        const stayedNights = Math.max(1, Math.round((parseFn(newOut) - parseFn(b.checkIn)) / 86400000));
        const unusedNights = totalNights - stayedNights;

        let stayedPrice = 0;
        let unstayedPrice = 0;

        // Check for true nightly rates
        if (b.nightlyRates && typeof b.nightlyRates === 'object') {
            Object.keys(b.nightlyRates).forEach(dStr => {
                const rate = Number(b.nightlyRates[dStr]) || 0;
                if (dStr < newOut) stayedPrice += rate;
                else unstayedPrice += rate;
            });
            stayedPrice = Number(stayedPrice.toFixed(2));
            unstayedPrice = Number(unstayedPrice.toFixed(2));
        } else {
            const nightlyAvg = (b.totalPrice || 0) / totalNights;
            stayedPrice = Number((nightlyAvg * stayedNights).toFixed(2));
            unstayedPrice = Number(((b.totalPrice || 0) - stayedPrice).toFixed(2));
        }

        const snapshot = {
            originalCheckOut: b.checkOut,
            originalTotalPrice: b.totalPrice,
            shortenedCheckOut: newOut,
            action: actionType,
            adjustmentAmount: actionType === 'refunded' ? refundAmt : unstayedPrice,
            timestamp: new Date().toISOString()
        };

        let newCharges = Array.isArray(b.extraCharges) ? [...b.extraCharges] : [];
        let newPayments = Array.isArray(b.payments) ? [...b.payments] : [];
        let updatedTotal = b.totalPrice;

        if (actionType === 'charged') {
            newCharges.push({
                id: 'chg_early_' + Date.now(),
                desc: 'EARLY CHECKOUT FEE (UNSTAYED NIGHTS)',
                amt: unstayedPrice,
                date: newOut
            });
            updatedTotal = stayedPrice + unstayedPrice;
        } else if (actionType === 'refunded') {
            updatedTotal = stayedPrice;
            if (refundAmt > 0) {
                newPayments.push({
                    date: newOut,
                    amt: -Number(refundAmt),
                    method: 'cash'
                });
            }
        }

        const auditNote = `\n[EARLY CHECKOUT on ${todayStr} by Admin]\n` +
            `• Original Stay: ${b.checkIn} → ${b.checkOut} (${totalNights} Nts)\n` +
            `• Shortened To: ${b.checkIn} → ${newOut} (${stayedNights} Nts)\n` +
            `• Action: ${actionType.toUpperCase()} (฿${snapshot.adjustmentAmount})`;

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: newOut,
            totalPrice: updatedTotal,
            status: 'early',
            extraCharges: newCharges,
            payments: newPayments,
            earlyCheckoutMeta: snapshot,
            notes: (b.notes || '') + auditNote,
            lastEditedAt: new Date().toISOString()
        });

        if (typeof window.triggerAutoSync === 'function') {
            window.triggerAutoSync(b.checkIn, b.checkOut, [b.bookedType]);
        }

        closeGuestModal();
        customAlert("Early Checkout Complete", `Guest marked EARLY OUT on ${newOut}.\nFuture nights released to inventory.`);

    } catch (err) {
        console.error("[Early Checkout Error]:", err);
        customAlert("Early Checkout Failed", err.message);
    }
}

export async function undoEarlyCheckout() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const b = (window.staff || []).find(x => x.id === id);
    if (!b || !b.earlyCheckoutMeta) return;

    const meta = b.earlyCheckoutMeta;

    customAlert(
        "Undo Early Checkout",
        `Restore stay to ${meta.originalCheckOut} and price to ฿${meta.originalTotalPrice}?`,
        true,
        async () => {
            try {
                const restoredCharges = (b.extraCharges || []).filter(c => !c.desc?.includes('EARLY CHECKOUT FEE'));
                const restoredPayments = (b.payments || []).filter(p => !(p.amt < 0 && p.date === meta.shortenedCheckOut));

                const undoNote = `\n[EARLY CHECKOUT REVERSED on ${getLocalYMD(new Date())} by Admin]\n` +
                    `• Restored Checkout: ${meta.originalCheckOut}\n` +
                    `• Restored Total: ฿${meta.originalTotalPrice}`;

                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
                    checkOut: meta.originalCheckOut,
                    totalPrice: meta.originalTotalPrice,
                    status: 'here',
                    extraCharges: restoredCharges,
                    payments: restoredPayments,
                    earlyCheckoutMeta: null,
                    notes: (b.notes || '') + undoNote,
                    lastEditedAt: new Date().toISOString()
                });

                if (typeof window.triggerAutoSync === 'function') {
                    window.triggerAutoSync(b.checkIn, meta.originalCheckOut, [b.bookedType]);
                }

                closeGuestModal();
                customAlert("Restored", `Stay restored to ${meta.originalCheckOut}. Status set to HERE.`);

            } catch (err) {
                customAlert("Undo Failed", err.message);
            }
        }
    );
}

// --- 7. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.saveBooking = saveBooking;
    window.saveGuest = saveBooking;
    window.requestDelete = requestDelete;
    window.requestDuplicate = requestDuplicate;
    window.requestSplit = requestSplit;
    window.confirmSplit = confirmSplit;
    window.requestMerge = requestMerge;
    window.confirmMerge = confirmMerge;
    window.executeEarlyCheckout = executeEarlyCheckout;
    window.undoEarlyCheckout = undoEarlyCheckout;
}
