# 코인 고래 레이더 (구 온체인 트래커) — 작업 규칙
- 플레이스토어에 출시하는 앱이다. 패키지명 `com.happyfamily.onchaintracker` 은 절대 바꾸지 않는다.
- 빌드: `npm run build && npx cap sync android && cd android && ./gradlew bundleRelease assembleRelease`
  - 출시용: `android/app/build/outputs/bundle/release/app-release.aab` / 폰 테스트용: `.../apk/release/app-release.apk`
  - 업데이트할 때마다 `android/app/build.gradle` 의 versionCode 를 1씩 올리고, versionName 과 설정 화면 APP_VERSION 을 맞춘다.
  - 서명: `android/keystore.properties` + `android/upload-keystore.jks` (git 제외). 없으면 사용자에게 받는다. 새로 만들면 업데이트가 안 되니 절대 새로 만들지 않는다.
- 스토어 자료: `store/` (아이콘·그래픽·스크린샷·등록 문구)
- 앱 문구는 누구나 이해할 수 있는 쉬운 말로 쓴다. 어려운 용어는 `<Term>` 으로 설명을 붙인다.
