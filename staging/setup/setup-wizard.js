// ==========================================================================
// setup/setup-wizard.js - 5-Step Stepper Navigation & Data Orchestrator
// Wild & Wandering Property Management System
// ==========================================================================

import { app, auth, db, appId } from '../core/config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { customAlert } from '../core/ui-dialogs.js';
import { loadPropertiesCatalog, toCanonicalPropId } from '../core/properties.js';

import { renderPaymentMethodsTable, renderAddonsTable, updateLogoPreview } from './setup-profile.js';
import { renderRoomDefinitionsTable, compileRoomsFromDefinitions } from './setup-rooms.js';
import { renderUnifiedMappingCards } from './setup-mapping.js';
import { renderPricingConfig } from './setup-pricing.js';

export let currentStep = 1;

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

    // Refresh view tables on jump
    if (currentStep === 1) {
        renderPaymentMethodsTable();
        renderAddonsTable();
    } else if (currentStep === 2) {
        renderRoomDefinitionsTable();
    } else if (currentStep === 3) {
        renderUnifiedMappingCards();
    } else if (currentStep === 4) {
        renderPricingConfig();
    } else if (currentStep === 5) {
        updateReviewScreen();
    }

    if (window.lucide) window.lucide.createIcons();
}

export function nextStep() {
    if (currentStep < 5) jumpStep(currentStep + 1);
}

export function prevStep() {
    if (currentStep > 1) jumpStep(currentStep - 1);
}

export function updateReviewScreen() {
    const definitions = window.roomDefinitions || [];
    const activeRooms = definitions.filter(r => !r.inactive);
    const activeBeds = compileRoomsFromDefinitions().filter(r => !r.inactive);

    const nameEl = document.getElementById('rev-prop-name');
    const codeEl = document.getElementById('rev-prop-code');
    const invEl = document.getElementById('rev-inv-count');
    const catEl = document.getElementById('rev-cat-count');
    const chanEl = document.getElementById('rev-chan-status');

    if (nameEl) nameEl.innerText = document.getElementById('prop-name')?.value || window.currentPropertyId;
    if (codeEl) codeEl.innerText = document.getElementById('prop-short')?.value || window.currentPropertyId.toUpperCase();
    if (invEl) invEl.innerText = `${activeBeds.length} Active Beds`;
    if (catEl) catEl.innerText = `${new Set(activeRooms.map(r => r.category)).size} Categories`;
    if (chanEl) chanEl.innerText = (window.channexMap || []).length > 0 ? `${window.channexMap.length} Categories Mapped` : 'Unmapped';
}

export async function savePropertyToDatabase(notify = true) {
    const btn = document.getElementById('btn-save-header');
    if (btn) btn.disabled = true;

    try {
        const propId = window.currentPropertyId || 'swims_resort';
        const compiled = compileRoomsFromDefinitions();

        // 1. Immutable Rolling Backup in Firestore
        const backupRef = doc(db, 'artifacts', appId, 'public', 'data', 'properties_backups', `${propId}_${Date.now()}`);
        await setDoc(backupRef, {
            roomDefinitions: window.roomDefinitions,
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
            payments: window.paymentMethods || [],
            addons: window.addonsList || [],
            roomDefinitions: window.roomDefinitions || [],
            rooms: compiled,
            channex: {
                apiKey: document.getElementById('chan-api-key')?.value.trim() || '',
                propId: document.getElementById('chan-prop-id')?.value.trim() || ''
            },
            channexMap: window.channexMap || [],
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'properties', propId), propData, { merge: true });

        if (notify) customAlert("Saved", `Property configuration for ${propData.name} saved and backed up.`);

    } catch (err) {
        console.error("[Setup Save Error]:", err);
        customAlert("Save Error", err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function initSetup() {
    try {
        await signInAnonymously(auth);

        const props = await loadPropertiesCatalog();
        const urlParams = new URLSearchParams(window.location.search);
        const pParam = urlParams.get('p') || localStorage.getItem('last_prop') || 'swims_resort';
        window.currentPropertyId = toCanonicalPropId(pParam);

        const activeProp = props.find(p => p.id === window.currentPropertyId) || props[0];
        window.currentPropertyConfig = activeProp;

        const switcher = document.getElementById('property-select');
        if (switcher && props.length > 0) {
            switcher.innerHTML = props.map(p => 
                `<option value="${p.id}" ${p.id === window.currentPropertyId ? 'selected' : ''}>${p.name.toUpperCase()}</option>`
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
            window.channexMap = activeProp.channexMap || [];
            setVal('chan-api-key', activeProp.channex?.apiKey);
            setVal('chan-prop-id', activeProp.channex?.propId);

            renderPaymentMethodsTable(activeProp.payments);
            renderAddonsTable(activeProp.addons);
            renderRoomDefinitionsTable();
        }

        jumpStep(1);

    } catch (err) {
        console.error("[Setup Boot Error]:", err);
    }
}

if (typeof window !== 'undefined') {
    window.jumpStep = jumpStep;
    window.nextStep = nextStep;
    window.prevStep = prevStep;
    window.savePropertyToDatabase = savePropertyToDatabase;
    window.switchSetupProperty = (id) => {
        window.location.search = `?p=${id}`;
    };
}

document.addEventListener('DOMContentLoaded', initSetup);
