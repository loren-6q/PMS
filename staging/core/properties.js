// ==========================================================================
// core/properties.js - Property Aliases, Routing & Immutable Room Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

export const DEFAULT_PROP_MAP = {
    'SWIMS': 'swims_resort',
    'SWIMS_RESORT': 'swims_resort',
    'LOUD': 'loud_samui',
    'LOUD_SAMUI': 'loud_samui',
    'WET': 'wet_pool',
    'WET_POOL': 'wet_pool',
    'BIGC': 'big_c',
    'BIG_C': 'big_c'
};

export const DEFAULT_PROP_REVERSE_MAP = {
    'swims_resort': 'SWIMS',
    'loud_samui': 'LOUD',
    'wet_pool': 'WET',
    'big_c': 'BIGC'
};

export function toCanonicalPropId(raw) {
    if (!raw) return 'swims_resort';
    const clean = String(raw).trim().toUpperCase();
    return DEFAULT_PROP_MAP[clean] || String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function toDisplayPropKey(canonicalId) {
    if (!canonicalId) return 'SWIMS';
    const clean = String(canonicalId).trim().toLowerCase();
    return DEFAULT_PROP_REVERSE_MAP[clean] || String(canonicalId).toUpperCase();
}

/**
 * Immutable Room ID Normalizer:
 * STRICT RULE: Trims whitespace and preserves case.
 * NEVER adds leading zeroes (B1 -> B01).
 * NEVER prepends letters (101 -> C101).
 */
export function normalizeRoomId(rawRoomId) {
    if (rawRoomId === null || rawRoomId === undefined) return '';
    return String(rawRoomId).trim();
}

export function safeUpdateUrlParam(paramName, paramVal) {
    try {
        if (typeof window === 'undefined' || !window.location || window.location.protocol === 'blob:') return;
        const url = new URL(window.location.href);
        url.searchParams.set(paramName, paramVal);
        window.history.replaceState({}, '', url.toString());
    } catch (e) {}
}

if (typeof window !== 'undefined') {
    window.toCanonicalPropId = toCanonicalPropId;
    window.toDisplayPropKey = toDisplayPropKey;
    window.normalizeRoomId = normalizeRoomId;
    window.safeUpdateUrlParam = safeUpdateUrlParam;
}
