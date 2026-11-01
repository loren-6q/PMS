// ==========================================================================
// pms/pms-init.js - Front Desk PMS Core Frame Bootstrapper & Conductor
// Wild & Wandering Property Management System
// ==========================================================================

import { auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// View & Component Engines
import { renderCalendar } from './pms-calendar-grid.js';
import { renderDashboard } from './pms-dashboard.js';
import * as dbModule from './pms-database.js';
import { openGuestModal, initModalDrag } from './pms-folio-modal.js';
import { scrollToToday } from './pms-calendar-tape.js';

// Submodule Side-Effect Registrations
import './pms-folio-actions.js';
import './pms-folio-ledger.js';
import './pms-folio-invoice.js';
import './pms-tm30.js';
import { processAndImportClipboard, processManualPaste } from '../parser/parser-engine.js';

// --- 1. Master Application State ---
export let currentPropertyId = null;
export let staffBookings = [];
export let hotelRooms = [];
export let searchTerm = '';
export let activeTab = 'calendar';
export let matchedSearchIds = [];
export let currentSearchMatchIndex = 0;

function updateSyncStatus(msg) {
    const el = document.getElementById('sync-status');
    if (el) el.innerText = msg;
}

function hideBootLoader() {
    const loader = document.getElementById('boot-loader');
    if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
    }
}

function safeRenderDatabase() {
    if (typeof dbModule.renderDatabase === 'function') {
        dbModule.renderDatabase();
    } else if (typeof dbModule.renderDatabaseTable === 'function') {
        dbModule.renderDatabaseTable();
    } else if (typeof window.renderDatabase === 'function') {
        window.renderDatabase();
    }
}

// --- 2. Master App Bootstrapper ---
export async function initPms() {
    const safetyTimer = setTimeout(() => {
        console.warn("[PMS]: Bootloader safety timeout reached. Dismissing loader.");
        hideBootLoader();
    }, 5000);

    try {
        updateSyncStatus("Connecting to Database...");
        await signInAnonymously(auth);

        updateSyncStatus("Loading Properties...");
        const propsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const props = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const urlParams = new URLSearchParams(window.location.search);
        const urlProp = urlParams.get('p');
        const storedProp = localStorage.getItem('currentPropertyId');

        // Resolve active property
        if (urlProp && props.some(p => p.id === urlProp)) {
            currentPropertyId = urlProp;
        } else if (storedProp && props.some(p => p.id === storedProp)) {
            currentPropertyId = storedProp;
        } else if (props.length > 0) {
            currentPropertyId = props[0].id;
        } else {
            // Fallback: If properties collection is empty on first boot, accept URL or default
            currentPropertyId = urlProp || storedProp || 'loud_samui';
        }

        window.currentPropertyId = currentPropertyId;
        localStorage.setItem('currentPropertyId', currentPropertyId);

        // Populate Main Navbar Property Switcher Dropdown
        const switcher = document.getElementById('main-property-switcher');
        if (switcher) {
            const list = props.length > 0 ? props : [{ id: currentPropertyId, name: currentPropertyId.replace('_', ' ').toUpperCase() }];
            switcher.innerHTML = list.map(p => 
                `<option value="${p.id}" ${p.id === currentPropertyId ? 'selected' : ''}>${(p.name || p.id).toUpperCase()}</option>`
            ).join('');

            switcher.onchange = (e) => {
                const nextProp = e.target.value;
                localStorage.setItem('currentPropertyId', nextProp);
                const u = new URL(window.location.href);
                u.searchParams.set('p', nextProp);
                window.location.href = u.toString();
            };
        }

        const activeProp = props.find(p => p.id === currentPropertyId) || { id: currentPropertyId, rooms: [] };
        hotelRooms = activeProp.rooms || [];
        window.hotelRooms = hotelRooms;
        window.currentPropertyConfig = activeProp;

        initModalDrag();

        updateSyncStatus("Syncing Reservations...");

        // Realtime Firestore Listener
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            staffBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.staff = staffBookings;

            if (activeTab === 'calendar') renderCalendar();
            else if (activeTab === 'dashboard') renderDashboard(staffBookings, currentPropertyId, openGuestModal);
            else if (activeTab === 'database') safeRenderDatabase();

            clearTimeout(safetyTimer);
            hideBootLoader();
        }, (err) => {
            console.error("[PMS Realtime Snapshot Error]:", err);
            clearTimeout(safetyTimer);
            hideBootLoader();
        });

        const hash = (window.location.hash || '').replace('#', '').toLowerCase();
        switchTab(['calendar', 'dashboard', 'database', 'tm30'].includes(hash) ? hash : 'calendar');

    } catch (err) {
        console.error("[PMS Initialization Failed]:", err);
        clearTimeout(safetyTimer);
        hideBootLoader();
    }
}

// --- 3. View Switcher ---
export function switchTab(tabId) {
    activeTab = tabId;
    window.location.hash = tabId;

    const views = {
        calendar: document.getElementById('calendar-view'),
        dashboard: document.getElementById('dashboard-view'),
        database: document.getElementById('database-view'),
        tm30: document.getElementById('tab-content-tm30')
    };

    const buttons = {
        calendar: document.getElementById('tab-cal'),
        dashboard: document.getElementById('tab-dash'),
        database: document.getElementById('tab-db'),
        tm30: document.getElementById('nav-tab-tm30')
    };

    Object.keys(views).forEach(key => {
        if (views[key]) {
            if (key === tabId) {
                views[key].classList.remove('hidden');
                views[key].style.display = (key === 'calendar' || key === 'dashboard') ? 'flex' : 'block';
            } else {
                views[key].classList.add('hidden');
                views[key].style.display = 'none';
            }
        }
        if (buttons[key]) {
            if (key === tabId) {
                buttons[key].classList.add('bg-indigo-600', 'text-white', 'shadow-xs');
                buttons[key].classList.remove('text-slate-600');
            } else {
                buttons[key].classList.remove('bg-indigo-600', 'text-white', 'shadow-xs');
                buttons[key].classList.add('text-slate-600');
            }
        }
    });

    if (tabId === 'calendar') {
        renderCalendar();
        scrollToToday();
    } else if (tabId === 'dashboard') {
        renderDashboard(staffBookings, currentPropertyId, openGuestModal);
    } else if (tabId === 'database') {
        safeRenderDatabase();
    } else if (tabId === 'tm30' && typeof window.renderTm30Table === 'function') {
        window.renderTm30Table();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- 4. Global Search & Jump Match Pill Engine ---
export function handleSearch(term) {
    searchTerm = (term || '').trim().toUpperCase();
    window.searchTerm = searchTerm;

    const jumpBtn = document.getElementById('search-jump-btn');
    const matchCounter = document.getElementById('match-counter');

    if (!searchTerm) {
        matchedSearchIds = [];
        currentSearchMatchIndex = 0;
        if (jumpBtn) jumpBtn.classList.add('hidden');
        renderCalendar();
        safeRenderDatabase();
        return;
    }

    // Filter matching bookings
    const curProp = window.currentPropertyId;
    const matches = (window.staff || []).filter(b => {
        if (b.property !== curProp || b.status === 'cancelled') return false;
        const fn = (b.firstName || '').toUpperCase();
        const ln = (b.lastName || '').toUpperCase();
        const ref = (b.bookId || '').toUpperCase();
        const id = (b.id || '').toUpperCase();
        return fn.includes(searchTerm) || ln.includes(searchTerm) || ref.includes(searchTerm) || id.includes(searchTerm);
    });

    matchedSearchIds = matches.map(m => m.id);
    currentSearchMatchIndex = 0;

    if (jumpBtn && matchCounter) {
        if (matchedSearchIds.length > 0) {
            matchCounter.innerText = `${matchedSearchIds.length} Match${matchedSearchIds.length === 1 ? '' : 'es'}`;
            jumpBtn.classList.remove('hidden');
            jumpBtn.style.display = 'flex';
        } else {
            matchCounter.innerText = '0 Matches';
            jumpBtn.classList.remove('hidden');
            jumpBtn.style.display = 'flex';
        }
    }

    renderCalendar();
    safeRenderDatabase();
}

export function jumpToSearchMatch() {
    if (matchedSearchIds.length === 0) return;
    const targetId = matchedSearchIds[currentSearchMatchIndex];
    currentSearchMatchIndex = (currentSearchMatchIndex + 1) % matchedSearchIds.length;

    // Scroll to matching reservation bar
    const bar = document.querySelector(`.staff-bar[data-booking-id="${targetId}"]`);
    const container = document.getElementById('calendar-scroll-container');
    if (bar && container) {
        const offset = bar.offsetLeft;
        container.scrollTo({
            left: Math.max(0, offset - (container.clientWidth / 2)),
            behavior: 'smooth'
        });
        bar.style.transform = 'scale(1.08)';
        bar.style.boxShadow = '0 0 15px rgba(234, 88, 12, 0.8)';
        setTimeout(() => {
            bar.style.transform = '';
            bar.style.boxShadow = '';
        }, 1200);
    }

    const matchCounter = document.getElementById('match-counter');
    if (matchCounter) {
        matchCounter.innerText = `Match ${currentSearchMatchIndex === 0 ? matchedSearchIds.length : currentSearchMatchIndex}/${matchedSearchIds.length}`;
    }
}

export function clearSearchAndClose() {
    const input = document.getElementById('guest-search');
    if (input) input.value = '';
    handleSearch('');
}

// --- 5. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.renderCalendar = renderCalendar;
    window.switchTab = switchTab;
    window.handleSearch = handleSearch;
    window.jumpToSearchMatch = jumpToSearchMatch;
    window.clearSearchAndClose = clearSearchAndClose;
    window.toggleSearchMode = () => {
        const sc = document.getElementById('search-container');
        if (sc) sc.classList.toggle('hidden');
    };
    window.openEmailParserModal = () => {
        const m = document.getElementById('email-modal');
        if (m) {
            m.classList.add('active');
            m.style.display = 'flex';
        }
    };
    window.parseEmailBooking = () => processManualPaste();
    window.processManualPaste = processManualPaste;
    window.editStaff = (id) => {
        const b = (staffBookings || []).find(x => x.id === id);
        if (b) openGuestModal(b);
    };
    window.saveGuest = () => {
        if (typeof window.saveBooking === 'function') window.saveBooking();
    };
    window.closeModal = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPms);
} else {
    initPms();
}
