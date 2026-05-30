/* marketian.site Admin Panel (static) */

const STORAGE_KEY = "marketian_admin_data_v1";
const THEME_KEY = "theme";
const AUTH_SESSION_KEY = "marketian_admin_authed_v1";

// Temporary password: admin123
// SHA-256(admin123) = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
// Change password: replace PASSWORD_SHA256_HEX with sha256Hex("yourNewPassword")
const PASSWORD_SHA256_HEX = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

/** @typedef {{key:string,label:string,type:'text'|'textarea'|'number',placeholder?:string}} CustomField */
/** @typedef {{id:string,name:string,slug:string,description?:string,fields:CustomField[]}} Section */
/** @typedef {{id:string,sectionId:string,name:string,price?:string,time?:string,requirements?:string,details?:string,sort?:number,custom?:Record<string,any>}} Service */
/** @typedef {{version:1,updatedAt:string,sections:Section[],services:Service[]}} AdminData */

const $ = (sel, root = document) => /** @type {HTMLElement} */ (root.querySelector(sel));
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.style.display = "none"), 2200);
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function requireLogin() {
  return new Promise((resolve) => {
    // If already authed in this browser tab, proceed.
    if (sessionStorage.getItem(AUTH_SESSION_KEY) === "1") return resolve(true);

    const backdrop = $("#loginBackdrop");
    const form = /** @type {HTMLFormElement} */ ($("#loginForm"));
    const input = /** @type {HTMLInputElement} */ ($("#loginPassword"));
    const error = $("#loginError");

    function showError(msg) {
      error.textContent = msg;
      error.style.display = "block";
    }

    openModal(backdrop);
    input.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.style.display = "none";

      try {
        const pass = input.value;
        const hash = await sha256Hex(pass);
        if (hash !== PASSWORD_SHA256_HEX) {
          showError("Wrong password.");
          input.select();
          return;
        }
        sessionStorage.setItem(AUTH_SESSION_KEY, "1");
        closeModal(backdrop);
        input.value = "";
        resolve(true);
      } catch {
        showError("Login failed in this browser.");
      }
    }, { once: true });
  });
}

function defaultData() {
  /** @type {Section[]} */
  const sections = [];

  /** @type {Service[]} */
  const services = [];

  /** @type {AdminData} */
  return { version: 1, updatedAt: new Date().toISOString(), sections, services };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = /** @type {AdminData} */ (JSON.parse(raw));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sections) || !Array.isArray(parsed.services)) {
      return defaultData();
    }
    // Ensure required arrays exist
    parsed.sections.forEach(s => { s.fields = Array.isArray(s.fields) ? s.fields : []; });
    parsed.services.forEach(s => { s.custom = s.custom && typeof s.custom === "object" ? s.custom : {}; });
    return parsed;
  } catch {
    return defaultData();
  }
}

function saveData() {
  state.data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data, null, 2));
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openModal(el) { el.style.display = "grid"; }
function closeModal(el) { el.style.display = "none"; }

function getActiveSection() {
  return state.data.sections.find(s => s.id === state.activeSectionId) || null;
}

function getServicesForActiveSection() {
  const q = state.serviceSearch.trim().toLowerCase();
  const services = state.data.services
    .filter(s => s.sectionId === state.activeSectionId)
    .sort((a, b) => (Number(a.sort || 0) - Number(b.sort || 0)) || a.name.localeCompare(b.name));
  if (!q) return services;
  return services.filter(s =>
    (s.name || "").toLowerCase().includes(q) ||
    (s.requirements || "").toLowerCase().includes(q) ||
    (s.details || "").toLowerCase().includes(q)
  );
}

function render() {
  renderSections();
  renderActiveHeader();
  renderServicesTable();
}

function renderSections() {
  const list = $("#sectionList");
  const filter = state.sectionFilter.trim().toLowerCase();

  list.innerHTML = "";
  const sections = state.data.sections
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(s => !filter || s.name.toLowerCase().includes(filter) || (s.slug || "").toLowerCase().includes(filter));

  for (const sec of sections) {
    const count = state.data.services.filter(s => s.sectionId === sec.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `section-item ${sec.id === state.activeSectionId ? "active" : ""}`;
    btn.innerHTML = `
      <div>
        <div class="section-name">${escapeHtml(sec.name)}</div>
        <div class="section-meta">${escapeHtml(sec.description || "")}</div>
      </div>
      <span class="pill" title="Services count">${count}</span>
    `;
    btn.addEventListener("click", () => {
      state.activeSectionId = sec.id;
      state.serviceSearch = "";
      $("#serviceSearch").value = "";
      render();
    });
    list.appendChild(btn);
  }
}

function renderActiveHeader() {
  const sec = getActiveSection();
  const title = $("#activeSectionTitle");
  const sub = $("#activeSectionSubtitle");
  const addBtn = $("#btnAddService");
  const settingsBtn = $("#btnSectionSettings");

  if (!sec) {
    title.textContent = "Services";
    sub.textContent = "Select a section to manage its services.";
    addBtn.disabled = true;
    settingsBtn.disabled = true;
    return;
  }

  title.textContent = sec.name;
  sub.textContent = sec.description || `Manage services under ${sec.name}.`;
  addBtn.disabled = false;
  settingsBtn.disabled = false;
}

function renderServicesTable() {
  const tbody = $("#servicesTbody");
  const empty = $("#emptyState");
  tbody.innerHTML = "";

  const sec = getActiveSection();
  if (!sec) {
    empty.hidden = false;
    return;
  }

  const services = getServicesForActiveSection();
  empty.hidden = services.length !== 0;

  for (const srv of services) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900">${escapeHtml(srv.name)}</div>
        <div class="muted" style="margin-top:4px">${escapeHtml((srv.details || "").slice(0, 120))}${(srv.details || "").length > 120 ? "…" : ""}</div>
      </td>
      <td>${escapeHtml(srv.price || "")}</td>
      <td>${escapeHtml(srv.time || "")}</td>
      <td>${escapeHtml(srv.requirements || "")}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="up" title="Move up">↑</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="down" title="Move down">↓</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="edit">Edit</button>
      </td>
    `;

    $("button[data-action='up']", tr).addEventListener("click", () => moveService(srv.id, -1));
    $("button[data-action='down']", tr).addEventListener("click", () => moveService(srv.id, +1));
    $("button[data-action='edit']", tr).addEventListener("click", () => openServiceModal(srv.id));
    tbody.appendChild(tr);
  }
}

function moveService(serviceId, dir) {
  const sec = getActiveSection();
  if (!sec) return;
  const list = state.data.services
    .filter(s => s.sectionId === sec.id)
    .slice()
    .sort((a, b) => (Number(a.sort || 0) - Number(b.sort || 0)) || a.name.localeCompare(b.name));
  const idx = list.findIndex(s => s.id === serviceId);
  if (idx < 0) return;
  const j = idx + dir;
  if (j < 0 || j >= list.length) return;

  const a = list[idx];
  const b = list[j];
  const aSort = Number(a.sort || 0);
  const bSort = Number(b.sort || 0);
  a.sort = bSort;
  b.sort = aSort;
  saveData();
  renderServicesTable();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Service Modal */
function openServiceModal(serviceId = null) {
  const sec = getActiveSection();
  if (!sec) return;

  state.editingServiceId = serviceId;

  const modal = $("#serviceModal");
  const form = /** @type {HTMLFormElement} */ ($("#serviceForm"));
  const title = $("#serviceModalTitle");
  const deleteBtn = $("#btnDeleteService");
  const customMount = $("#customFieldsMount");

  const srv = serviceId ? state.data.services.find(s => s.id === serviceId) : null;

  title.textContent = srv ? "Edit service" : "New service";
  deleteBtn.hidden = !srv;

  // Fill base fields
  form.name.value = srv?.name || "";
  form.price.value = srv?.price || "";
  form.time.value = srv?.time || "";
  form.requirements.value = srv?.requirements || "";
  form.details.value = srv?.details || "";
  form.sort.value = srv?.sort ?? "";

  // Custom fields (section-scoped)
  customMount.innerHTML = "";
  if (sec.fields.length) {
    const h = document.createElement("h4");
    h.className = "subhead";
    h.textContent = "Section fields";
    customMount.appendChild(h);
  }

  for (const field of sec.fields) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    wrap.dataset.customKey = field.key;
    const currentValue = srv?.custom?.[field.key] ?? "";

    if (field.type === "textarea") {
      wrap.innerHTML = `
        <span class="label">${escapeHtml(field.label)}</span>
        <textarea class="textarea" name="custom__${escapeHtml(field.key)}" rows="3" placeholder="${escapeHtml(field.placeholder || "")}"></textarea>
      `;
      $("textarea", wrap).value = String(currentValue ?? "");
    } else {
      wrap.innerHTML = `
        <span class="label">${escapeHtml(field.label)}</span>
        <input class="input" name="custom__${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder || "")}" />
      `;
      $("input", wrap).value = String(currentValue ?? "");
      if (field.type === "number") $("input", wrap).setAttribute("type", "number");
    }
    customMount.appendChild(wrap);
  }

  openModal(modal);
}

function closeServiceModal() {
  closeModal($("#serviceModal"));
  state.editingServiceId = null;
}

function upsertServiceFromForm() {
  const sec = getActiveSection();
  if (!sec) return;

  const form = /** @type {HTMLFormElement} */ ($("#serviceForm"));
  const name = form.name.value.trim();
  if (!name) return;

  const base = {
    name,
    price: form.price.value.trim(),
    time: form.time.value.trim(),
    requirements: form.requirements.value.trim(),
    details: form.details.value.trim(),
    sort: form.sort.value === "" ? 0 : Number(form.sort.value)
  };

  const custom = {};
  for (const f of sec.fields) {
    const input = /** @type {HTMLInputElement|HTMLTextAreaElement|null} */ (form.querySelector(`[name="custom__${CSS.escape(f.key)}"]`));
    if (!input) continue;
    const v = input.value;
    custom[f.key] = f.type === "number" ? (v === "" ? "" : Number(v)) : v;
  }

  if (state.editingServiceId) {
    const idx = state.data.services.findIndex(s => s.id === state.editingServiceId);
    if (idx >= 0) {
      state.data.services[idx] = {
        ...state.data.services[idx],
        ...base,
        custom
      };
      saveData();
      toast("Service updated");
    }
  } else {
    state.data.services.push({
      id: uid("srv"),
      sectionId: sec.id,
      ...base,
      custom
    });
    saveData();
    toast("Service added");
  }

  closeServiceModal();
  render();
}

function deleteService(serviceId) {
  const idx = state.data.services.findIndex(s => s.id === serviceId);
  if (idx < 0) return;
  state.data.services.splice(idx, 1);
  saveData();
  toast("Service deleted");
  closeServiceModal();
  render();
}

/* Section Modal */
function openSectionModal(sectionId = null) {
  const isEdit = !!sectionId;
  state.editingSectionId = sectionId;

  const modal = $("#sectionModal");
  const form = /** @type {HTMLFormElement} */ ($("#sectionForm"));
  const title = $("#sectionModalTitle");
  const deleteBtn = $("#btnDeleteSection");

  const sec = sectionId ? state.data.sections.find(s => s.id === sectionId) : null;

  title.textContent = isEdit ? "Section settings" : "New section";
  deleteBtn.hidden = !isEdit;

  form.name.value = sec?.name || "";
  form.slug.value = sec?.slug || "";
  form.description.value = sec?.description || "";

  renderFieldsTable(sec?.fields || []);
  openModal(modal);
}

function closeSectionModal() {
  closeModal($("#sectionModal"));
  state.editingSectionId = null;
}

function renderFieldsTable(fields) {
  const mount = $("#fieldsTable");
  mount.innerHTML = "";

  if (!fields.length) {
    const d = document.createElement("div");
    d.className = "muted";
    d.textContent = "No custom fields yet. Example: add “Available Countries” for a “Number Services” section.";
    mount.appendChild(d);
    return;
  }

  fields.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.dataset.fieldIndex = String(idx);
    row.innerHTML = `
      <div class="field-row-top">
        <div style="font-weight:900">${escapeHtml(f.label)}</div>
        <button class="btn btn-danger btn-sm" type="button" data-action="remove">Remove</button>
      </div>
      <div class="field-row-grid">
        <label class="field">
          <span class="label">Label</span>
          <input class="input" data-k="label" value="${escapeHtml(f.label)}" />
        </label>
        <label class="field">
          <span class="label">Key</span>
          <input class="input" data-k="key" value="${escapeHtml(f.key)}" />
        </label>
        <label class="field">
          <span class="label">Type</span>
          <select class="input" data-k="type">
            <option value="text">Text</option>
            <option value="textarea">Textarea</option>
            <option value="number">Number</option>
          </select>
        </label>
      </div>
      <label class="field" style="margin-top:8px">
        <span class="label">Placeholder</span>
        <input class="input" data-k="placeholder" value="${escapeHtml(f.placeholder || "")}" />
      </label>
    `;
    $("select[data-k='type']", row).value = f.type || "text";

    $("button[data-action='remove']", row).addEventListener("click", () => {
      fields.splice(idx, 1);
      renderFieldsTable(fields);
    });
    mount.appendChild(row);
  });
}

function collectFieldsFromUI() {
  const mount = $("#fieldsTable");
  const rows = $$(".field-row", mount);
  /** @type {CustomField[]} */
  const fields = [];
  for (const row of rows) {
    const label = /** @type {HTMLInputElement} */ ($("[data-k='label']", row)).value.trim();
    const keyRaw = /** @type {HTMLInputElement} */ ($("[data-k='key']", row)).value.trim();
    const type = /** @type {HTMLSelectElement} */ ($("[data-k='type']", row)).value;
    const placeholder = /** @type {HTMLInputElement} */ ($("[data-k='placeholder']", row)).value;
    if (!label) continue;
    const key = keyRaw || slugify(label).replaceAll("-", "_");
    fields.push({ label, key, type, placeholder });
  }
  return fields;
}

function upsertSectionFromForm() {
  const form = /** @type {HTMLFormElement} */ ($("#sectionForm"));
  const name = form.name.value.trim();
  if (!name) return;

  const slug = (form.slug.value.trim() || slugify(name));
  const description = form.description.value.trim();
  const fields = collectFieldsFromUI();

  // Validate slug uniqueness
  const slugTaken = state.data.sections.some(s => s.slug === slug && s.id !== state.editingSectionId);
  if (slugTaken) {
    toast("Slug already used. Pick a different one.");
    return;
  }

  if (state.editingSectionId) {
    const idx = state.data.sections.findIndex(s => s.id === state.editingSectionId);
    if (idx >= 0) {
      state.data.sections[idx] = { ...state.data.sections[idx], name, slug, description, fields };
      saveData();
      toast("Section updated");
    }
  } else {
    const newSec = { id: uid("sec"), name, slug, description, fields };
    state.data.sections.push(newSec);
    state.activeSectionId = newSec.id;
    saveData();
    toast("Section added");
  }

  closeSectionModal();
  render();
}

function deleteSection(sectionId) {
  const sec = state.data.sections.find(s => s.id === sectionId);
  if (!sec) return;

  // Remove services under the section
  state.data.services = state.data.services.filter(s => s.sectionId !== sectionId);
  state.data.sections = state.data.sections.filter(s => s.id !== sectionId);

  if (state.activeSectionId === sectionId) {
    state.activeSectionId = state.data.sections[0]?.id || null;
  }

  saveData();
  toast("Section deleted");
  closeSectionModal();
  render();
}

/* Confirm modal */
function confirmDialog({ title, message, confirmText = "Confirm" }) {
  return new Promise(resolve => {
    const modal = $("#confirmModal");
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    $("#btnConfirmOk").textContent = confirmText;

    const cleanup = (val) => {
      closeModal(modal);
      $("#btnConfirmOk").onclick = null;
      $("#btnConfirmCancel").onclick = null;
      $("#btnCloseConfirmModal").onclick = null;
      modal.onclick = null;
      resolve(val);
    };

    $("#btnConfirmOk").onclick = () => cleanup(true);
    $("#btnConfirmCancel").onclick = () => cleanup(false);
    $("#btnCloseConfirmModal").onclick = () => cleanup(false);
    modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    openModal(modal);
  });
}

/* Import/Export */
function exportJson() {
  // Use the same name/path convention the website loader expects.
  const filename = "services.json";
  download(filename, JSON.stringify(state.data, null, 2));
  toast("Exported JSON");
}

async function importJson(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sections) || !Array.isArray(parsed.services)) {
    toast("Invalid JSON format");
    return;
  }
  state.data = parsed;
  // Safety normalization
  state.data.sections.forEach(s => { s.id = s.id || uid("sec"); s.fields = Array.isArray(s.fields) ? s.fields : []; });
  state.data.services.forEach(s => { s.id = s.id || uid("srv"); s.custom = s.custom && typeof s.custom === "object" ? s.custom : {}; });
  state.activeSectionId = state.data.sections[0]?.id || null;
  saveData();
  toast("Imported JSON");
  render();
}

async function loadSiteData() {
  try {
    const res = await fetch("/data/services.json", { cache: "no-store" });
    if (!res.ok) {
      toast("No /data/services.json found");
      return;
    }
    const parsed = await res.json();
    if (!parsed || parsed.version !== 1) {
      toast("Invalid /data/services.json");
      return;
    }
    state.data = parsed;
    state.activeSectionId = state.data.sections[0]?.id || null;
    saveData();
    toast("Loaded site data");
    render();
  } catch {
    // When opened as a file:// URL, fetch will fail. Works on Vercel/localhost.
    toast("Load failed (needs hosting)");
  }
}

/* Theme */
function initTheme() {
  const toggle = /** @type {HTMLInputElement} */ ($("#theme-switch"));
  if (localStorage.getItem(THEME_KEY) === "light") {
    document.body.classList.add("light-mode");
    toggle.checked = true;
  }
  toggle.addEventListener("change", () => {
    if (toggle.checked) {
      document.body.classList.add("light-mode");
      localStorage.setItem(THEME_KEY, "light");
    } else {
      document.body.classList.remove("light-mode");
      localStorage.setItem(THEME_KEY, "dark");
    }
  });
}

/* App state */
const state = {
  /** @type {AdminData} */
  data: loadData(),
  activeSectionId: null,
  editingServiceId: null,
  editingSectionId: null,
  serviceSearch: "",
  sectionFilter: ""
};

async function init() {
  initTheme();
  await requireLogin();

  state.activeSectionId = state.data.sections[0]?.id || null;

  $("#btnExport").addEventListener("click", exportJson);
  $("#btnLoadSiteData").addEventListener("click", loadSiteData);

  $("#importFile").addEventListener("change", (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    if (!file) return;
    importJson(file).catch(() => toast("Import failed"));
    input.value = "";
  });

  $("#btnAddService").addEventListener("click", () => openServiceModal(null));
  $("#btnCloseServiceModal").addEventListener("click", closeServiceModal);
  $("#btnCancelService").addEventListener("click", closeServiceModal);
  $("#serviceModal").addEventListener("click", (e) => { if (e.target === $("#serviceModal")) closeServiceModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const confirm = $("#confirmModal");
    if (confirm.style.display === "grid") {
      $("#btnConfirmCancel").click();
      return;
    }
    closeServiceModal();
    closeSectionModal();
  });

  $("#serviceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    upsertServiceFromForm();
  });

  $("#btnDeleteService").addEventListener("click", async () => {
    if (!state.editingServiceId) return;
    const ok = await confirmDialog({
      title: "Delete service?",
      message: "This will permanently delete the service from this section.",
      confirmText: "Delete"
    });
    if (ok) deleteService(state.editingServiceId);
  });

  $("#btnAddSection").addEventListener("click", () => openSectionModal(null));
  $("#btnSectionSettings").addEventListener("click", () => {
    if (!state.activeSectionId) return;
    openSectionModal(state.activeSectionId);
  });
  $("#btnCloseSectionModal").addEventListener("click", closeSectionModal);
  $("#btnCancelSection").addEventListener("click", closeSectionModal);
  $("#sectionModal").addEventListener("click", (e) => { if (e.target === $("#sectionModal")) closeSectionModal(); });

  $("#btnAddField").addEventListener("click", () => {
    const sec = state.editingSectionId ? state.data.sections.find(s => s.id === state.editingSectionId) : null;
    const fields = sec ? (sec.fields = Array.isArray(sec.fields) ? sec.fields : []) : [];
    // When creating a new section, fields are only in the UI; seed UI list
    const existing = collectFieldsFromUI();
    const next = existing.length ? existing : fields;
    next.push({ label: "Available Countries", key: "available_countries", type: "text", placeholder: "US, UK, DE..." });
    renderFieldsTable(next);
  });

  $("#sectionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    upsertSectionFromForm();
  });

  $("#btnDeleteSection").addEventListener("click", async () => {
    if (!state.editingSectionId) return;
    const sec = state.data.sections.find(s => s.id === state.editingSectionId);
    const ok = await confirmDialog({
      title: "Delete section?",
      message: `This will delete the section "${sec?.name || ""}" and ALL services inside it.`,
      confirmText: "Delete section"
    });
    if (ok) deleteSection(state.editingSectionId);
  });

  $("#sectionFilter").addEventListener("input", (e) => {
    state.sectionFilter = /** @type {HTMLInputElement} */ (e.target).value;
    renderSections();
  });

  $("#serviceSearch").addEventListener("input", (e) => {
    state.serviceSearch = /** @type {HTMLInputElement} */ (e.target).value;
    renderServicesTable();
  });

  $("#btnResetDemo").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset to demo?",
      message: "This will overwrite stored data in this browser with demo defaults.",
      confirmText: "Reset"
    });
    if (!ok) return;
    state.data = defaultData();
    state.activeSectionId = state.data.sections[0]?.id || null;
    saveData();
    toast("Reset done");
    render();
  });

  render();
}

init();
