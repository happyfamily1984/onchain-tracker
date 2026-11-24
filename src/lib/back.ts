import { useEffect, useRef } from 'react'

/**
 * 뒤로가기 처리 스택.
 * 나중에 등록된(가장 위에 떠 있는) 핸들러가 먼저 호출된다.
 * 열린 창·선택 모드·수정 중 상태가 각자 핸들러를 등록하고, 없으면 화면 이동/종료 확인으로 넘어간다.
 */
type Handler = { fn: () => void; order: number }
const stack: Handler[] = []
let counter = 0

export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return
    const h: Handler = { fn: () => ref.current(), order: ++counter }
    stack.push(h)
    return () => {
      const i = stack.indexOf(h)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

/** 최상위 핸들러를 실행했으면 true */
export function runTopBackHandler(): boolean {
  if (!stack.length) return false
  const top = stack.reduce((a, b) => (a.order > b.order ? a : b))
  top.fn()
  return true
}
