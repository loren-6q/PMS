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
import { renderDatabaseTable } from './pms-database.js';
import { openGuestModal, initModalDrag } from './pms-folio-modal.js';
import { scrollToToday } from './pms-calendar-tape.js';

// Submodule Side-Effect Registrations
import './pms-folio-actions.js';
import './pms-folio-ledger.js';
import './pms-folio-invoice.js';

// --- 1. Master Application State ---
export let currentPropertyId = null;
export let staffBookings = [];
export let hotelRooms = [];
export let searchTerm = '';
export let activeTab = 'calendar';

// --- 2. Master App Bootstrapper ---
export async function initPms() {
    const loader = document.getElementById('boot-loader');
    if (loader) loader.style.display = 'flex';

    try {
        await signInAnonymously(auth);

        // Fetch configured properties from database
        const propsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'properties'));
        const props = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const urlParams = new URLSearchParams(window.location.search);
        const urlProp = urlParams.get('p');
        const storedProp = localStorage.getItem('currentPropertyId');

        // Zero-Hardcoding Property Resolution
        if (urlProp && props.some(p => p.id === urlProp)) {
            currentPropertyId = urlProp;
        } else if (storedProp && props.some(p => p.id === storedProp)) {
            currentPropertyId = storedProp;
        } else if (props.length > 0) {
            currentPropertyId = props[0].id;
        } else {
            currentPropertyId = null;
        }

        if (!currentPropertyId) {
            if (loader) loader.style.display = 'none';
            alert("No Property Found: Please set up a property in the Setup Wizard first.");
            return;
        }

        window.currentPropertyId = currentPropertyId;
        localStorage.setItem('currentPropertyId', currentPropertyId);

        // Populate Property Switcher in Navbar
        const switcher = document.getElementById('main-property-switcher');
        if (switcher && props.length > 0) {
            switcher.innerHTML = props.map(p => 
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

        const activeProp = props.find(p => p.id === currentPropertyId) || props[0];
        hotelRooms = activeProp?.rooms || [];
        window.hotelRooms = hotelRooms;
        window.currentPropertyConfig = activeProp;

        initModalDrag();

        // Attach Realtime Reservation Listener
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'staff'), (snap) => {
            staffBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.staff = staffBookings;

            // Trigger active view render
            if (activeTab === 'calendar') renderCalendar();
            else if (activeTab === 'dashboard') renderDashboard(staffBookings, currentPropertyId, openGuestModal);
            else if (activeTab === 'database') renderDatabaseTable();

            if (loader) loader.style.display = 'none';
        }, (err) => {
            console.error("[PMS Realtime Snapshot Error]:", err);
            if (loader) loader.style.display = 'none';
        });

        // Initialize active tab from URL hash or default to calendar
        const hash = (window.location.hash || '').replace('#', '').toLowerCase();
        switchTab(['calendar', 'dashboard', 'database'].includes(hash) ? hash : 'calendar');

    } catch (err) {
        console.error("[PMS Initialization Failed]:", err);
        if (loader) loader.style.display = 'none';
    }
}

// --- 3. View Switcher (Nav Links) ---
export function switchTab(tabId) {
    activeTab = tabId;
    window.location.hash = tabId;

    const views = {
        calendar: document.getElementById('tab-content-calendar') || document.getElementById('calendar-view'),
        dashboard: document.getElementById('tab-content-dashboard') || document.getElementById('dashboard-view'),
        database: document.getElementById('tab-content-database') || document.getElementById('database-view')
    };

    const buttons = {
        calendar: document.getElementById('nav-tab-calendar') || document.getElementById('tab-cal'),
        dashboard: document.getElementById('nav-tab-dashboard') || document.getElementById('tab-dash'),
        database: document.getElementById('nav-tab-database') || document.getElementById('tab-db')
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
        renderDatabaseTable();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- 4. Global Search Handler ---
export function handleSearch(term) {
    searchTerm = (term || '').trim().toUpperCase();
    window.searchTerm = searchTerm;
    if (activeTab === 'calendar') renderCalendar();
    else if (activeTab === 'database') renderDatabaseTable();
}

// --- 5. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.renderCalendar = renderCalendar;
    window.switchTab = switchTab;
    window.handleSearch = handleSearch;
    window.editStaff = (id) => {
        const b = (staffBookings || []).find(x => x.id === id);
        if (b) openGuestModal(b);
    };
}

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPms);
} else {
    initPms();
}
