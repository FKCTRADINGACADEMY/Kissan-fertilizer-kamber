// ==============================================
// Kissan Fertilizer - Automation Add-on
// 1) PC par pehle click/key-press par automatic fullscreen
// 2) "Add User" form se ab ASLI login (email+password) bhi ban jayega
//    - pehle sirf Firestore record banta tha, Firebase Console se
//      manually account banana padta tha
// Isko index.html AUR login.html dono mein </body> se theek pehle
// is ek line se load karein:
//   <script type="module" src="automation.js"></script>
// ==============================================

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// Same config jo index.html/login.html mein hai (public web config hai, secret nahi)
const firebaseConfig = {
    apiKey: "AIzaSyBgj4ICBiPlikXgTjkzPrRUCv3CX3At0KA",
    authDomain: "kissan-fertilizer.firebaseapp.com",
    projectId: "kissan-fertilizer",
    storageBucket: "kissan-fertilizer.firebasestorage.app",
    messagingSenderId: "476514606793",
    appId: "1:476514606793:web:157d8f78e74f426644f718"
};

// ---------- 1) AUTO FULLSCREEN (desktop/laptop only) ----------
(function () {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) return; // mobile/tablet par fullscreen zaroori nahi, skip

    function goFullscreen() {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }
    // NOTE: Browser security rule — koi bhi website page load hote hi 100%
    // khud-ba-khud fullscreen nahi ja sakti, ye sirf user ke gesture
    // (click ya key press) par hi chal sakta hai. Isliye pehla click/key
    // press hi turant fullscreen kar dega — user ko alag se button dabana
    // nahi padega.
    document.addEventListener('click', goFullscreen, { once: true, capture: true });
    document.addEventListener('keydown', goFullscreen, { once: true, capture: true });
})();

// ---------- 2) REAL LOGIN ACCOUNT FROM "Add User" FORM (index.html only) ----------
(function () {
    const userModal = document.getElementById('userModal');
    const userForm = document.getElementById('userForm');
    if (!userModal || !userForm) return; // login.html par ye hissa skip ho jayega

    // Password field inject karo (form mein pehle se nahi hai)
    if (!document.getElementById('userPasswordWrap')) {
        const emailGroup = document.getElementById('userEmailField')?.closest('.form-group');
        if (emailGroup) {
            emailGroup.insertAdjacentHTML('afterend', `
                <div class="form-group" id="userPasswordWrap">
                    <label>Password * (naya login banane ke liye, min 6 characters)</label>
                    <input type="password" id="userPassword" minlength="6" autocomplete="new-password" />
                </div>
            `);
        }
    }

    // Edit mode mein password field chhupa do (naya password badalna is version mein nahi hai)
    const originalOpenUserModal = window.openUserModal;
    if (typeof originalOpenUserModal === 'function') {
        window.openUserModal = function (u) {
            originalOpenUserModal(u);
            const wrap = document.getElementById('userPasswordWrap');
            const pw = document.getElementById('userPassword');
            if (wrap && pw) {
                wrap.style.display = u ? 'none' : 'block';
                pw.required = !u;
                pw.value = '';
            }
        };
    }

    // Purana submit listener hatane ke liye form ko clone karo (fresh, listener-free copy)
    const freshForm = userForm.cloneNode(true);
    userForm.parentNode.replaceChild(freshForm, userForm);

    freshForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('userDocId').value;
        const perms = Array.from(document.querySelectorAll('.userPerm:checked')).map((cb) => cb.value);
        const name = document.getElementById('userFullName').value;
        const email = document.getElementById('userEmailField').value.trim();
        const password = document.getElementById('userPassword')?.value || '';
        const data = {
            name,
            email,
            role: document.getElementById('userRole').value,
            permissions: perms,
            status: document.getElementById('userStatus').value,
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await updateDoc(doc(window.db, 'users', id), data);
                window.logAudit && window.logAudit('User', 'User updated: ' + data.name);
                window.showToast('✅ User updated', 'success');
            } else {
                if (!email) { window.showToast('❌ Email zaroori hai', 'error'); return; }
                if (!password || password.length < 6) {
                    window.showToast('❌ Password kam se kam 6 characters ka ho', 'error');
                    return;
                }

                // Secondary Firebase app se naya login banao, taake admin ka apna
                // session logout na ho (Firebase createUser normally current session
                // ko switch kar deta hai — isliye ek alag temporary app instance use karte hain)
                const secondaryApp = initializeApp(firebaseConfig, 'Secondary-' + Date.now());
                const secondaryAuth = getAuth(secondaryApp);
                let uid;
                try {
                    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                    if (name) await updateProfile(cred.user, { displayName: name });
                    uid = cred.user.uid;
                    await signOut(secondaryAuth);
                } finally {
                    await deleteApp(secondaryApp);
                }

                data.uid = uid;
                data.createdAt = new Date().toISOString();
                // doc id = uid rakha hai taake login account aur Firestore record hamesha linked rahein
                await setDoc(doc(window.db, 'users', uid), data);
                window.logAudit && window.logAudit('User', 'New login account created: ' + data.name);
                window.showToast('✅ User aur login dono ban gaye', 'success');
            }
            window.closeModal('userModal');
        } catch (err) {
            window.showToast('❌ Error: ' + err.message, 'error');
        }
    });
})();
