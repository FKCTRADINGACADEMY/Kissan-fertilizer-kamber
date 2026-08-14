import { auth, signOut } from "./firebase-init.js";

const NAV_ITEMS = [
  { href: "index.html", icon: "📊", label: "Dashboard" },
  { href: "products.html", icon: "🌱", label: "Products / Fertilizers" },
  { href: "stock.html", icon: "📦", label: "Stock" },
  { href: "sales.html", icon: "🧾", label: "Sales / POS" },
  { href: "customers.html", icon: "👤", label: "Customers (Udhaar)" },
  { href: "cash.html", icon: "💰", label: "Cash & Accounts" },
  { href: "reports.html", icon: "📈", label: "Reports" },
];

export function renderSidebar(activeHref, userEmail) {
  const current = location.pathname.split("/").pop() || "index.html";
  const navHtml = NAV_ITEMS.map(function (item) {
    const active = item.href === (activeHref || current) ? " active" : "";
    return '<a class="' + active.trim() + '" href="' + item.href + '"><span>' + item.icon + '</span><span>' + item.label + '</span></a>';
  }).join("");

  const el = document.getElementById("sidebar-root");
  if (!el) return;
  el.innerHTML =
    '<div class="user-box">Logged in as<br><span class="email">' + (userEmail || "") + '</span><br><span class="badge">ADMIN</span></div>' +
    '<nav>' + navHtml + '</nav>' +
    '<button class="logout-btn" id="logout-btn">Logout</button>' +
    '<div class="sync-line" id="sync-line">Cloud sync active</div>';

  document.getElementById("logout-btn").addEventListener("click", function () {
    signOut(auth);
  });
}

export function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return "Rs. " + v.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function todayStr() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}
