# GIFTO — 함께하는 위시리스트

원하는 것과 마음을 자연스럽게 공유하고, 친구들이 함께 선물할 수 있는 모바일 우선 UX 프로토타입입니다. 실제 결제·로그인·업로드·서버 기능은 포함하지 않습니다.

## 실행 방법

1. VS Code에서 `D:\OneDrive\gift-service` 폴더를 엽니다.
2. `index.html`을 Live Server로 실행합니다. (또는 브라우저에서 직접 열어도 됩니다.)
3. 홈에서 버튼을 눌러 전체 데모 흐름을 확인합니다.

## 주요 흐름

홈 → 내 페이지 → 공유 위시리스트 → 함께 선물하기 → 참여 완료 → 선물 인증 / 감사 메시지

## 구조

```text
index.html          홈
css/style.css       공통 디자인 토큰 및 반응형 UI
js/app.js           더미 데이터, 카드 렌더링, 클릭 인터랙션
pages/              화면 단위 HTML
assets/             향후 이미지·아이콘 등 정적 에셋
```

## 향후 Supabase 연동

현재 `js/app.js`의 `appData`에 더미 상품 데이터를 모아 두었습니다. 이후에는 이 영역을 `services/wishlist-service.js` 같은 데이터 계층으로 분리하고, Supabase의 `profiles`, `wishlists`, `wishlist_items`, `contributions`, `thank_you_messages` 테이블을 연결하면 화면 구조를 유지한 채 실제 서비스로 확장할 수 있습니다.
