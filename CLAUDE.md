# 우리의 결혼준비 — CLAUDE.md

## 프로젝트 개요

단일 HTML 파일(`index.html`) + GAS 백엔드(`Code.gs`)로 구성된 결혼준비 웹앱.
별도 서버 없이 브라우저에서 직접 열어서 사용. 데이터는 localStorage에 저장되고, GAS URL이 설정되면 구글 시트와 자동 동기화.

## 파일 구조

```
index.html   — 전체 앱 (HTML + CSS + JS 단일 파일)
Code.gs      — Google Apps Script 백엔드 (구글 시트 읽기/쓰기)
```

## 데이터 구조 (`D` 객체)

```js
D = {
  vendors: { hall:[], studio:[], makeup:[], dress:[] },  // 업체 후보
  tasks: [],        // 이번 주 할 일
  tl: [],           // 타임라인 (월별 체크리스트)
  expenses: [],     // 지출 내역
  jwedding: {},     // 제이웨딩 일별 기록 (key: 'YYYY-MM-DD')
  jwMemo: [],       // 제이웨딩 메모
  log: [],          // 최근 활동 로그
  settings: {
    weddingDate, budget, jwLabels, jwLinks
  },
  _savedAt: number  // 마지막 저장 타임스탬프 (GAS 동기화 충돌 방지용)
}
```

## 동기화 방식

- `sv()` — D를 localStorage에 저장하고 `gasSync()` 호출
- `gasSync()` — 1200ms 디바운스 후 GAS로 POST 전송 (no-cors)
- `loadFromGAS()` — GAS에서 GET으로 불러온 후 `_savedAt` 타임스탬프 비교
  - `remoteTime > localTime` → GAS 데이터 적용
  - `localTime >= remoteTime` → 로컬 데이터를 GAS에 push
- GAS URL은 `localStorage.getItem('gas_url')`에 별도 저장 (공유 데이터와 분리)

## 주요 버그 히스토리

### 가라 데이터 덮어쓰기 버그 (2026-06-23 수정)

**증상**: 새 기기에서 GAS URL 입력 후 저장하면 이전에 입력한 실제 데이터가 모두 사라짐

**원인**:
1. `let D = ld() || { ...가라 업체/할일/지출 데이터... }` — localStorage 없을 때 하드코딩된 샘플 데이터로 초기화
2. `saveSettings()`에서 GAS URL 변경 시 `sv()`를 즉시 호출 → `_savedAt = Date.now()` 세팅 → 가라 데이터가 GAS 덮어씌움
3. 이후 `loadFromGAS()`에서 `localTime > remoteTime` 판정 → GAS의 실제 데이터가 복원 안 됨

**수정**:
- 초기 `D` 기본값에서 vendors/tasks/expenses 샘플 데이터 제거 (빈 배열로 변경)
- `saveSettings()`에서 GAS URL이 새로 입력된 경우 `sv()` 대신 `localStorage.setItem()`만 하고 `loadFromGAS()` 호출

```js
// 수정 전
sv(); alert('저장됐어요!')

// 수정 후
if(urlJustSet){
  try{localStorage.setItem('wd',JSON.stringify(D))}catch{}
  alert('저장됐어요!\n구글 시트에서 기존 데이터를 불러올게요.')
  loadFromGAS()
} else {
  sv(); alert('저장됐어요!')
}
```

### GAS 데이터 로드 조건 버그 (이전 수정)

**원인**: `if(remote && remote._v)` 조건으로 체크했는데 `_v` 필드가 없어서 항상 실패
**수정**: `if(remote && remote.vendors)` 로 변경

### no-cors POST 버그 (이전 수정)

**원인**: GAS POST 요청에 CORS preflight가 발생해서 실제 저장 실패
**수정**: `mode: 'no-cors'`, `Content-Type: text/plain` 으로 변경

## GAS 배포 주의사항

- 배포 설정: **웹 앱** / 실행 계정: **나** / 액세스: **모든 사람 (익명 포함)**
- Code.gs 수정 후 반드시 **새 배포** 생성 → 새 URL 앱 설정에 재입력
- 기존 배포 URL은 이전 코드를 계속 실행하므로 업데이트 안 됨

## 페이지 구성

- **대시보드** — 확정/검토중/후보 통계, 이번 주 할 일, 최근 활동
- **웨딩홀/스튜디오/메이크업/드레스** — 업체 카드, 상태 관리, 비교 테이블
- **지출 관리** — 카테고리별 지출 기록, 예산 대비 현황
- **제이웨딩** — 일별 글/댓글 체크, 달력, 메모
- **타임라인** — 결혼 전 개월수 기준 체크리스트
- **설정** — 결혼 예정일, 예산, GAS URL
