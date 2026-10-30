// ==========================================================================
// pms/pms-folio-actions.js - Reservation Mutations (Save, Split, Merge, Delete)
// Wild & Wandering Property Management System
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { customAlert } from '../core/ui-dialogs.js';
import { activeExtraCharges, closeGuestModal } from './pms-folio-modal.js';

export async function saveBooking() {
    const btn = document.getElementById('save-guest-btn');
    if (btn) btn.disabled = true;

    try {
        const cIn = document.getElementById('check-in')?.value;
        const cOut = document.getElementById('check-out')?.value;

        if (!cIn || !cOut || cIn >= cOut) {
            throw new Error("Invalid Dates: Departure must be strictly after arrival.");
        }

        const id = document.getElementById('guest-id')?.value || ('bk_' + Date.now());
        const propId = window.currentPropertyId || 'swims_resort';

        const rList = Array.from(document.querySelectorAll('.assigned-room-select') || [])
            .map(s => s.value)
            .filter(Boolean);

        const payments = Array.from(document.querySelectorAll('.payment-row') || []).map(row => ({
            date: row.querySelector('.pay-date')?.value || getLocalYMD(new Date()),
            amt: parseFloat(row.querySelector('.pay-amt')?.value) || 0,
            method: row.querySelector('.pay-method')?.value || 'cash'
        }));

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
            notes: document.getElementById('guest-notes')?.value || '',
            source: document.getElementById('booking-source')?.value || 'direct',
            bookDate: document.getElementById('booking-date')?.value || getLocalYMD(new Date()),
            bookId: document.getElementById('booking-id')?.value.trim() || '',
            linkedId: document.getElementById('link-code')?.value.trim().toUpperCase() || '',
            status: document.getElementById('guest-status-hidden')?.value || 'future',
            badCC: document.getElementById('bad-cc-box')?.dataset.bad === 'true',
            payments,
            extraCharges: activeExtraCharges || [],
            updatedAt: new Date().toISOString()
        };

        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', id);
        await setDoc(docRef, bookingPayload, { merge: true });

        closeGuestModal();
        customAlert("Saved", `Booking for ${bookingPayload.lastName} saved successfully.`);

    } catch (err) {
        console.error("[PMS Save Error]:", err);
        customAlert("Save Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function requestDelete() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    customAlert(
        "Permanent Delete",
        "Permanently delete this reservation? This cannot be undone.",
        true,
        async () => {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
                closeGuestModal();
                customAlert("Deleted", "Reservation removed from system.");
            } catch (err) {
                customAlert("Delete Failed", err.message);
            }
        }
    );
}

export function requestDuplicate() {
    const id = document.getElementById('guest-id')?.value;
    if (!id) return;

    const lastName = document.getElementById('last-name')?.value || 'Guest';
    document.getElementById('guest-id').value = '';
    document.getElementById('booking-id').value = '';
    document.getElementById('link-code').value = 'LK-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    
    const notesEl = document.getElementById('guest-notes');
    if (notesEl) {
        notesEl.value = `[DUPLICATE of ${lastName}]\n` + notesEl.value;
    }

    customAlert("Duplicating...", "Details cloned. Assign a room/dates and click Save.");
}

export function requestSplit() {
    const id = document.getElementById('guest-id')?.value;
    const cIn = document.getElementById('check-in')?.value;
    const cOut = document.getElementById('check-out')?.value;
    if (!id || !cIn || !cOut) return;

    const modal = document.getElementById('split-modal');
    const input = document.getElementById('split-date');
    if (modal && input) {
        input.value = '';
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

    try {
        const linkCode = document.getElementById('link-code')?.value || ('LK-' + Math.random().toString(36).substr(2, 5).toUpperCase());
        const newLegId = 'bk_' + Date.now();

        // 1. Shorten current leg
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id), {
            checkOut: splitDate,
            linkedId: linkCode,
            updatedAt: new Date().toISOString()
        });

        // 2. Insert new leg starting on splitDate
        const newLeg = {
            id: newLegId,
            property: window.currentPropertyId || 'swims_resort',
            firstName: document.getElementById('first-name')?.value.trim().toUpperCase() || '',
            lastName: document.getElementById('last-name')?.value.trim().toUpperCase() || 'GUEST',
            checkIn: splitDate,
            checkOut: cOut,
            rooms: [""],
            room: "",
            status: 'future',
            totalPrice: 0,
            payments: [],
            linkedId: linkCode,
            notes: `[SPLIT STAY - LEG 2 FROM ${cIn}]`,
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newLegId), newLeg);

        const modal = document.getElementById('split-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        closeGuestModal();
        customAlert("Split Complete", `Reservation split on ${splitDate}. Leg 2 is ready in the unassigned tray.`);

    } catch (err) {
        console.error("[Split Error]:", err);
        customAlert("Split Error", err.message);
    }
}

if (typeof window !== 'undefined') {
    window.saveBooking = saveBooking;
    window.saveGuest = saveBooking;
    window.requestDelete = requestDelete;
    window.requestDuplicate = requestDuplicate;
    window.requestSplit = requestSplit;
    window.confirmSplit = confirmSplit;
}
