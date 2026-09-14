# REST/RPC 권한 공격 확인표

테스트 프로젝트의 API URL과 **테스트 계정** access token만 사용합니다. 아래 요청은 운영 프로젝트에 보내지 않습니다.

| 시도 | 실행 주체 | 기대 결과 |
| --- | --- | --- |
| `POST /rest/v1/contributions`에 `status=confirmed` | 참여자/공격자 | 401·403 또는 RLS 거부 |
| `PATCH /rest/v1/contributions?id=eq.<pending-id>` | 참여자/공격자 | 401·403 또는 RLS 거부 |
| `POST /rest/v1/rpc/submit_gift_contribution`에 500원 또는 `confirmed` 유도 값 | 참여자 | `INVALID_REQUEST`; 생성 없음 |
| 열린 공개 상품에 올바른 1,000원 단위 RPC | 참여자 | `pending` 1건만 생성 |
| `decide_gift_contribution` | 공격자 | `NOT_PENDING_OR_NOT_OWNER` |
| `decide_gift_contribution` | 해당 위시리스트 소유자 | pending → confirmed/cancelled만 가능 |
| `GET /rest/v1/profiles?select=*`로 타인 UUID 조회 | 공격자 | 빈 결과 또는 RLS 거부 |
| `POST /rest/v1/rpc/get_public_profile` | 비로그인/참여자 | id·표시명·아바타·공개 송금 정보만 반환, birth_date 없음 |

요청 전문·토큰·UUID는 이 저장소나 화면 공유에 남기지 않습니다. HTTP 상태, 오류 코드, 행 수만 기록합니다.

