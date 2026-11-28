// firebase-db.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuriSOHjlUTwOuB8HwsIfF6l9euwNem8A",
  authDomain: "scheduler-wet.firebaseapp.com",
  projectId: "scheduler-wet",
  storageBucket: "scheduler-wet.firebasestorage.app",
  messagingSenderId: "498061470007",
  appId: "1:498061470007:web:a6e6d230dfef812b04d2b2",
  measurementId: "G-D5Q19FX3LC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Sign in automatically in the background
signInAnonymously(auth)
  .then(() => console.log("👤 Anonymous Auth successful!"))
  .catch((error) => console.error("Auth Error:", error));

// Attach to window so App.jsx can use them instantly
window.db = db;
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;

console.log("🔥 Firebase Database initialized and ready!");
