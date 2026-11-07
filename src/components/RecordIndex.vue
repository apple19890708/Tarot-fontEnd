<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 「我的紀錄」左欄的索引標籤清單（塔羅、股票分析、財經新聞分析共用，計畫書 2.8.4）：
// 搜尋框＋篩選按鈕＋筆數，依月份分組，一筆一張插在和紙菜單左緣的索引標籤。
// 篩選由父元件做（各紀錄能比對的欄位不同），這裡只負責顯示；items 是篩選後、新到舊排好的
export interface RecordIndexItem {
  id: string
  // 第一行（問題、股票名稱、分析範圍），太長會截斷，滑鼠停住看完整
  title: string
  createdAt: string
  // 第二行的小字（日期以外的資訊）；tone 給漲跌上色
  meta?: { text: string; tone?: 'up' | 'down' }[]
  // 右下的小標記（例如「AI」）
  badge?: string
}

const props = withDefaults(
  defineProps<{
    items: RecordIndexItem[]
    // 篩選前的總筆數
    total: number
    selectedId: string
    placeholder: string
    // 第一個選項當成「全部」（沒有篩選條件）
    filterOptions: readonly { value: string; label: string }[]
    // 清單的無障礙名稱（例如「占卜紀錄」）
    listLabel: string
    // 父元件在 controls slot 放了其他篩選（例如依股票），而且有選：算進「符合 N 筆」，清除條件時會發出 clear
    extraCondition?: boolean
  }>(),
  { extraCondition: false },
)
const emit = defineEmits<{ select: [id: string]; clear: [] }>()
const keyword = defineModel<string>('keyword', { default: '' })
const filter = defineModel<string>('filter', { default: '' })

const firstFilter = computed(() => props.filterOptions[0]?.value ?? '')
const hasCondition = computed(() => keyword.value.trim() !== '' || filter.value !== firstFilter.value || props.extraCondition)

function clearConditions() {
  keyword.value = ''
  filter.value = firstFilter.value
  emit('clear')
}

// 依年月分組；輸入已排序，所以相鄰的同月份就是同一組
const groups = computed(() => {
  const result: { key: string; label: string; items: RecordIndexItem[] }[] = []
  for (const item of props.items) {
    const date = new Date(item.createdAt)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
    const last = result[result.length - 1]
    if (last && last.key === key) last.items.push(item)
    else result.push({ key, label: valid ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : '日期不明', items: [item] })
  }
  return result
})

// 桌機超過 10 筆時，清單高度固定在剛好 10 筆、其餘捲動。
// 每筆的高度不一（一行或兩行、中間夾著月份標題），所以用第 10 筆實際的底部量出高度，
// 再多露一點第 11 筆，讓人看得出下面還有。手機的清單本來就是滿版捲動，不受影響。
const VISIBLE_LIMIT = 10
const PEEK_PX = 20
const navEl = ref<HTMLElement | null>(null)
const listMaxHeight = ref<string | null>(null)

function measureListHeight() {
  const nav = navEl.value
  const rows = nav?.querySelectorAll('li')
  const last = rows?.[VISIBLE_LIMIT - 1]
  if (!nav || !rows || rows.length <= VISIBLE_LIMIT || !last) {
    listMaxHeight.value = null
    return
  }
  const offset = last.getBoundingClientRect().bottom - nav.getBoundingClientRect().top + nav.scrollTop
  listMaxHeight.value = `${Math.ceil(offset + PEEK_PX)}px`
}

let resizeObserver: ResizeObserver | null = null
watch(() => props.items, () => nextTick(measureListHeight))
// nav 在「沒有符合的紀錄」時會被拿掉，重新出現時要重新量、重新觀察寬度（寬度變了，換行數就變了）
watch(navEl, (el) => {
  resizeObserver?.disconnect()
  if (el) {
    resizeObserver?.observe(el)
    measureListHeight()
  }
})
onMounted(() => {
  resizeObserver = new ResizeObserver(() => measureListHeight())
  if (navEl.value) resizeObserver.observe(navEl.value)
  measureListHeight()
})
onBeforeUnmount(() => resizeObserver?.disconnect())

// 文字被截斷時才需要提示：沒有「…」就不要跳東西出來打擾。
// 清單本身是 overflow-y-auto，提示放在列裡會被裁掉，所以掛到 body 再自己算位置。
const tip = ref<{ text: string; left: number; top: number } | null>(null)
const TIP_WIDTH = 288

function showTip(event: FocusEvent | MouseEvent, text: string) {
  const row = event.currentTarget as HTMLElement | null
  const node = row?.querySelector('[data-title]') as HTMLElement | null
  if (!node) return
  // clamp 之後真正的內容比看得到的高，就表示被截斷了（留 1px 容忍捨入誤差）
  const truncated = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1
  if (!truncated) return
  const rect = node.getBoundingClientRect()
  tip.value = {
    text,
    // 靠近右邊界時往左收，不要被切掉
    left: Math.max(8, Math.min(rect.left, window.innerWidth - TIP_WIDTH - 8)),
    top: rect.bottom + 8,
  }
}
function hideTip() {
  tip.value = null
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 索引標籤一律是同一種偏暗的和紙色，只在左緣用一道色條區分：朱紅、藍、苔綠、黃土輪流
// （四種淡彩整張塗滿太花，使用者覺得醜）。選中的那張改成菜單同款的亮和紙
const TAB_MARKS = ['border-l-[#a8322a]', 'border-l-[#3d5a80]', 'border-l-[#5f7a3a]', 'border-l-[#b8862e]']
// 和紙底上的漲跌色（台股慣例：紅漲綠跌），要比深底用的淡色深一點才看得清楚
const TONE_CLASS = { up: 'text-[#a8322a]', down: 'text-[#3d6b2e]' } as const
</script>

<template>
  <!--
    插在和紙菜單左緣的索引標籤：一筆紀錄一張標籤，右側不畫框、看起來夾在菜單裡；
    選中的那張換成菜單同款的和紙、往左多伸出一截，像被抽出來的那一頁。底是和菜單內頁同色系的深黑藍，月份用琥珀色像素字
  -->
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <!-- 搜尋與篩選在右邊留內距：外層為了讓標籤貼齊菜單沒有右內距，不留的話筆數會被裁掉 -->
    <div class="space-y-3 pr-3">
      <input
        v-model="keyword"
        type="search"
        :placeholder="placeholder"
        class="w-full border-2 border-[#3b2618] bg-[#f1e7cf] px-2 py-1.5 text-body text-[#2a1a14] shadow-[3px_3px_0_rgba(0,0,0,0.35)] placeholder:text-[#2a1a14]/45 focus:border-[#a8322a] focus:outline-none"
      />
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          type="button"
          class="cursor-pointer border-2 px-3 py-1 font-pixel text-button transition active:translate-x-[2px] active:translate-y-[2px]"
          :class="
            filter === option.value
              ? 'border-[#3b2618] bg-[#a8322a] text-[#f1e7cf]'
              : 'border-[#f1e7cf]/30 bg-transparent text-[#f1e7cf]/85 hover:border-amber-200/60 hover:text-amber-200'
          "
          @click="filter = option.value"
        >
          {{ option.label }}
        </button>
        <span class="ml-auto text-caption text-[#f1e7cf]/85">
          <template v-if="hasCondition">符合 {{ items.length }} 筆／</template>共 {{ total }} 筆
        </span>
      </div>
      <!-- 其他篩選（例如依股票的下拉選單），樣式由父元件照搜尋框的和紙樣式做 -->
      <slot name="controls" />
    </div>

    <div v-if="items.length === 0" class="border-2 border-[#3b2618] bg-[#f1e7cf] px-4 py-6 text-center text-body text-[#2a1a14]/85">
      <p>沒有符合條件的紀錄</p>
      <button
        type="button"
        class="mt-3 cursor-pointer border-2 border-[#3b2618] bg-[#e9dcc0] px-4 py-1.5 font-pixel text-button text-[#2a1a14] transition hover:bg-[#f1e7cf] active:translate-x-[2px] active:translate-y-[2px]"
        @click="clearConditions"
      >
        清除條件
      </button>
    </div>

    <nav
      v-else
      ref="navEl"
      class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 [scrollbar-color:#3b4a6e_transparent] [scrollbar-width:thin] lg:max-h-(--list-max)"
      :style="listMaxHeight ? { '--list-max': listMaxHeight } : undefined"
      :aria-label="listLabel"
      @scroll="hideTip"
    >
      <section v-for="group in groups" :key="group.key">
        <p class="mb-2 border-b-2 border-dashed border-[#f1e7cf]/15 pb-1 font-pixel text-[12px] tracking-[0.2em] text-amber-200/90">{{ group.label }}</p>
        <ul class="space-y-1.5">
          <li v-for="(item, i) in group.items" :key="item.id">
            <button
              type="button"
              class="w-[calc(100%-0.75rem)] cursor-pointer border-2 border-l-[6px] border-r-0 border-[#3b2618] px-3 py-2 text-left shadow-[-3px_3px_0_rgba(0,0,0,0.45)] transition-[margin,background-color] [transition-timing-function:steps(2)]"
              :class="
                selectedId === item.id
                  ? 'ml-0 w-full border-l-[#a8322a] bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px]'
                  : ['ml-3 bg-[#d8ccb0] hover:ml-1.5 hover:bg-[#e6dac0] active:ml-1.5', TAB_MARKS[i % TAB_MARKS.length]]
              "
              :aria-current="selectedId === item.id ? 'true' : undefined"
              @click="hideTip(); emit('select', item.id)"
              @mouseenter="showTip($event, item.title)"
              @mouseleave="hideTip"
              @focus="showTip($event, item.title)"
              @blur="hideTip"
            >
              <!--
                line-clamp 要靠 display:-webkit-box，不能再加 block，否則整段完全不截斷。
                桌機左欄窄，截成一行；手機清單是滿版，留兩行比較讀得到重點。
              -->
              <span data-title class="line-clamp-2 text-body text-[#2a1a14] lg:line-clamp-1">{{ item.title }}</span>
              <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-[#2a1a14]/85">
                <span class="tabular-nums">{{ formatShortDate(item.createdAt) }}</span>
                <span v-for="(meta, m) in item.meta ?? []" :key="m" class="tabular-nums" :class="meta.tone ? TONE_CLASS[meta.tone] : ''">{{ meta.text }}</span>
                <span v-if="item.badge" class="border border-[#a8322a] px-1.5 py-0.5 text-caption leading-none text-[#a8322a]">{{ item.badge }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </nav>

    <!-- 只有文字被截斷時才會有值；跟著列的左緣、落在列下方 -->
    <Teleport to="body">
      <div
        v-if="tip"
        class="pointer-events-none fixed z-50 w-72 rounded-md border border-white/10 bg-neutral-800 px-3 py-2 text-body text-stone-100 shadow-lg shadow-black/50"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
        role="tooltip"
      >
        {{ tip.text }}
      </div>
    </Teleport>
  </div>
</template>
