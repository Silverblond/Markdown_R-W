# Markdown Viewer

마크다운 전용 뷰어 겸 에디터. Tauri v2 기반으로 macOS / Windows 모두에서 동작하는 가벼운 로컬 데스크톱 앱입니다.  
인터넷 연결 없이 완전히 오프라인으로 작동하며, 로컬 이미지·수식·코드 하이라이팅을 모두 지원합니다.

---

## 기능

| 카테고리 | 내용 |
|----------|------|
| **렌더링** | GitHub Flavored Markdown (표·체크박스·취소선·태스크 리스트) |
| **수식** | KaTeX — 인라인 `$...$` 및 블록 `$$...$$` 수식 렌더링 |
| **코드** | highlight.js 문법 하이라이팅 (100+ 언어) |
| **이미지** | 로컬 상대/절대 경로 이미지 표시, 클릭 시 라이트박스 확대 |
| **멀티탭** | 여러 파일 동시에 열기, 탭 전환·추가·닫기 |
| **3가지 모드** | 미리보기 / 원본(소스) / 편집(분할 화면 실시간 미리보기) |
| **파일 연결** | `.md` `.markdown` `.mdown` `.mkd` — OS 더블클릭으로 바로 열기 |
| **파일 탐색기** | 사이드바에서 폴더 트리 탐색 |
| **TOC** | 사이드바에서 현재 파일 목차 자동 생성 및 스크롤 이동 |
| **파일 감시** | 외부에서 파일이 수정되면 자동 리로드 알림 |
| **테마** | 다크 / 라이트 토글 (설정 저장) |
| **집중 모드** | 사이드바·툴바 숨기고 본문만 표시 (`Ctrl/Cmd+Shift+F`) |
| **검색** | 현재 문서 내 텍스트 검색 (`Ctrl/Cmd+F`) |
| **저장 안 된 변경 감지** | 종료 / 탭 닫기 전 확인 다이얼로그 |

### 단축키

| 기능 | macOS | Windows |
|------|-------|---------|
| 파일 열기 | `Cmd+O` | `Ctrl+O` |
| 저장 | `Cmd+S` | `Ctrl+S` |
| 편집 모드 | `Cmd+E` | `Ctrl+E` |
| 새 탭 | `Cmd+T` | `Ctrl+T` |
| 탭 닫기 | `Cmd+W` | `Ctrl+W` |
| 다음 탭 | `Cmd+Shift+]` | `Ctrl+Shift+]` |
| 이전 탭 | `Cmd+Shift+[` | `Ctrl+Shift+[` |
| 검색 | `Cmd+F` | `Ctrl+F` |
| 집중 모드 | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| 사이드바 토글 | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| 들여쓰기 | `Tab` (에디터) | `Tab` (에디터) |
| 내어쓰기 | `Shift+Tab` (에디터) | `Shift+Tab` (에디터) |

---

## 릴리즈 다운로드 및 설치

[**Releases**](https://github.com/Silverblond/Markdown_R-W/releases) 페이지에서 최신 버전을 다운로드하세요.

| 플랫폼 | 파일 | 비고 |
|--------|------|------|
| macOS Apple Silicon (M1/M2/M3/M4) | `Markdown.Viewer_*_aarch64.dmg` | |
| macOS Intel | `Markdown.Viewer_*_x64.dmg` | |
| Windows (설치 마법사) | `Markdown.Viewer_*_x64-setup.exe` | |
| Windows (MSI) | `Markdown.Viewer_*_x64_en-US.msi` | |

### macOS 설치

1. `.dmg` 파일을 열고 `Markdown Viewer.app`을 `/Applications`로 드래그
2. 처음 실행 시 "확인되지 않은 개발자" 경고가 뜨면:
   - `시스템 설정 → 개인 정보 보호 및 보안 → 앱 허용` 클릭, 또는
   - `Control + 클릭 → 열기` 선택

### Windows 설치

1. `.exe` 또는 `.msi` 파일 실행
2. SmartScreen 경고 시 `추가 정보 → 실행` 클릭

### .md 파일 연결 설정

- **macOS**: Finder에서 `.md` 파일 우클릭 → 정보 가져오기 → 다음으로 열기 → `Markdown Viewer` 선택 → 모두 변경
- **Windows**: `.md` 파일 우클릭 → 연결 프로그램 → `Markdown Viewer` 선택

---

## 구조

```
Markdown_R-W/
├── src/                        # 프론트엔드 (vanilla HTML/CSS/JS, 빌드 단계 없음)
│   ├── index.html              # 앱 진입점
│   ├── main.js                 # 전체 앱 로직 (렌더링·탭·단축키·사이드바 등)
│   ├── styles.css              # 전체 스타일 (다크/라이트 테마 포함)
│   └── vendor/                 # 오프라인 번들 라이브러리
│       ├── marked.min.js       # 마크다운 파서 (marked.js v18)
│       ├── highlight.min.js    # 코드 하이라이팅 (highlight.js v11)
│       ├── highlight.min.css
│       ├── katex.min.js        # 수식 렌더링 (KaTeX v0.16)
│       ├── katex.min.css
│       └── fonts/              # KaTeX woff2 폰트 (오프라인 수식용)
├── src-tauri/                  # Rust 백엔드 (Tauri v2)
│   ├── src/
│   │   └── lib.rs              # 파일 읽기/쓰기·파일 감시·디렉토리 트리·OS 연결 처리
│   ├── Cargo.toml
│   └── tauri.conf.json         # 앱 설정 (창 크기·asset 프로토콜·파일 연결 등)
├── .github/
│   └── workflows/
│       └── release.yml         # GitHub Actions 릴리즈 빌드 (macOS ARM·Intel, Windows)
└── package.json
```

---

## 개발 실행

**전제 조건**: [Rust](https://rustup.rs) + Node.js 설치

```bash
npm install
npm run dev      # 개발 모드 (핫 리로드)
```

---

## 배포 빌드

### 로컬 빌드

```bash
npm run build
# 또는
npx @tauri-apps/cli build
```

빌드 결과물 위치: `src-tauri/target/release/bundle/`

| OS | 파일 |
|----|------|
| macOS | `macos/Markdown Viewer.app`, `dmg/*.dmg` |
| Windows | `msi/*.msi`, `nsis/*-setup.exe` |

macOS에서 `/Applications`에 설치:

```bash
rm -rf "/Applications/Markdown Viewer.app"
cp -R "src-tauri/target/release/bundle/macos/Markdown Viewer.app" "/Applications/"
```

### GitHub Actions 릴리즈 빌드

`v*` 형식 태그를 push하면 GitHub Actions가 자동으로 macOS(ARM + Intel) · Windows 빌드를 실행하고 GitHub Releases에 Draft로 올립니다.

```bash
# 버전 파일 업데이트 후 커밋
# src-tauri/tauri.conf.json  "version": "x.y.z"
# src-tauri/Cargo.toml       version = "x.y.z"

git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to x.y.z"
git push origin main

# 태그 생성 및 push → Actions 자동 트리거
git tag vx.y.z
git push origin vx.y.z
```

빌드 완료 후 [Releases](https://github.com/Silverblond/Markdown_R-W/releases) 페이지에서 Draft를 확인하고 **Publish release** 클릭.

> **참고**: macOS 크로스 컴파일 — `macos-latest` 러너(ARM)에서 `--target x86_64-apple-darwin` 옵션으로 Intel 바이너리를 교차 컴파일합니다. `macos-13`(Intel) 러너는 가용량 부족으로 사용하지 않습니다.
