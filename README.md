# Markdown Viewer

마크다운 전용 뷰어 겸 에디터. Tauri 기반으로 macOS / Windows 모두에서 동작하는 가벼운 로컬 데스크톱 앱입니다.

## 기능

- **미리보기** — 마크다운을 GitHub 스타일로 렌더링 (GFM 표·체크박스·코드블록 지원)
- **원본** — 마크다운 소스를 그대로 보기 (문법 하이라이트)
- **편집** — 좌측 에디터 + 우측 실시간 미리보기 분할 화면, 저장 가능
- 다크 / 라이트 테마 토글 (설정 기억됨)
- 코드 블록 문법 하이라이팅 (highlight.js)
- 파일 드래그앤드롭으로 열기
- `.md` 파일 연결 — 운영체제에서 더블클릭 / "연결 프로그램"으로 열기
- 단축키: 열기 `Ctrl/Cmd+O` · 저장 `Ctrl/Cmd+S` · 편집 토글 `Ctrl/Cmd+E`

## 개발 실행

전제: [Rust](https://rustup.rs) 와 Node.js 설치.

```bash
npm install
npm run dev      # 개발 모드 (핫 리로드)
```

## 배포용 빌드

```bash
npm run build
```

빌드 결과물은 `src-tauri/target/release/bundle/` 아래에 생성됩니다.

- macOS: `.app`, `.dmg`
- Windows: `.msi`, `.exe` (NSIS)

## 구조

- `src/` — 프론트엔드 (vanilla HTML/CSS/JS, 빌드 단계 없음)
  - `vendor/` — marked, highlight.js (오프라인 동작용으로 번들)
- `src-tauri/` — Rust 백엔드 (파일 읽기/쓰기, 파일 연결 처리)
