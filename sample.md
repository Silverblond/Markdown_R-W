# Markdown Viewer 데모

이 파일로 뷰어를 테스트해 보세요. 상단 툴바에서 **미리보기 / 원본 / 편집** 을 전환할 수 있습니다.

## 텍스트 서식

**굵게**, *기울임*, ~~취소선~~, `인라인 코드`, [링크](https://tauri.app).

> 인용문도 잘 렌더링됩니다.
> 여러 줄도 가능합니다.

## 목록

- 사과
- 바나나
  - 중첩 항목
- 체크박스:
  - [x] 완료된 일
  - [ ] 할 일

1. 첫째
2. 둘째
3. 셋째

## 표

| 언어 | 용도 | 속도 |
| --- | --- | :---: |
| Rust | 백엔드 | 🚀 |
| JavaScript | 프론트엔드 | ⚡ |

## 코드 블록

```rust
fn main() {
    println!("Hello from Rust!");
}
```

```javascript
const greet = (name) => `안녕, ${name}!`;
console.log(greet("세계"));
```

---

편집 모드(`Ctrl/Cmd+E`)에서 내용을 바꾸고 `Ctrl/Cmd+S` 로 저장해 보세요.
