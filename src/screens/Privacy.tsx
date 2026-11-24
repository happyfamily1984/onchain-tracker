import { Header } from '../components/ui'

export const PRIVACY_EMAIL = 'happyfamily1984.3@gmail.com'

export default function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <Header title="개인정보 처리방침" onBack={onBack} />
      <div className="content prose">
        <p className="dim small">시행일: 2026년 11월 24일</p>
        <p>‘코인 고래 레이더’(이하 “앱”)는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수합니다.</p>
        <h3>1. 수집하는 개인정보</h3>
        <p>앱은 회원가입이 없으며 이름, 연락처, 이메일, 위치, 기기 식별자 등 어떠한 개인정보도 수집·저장·전송하지 않습니다.</p>
        <h3>2. 기기에 저장되는 정보</h3>
        <p>이용자가 입력한 관심 주소(공개 블록체인 주소), 이름표, 표시 통화 등 설정과 통계 캐시는 이용자의 기기 내부에만 저장되며 개발자에게 전송되지 않습니다. 앱을 삭제하거나 설정에서 캐시를 삭제하면 지워집니다.</p>
        <h3>3. 외부 서비스 이용</h3>
        <p>온체인 데이터를 표시하기 위해 앱은 다음 공개 API에 직접 요청합니다: Blockchair, mempool.space, blockchain.com, Blockscout, Solana 공개 RPC, CoinGecko/Binance(시세), ExchangeRate-API(환율). 주소 조회 시 해당 주소가 조회 대상 서비스에 전달되며, 각 서비스는 통상적인 서버 로그(IP 주소 등)를 자체 정책에 따라 처리할 수 있습니다.</p>
        <h3>4. 알림</h3>
        <p>큰 거래를 감지하면 휴대폰 안에서 직접 알림을 띄웁니다. 푸시 서버를 쓰지 않으며, 알림을 위해 어떤 정보도 외부로 보내지 않습니다.</p>
        <h3>5. 제3자 제공 및 광고</h3>
        <p>앱은 개인정보를 제3자에게 제공하지 않으며, 광고 및 분석 도구를 사용하지 않습니다.</p>
        <h3>6. 아동의 개인정보</h3>
        <p>앱은 아동을 포함한 누구의 개인정보도 수집하지 않습니다.</p>
        <h3>7. 문의</h3>
        <p>개인정보 관련 문의: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a></p>
        <h3>8. 변경</h3>
        <p>본 방침이 변경될 경우 앱 업데이트를 통해 공지합니다.</p>
      </div>
    </div>
  )
}
