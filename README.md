# Kissan Fertilizer — Shop Management System

Yeh functional web-app hai jo aapke pehle wale checklist page ki jagah kaam karti hai.
Same Firebase project (`kissan-fertilizer`) use ho raha hai — login bhi wahi email/password se hoga.

## Modules jo ban chuke hain (working)
- **Dashboard** — aaj ki sale, pending udhaar, cash balance, low stock alerts
- **Products / Fertilizers** — add/edit/delete, category, unit, purchase & sale price, minimum stock
- **Stock** — purchase/damage adjustment, live stock levels
- **Sales / POS** — cart system, cash ya credit sale, stock khud-bakhud kam hoti hai
- **Customers (Udhaar)** — customer list, pending balance, payment receive karna
- **Suppliers** — payable tracking, credit purchases, supplier ko payment
- **Cash & Accounts** — income/expense ledger
- **Reports** — date-range sales, top products, estimated profit
- **Shop Settings** — shop profile (name, owner, phone, address, tagline), logo, aur naya staff user add karne ka link

Logo (`logo.png`) ab har page ke favicon aur sidebar mein lag gaya hai — login page par bhi dikhta hai.

## Baad mein add karne wale (abhi placeholder nahi bane)
Users & Security (roles/permissions per staff member), full Profit & Loss statement, WhatsApp Awareness,
Homework/Timetable jaisay school-specific items (yeh fertilizer shop ke liye zaroori nahi).
Inko isi structure mein naya `.html` file + sidebar entry (common.js mein NAV_ITEMS) add karke banaya ja sakta hai.

## GitHub par kaise daalein
1. In sab files ko apne repo (`kissan-fertilizer` ya jo bhi naam hai) ke root mein copy karein —
   ya inko ek naya folder (e.g. `/app`) mein rakh kar GitHub Pages usi folder se serve karein.
2. Commit + push karein.
3. GitHub Pages settings mein source branch set karein (agar pehle se GitHub Pages chal rahi hai to bas overwrite ho jayega).
4. `login.html` par jaa kar apne existing Firebase Auth email/password se login karein.

## Zaroori: Firestore Security Rules
Firebase console → Firestore Database → Rules mein yeh set karein (sirf logged-in users read/write kar sakein):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Data structure (Firestore collections)
- `products` — {name, category, unit, purchasePrice, salePrice, minStock, stock}
- `customers` — {name, phone, balance}
- `suppliers` — {name, phone, balance (aap par jo payable hai)}
- `sales` — {date, customerId, customerName, items[], total, paid, type, createdAt}
- `cashEntries` — {date, type, amount, note, createdAt}
- `settings/shopProfile` — {shopName, owner, phone, address, tagline}
- `checklist` — (purani checklist state, isko chhoo nahi rahe)

Naye users (staff/admin) add karne ke liye Firebase Console → Authentication → Add User use karein.
