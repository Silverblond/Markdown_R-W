const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const dialog = window.__TAURI__.dialog;
const opener = window.__TAURI__.opener;

// ---------- State ----------
let currentPath = null;
let currentText = "";
let dirty = false;
let mode = "preview";
let sidebarOpen = true;

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
  { name: "All Files", extensions: ["*"] },
];
const RECENT_KEY = "md_viewer_recent";
const RECENT_MAX = 10;

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const els = {
  preview:       $("view-preview"),
  source:        $("view-source").querySelector("code"),
  sourcePre:     $("view-source"),
  edit:          $("view-edit"),
  editor:        $("editor"),
  editPreview:   $("edit-preview"),
  welcome:       $("welcome"),
  filename:      $("filename"),
  btnSave:       $("btn-save"),
  btnScrollTop:  $("btn-scroll-top"),
  sidebar:       $("sidebar"),
  sidebarTree:   $("sidebar-tree"),
  recentSection: $("recent-section"),
  recentList:    $("recent-list"),
  statusLeft:    $("status-left"),
  statusRight:   $("status-right"),
};

// ---------- Markdown rendering ----------
function toHeadingId(raw) {
  return raw.toLowerCase()
    .replace(/[^\w\s가-힣぀-ヿ一-鿿]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

window.marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    heading({ text, depth, raw }) {
      return `<h${depth} id="${toHeadingId(raw)}">${text}</h${depth}>\n`;
    },
  },
});

function renderInto(markdown, container) {
  container.innerHTML = window.marked.parse(markdown ?? "");
  container.querySelectorAll("pre code").forEach((block) => {
    try { window.hljs.highlightElement(block); } catch (_) {}
  });
}

// ---------- View ----------
function setMode(next) {
  mode = next;
  document.querySelectorAll(".modes button").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === next);
  });
  els.preview.classList.toggle("hidden", next !== "preview");
  els.sourcePre.classList.toggle("hidden", next !== "source");
  els.edit.classList.toggle("hidden", next !== "edit");
  refreshActiveView();
  if (next === "edit") els.editor.focus();
  els.btnScrollTop?.classList.add("hidden");
  refreshStatus();
}

function refreshActiveView() {
  if (mode === "preview") {
    renderInto(currentText, els.preview);
  } else if (mode === "source") {
    els.source.textContent = currentText;
    els.source.className = "language-markdown";
    try { window.hljs.highlightElement(els.source); } catch (_) {}
  } else if (mode === "edit") {
    renderInto(els.editor.value, els.editPreview);
  }
}

// ---------- Recent files ----------
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; }
  catch (_) { return []; }
}

function addRecent(path) {
  const name = baseName(path);
  let list = loadRecent().filter((r) => r.path !== path);
  list.unshift({ path, name });
  if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderRecentList() {
  const list = loadRecent();
  if (!list.length) {
    els.recentSection.classList.add("hidden");
    return;
  }
  els.recentSection.classList.remove("hidden");
  els.recentList.innerHTML = "";
  list.forEach(({ path, name }) => {
    const li = document.createElement("li");
    li.className = "recent-item";
    const dir = path.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
    li.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0;color:var(--text-dim)">
        <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
      </svg>
      <span class="recent-item-name">${name}</span>
      <span class="recent-item-path">${dir}</span>`;
    li.addEventListener("click", () => openPath(path));
    els.recentList.appendChild(li);
  });
}

// ---------- File operations ----------
function baseName(p) {
  return p.replace(/\\/g, "/").split("/").pop();
}

function markActiveTreeItem(path) {
  els.sidebarTree.querySelectorAll(".tree-file").forEach((el) => {
    el.classList.toggle("active", el.dataset.path === path);
  });
}

function setContent(text, path) {
  currentText = text;
  currentPath = path ?? null;
  dirty = false;
  els.editor.value = text;
  els.welcome.classList.add("hidden");
  els.btnSave.disabled = false;
  els.filename.textContent = path ? baseName(path) : "(제목 없음)";
  document.title = path ? `${baseName(path)} — Markdown Viewer` : "Markdown Viewer";
  if (path) {
    addRecent(path);
    markActiveTreeItem(path);
  }
  refreshActiveView();
  refreshStatus();
}

async function openPath(path) {
  try {
    const text = await invoke("read_file", { path });
    setContent(text, path);
    setMode("preview");
  } catch (e) {
    alert(e);
  }
}

async function openFileDialog() {
  const selected = await dialog.open({ multiple: false, filters: MD_FILTERS });
  if (selected) await openPath(selected);
}

async function openDirDialog() {
  const selected = await dialog.open({ multiple: false, directory: true });
  if (selected) await loadDirectory(selected);
}

async function loadDirectory(dirPath) {
  try {
    const tree = await invoke("read_dir_tree", { path: dirPath });
    renderFileTree(tree);
    if (!sidebarOpen) toggleSidebar();
  } catch (e) {
    els.sidebarTree.innerHTML = `<p class="tree-hint">${e}</p>`;
  }
}

async function save() {
  if (mode === "edit") currentText = els.editor.value;
  let path = currentPath;
  if (!path) {
    path = await dialog.save({ filters: MD_FILTERS, defaultPath: "untitled.md" });
    if (!path) return;
  }
  try {
    await invoke("save_file", { path, contents: currentText });
    currentPath = path;
    dirty = false;
    els.filename.textContent = baseName(path);
    document.title = `${baseName(path)} — Markdown Viewer`;
    refreshActiveView();
    flashStatus("저장됨");
  } catch (e) { alert(e); }
}

// ---------- File tree rendering ----------
function renderFileTree(node) {
  els.sidebarTree.innerHTML = "";
  els.sidebarTree.appendChild(buildTreeNode(node, true));
  if (currentPath) markActiveTreeItem(currentPath);
}

function buildTreeNode(node, isRoot = false) {
  if (node.is_dir) {
    const details = document.createElement("details");
    details.className = "tree-dir";
    details.open = isRoot || node.children.length <= 20;

    const summary = document.createElement("summary");
    summary.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0">
        <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31z"/>
      </svg>
      ${node.name}`;
    details.appendChild(summary);

    const children = document.createElement("div");
    children.className = "tree-children";
    node.children.forEach((child) => children.appendChild(buildTreeNode(child)));
    details.appendChild(children);
    return details;
  } else {
    const div = document.createElement("div");
    div.className = "tree-file";
    div.dataset.path = node.path;
    div.textContent = node.name;
    div.addEventListener("click", () => openPath(node.path));
    return div;
  }
}

// ---------- Sidebar ----------
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  els.sidebar.classList.toggle("collapsed", !sidebarOpen);
}

// ---------- Status bar ----------
function refreshStatus() {
  const text = mode === "edit" ? els.editor.value : currentText;
  const words = (text.trim().match(/\S+/g) || []).length;
  const lines = text ? text.split("\n").length : 0;
  els.statusLeft.textContent = currentPath ? currentPath + (dirty ? " •" : "") : "";
  els.statusRight.textContent = currentPath
    ? `${lines}줄 · ${words}단어 · ${text.length}자` : "";
}

let flashTimer = null;
function flashStatus(msg) {
  els.statusRight.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(refreshStatus, 1500);
}

// ---------- Theme ----------
function applyTheme(next) {
  document.documentElement.setAttribute("data-theme", next);
  $("hljs-light").disabled = next === "dark";
  $("hljs-dark").disabled = next !== "dark";
  $("icon-moon").style.display = next === "dark" ? "none" : "";
  $("icon-sun").style.display = next === "dark" ? "" : "none";
  localStorage.setItem("theme", next);
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

// ---------- Drag & drop ----------
async function wireDragDrop() {
  const onPaths = (paths) => { if (paths?.length) openPath(paths[0]); };
  try {
    await window.__TAURI__.webview.getCurrentWebview().onDragDropEvent((e) => {
      const t = e.payload?.type;
      if (t === "enter" || t === "over") document.body.classList.add("drag-over");
      else if (t === "leave") document.body.classList.remove("drag-over");
      else if (t === "drop") { document.body.classList.remove("drag-over"); onPaths(e.payload?.paths); }
    });
  } catch (_) {
    listen("tauri://drag-enter", () => document.body.classList.add("drag-over"));
    listen("tauri://drag-leave", () => document.body.classList.remove("drag-over"));
    listen("tauri://drag-drop", (e) => { document.body.classList.remove("drag-over"); onPaths(e.payload?.paths); });
  }
}

// ---------- Scroll-to-top ----------
function wireScrollTop() {
  function getPane() {
    if (mode === "edit") return els.editPreview;
    if (mode === "source") return els.sourcePre;
    return els.preview;
  }
  [els.preview, els.editPreview, els.sourcePre].forEach((p) => {
    p.addEventListener("scroll", () => {
      els.btnScrollTop.classList.toggle("hidden", getPane().scrollTop < 200);
    }, { passive: true });
  });
  els.btnScrollTop.addEventListener("click", () => {
    getPane().scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ---------- Link clicks ----------
function wireLinkClicks() {
  [els.preview, els.editPreview].forEach((container) => {
    container.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href");
      if (!href) return;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        opener.openUrl(href).catch(() => {});
      } else if (href.startsWith("#")) {
        const id = decodeURIComponent(href.slice(1));
        container.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth" });
      } else if (href.match(/\.(md|markdown|mdown|mkd|txt)$/i)) {
        const base = currentPath?.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
        openPath(base ? `${base}/${href}` : href);
      }
    });
  });
}

// ---------- Wiring ----------
function wire() {
  $("btn-sidebar-toggle").addEventListener("click", toggleSidebar);
  $("btn-open").addEventListener("click", openFileDialog);
  $("btn-open-dir").addEventListener("click", openDirDialog);
  $("btn-save").addEventListener("click", save);
  $("btn-theme").addEventListener("click", toggleTheme);
  $("btn-welcome-file").addEventListener("click", openFileDialog);
  $("btn-welcome-dir").addEventListener("click", openDirDialog);

  document.querySelectorAll(".modes button").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  // live edit preview + dirty tracking
  let renderTimer = null;
  els.editor.addEventListener("input", () => {
    dirty = els.editor.value !== currentText;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderInto(els.editor.value, els.editPreview), 150);
    refreshStatus();
  });

  // Tab → two spaces
  els.editor.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const s = els.editor.selectionStart, en = els.editor.selectionEnd;
    els.editor.value = els.editor.value.slice(0, s) + "  " + els.editor.value.slice(en);
    els.editor.selectionStart = els.editor.selectionEnd = s + 2;
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "o") { e.preventDefault(); openFileDialog(); }
    else if (k === "s") { e.preventDefault(); save(); }
    else if (k === "e") { e.preventDefault(); setMode(mode === "edit" ? "preview" : "edit"); }
    else if (k === "b") { e.preventDefault(); toggleSidebar(); }
  });
}

// ---------- Init ----------
async function init() {
  // Apply saved/system theme before anything renders
  const saved = localStorage.getItem("theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(saved);

  wire();
  wireScrollTop();
  wireLinkClicks();
  await wireDragDrop();

  // Render recent files on welcome screen
  renderRecentList();

  // File opened while app is running (macOS "Open With")
  listen("open-file", (e) => { if (e.payload) openPath(e.payload); });

  // File the app was launched with
  try {
    const startup = await invoke("take_startup_file");
    if (startup) await openPath(startup);
  } catch (_) {}
}

window.addEventListener("DOMContentLoaded", init);
