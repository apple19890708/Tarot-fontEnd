<script setup lang="ts">
// 每日一牌＋月曆（v26 計畫 1，計畫書在後端 doc/v26-daily-card-journal-plan.md）。
// 上面是今天的牌；下面是月曆，每一格顯示當天的每日一牌縮圖與占卜紀錄數，點一天看當天內容。
// 月曆用 FullCalendar 7（D3），顏色由 style.css 的 .tarot-calendar 對到專案語意色，日夜模式跟著換。
// 桌機（1024 以上）當天內容放在月曆右邊；手機點了從底部開彈窗
import '@fullcalendar/vue3/skeleton.css'
import '@fullcalendar/vue3/themes/classic/theme.css'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import zhTwLocale from '@fullcalendar/vue3/locales/zh-tw'
import classicThemePlugin from '@fullcalendar/vue3/themes/classic'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CalendarDayDetail from '../components/CalendarDayDetail.vue'
import CalendarDayDialog from '../components/CalendarDayDialog.vue'
import DailyCardPanel from '../components/DailyCardPanel.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { drawDailyCard, fetchCalendarMonth, fetchTodayDailyCard } from '../lib/api'
import { cardShortName, dayKeyOf, visibleMonthOf } from '../lib/calendarDays'
import { todayStatus, waitForGuestClaim } from '../lib/dailyCard'
import type { CalendarDay, CalendarMonth, DailyCard } from '../types'

// ---- 今天的牌 ----
const dailyCard = ref<DailyCard | null>(null)
const streak = ref(0)
const today = ref(dayKeyOf(new Date()))
const dailyLoading = ref(true)
const drawing = ref(false)
const dailyError = ref('')
const saved = ref(true)

async function loadToday() {
  try {
    // 剛登入或註冊時，先等訪客抽的牌存進月曆，才不會先顯示「還沒抽」
    await waitForGuestClaim()
    const result = await fetchTodayDailyCard()
    dailyCard.value = result.dailyCard
    streak.value = result.streak
    today.value = result.today
    todayStatus.value = result.dailyCard ? 'drawn' : 'pending'
  } catch (error) {
    dailyError.value = error instanceof Error ? error.message : '今天的牌讀取失敗，請重新整理。'
  } finally {
    dailyLoading.value = false
  }
}

async function draw() {
  if (drawing.value) return
  drawing.value = true
  dailyError.value = ''
  try {
    const result = await drawDailyCard()
    dailyCard.value = result.dailyCard
    streak.value = result.streak
    today.value = result.today
    saved.value = result.saved !== false
    if (result.dailyCard) todayStatus.value = 'drawn'
    // 抽完月曆的今天那格要出現牌：重抓這個月（同一個月才抓）
    if (month.value && today.value.startsWith(month.value)) void loadMonth(month.value)
  } catch (error) {
    dailyError.value = error instanceof Error ? error.message : '抽牌失敗，請再試一次。'
  } finally {
    drawing.value = false
  }
}

// ---- 月曆 ----
const month = ref('')
const monthData = shallowRef<CalendarMonth | null>(null)
const monthLoading = ref(false)
const monthError = ref('')
// 換月很快時只採用最後一次的回應
let monthRequest = 0

const dayMap = computed(() => new Map((monthData.value?.days ?? []).map((day) => [day.date, day])))

async function loadMonth(key: string) {
  const own = ++monthRequest
  monthLoading.value = true
  monthError.value = ''
  try {
    // 剛登入時先等訪客抽的牌存好，今天那格才會有牌
    await waitForGuestClaim()
    const result = await fetchCalendarMonth(key)
    if (own !== monthRequest) return
    monthData.value = result
    streak.value = result.streak
  } catch (error) {
    if (own !== monthRequest) return
    monthError.value = error instanceof Error ? error.message : '月曆讀取失敗，請重新整理。'
  } finally {
    if (own === monthRequest) monthLoading.value = false
  }
}

const selectedDate = ref('')
const selectedDay = computed<CalendarDay | null>(() => dayMap.value.get(selectedDate.value) ?? null)

// 1024 以上當天內容放在月曆右邊，以下用底部彈窗
const wideQuery = window.matchMedia('(min-width: 1024px)')
const isWide = ref(wideQuery.matches)
const onWideChange = (event: MediaQueryListEvent) => (isWide.value = event.matches)
onMounted(() => wideQuery.addEventListener('change', onWideChange))
onBeforeUnmount(() => wideQuery.removeEventListener('change', onWideChange))

const SELECTED_CELL = ['outline-2', '-outline-offset-2', 'outline-accent-hue']
const cellEls = new Map<string, HTMLElement>()
watch(selectedDate, (now, before) => {
  cellEls.get(before)?.classList.remove(...SELECTED_CELL)
  cellEls.get(now)?.classList.add(...SELECTED_CELL)
})

const calendarOptions = {
  // 選中那天的金框直接加在整格（[data-date]）上：格子內容那層比整格矮 1～2px，畫在裡面底邊會對不齊；
  // dayCellClass 換了 FullCalendar 不會重畫，所以記下每一格的元素，selectedDate 變了自己切 class
  // 格子上方那一層預設只有內容寬、又靠右，內容會偏右：撐滿整格，牌才會在格子正中央
  dayCellTopInnerClass: 'min-w-0 flex-1',
  dayCellDidMount(info: { date: Date; el: HTMLElement }) {
    const key = dayKeyOf(info.date)
    cellEls.set(key, info.el)
    if (key === selectedDate.value) info.el.classList.add(...SELECTED_CELL)
  },
  dayCellWillUnmount(info: { date: Date; el: HTMLElement }) {
    const key = dayKeyOf(info.date)
    if (cellEls.get(key) === info.el) cellEls.delete(key)
  },
  plugins: [classicThemePlugin, dayGridPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  locale: zhTwLocale,
  // 台灣的月曆習慣從星期日開始
  firstDay: 0,
  // 只顯示這個月需要的週數，不固定 6 列
  fixedWeekCount: false,
  height: 'auto',
  headerToolbar: { start: 'title', center: '', end: 'prev,today,next' },
  datesSet(info: { start: Date; end: Date }) {
    const key = visibleMonthOf(info.start, info.end)
    if (key === month.value) return
    month.value = key
    void loadMonth(key)
  },
  dateClick(info: { date: Date }) {
    selectedDate.value = dayKeyOf(info.date)
  },
}

const route = useRoute()
const router = useRouter()

onMounted(() => {
  void loadToday()
  // 帶了 ?date=（從日記頁回來）：打開那天；用完把網址清掉
  const queryDate = typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date) ? route.query.date : ''
  if (queryDate) {
    selectedDate.value = queryDate
    void router.replace({ query: {} })
    return
  }
  // 桌機一進來就顯示今天的內容
  if (isWide.value) selectedDate.value = today.value
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="on-scene space-y-1">
      <h1 class="text-display font-semibold text-ink">占卜月曆</h1>
      <p class="text-body text-ink-soft">每天抽一張牌，月曆上看得到每天的牌與當天問過的占卜。</p>
    </header>

    <DailyCardPanel
      :daily-card="dailyCard"
      :streak="streak"
      :loading="dailyLoading"
      :drawing="drawing"
      :error="dailyError"
      :saved="saved"
      reminder
      @draw="draw"
    />

    <section class="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-label="月曆">
      <div class="tarot-calendar relative min-w-0 rounded-[1.75rem] border border-line bg-surface/90 p-3 sm:p-5">
        <p v-if="monthError" class="mb-3 text-caption text-danger" role="alert">{{ monthError }}</p>
        <FullCalendar :options="calendarOptions">
          <!-- 每一格：日期、當天的每日一牌縮圖、占卜紀錄數 -->
          <template #dayCellTopContent="arg">
            <!-- 每一格三層（2026-11-20 使用者要求）：日期（那一列只放日期）、每日一牌的簡寫（杖2、幣后逆、審判；圖太佔位置）、
                 占卜筆數與日記記號同一列 -->
            <div class="flex w-full flex-col items-center gap-1 px-0.5 pb-1 pt-0.5" :class="arg.isOther ? 'opacity-40' : ''">
              <span class="self-end text-caption tabular-nums leading-none" :class="arg.isToday ? 'font-semibold text-accent' : 'text-ink-muted'">{{ arg.date.getDate() }}</span>
              <span class="flex h-[1.4rem] items-center">
                <span
                  v-if="dayMap.get(dayKeyOf(arg.date))?.dailyCard"
                  class="whitespace-nowrap border px-1 text-caption leading-tight"
                  :class="dayMap.get(dayKeyOf(arg.date))!.dailyCard!.orientation === 'reversed' ? 'border-danger-hue/40 bg-danger-hue/10 text-danger' : 'border-accent-hue/40 bg-accent-hue/10 text-accent'"
                  :title="`每日一牌：${dayMap.get(dayKeyOf(arg.date))!.dailyCard!.nameZh}${dayMap.get(dayKeyOf(arg.date))!.dailyCard!.orientation === 'reversed' ? '（逆位）' : '（正位）'}`"
                >
                  {{ cardShortName(dayMap.get(dayKeyOf(arg.date))!.dailyCard!.nameZh, dayMap.get(dayKeyOf(arg.date))!.dailyCard!.orientation) }}
                </span>
                <!-- 今天還沒抽：虛線框「未抽」提醒（2026-11-20 使用者要求） -->
                <span
                  v-else-if="arg.isToday && !dailyLoading && !dailyCard"
                  class="whitespace-nowrap border border-dashed border-warn/70 px-1 text-caption leading-tight text-warn"
                  title="今天的每日一抽還沒做"
                >
                  未抽
                </span>
              </span>
              <span class="flex h-[1.15rem] items-center gap-1">
                <span
                  v-if="dayMap.get(dayKeyOf(arg.date))?.readings.length"
                  class="flex h-[1.15rem] min-w-[1.15rem] items-center justify-center border border-tint/30 bg-tint/10 px-0.5 text-caption tabular-nums leading-none text-ink-soft"
                  :title="`占卜 ${dayMap.get(dayKeyOf(arg.date))!.readings.length} 筆`"
                >
                  {{ dayMap.get(dayKeyOf(arg.date))!.readings.length }}
                </span>
                <!-- 當天寫了日記：和筆數同樣大小的方塊，裡面是像素鉛筆（不用 ✎，Windows 會畫成彩色表情） -->
                <span
                  v-if="dayMap.get(dayKeyOf(arg.date))?.journals?.length"
                  class="flex h-[1.15rem] w-[1.15rem] items-center justify-center border border-info-hue/40 bg-info-hue/10 text-info"
                  :title="`日記 ${dayMap.get(dayKeyOf(arg.date))!.journals!.length} 篇`"
                >
                  <svg viewBox="0 0 8 8" class="h-2.5 w-2.5" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 0h1v1h1v1h1v1H7v1H6v1H5v1H4v1H3v1H0V5h1V4h1V3h1V2h1V1h1z" fill="currentColor" /></svg>
                  <span class="sr-only">有日記</span>
                </span>
              </span>
            </div>
          </template>
        </FullCalendar>
        <!-- 換月載入中：月曆格子先留著，蓋一層淡淡的骨架提示 -->
        <div v-if="monthLoading && !monthData" class="absolute inset-x-5 bottom-5 top-20 grid grid-cols-7 gap-2" aria-hidden="true">
          <SkeletonBlock v-for="n in 35" :key="n" class="h-20" />
        </div>
      </div>

      <!-- 桌機：當天內容放右邊 -->
      <!-- 桌機：高度跟著左邊的月曆，內容多就在面板裡上下捲，不把整列撐高（2026-11-20 使用者要求）。
           做法：外框不佔高度（內容放在 absolute 的捲動層），整列的高度由月曆決定 -->
      <aside v-if="isWide" class="relative min-h-[20rem] min-w-0 overflow-hidden rounded-[1.75rem] border border-line bg-surface/90">
        <div id="calendar-day-detail" class="absolute inset-0 overflow-y-auto p-5">
          <CalendarDayDetail
            v-if="selectedDate"
            :date="selectedDate"
            :day="selectedDay"
            :today="today"
          />
          <p v-else class="text-body text-ink-muted">點月曆上的一天，看當天的牌與占卜。</p>
        </div>
      </aside>
    </section>

    <!-- 手機：點一天從底部開彈窗 -->
    <CalendarDayDialog
      v-if="!isWide && selectedDate"
      :date="selectedDate"
      :day="selectedDay"
      :today="today"
      @close="selectedDate = ''"
    />
  </div>
</template>
