// ==========================================================================
// setup/setup-wizard.js - 5-Step Stepper Navigation & Data Orchestrator
// Wild & Wandering Property Management System
// ==========================================================================

import { auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';

import { renderPaymentMethodsTable, renderAddonsTable, updateLogoPreview, normalizePaymentMethods } from './setup-profile.js';
import { renderRoomDefinitionsTable, compileRoomsFromDefinitions } from './setup-rooms.js';
import { renderStep3UnifiedMapping } from './setup-mapping.js';
import { renderPricingConfig } from './setup-pricing.js';
import { renderHealthAuditBanner } from '../core/health-audit.js';

export let currentStep = 1;

// --- 5-Step Stepper Router (Powered by style.css .step-pill) ---
export function jumpStep(stepNum) {
    currentStep = Math.max(1, Math.min(5, parseInt(stepNum, 10) || 1));

    for (let i = 1; i <= 5; i++) {
        const pill = document.getElementById(`pill-step-${i}`);
        const content = document.getElementById(`step-content-${i}`);

        if (pill) {
            pill.classList.toggle('active', i === currentStep);
            pill.classList.toggle('completed', i < currentStep);
        }
        if (content) content.classList.toggle('hidden', i !== currentStep);
    }

    const indicator = document.getElementById('wizard-step-indicator');
    if (indicator) indicator.innerText = `Step ${currentStep} of 5`;

    const prevBtn = document.getElementById('btn-prev-step');
    if (prevBtn) prevBtn.disabled = (currentStep === 1);

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

export async function launchApp(target) {
    const page = target === 'cm' ? 'cm.html' : 'pms.html';
    const propId = window.currentPropertyId || 'swims_resort';
    try {
        localStorage.setItem('last_prop', propId);
        await savePropertyToDatabase(false);
    } catch (e) {
        console.warn("[Launch Save Notice]:", e);
    }
    window.location.href = `${page}?p=${encodeURIComponent(propId)}`;
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
    const eventsEl = document.getElementById('rev-events-status');

    if (nameEl) nameEl.innerText = document.getElementById('prop-name')?.value || window.currentPropertyId;
    if (codeEl) codeEl.innerText = document.getElementById('prop-short')?.value || window.currentPropertyId.toUpperCase();
    if (invEl) invEl.innerText = `${activeBeds.length} Active Beds (${activeRooms.length} Rooms)`;
    if (catEl) catEl.innerText = `${new Set(activeRooms.map(r => r.category)).size} Categories`;
    if (chanEl) chanEl.innerText = (window.channexMap || []).length > 0 ? `${window.channexMap.length} Categories Mapped` : 'Unmapped';
    if (plansEl) plansEl.innerText = `${(window.channexRateMap || []).length} Rate Plans`;
    if (eventsEl) eventsEl.innerText = window.enableEventRates ? 'Events: On' : 'Events: Off';
}

// --- Hydrate All Input Fields and Tables from Property Data ---
export async function loadPropertyData(propId) {
    window.currentPropertyId = propId;

    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId));
        const pricingSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`));
        const pricingDoc = pricingSnap.exists() ? pricingSnap.data() : {};

        if (snap.exists()) {
            const data = snap.data();
            window.currentPropertyConfig = { id: snap.id, ...data };

            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            setVal('prop-name', data.name);
            setVal('prop-short', data.short);
            setVal('prop-currency', data.currency || 'THB');
            setVal('prop-timezone', data.timezone || 'Asia/Bangkok');
            setVal('prop-address', data.address);
            setVal('prop-email', data.email);
            setVal('prop-phone', data.phone);
            setVal('prop-logo-url', data.logoUrl);
            setVal('prop-banner-url', data.bannerUrl);
            setVal('prop-icon-url', data.iconUrl);

            updateLogoPreview('primary', data.logoUrl);
            updateLogoPreview('banner', data.bannerUrl);
            updateLogoPreview('icon', data.iconUrl);

            window.roomDefinitions = Array.isArray(data.roomDefinitions) ? data.roomDefinitions : [];
            window.paymentMethods = normalizePaymentMethods(Array.isArray(data.payments) ? data.payments : []);
            window.addonsList = Array.isArray(data.addons) && data.addons.length > 0 ? data.addons : null;
            window.channexRooms = Array.isArray(data.channexRooms) ? data.channexRooms : [];
            window.channexRatePlans = Array.isArray(data.channexRatePlans) ? data.channexRatePlans : [];
            window.channexMap = Array.isArray(data.channexMap) ? data.channexMap : [];
            window.channexRateMap = Array.isArray(data.channexRateMap) ? data.channexRateMap : [];
            window.enableEventRates = data.enableEventRates !== undefined
                ? !!data.enableEventRates
                : ((data.events || []).length > 0);

            let parsedMasterPricing = data.masterPricing || {};
            if (typeof parsedMasterPricing === 'string') {
                try { parsedMasterPricing = JSON.parse(parsedMasterPricing); } catch (e) { parsedMasterPricing = {}; }
            }
            window.masterPricing = parsedMasterPricing;

            let parsedPricingRules = data.pricingRules || {};
            if (typeof parsedPricingRules === 'string') {
                try { parsedPricingRules = JSON.parse(parsedPricingRules); } catch (e) { parsedPricingRules = {}; }
            }
            window.pricingRules = parsedPricingRules;

            window.savedAutofillBaselines = {
                ...(pricingDoc.autofillBaselines || {}),
                ...(data.autofillBaselines || {})
            };

            setVal('chan-api-key', data.channex?.apiKey);
            setVal('chan-prop-id', data.channex?.propId);

            renderPaymentMethodsTable(window.paymentMethods);
            renderAddonsTable(window.addonsList);
            renderRoomDefinitionsTable();
            renderStep3UnifiedMapping();
            renderPricingConfig();
        }
    } catch (err) {
        console.error("[Property Hydration Error]:", err);
    }
}

// --- Save Property to Firestore with Automatic Rolling Backup ---
export async function savePropertyToDatabase(notify = true) {
    const btn = document.getElementById('btn-save-header');
    const btnFooter = document.getElementById('btn-save-footer');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="save" size="13"></i> <span>SAVING...</span>`; }
    if (btnFooter) { btnFooter.disabled = true; btnFooter.innerHTML = `<i data-lucide="save" size="12"></i> <span>SAVING...</span>`; }

    try {
        const propId = window.currentPropertyId || 'swims_resort';
        const compiled = compileRoomsFromDefinitions();

        // 1. Immutable Rolling Backup
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${propId}_${Date.now()}`);
        await setDoc(backupRef, {
            roomDefinitions: window.roomDefinitions || [],
            rooms: compiled,
            savedAt: new Date().toISOString()
        });

        // 2. Persist Property Document
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
            payments: normalizePaymentMethods(window.paymentMethods || []),
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: compiled,
            channex: {
                apiKey: document.getElementById('chan-api-key')?.value.trim() || '',
                propId: document.getElementById('chan-prop-id')?.value.trim() || ''
            },
            channexRooms: window.channexRooms || [],
            channexRatePlans: window.channexRatePlans || [],
            channexMap: window.channexMap || [],
            channexRateMap: window.channexRateMap || [],
            enableEventRates: !!window.enableEventRates,
            pricingRules: window.pricingRules || {},
            masterPricing: window.masterPricing || {},
            autofillBaselines: window.savedAutofillBaselines || {},
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), propData, { merge: true });

        // Keep master pricing doc synchronized with Step 4 rules & event curves
        const pricingUpdatePayload = {
            relationships: window.masterPricing?.relationships || [],
            pricingRules: window.pricingRules || {},
            autofillBaselines: window.savedAutofillBaselines || {},
            updatedAt: new Date().toISOString()
        };
        if (window._timelineMigratedByRename && window.masterPricing?.timeline) {
            pricingUpdatePayload.timeline = typeof window.masterPricing.timeline === 'string'
                ? window.masterPricing.timeline
                : JSON.stringify(window.masterPricing.timeline);
            window._timelineMigratedByRename = false;
        }
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pricing', `master_${propId}`), pricingUpdatePayload, { merge: true });
        renderHealthAuditBanner('setup-health-banner', 'setup');

        window.currentPropertyConfig = { ...propData };

        if (propData.channex.apiKey && propData.channex.propId && typeof window.triggerAutoSync === 'function') {
            const todayStr = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);
            window.triggerAutoSync(todayStr, futureDate.toISOString().split('T')[0]);
        }

        if (notify) customAlert("Saved", `Property configuration for "${propData.name}" saved and backed up.`);

    } catch (err) {
        console.error("[Setup Save Error]:", err);
        customAlert("Save Error", err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="save" size="13"></i> <span>SAVE</span>`; }
        if (btnFooter) { btnFooter.disabled = false; btnFooter.innerHTML = `<i data-lucide="save" size="12"></i> <span>SAVE</span>`; }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }
}

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
        if (typeof window.switchProperty === 'function') {
            window.switchProperty(slug);
        } else {
            window.location.search = `?p=${slug}`;
        }
    } catch (e) {
        customAlert("Creation Failed", e.message);
    }
}

export async function initSetup() {
    try {
        await signInAnonymously(auth);

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
        window.currentPropertyId = toCanonicalPropId(pParam);

        await loadPropertyData(window.currentPropertyId);
        const startStep = parseInt(urlParams.get('step'), 10) || 1;
        jumpStep(startStep);
        renderHealthAuditBanner('setup-health-banner', 'setup');

    } catch (err) {
        console.error("[Setup Boot Error]:", err);
    }
}

if (typeof window !== 'undefined') {
   window.jumpStep = jumpStep;
    window.nextStep = nextStep;
    window.prevStep = prevStep;
    window.launchApp = launchApp;
    window.savePropertyToDatabase = savePropertyToDatabase;
    window.openNewPropertyModal = openNewPropertyModal;
    window.closeNewPropertyModal = closeNewPropertyModal;
    window.confirmCreateNewProperty = confirmCreateNewProperty;
    window.switchSetupProperty = (id) => {
        if (typeof window.switchProperty === 'function') {
            window.switchProperty(id);
        } else {
            window.location.search = `?p=${id}`;
        }
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetup);
} else {
    initSetup();
}
