# 우리의 결혼준비 — CLAUDE.md

## 작업 원칙

- 기능 변경/추가 요청이 오면 바로 구현하지 말고, 기획 의도를 먼저 묻고 이해한 내용을 확인받은 후 진행
- 아키텍처/구조 변경(시트 구조, 저장 방식, 데이터 모델 등)은 반드시 먼저 설명하고 동의받은 후 진행
- 버그 수정 범위를 벗어나는 변경은 제안만 하고 대기
- 동의 없이 Code.gs 구조를 바꾸지 않음

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
  vendors: { hall:[], studio:[], makeup:[], dress:[], etc:[] },  // 업체 후보
  tasks: [],        // 이번 주 할 일
  tl: [],           // 타임라인 (월별 체크리스트)
  expenses: [],     // 지출 내역
  jwedding: {},     // 제이웨딩 일별 기록 (key: 'YYYY-MM-DD')
  jwMemo: [],       // 제이웨딩 메모
  notes: [],        // 대시보드 "나중에 볼 자료" 메모
  monthly: {},      // 제이웨딩 월간 블로그/인스타 체크 (key: 'YYYY-MM')
  log: [],          // 최근 활동 로그
  settings: {
    weddingDate, budget, jwLabels, jwLinks
  },
  _savedAt: number  // 마지막 저장 타임스탬프 (GAS에 저장, 다기기 동기화 판단용)
}
```

### monthly 구조 (2026-07-30 확장: 포인트인증, 카페 랜덤이벤트 추가)
```js
D.monthly['2026-06'] = {
  blog:  [{done:false, url:'', date:''}, ...],  // 5개, 1건 2000원
  insta: [{done:false, url:'', date:''}, ...],  // 5개, 1건 1000원
  point: [{done:false, url:'', date:''}, ...],  // 4개, 1건 500원 (포인트인증)
  cafe:  [{done:false, url:'', amount:0, date:'', content:''}, ...]  // 가변 길이, 항목별 내용/적립액 직접 입력 (카페 랜덤이벤트, 횟수·금액 매달 다름). done은 content 입력 여부로 결정
}
```
- `date`: 링크 입력으로 처음 완료 처리된 날짜(YYYY-MM-DD). 완료 취소 시 초기화. 달력 일일 칸의 적립액 표시에 합산됨 (`monthlyEarnedByDate()`)
- 고정 슬롯 타입(blog/insta/point) 개수는 `MLY_FIXED_COUNTS`에 정의
- Monthly 시트에 쓸 때 `month`/`date` 컬럼은 텍스트 서식(`setNumberFormat('@')`)을 강제함 — 구글시트가 "2026-07-30" 같은 문자열을 날짜로 자동 변환하는 걸 막기 위함 (아래 버그 히스토리 참고)

## 동기화 방식

- `sv()` — `D._savedAt = Date.now()`, localStorage 저장, `gasSync()` 호출
- `gasSync()` — 300ms 디바운스 후 GAS로 POST 전송 (no-cors, Content-Type: text/plain)
- `beforeunload` 이벤트 → `keepalive: true` fetch로 새로고침/닫기 전 강제 전송
- `loadFromGAS(force)` — GAS GET 후 타임스탬프 비교:
  - `remoteTime > localTime` → GAS 적용 (다른 기기에서 저장한 경우)
  - `remoteTime <= localTime` → 로컬 유지 (방금 저장했는데 GAS 처리 중인 경우 보호)
  - `force=true` ("지금 불러오기" 버튼) → 항상 GAS 적용
- GAS URL은 `localStorage.getItem('gas_url')`에 별도 저장 (공유 데이터와 분리)

## 페이지 구성

- **대시보드** — 확정/검토중/후보 통계, 이번 주 할 일, 나중에 볼 자료(메모), 최근 활동
- **웨딩홀/스튜디오/메이크업/드레스/기타** — 업체 카드(링크 포함), 상태 관리, 비교 테이블
- **지출 관리** — 카테고리별 지출 기록, 예산 대비 현황
- **제이웨딩** — 일별 글/댓글 토글 체크(링크 선택 입력), 월간 블로그 5개·인스타 5개·포인트인증 4개 + 카페 랜덤이벤트(가변) 링크+저장버튼, 달력(칸 클릭 시 그날 글/댓글 토글을 소급 수정할 수 있는 팝오버 + 월간 항목 적립 내역 표시), 메모
- **타임라인** — 결혼 전 개월수 기준 체크리스트
- **설정** — 결혼 예정일, 예산, GAS URL

## GAS 시트 구조 (Code.gs v2)

| 시트 | 용도 |
|------|------|
| Settings | 설정값 + `_savedAt` |
| Vendors | 업체 카드 전체 |
| Tasks | 이번 주 할 일 |
| Timeline | 타임라인 월별 태스크 |
| Expenses | 지출 내역 |
| JWedding | 일별 글/댓글 체크 |
| JWedding_Memo | 제이웨딩 메모 |
| Notes | 나중에 볼 자료 |
| Monthly | 월간 블로그/인스타 체크 |
| Log | 활동 로그 |

## 주요 버그 히스토리

### 지난 날짜 글/댓글 소급 기록 불가 (2026-07-31 추가)

**문제**: 제이웨딩 "오늘 카드"(글 3개/댓글 토글)가 `toggleJw`/`saveJwUrl`/`ensureJwDay` 전부 `TODAY_STR`에 하드코딩돼 있어서, 당일에 못 찍은 지난 날짜 기록을 나중에 소급해서 남길 방법이 없었음

**해결**: 세 함수 모두 날짜 파라미터(`ds`, 생략 시 `TODAY_STR`)를 받도록 일반화. 달력 칸 클릭 팝오버(`calPopHtml`)에 그날의 글 3개/댓글 토글 버튼 + URL 입력칸을 넣어서 과거 날짜도 직접 켜고 끌 수 있게 함. 소급으로 켜면 그날 달력 표시·`totalEarnedAll()` 누적 적립금·통계 카운트에도 바로 반영됨. 카페 랜덤이벤트/블로그/인스타/포인트인증(월 단위 항목)은 그대로 읽기 전용 — 소급 수정 불필요하다고 확인함

### 카페 랜덤이벤트 적립일자 깨짐 → 달력에서 사라짐 (2026-07-31 수정)

**증상**: 카페 랜덤이벤트에 내용/금액 입력한 날엔 달력에 적립액이 정상 표시됐는데, 다음 날 다시 열어보면 그 표시가 사라짐 (목록 자체의 내용/금액/체크는 남아있음)

**원인**: `item.date`에 `TODAY_STR`("2026-07-30" 같은 문자열)을 저장하는데, 구글시트가 이 텍스트를 자동으로 날짜 타입 셀로 변환해버림. Apps Script가 그 셀을 다시 읽으면 문자열이 아니라 실제 Date 객체가 나오고, `doGet` 응답에서 JSON으로 직렬화될 때 UTC 기준 ISO 문자열(`2026-07-29T15:00:00.000Z`, 9시간 밀림)로 바뀜. 달력 적립액 표시(`monthlyEarnedByDate()`)는 `item.date`가 `'YYYY-MM-DD'`와 정확히 일치해야 매칭되는데, 이 변형된 문자열은 어떤 날짜 칸과도 안 맞아서 표시가 사라짐. 같은 이유로 `monthly`의 월 키("2026-07")도 시트를 거치면 날짜 객체 문자열로 깨지지만, 이건 `normalizeMonthly()`가 로드 시 복구해서 증상으로 드러나지 않았음

**수정**:
- `Code.gs`의 `writeMonthly()`에서 `month`(1번 컬럼), `date`(7번 컬럼)에 `setNumberFormat('@')`로 텍스트 서식 강제 → 구글시트의 날짜 자동 변환 원천 차단
- `index.html`의 `normalizeMonthly()`에서 `normalizeItemDateStr()`로 blog/insta/point/cafe 각 항목의 `date`를 로드 시점에 `'YYYY-MM-DD'`로 복구 (이미 깨진 상태로 저장된 기존 데이터 방어)
- **주의**: Code.gs 수정 후 Apps Script 배포를 최신 버전으로 업데이트해야 실제로 반영됨 (아래 "GAS 배포 주의사항" 참고)

### GAS 저장 타이밍 버그 (2026-06-23 수정)

**증상**: 제이웨딩 토글/링크 입력 후 새로고침하면 데이터 초기화

**원인**: gasSync debounce가 1200ms였는데, 그 전에 새로고침하면 GAS에 저장 안 됨 → GAS 데이터가 구버전 → "GAS 항상 우선" 로직이 구버전으로 덮어씀

**수정**:
- debounce 1200ms → 300ms
- `beforeunload` + `keepalive: true` fetch 추가: 새로고침/닫기 시 브라우저가 GAS 전송 완료까지 유지
- `loadFromGAS()` 타임스탬프 비교 제거 → GAS 데이터 있으면 항상 적용

### 가라 데이터 덮어쓰기 버그 (2026-06-23 수정)

**증상**: 새 기기에서 GAS URL 입력 후 저장하면 이전에 입력한 실제 데이터가 모두 사라짐

**원인**:
1. `let D = ld() || { ...가라 업체/할일/지출 데이터... }` — localStorage 없을 때 샘플 데이터로 초기화
2. `saveSettings()`에서 GAS URL 변경 시 `sv()` 즉시 호출 → 샘플 데이터가 GAS 덮어씌움
3. `localTime > remoteTime` 판정 → GAS의 실제 데이터 복원 안 됨

**수정**:
- 초기 `D` 기본값에서 vendors/tasks/expenses 샘플 데이터 제거 (빈 배열)
- `saveSettings()`에서 GAS URL 새로 입력 시 `sv()` 대신 `localStorage.setItem()`만 하고 `loadFromGAS()` 호출

### 모바일 반응형 깨짐 (2026-06-23 수정)

**원인**: `<meta name="viewport">` 태그 누락 → PC 버전으로 표시

**수정**: `<meta name="viewport" content="width=device-width, initial-scale=1.0">` 추가

### 모바일 수정/삭제 버튼 안 보임 (2026-06-23 수정)

**원인**: 버튼이 `opacity:0`에 hover로만 나타남 → 터치 기기에서 hover 없음

**수정**: `@media(hover:none){.edit-btn,.tdel,.tl-del,.exp-del,.exp-edit{opacity:1}}` 추가

### JWedding URL 입력 포커스 잃음 (2026-06-23 수정)

**원인**: `onblur="render()"` 가 DOM을 재생성해서 입력 중 포커스 잃음

**수정**: `onblur="render()"` 제거

### fp() 반올림 버그 (2026-06-23 수정)

**증상**: 1.5만원이 2만원으로 표시됨

**원인**: `Math.round(n/10000)` 으로 만원 단위 반올림 처리

**수정**:
```js
function fp(n){
  if(!n)return'-'
  if(n>=10000000)return(Math.round(n/100000)/100)+'천만원'
  if(n>=10000){const m=n/10000;return(m%1===0?m:Math.round(m*10)/10)+'만원'}
  return n.toLocaleString()+'원'
}
```

### GAS 데이터 로드 조건 버그 (이전 수정)

**원인**: `if(remote && remote._v)` 조건인데 `_v` 필드가 없어서 항상 실패

**수정**: `if(remote && remote.vendors)` 로 변경

### no-cors POST 버그 (이전 수정)

**원인**: GAS POST 요청에 CORS preflight가 발생해서 실제 저장 실패

**수정**: `mode: 'no-cors'`, `Content-Type: text/plain` 으로 변경

## GAS 배포 주의사항

- 배포 설정: **웹 앱** / 실행 계정: **나** / 액세스: **모든 사람 (익명 포함)**
- Code.gs 수정 후 **기존 배포를 최신 버전으로 업데이트** (URL 유지됨) — GAS URL이 index.html에 하드코딩돼 있으므로 새 배포로 URL 바꾸면 안 됨
- Notes, Monthly 시트는 Code.gs v2에서 추가됨 (재배포 필요했음 — 완료)

## 배포

- GitHub Pages로 서빙 중 (main 브랜치 푸시 시 자동 배포)
- 배포 URL: https://yeddy-525.github.io/wedding-plan/
- GAS 웹앱 URL: https://script.google.com/macros/s/AKfycbwnNmRBHDjgyajMeakw0xTDBP2t2PWz_0TIcdOSNhBdOGADueV598b1DRE_3EXEsXIofA/exec
