# 근무표 자동생성 시스템 — 허점 분석 및 개선 로드맵

> 작성일: 2026-06-06  
> 분석 대상: `lib/scheduler/`, `app/api/schedule/`, `app/schedule/`, `components/`, `lib/db/`, `lib/calendar/`  
> 기준 문서: `PRD.md`

---

## 요약: 즉시 처리할 결함 4건

| # | 결함 | 영향 |
|---|------|------|
| **B1** | `/api/seed` 무인증 공개 + 전체 테이블 파괴 | 누구나 호출 시 실 데이터 전손 |
| **B2** | 저장 로직 delete→insert 비트랜잭션 | 삽입 실패 시 해당 주/파트 데이터 유실 |
| **B3** | 저장 payload의 employeeId/shiftType 미검증 | 삭제 직원·없는 파트·잘못된 id가 근무 로그에 저장될 수 있음 |
| **B4** | 생성 API의 날짜/주차 검증 부족 | 잘못된 날짜로 생성되거나 확정 주차 충돌을 늦게 발견 |

> 참고: `availableDays` 필드는 스키마에 남아 있지만, 최근 제품 방향에서는 직원관리 화면에서 근무 가능 요일 UI를 제거했다. 이번 작업에서는 근무 가능 요일 기능을 복구하지 않고, "활성 직원은 전 요일 근무 가능" 모델로 유지하기로 결정했다.

---

## PRD 7장 알고리즘 구현 현황

| 단계 | PRD 명세 | 구현 여부 |
|------|----------|:---------:|
| 1 | 날짜 × 파트 슬롯 목록 생성 | ✅ |
| 2 | 각 직원의 fairness_score 계산 (성향 반영) | ⚠️ 기본 구조는 동작하나 계산식 재설계 필요 → F |
| 3a | 해당 날 출근 가능한 직원 필터 | ❌ 미구현 |
| 3b | 당일 이미 배정된 직원 제외 | ✅ (휴무 제외로 간접 처리) |
| 3c | fairness_score 높은 순 정렬 | ✅ |
| 3d | **상위 후보 중 랜덤 배정 (동점 처리)** | ✅ 생성 경로에 seed 기반 동점 셔플 적용 |
| 4 | 잔여 인원 휴무 배정 (공휴일/주말 우선) | ✅ 직원 수 비례 상한으로 2일 보장 개선 |
| 5 | 초안 저장 | ✅ |
| 6 | 성향 매칭률 지표 출력 | ❌ 미구현 |

---

## 처리 체크리스트

### A. 생성 룰(알고리즘)

- [x] **A1** 근무 가능 요일 필드와 현재 제품 방향 불일치 — 미복구 결정, 전 요일 근무 가능 모델 유지
- [x] **A2** 파트당 최소 인원 0명 가능 — 파트 수 이하 인원은 앞 파트부터 1명씩 배정
- [x] **A4** 클로프닝(마감→오픈) 강제 배정 — 스왑 우선, 불가피 사유 표시
- [x] **A5** 동점 랜덤 미구현 → id 작은 직원 구조적 유리 — 생성 경로에 seed 기반 동점 셔플 적용
- [x] **A6** 휴무 2일 보장 실패 — 직원 수 비례 일별 휴무 상한 적용
- [x] **A7** 타임존 UTC 버그 — 로컬 날짜 유틸로 주요 생성 경로 통일
- [x] **A9** 공휴일 silent failure — 실패 결과 캐시 제외 및 생성 경고 추가
- [x] **A10** `getShiftPreferenceOrder` 죽은 정렬 제거

### B. API · 데이터 무결성

- [x] **B1** seed/migrate 무인증 공개 + 전체 테이블 파괴
- [x] **B2** PUT delete→insert 비트랜잭션 데이터 유실
- [x] **B3** employeeId/shiftType 미검증 + 런타임 FK 부재 중 API 검증
- [x] **B4** generate에 confirmed 보호·startDate 검증 없음
- [x] **B5** 비활성 직원이 [week] GET에 노출
- [x] **B6** 에러 포맷 비일관 + 내부 예외 메시지 노출

### C. UI/UX

- [x] **C1** [week] 사후 수정·확정·되돌리기 UI 부재
- [x] **C2** 수정 시 공평 점수 실시간 재계산 없음
- [x] **C3** 모바일 캘린더 깨짐 + 비반응형 네비
- [x] **C4** 출력/공유 기능 전무
- [x] **C5** 대시보드·[week] fetch 에러 미처리
- [x] **C6** 차트 막대색이 티어와 불일치
- [x] **C7** 접근성
- [x] **C8** 생성 실패 무피드백

---

## 섹션 A. 생성 룰(알고리즘) 허점

### A1 — 근무 가능 요일 필드와 현재 제품 방향 불일치 `[처리 완료: 미복구 결정]` `[시연 영향: 낮음~높음]`

**처리 상태**  
완료. 근무 가능 요일 기능은 복구하지 않고, 현재 제품 방향대로 활성 직원은 전 요일 근무 가능하다고 본다.  
`availableDays`는 현 DB 호환을 위해 남겨 두되, 생성 룰에는 적용하지 않는다.

**현재 동작**  
`generate.ts:269`의 `workingEmps` 필터는 `휴무가 아닌 전원`을 그날 근무에 투입한다.  
`schema.ts:8`에 `availableDays` 필드가 존재하지만, 스케줄러 파일 전체에서 이 값을 읽는 코드가 단 한 줄도 없다.

**문제 상황**  
PRD 6장 목업 기준: 이서연(화~토)은 월/일 출근 불가, 한승우(월·화·목·금)는 수/토/일 불가다.  
그러나 현재 로직은 이 직원들을 불가 요일에도 배정한다.

단, 현재 직원관리 UI에서는 근무 가능 요일 입력을 제거한 상태다. 모든 직원을 전 요일 근무 가능으로 보는 것이 현재 제품 결정이므로, 이 항목은 치명 결함이 아니라 레거시 스키마/PRD 불일치로 분류한다.

**수정 방향**  
- 추후 스키마 정리 라운드에서 `availableDays` 제거 여부와 PRD 목업 설명 정리를 함께 검토한다.

---

### A2 — 파트당 최소 인원 0명 가능 `[치명]` `[시연 영향: 중간]`

**처리 상태**  
완료. 근무 인원이 파트 수 이하일 때는 정렬된 파트 순서대로 1명씩 배정해 앞 파트가 구조적으로 0명이 되는 문제를 제거했다. 근무 인원이 파트 수보다 많을 때는 기존처럼 전체 균등 분배 후 마지막 파트를 더 두텁게 배정한다.

**현재 동작**  
`generate.ts:106-117 getShiftCapacities`: `base = Math.floor(W / parts.length)`. 나머지(`extra`)는 마지막 파트부터 역순으로 +1.

**문제 상황**  
휴무 제외 근무자 `W=2`, 파트 3개인 날 → `base=0, extra=2` → middle·close에 1명씩, **open에 0명**.  
인원이 빠듯하거나 파트를 4개 이상 설정한 경우 오픈 공백이 빈번히 발생한다.  
"나머지를 마지막 파트부터 채우는" 편향 때문에 오픈이 항상 가장 먼저 0명이 되는 구조다.

**수정 방향**  
- 파트별 `minStaff`(기본 1) 먼저 보장 후, 잔여 인원만 floor 분배  
- 전체 근무 가능 인원이 `파트 수 × minStaff`보다 부족하면 생성 전 경고 반환

---

### A4 — 클로프닝(마감→오픈) 강제 배정 `[높음]` `[시연 영향: 낮음]`

**처리 상태**  
완료. 전날 마지막 파트 근무자는 다음날 첫 파트 후보에서 제외하고, 남은 첫 파트 정원이 있을 때는 기존 배정 직원과 스왑을 먼저 시도한다. 스왑도 불가능한 경우에만 첫 파트 배정을 허용하고 사유에 "불가피"를 남긴다.

**현재 동작**  
`generate.ts:101,134`: 전날 마지막 파트 근무자는 다음날 첫 파트 배정을 회피 *시도*한다.  
그러나 `153-166` fallback이 cap 소진 시 **무조건 첫 파트를 강제 배정**한다.

**문제 상황**  
예: 마감(15:00~00:00) 다음날 오픈(08:00~) 배정 → 8시간 미만 휴식.  
회피가 "노력"에 그쳐 실제로 막지 못한다.

**수정 방향**  
- 회피를 하드 제약으로 승격: 클로프닝이 불가피한 경우 다른 직원과 파트 스왑 시도  
- 스왑도 불가한 경우 `reasons`에 "클로프닝 불가피" 명시적 경고 추가

---

### A5 — 동점 랜덤 미구현 → id 작은 직원 구조적 유리 `[중간]` `[시연 영향: 높음]`

**처리 상태**  
완료. `rankByFairness`에 선택적 seed 기반 동점 셔플을 추가하고, 스케줄 생성 경로에서는 주 시작일·날짜 기반 seed를 사용한다. 같은 입력은 재현 가능하지만 동점 직원이 DB id 순서에 고정되지 않는다.

**현재 동작**  
`fairness.ts:58-65 rankByFairness`는 단순 내림차순 정렬만 한다.  
동점 시 JS 안정 정렬 특성상 **원본 배열 순서(=DB id 순)** 가 유지된다.

**문제 상황**  
첫 주(pastLogs 없음) → 전원 fairnessScore=0 → 항상 id 작은 직원부터 선호 파트/좋은 휴무를 배정.  
PRD 7장 "3d. 상위 후보 중 랜덤 배정(동점 처리)"가 미구현.  
시연 시 "공평하게 짜여졌다" 납득에 직접 영향.

**수정 방향**  
- 동점 그룹 내 Fisher-Yates 셔플 적용  
- 주차 seed(예: `weekLabel` 해시)로 셔플을 결정론적으로 재현 가능하게 유지

---

### A6 — 휴무 2일 보장 실패 `[중간]` `[시연 영향: 중간]`

**처리 상태**  
완료. 일별 휴무 상한을 `max(4, ceil(직원 수 × 2 / 7))`로 동적 산정해 직원 수가 늘어도 총 휴무 슬롯이 부족하지 않게 했다. 기존 라운드 방식은 유지해 전원 1일 휴무를 먼저 배정한 뒤 두 번째 휴무를 배정한다.

**현재 동작**  
`generate.ts:190-210 assignOffDays`: 주말·공휴일을 강하게 선호하는 정렬 + `MAX_OFF_PER_DAY=4` 상한.

**문제 상황**  
10명이 2일씩 쓰면 20개 슬롯 필요, 가용 슬롯은 `7×4=28`로 총량은 충분하다.  
그러나 주말(2일)에 쏠려 `MAX_OFF_PER_DAY=4` 상한이 먼저 차면, 공평 점수 하위 직원들은 좋은 날이 다 차서 평일조차 받지 못해 0~1일 휴무로 끝날 수 있다.

**수정 방향**  
2단계 분배: 1차 라운드에서 전원 1일씩 보장(상한 무시) → 2차 라운드 추가 1일 배정.  
또는 `MAX_OFF_PER_DAY`를 `Math.ceil(employees.length * 2 / 7)` 등 인원 비례로 동적 산정.

---

### A7 — 타임존 UTC 버그 `[중간]` `[시연 영향: 중간]`

**처리 상태**  
완료. `lib/calendar/date.ts`의 로컬 날짜 유틸을 생성 경로에 적용했다.

**현재 동작**  
`generate.ts:44,278`, `[week]/route.ts:14`에서 `toISOString().slice(0,10)` 패턴 사용.

**문제 상황**  
`toISOString()`은 UTC 기준이다. 서버가 KST(UTC+9)이고 `weekStart`가 KST 자정(`00:00`)이면, UTC 변환 시 전날 `15:00`이 되어 날짜가 하루 밀린다.  
`generate.ts:278`의 "전날 마지막 파트" 비교도 잘못된 날짜를 보게 되어 클로프닝 회피 로직이 엉뚱하게 작동한다.

**수정 방향**  
로컬 날짜 포맷 유틸 함수(`toLocalDateString(d: Date): string`)를 만들어 `YYYY-MM-DD`를 직접 구성.  
모든 날짜 처리 경로를 이 유틸로 통일.

---

### A9 — 공휴일 silent failure `[중간]` `[시연 영향: 낮음]`

**처리 상태**  
완료. 실패한 공휴일 요청은 캐시에서 제외하고, 생성 API는 `holidaysLoaded`를 반환해 UI 경고를 표시한다.

**현재 동작**  
`koreaHolidays.ts:28-39`: 외부 API(`holidays.hyunbin.page`) 실패 시 `.catch(() => [])` + 빈 결과 캐싱(30일 TTL).

**문제 상황**  
첫 호출이 네트워크 오류이면 "공휴일 없음"이 30일간 캐싱된다.  
공휴일 보상 가중치(+3)가 통째로 사라져 공평 점수 계산이 틀어진다.

**수정 방향**  
실패한 결과는 캐시에서 제외.  
`generate` API 응답에 `"holidaysLoaded": false` 플래그 포함해 UI에서 경고 표시.

---

### A10 — `getShiftPreferenceOrder` 죽은 정렬 `[낮음]`

**처리 상태**  
완료. 중복 `.sort()` 중 첫 번째 정렬을 제거했다.

**현재 동작**  
`generate.ts:68-73`: `.sort()` 호출 후 바로 동일 기준의 `.sort()`를 다시 호출한다.  
첫 번째 sort는 두 번째 sort에 완전히 덮어써져 **dead code**.

**수정 방향**  
첫 번째 sort 제거.

---

## 섹션 B. API · 데이터 무결성 허점

### B1 — seed/migrate 무인증 공개 + 전체 테이블 파괴 `[CRITICAL]`

**현재 동작**  
`seed/route.ts:4`, `migrate/route.ts:4`: 인증·환경 체크 없는 공개 `POST` 엔드포인트.  
`seed.ts:153-156`: `db.delete(shiftLogs)` → `db.delete(schedules)` → `db.delete(shiftParts)` → `db.delete(employees)` 순서로 전체 테이블을 비운 뒤 목업 데이터로 재삽입.

**문제 상황**  
프로덕션에서 누구나 `POST /api/seed` 한 번으로 실 직원 데이터와 모든 근무 기록이 삭제된다.

**수정 방향**  
- `NODE_ENV !== "development"` 시 403 반환  
- 또는 `SEED_SECRET` 환경변수와 비교하는 헤더 인증 추가  
- seed는 멱등화(이미 데이터가 있으면 skip) 또는 프로덕션 완전 차단

---

### B2 — PUT delete→insert 비트랜잭션 데이터 유실 `[HIGH]`

**현재 동작**  
`[week]/route.ts:92-93`: `db.delete()` 후 `db.insert()`가 별개 문장으로 실행.  
`shift-parts/route.ts:93-94`도 동일 패턴.

**문제 상황**  
delete 성공 후 insert가 실패(네트워크/제약 위반)하면 해당 주의 모든 근무 로그가 영구 소실된다.  
확정(confirmed) 주를 `replaceConfirmed:true`로 갱신할 때 특히 치명적.

**수정 방향**  
```ts
await db.transaction(async (tx) => {
  await tx.delete(shiftLogs).where(eq(shiftLogs.weekLabel, week));
  if (logsToInsert.length > 0) await tx.insert(shiftLogs).values(logsToInsert);
});
```

---

### B3 — employeeId/shiftType 미검증 + 런타임 FK 부재 `[HIGH]`

**현재 동작**  
`[week]/route.ts:72-90`: `isValidDaySchedule`이 `date`/`dayType`/배열 형태만 검사.  
`slot.employeeId`, `slot.shiftType`은 검증 없이 DB에 삽입된다.  
`migrate.ts`의 `shift_logs` DDL에 FOREIGN KEY 절이 없어 런타임 FK 강제가 안 됨.

**수정 방향**  
- PUT에서 `employeeId` 화이트리스트(DB에서 조회한 활성 직원 id 목록)와 비교  
- `shiftType`은 DB에서 로드한 `shiftPart.code` 목록 + `"off"` 로 화이트리스트 검증  
- migrate DDL에 `REFERENCES employees(id)` 추가

---

### B4 — generate에 confirmed 보호·startDate 검증 없음 `[HIGH]`

**현재 동작**  
`generate/route.ts:19,34`: `startDate` 형식 미검증. `month/route.ts`에는 정규식 가드가 있는데 generate에는 없다.  
generate 단계에서 기존 confirmed 주 존재 여부를 조회하지 않는다.

**수정 방향**  
- `startDate`를 `/^\d{4}-\d{2}-\d{2}$/` 정규식으로 검증  
- `new Date(startDate)`가 Invalid Date인지 체크  
- 이미 confirmed 주이면 `{ warning: "SCHEDULE_CONFIRMED" }` 응답 포함(UI에서 경고)

---

### B5 — 비활성 직원이 [week] GET에 노출 `[MEDIUM]`

**현재 동작**  
`[week]/route.ts:29`: `db.select().from(employees)` — `isActive` 필터 없음.

**문제 상황**  
soft-delete된 직원이 근무표 뷰에 노출된다.

**수정 방향**  
`where(eq(employees.isActive, true))` 추가.  
단, 과거에 확정된 주에는 비활성 직원이 포함될 수 있으므로, `shiftLogs`에 등장하는 직원 id를 기준으로 union 조회하는 방법도 고려.

---

### B6 — 에러 포맷 비일관 + 내부 예외 메시지 노출 `[LOW-MED]`

**처리 상태**  
완료. `lib/api/response.ts` 공통 헬퍼로 API 에러 응답을 `{ error, code? }` 형태로 통일했다. 내부 예외는 서버 콘솔에만 기록하고 클라이언트에는 일반 메시지를 반환한다.

**현재 동작**  
- `migrate/seed/route.ts:9`: `String(e)`로 스택/DB 구조 정보 그대로 노출  
- 대부분 라우트에 try/catch 없어 unhandled throw → Next.js 기본 500  
- 성공 응답 포맷도 `{ ok:true }`, 배열 직접 반환, 객체 직접 반환으로 제각각

**수정 방향**  
```ts
// lib/api/response.ts (공통 헬퍼)
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
```
모든 라우트에 try/catch 추가, `String(e)` → 제네릭 메시지로 마스킹.

---

## 섹션 C. UI/UX 개선

### C1 — [week] 사후 수정·확정·되돌리기 UI 부재 `[높음]` `[시연 영향: 높음]`

**처리 상태**  
완료. `[week]` 상세에서 날짜 선택 후 직원별 파트를 수정할 수 있고, 초안 확정·수정 저장·저장 후 확정·확정본 초안 되돌리기를 지원한다.

**현재 동작**  
`app/schedule/[week]/page.tsx`는 완전 읽기 전용. 파트 수정 UI는 generate 초안 단계에만 존재(`generate/page.tsx:407-451`).  
확정 후 한 명만 바꾸려면 전체 재생성 필요.

**문제 상황**  
PRD 핵심 워크플로우("초안 확인, 셀렉트박스로 조정 가능 → 확정") 중 **확정 이후 검토·수정** 경로가 없다.  
[week] 페이지에 확정 버튼도 없어, 저장된 초안 주를 나중에 확정할 방법이 UI에 없다.

**수정 방향**  
- [week] 페이지에 파트 변경 셀렉트박스 추가 (PUT `replaceConfirmed` 재사용)  
- 초안 상태일 때 "확정" 버튼, 확정 상태일 때 "초안으로 되돌리기" 버튼 노출  
- PRD 9장에 정의된 `/schedule/[week]/view` 공유용 읽기전용 뷰 구현

---

### C2 — 수정 시 공평 점수 실시간 재계산 없음 `[중간]` `[시연 영향: 높음]`

**처리 상태**  
완료. `[week]` 수정 패널에서 변경된 주간 배치를 기준으로 직원별 예상 공평 지표를 즉시 재계산해 표시한다.

**현재 동작**  
`generate/page.tsx:299-323 handleToggleShift`: 슬롯만 이동, fairnessScore 미갱신.

**문제 상황**  
점장이 파트를 수동 조정해도 그 결정이 공평성에 미치는 영향을 볼 수 없다.  
제품 핵심 가치인 "공평성 가시화"가 수정 단계에서 단절된다.

**수정 방향**  
클라이언트에서 `calcFairnessScore` 로직을 재사용해 파트 변경 즉시 점수 및 경고를 갱신.  
공평 점수 역전이 발생하면 인라인 경고 표시.

---

### C3 — 모바일 캘린더 깨짐 + 비반응형 네비 `[높음]` `[시연 영향: 중간]`

**처리 상태**  
완료. 주간/월간 캘린더는 모바일에서 세로 리스트로 폴백하고, 글로벌 네비는 줄바꿈과 활성 상태 표시를 지원한다.

**현재 동작**  
`schedule-calendar.tsx:42`: `min-w-[980px]`, `month-schedule-calendar.tsx:41`: `min-w-[1120px]`.  
`layout.tsx:20`: 글로벌 네비에 wrap/햄버거 메뉴 없음.

**문제 상황**  
매장 점장이 폰으로 사용할 가능성이 높은 도구인데, 주간/월간 캘린더가 모바일에서 가로 스크롤 강제.  
인쇄·캡처 시 잘린다.

**수정 방향**  
- 모바일에서 7열 그리드 → 세로 리스트/카드 뷰로 폴백 (CSS `@media` + 조건부 렌더)  
- 네비에 `flex-wrap` 또는 `sm:` 이하에서 햄버거 메뉴 추가

---

### C4 — 출력/공유 기능 전무 `[높음]` `[시연 영향: 높음]`

**처리 상태**  
완료. `[week]` 상세에 인쇄 버튼, 링크 복사 버튼, 인쇄용 CSS를 추가했다. 별도 `/schedule/[week]/view` 라우트는 현재 상세 화면 공유로 대체했다.

**현재 동작**  
인쇄·PDF·이미지 내보내기·링크 공유 버튼이 어느 페이지에도 없다.

**문제 상황**  
생성한 근무표를 직원에게 배포할 수단이 없다. PRD 9장에 정의된 `/schedule/[week]/view`(직원 공유용)도 미구현.

**수정 방향**  
- 인쇄용 CSS(`@media print`) 추가  
- "링크 복사" 버튼(현재 URL 클립보드 복사)

---

### C5 — 대시보드·[week] fetch 에러 미처리 `[중간]` `[시연 영향: 중간]`

**현재 동작**  
`app/page.tsx:59-65`의 `useEffect` fetch에 `.catch()`가 없다.  
`[week]/page.tsx:83-89`의 fetch도 에러 처리 없이 바로 `setData(r.json())`.

**문제 상황**  
API 실패 시 `loading`이 `false`로 안 바뀌어 무한 로딩.  
404/500 응답을 그대로 구조분해하면 런타임 크래시.

**수정 방향**  
```ts
try {
  const res = await fetch(...);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  setData(await res.json());
} catch (e) {
  setError(String(e));
} finally {
  setLoading(false);
}
```

---

### C6 — 차트 막대색이 티어와 불일치 (Quick Win) `[낮음]` `[시연 영향: 중간]`

**처리 상태**  
완료. 대시보드 공평 지표 차트의 막대색을 티어 범례 색상과 일치시켰다.

**현재 동작**  
`app/page.tsx:150`: `<Bar fill="#22c55e">` — 단색 초록.  
`app/page.tsx:31-33`: 티어별 색(`#ef4444`/`#eab308`/`#6b7280`)이 정의돼 있으나 차트에 미적용.

**수정 방향**  
```tsx
<Bar dataKey="score" ...>
  {scores.map((entry) => (
    <Cell key={entry.name} fill={getTierStyle(entry.score, thresholds).bar} />
  ))}
</Bar>
```

---

### C7 — 접근성 `[낮음]`

**처리 상태**  
완료. 네비 활성 상태(`aria-current`), 파트 토글 상태(`aria-pressed`), 주요 버튼 focus ring, 모바일 캘린더 대체 뷰를 추가했다.

| 항목 | 근거 | 수정 방향 |
|------|------|------|
| 네비 active 표시 없음 | `layout.tsx` 링크 전부 동일 스타일 | `usePathname()`으로 `aria-current="page"` + active 스타일 |
| 파트 버튼 토글 상태 미고지 | `generate/page.tsx:409-421` | `aria-pressed` 추가 |
| focus ring 15% 너무 흐림 | `focus:ring-gray-900/15` | `focus-visible:ring-2 focus-visible:ring-offset-2` 표준화 |
| 캘린더 모바일 사용성 | `schedule-calendar.tsx`, `month-schedule-calendar.tsx` | 모바일 세로 리스트와 선택 focus ring 추가 |

---

### C8 — 생성 실패 무피드백 `[중간]` `[시연 영향: 중간]`

**현재 동작**  
`generate/page.tsx:236-255`: `res.ok`가 false이면 에러 메시지 없이 `generating=false`만 세팅.

**수정 방향**  
`res.ok`가 false일 때 인라인 에러 배너 또는 토스트 표시:
```ts
if (!res.ok) {
  const { error } = await res.json();
  setError(error ?? "스케줄 생성에 실패했습니다.");
  return;
}
```

---

## 섹션 D. 권장 처리 순서

| 순위 | 항목 | 이유 |
|------|------|------|
| **1순위** | B1 seed/migrate 보호, B2 트랜잭션, B3 저장 검증, B4 생성 검증 | 배포 전 데이터 전손·오염을 막는 최소 안전장치 |
| **2순위** | C5/C8 fetch·생성 실패 피드백 | 실패 시 무한 로딩/무반응을 제거해 운영자가 원인을 알 수 있게 함 |
| **3순위** | C1 [week] 수정·확정 워크플로우, C4 공유 | 완료 |
| **4순위** | A2 최소 인원, A4 클로프닝, A5 동점 처리, A7 타임존 | 생성 품질과 신뢰도 |
| **5순위** | F 공평 지표 계산식 견고화 | 커스텀 파트와 점수 신뢰도를 위한 다음 핵심 작업 |
| **후속** | 스키마 정리 | `availableDays`, `employmentType` 등 레거시 필드 정리 |

## 섹션 E. 이번 작업 범위

이번 라운드에서는 1순위와 즉시 체감되는 실패 피드백 일부를 처리한다.

- `/api/seed`, `/api/migrate`는 개발 환경에서만 공개 허용하고, 운영 환경에서는 `MAINTENANCE_SECRET` 헤더가 맞을 때만 허용한다.
- `/api/schedule/[week]` 저장은 직원 id와 파트 코드를 검증하고, 기존 로그 교체를 트랜잭션으로 처리한다.
- `/api/shift-parts` 저장도 delete→insert를 트랜잭션으로 묶는다.
- `/api/schedule/generate`는 `weekLabel`/`startDate`를 검증하고, 이미 확정된 주차면 응답에 경고 코드를 포함한다.
- 생성 화면과 주간 상세 화면은 API 실패 시 사용자에게 명확한 에러를 보여준다.
- 근무 가능 요일 기능은 복구하지 않고, 전 요일 근무 가능 모델로 문서상 결정을 닫았다.
- C 섹션은 주간 상세 수정/확정/되돌리기, 실시간 공평 지표, 모바일 캘린더, 출력/공유, 차트 색상, 기본 접근성까지 처리했다.

## 섹션 F. 공평 지표 계산식 재설계 계획

> 기준 문서: `plan/fairness-calc-review.md`  
> 목표: 커스텀 파트에서도 공평 점수가 평탄화되지 않고, 기본 3파트에서도 미들 근무·주말/공휴일 근무·오래된 로그 누적 문제가 점수를 왜곡하지 않게 한다.

### F0 — 테스트 하네스 도입

- [x] `vitest` 도입 및 `npm test` 스크립트 추가
- [x] `lib/scheduler/fairness.test.ts` 추가
- [x] 현재 기본 파트 기대값과 커스텀 파트 회귀 케이스를 테스트로 고정

**성공 조건**
- 기본 파트 부담은 `close > open > middle > 0`
- 미들 근무 부담은 0이 아니다
- `part-1`, `part-2` 같은 커스텀 파트도 시간에 따라 서로 다른 부담을 가진다

### F1 — 시간 기반 파트 부담 계산

- [x] `partBurden(part)` 추가
- [x] `startTime`/`endTime`을 분 단위로 파싱하고 자정 넘김을 처리
- [x] 기본식 적용: `BASE=1.0`, `EARLY_W=0.5`, `LATE_W=0.5`
- [x] `calcBurden`/`calcFairnessScore`/`rankByFairness`가 `shiftParts`를 받을 수 있게 확장
- [x] 호출처 전파: `app/api/fairness/route.ts`, `app/schedule/[week]/page.tsx`, `lib/scheduler/generate.ts`

**초기 모델**
```text
earliness = max(0, 600 - startMin) / 60
lateness = max(0, endMin - 1260) / 60
burden = 1.0 + 0.5 * earliness + 0.5 * lateness
```

### F2 — 파트별 성향 모델

- [ ] `employees.part_preferences` JSON 컬럼 추가
- [ ] 기존 `open/middle/close_preference` 값을 JSON으로 백필
- [ ] `getPartPreference(employee, shiftCode)` 공통 접근자 추가
- [ ] `fairness.ts`와 `generate.ts`의 성향 조회 중복 제거
- [ ] 직원 관리 UI/API에 활성 파트별 성향 입력 추가

**주의**
- 이 단계는 스키마와 UI가 함께 바뀌므로 F1과 별도 커밋으로 진행한다.
- 기존 3개 성향 컬럼은 즉시 제거하지 않고 호환 기간을 둔다.

### F3 — 근무 요일 부담과 최근성

- [ ] 근무 부담에도 요일 계수 적용: `weekday=1`, `weekend=1.5`, `holiday=2`
- [ ] 최근 N주 윈도우 옵션 추가, 기본 8주부터 검토
- [ ] `/api/fairness`와 생성 API의 과거 로그 조회 범위를 동일 기준으로 맞춤
- [ ] 대시보드 점수 분포를 보고 상수 보정

### F4 — 동점 처리 정리

- [x] 생성 경로에는 seed 기반 동점 셔플 적용 완료
- [ ] 공평 지표 표시용 정렬에는 점수 desc 이후 보조 키를 둘지 결정
- [ ] 필요 시 `점수 desc → 누적 휴무 보상 asc → 이름` 순으로 표시 안정성 확보

### 검증 계획

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] 커스텀 파트 4~5개 설정 후 `/api/fairness` 점수가 근무일 수로만 평탄화되지 않는지 확인
- [ ] `/schedule/generate`에서 시간 기반 부담이 배정 사유와 점수에 일관되게 반영되는지 수동 확인
