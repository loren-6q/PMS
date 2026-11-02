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
