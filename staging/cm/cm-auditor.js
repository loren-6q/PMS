// ==========================================================================
// cm/cm-auditor.js - OTA Extranet Auditor & Live Inventory Matrix Discrepancies
// Wild & Wandering Channel Manager
// ==========================================================================

import { db, appId } from '../core/config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';

export let snapshotData = {};

export async function loadPropertyBaseline() {
    try {
        const curProp = window.currentPropertyId || 'swims_resort';
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', `baseline_${curProp}`));
        if (snap.exists()) {
            snapshotData = snap.data().matrix || {};
        }
        renderDiscrepancyGrid();
    } catch (e) {
        console.warn("[Auditor Baseline Load Notice]:", e);
    }
}

export function checkMissingExtranetBookings() {
    const rawText = document.getElementById('audit-text')?.value || '';
    const resultDiv = document.getElementById('audit-result');
    if (!resultDiv) return;

    if (!rawText.trim()) {
        resultDiv.innerHTML = '';
        return;
    }

    const staffList = window.staff || [];
    const bdcMatches = rawText.match(/\b\d{9,12}\b/g) || [];
    const uniqueIds = [...new Set(bdcMatches)];
    const missing = [];

    uniqueIds.forEach(id => {
        const found = staffList.some(b => String(b.bookId).trim() === id);
        if (!found) missing.push(id);
    });

    if (missing.length === 0) {
        resultDiv.innerHTML = `<div class="p-2 bg-emerald-50 text-emerald-800 rounded font-black text-xs text-center border border-emerald-200">✓ All ${uniqueIds.length} pasted reservations match live PMS bookings!</div>`;
    } else {
        resultDiv.innerHTML = `
            <div class="p-2 bg-rose-50 text-rose-800 rounded text-xs border border-rose-200">
                <span class="font-black uppercase">${missing.length} Missing Booking(s) in PMS:</span>
                <div class="mt-1 font-mono font-bold">${missing.join(', ')}</div>
            </div>
        `;
    }
}

export function renderDiscrepancyGrid() {
    const tbody = document.getElementById('sync-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const roomTypes = window.roomTypes || [];
    const live = window.liveInventory || {};

    roomTypes.forEach(rt => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-200 text-xs";
        tr.innerHTML = `
            <td class="p-2 font-black text-slate-800 border-r border-slate-200">${rt}</td>
            <td class="p-2 text-center text-slate-500">Live Inventory Active</td>
        `;
        tbody.appendChild(tr);
    });
}

export async function markAllSyncedBaseline() {
    const curProp = window.currentPropertyId || 'swims_resort';
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ota_sync', `baseline_${curProp}`), {
            matrix: window.liveInventory || {},
            updatedAt: new Date().toISOString()
        }, { merge: true });
        customAlert("Baseline Saved", "Availability baseline marked as synchronized.");
    } catch (e) {
        customAlert("Save Error", e.message);
    }
}

if (typeof window !== 'undefined') {
    window.checkMissing = checkMissingExtranetBookings;
    window.markSynced = markAllSyncedBaseline;
}
