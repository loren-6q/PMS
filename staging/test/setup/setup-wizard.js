// ==========================================================================
// setup/setup-wizard.js - 5-Step Stepper Navigation & Data Orchestrator
// Wild & Wandering Property Management System
// ==========================================================================

import { app, auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';

import { renderPaymentMethodsTable, renderAddonsTable, updateLogoPreview } from './setup-profile.js';
import { renderRoomDefinitionsTable, compileRoomsFromDefinitions } from './setup-rooms.js';
import { renderStep3UnifiedMapping } from './setup-mapping.js';
import { renderPricingConfig } from './setup-pricing.js';

export let currentStep = 1;

// --- 5-Step Stepper Router ---
export function jumpStep(stepNum) {
    currentStep = Math.max(1, Math.min(5, parseInt(stepNum, 10) || 1));

    for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById(`pill-step-${i}`);
        const badge = document.getElementById(`badge-step-${i}`);
        const content = document.getElementById(`step-content-${i}`);

        if (pill) {
            pill.classList.toggle('active', i === currentStep);
            pill.classList.toggle('completed', i < currentStep);
        }
        if (badge) {
            badge.className = i === currentStep
                ? "w-5 h-5 rounded bg-white text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs"
                : (i < currentStep
                    ? "w-5 h-5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px] flex items-center justify-center shrink-0 border border-emerald-300"
                    : "w-5 h-5 rounded bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0 border border-slate-200");
        }
        if (content) content.classList.toggle('hidden', i !== currentStep);
    }

    const indicator = document.getElementById('wizard-step-indicator');
    if (indicator) indicator.innerText = `Step ${currentStep} of 5`;

    const prevBtn = document.getElementById('btn-prev-step');
    if (prevBtn) prevBtn.disabled = (currentStep === 1);

    // Refresh active step tables on transition
    if (currentStep === 1) {
        renderPaymentMethodsTable();
        renderAddonsTable();
    } else if (currentStep === 2) {
        renderRoomDefinitionsTable();
    } else if (currentStep === 3) {
        renderStep3UnifiedMapping();
    } else if (currentStep === 4) {
        renderPricingConfig();
    } else if (currentStep === 5) {
        updateStep5Review();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

export function nextStep() {
    if (currentStep < 5) jumpStep(currentStep + 1);
}

export function prevStep() {
    if (currentStep > 1) jumpStep(currentStep - 1);
}

// --- Step 5 Review Screen Populator ---
export function updateStep5Review() {
    const definitions = window.roomDefinitions || [];
    const activeRooms = definitions.filter(r => !r.inactive);
    const activeBeds = compileRoomsFromDefinitions().filter(r => !r.inactive);

    const nameEl = document.getElementById('rev-prop-name');
    const codeEl = document.getElementById('rev-prop-code');
    const invEl = document.getElementById('rev-inv-count');
    const catEl = document.getElementById('rev-cat-count');
    const chanEl = document.getElementById('rev-chan-status');
    const plansEl = document.getElementById('rev-chan-plans');

    if (nameEl) nameEl.innerText = document.getElementById('prop-name')?.value || window.currentPropertyId;
    if (codeEl) codeEl.innerText = document.getElementById('prop-short')?.value || window.currentPropertyId.toUpperCase();
    if (invEl) invEl.innerText = `${activeBeds.length} Active Beds (${activeRooms.length} Rooms)`;
    if (catEl) catEl.innerText = `${new Set(activeRooms.map(r => r.category)).size} Categories`;
    if (chanEl) chanEl.innerText = (window.channexMap || []).length > 0 ? `${window.channexMap.length} Categories Mapped` : 'Unmapped';
    if (plansEl) plansEl.innerText = `${(window.channexRateMap || []).length} Rate Plans`;
}

// --- Cloud Persistence with Non-Destructive Merging & Automatic Backup ---
export async function savePropertyToDatabase(notify = true) {
    const btn = document.getElementById('btn-save-header');
    const btnFooter = document.getElementById('btn-save-footer');
    if (btn) { btn.disabled = true; btn.innerText = "SAVING..."; }
    if (btnFooter) btnFooter.disabled = true;

    try {
        const propId = window.currentPropertyId || 'swims_resort';
        const compiled = compileRoomsFromDefinitions();

        // 1. Immutable Rolling Backup in Firestore before changes
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${propId}_${Date.now()}`);
        await setDoc(backupRef, {
            roomDefinitions: window.roomDefinitions || [],
            rooms: compiled,
            savedAt: new Date().toISOString()
        });

        // 2. Persist Property Configuration
        const propData = {
            id: propId,
            name: document.getElementById('prop-name')?.value.trim() || propId,
            short: document.getElementById('prop-short')?.value.trim().toUpperCase() || 'PROP',
            currency: document.getElementById('prop-currency')?.value || 'THB',
            timezone: document.getElementById('prop-timezone')?.value || 'Asia/Bangkok',
            address: document.getElementById('prop-address')?.value || '',
            email: document.getElementById('prop-email')?.value || '',
            phone: document.getElementById('prop-phone')?.value || '',
            logoUrl: document.getElementById('prop-logo-url')?.value || '',
            bannerUrl: document.getElementById('prop-banner-url')?.value || '',
            iconUrl: document.getElementById('prop-icon-url')?.value || '',
            payments: window.paymentMethods || [],
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: compiled,
            channex: {
                apiKey: document.getElementById('chan-api-key')?.value.trim() || '',
                propId: document.getElementById('chan-prop-id')?.value.trim() || ''
            },
            channexMap: window.channexMap || [],
            channexRateMap: window.channexRateMap || [],
            pricingRules: window.pricingRules || {},
            masterPricing: window.masterPricing || {},
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), propData, { merge: true });
        window.currentPropertyConfig = { ...propData };

        // 3. Auto-Push Updated Capacity to Channex if credentials exist
        if (propData.channex.apiKey && propData.channex.propId && typeof window.triggerAutoSync === 'function') {
            const todayStr = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);
            const futureStr = futureDate.toISOString().split('T')[0];
            window.triggerAutoSync(todayStr, futureStr);
        }

        if (notify) customAlert("Saved", `Configuration for "${propData.name}" saved, backed up, and synced.`);

    } catch (err) {
        console.error("[Setup Save Error]:", err);
        customAlert("Save Error", err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
        if (btnFooter) btnFooter.disabled = false;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }
}

// --- New Property Modal Controllers ---
export function openNewPropertyModal() {
    const modal = document.getElementById('new-property-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

export function closeNewPropertyModal() {
    const modal = document.getElementById('new-property-modal');
    if (modal) modal.classList.add('hidden');
}

export async function confirmCreateNewProperty() {
    const name = document.getElementById('new-prop-input-name')?.value.trim();
    const short = document.getElementById('new-prop-input-short')?.value.trim().toUpperCase();
    const slug = document.getElementById('new-prop-input-id')?.value.trim().toLowerCase();

    if (!name || !slug) return customAlert("Input Required", "Provide both Property Name and Slug.");

    try {
        const propData = {
            id: slug,
            name,
            short: short || slug.toUpperCase(),
            currency: 'THB',
            timezone: 'Asia/Bangkok',
            roomDefinitions: [],
            rooms: [],
            payments: [],
            addons: [],
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', slug), propData);
        closeNewPropertyModal();
        window.location.search = `?p=${slug}`;
    } catch (e) {
        customAlert("Creation Failed", e.message);
    }
}

export function launchApp(appName) {
    const p = window.currentPropertyId || 'swims_resort';
    window.location.href = `${appName}.html?p=${p}`;
}

// --- Setup Wizard Master Bootstrapper ---
export async function initSetup() {
    try {
        await signInAnonymously(auth);

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
        window.currentPropertyId = toCanonicalPropId(pParam);

        const activeProp = props.find(p => p.id === window.currentPropertyId) || props[0];
        window.currentPropertyConfig = activeProp || {};

        const switcher = document.getElementById('property-select');
        if (switcher && props.length > 0) {
            switcher.innerHTML = props.map(p => 
                `<option value="${p.id}" ${p.id === window.currentPropertyId ? 'selected' : ''}>${(p.name || p.id).toUpperCase()}</option>`
            ).join('');
        }

        if (activeProp) {
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            setVal('prop-name', activeProp.name);
            setVal('prop-short', activeProp.short);
            setVal('prop-currency', activeProp.currency || 'THB');
            setVal('prop-timezone', activeProp.timezone || 'Asia/Bangkok');
            setVal('prop-address', activeProp.address);
            setVal('prop-email', activeProp.email);
            setVal('prop-phone', activeProp.phone);
            setVal('prop-logo-url', activeProp.logoUrl);
            setVal('prop-banner-url', activeProp.bannerUrl);
            setVal('prop-icon-url', activeProp.iconUrl);

            updateLogoPreview('primary', activeProp.logoUrl);
            updateLogoPreview('banner', activeProp.bannerUrl);
            updateLogoPreview('icon', activeProp.iconUrl);

            window.roomDefinitions = activeProp.roomDefinitions || [];
            window.paymentMethods = activeProp.payments || [];
            window.addonsList = activeProp.addons || [];
            window.channexMap = activeProp.channexMap || [];
            window.channexRateMap = activeProp.channexRateMap || [];
            window.pricingRules = activeProp.pricingRules || {};
            window.masterPricing = activeProp.masterPricing || {};

            setVal('chan-api-key', activeProp.channex?.apiKey);
            setVal('chan-prop-id', activeProp.channex?.propId);

            renderPaymentMethodsTable();
            renderAddonsTable();
            renderRoomDefinitionsTable();
        }

        jumpStep(1);

    } catch (err) {
        console.error("[Setup Boot Error]:", err);
    }
}

// Global Window Exports
if (typeof window !== 'undefined') {
    window.jumpStep = jumpStep;
    window.nextStep = nextStep;
    window.prevStep = prevStep;
    window.savePropertyToDatabase = savePropertyToDatabase;
    window.openNewPropertyModal = openNewPropertyModal;
    window.closeNewPropertyModal = closeNewPropertyModal;
    window.confirmCreateNewProperty = confirmCreateNewProperty;
    window.launchApp = launchApp;
    window.switchSetupProperty = (id) => { window.location.search = `?p=${id}`; };
}

document.addEventListener('DOMContentLoaded', initSetup);
