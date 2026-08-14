// Shared Firebase init — imported by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs,
  onSnapshot, query, orderBy, where, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBgj4ICBiPlikXgTjkzPrRUCv3CX3At0KA",
  authDomain: "kissan-fertilizer.firebaseapp.com",
  projectId: "kissan-fertilizer",
  storageBucket: "kissan-fertilizer.firebasestorage.app",
  messagingSenderId: "476514606793",
  appId: "1:476514606793:web:157d8f78e74f426644f718"
};

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = initializeFirestore(fbApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
setPersistence(auth, browserLocalPersistence).catch(function () {});

export {
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs,
  onSnapshot, query, orderBy, where, runTransaction, serverTimestamp, increment
};

// ---------- Auth guard: redirect to login.html if not logged in ----------
// Call this at the top of every protected page.
export function requireAuth(onReady) {
  onAuthStateChanged(auth, function (user) {
    if (!user) {
      if (!location.pathname.endsWith("login.html")) {
        location.href = "login.html";
      }
    } else {
      onReady(user);
    }
  });
}
