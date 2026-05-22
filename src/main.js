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
let focusMode = false;
let searchOpen = false;
let searchMatches = [];
let searchIndex = -1;

// ---------- Tab state ----------
let tabs = [];
let activeTabIdx = -1;
let nextTabId = 0;

function getCurrentTab() {
  return activeTabIdx >= 0 ? tabs[activeTabIdx] : null;
}

function saveCurrentTabState() {
  const tab = getCurrentTab();
  if (!tab) return;
  tab.path = currentPath;
  tab.text = currentText;
  tab.dirty = dirty;
  tab.mode = mode;
  tab.editorValue = els?.editor?.value ?? currentText;
  tab.previewScrollTop  = els?.preview?.scrollTop ?? 0;
  tab.sourceScrollTop   = els?.sourcePre?.scrollTop ?? 0;
  tab.editScrollTop     = els?.editPreview?.scrollTop ?? 0;
}

function restoreTabState(tab) {
  currentPath  = tab.path;
  currentText  = tab.text;
  dirty        = tab.dirty;
  if (els.editor) els.editor.value = tab.editorValue ?? tab.text;
  // Update header / title
  els.filename.textContent = tab.path ? baseName(tab.path) : "(제목 없음)";
  document.title = tab.path ? `${baseName(tab.path)} — Markdown Viewer` : "Markdown Viewer";
  els.btnSave.disabled = false;
  els.welcome.classList.add("hidden");
  if (tab.path) markActiveTreeItem(tab.path);
  setMode(tab.mode ?? "preview");
  // Restore scroll after render settles
  requestAnimationFrame(() => {
    els.preview.scrollTop  = tab.previewScrollTop ?? 0;
    els.sourcePre.scrollTop = tab.sourceScrollTop ?? 0;
    els.editPreview.scrollTop = tab.editScrollTop ?? 0;
  });
  refreshStatus();
  hideFileChangedBar();
}

function renderTabBar() {
  const bar = $("tab-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!tabs.length) return;

  tabs.forEach((tab, idx) => {
    const el = document.createElement("div");
    el.className = `tab-item${idx === activeTabIdx ? " active" : ""}`;
    const name = tab.path ? baseName(tab.path) : "새 문서";
    el.innerHTML = `
      <span class="tab-name" title="${tab.path ?? ""}">${name}${tab.dirty ? " ●" : ""}</span>
      <button class="tab-close" title="닫기">×</button>`;
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-close")) { closeTab(idx); return; }
      switchToTab(idx);
    });
    bar.appendChild(el);
  });

  // "+" new tab button
  const plus = document.createElement("button");
  plus.className = "tab-new-btn";
  plus.title = "새 탭 (Cmd+T)";
  plus.textContent = "+";
  plus.addEventListener("click", () => newTab());
  bar.appendChild(plus);
}

function newTab() {
  saveCurrentTabState();
  const tab = { id: nextTabId++, path: null, text: "", dirty: false, mode: "edit",
                editorValue: "", previewScrollTop: 0, sourceScrollTop: 0, editScrollTop: 0 };
  tabs.push(tab);
  activeTabIdx = tabs.length - 1;
  currentPath  = null;
  currentText  = "";
  dirty        = false;
  els.editor.value = "";
  els.welcome.classList.add("hidden");
  els.btnSave.disabled = false;
  els.filename.textContent = "(제목 없음)";
  document.title = "Markdown Viewer";
  setMode("edit");
  els.editor.focus();
  renderTabBar();
}

function switchToTab(idx) {
  if (idx === activeTabIdx || idx < 0 || idx >= tabs.length) return;
  saveCurrentTabState();
  activeTabIdx = idx;
  restoreTabState(tabs[idx]);
  renderTabBar();
}

async function closeTab(idx) {
  const tab = tabs[idx];
  if (tab.dirty) {
    const wantSave = await dialog.ask(
      `"${tab.path ? baseName(tab.path) : "새 문서"}"의 변경 사항을 저장하시겠습니까?`,
      { title: "저장하지 않은 변경 사항", okLabel: "저장", cancelLabel: "저장 안 함" }
    );
    if (wantSave) {
      if (idx !== activeTabIdx) switchToTab(idx);
      await save();
    }
  }

  tabs.splice(idx, 1);

  if (!tabs.length) {
    activeTabIdx = -1;
    currentPath = null; currentText = ""; dirty = false;
    els.editor.value = "";
    els.welcome.classList.remove("hidden");
    els.filename.textContent = "—";
    document.title = "Markdown Viewer";
    els.btnSave.disabled = true;
    renderTabBar();
    return;
  }

  if (idx <= activeTabIdx) activeTabIdx = Math.max(0, activeTabIdx - 1);
  activeTabIdx = Math.min(activeTabIdx, tabs.length - 1);
  restoreTabState(tabs[activeTabIdx]);
  renderTabBar();
}

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
  { name: "All Files", extensions: ["*"] },
];
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "avif"]);
const RECENT_KEY = "md_viewer_recent";
const RECENT_MAX = 10;
const SETTINGS_KEY = "md_viewer_settings";

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const els = {
  preview:        $("view-preview"),
  source:         $("view-source").querySelector("code"),
  sourcePre:      $("view-source"),
  edit:           $("view-edit"),
  editor:         $("editor"),
  editPreview:    $("edit-preview"),
  welcome:        $("welcome"),
  filename:       $("filename"),
  btnSave:        $("btn-save"),
  btnInsertImage: $("btn-insert-image"),
  btnScrollTop:   $("btn-scroll-top"),
  sidebar:        $("sidebar"),
  sidebarTree:    $("sidebar-tree"),
  recentSection:  $("recent-section"),
  recentList:     $("recent-list"),
  statusLeft:     $("status-left"),
  statusRight:    $("status-right"),
  toolbar:        $("toolbar"),
  statusbar:      $("statusbar"),
  tocList:        $("toc-list"),
  searchBar:      $("search-bar"),
  searchInput:    $("search-input"),
  searchCount:    $("search-count"),
  fileChangedBar: $("file-changed-bar"),
  splitResizer:   $("split-resizer"),
  settingsPanel:  $("settings-panel"),
  settingFont:    $("setting-font"),
  fontSizeVal:    $("font-size-val"),
  settingWrap:    $("setting-wrap"),
};

// ---------- Settings ----------
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; }
  catch (_) { return {}; }
}

function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  return s;
}

function applySettings(s) {
  const fontMap = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", Roboto, Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    georgia: 'Georgia, serif',
  };
  const font = s.font ?? "system";
  const size = s.fontSize ?? 16;
  const wrap = s.wrap ?? false;

  document.documentElement.style.setProperty("--preview-font", fontMap[font] ?? fontMap.system);
  document.documentElement.style.setProperty("--preview-font-size", `${size}px`);
  els.editor.style.whiteSpace = wrap ? "pre-wrap" : "pre";
  els.editor.style.overflowWrap = wrap ? "break-word" : "normal";

  els.settingFont.value = font;
  els.fontSizeVal.textContent = size;
  els.settingWrap.checked = wrap;
}

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

function normalizePath(p) {
  // Resolve ".." and "." segments from an absolute posix-style path
  const parts = p.split("/");
  const result = [];
  for (const part of parts) {
    if (part === "..") result.pop();
    else if (part !== ".") result.push(part);
  }
  return result.join("/");
}

// ---------- Image helpers (feat #40) ----------
function isImagePath(p) {
  const ext = p.replace(/\\/g, "/").split("/").pop().split(".").pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

/** 현재 문서 위치 기준 이미지 상대경로 계산. 문서가 없거나 다른 드라이브면 절대경로 반환 */
function relativeImagePath(absImg) {
  const img = absImg.replace(/\\/g, "/");
  if (!currentPath) return img;
  const docDir = currentPath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
  const imgParts = img.split("/");
  const docParts = docDir.split("/");
  let common = 0;
  while (common < imgParts.length && common < docParts.length && imgParts[common] === docParts[common]) common++;
  if (common === 0) return img; // 다른 드라이브
  const ups = Array(docParts.length - common).fill("..");
  return [...ups, ...imgParts.slice(common)].join("/");
}

/** 에디터 커서 위치에 텍스트 삽입 후 input 이벤트 발생 */
function insertAtCursor(text) {
  const el = els.editor;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.dispatchEvent(new Event("input"));
  el.focus();
}

/** 이미지 경로로 ![alt](path) 마크다운을 커서에 삽입 */
function insertImageMarkdown(absPath) {
  const rel = relativeImagePath(absPath);
  const alt = absPath.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
  if (mode !== "edit") setMode("edit");
  insertAtCursor(`![${alt}](${rel})`);
}

function resolveLocalImages(container) {
  const dir = currentPath?.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
  container.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("http") || src.startsWith("data:") || src.startsWith("asset://")) return;
    const rawAbs = src.startsWith("/") ? src : dir ? `${dir}/${src}` : null;
    if (!rawAbs) return;
    const abs = normalizePath(rawAbs.replace(/\\/g, "/"));
    const assetUrl = window.__TAURI__.core.convertFileSrc(abs);
    // Clear src first to force the browser to abandon any failed/pending request,
    // then set the correct asset:// URL so it re-fetches cleanly.
    img.removeAttribute("src");
    img.src = assetUrl;
  });
}

function renderMath(source) {
  if (!window.katex) return source;
  const store = [];

  // Extract block math $$...$$ first (before inline, to avoid double-processing)
  source = source.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    store.push({ tex: tex.trim(), display: true });
    return `\x02MATH${store.length - 1}BLOCK\x03`;
  });
  // Extract inline math $...$ (avoid $$ and empty)
  source = source.replace(/\$([^\n$\\][^$]*?[^\n$\\]?)\$/g, (_, tex) => {
    if (!tex.trim()) return `$${tex}$`;
    store.push({ tex: tex.trim(), display: false });
    return `\x02MATH${store.length - 1}INLINE\x03`;
  });

  let html = window.marked.parse(source);

  // Replace placeholders with KaTeX output
  html = html.replace(/\x02MATH(\d+)(BLOCK|INLINE)\x03/g, (_, idx) => {
    const { tex, display } = store[parseInt(idx)];
    try {
      return window.katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch (_) {
      return `<code class="math-error">${tex}</code>`;
    }
  });

  return html;
}

function renderInto(markdown, container) {
  const html = renderMath(markdown ?? "");
  container.innerHTML = html;
  container.querySelectorAll("pre code").forEach((block) => {
    try { window.hljs.highlightElement(block); } catch (_) {}
  });
  resolveLocalImages(container);
  wireCheckboxes(container); // feat #38
}

// ---------- Checkbox toggle (feat #38) ----------
function wireCheckboxes(container) {
  container.querySelectorAll('input[type="checkbox"]').forEach((cb, idx) => {
    cb.removeAttribute("disabled");
    cb.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCheckboxAt(container, idx);
    });
  });
}

function toggleCheckboxAt(container, idx) {
  const isEdit = container === els.editPreview;
  const src = isEdit ? (els.editor?.value ?? currentText) : currentText;

  let count = 0;
  let found = false;
  const result = src.replace(
    /^([ \t]*(?:[-*+]|\d+[.)]) \[)([ xX])(\])/gm,
    (m, pre, mark, post) => {
      if (count++ === idx) {
        found = true;
        return pre + (mark.trim() === "" ? "x" : " ") + post;
      }
      return m;
    }
  );

  if (!found) return;

  // 상태 갱신 — currentText와 에디터 값을 동시에 업데이트 후 dirty 표시
  currentText = result;
  if (els.editor) els.editor.value = result;
  dirty = true;
  const tab = getCurrentTab();
  if (tab) { tab.text = result; tab.editorValue = result; tab.dirty = true; }

  // 스크롤 위치 보존하며 re-render (renderInto가 wireCheckboxes도 호출)
  const scrollTop = container.scrollTop;
  renderInto(result, container);
  container.scrollTop = scrollTop;

  // 활성 컨테이너면 TOC도 갱신
  if ((mode === "preview" && container === els.preview) ||
      (mode === "edit"    && container === els.editPreview)) {
    buildToc(container);
  }

  renderTabBar();
  refreshStatus();
}

// ---------- TOC (feature #1) ----------
function buildToc(container) {
  const headings = container.querySelectorAll("h1, h2, h3, h4");
  els.tocList.innerHTML = "";
  if (!headings.length) {
    els.tocList.innerHTML = '<p class="tree-hint">목차가 없습니다</p>';
    return;
  }
  headings.forEach((h) => {
    const a = document.createElement("a");
    a.className = `toc-item toc-${h.tagName.toLowerCase()}`;
    a.textContent = h.textContent;
    a.href = "#";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth" });
    });
    els.tocList.appendChild(a);
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
  if (els.btnInsertImage) els.btnInsertImage.disabled = (next !== "edit");
  refreshActiveView();
  if (next === "edit") els.editor.focus();
  els.btnScrollTop?.classList.add("hidden");
  refreshStatus();
}

function refreshActiveView() {
  if (mode === "preview") {
    renderInto(currentText, els.preview);
    buildToc(els.preview);
    if (searchOpen) applySearch();
  } else if (mode === "source") {
    els.source.textContent = currentText;
    els.source.className = "language-markdown";
    try { window.hljs.highlightElement(els.source); } catch (_) {}
  } else if (mode === "edit") {
    renderInto(els.editor.value, els.editPreview);
    buildToc(els.editPreview);
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
  // Sync to active tab
  const tab = getCurrentTab();
  if (tab) {
    tab.path = currentPath; tab.text = currentText;
    tab.dirty = false; tab.editorValue = text;
  }
  refreshActiveView();
  refreshStatus();
  hideFileChangedBar();
  renderTabBar();
}

async function openPath(path) {
  // If already open in another tab, switch to it
  const existingIdx = tabs.findIndex((t) => t.path === path);
  if (existingIdx >= 0) { switchToTab(existingIdx); return; }

  try {
    const text = await invoke("read_file", { path });
    const tab = getCurrentTab();
    const isEmptyNewTab = tab && !tab.path && !tab.text && !tab.dirty;

    if (isEmptyNewTab) {
      // Reuse current empty/new tab
      setContent(text, path);
      setMode("preview");
    } else {
      // Open in a new tab
      saveCurrentTabState();
      const newTab = { id: nextTabId++, path, text, dirty: false, mode: "preview",
                       editorValue: text, previewScrollTop: 0, sourceScrollTop: 0, editScrollTop: 0 };
      tabs.push(newTab);
      activeTabIdx = tabs.length - 1;
      currentPath = path; currentText = text; dirty = false;
      els.editor.value = text;
      els.welcome.classList.add("hidden");
      els.btnSave.disabled = false;
      addRecent(path);
      markActiveTreeItem(path);
      els.filename.textContent = baseName(path);
      document.title = `${baseName(path)} — Markdown Viewer`;
      setMode("preview");
      renderTabBar();
    }
    try { await invoke("watch_file", { path }); } catch (_) {}
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
    // Sync to active tab
    const tab = getCurrentTab();
    if (tab) { tab.path = path; tab.text = currentText; tab.dirty = false; }
    renderTabBar();
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

function wireSidebarTabs() {
  document.querySelectorAll(".sidebar-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".sidebar-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $("sidebar-panel-files").classList.toggle("hidden", target !== "files");
      $("sidebar-panel-toc").classList.toggle("hidden", target !== "toc");
    });
  });
}

// ---------- File changed bar (feature #4) ----------
function showFileChangedBar() {
  els.fileChangedBar.classList.remove("hidden");
}

function hideFileChangedBar() {
  els.fileChangedBar.classList.add("hidden");
}

// ---------- Search (feature #2) ----------
function toggleSearch() {
  searchOpen = !searchOpen;
  els.searchBar.classList.toggle("hidden", !searchOpen);
  if (searchOpen) {
    els.searchInput.focus();
    els.searchInput.select();
  } else {
    clearSearch();
  }
}

function closeSearch() {
  searchOpen = false;
  els.searchBar.classList.add("hidden");
  clearSearch();
}

function clearSearch() {
  const container = getSearchContainer();
  if (container) {
    container.querySelectorAll("mark.search-match").forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent));
    });
  }
  searchMatches = [];
  searchIndex = -1;
  els.searchCount.textContent = "";
}

function getSearchContainer() {
  if (mode === "preview") return els.preview;
  if (mode === "edit") return els.editPreview;
  return null;
}

function applySearch() {
  const container = getSearchContainer();
  if (!container) return;

  const query = els.searchInput.value;
  clearSearch();
  if (!query) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest("mark")) continue;
    textNodes.push(node);
  }

  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  textNodes.forEach((tn) => {
    const text = tn.nodeValue;
    if (!re.test(text)) return;
    re.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement("mark");
      mark.className = "search-match";
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = re.lastIndex;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  });

  searchMatches = Array.from(container.querySelectorAll("mark.search-match"));
  if (searchMatches.length) {
    searchIndex = 0;
    highlightCurrent();
  }
  els.searchCount.textContent = searchMatches.length ? `${searchIndex + 1} / ${searchMatches.length}` : "없음";
}

function highlightCurrent() {
  searchMatches.forEach((m, i) => m.classList.toggle("current", i === searchIndex));
  if (searchMatches[searchIndex]) {
    searchMatches[searchIndex].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  els.searchCount.textContent = searchMatches.length ? `${searchIndex + 1} / ${searchMatches.length}` : "없음";
}

function searchNext() {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex + 1) % searchMatches.length;
  highlightCurrent();
}

function searchPrev() {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
  highlightCurrent();
}

// ---------- Focus mode (feature #6) ----------
function toggleFocusMode() {
  focusMode = !focusMode;
  document.body.classList.toggle("focus-mode", focusMode);
  $("btn-focus").classList.toggle("active", focusMode);
}

// ---------- Split resizer (feature #5) ----------
function wireSplitResizer() {
  const resizer = els.splitResizer;
  if (!resizer) return;

  let startX, startEditorWidth;

  resizer.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startEditorWidth = els.editor.getBoundingClientRect().width;
    resizer.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  });

  window.addEventListener("mousemove", (e) => {
    if (!resizer.classList.contains("dragging")) return;
    const dx = e.clientX - startX;
    const total = els.edit.getBoundingClientRect().width - resizer.offsetWidth;
    const newW = Math.min(Math.max(startEditorWidth + dx, 200), total - 200);
    const pct = (newW / total) * 100;
    els.editor.style.flex = `0 0 ${pct}%`;
    els.editPreview.style.flex = `0 0 ${100 - pct}%`;
  });

  window.addEventListener("mouseup", () => {
    if (!resizer.classList.contains("dragging")) return;
    resizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });
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
  // feat #40: 이미지 파일이면 에디터에 마크다운 삽입, 그 외는 문서로 열기
  const onPaths = (paths) => {
    if (!paths?.length) return;
    const p = paths[0];
    if (isImagePath(p)) insertImageMarkdown(p);
    else openPath(p);
  };
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

// ---------- Lightbox (issue #27) ----------
function wireLightbox() {
  const lb      = $("lightbox");
  const lbImg   = $("lightbox-img");
  const lbCap   = $("lightbox-caption");
  const lbClose = $("lightbox-close");

  function open(src, alt) {
    lbImg.src = src;
    lbCap.textContent = alt || "";
    lb.style.display = "flex";
    // Trigger transition on next frame
    requestAnimationFrame(() => lb.classList.add("visible"));
    document.addEventListener("keydown", onKey);
  }

  function close() {
    lb.classList.remove("visible");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => { lb.style.display = "none"; lbImg.src = ""; }, 200);
  }

  function onKey(e) { if (e.key === "Escape") close(); }

  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  lbClose.addEventListener("click", close);

  // Delegate click on images inside preview panes
  [els.preview, els.editPreview].forEach((container) => {
    container.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      e.preventDefault();
      open(img.src, img.alt);
    });
  });
}

// ---------- Settings panel (features #7, #8) ----------
function wireSettings() {
  $("btn-settings").addEventListener("click", (e) => {
    e.stopPropagation();
    els.settingsPanel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!els.settingsPanel.contains(e.target) && e.target !== $("btn-settings")) {
      els.settingsPanel.classList.add("hidden");
    }
  });

  els.settingFont.addEventListener("change", () => {
    applySettings(saveSettings({ font: els.settingFont.value }));
  });

  $("btn-font-inc").addEventListener("click", () => {
    const next = Math.min((loadSettings().fontSize ?? 16) + 1, 32);
    applySettings(saveSettings({ fontSize: next }));
  });
  $("btn-font-dec").addEventListener("click", () => {
    const next = Math.max((loadSettings().fontSize ?? 16) - 1, 10);
    applySettings(saveSettings({ fontSize: next }));
  });

  els.settingWrap.addEventListener("change", () => {
    applySettings(saveSettings({ wrap: els.settingWrap.checked }));
  });
}

function injectPreviewFontCss() {
  const style = document.createElement("style");
  style.textContent = `
    #view-preview, #edit-preview {
      font-family: var(--preview-font);
      font-size: var(--preview-font-size, 16px);
    }
  `;
  document.head.appendChild(style);
}

// ---------- Wiring ----------
function wire() {
  $("btn-sidebar-toggle").addEventListener("click", toggleSidebar);
  $("btn-open").addEventListener("click", openFileDialog);
  $("btn-open-dir").addEventListener("click", openDirDialog);
  $("btn-save").addEventListener("click", save);
  $("btn-theme").addEventListener("click", toggleTheme);

  // Image insert (feat #40)
  $("btn-insert-image").addEventListener("click", async () => {
    const selected = await dialog.open({
      multiple: false,
      filters: [
        { name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (selected) insertImageMarkdown(selected);
  });
  $("btn-welcome-file").addEventListener("click", openFileDialog);
  $("btn-welcome-dir").addEventListener("click", openDirDialog);

  // Print (feature #3) — fix #36: 모드에 상관없이 항상 미리보기 렌더링 후 출력
  $("btn-print").addEventListener("click", () => {
    const src = mode === "edit" ? (els.editor?.value ?? currentText) : currentText;
    if (mode !== "preview") renderInto(src, els.preview);
    window.print();
  });

  // Search (feature #2)
  $("btn-search").addEventListener("click", toggleSearch);
  $("btn-search-close").addEventListener("click", closeSearch);
  $("btn-search-next").addEventListener("click", searchNext);
  $("btn-search-prev").addEventListener("click", searchPrev);
  els.searchInput.addEventListener("input", () => applySearch());
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.shiftKey ? searchPrev() : searchNext(); }
    if (e.key === "Escape") closeSearch();
  });

  // Focus mode (feature #6)
  $("btn-focus").addEventListener("click", toggleFocusMode);

  // File changed bar (feature #4)
  $("btn-reload").addEventListener("click", async () => {
    if (currentPath) await openPath(currentPath);
  });
  $("btn-dismiss-change").addEventListener("click", hideFileChangedBar);

  document.querySelectorAll(".modes button").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  // live edit preview + dirty tracking
  let renderTimer = null;
  els.editor.addEventListener("input", () => {
    dirty = els.editor.value !== currentText;
    const tab = getCurrentTab();
    if (tab) { tab.dirty = dirty; tab.editorValue = els.editor.value; renderTabBar(); }
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderInto(els.editor.value, els.editPreview);
      buildToc(els.editPreview);
    }, 150);
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

  // Markdown formatting shortcuts (issue #26): Cmd/Ctrl + B/I/K/`
  els.editor.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (!["b", "i", "k", "`"].includes(k)) return;
    // Don't conflict with global shortcuts when not in edit mode
    if (mode !== "edit") return;
    e.preventDefault();

    const ta = els.editor;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = ta.value.slice(start, end);
    const before = ta.value.slice(0, start);
    const after  = ta.value.slice(end);

    let wrap, cursorOffset;
    if (k === "b")  { wrap = "**"; cursorOffset = 2; }
    else if (k === "i")  { wrap = "*";  cursorOffset = 1; }
    else if (k === "k")  {
      // Link: [text](url) — if selection exists use it as text
      const linkText = sel || "링크 텍스트";
      const inserted = `[${linkText}](url)`;
      ta.value = before + inserted + after;
      // Place cursor on "url" so user can type it immediately
      const urlStart = before.length + linkText.length + 3; // "[text](" offset
      ta.selectionStart = urlStart;
      ta.selectionEnd   = urlStart + 3; // select "url"
      ta.dispatchEvent(new Event("input"));
      return;
    }
    else if (k === "`") { wrap = "`";  cursorOffset = 1; }

    if (sel) {
      // Check if already wrapped → toggle off
      if (before.endsWith(wrap) && after.startsWith(wrap)) {
        ta.value = before.slice(0, -wrap.length) + sel + after.slice(wrap.length);
        ta.selectionStart = start - cursorOffset;
        ta.selectionEnd   = end   - cursorOffset;
      } else {
        ta.value = before + wrap + sel + wrap + after;
        ta.selectionStart = start + cursorOffset;
        ta.selectionEnd   = end   + cursorOffset;
      }
    } else {
      // No selection: insert markers and place cursor between them
      ta.value = before + wrap + wrap + after;
      ta.selectionStart = ta.selectionEnd = start + cursorOffset;
    }
    ta.dispatchEvent(new Event("input"));
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "o") { e.preventDefault(); openFileDialog(); }
    else if (k === "s") { e.preventDefault(); save(); }
    else if (k === "e") { e.preventDefault(); setMode(mode === "edit" ? "preview" : "edit"); }
    else if (k === "b") { e.preventDefault(); toggleSidebar(); }
    else if (k === "t") { e.preventDefault(); newTab(); }
    else if (k === "w") { e.preventDefault(); if (activeTabIdx >= 0) closeTab(activeTabIdx); }
    else if (k === "tab") {
      // Cmd+Shift+[ / Cmd+Shift+] → prev/next tab
      if (e.shiftKey) { e.preventDefault(); switchToTab((activeTabIdx - 1 + tabs.length) % tabs.length); }
    }
    else if (k === "]" && e.shiftKey) { e.preventDefault(); switchToTab((activeTabIdx + 1) % tabs.length); }
    else if (k === "[" && e.shiftKey) { e.preventDefault(); switchToTab((activeTabIdx - 1 + tabs.length) % tabs.length); }
    else if (k === "f") {
      if (e.shiftKey) { e.preventDefault(); toggleFocusMode(); }
      else { e.preventDefault(); toggleSearch(); }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focusMode) toggleFocusMode();
  });
}

// ---------- Close guard (issue #23) ----------
async function wireCloseGuard() {
  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      const anyDirty = tabs.some((t) => t.dirty) || dirty;
      if (!anyDirty) return; // nothing unsaved — let the OS close normally
      event.preventDefault();

      // Ask whether to save before quitting
      const wantSave = await dialog.ask(
        "저장하지 않은 변경 사항이 있습니다.\n저장 후 종료하시겠습니까?",
        { title: "저장하지 않은 변경 사항", okLabel: "저장 후 종료", cancelLabel: "저장 안 함" }
      );
      if (wantSave) await save();
      await appWindow.destroy();
    });
  } catch (_) {
    // Fallback for environments where onCloseRequested isn't available
    window.addEventListener("beforeunload", (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }
}

// ---------- Init ----------
async function init() {
  const saved = localStorage.getItem("theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(saved);

  injectPreviewFontCss();
  applySettings(loadSettings());

  wire();
  wireSettings();
  wireCloseGuard();
  wireLightbox();
  wireSidebarTabs();
  wireSplitResizer();
  wireScrollTop();
  wireLinkClicks();
  await wireDragDrop();

  renderRecentList();

  // File changed from outside (feature #4)
  listen("file-changed", () => showFileChangedBar());

  // File opened while app is running (macOS "Open With")
  listen("open-file", (e) => { if (e.payload) openPath(e.payload); });

  // File the app was launched with
  try {
    const startup = await invoke("take_startup_file");
    if (startup) await openPath(startup);
  } catch (_) {}
}

window.addEventListener("DOMContentLoaded", init);
