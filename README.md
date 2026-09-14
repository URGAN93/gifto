# GIFTO — 함께하는 위시리스트

HTML/CSS/JavaScript와 Supabase를 사용하는 선물 위시리스트 서비스입니다. 같은 웹 코드를 Capacitor Android·iOS 앱에서 공유합니다. 송금은 외부 카카오페이로 안내하고 수신자가 입금을 확인하며, PG 결제 승인/자동 입금 검증은 아닙니다.

## 실행 방법

웹은 `index.html`을 Live Server로 실행합니다. 로그인 확인 시 Supabase에 등록한 origin/redirect URL을 사용하세요.

앱은 Node.js 22 이상에서 아래 명령을 사용합니다. PowerShell에서는 `npm.cmd`를 사용하면 실행 정책 문제를 피할 수 있습니다.

```powershell
npm.cmd ci
npm.cmd run verify
npm.cmd run android:open
```

`verify`는 공통 웹 빌드 → Android/iOS 동기화 → 신규 자동 테스트 → 기존 회귀 테스트를 실행합니다. 서버 데이터나 설정을 변경하지 않습니다. APK 컴파일은 포함하지 않습니다.

이 PC에는 Android Studio/JDK/SDK 설치를 마쳤고 디버그 APK 빌드·서명 검증까지 성공했습니다. `npm.cmd run android:sync`, `npm.cmd run android:debug`로 다시 빌드합니다. 결과 경로는 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. 연결 기기는 `npm.cmd run android:devices`로 조회합니다.

도구/캐시는 `C:/Android/GiftoTools`, 빌드 경로는 원본을 가리키는 `C:/Android/GiftoProject`입니다. PC별 경로는 Git에서 제외한 `.android-tools.local.json`에 있으며 다른 PC에서는 별도로 설정해야 합니다. 시스템 전체 JAVA_HOME/PATH는 변경하지 않았습니다. 실행·기기 테스트는 아직 하지 않았습니다.

Mac에서는 `npm ci`, `npm run ios:sync`, `npm run ios:open` 후 Xcode에서 서명/빌드합니다. 두 플랫폼 프로젝트가 이미 있으므로 `android:add`/`ios:add` 재실행은 필요 없습니다.

## 주요 흐름

홈 → 내 페이지 → 공유 위시리스트 → 함께 선물하기 → 참여 완료 → 선물 인증 / 감사 메시지

## 구조

```text
index.html          홈
css/style.css       공통 디자인 토큰 및 반응형 UI
js/app.js           공통 화면과 사용자 인터랙션
pages/              화면 단위 HTML
assets/             이미지·아이콘 등 정적 에셋
mobile/             앱 전용 로그인 복귀·공유·뒤로가기
android/, ios/      네이티브 프로젝트
scripts/, tests/    빌드·검증·자동 테스트
dist/               생성된 앱 웹 번들 (직접 편집하지 않음)
```

## 웹·앱·Supabase 운영

Supabase는 계속 로그인·프로필·위시리스트·참여 내역을 담당합니다. GitHub에 웹을 업데이트하는 것과 설치된 앱 업데이트는 별개입니다. 앱 화면 변경은 다시 빌드·검증·스토어 배포해야 합니다. 실시간 코드 업데이트 기능은 넣지 않았습니다.

웹과 앱의 로그인 및 로컬 임시 데이터는 별개입니다. 같은 계정의 서버 데이터는 공유하지만 비회원 영수증 토큰/작성 중 데이터는 자동 이동하지 않습니다.

[출시 준비 결과와 실기기 체크리스트](work/mobile-release-readiness.md), [Supabase 보안 점검](work/supabase-security-review.md)을 확인하세요. 프로젝트 생성과 단위 테스트 통과는 실기기 검증/스토어 승인 완료를 의미하지 않습니다.
