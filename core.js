// ==========================================================================
// core.js - Single Source of Truth for Utilities, Date Math, and Routing
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    // 1. Strict UTC Date Helpers (Eliminates Timezone -1 Day Shifting)
    window.parseYMD = function(str) {
        if (!str || typeof str !== 'string') return 0;
        const p = str.split('-');
        if (p.length !== 3) return 0;
        const y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, d = parseInt(p[2], 10);
        return isNaN(y) || isNaN(m) || isNaN(d) ? 0 : Date.UTC(y, m, d, 12, 0, 0);
    };

    window.getLocalYMD = function(d) {
        if (!d) d = new Date();
        if (typeof d === 'string') {
            const trimmed = d.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00Z');
            d = isNaN(parsed.getTime()) ? new Date() : parsed;
        } else if (typeof d === 'number') d = new Date(d);
        if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 2. Immutable Room ID Normalizer (Zero String Mutations)
    window.normalizeRoomId = function(rawRoomId) {
        if (rawRoomId === null || rawRoomId === undefined) return '';
        // Strict: only trim whitespace and uppercase. Never pad zeroes or prepend letters.
        return String(rawRoomId).trim().toUpperCase();
    };

    // 3. Status Rule Definitions
    window.PMS_STATUS = {
        // Active inventory-occupying statuses (must remain on their physical room rows)
        OCCUPYING: ['here', 'future', 'new', 'left', 'special'],
        // Non-occupying statuses (by design routed to Unassigned tray so space can be resold)
        UNASSIGNED: ['charged', 'unconfirmed', 'noshow', 'vol', 'cancelled']
    };

    window.isOccupyingBooking = function(status, isUnassignedSlot = false) {
        if (!status) return false;
        const s = String(status).trim().toLowerCase();
        if (window.PMS_STATUS.UNASSIGNED.includes(s)) return false;
        if (s === 'special' && isUnassignedSlot) return false;
        return true;
    };

    // 4. Safe URL Query Parameter Sync
    window.safeUpdateUrlParam = function(paramName, paramVal) {
        try {
            if (typeof window === 'undefined' || !window.location || window.location.protocol === 'blob:') return;
            const url = new URL(window.location.href);
            url.searchParams.set(paramName, paramVal);
            window.history.replaceState({}, '', url.toString());
        } catch(e) {}
    };

    // 5. In-App Alert Dialog (Zero browser alert/confirm)
    window.customAlert = window.customAlert || function(msg, isConfirm = false, onConfirm = null) {
        const modal = document.getElementById('custom-alert') || document.getElementById('alert-modal');
        const msgEl = document.getElementById('custom-alert-msg') || document.getElementById('alert-message');
        const cancelBtn = document.getElementById('custom-alert-cancel') || document.getElementById('alert-cancel');
        const confirmBtn = document.getElementById('custom-alert-confirm') || document.getElementById('alert-confirm');

        if (!modal || !msgEl) {
            console.log(`[PMS Alert] ${msg}`);
            return;
        }

        msgEl.innerText = msg;
        if (cancelBtn) cancelBtn.classList.toggle('hidden', !isConfirm);
        if (confirmBtn) {
            confirmBtn.innerText = isConfirm ? 'Confirm' : 'Okay';
            confirmBtn.onclick = () => {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                if (onConfirm) onConfirm();
            };
        }
        modal.classList.add('active');
        modal.classList.remove('hidden');
    };
})();
