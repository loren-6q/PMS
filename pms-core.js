// ==========================================================================
// PMS UNIVERSAL SHARED CORE UTILITY (pms-core.js)
// Wild & Wandering Property Management System
// ==========================================================================

(function() {
    window.PMS_PROPERTIES = {
        'swims_resort': { code: 'SWIMS', name: 'SWIMS Beach Resort' },
        'loud_samui':   { code: 'LOUD',  name: 'LOUD Hostels Samui' },
        'wet_pool':     { code: 'WET',   name: 'WET Pool Party Hostel' },
        'big_c':        { code: 'BIGC',  name: 'Big C Property' }
    };

    // 1. Canonical Property ID Normalizer
    window.toCanonicalPropId = function(raw) {
        if (!raw) return 'swims_resort';
        const clean = raw.toString().trim().toUpperCase();
        const map = {
            'SWIMS': 'swims_resort', 'SWIMS_RESORT': 'swims_resort',
            'LOUD': 'loud_samui', 'LOUD_SAMUI': 'loud_samui',
            'WET': 'wet_pool', 'WET_POOL': 'wet_pool',
            'BIGC': 'big_c', 'BIG_C': 'big_c'
        };
        return map[clean] || raw.toLowerCase();
    };

    // 2. Display Property Short Key Converter
    window.toDisplayPropKey = function(canonicalId) {
        const cId = window.toCanonicalPropId(canonicalId);
        const map = {
            'swims_resort': 'SWIMS',
            'loud_samui': 'LOUD',
            'wet_pool': 'WET',
            'big_c': 'BIGC'
        };
        return map[cId] || (cId ? cId.toUpperCase() : 'SWIMS');
    };

    // 3. Universal Room ID Normalizer
    window.normalizeRoomId = function(rawRoomId, propertyId = 'swims_resort') {
        if (!rawRoomId) return '';
        let nid = rawRoomId.toString().trim().toUpperCase();
        const canonicalProp = window.toCanonicalPropId(propertyId);
        
        if (canonicalProp === 'swims_resort') {
            if (/^[ABFD]\d$/.test(nid)) nid = nid[0] + '0' + nid.substring(1);
            if (/^(101|[23]\d{2}(?:-\d)?)$/.test(nid)) nid = 'C' + nid;
        }
        return nid;
    };

    // 4. Booking Status Rules & Occupancy Evaluator
    window.PMS_STATUS = {
        ACTIVE_OCCUPYING: ['here', 'future', 'new', 'vol', 'extended', 'special'],
        NON_OCCUPYING: ['cancelled', 'noshow', 'unconfirmed', 'charged']
    };

    window.isOccupyingBooking = function(status, isUnassigned = false) {
        if (!status) return false;
        const normStatus = status.toString().trim().toLowerCase();
        if (window.PMS_STATUS.NON_OCCUPYING.includes(normStatus)) return false;
        if (normStatus === 'special' && isUnassigned) return false;
        return true;
    };

    // 5. Shared URL Parameter Utility
    window.safeUpdateUrlParam = function(paramName, paramVal) {
        try {
            if (typeof window === 'undefined' || !window.location) return;
            if (!window.location.protocol.startsWith('http')) return;
            const url = new URL(window.location.href);
            url.searchParams.set(paramName, paramVal);
            window.history.replaceState({}, '', url.pathname + url.search);
        } catch(e) {}
    };

    // 6. Shared Date Helpers
    window.parseYMD = window.parseYMD || function(str) {
        if (!str || typeof str !== 'string') return 0;
        const p = str.split('-');
        return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
    };

    window.getLocalYMD = window.getLocalYMD || function(d) {
        if (!d) d = new Date();
        if (typeof d === 'string') {
            const trimmed = d.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00Z');
            d = isNaN(parsed.getTime()) ? new Date() : parsed;
        } else if (typeof d === 'number') d = new Date(d);
        if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
        try {
            const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
            return isNaN(o.getTime()) ? new Date().toISOString().split('T')[0] : o.toISOString().split('T')[0];
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
    };
})();
