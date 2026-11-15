// ==========================================================================
// core/properties.js - Dynamic Database-Driven Property Management
// Wild & Wandering Property Management System
// 100% Variable: Zero hardcoded property names, codes, or locations.
// ==========================================================================

import { db, appId } from './config.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// In-memory dynamic property dictionary loaded from Firestore
export let activePropertiesMap = new Map();
export let activePropertiesList = [];

/**
 * Loads all active properties from Firestore.
 * Automatically populates alias and reverse-lookup mappings.
 */
export async function loadPropertiesCatalog() {
    try {
        const propsRef = collection(db, 'artifacts', appId, 'public', 'data', 'properties');
        const snap = await getDocs(propsRef);
        
        activePropertiesList = [];
        activePropertiesMap.clear();

        snap.forEach(d => {
            const data = d.data();
            const prop = {
                id: d.id,
                name: data.name || d.id,
                short: (data.short || data.shortCode || d.id).toUpperCase(),
                currency: data.currency || 'THB',
                currencySymbol: data.currencySymbol || '฿',
                timezone: data.timezone || 'Asia/Bangkok',
                rooms: data.rooms || [],
                events: data.events || [],
                payments: data.payments || [],
                addons: data.addons || [],
                channex: data.channex || {},
                channexMap: data.channexMap || [],
                channexRateMap: data.channexRateMap || [],
                ...data
            };

            activePropertiesList.push(prop);
            activePropertiesMap.set(prop.id.toLowerCase(), prop);
            activePropertiesMap.set(prop.short.toUpperCase(), prop);
        });

        // Ensure default property fallback exists
        if (activePropertiesList.length > 0 && typeof window !== 'undefined') {
            window.activePropertiesList = activePropertiesList;
        }

        return activePropertiesList;
    } catch (err) {
        console.warn("[core/properties.js] Failed to load dynamic properties catalog:", err);
        return [];
    }
}

/**
 * Resolves any raw input string (ID, slug, or short code) to its canonical property ID.
 */
export function toCanonicalPropId(raw) {
    if (!raw) {
        return activePropertiesList[0]?.id || 'default_property';
    }
    const clean = String(raw).trim();
    const upper = clean.toUpperCase();
    const lower = clean.toLowerCase();

    if (activePropertiesMap.has(upper)) return activePropertiesMap.get(upper).id;
    if (activePropertiesMap.has(lower)) return activePropertiesMap.get(lower).id;

    // Direct slug format conversion if property catalog is loading
    return lower.replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Resolves any canonical ID or slug to its short display key (e.g. for URL params).
 */
export function toDisplayPropKey(canonicalId) {
    if (!canonicalId) {
        return activePropertiesList[0]?.short || 'PROP';
    }
    const cleanLower = String(canonicalId).trim().toLowerCase();
    if (activePropertiesMap.has(cleanLower)) {
        return activePropertiesMap.get(cleanLower).short;
    }
    return String(canonicalId).trim().toUpperCase();
}

/**
 * Immutable Room ID Normalizer:
 * STRICT RULE: Trims whitespace and preserves exact user naming.
 * NEVER adds prefixes or alters casing.
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
    window.loadPropertiesCatalog = loadPropertiesCatalog;
}
