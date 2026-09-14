# Supabase 보안 테스트 패키지

**운영 프로젝트에서 실행 금지.** 이 폴더는 별도 Supabase 테스트 프로젝트와 테스트 계정 3개(소유자·참여자·공격자)에서만 사용합니다. 실제 이용자 UUID·토큰·데이터는 파일에 넣지 않습니다.

## 목표

1. 참여자는 `submit_gift_contribution` RPC로만 `pending` 기록을 만들 수 있다.
2. 직접 REST/SQL INSERT로 `confirmed` 상태 또는 임의 금액을 만들 수 없다.
3. 위시리스트 소유자만 `decide_gift_contribution`으로 상태를 바꿀 수 있다.
4. 공개 프로필 조회는 공유에 필요한 필드만 반환하며 생일 등 비공개 열을 반환하지 않는다.
5. 비소유자는 타인의 프로필·참여 목록·감사 기록을 읽거나 고칠 수 없다.

## 순서

1. 테스트 프로젝트에 현재 **정확한 적용 순서가 확인된** 마이그레이션만 적용한다. `reset_`, `delete_`가 붙은 파일이나 전체 SQL 폴더 일괄 실행은 금지한다. 특히 `kakao_pay_url`과 참여 RPC 관련 마이그레이션이 먼저 있어야 한다.
2. 앱의 공개 프로필 읽기를 `get_public_profile` RPC로 바꾼 뒤, `20260920_security_hardening_draft.sql`을 검토하여 테스트 프로젝트에만 적용한다.
3. Dashboard SQL Editor에서 `readonly-audit.sql`을 실행해 정책·권한 결과를 저장한다.
4. 세 테스트 계정의 실제 access token으로 `http-attack-checklist.md`를 실행한다.
5. 예상 결과가 모두 일치한 뒤에만 운영 적용안을 별도 검토한다.

## 통과 기준

- `contributions` 테이블에 anon/authenticated의 INSERT·UPDATE·DELETE 권한이 없다.
- RPC 이외의 참여 생성은 401/403 또는 RLS 오류로 실패한다.
- `profiles`의 직접 SELECT는 본인 행만 가능하고, 공개 프로필 RPC는 허용 필드만 돌려준다.
- 공개 위시리스트의 진행률은 aggregate 열로 표시되고 다른 참여자의 이름·금액은 일반 방문자에게 노출되지 않는다.
