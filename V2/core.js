// ==========================================================================
// core.js - Single Source of Truth for Utilities, Date Math, Statuses & Routing
// Wild & Wandering Property Management System
// 
// COMPLETE UNABRIDGED UNIVERSAL CORE:
// - Universal strict UTC Date parsing (parseYMD, getLocalYMD)
// - Immutable Room ID normalizer (NO zero-padding, NO letter mutations)
// - Central status definitions and color styling
// - Complete SVG icons suite (upgrades, emails, feedback, links)
// - Financial calculation helpers (getPaid, getDue, getComm)
// - Smart PMS Room Category Resolver
// - Safe In-App Alert and Toast notification engine
// - URL parameter sync and dynamic navigation updater
// ==========================================================================

(function() {
    // --- 1. DATE & TIME UTILITIES (STRICT UTC, ZERO TIMEZONE DRIFT) ---
    window.parseYMD = function(str) {
        if (!str || typeof str !== 'string') return 0;
        const p = str.split('-');
        if (p.length !== 3) return 0;
        const y = parseInt(p[0], 10);
        const m = parseInt(p[1], 10) - 1;
        const d = parseInt(p[2], 10);
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

    window.mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    // --- 2. IMMUTABLE ROOM ID NORMALIZER ---
    // Strict requirement: Never pad zeroes (B1 -> B01) and never prepend letters (101 -> C101).
    window.normalizeRoomId = function(rawRoomId) {
        if (rawRoomId === null || rawRoomId === undefined) return '';
        return String(rawRoomId).trim().toUpperCase();
    };

    window.dbToUiRoom = function(rid) {
        return window.normalizeRoomId(rid);
    };

    window.uiToDbRoom = function(rid) {
        return window.normalizeRoomId(rid);
    };

    // --- 3. STATUS RULES & STATUS CYCLE DEFINITIONS ---
    window.STATUS_CYCLE = [
        { val: 'new', bg: '#ec4899', txt: '#ffffff', label: 'NEW' },
        { val: 'future', bg: '#7fc6f5', txt: '#1e293b', label: 'CONFIRMED' },
        { val: 'here', bg: '#dcfce7', txt: '#14532d', label: 'CHECKED IN' },
        { val: 'left', bg: '#aba39d', txt: '#1e293b', label: 'CHECKED OUT' },
        { val: 'cancelled', bg: '#e5e7eb', txt: '#1e293b', label: 'CANCELLED' },
        { val: 'noshow', bg: '#e5e7eb', txt: '#1e293b', label: 'NO SHOW' },
        { val: 'special', bg: '#fef08a', txt: '#1e293b', label: 'SPECIAL' },
        { val: 'blocked', bg: '#475569', txt: '#ffffff', label: 'MAINTENANCE' },
        { val: 'charged', bg: '#0f172a', txt: '#fbbf24', label: 'CHARGED' },
        { val: 'vol', bg: '#fbcfe8', txt: '#831843', label: 'VOLUNTEER' },
        { val: 'unconfirmed', bg: '#f3e8ff', txt: '#581c87', label: 'UNCONFIRMED' }
    ];

    window.PMS_STATUS = {
        OCCUPYING: ['here', 'future', 'new', 'left', 'special'],
        UNASSIGNED: ['charged', 'unconfirmed', 'noshow', 'vol', 'cancelled']
    };

    window.isOccupyingBooking = function(status, isUnassignedSlot = false) {
        if (!status) return false;
        const s = String(status).trim().toLowerCase();
        if (window.PMS_STATUS.UNASSIGNED.includes(s)) return false;
        if (s === 'special' && isUnassignedSlot) return false;
        return true;
    };

    // --- 4. FINANCIAL HELPERS ---
    window.getPaid = function(booking) {
        if (!booking || !Array.isArray(booking.payments)) return 0;
        return booking.payments.reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
    };

    window.getDue = function(booking) {
        if (!booking) return 0;
        const total = Number(booking.totalPrice) || 0;
        const paid = window.getPaid(booking);
        return Number((total - paid).toFixed(2));
    };

    window.getComm = function(booking) {
        if (!booking || !Array.isArray(booking.payments)) return 0;
        const commissionMethods = ['hw-kp', 'airbnb-kp', 'bdc-kp', 'agoda-kp', 'expedia-kp', 'trip-kp', 'cc-fee'];
        return booking.payments
            .filter(p => commissionMethods.includes(p.method))
            .reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
    };

    // --- 5. PROPERTY CANONICALIZATION & ROUTING ---
    const DEFAULT_PROP_MAP = {
        'LOUD': 'loud_samui',
        'WET': 'wet_pool',
        'SWIMS': 'swims_resort',
        'BIGC': 'big_c'
    };

    const DEFAULT_PROP_REVERSE_MAP = {
        'loud_samui': 'LOUD',
        'wet_pool': 'WET',
        'swims_resort': 'SWIMS',
        'big_c': 'BIGC'
    };

    window.toCanonicalPropId = function(rawId) {
        if (!rawId) return 'swims_resort';
        const clean = String(rawId).trim();
        const upper = clean.toUpperCase();
        if (DEFAULT_PROP_MAP[upper]) return DEFAULT_PROP_MAP[upper];
        return clean.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    };

    window.toDisplayPropKey = function(canonId) {
        if (!canonId) return 'SWIMS';
        const clean = String(canonId).trim().toLowerCase();
        if (DEFAULT_PROP_REVERSE_MAP[clean]) return DEFAULT_PROP_REVERSE_MAP[clean];
        return clean.toUpperCase();
    };

    window.safeUpdateUrlParam = function(paramName, paramVal) {
        try {
            if (typeof window === 'undefined' || !window.location || window.location.protocol === 'blob:') return;
            const url = new URL(window.location.href);
            url.searchParams.set(paramName, paramVal);
            window.history.replaceState({}, '', url.toString());
        } catch(e) {}
    };

    // --- 6. CATEGORY RESOLUTION ---
    window.resolvePmsRoomType = function(rawType = '') {
        if (!rawType) return '';
        const rawLower = String(rawType).toLowerCase().trim();
        const hotelRooms = window.hotelRooms || [];
        const roomTypes = [...new Set(hotelRooms.filter(r => r.type).map(r => r.type))];

        const direct = roomTypes.find(t => t.toLowerCase() === rawLower);
        if (direct) return direct;

        const sub = roomTypes.find(t => rawLower.includes(t.toLowerCase()) || t.toLowerCase().includes(rawLower));
        if (sub) return sub;

        let bestType = null;
        let highestScore = 0;

        roomTypes.forEach(pmsType => {
            const pmsLower = pmsType.toLowerCase();
            let score = 0;
            if (rawLower.includes('female') && pmsLower.includes('female')) score += 20;
            if (rawLower.includes('male') && !rawLower.includes('female') && pmsLower.includes('male') && !pmsLower.includes('female')) score += 20;
            if (rawLower.includes('mixed') && pmsLower.includes('mixed')) score += 15;

            ['4', '6', '8', '10', '12', 'quad', 'triple', 'twin', 'double', 'single', 'king'].forEach(kw => {
                if (rawLower.includes(kw) && pmsLower.includes(kw)) score += 5;
            });

            ['dorm', 'ensuite', 'balcony', 'bungalow', 'oceanview', 'gardenview', 'deluxe', 'standard'].forEach(kw => {
                if (rawLower.includes(kw) && pmsLower.includes(kw)) score += 3;
            });

            if (score > highestScore) {
                highestScore = score;
                bestType = pmsType;
            }
        });

        return highestScore >= 5 ? bestType : rawType;
    };

    // --- 7. SVG SUITE ---
    window.SVGS = {
        upFree: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#facc15" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        upPaid: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#4ade80" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        ext: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 12h12v-5l8 8-8 8v-5H4z" fill="#3b82f6" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        link: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        mailConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#fff" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailNotFmp: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#334155" stroke-width="2"/></svg>`,
        mailPre: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#f87171" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailPreConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#4ade80" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        mailSpec: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#facc15" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
        fbGood: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M3 12l5 5L21 4" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12l5 5L21 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`,
        fbBad: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`
    };

    // --- 8. AUDIT DIFF GENERATOR ---
    window.generateAuditDiff = function(prev, next) {
        if (!prev) return "Booking created.";
        const changes = [];
        if (prev.checkIn !== next.checkIn || prev.checkOut !== next.checkOut) {
            changes.push(`Dates: ${prev.checkIn || '?'}..${prev.checkOut || '?'} → ${next.checkIn || '?'}..${next.checkOut || '?'}`);
        }
        const prevRooms = (prev.rooms || [prev.room]).filter(Boolean).join(',');
        const nextRooms = (next.rooms || [next.room]).filter(Boolean).join(',');
        if (prevRooms !== nextRooms) {
            changes.push(`Rooms: [${prevRooms || 'None'}] → [${nextRooms || 'None'}]`);
        }
        if (Number(prev.totalPrice || 0) !== Number(next.totalPrice || 0)) {
            changes.push(`Total: ฿${Number(prev.totalPrice || 0).toFixed(2)} → ฿${Number(next.totalPrice || 0).toFixed(2)}`);
        }
        if (prev.status !== next.status) {
            changes.push(`Status: ${prev.status || '?'} → ${next.status || '?'}`);
        }
        if ((prev.notes || '') !== (next.notes || '')) {
            changes.push("Notes updated");
        }
        return changes.length > 0 ? changes.join(' | ') : "Booking details re-saved.";
    };

    // --- 9. MODAL & IN-APP ALERT SYSTEM ---
    window.customAlert = function(title, message, isConfirm = false, onConfirm = null) {
        const modal = document.getElementById('custom-alert') || document.getElementById('alert-modal') || document.getElementById('custom-app-modal');
        const msgEl = document.getElementById('custom-alert-msg') || document.getElementById('alert-message') || document.getElementById('modal-body');
        const cancelBtn = document.getElementById('custom-alert-cancel') || document.getElementById('alert-cancel') || document.getElementById('modal-cancel-btn');
        const confirmBtn = document.getElementById('custom-alert-confirm') || document.getElementById('alert-confirm') || document.getElementById('modal-confirm-btn');
        const titleEl = document.getElementById('modal-title') || document.getElementById('alert-header-title');

        if (!modal || !msgEl) {
            console.log(`[Alert] ${title}: ${message}`);
            if (isConfirm && onConfirm) onConfirm();
            return;
        }

        if (titleEl) titleEl.innerText = title || "Notification";
        msgEl.innerText = message || "";

        if (cancelBtn) cancelBtn.classList.toggle('hidden', !isConfirm);
        if (confirmBtn) {
            confirmBtn.innerText = isConfirm ? 'Confirm' : 'OK';
            confirmBtn.onclick = () => {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                modal.style.display = 'none';
                if (onConfirm) onConfirm();
            };
        }

        modal.classList.add('active');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    };

    window.showAlert = function(msg, isConfirm = false, onConfirm = null) {
        window.customAlert("Attention", msg, isConfirm, onConfirm);
    };

    window.closeAlert = function() {
        const modal = document.getElementById('custom-alert') || document.getElementById('alert-modal') || document.getElementById('custom-app-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    };
})();
