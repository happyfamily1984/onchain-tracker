# 온체인 트래커 — 작업 규칙
- 이 앱은 플레이 스토어에 출시하지 않는다. 빌드 결과물은 **APK만** 만든다 (AAB·스토어 등록 자료·출시 안내 불필요).
- 빌드: `npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`
  - 서명: `android/keystore.properties` + `android/upload-keystore.jks` (git 제외). 없으면 사용자에게 받거나 `assembleDebug`로 만든다.
- 결과물: `android/app/build/outputs/apk/release/app-release.apk` → 사용자에게 전달
