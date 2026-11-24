# 온체인 트래커

비트코인·이더리움 등 주요 코인의 온체인 데이터를 추적하는 안드로이드 앱 (React + Vite + Capacitor).

## 기능
- **홈**: 12개 체인(BTC, ETH, SOL, XRP, DOGE, ADA, BCH, LTC, XLM, XMR, ZEC, DASH) 시세·24h 거래 수·수수료, BTC 수수료/ETH 가스 요약, 도미넌스
- **코인 상세**
  - BTC: 수수료 4단계(sat/vB + 원화 환산), 멤풀, 난이도 조정, 반감기 카운트다운, 추이 차트(해시레이트·거래 수·활성 주소·멤풀·수수료·채굴 수익·난이도), 최근 블록(채굴 풀)
  - ETH: 가스비, 네트워크 사용률, 소각량, ERC-20/NFT 전송, 추이 차트, 최근 블록(빌더)
  - SOL: 실시간 TPS 차트, 사용자 TPS, 에포크 진행률
  - 공통: 24h 온체인 지표, 24h 최대 거래
- **고래 추적**
  - BTC: 최근 블록 전체 거래 스캔 → 대형 거래(100/500/1,000 BTC+) 탐지, 거스름돈 제외 실이동량, 거래소 입금·출금·거래소 간 이동·UTXO 통합·지갑 간 이동 분류, 거래소 순유입 해석
  - ETH: 새 블록 증분 스캔으로 대형 ETH 전송 탐지 + USDT·USDC 거래소 유입/유출(최근 약 3시간, 거래소별)
  - 거래소 판별: 알려진 거래소 지갑 + 누적 거래 수가 매우 많은 주소(‘거래소 추정’)
  - 고래 주소를 눌러 바로 주소 상세 → 관심 주소 등록
- **고래 → 거래소 입금 알림**: 고래 지갑(비거래소)이 거래소 지갑으로 옮기면 고래 탭 알림함에 기록 + 휴대폰 알림(앱 실행 중). 관심 주소가 거래소로 보내도 알림. 설정에서 BTC/ETH·기준량 선택
- **LTH/STH 분석**: 고래 거래가 소비한 코인(UTXO)의 나이를 계산해 장기보유자(155일+)·단기보유자 물량 비중, 거래소로 들어간 물량의 LTH/STH 구성, 보유 기간별 분포, 네트워크 CDD·소비 코인 평균 나이
- **온체인 분석 탭**: 시장 온도계(가치 지표 종합 0~100) + 13개 지표를 쉬운 설명·색 구간 게이지·현재 해석·과거 사례·차트로 제공
  - 가치: 메이어 멀티플, 200주 이동평균 배수, NVT 시그널 / 자금: 스테이블코인 증가율, SSR / 채굴자: 퍼엘 멀티플, 해시 리본, 연간 발행률 / 네트워크: 활성 주소·전송액 추세, 수수료 비중 / ETH: 순발행률(소각 vs 발행), 블록 사용률
  - 홈에 ‘오늘의 온체인 요약’ 카드
- **관심 주소**: BTC/ETH 주소 잔고·거래 내역·보유 토큰 추적, 이름 붙이기, 길게 눌러 다중 선택 삭제
- **설정**: 원화/달러 표시, 자동 새로고침 간격, 데이터 출처, 개인정보 처리방침

## 뒤로가기 동작
열린 창·선택 모드·이름 수정 중 → 취소 / 상세 화면 → 이전 화면 / 다른 탭 → 홈 / 홈 → “앱을 종료하겠습니까?” 확인 후 종료

## 개발
```bash
npm install
npm run dev            # 웹 미리보기 (Esc = 뒤로가기)
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease   # APK 생성 (android/keystore.properties 필요)
```

`android/keystore.properties` (git 제외):
```
storeFile=upload-keystore.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

## 데이터 출처 (무료·키 불필요)
Blockchair, mempool.space, blockchain.com, Blockscout, PublicNode(Solana/Ethereum RPC), CoinGecko·Coinbase·Kraken, ExchangeRate-API

개인정보 처리방침: `docs/privacy.html`
