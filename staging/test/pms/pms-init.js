import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, query, where, getDocs, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { parseYMD, getLocalYMD } from '../core/dates.js';

export const $ = id => document.getElementById(id);
export const $$ = s => document.querySelectorAll(s);
export const REQUIRE_LOGIN = false;
export const DEFAULT_WW_ICON = "https://loren-6q.github.io/PMS/gfx/WWicon.png";

export const firebaseConfig = { apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU", authDomain: "swimspms.firebaseapp.com", projectId: "swimspms", storageBucket: "swimspms.firebasestorage.app", messagingSenderId: "989960113115", appId: "1:989960113115:web:a99e08a23a36ff4289f5fe" };
export const appId = 'hotel-pms-v1';
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-southeast1');

export let PROP_MAP = {};
export let PROP_REVERSE_MAP = {};

export let initialP = null;
try { initialP = new URLSearchParams(window.location.search).get('p')?.toUpperCase(); } catch (e) {}
export let storedProp = null;
try { storedProp = localStorage.getItem('last_prop'); } catch (e) {}

export let currentPropertyId = storedProp || 'swims_resort';

export let currentUserRole = null, currentUserEmail = 'unknown';
export let staff = [], dailyRates = {};
export let viewStart = new Date();
viewStart.setDate(viewStart.getDate() - 3);
viewStart.setHours(12, 0, 0, 0);

export let hotelRooms = [], roomTypes = [], fmpDates = [];
window.activeExtraCharges = [];
window.viewStart = viewStart;

// Dynamic Favicon Switcher
window.updateFavicon = (iconUrl) => {
    const url = iconUrl || DEFAULT_WW_ICON;
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = url;
    const appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (appleLink) appleLink.href = url;
};

export const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

// Universal Tokenized Room Matcher
export const tokenizeRoom = str => {
    if (!str) return [];
    return (String(str).toUpperCase().replace(/^ROOM\s+/, '').match(/[A-Z]+|\d+/g) || []).map(t => {
        const n = parseInt(t, 10);
        return isNaN(n) ? t : n;
    });
};
export const tokensMatch = (t1, t2) => {
    if (!t1.length || !t2.length || t1.length !== t2.length) return false;
    return t1.every((v, i) => v === t2[i]);
};

export const dbToUiRoom = rid => {
    if (!rid) return rid;
    const nid = String(rid).toUpperCase().trim();
    const exactMatch = hotelRooms.find(r => r.id === nid || r.id === rid || String(r.id).toUpperCase() === nid);
    if (exactMatch) return exactMatch.id;

    const targetTokens = tokenizeRoom(rid);
    if (targetTokens.length > 0) {
        const tokenMatch = hotelRooms.find(r => tokensMatch(tokenizeRoom(r.id), targetTokens));
        if (tokenMatch) return tokenMatch.id;
    }

    return rid;
};

export const uiToDbRoom = rid => dbToUiRoom(rid);

window.db = db;
window.appId = appId;
window.fs = { collection, doc, query, where, getDocs, updateDoc, setDoc, deleteDoc };
window.parseYMD = parseYMD;
window.getLocalYMD = getLocalYMD;
window.fmpDates = fmpDates;
window.getRooms = getRooms;
window.uiToDbRoom = uiToDbRoom;
window.dbToUiRoom = dbToUiRoom;
window.getCurrentPropertyId = () => currentPropertyId;
window.getHotelRooms = () => hotelRooms;
window.getStaff = () => staff;


// --- Property & Navigation Conductor Functions ---

window.getPaid = s => (s.payments || []).reduce((sum, p) => sum + Number(p.amt), 0);
window.getDue = s => Number((Number(s.totalPrice || 0) - window.getPaid(s)).toFixed(2));

window.closeGuestModal = () => {
    const m = $('guest-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

// Native Auto-Revert to Unassigned when clearing all room assignments
document.addEventListener('DOMContentLoaded', () => {
    const container = $('assigned-rooms-container');
    if (container) {
        container.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            setTimeout(() => {
                const selects = container.querySelectorAll('.assigned-room-select');
                if (selects.length === 0 && window.addRoomSelect) {
                    window.addRoomSelect("");
                }
            }, 50);
        });
    }
});

window.generateAuditDiff = (oldRec, newRec) => {
    if (!oldRec) return "Created new booking.";
    let changes = [];
    if (oldRec.status !== newRec.status) changes.push(`Status: ${oldRec.status} -> ${newRec.status}`);
    if (oldRec.checkIn !== newRec.checkIn) changes.push(`In: ${oldRec.checkIn} -> ${newRec.checkIn}`);
    if (oldRec.checkOut !== newRec.checkOut) changes.push(`Out: ${oldRec.checkOut} -> ${newRec.checkOut}`);
    if (oldRec.rooms?.join(',') !== newRec.rooms?.join(',')) changes.push(`Rooms: ${oldRec.rooms?.join(',')} -> ${newRec.rooms?.join(',')}`);
    if (oldRec.totalPrice != newRec.totalPrice) changes.push(`Price: ${oldRec.totalPrice} -> ${newRec.totalPrice}`);
    if ((oldRec.payments || []).length !== (newRec.payments || []).length) changes.push(`Payments: ${(oldRec.payments || []).length} -> ${(newRec.payments || []).length}`);
    if ((oldRec.extraCharges || []).length !== (newRec.extraCharges || []).length) changes.push(`Charges: ${(oldRec.extraCharges || []).length} -> ${(newRec.extraCharges || []).length}`);
    if (oldRec.notes !== newRec.notes) changes.push(`Notes modified.`);
    return changes.length > 0 ? changes.join(' | ') : "Saved without major changes.";
};

window.updateNavLinks = shortKey => {
    const key = shortKey || PROP_REVERSE_MAP[currentPropertyId] || '';
    document.querySelectorAll('a[href*=".html"]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        const [base] = href.split('?');
        a.setAttribute('href', key ? `${base}?p=${key}` : base);
    });
};

window.syncPropertyUrl = propId => {
    const shortKey = PROP_REVERSE_MAP[propId] || PROP_REVERSE_MAP[currentPropertyId] || '';
    try {
        if (window.location.protocol !== 'blob:' && shortKey) {
            const url = new URL(window.location.href);
            url.searchParams.set('p', shortKey);
            window.history.replaceState({}, '', url.toString());
        }
    } catch (e) {}
    window.updateNavLinks(shortKey);
};

window.triggerAutoSync = async (overrideIn = null, overrideOut = null, roomTypes = null) => {
    if (window.channexConfig && window.channexConfig.apiKey) {
        try {
            const syncFn = httpsCallable(functions, 'channexDeltaSync');
            const cIn = overrideIn || $('check-in')?.value || getLocalYMD(new Date());
            const cOut = overrideOut || $('check-out')?.value || cIn;
            let rTypes = roomTypes;
            if (!rTypes || rTypes.length === 0) {
                const rL = Array.from($$('.assigned-room-select') || []).map(sel => sel.value).filter(Boolean);
                const bType = $('booked-type')?.value;
                const types = new Set();
                rL.forEach(rid => {
                    const hr = hotelRooms.find(r => r.id === rid || r.id === uiToDbRoom(rid) || r.id === dbToUiRoom(rid));
                    if (hr && hr.type) types.add(hr.type);
                });
                if (bType) types.add(bType);
                rTypes = Array.from(types);
            }
            syncFn({ propId: currentPropertyId, checkIn: cIn, checkOut: cOut, roomTypes: rTypes });
        } catch (e) { console.warn("Delta Sync Failed:", e); }
    }
};

export const loadPropertyConfig = async () => {
    try {
        const propsRef = collection(db, 'artifacts', appId, 'public', 'data', 'properties');
        const propsSnap = await getDocs(propsRef);
        const propsList = [];
        propsSnap.forEach(docSnap => propsList.push({ id: docSnap.id, ...docSnap.data() }));

        PROP_MAP = {};
        PROP_REVERSE_MAP = {};
        propsList.forEach(p => {
            const short = (p.short || p.shortCode || p.id).toUpperCase();
            PROP_MAP[short] = p.id;
            PROP_REVERSE_MAP[p.id] = short;
        });
        window.PROP_MAP = PROP_MAP;
        window.PROP_REVERSE_MAP = PROP_REVERSE_MAP;

        if (initialP && PROP_MAP[initialP]) {
            currentPropertyId = PROP_MAP[initialP];
            initialP = null;
        }

        const switcher = $('main-property-switcher');
        if (switcher && propsList.length > 0) {
            switcher.innerHTML = propsList.map(p => `<option value="${p.id}">${(p.name || p.id).toUpperCase()}</option>`).join('');
            if (!propsList.find(p => p.id === currentPropertyId)) {
                currentPropertyId = propsList[0].id;
            }
            switcher.value = currentPropertyId;
        }

        window.syncPropertyUrl(currentPropertyId);
        const propToLoad = propsList.find(p => p.id === currentPropertyId);
        if (propToLoad) {
            window.currentPropertyConfig = propToLoad;
            document.title = propToLoad.name || 'Wild & Wandering PMS';

            const activeIcon = propToLoad.iconUrl || propToLoad.logoUrl || DEFAULT_WW_ICON;
            const logoEl = $('main-brand-logo');
            if (logoEl) logoEl.src = activeIcon;
            window.updateFavicon(activeIcon);

            hotelRooms = (propToLoad.rooms || []).map(r => ({
                ...r,
                category: r.category || r.type || 'Standard',
                type: r.type || r.category || 'Standard'
            }));
            fmpDates = propToLoad.events || [];
            window.hotelRooms = hotelRooms;
            window.fmpDates = fmpDates;
            window.propertyOtaMap = propToLoad.otaMap || [];
            window.channexConfig = propToLoad.channex || {};

            const cxBtn = $('channex-sync-btn');
            if (cxBtn) {
                if (window.channexConfig.apiKey && window.channexConfig.propId) cxBtn.classList.remove('hidden');
                else cxBtn.classList.add('hidden');
            }
        }

        roomTypes = [...new Set(hotelRooms.filter(r => r.type).map(r => r.type))];
        window.roomTypes = roomTypes;

        if (staff && staff.length > 0) {
            staff.forEach(s => {
                const rList = getRooms(s).map(dbToUiRoom);
                s.room = rList[0] || "";
                s.rooms = rList;
            });
        }

        const drop = $('db-room-dropdown');
        if (drop) {
            drop.innerHTML = '';
            roomTypes.forEach(t => drop.innerHTML += `<label><input type="checkbox" value="${t}" onchange="window.updateMultiLabel('db-room-dropdown', 'db-room-label', 'ALL ROOMS'); window.renderDatabase();" class="mr-2"> ${t}</label>`);
            drop.innerHTML += `<label class="text-amber-400 font-black"><input type="checkbox" value="UNASSIGNED" onchange="window.updateMultiLabel('db-room-dropdown', 'db-room-label', 'ALL ROOMS'); window.renderDatabase();" class="mr-2"> UNASSIGNED</label>`;
        }
    } catch (e) { console.error("Failed to load config", e); }
};

window.handlePropertySwitch = async propId => {
    if (!propId || propId === currentPropertyId) return;
    initialP = null;
    $('boot-loader').style.display = 'flex';
    $('sync-status').innerText = 'Switching Property...';
    currentPropertyId = propId;
    try { localStorage.setItem('last_prop', propId); } catch (e) {}
    window.syncPropertyUrl(propId);
    await loadPropertyConfig();
    if (staff && staff.length > 0) {
        staff.forEach(s => {
            const rList = getRooms(s).map(dbToUiRoom);
            s.room = rList[0] || "";
            s.rooms = rList;
        });
    }
    if (window.render) window.render();
    if (window.renderDashboard) window.renderDashboard();
    if (window.renderDatabase) window.renderDatabase();
    $('boot-loader').style.display = 'none';
};

window.switchTab = t => {
    $('dashboard-view').style.display = t === 'dashboard' ? 'flex' : 'none';
    $('calendar-view').style.display = t === 'calendar' ? 'flex' : 'none';
    $('database-view').style.display = t === 'database' ? 'flex' : 'none';
    $('tab-dash').classList.toggle('active', t === 'dashboard');
    $('tab-cal').classList.toggle('active', t === 'calendar');
    $('tab-db').classList.toggle('active', t === 'database');

    const ctxCal = $('context-tools-cal');
    if (ctxCal) {
        if (t === 'calendar') { ctxCal.style.display = 'flex'; setTimeout(() => ctxCal.style.opacity = '1', 50); }
        else { ctxCal.style.opacity = '0'; setTimeout(() => ctxCal.style.display = 'none', 200); }
    }

    if (t === 'database') {
        const navSearchVal = $('guest-search')?.value.trim() || window.searchTerm || '';
        const dbNameInput = $('db-filter-name');
        if (dbNameInput && navSearchVal) dbNameInput.value = navSearchVal;
    }

    if (t === 'calendar' && window.render) window.render();
    if (t === 'database' && window.renderDatabase) window.renderDatabase();
    if (t === 'dashboard' && window.renderDashboard) window.renderDashboard();
};

window.openEmailParserModal = () => { 
    $('email-textarea').value = ''; 
    $('email-modal').style.display = 'flex'; 
    setTimeout(() => $('email-textarea').focus(), 50); 
};



