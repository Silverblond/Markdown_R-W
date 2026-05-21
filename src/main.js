const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const dialog = window.__TAURI__.dialog;
const opener = window.__TAURI__.opener;

// ---------- State ----------
let currentPath = null; // absolute path of the open file, or null
let currentText = ""; // last-saved content
let dirty = false; // unsaved edits in the editor
let mode = "preview"; // preview | source | edit

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
  { name: "All Files", extensions: ["*"] },
];

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const els = {
  preview: $("view-preview"),
  source: $("view-source").querySelector("code"),
  sourcePre: $("view-source"),
  edit: $("view-edit"),
  editor: $("editor"),
  editPreview: $("edit-preview"),
  dropzone: $("dropzone"),
  filename: $("filename"),
  btnSave: $("btn-save"),
  statusLeft: $("status-left"),
  statusRight: $("status-right"),
};

// ---------- Markdown rendering ----------

// GFM 스타일 헤딩 ID 생성: "My Heading" → "my-heading"
function toHeadingId(rawText) {
  return rawText
    .toLowerCase()
    .replace(/[^\w\s가-힣぀-ヿ一-鿿-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// 헤딩에 id를 붙여주는 커스텀 렌더러 (앵커 링크 타겟용)
const headingRenderer = {
  heading({ text, depth, raw }) {
    const id = toHeadingId(raw);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  },
};
window.marked.use({ renderer: headingRenderer, gfm: true, breaks: false });

function renderInto(markdown, container) {
  container.innerHTML = window.marked.parse(markdown ?? "");
  container.querySelectorAll("pre code").forEach((block) => {
    try {
      window.hljs.highlightElement(block);
    } catch (_) {
      /* unknown language — leave as-is */
    }
  });
}

// ---------- View management ----------
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
  refreshStatus();
}

function refreshActiveView() {
  const text = mode === "edit" ? els.editor.value : currentText;
  if (mode === "preview") {
    renderInto(currentText, els.preview);
  } else if (mode === "source") {
    els.source.textContent = currentText;
    els.source.className = "language-markdown";
    try {
      window.hljs.highlightElement(els.source);
    } catch (_) {}
  } else if (mode === "edit") {
    renderInto(text, els.editPreview);
  }
}

// ---------- File operations ----------
function baseName(p) {
  return p.replace(/\\/g, "/").split("/").pop();
}

function setContent(text, path) {
  currentText = text;
  currentPath = path ?? null;
  dirty = false;
  els.editor.value = text;
  els.dropzone.classList.add("hidden");
  els.btnSave.disabled = false;
  els.filename.textContent = path ? baseName(path) : "(제목 없음)";
  document.title = path ? `${baseName(path)} — Markdown Viewer` : "Markdown Viewer";
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

async function openDialog() {
  const selected = await dialog.open({ multiple: false, filters: MD_FILTERS });
  if (selected) await openPath(selected);
}

async function save() {
  // pull latest edits if we're editing
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
  } catch (e) {
    alert(e);
  }
}

// ---------- Status bar ----------
function refreshStatus() {
  const text = mode === "edit" ? els.editor.value : currentText;
  const chars = text.length;
  const words = (text.trim().match(/\S+/g) || []).length;
  const lines = text ? text.split("\n").length : 0;
  els.statusLeft.textContent = currentPath ? currentPath + (dirty ? " •" : "") : "";
  els.statusRight.textContent = `${lines}줄 · ${words}단어 · ${chars}자`;
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
  $("btn-theme").textContent = next === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", next);
}

function toggleTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(dark ? "light" : "dark");
}

// ---------- Wiring ----------
function wire() {
  $("btn-open").addEventListener("click", openDialog);
  $("btn-open-empty").addEventListener("click", openDialog);
  $("btn-save").addEventListener("click", save);
  $("btn-theme").addEventListener("click", toggleTheme);

  document.querySelectorAll(".modes button").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  // Live preview + dirty tracking while editing
  let renderTimer = null;
  els.editor.addEventListener("input", () => {
    dirty = els.editor.value !== currentText;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderInto(els.editor.value, els.editPreview);
    }, 150);
    refreshStatus();
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "o") {
      e.preventDefault();
      openDialog();
    } else if (k === "s") {
      e.preventDefault();
      save();
    } else if (k === "e") {
      e.preventDefault();
      setMode(mode === "edit" ? "preview" : "edit");
    }
  });

  // Link clicks in rendered preview
  [els.preview, els.editPreview].forEach((container) => {
    container.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href");
      if (!href) return;

      if (href.startsWith("http://") || href.startsWith("https://")) {
        // 외부 URL → 기본 브라우저로 열기
        opener.openUrl(href).catch(() => {});
      } else if (href.startsWith("#")) {
        // 문서 내 앵커 → 헤딩 id로 찾아서 스크롤
        const id = decodeURIComponent(href.slice(1));
        const target = container.querySelector(`#${CSS.escape(id)}`);
        target?.scrollIntoView({ behavior: "smooth" });
      } else if (href.match(/\.(md|markdown|mdown|mkd|txt)$/i)) {
        // 상대 경로 마크다운 파일 → 앱에서 열기
        const base = currentPath
          ? currentPath.replace(/\\/g, "/").replace(/\/[^/]+$/, "")
          : null;
        const resolved = base ? `${base}/${href}` : href;
        openPath(resolved);
      }
    });
  });

  // Tab inserts two spaces in the editor instead of moving focus
  els.editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = els.editor.selectionStart;
      const en = els.editor.selectionEnd;
      els.editor.value = els.editor.value.slice(0, s) + "  " + els.editor.value.slice(en);
      els.editor.selectionStart = els.editor.selectionEnd = s + 2;
    }
  });
}

// ---------- Drag & drop (Tauri native file drop) ----------
async function wireDragDrop() {
  const onPaths = (paths) => {
    if (paths && paths.length) openPath(paths[0]);
  };
  try {
    const webview = window.__TAURI__.webview.getCurrentWebview();
    await webview.onDragDropEvent((event) => {
      const t = event.payload?.type;
      if (t === "enter" || t === "over") document.body.classList.add("drag-over");
      else if (t === "leave") document.body.classList.remove("drag-over");
      else if (t === "drop") {
        document.body.classList.remove("drag-over");
        onPaths(event.payload?.paths);
      }
    });
  } catch (_) {
    listen("tauri://drag-enter", () => document.body.classList.add("drag-over"));
    listen("tauri://drag-leave", () => document.body.classList.remove("drag-over"));
    listen("tauri://drag-drop", (e) => {
      document.body.classList.remove("drag-over");
      onPaths(e.payload?.paths);
    });
  }
}

// ---------- Startup ----------
async function init() {
  applyTheme(localStorage.getItem("theme") || "light");
  wire();
  await wireDragDrop();

  // File opened via association / "Open With" while the app is running
  listen("open-file", (e) => {
    if (e.payload) openPath(e.payload);
  });

  // File the app was launched with
  try {
    const startup = await invoke("take_startup_file");
    if (startup) await openPath(startup);
  } catch (_) {}
}

window.addEventListener("DOMContentLoaded", init);
