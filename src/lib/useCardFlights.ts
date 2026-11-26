// 抽牌步驟的飛牌動畫（2026-11-26 前端優化 9，從 StepDraw 抽出來）：
// 資料照常立刻更新（選取／收回／輸入），動畫只是在最上層放一張替身（FlyingCard）飛過去；
// 飛行期間把終點那張藏起來，抵達後再出現。
// 自動抽牌、手動抽牌、輸入已抽到的牌三個子元件共用同一組替身：StepDraw 用 provideCardFlights() 建立並畫出替身，
// 子元件用 useCardFlights() 拿到 launch 與「哪些牌正在飛」
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey } from 'vue'

import type { CardPose } from './motion'
import type { SlotCard } from '../types'

export interface Flight {
  key: number
  card: SlotCard
  from: CardPose
  to: CardPose
  reveal: boolean
}

interface CardFlights {
  // 正在飛往位置格的牌（位置格先不顯示）與正在飛回扇形的牌（扇形先不顯示）
  landingIds: ComputedRef<Set<string>>
  returningIds: ComputedRef<Set<string>>
  // 起點或終點量不到時略過動畫
  launch: (card: SlotCard, from: CardPose | null, to: CardPose | null, reveal: boolean) => void
}

const KEY: InjectionKey<CardFlights> = Symbol('cardFlights')

export function provideCardFlights() {
  const flights = ref<Flight[]>([])
  let flightKey = 0

  const api: CardFlights = {
    landingIds: computed(() => new Set(flights.value.filter((f) => f.reveal).map((f) => f.card.id))),
    returningIds: computed(() => new Set(flights.value.filter((f) => !f.reveal).map((f) => f.card.id))),
    launch(card, from, to, reveal) {
      if (!from || !to) {
        return
      }
      flights.value.push({ key: (flightKey += 1), card, from, to, reveal })
    },
  }
  provide(KEY, api)

  function landFlight(key: number) {
    flights.value = flights.value.filter((flight) => flight.key !== key)
  }

  return { flights, landFlight }
}

export function useCardFlights() {
  const api = inject(KEY)
  if (!api) throw new Error('useCardFlights 要在 StepDraw 底下使用')
  return api
}

// 位置格（SpreadSlots）上第 index 格的位置與大小
export function slotPose(
  slots: { poseOf: (index: number) => CardPose | null } | null,
  index: number,
  card: SlotCard,
  fromRotation: number,
): CardPose | null {
  const pose = slots?.poseOf(index) ?? null
  if (!pose) {
    return null
  }
  // 逆位在位置格裡是倒過來的；從哪一側飛來就往那一側轉半圈，不要繞遠路
  return { ...pose, rotation: card.orientation === 'reversed' ? (fromRotation < 0 ? -180 : 180) : 0 }
}

export function elementPose(el: Element | null | undefined): CardPose | null {
  if (!el) {
    return null
  }
  const rect = el.getBoundingClientRect()
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }
}
