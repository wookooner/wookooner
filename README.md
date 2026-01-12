<div align="center">

# 🛡️ PDTM - Personal Digital Trace Manager

**Local-first, Privacy-focused Digital Footprint Manager**

당신이 어디에 로그인했고, 어디에 정보를 남겼는지 스스로 파악하고 관리하세요.

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 🤔 왜 PDTM인가?

우리는 매일 수십 개의 웹사이트에 로그인하고, 댓글을 남기고, 결제를 합니다. 하지만 정작 **"내가 어디에 계정이 있는지"**, **"어디에 내 정보를 남겼는지"** 기억하기 어렵습니다.

PDTM은 이 문제를 해결합니다:

- ✅ **로그인/회원가입** 했던 사이트를 자동으로 감지
- ✅ **댓글/게시글** 작성 활동 추적
- ✅ **결제/거래** 시도 기록
- ✅ 모든 데이터는 **내 브라우저에만** 저장 (서버 전송 없음)

---

## 📦 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 실행 (미리보기)
npm run dev

# 3. 확장 프로그램 빌드
npm run build
```

**Chrome에 로드하기:**
1. `chrome://extensions` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램 로드" → `dist` 폴더 선택

---

## 🎯 핵심 기능

### 1. 행동 자동 분류

PDTM은 웹 활동을 4가지 레벨로 분류합니다:

| 레벨 | 의미 | 예시 |
|------|------|------|
| 👁️ **View** | 단순 열람 | 뉴스 읽기, 검색 |
| 👤 **Account** | 계정 활동 | 로그인, 회원가입, 설정 변경 |
| ✏️ **UGC** | 콘텐츠 생성 | 댓글, 게시글, 리뷰 작성 |
| 💳 **Transaction** | 거래/결제 | 결제, 구독, 주문 |

### 2. 탐지 방식

**URL 기반 탐지:**
```
/login, /signin     → Account
/checkout, /payment → Transaction
/edit, /compose     → UGC
```

**DOM 구조 탐지:**
```
<input type="password">  → Account (로그인 폼)
<textarea> (큰 편집기)    → UGC (글쓰기)
신용카드 입력 필드        → Transaction
```

**인증 프로토콜 탐지:**
- OAuth 2.0 / OIDC 파라미터 (`client_id`, `redirect_uri`)
- SAML 2.0 Form (`SAMLResponse`)
- SSO 리다이렉트 플로우

### 3. 관리 상태 (Management State)

탐지된 활동은 신뢰도에 따라 상태가 부여됩니다:

```
SUGGESTED   → 높은 확신. "Managed" 탭에 표시
NEEDS_REVIEW → 검토 권장. "Review" 탭에 표시  
NONE        → 단순 방문. 기록만 유지
PINNED      → 사용자가 직접 고정
```

### 4. Attention Score (위험도 점수)

각 도메인에 0-100 점수가 부여됩니다:

| 요소 | 점수 |
|------|------|
| Transaction 활동 | +70 |
| UGC 활동 | +45 |
| Account 활동 | +30 |
| 자주 방문 (200회+) | +10 |
| Finance 카테고리 | +20 |
| 사용자 Whitelist | -30 |

> 점수가 높을수록 "관리 필요성"이 높다는 의미입니다. 악성 사이트를 뜻하지 않습니다.

---

## 🖥️ UI 구조

### Overview (홈)
- 오늘 기록된 이벤트 수
- Managed / Review 항목 수
- 마지막 정리 시간

### Recent (최근)
- 시간순 방문 기록
- "Managed" 배지로 중요 사이트 표시

### Managed (관리 대상)
- 로그인, 결제, 글쓰기 활동이 감지된 사이트
- Pin(고정), Whitelist(안전 표시), Category(태그) 설정 가능

### Review (검토)
- 자주 방문하지만 아직 분류되지 않은 사이트
- Ignore로 숨기기 가능

### Settings (설정)
- 수집 일시정지/재개
- Privacy Mode 전환
- Review 임계값 조정
- Factory Reset

---

## 🔒 프라이버시 원칙

PDTM은 **엄격한 프라이버시 원칙**을 따릅니다:

### 절대 하지 않는 것
- ❌ 입력값 저장 (비밀번호, 카드번호 등)
- ❌ URL 전체 저장 (path, query 포함)
- ❌ 외부 서버 전송
- ❌ 쿠키/토큰 접근

### 저장하는 것
- ✅ 도메인명만 (`example.com`)
- ✅ 활동 유형 (`account`, `ugc` 등)
- ✅ 타임스탬프
- ✅ 구조적 신호 (폼 존재 여부 등)

### Privacy Mode

| 모드 | 설명 |
|------|------|
| **STRICT** (기본) | 존재 여부만 확인. 메타데이터 최소화 |
| **IMPROVED** | 구조적 해시 수집. 더 정확한 탐지 |

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                  Content Scripts                         │
│  content_probe.js: DOM 신호 탐지 (password, editor)      │
│  saml_detector.js: SAML Form 탐지                        │
└────────────────────────┬────────────────────────────────┘
                         │ chrome.runtime.sendMessage
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Service Worker                          │
│  - webNavigation 이벤트 수신                             │
│  - Session Graph 관리 (탭 관계, 시간 순서)               │
│  - Classifier 호출 → Activity State 업데이트            │
│  - Risk Score 계산 → Management State 결정              │
└────────────────────────┬────────────────────────────────┘
                         │ chrome.storage.local
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Storage Layer                          │
│  events: 방문 이벤트 로그                                │
│  domain_state: 도메인별 통계                             │
│  activity_state: 활동 분류 결과                          │
│  risk_state: Attention Score                            │
│  user_overrides: Pin/Whitelist/Ignore                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 프로젝트 구조

```
├── content/
│   ├── content_probe.js    # DOM 신호 탐지
│   └── saml_detector.js    # SAML Form 탐지
├── signals/
│   ├── activity_levels.js  # VIEW/ACCOUNT/UGC/TRANSACTION
│   ├── signal_codes.js     # 신호 코드 정의
│   ├── heuristics.js       # 신호 → 레벨 변환 로직
│   └── oauth_constants.js  # OAuth 탐지 규칙
├── storage/
│   ├── defaults.js         # 저장소 키/기본값 SSOT
│   ├── activity_state.js   # 활동 상태 저장
│   └── management_state.js # 관리 상태 정의
├── risk/
│   ├── risk_model.js       # 점수 계산 모델
│   └── state_mapper.js     # 상태 결정 로직
├── jobs/
│   ├── classifier_job.js   # 분류 오케스트레이션
│   ├── risk_job.js         # 위험도 계산
│   └── retention_job.js    # 데이터 정리
├── utils/
│   ├── confidence.js       # 신뢰도 계산
│   ├── domain.js           # 도메인 추출
│   └── rp_inference.js     # RP/IdP 추론
├── ui/
│   ├── view_models.js      # UI 데이터 변환
│   └── explanations.js     # 설명 텍스트 생성
├── src/
│   └── main.tsx            # React Popup UI
├── service_worker.js       # 백그라운드 로직
└── manifest.json           # 확장 프로그램 설정
```

---

## 🔧 주요 설정

### Retention Policy (데이터 보관)
```javascript
{
  raw_events_ttl_days: 30,        // 이벤트 로그 30일 보관
  prune_inactive_domains_days: 180 // 180일 미방문 시 삭제
}
```

### 분류 임계값
```javascript
{
  softThreshold: 25  // 이 점수 이상이면 Review 탭에 표시
}
```

---

## 🎮 활용 예시

### 1. 계정 정리
1. **Managed** 탭에서 로그인했던 사이트 목록 확인
2. 더 이상 사용하지 않는 사이트 → 해당 사이트에서 계정 삭제
3. PDTM에서 **Ignore** 처리

### 2. 보안 점검
1. **Finance** 카테고리로 태그된 사이트 확인
2. 2FA 활성화 여부 점검
3. 비밀번호 변경 주기 관리

### 3. 디지털 발자국 파악
1. **Review** 탭에서 자주 방문하는 사이트 확인
2. 의도치 않게 많이 쓰는 서비스 인지
3. 필요시 사용 습관 조정

---

## 🚧 로드맵

- [ ] **Phase 1**: 규칙 기반 탐지 고도화
- [ ] **Phase 2**: 로컬 AI 모델 통합 (Enhanced Mode)
- [ ] **Phase 3**: 한국 플랫폼 특화 (네이버, 카카오)
- [ ] **Phase 4**: 데이터 내보내기/가져오기
- [ ] **Phase 5**: Firefox/Edge 지원

---

## 🤝 기여하기

1. Fork 후 feature branch 생성
2. 변경사항 커밋
3. Pull Request 제출

**코드 원칙:**
- 프라이버시 우선 (값 접근 금지)
- SSOT 패턴 유지 (`defaults.js`, `signal_codes.js`)
- 에러 핸들링 필수

---

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

---

<div align="center">

**🛡️ 당신의 디지털 발자국, 당신이 관리하세요.**

</div>