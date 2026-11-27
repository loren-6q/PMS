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
        return localStorage.getItem('last_prop') || window.availableProperties?.[0]?.id || '';
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
 * Returns the short display code (e.g. 'PROP1', 'PROP2') from Firestore metadata.
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

/**
 * Case-insensitive canonical room category resolver.
 */
export function resolveRoomCategory(rawName, roomTypes = (window.roomTypes || [])) {
    if (!rawName) return '';
    const clean = String(rawName).trim().toLowerCase();
    return roomTypes.find(r => String(r).trim().toLowerCase() === clean) || '';
}

/**
 * Classifies active room categories into dorms vs privates.
 */
export function getClassifiedRooms() {
    const all = [...(window.roomTypes || [])];
    const hotelRooms = window.hotelRooms || [];
    const dormSet = new Set();
    const privSet = new Set();

    hotelRooms.forEach(hr => {
        const cat = hr.category || hr.type;
        if (!cat) return;
        if (hr.rule === 'private') privSet.add(cat);
        else if (hr.rule) dormSet.add(cat);
    });

    const dorms = all.filter(rt => dormSet.has(rt) || (!privSet.has(rt) && /dorm|bed|bunk/i.test(rt)));
    const privates = all.filter(rt => !dorms.includes(rt));
    return { all, dorms, privates };
}

/**
 * Resolves the canonical Private and Dorm Master Anchors with safe fallbacks.
 */
export function getResolvedAnchors() {
    const { all, dorms, privates } = getClassifiedRooms();
    let anchorP = resolveRoomCategory(window.pricingRules?.anchorPrivate, all);
    if (!anchorP) anchorP = privates[0] || all[0] || '';

    let anchorD = resolveRoomCategory(window.pricingRules?.anchorDorm, all);
    if (!anchorD) anchorD = dorms[0] || (all[1] && all[1] !== anchorP ? all[1] : '');

    return { anchorP, anchorD };
}

// Global window bridges
if (typeof window !== 'undefined') {
    window.loadPropertiesCatalog = loadPropertiesCatalog;
    window.getActivePropertyConfig = getActivePropertyConfig;
    window.toCanonicalPropId = toCanonicalPropId;
    window.getActivePropertyId = getActivePropertyId;
    window.toDisplayPropKey = toDisplayPropKey;
    window.switchProperty = switchProperty;
    window.resolveRoomCategory = resolveRoomCategory;
    window.getClassifiedRooms = getClassifiedRooms;
    window.getResolvedAnchors = getResolvedAnchors;
}
