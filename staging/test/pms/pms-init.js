// ==========================================================================
// pms/pms-init.js - Core Bootloader, Firebase Realtime Sync & Navigation
// Wild & Wandering Property Management System
// ==========================================================================

import { mountNav } from '../core/nav.js';
import { parseYMD, getLocalYMD } from '../core/dates.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Load All PMS Domain Modules into Browser Context ---
import './pms-calendar-tape.js';
import './pms-calendar-bars.js';
import './pms-calendar-grid.js';
import './pms-database.js';
import './pms-dashboard.js';
import './pms-folio-modal.js';
import './pms-folio-ledger.js';
import './pms-folio-actions.js';
import './pms-folio-invoice.js';
import './pms-tm30.js';
import '../parser/parser-engine.js';
import '../parser/room-assigner.js';

// --------------------------------------------------------------------------
// 1. DOM SELECTORS, FLAGS & FIREBASE CONFIG
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// 2. UI, FAVICON & ROOM TOKENIZATION HELPERS
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// 3. GLOBAL CONTEXT & COMPATIBILITY BRIDGES
// --------------------------------------------------------------------------

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

window.getPaid = s => (s.payments || []).reduce((sum, p) => sum + Number(p.amt), 0);
window.getDue = s => Number((Number(s.totalPrice || 0) - window.getPaid(s)).toFixed(2));

window.closeGuestModal = () => {
    const m = $('guest-modal');
    if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
    }
};

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

// --------------------------------------------------------------------------
// 4. PROPERTY CONFIGURATION & SWITCHER CONTROLLERS
// --------------------------------------------------------------------------

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
            PROP_MAP[p.id.toUpperCase()] = p.id;
            PROP_MAP[p.id.toLowerCase()] = p.id;
            PROP_REVERSE_MAP[p.id] = short;
        });
        window.PROP_MAP = PROP_MAP;
        window.PROP_REVERSE_MAP = PROP_REVERSE_MAP;

        if (initialP) {
            const cleanP = initialP.trim().toUpperCase();
            if (PROP_MAP[cleanP]) {
                currentPropertyId = PROP_MAP[cleanP];
            } else {
                const found = propsList.find(p => p.id.toUpperCase() === cleanP || (p.short && p.short.toUpperCase() === cleanP));
                if (found) currentPropertyId = found.id;
            }
            initialP = null;
        }

        if (!propsList.some(p => p.id === currentPropertyId)) {
            const fallbackMatch = propsList.find(p => 
                p.id.toLowerCase().includes(currentPropertyId.toLowerCase()) || 
                currentPropertyId.toLowerCase().includes(p.id.toLowerCase())
            );
            currentPropertyId = fallbackMatch ? fallbackMatch.id : (propsList[0]?.id || 'swims_resort');
        }

        try { localStorage.setItem('last_prop', currentPropertyId); } catch (e) {}

        const switcher = $('main-property-switcher');
        if (switcher && propsList.length > 0) {
            switcher.innerHTML = propsList.map(p => `<option value="${p.id}">${(p.name || p.id).toUpperCase()}</option>`).join('');
            switcher.value = currentPropertyId;
        }

        window.syncPropertyUrl(currentPropertyId);
        const propToLoad = propsList.find(p => p.id === currentPropertyId) || propsList[0];
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

        // Populate Database Room Categories Dropdown
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
    if (typeof mountNav === 'function') mountNav();
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
    const dashView = $('dashboard-view');
    const calView = $('calendar-view');
    const dbView = $('database-view');

    if (dashView) dashView.style.display = t === 'dashboard' ? 'flex' : 'none';
    if (calView) calView.style.display = t === 'calendar' ? 'flex' : 'none';
    if (dbView) dbView.style.display = t === 'database' ? 'flex' : 'none';

    $('tab-dash')?.classList.toggle('active', t === 'dashboard');
    $('tab-cal')?.classList.toggle('active', t === 'calendar');
    $('tab-db')?.classList.toggle('active', t === 'database');

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
    const ta = $('email-textarea');
    if (ta) ta.value = ''; 
    const m = $('email-modal');
    if (m) {
        m.style.display = 'flex'; 
        setTimeout(() => ta?.focus(), 50); 
    }
};

// --------------------------------------------------------------------------
// 5. CORE BOOTSTRAPPER, AUTHENTICATION & EVENT LISTENERS
// --------------------------------------------------------------------------

export const init = async () => {
    const processSnapshot = snap => {
        staff = snap.docs.map(d => ({ id: d.id, ...d.data() })).map(s => {
            const rList = getRooms(s).map(dbToUiRoom);
            s.room = rList[0] || "";
            s.rooms = rList;
            if (window.healHostelworldDeposit) window.healHostelworldDeposit(s, db, appId);
            return s;
        });
        window.staff = staff;

        const base = ["France", "Germany", "United Kingdom", "United States", "Australia", "Netherlands", "Israel", "Spain", "Italy", "Switzerland", "Canada", "Sweden", "Denmark", "Russia", "Thailand", "Belgium", "Austria", "Ireland", "Norway", "Finland", "Brazil", "Argentina", "South Korea", "Japan", "China", "India", "Mexico", "New Zealand", "South Africa", "Portugal", "Greece"];
        const COUNTRY_CANONICAL = {
            'US': 'United States', 'USA': 'United States', 'UNITED STATES': 'United States',
            'UK': 'United Kingdom', 'GB': 'United Kingdom', 'UNITED KINGDOM': 'United Kingdom',
            'DE': 'Germany', 'GERMAN': 'Germany', 'GERMANY': 'Germany',
            'FR': 'France', 'FRENCH': 'France', 'FRANCE': 'France',
            'IL': 'Israel', 'ISRAEL': 'Israel',
            'AU': 'Australia', 'AUSTRALIA': 'Australia',
            'NL': 'Netherlands', 'NETHERLANDS': 'Netherlands',
            'ES': 'Spain', 'SPAIN': 'Spain',
            'IT': 'Italy', 'ITALY': 'Italy',
            'CH': 'Switzerland', 'SWITZERLAND': 'Switzerland',
            'CA': 'Canada', 'CANADA': 'Canada',
            'SE': 'Sweden', 'SWEDEN': 'Sweden',
            'DK': 'Denmark', 'DENMARK': 'Denmark',
            'RU': 'Russia', 'RUSSIA': 'Russia',
            'TH': 'Thailand', 'THAILAND': 'Thailand',
            'KR': 'South Korea', 'SOUTH KOREA': 'South Korea', 'SOUHT KOREA': 'South Korea',
            'ALGERIA': 'Algeria', 'ALGERIENNE': 'Algeria',
            'TR': 'Turkey', 'TURKEY': 'Turkey',
            'NZ': 'New Zealand', 'NEW ZEALAND': 'New Zealand',
            'HK': 'Hong Kong', 'HONG KONG': 'Hong Kong',
            'BY': 'Belarus', 'BELARUS': 'Belarus'
        };

        const cleanCountries = new Set(base);
        staff.forEach(s => {
            if (!s.country) return;
            const raw = s.country.trim();
            if (!raw || raw.toLowerCase().includes('folio') || raw.toLowerCase().includes('invoice') || raw.length < 2) return;
            const lookup = raw.toUpperCase();
            if (COUNTRY_CANONICAL[lookup]) {
                cleanCountries.add(COUNTRY_CANONICAL[lookup]);
            } else if (raw.length > 2 && /^[A-Za-z\s\-]+$/.test(raw)) {
                const formatted = raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                cleanCountries.add(formatted);
            }
        });

        const dl = $('country-list');
        if (dl) dl.innerHTML = [...cleanCountries].sort().map(c => `<option value="${c}"></option>`).join('');

        if ($('calendar-view')?.style.display !== 'none' && window.render) window.render();
        if ($('dashboard-view')?.style.display === 'flex' && window.renderDashboard) window.renderDashboard();
        if ($('database-view')?.style.display === 'flex' && window.renderDatabase) window.renderDatabase();

        setTimeout(() => { if (window.runDiscrepancyAudit) window.runDiscrepancyAudit(); }, 200);

        const editId = new URLSearchParams(window.location.search).get('edit');
        if (editId && window.editStaff) { 
            window.editStaff(editId); 
            try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) {} 
        }
    };

    const bypassLogin = async () => {
        const safetyTimer = setTimeout(() => {
            const bl = $('boot-loader');
            if (bl && bl.style.display !== 'none') bl.style.display = 'none';
        }, 3500);

        try {
            if (typeof window.__initial_auth_token !== 'undefined') {
                try { await signInWithCustomToken(auth, window.__initial_auth_token); }
                catch (tokenErr) { await signInAnonymously(auth); }
            } else {
                await signInAnonymously(auth);
            }

            currentUserRole = 'admin';
            currentUserEmail = 'admin';
            window.currentUserRole = currentUserRole;
            window.currentUserEmail = currentUserEmail;
            $$('.admin-only').forEach(el => el.classList.remove('hidden'));

            await loadPropertyConfig();

            if (typeof mountNav === 'function') mountNav();

            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), processSnapshot, err => {
                if (window.showAlert) window.showAlert("Database Permission Denied.");
            });
        } catch (e) {
            console.error("Auth bypass error:", e);
            if ($('sync-status')) $('sync-status').innerText = "Auth Error";
        } finally {
            clearTimeout(safetyTimer);
            const bl = $('boot-loader');
            if (bl) bl.style.display = 'none';
        }
    };
    
    if (typeof window.__initial_auth_token !== 'undefined' || !REQUIRE_LOGIN) {
        bypassLogin();
    } else {
        onAuthStateChanged(auth, async user => {
            if (user) {
                currentUserRole = 'admin';
                currentUserEmail = (user.email || 'admin@test.local').toLowerCase();
                window.currentUserRole = currentUserRole;
                window.currentUserEmail = currentUserEmail;
                $('boot-loader').style.display = 'none';
                await loadPropertyConfig();
                if (typeof mountNav === 'function') mountNav();
                onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), processSnapshot, err => {
                    if (window.showAlert) window.showAlert("Database Permission Denied.");
                    $('boot-loader').style.display = 'none';
                });
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    const tBodyEl = $('timeline-body');
    if (tBodyEl) {
        tBodyEl.addEventListener('mouseover', e => {
            const col = e.target.closest('.day-column');
            if (col && col.dataset.colIndex !== undefined) {
                const idx = col.dataset.colIndex;
                $$(`[data-col-index="${idx}"]`).forEach(el => el.classList.add('hover-col'));
            }
        });

        tBodyEl.addEventListener('mouseout', e => {
            const col = e.target.closest('.day-column');
            if (col && col.dataset.colIndex !== undefined) {
                const idx = col.dataset.colIndex;
                $$(`[data-col-index="${idx}"]`).forEach(el => el.classList.remove('hover-col'));
            }
        });

        tBodyEl.addEventListener('click', e => {
            const col = e.target.closest('.day-column');
            if (!col) return;
            const dStr = col.dataset.dateIso;
            const rId = col.dataset.roomId || "";
            if (!dStr) return;

            const modal = $('guest-modal');
            const isModalOpen = modal && (modal.classList.contains('active') || window.getComputedStyle(modal).display !== 'none');
            if (isModalOpen) {
                if (rId) {
                    const curSelects = Array.from($$('.assigned-room-select'));
                    const emptySelect = curSelects.find(s => !s.value);
                    if (emptySelect) emptySelect.value = rId;
                    else if (!curSelects.some(s => s.value === rId) && window.addRoomSelect) window.addRoomSelect(rId);
                    if (window.updateAvailableRooms) window.updateAvailableRooms();
                }
                return;
            }
            if (window.quickAdd) window.quickAdd(rId, new Date(dStr + "T12:00:00Z"));
        });
    }

    window.addEventListener('resize', () => {
        if ($('calendar-view')?.style.display !== 'none' && window.render) window.render();
    });
    if (window.updateNavLinks) window.updateNavLinks();
    if (window.lucide) window.lucide.createIcons();
    if (window.mountLegendSvgs) window.mountLegendSvgs();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
