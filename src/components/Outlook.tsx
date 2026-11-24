import { useState } from 'react'
import { useFetch } from '../lib/api'
import { dateStr } from '../lib/format'
import { fetchOutlook, type Asset, type HorizonResult } from '../lib/outlook'
import { Segmented, Skeleton } from './ui'

const TONE = { up: '#22c77a', flat: '#a3adc2', down: '#ff5c6c' } as const
const memo: { asset: Asset } = { asset: 'bitcoin' }

export function useOutlook(asset: Asset) {
  return useFetch(`outlook:v1:${asset}`, () => fetchOutlook(asset), { refresh: false, maxAgeMs: 3 * 60 * 60_000 })
}

/** 분석 탭: 비트코인·이더리움 단기/중기/장기 상승 가능성 */
export default function Outlook() {
  const [asset, setAssetState] = useState<Asset>(memo.asset)
  const setAsset = (a: Asset) => { memo.asset = a; setAssetState(a) }
  const q = useOutlook(asset)
  const d = q.data
  const [open, setOpen] = useState<string | null>('short')

  return (
    <div className="card outlook">
      <div className="kv"><b style={{ fontSize: 16 }}>📈 앞으로 오를 가능성은?</b>
        <Segmented value={asset} onChange={setAsset} options={[{ v: 'bitcoin', l: '비트코인' }, { v: 'ethereum', l: '이더리움' }]} />
      </div>
      <p className="explain" style={{ marginTop: 8 }}>
        지금과 <b>온체인 상황이 비슷했던 과거의 날들</b>을 찾아서, 그 뒤 실제로 가격이 올랐던 비율을 보여줘요.
      </p>
      <div className="periods">
        <span><b>단기</b> = 2주 뒤</span><span><b>중기</b> = 3개월 뒤</span><span><b>장기</b> = 1년 뒤</span>
      </div>

      {!d && !q.error && <Skeleton h={150} />}
      {!d && q.error && <div className="empty small">{q.error}<br /><button className="btn" onClick={q.reload}>다시 시도</button></div>}
      {d && (
        <>
          <div className="ol-grid">
            {d.horizons.map((h) => (
              <button key={h.id} className={'ol-cell' + (open === h.id ? ' on' : '')} onClick={() => setOpen(open === h.id ? null : h.id)}>
                <span className="ol-h">{h.label}</span>
                <span className="ol-p dim small">{h.period}</span>
                <span className="ol-v" style={{ color: TONE[h.level.tone] }}>{h.prob}%</span>
                <span className="ol-l" style={{ color: TONE[h.level.tone] }}>{h.level.label}</span>
              </button>
            ))}
          </div>
          {d.horizons.filter((h) => h.id === open).map((h) => <Detail key={h.id} h={h} asset={asset} />)}
          <div className="dim small" style={{ marginTop: 10, lineHeight: 1.6 }}>
            {dateStr(d.from)} ~ {dateStr(d.to)} 기록으로 계산 · 하루 한 번 새로 계산해요.<br />
            ※ 과거에 이랬다는 통계일 뿐, 미래를 보장하지 않아요. 투자 판단과 책임은 본인에게 있어요.
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ h, asset }: { h: HorizonResult; asset: Asset }) {
  const name = asset === 'bitcoin' ? '비트코인' : '이더리움'
  const diff = h.prob - h.base
  return (
    <div className="ol-detail">
      <div className="ol-sum">
        <b>{h.label}({h.period}) {name}이 지금보다 높을 가능성 {h.prob}%</b>
        <div className="dim small" style={{ marginTop: 4 }}>
          과거 비슷했던 날 {h.samples.toLocaleString()}일 중 {h.ups.toLocaleString()}일이 {h.period} 올랐어요
          {h.samples >= 30 && h.trust !== '낮음' && <> · 그때 보통 {h.typical >= 0 ? '+' : ''}{h.typical.toFixed(1)}% 변했어요</>}
        </div>
        <div className="dim small">
          참고로 아무 날에나 샀다면 {h.base}% 확률로 올랐어요 → 지금은 평소보다 {Math.abs(diff) < 3 ? '비슷해요' : diff > 0 ? `${diff}%p 높아요` : `${-diff}%p 낮아요`}
        </div>
        <div className="small" style={{ marginTop: 4 }}>
          믿을 만한 정도: <b style={{ color: h.trust === '높음' ? TONE.up : h.trust === '보통' ? TONE.flat : TONE.down }}>{h.trust}</b>
          {h.trust === '낮음' && <span className="dim"> — 비슷한 시기가 몇 번 없어서 참고만 하세요</span>}
        </div>
      </div>
      <div className="dim small" style={{ margin: '10px 0 6px' }}>이렇게 본 이유</div>
      <ul className="ol-reasons">
        {h.reasons.map((r, i) => (
          <li key={i}><span className={'ol-dir ' + (r.dir > 0 ? 'up' : 'down')}>{r.dir > 0 ? '▲ 오를 이유' : '▼ 내릴 이유'}</span><span>{r.text}</span></li>
        ))}
        {h.reasons.length === 0 && <li className="dim">뚜렷하게 한쪽으로 기운 신호가 없어요</li>}
      </ul>
    </div>
  )
}
