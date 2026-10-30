// ==========================================================================
// core/config.js - Firebase Infrastructure & Environment Configuration
// Wild & Wandering Property Management System
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCyz--TlQZf_d-YNxhtGCV29LuFoRBfEeU",
    authDomain: "swimspms.firebaseapp.com",
    projectId: "swimspms",
    storageBucket: "swimspms.firebasestorage.app",
    messagingSenderId: "989960113115",
    appId: "1:989960113115:web:a99e08a23a36ff4289f5fe"
};

export const appId = 'hotel-pms-v1';
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'asia-southeast1');

// Safe Staging Environment Detector
export const IS_STAGING = typeof window !== 'undefined' && (
    window.location.pathname.includes('/staging/') || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
);

// Bridge critical instances to window for third-party scripts & console diagnostics
if (typeof window !== 'undefined') {
    window.app = app;
    window.auth = auth;
    window.db = db;
    window.storage = storage;
    window.functions = functions;
    window.appId = appId;
    window.IS_STAGING = IS_STAGING;
}
