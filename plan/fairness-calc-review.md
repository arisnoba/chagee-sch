# 공평 지표(Fairness) 계산식 검토 및 견고화

> 검토 문서. `lib/scheduler/fairness.ts`의 정확성·견고성 점검 결과.
> 관련: 기존 스케줄러 종합 감사 `plan/schedule-audit.md`.

## 배경

`lib/scheduler/fairness.ts`는 앱의 핵심 알고리즘이다 — 누가 더 일했고 덜 쉬었는지를
점수화해 휴무·선호 파트 배정 우선순위를 정한다. **커스텀 파트를 실제로 사용/사용 예정**인 환경에서
계산이 올바르고 탄탄한지 검토했다.

결론: **피드백 루프 구조 자체는 건전**하다.
많이 일하고(burden↑) 적게 쉰(reward↓) 사람 → 점수↑ → 우선 보상 → reward↑ → 점수↓ → 균형.
그러나 계산식이 `open/middle/close` 코드를 하드코딩해 **커스텀 파트에서 붕괴**하고,
기본 파트에서도 개념적 결함이 남는다.

---

## 현재 모델

`calcFairnessScore = Σ(burden) − Σ(reward)` (높을수록 우선 보상, 내림차순 랭킹)

- `getBaseBurden`: `open=1`, `middle=0`, `close=2`, `off=0` — **그 외 코드는 fallback `return 1`** (`fairness.ts:26-31`)
- `PREFERENCE_MULTIPLIER`: `like×0.5`, `neutral×1.0`, `dislike×1.5` (`fairness.ts:13-17`)
- `DAY_REWARD`(휴무만): `weekday=1`, `weekend=2`, `holiday=3` (`fairness.ts:7-11`)

---

## 발견 사항 (심각도순)

### 🔴 Critical — 커스텀 파트에서 계산 붕괴
- `getBaseBurden`/`getPreference`가 `open/middle/close`를 하드코딩 (`fairness.ts:19-31`).
- `shift-parts` 저장 시 `readCode()`가 커스텀 코드를 `part-1`, `part-2`…로 생성 (`app/api/shift-parts/route.ts:23-40`).
- `employees`엔 성향 컬럼이 3개(`open/middle/close_preference`)뿐 (`lib/db/schema.ts:9-11`), 파트는 최대 6개·임의 코드.
- **결과**: 파트를 커스터마이즈하는 순간 모든 부담이 fallback `1`로 평탄화 + 성향 전부 `neutral`로 무시.
  close 가중치·성향 계수가 사라져 점수가 사실상 "근무일 수"로 퇴화한다.

### 🟠 High — 기본 3파트에서도 남는 결함
- **미들 = 보이지 않는 노동**: `middle` base=0 → 미들 근무 부담 0(=휴무와 동일). `0×1.5=0`이라 미들 기피(`dislike`)도 보상 안 됨 (`fairness.ts:28`).
- **근무 요일 비대칭**: 근무 burden이 `dayType` 무시. 주말/공휴일 **휴무** 보상만 2~3배, **근무** 부담은 평일과 동일 → 프리미엄 데이 근무자 과소평가 (`fairness.ts:48-49`).
- **무한 누적·정규화 없음**: 전체 confirmed 로그를 그대로 합산 (`app/api/fairness/route.ts:8`). 근속 길수록 절댓값 지배, 신입은 0에서 시작, 과거 불균형 영구 잔존. 최근성/근무일당 정규화 없음.

### 🟡 Medium
- **동점 편향**: 점수 내림차순만으로 정렬 → 동점은 배열 순서(낮은 id) 고정 → 같은 직원이 매주 유리 (`fairness.ts:62-64`, 기존 `schedule-audit.md:152`와 동일).
- **성향 척도 이중 정의**: `fairness.ts`의 `0.5/1/1.5` vs `generate.ts:57-59`의 `prefScore` `2/1/0`. 조회 로직 중복.

---

## ★ 핵심 권장안 — 파트 가중치는 "선택"하지 말고 시간에서 도출

**문제 제기**: 파트가 랜덤으로 늘어나(최대 6개, 코드 `part-N`) 점장이 파트마다 부담 가중치를
일일이 정하는 것은 운영상 까다롭고 일관성도 깨진다.

**해결 원칙**: 가중치를 입력받지 말고 **근무 시간(`startTime`/`endTime`)에서 자동 계산**한다.
모든 파트는 이미 시간 정보를 가지므로 파트 개수·코드와 무관하게 자동 일반화된다.

### 세 가지 방식 비교

| 방식 | 파트 추가 시 | 설명 가능성 | 비고 |
|------|------------|-------------|------|
| ① 수동 가중치 입력 | 파트마다 점장이 직접 결정 (까다로움) | 주관적 | ❌ |
| **② 시간 기반 자동 도출** | **입력 0개, 자동** | "마감이 늦어 무겁다" 객관적 | ✅ **권장** |
| ③ 정렬순서 기반 | 자동이나 `open>middle` 비단조 표현 불가 | 약함 | △ |

### 시간 기반 모델 (권장 ②)

부담 = 모든 근무에 공통인 기본 노동 + 비사회적 시간(이른 아침·늦은 밤) 가산.

```
startMin, endMin = 분 단위 (자정 넘으면 endMin += 1440)
earliness = max(0, 600  − startMin) / 60   # 10:00 이전 시작 시간(시간)
lateness  = max(0, endMin − 1260) / 60     # 21:00 이후 종료 시간(시간)
burden = BASE + EARLY_W·earliness + LATE_W·lateness   # 초기값 BASE=1.0, EARLY_W=LATE_W=0.5
```

기본 파트 검산(현행 의도 재현 + 미들 nonzero):

| 파트 | 시간 | earliness | lateness | burden |
|------|------|-----------|----------|--------|
| 오픈(open) | 09:00–18:00 | 1.0 | 0 | **1.5** |
| 미들(middle) | 12:00–21:00 | 0 | 0 | **1.0** |
| 마감(close) | 15:00–00:00 | 0 | 3.0 | **2.5** |

→ `close > open > middle > 0` 순서 유지, **미들도 0이 아니라 "보이지 않는 노동" 문제 동시 해결**.
공평 점수는 비교(랭킹) 용도라 절댓값 스케일 변화는 무해. 정확한 상수는 회귀 테스트로 고정.

> 선택: 자동값을 기본으로 두고 특정 파트만 점장이 오버라이드하는 하이브리드도 가능하나,
> "까다로움 제거"가 목적이면 **순수 자동(오버라이드 없음)** 을 권장한다.
