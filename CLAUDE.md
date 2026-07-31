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

### 업체(vendor) 납부 일정 필드 (2026-07-31 추가)
```js
v = {
  ...기존 필드(price, deposit, loc, cap, status, tags, note, date 등),
  depositDate: '',    // 계약금 납부일
  depositPaid: false, // 계약금 완납 여부
  balanceDate: '',    // 잔금 납부 예정일
  balancePaid: false  // 잔금 완납 여부
}
```
- 잔금 금액은 저장하지 않고 항상 `price - deposit`로 그때그때 계산함 (총액/계약금이 바뀌면 자동으로 맞음)
- 계약금/중도금/잔금처럼 가변 리스트가 아니라 **계약금·잔금 2단계 고정 구조**로 결정함 — 실제로 대부분 이 두 단계뿐이라고 확인함 (카페 랜덤이벤트처럼 가변 리스트로 만들려다가 사용자가 반려)
- 카드에는 **`status==='확정'`일 때만** 이 정보 노출 (후보/검토중 단계에서는 안 보여줘서 비교 화면이 산만해지지 않게 함)
- 미납 항목은 날짜 대신 `dueDayLabel()`로 `D-7`/`D-DAY`/`기한 지남` 식으로 표시 (결혼식 D-day와 같은 문법)
- `Code.gs`의 `depositDate`/`balanceDate` 컬럼도 Monthly 시트와 동일하게 텍스트 서식 강제함 (구글시트 날짜 자동 변환 방지, 처음부터 방지해서 마이그레이션 불필요)
- 기존 `date`(예약/촬영일) 컬럼은 아직 텍스트 서식 처리 안 함 — 같은 자동변환 위험이 있지만 아직 문제로 보고되지 않아서 그대로 둠

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

### 대시보드 개편 (2026-07-31)

- 기존 "이번 주 할 일"(`D.tasks`, 수동 입력)과 "최근 활동"(`D.log`) 섹션을 대시보드에서 제거함 — 사용자가 "이번 주 할 일은 매번 채우기 귀찮고, 최근 활동은 굳이 안 봐도 됨"이라고 확인함
- 대신 `D.tl`(타임라인)의 현재 달 항목을 대시보드에 직접 렌더링 — `currentTlPhase()`로 이번 달 찾아서 미완료는 "지금 해야 할 일", 완료는 "한 일"로 표시. `toggleTl()`을 그대로 재사용해서 대시보드에서 바로 체크 가능(타임라인 페이지 안 들어가도 됨)
- 다음 달 항목은 "앞으로 할 일"로 제목만 미리보기(토글 불가)
- **주의**: `D.tasks`/`toggleTask`/`deleteTask`/`openAddTask` 함수와 Code.gs의 Tasks 시트는 그대로 남아있음 — 대시보드에서 부르는 곳이 없어져서 사실상 죽은 코드가 됨. 사용자가 완전 제거를 요청하면 그때 정리할 것 (이번엔 요청 범위 밖이라 안 건드림)
- `linkedVendorLabel(cat)` — 타임라인 항목의 `cat`(웨딩홀/스튜디오/드레스/메이크업/청첩장/여행/스냅/혼수/전체)에 확정 업체를 연결. `웨딩홀`/`스튜디오`/`드레스`/`메이크업`은 `CN` 역매핑으로 해당 업체 카테고리의 확정 업체를 찾고, 그 외(청첩장/여행/스냅/혼수 등 전용 카테고리가 없는 것들)는 **기타 카테고리의 확정 업체 중 `tags`에 해당 단어가 포함된 것**을 찾음(`전체`는 연결 안 함). 기존에 따로 있던 "확정 업체" 대시보드 섹션은 이 기능으로 완전히 대체됨
- `currentTlPhase()` 버그 수정 — 결혼식이 12개월(가장 이른 구간) 넘게 남은 경우 `cur`가 계속 `null`이라 대시보드/타임라인 페이지 둘 다 "현재 구간"이 안 잡히던 문제. 이제 그런 경우 첫 구간(`D.tl[0]`)으로 기본값 처리함
- 타임라인 항목 수정 기능 추가 — 기존엔 추가/삭제/완료토글만 있고 수정이 없었음. `editTlTask()`/`submitTlTaskEdit()` 추가, 내용(`text`)·카테고리(`cat`) 수정 가능. 월별 섹션 제목(`mo`)은 사용자가 "그건 그냥 두자"고 해서 수정 기능 안 만듦 — 여전히 고정
- 타임라인 카테고리 입력에 자동완성 추가 — `tagSuggestions()`가 업체 태그+업체 카테고리명(`CN` values)+기존에 쓰인 타임라인 카테고리를 모아서 `<datalist id="tlt-cat-list">`로 제공. 할 일 추가 시 카테고리를 필수 입력으로 바꿈(이전엔 항상 '기타'로 자동 지정되어 나중에 수정해서 넣어야 했음) — 특정 업체와 무관한 일반 항목은 `전체`를 입력하면 됨

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

- **대시보드** — 확정/검토중/후보 통계. 숫자 밑에 카테고리 라벨 표시 — 검토중/후보는 `statusLabels()`(카테고리명, 기타는 `tags`(종류) 값, 중복 제거), **확정만** `confirmedLabels()`로 "카테고리: 업체명" 형태까지 표시(확정은 카테고리당 보통 하나라 이름 붙여도 안 지저분함). 지금 해야 할 일/한 일/앞으로 할 일(타임라인의 이번 달·다음 달 항목을 직접 가져와 토글 가능, 2026-07-31 개편). 각 타임라인 항목엔 `linkedVendorLabel()`로 확정 업체가 자동 연결돼서 표시됨(예: "웨딩홀 계약" → "OO웨딩홀") — 기존에 따로 있던 "확정 업체" 섹션은 이걸로 대체되어 제거됨. 나중에 볼 자료(메모)
- **웨딩홀/스튜디오/메이크업/드레스/기타** — 업체 카드(링크 포함), 상태 관리, 비교 테이블. **기타**만 태그(`tags`) 칩으로 목록 필터링 가능 — 종류가 계속 늘어나는 카테고리라 상태 필터와 별개로 태그 필터 추가 (2026-07-31)
  - **기타 카테고리에서 `tags`는 "종류"(청첩장/신혼여행/스냅 등 분류) 의미로 씀** — 웨딩홀/스튜디오/드레스/메이크업은 탭 자체가 분류라 `tags`가 원래 의도대로 순수 특징 설명 용도임. 기타만 분류가 없어서 사용자가 이미 `tags`에 종류를 넣어 쓰고 있었고, 재입력 부담 없이 그대로 유지하기로 함 (2026-07-31)
  - 그래서 기타 업체 편집 폼에는 `feature`라는 별도 필드가 추가로 있음 — 진짜 특징(가성비 좋음 등)은 여기에 입력. 다른 카테고리엔 이 필드 자체가 안 보임(폼에서 `addCat==='etc'`일 때만 렌더링)
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

### 업체 예약/촬영일 사라짐 (2026-07-31 수정)

**증상**: 스튜디오(등) 업체의 예약/촬영일을 입력해도, 편집 모달을 다시 열면 빈칸으로 보임

**원인**: 카페 랜덤이벤트와 완전히 같은 원인 — Vendors 시트의 `date` 컬럼도 텍스트 서식이 안 걸려있어서 구글시트가 자동으로 날짜 타입으로 바꿔버림. `<input type="date">`는 정확히 `'YYYY-MM-DD'` 형식이 아니면 값을 그냥 빈칸으로 표시해서, 사용자 눈엔 "입력한 게 사라진 것"처럼 보임. `depositDate`/`balanceDate`는 만들 때부터 텍스트 서식을 걸어놔서 이 문제가 없었는데, 원래 있던 `date` 컬럼은 그때 "아직 보고 안 됨"이라고 남겨뒀다가 이번에 실제로 터짐

**수정**:
- `Code.gs`의 `writeVendors()`에서 `date`(11번 컬럼)에도 `setNumberFormat('@')` 추가
- `index.html`에 `normalizeVendors()` 추가 — `applyRemote()`에서 `D.vendors`의 모든 업체를 순회하며 `date`/`depositDate`/`balanceDate`를 `normalizeItemDateStr()`로 복구

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
