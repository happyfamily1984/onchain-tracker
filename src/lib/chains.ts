export type ChainId =
  | 'bitcoin' | 'ethereum' | 'solana' | 'ripple' | 'dogecoin' | 'cardano'
  | 'bitcoin-cash' | 'litecoin' | 'stellar' | 'monero' | 'zcash' | 'dash'

export interface ChainInfo {
  id: ChainId
  name: string
  symbol: string
  color: string
  /** 최소 단위 → 1코인 자릿수 */
  decimals: number
  /** 블록 대신 원장(ledger)을 쓰는 체인 */
  ledger?: boolean
  /** 작업증명(PoW) 체인 */
  pow?: boolean
  /** 주소 조회 지원 */
  address?: boolean
}

export const CHAINS: ChainInfo[] = [
  { id: 'bitcoin', name: '비트코인', symbol: 'BTC', color: '#f7931a', decimals: 8, pow: true, address: true },
  { id: 'ethereum', name: '이더리움', symbol: 'ETH', color: '#8c8cff', decimals: 18, address: true },
  { id: 'solana', name: '솔라나', symbol: 'SOL', color: '#14f195', decimals: 9 },
  { id: 'ripple', name: '리플', symbol: 'XRP', color: '#5ab0ff', decimals: 6, ledger: true },
  { id: 'dogecoin', name: '도지코인', symbol: 'DOGE', color: '#c2a633', decimals: 8, pow: true },
  { id: 'cardano', name: '카르다노', symbol: 'ADA', color: '#3cc8c8', decimals: 6 },
  { id: 'bitcoin-cash', name: '비트코인 캐시', symbol: 'BCH', color: '#0ac18e', decimals: 8, pow: true },
  { id: 'litecoin', name: '라이트코인', symbol: 'LTC', color: '#a6a9aa', decimals: 8, pow: true },
  { id: 'stellar', name: '스텔라루멘', symbol: 'XLM', color: '#d0d4e0', decimals: 7, ledger: true },
  { id: 'monero', name: '모네로', symbol: 'XMR', color: '#ff6600', decimals: 12, pow: true },
  { id: 'zcash', name: '지캐시', symbol: 'ZEC', color: '#f4b728', decimals: 8, pow: true },
  { id: 'dash', name: '대시', symbol: 'DASH', color: '#1c75bc', decimals: 8, pow: true },
]

export const chainById = (id: string) => CHAINS.find((c) => c.id === id)!

/** 비트코인 반감기 */
export const BTC_HALVING_INTERVAL = 210_000
