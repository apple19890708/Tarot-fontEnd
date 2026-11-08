<script setup lang="ts">
import { Chart as ChartJS } from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bar } from 'vue-chartjs'

import HelpTip from '../HelpTip.vue'
import type { GlossaryKey } from '../../lib/marketGlossary'
import { axis, CHART_COLORS, formatNumber, legendOptions, shortDate } from '../../lib/marketChart'
import type { MarketAnalysis, MarketChart, MarketChartSeries, MarketLevel } from '../../types'

// 價格走勢：K 棒（舊資料沒有開高低時改畫收盤折線）與 5／20／60 均線，加上最近的支撐與壓力虛線，下方是成交量。
// K 棒用 chart.js 內建的浮動長條畫：粗的是開盤到收盤、細的是最高到最低；收盤高於開盤紅、低於開盤綠，成交量跟著同色。
// 可切換日 K（約一年）、週 K（約三年）、月 K（五年）；舊版後端或舊紀錄沒有週、月時不顯示切換
const props = defineProps<{
  chart: MarketChart
  analysis?: MarketAnalysis | null
  // 只看日線、不顯示日／週／月切換
  dailyOnly?: boolean
  // 精簡（股市總覽約 350×350 的股票卡片）：只看日線、不放工具列與圖例、不能縮放（總覽頁上下捲動時滑過卡片才不會變成縮放 K 線），圖矮一點
  compact?: boolean
}>()

// 縮放外掛只有這張圖用到，跟著這個元件載入（options 沒設 zoom 的圖不受影響）
ChartJS.register(zoomPlugin)

type Period = 'day' | 'week' | 'month'
const PERIOD_UNITS: Record<Period, string> = { day: '日', week: '週', month: '月' }

const period = ref<Period>('day')
const periods = computed(() => {
  const list: { key: Period; label: string }[] = [{ key: 'day', label: '日' }]
  if (props.chart.weekly?.dates.length) list.push({ key: 'week', label: '週' })
  if (props.chart.monthly?.dates.length) list.push({ key: 'month', label: '月' })
  return list
})

const view = computed<MarketChartSeries>(() => {
  if (period.value === 'week' && props.chart.weekly) return props.chart.weekly
  if (period.value === 'month' && props.chart.monthly) return props.chart.monthly
  return props.chart
})

// ---- 縮放：桌機滾輪縮放、拖曳平移，手機兩指縮放；只動橫軸（時間），縱軸跟著顯示範圍調整 ----
// 一次畫一整年太擠，預設只顯示最後一段，往右拖看更早的；「重設縮放」回到這個範圍。
// 日 K 約一個月（22 個交易日）；週 K、月 K 各 14 根
const DEFAULT_BARS: Record<Period, number> = { day: 22, week: 14, month: 14 }
const chartRef = ref<{ chart?: ChartJS } | null>(null)
const zoomed = ref(false)

const lastIndex = computed(() => Math.max(0, view.value.dates.length - 1))
const defaultMin = computed(() => Math.max(0, view.value.dates.length - DEFAULT_BARS[period.value]))

function resetZoom() {
  chartRef.value?.chart?.resetZoom()
  zoomed.value = false
}

function showAll() {
  const chart = chartRef.value?.chart
  if (!chart) return
  chart.zoomScale('x', { min: 0, max: lastIndex.value }, 'default')
  zoomed.value = true
}

const markZoomed = ({ chart }: { chart: ChartJS }) => {
  zoomed.value = chart.isZoomedOrPanned()
}

// 切換日／週／月：圖表用 :key 重建（縮放外掛會記住第一次的範圍，不重建會套回上一個時間單位的範圍）
watch(period, () => {
  zoomed.value = false
})

// 橫軸：日 K 用月／日，週、月 K 跨好幾年，用年／月
function axisLabel(date: string) {
  return period.value === 'day' ? shortDate(date) : date.slice(2, 7).replace('-', '/')
}

// 提示框標題：完整日期，週 K、月 K 標明是哪一週（月）
function tooltipTitle(date: string) {
  if (period.value === 'week') return `${date} 那一週`
  if (period.value === 'month') return `${date.slice(0, 7)} 月`
  return date
}

const nearestSupport = computed(() => props.analysis?.supports[0] ?? null)
const nearestResistance = computed(() => props.analysis?.resistances[0] ?? null)

// ---- 支撐與壓力：所有價位都畫成虛線，右側價格軸上放實心的價格標（紅＝壓力、綠＝支撐）；最近的一條線比較粗 ----
// 價位來源（MA20、近 20 日低點）不寫在圖上，手機放不下，下方的支撐壓力面板有列
type LevelMark = { price: number; text: string; color: string; nearest: boolean }

// 支撐壓力線可以關掉（線多時會干擾看 K 棒）；開關記在這台瀏覽器
const LEVELS_KEY = 'market-chart-levels'
const helpTerms = computed<GlossaryKey[]>(() => [
  ...(hasCandles.value ? (['candles'] as const) : []),
  ...(showLevels.value && hasLevels.value ? (['chartLevels'] as const) : []),
  'chartControls',
])
function readShowLevels() {
  try {
    return localStorage.getItem(LEVELS_KEY) !== 'off'
  } catch {
    return true
  }
}
const showLevels = ref(readShowLevels())
const hasLevels = computed(() => Boolean(props.analysis?.resistances.length || props.analysis?.supports.length))
function toggleLevels() {
  showLevels.value = !showLevels.value
  try {
    localStorage.setItem(LEVELS_KEY, showLevels.value ? 'on' : 'off')
  } catch {
    // 無痕模式等存不了就算了，只影響下次的預設
  }
}

const levelMarks = computed<LevelMark[]>(() => {
  if (!showLevels.value) return []
  const mark = (levels: MarketLevel[] | undefined, color: string) =>
    (levels ?? []).map((level, i) => ({ price: level.price, text: formatNumber(level.price), color, nearest: i === 0 }))
  return [...mark(props.analysis?.resistances, CHART_COLORS.up), ...mark(props.analysis?.supports, CHART_COLORS.down)]
})

// 畫在 K 棒與均線上面（提示框之下）；縮放後跑到畫面外的價位不畫。價格標太靠近時往上下錯開，不重疊
const LABEL_HEIGHT = 15
function visibleLevels(chart: ChartJS) {
  const y = chart.scales.y
  const area = chart.chartArea
  if (!y || !area) return []
  return levelMarks.value
    .map((mark) => ({ ...mark, py: y.getPixelForValue(mark.price) }))
    .filter((mark) => mark.py >= area.top && mark.py <= area.bottom)
    .sort((a, b) => a.py - b.py)
}

const levelPlugin = {
  id: 'priceLevels',
  // 虛線畫在 K 棒下面：當天區間很窄的 K 棒才不會被線蓋掉
  beforeDatasetsDraw(chart: ChartJS) {
    const area = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    ctx.setLineDash([6, 4])
    for (const mark of visibleLevels(chart)) {
      ctx.strokeStyle = mark.color
      ctx.globalAlpha = mark.nearest ? 0.9 : 0.55
      ctx.lineWidth = mark.nearest ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(area.left, mark.py)
      ctx.lineTo(area.right, mark.py)
      ctx.stroke()
    }
    ctx.restore()
  },
  // 價格標：蓋在右側價格軸上（不擋 K 棒），實心底（黑夜配深字、白天配白字），和上一個標至少隔一個標高
  afterDatasetsDraw(chart: ChartJS) {
    const area = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    ctx.font = '10px "Noto Serif TC", "Microsoft JhengHei", serif'
    ctx.textBaseline = 'middle'
    let lastLabelY = -Infinity
    for (const mark of visibleLevels(chart)) {
      const labelY = Math.min(Math.max(mark.py, lastLabelY + LABEL_HEIGHT, area.top + LABEL_HEIGHT / 2), area.bottom - LABEL_HEIGHT / 2)
      lastLabelY = labelY
      const width = ctx.measureText(mark.text).width + 8
      const x = Math.min(area.right + 2, chart.width - width)
      ctx.globalAlpha = mark.nearest ? 1 : 0.75
      ctx.fillStyle = mark.color
      ctx.fillRect(x, labelY - LABEL_HEIGHT / 2, width, LABEL_HEIGHT)
      ctx.globalAlpha = 1
      ctx.fillStyle = CHART_COLORS.onMark
      ctx.fillText(mark.text, x + 4, labelY)
    }
    ctx.restore()
  },
}

// 手機點了 K 棒後提示框會一直留著（chart.js 只在手指移到圖上別處時才更新），點圖表以外的地方就收起來
function hideTooltipOutside(event: PointerEvent) {
  const chart = chartRef.value?.chart
  if (!chart || chart.canvas.contains(event.target as Node)) return
  if (!chart.tooltip?.getActiveElements().length) return
  chart.tooltip.setActiveElements([], { x: 0, y: 0 })
  chart.setActiveElements([])
  chart.update('none')
}
onMounted(() => document.addEventListener('pointerdown', hideTooltipOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', hideTooltipOutside))

function line(label: string, data: (number | null)[], color: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'line' as const,
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.2,
    spanGaps: true,
    yAxisID: 'y',
    ...extra,
  }
}

// 隱形的輔助線：不進圖例、不進提示框
const LEVEL_GUIDE = '_level'
// 圖例只留可以開關、需要對照顏色的線；K 棒、成交量一看就懂，手機上省一行
const LEGEND_HIDDEN = ['K棒', 'K棒影線', '成交量', LEVEL_GUIDE]


// 每一根是漲（收盤 > 開盤）、跌、還是平；沒有開盤時和前一根收盤比
function directions(chart: MarketChartSeries) {
  return chart.close.map((close, i) => {
    const base = chart.open?.[i] ?? chart.close[i - 1] ?? null
    if (close === null || base === null) return 0
    return close > base ? 1 : close < base ? -1 : 0
  })
}

const hasCandles = computed(() => {
  const { open, high, low, close } = view.value
  return Boolean(open && high && low && open.length === close.length && high.length === close.length && low.length === close.length)
})

const data = computed(() => {
  const chart = view.value
  const unit = PERIOD_UNITS[period.value]
  const flat = (value: number) => chart.dates.map(() => value)
  const dirs = directions(chart)
  const solid = dirs.map((dir) => (dir > 0 ? CHART_COLORS.up : dir < 0 ? CHART_COLORS.down : CHART_COLORS.price))
  const datasets: Record<string, unknown>[] = []
  if (hasCandles.value) {
    const { open, high, low } = chart as Required<MarketChartSeries>
    const range = (a: (number | null)[], b: (number | null)[]) =>
      a.map((value, i) => (value === null || b[i] === null ? null : [value, b[i]]))
    datasets.push(
      {
        type: 'bar' as const,
        label: 'K棒',
        data: range(open!, chart.close),
        backgroundColor: solid,
        borderColor: solid,
        // 開盤＝收盤（十字線）時至少畫 1px，不然整根看不到
        minBarLength: 1,
        barPercentage: 0.75,
        categoryPercentage: 0.9,
        grouped: false,
        yAxisID: 'y',
        order: 1,
      },
      {
        type: 'bar' as const,
        label: 'K棒影線',
        data: range(low!, high!),
        backgroundColor: solid,
        barThickness: 1,
        grouped: false,
        yAxisID: 'y',
        order: 1,
      },
    )
  } else {
    datasets.push(line('收盤', chart.close, CHART_COLORS.price, { borderWidth: 2, order: 1 }))
  }
  datasets.push(
    line(`5${unit}均線`, chart.ma5, CHART_COLORS.ma5, { order: 2 }),
    line(`20${unit}均線`, chart.ma20, CHART_COLORS.ma20, { order: 3 }),
    line(`60${unit}均線`, chart.ma60, CHART_COLORS.ma60, { order: 4 }),
  )
  // 最近的支撐與壓力放隱形的水平線，讓縱軸一定涵蓋到它們（線和標籤由 levelPlugin 畫）
  for (const level of showLevels.value ? [nearestResistance.value, nearestSupport.value] : []) {
    if (level) datasets.push(line(LEVEL_GUIDE, flat(level.price), 'transparent', { borderWidth: 0, order: 5 }))
  }
  datasets.push({
    type: 'bar' as const,
    label: '成交量',
    data: chart.volume,
    // 成交量跟著當天漲跌上色
    backgroundColor: dirs.map((dir) => (dir > 0 ? CHART_COLORS.upFaded : dir < 0 ? CHART_COLORS.downFaded : CHART_COLORS.volume)),
    grouped: false,
    yAxisID: 'volume',
    order: 10,
  })
  return { labels: chart.dates.map(axisLabel), datasets }
})

const options = computed(() => {
  const legend = legendOptions()
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        ...legend,
        display: !props.compact,
        // 影線和 K 棒算同一個東西，圖例只列一次
        labels: { ...legend.labels, filter: (item: { text: string }) => !LEGEND_HIDDEN.includes(item.text) },
      },
      zoom: {
        // 可以拖到第一根到最後一根；最少看 7 根，避免縮到只剩一兩點
        limits: { x: { min: 0, max: lastIndex.value, minRange: 7 } },
        pan: { enabled: !props.compact, mode: 'x' as const, onPanComplete: markZoomed },
        zoom: {
          wheel: { enabled: !props.compact, speed: 0.15 },
          pinch: { enabled: !props.compact },
          mode: 'x' as const,
          onZoomComplete: markZoomed,
        },
      },
      tooltip: {
        // 影線不另外列，開高低收都寫在 K 棒那一行
        filter: (item: { dataset: { label?: string } }) => item.dataset.label !== 'K棒影線' && item.dataset.label !== LEVEL_GUIDE,
        callbacks: {
          title: (items: { dataIndex: number }[]) => (items[0] ? tooltipTitle(view.value.dates[items[0].dataIndex] ?? '') : ''),
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null }; dataIndex: number }) => {
            const chart = view.value
            const i = ctx.dataIndex
            if (ctx.dataset.label === 'K棒') {
              return `開 ${formatNumber(chart.open?.[i])} 高 ${formatNumber(chart.high?.[i])} 低 ${formatNumber(chart.low?.[i])} 收 ${formatNumber(chart.close[i])}`
            }
            if (ctx.dataset.label === '成交量') return `成交量 ${formatNumber(ctx.parsed.y, 0)}`
            return `${ctx.dataset.label?.split(' ')[0]} ${formatNumber(ctx.parsed.y)}`
          },
        },
      },
    },
    scales: {
      x: axis({
        min: defaultMin.value,
        max: lastIndex.value,
        ticks: { color: CHART_COLORS.text, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } },
      }),
      // 價格與成交量上下分區（stack 同名的軸會疊在同一側、依 stackWeight 分高度），K 棒不會壓到成交量。
      // 價格不從 0 開始，K 棒才看得出起伏（根圖是 bar，預設會從 0 開始）；上下各留 5% 空間
      y: axis({ position: 'right' as const, beginAtZero: false, grace: '5%', stack: 'price', stackWeight: 4 }),
      // 成交量那一區只要高度、不顯示刻度；display 不能設 false，否則不佔版面、分區會失效
      volume: {
        position: 'right' as const,
        stack: 'price',
        stackWeight: 1,
        offset: true,
        beginAtZero: true,
        ticks: { display: false },
        grid: { display: false },
        border: { color: CHART_COLORS.grid },
      },
    },
  }
})
</script>

<template>
  <div class="space-y-2">
    <div v-if="!compact" class="flex flex-wrap items-center gap-2">
      <div v-if="!dailyOnly && !compact && periods.length > 1" class="flex gap-1.5" role="group" aria-label="走勢圖的時間單位">
        <button
          v-for="option in periods"
          :key="option.key"
          type="button"
          class="cursor-pointer border-2 px-3 py-1 text-button transition font-pixel"
          :class="period === option.key ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
          :aria-pressed="period === option.key"
          @click="period = option.key"
        >
          {{ option.label }}
        </button>
      </div>
      <!-- 圖怎麼看、怎麼操作：收在「?」裡，不常駐佔版面 -->
      <HelpTip :terms="helpTerms" />
      <span class="ml-auto" />
      <button
        v-if="hasLevels"
        type="button"
        class="cursor-pointer border-2 px-3 py-1 text-button transition active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        :class="showLevels ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
        :aria-pressed="showLevels"
        @click="toggleLevels"
      >
        支撐壓力線{{ showLevels ? '：開' : '：關' }}
      </button>
      <button
        v-if="view.dates.length > DEFAULT_BARS[period]"
        type="button"
        class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        @click="showAll"
      >
        看全部
      </button>
      <button
        v-if="zoomed"
        type="button"
        class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        @click="resetZoom"
      >
        重設縮放
      </button>
    </div>
    <!-- touch-pan-y：hammerjs 預設攔下畫布上所有手勢（手指在圖上就捲不動頁面），保留上下捲動給瀏覽器，左右平移與兩指縮放才交給縮放外掛 -->
    <div class="relative w-full min-w-0 [&_canvas]:touch-pan-y!" :class="compact ? 'h-40' : 'h-72 sm:h-80'">
      <!-- 價格線與成交量混合：用 Bar 元件，價格的 dataset 指定 type: 'line' -->
      <Bar :key="period" ref="chartRef" :data="data as never" :options="options as never" :plugins="[levelPlugin] as never" />
    </div>
  </div>
</template>
