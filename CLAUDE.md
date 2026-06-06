# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm run lint     # ESLint
```

DB 마이그레이션은 코드 변경 후 `/api/migrate` 엔드포인트를 호출하거나 `lib/db/migrate.ts`를 직접 실행한다.
시드 데이터는 `/api/seed`로 삽입한다.

## Environment Variables

```
TURSO_DATABASE_URL=   # libsql:// 또는 file:local.db (로컬 개발)
TURSO_AUTH_TOKEN=     # Turso 원격 접속 시 필요, 로컬 파일 DB는 불필요
```

## Architecture

**CHAGEE 매장 직원 근무표 자동 생성 시스템.** 점장이 매주 직원 스케줄을 자동으로 초안 생성하고 확인·수정 후 확정하는 웹앱.

### 페이지 구조

| 경로 | 역할 |
|------|------|
| `/` | 대시보드 (이번 주 스케줄 + 공평 지표 요약) |
| `/employees` | 직원 목록 및 파트 성향 관리 |
| `/shift-parts` | 근무 파트(오픈/미들/마감 등) 설정 |
| `/schedule/generate` | 대상 주 선택 → 초안 생성 |
| `/schedule/[week]` | 주간 스케줄 검토·수정·확정 (`week` = `YYYY-WNN`) |
| `/schedule/month` | 월간 캘린더 뷰 |

### 데이터 레이어 (`lib/db/`)

- **`schema.ts`** — Drizzle 테이블 정의 + 추론 타입 export
  - `employees`: 직원 정보, 파트 성향(`open/middle/closePreference`: `like|neutral|dislike`), 근무 가능 요일(JSON 배열)
  - `shiftLogs`: 날짜별 근무 기록 (`shiftType` = `open|middle|close|off`, `dayType` = `weekday|weekend|holiday`)
  - `shiftParts`: 점장이 커스텀 설정 가능한 근무 파트 (코드, 시간, 순서)
  - `schedules`: 주 단위 스케줄 메타 (`status`: `draft|confirmed`, `weekLabel` = `YYYY-WNN`)
- **`client.ts`** — lazy 싱글턴 패턴으로 DB 커넥션 관리. `db` proxy 또는 `getDb()` 로 접근.
- **`shiftParts.ts`** — `getActiveShiftParts()` 헬퍼

### 스케줄러 (`lib/scheduler/`)

- **`fairness.ts`** — 공평 점수 계산
  - 부담 가중치: `open=1`, `middle=0`, `close=2`
  - 성향 계수: `like×0.5`, `neutral×1.0`, `dislike×1.5`
  - 휴무 보상: `weekday=1`, `weekend=2`, `holiday=3`
  - `fairnessScore = Σ(개인 부담값) - Σ(보상 가중치)` — 높을수록 우선 보상
- **`generate.ts`** — Greedy Fairness Scheduler. `generateWeekSchedule()` 가 핵심 진입점.
  1. 직원별 최대 2일 휴무 배정 (공평 점수 높은 순으로 주말/공휴일 우선)
  2. 각 날짜별 근무 인원을 공평 점수 순으로 파트에 배분

### API Routes (`app/api/`)

- `schedule/[week]` — GET(조회) / PUT(초안 저장) / PATCH(확정)
- `schedule/generate` — POST: 알고리즘 실행 후 초안 반환
- `schedule/month` — GET: 월간 로그 조회
- `employees` — GET/POST, `employees/[id]` — PATCH/DELETE
- `shift-parts` — GET/POST/PUT/DELETE
- `fairness` — GET: 직원별 누적 공평 점수

### 주요 패턴

- **Next.js 16 App Router**: `params`가 `Promise`이므로 반드시 `await params` 처리.
- **`lib/shift-parts.ts`**: `DEFAULT_SHIFT_PARTS` 상수 및 `WorkShiftPart` 타입 — DB에 데이터 없을 때 폴백으로 사용.
- **`lib/calendar/koreaHolidays.ts`**: 한국 공휴일 조회 및 `holidayNameMap()` 유틸.
- **주 라벨 포맷**: `YYYY-WNN` (예: `2026-W23`), 주 시작은 **일요일**.
- UI 컴포넌트: Tailwind CSS v4 + shadcn/ui (Base UI 기반).
