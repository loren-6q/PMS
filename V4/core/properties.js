// ==========================================================================
// core/properties.js - Dynamic Firestore Property Catalog & Config Loader
// Wild & Wandering Property Management System
// ==========================================================================

import { db, auth, appId } from './config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Loads all property documents from Firestore into memory.
 */
export async function loadPropertiesCatalog() {
    if (window.availableProperties && window.availableProperties.length > 0) {
        return window.availableProperties;
    }
    try {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.availableProperties = props;
        window.activePropertiesList = props; // alias for compatibility
        return props;
    } catch (err) {
        console.error("[Properties Catalog Load Error]:", err);
        return [];
    }
}

/**
 * Loads a single property config document from Firestore.
 */
export async function getActivePropertyConfig(propId) {
    try {
        if (!auth.currentUser) await signInAnonymously(auth);
        const targetId = toCanonicalPropId(propId || getActivePropertyId());
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', targetId));
        if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() };
            window.currentPropertyConfig = data;
            return data;
        }
    } catch (err) {
        console.error("[Property Config Load Error]:", err);
    }
    return null;
}

/**
 * Dynamically resolves any raw input or slug against live Firestore documents.
 * Zero hardcoded dictionaries.
 */
export function toCanonicalPropId(rawId) {
    if (!rawId) {
        return localStorage.getItem('last_prop') || window.availableProperties?.[0]?.id || 'swims_resort';
    }
    const clean = String(rawId).trim().toLowerCase();
    const props = window.availableProperties || [];

    // 1. Exact match against Firestore document IDs
    const exact = props.find(p => p.id.toLowerCase() === clean);
    if (exact) return exact.id;

    // 2. Match against property short codes or names in Firestore
    const match = props.find(p => 
        (p.short && p.short.toLowerCase() === clean) ||
        (p.name && p.name.toLowerCase() === clean) ||
        p.id.toLowerCase().includes(clean)
    );
    if (match) return match.id;

    // 3. Fallback: return clean string
    return clean;
}

/**
 * Retrieves the active property ID from URL param or localStorage.
 */
export function getActivePropertyId() {
    const urlParams = new URLSearchParams(window.location.search);
    const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || '';
    const canon = toCanonicalPropId(pParam);
    if (canon) localStorage.setItem('last_prop', canon);
    return canon;
}

/**
 * Returns the short display code (e.g. 'SWIMS', 'LOUD') from Firestore metadata.
 */
export function toDisplayPropKey(propId) {
    const props = window.availableProperties || [];
    const match = props.find(p => p.id.toLowerCase() === String(propId).toLowerCase());
    return (match?.short || match?.id || propId || '').toUpperCase();
}

/**
 * Switches the active property, updates localStorage, and reloads with ?p= preserved.
 */
export function switchProperty(targetPropId) {
    const canon = toCanonicalPropId(targetPropId);
    localStorage.setItem('last_prop', canon);
    const url = new URL(window.location.href);
    url.searchParams.set('p', canon);
    window.location.href = url.toString();
}

// Global window bridges
if (typeof window !== 'undefined') {
    window.loadPropertiesCatalog = loadPropertiesCatalog;
    window.getActivePropertyConfig = getActivePropertyConfig;
    window.toCanonicalPropId = toCanonicalPropId;
    window.getActivePropertyId = getActivePropertyId;
    window.toDisplayPropKey = toDisplayPropKey;
    window.switchProperty = switchProperty;
}
