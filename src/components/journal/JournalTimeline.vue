<script setup lang="ts">
// 占卜日記的時間軸（v26 計畫 2）：一筆塔羅紀錄或一天的每日一牌底下的所有日記，依日期由舊到新。
// 每篇有標題、日期、結果標記（還不知道／應驗了／部分應驗／沒有應驗）與內容；可以新增、編輯、刪除。
// 股票日記不用結果標記（2026-11-20 使用者要求），改成「記錄股票」；舊日記已經標過的照樣顯示
// 列表在編輯與唯讀模式長得一樣（2026-11-20 使用者要求）：每篇只放標題與內文第一行，點了才滿版——唯讀是看、編輯是改
// 草稿自動存在這台瀏覽器，按「儲存」才送後端。內容只有本人看得到，不送給 AI
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { createJournalEntry, deleteJournalEntry, fetchJournal, updateJournalEntry } from '../../lib/api'
import { dayTitle } from '../../lib/calendarDays'
import { confirmDialog } from '../../lib/confirm'
import { taipeiToday } from '../../lib/dailyCard'
import { clearDraft, emptyDoc, firstLineOf, hasText, loadDraft, OUTCOME_OPTIONS, outcomeLabel, saveDraft, trimTrailingEmpty } from '../../lib/journal'
import {
  changeSincePct,
  hasStockRecord,
  newStockDraft,
  stockActionLabel,
  stockDraftOf,
  stockRecordOf,
  stockRows,
  type StockDraft,
} from '../../lib/stockJournal'
import type { JournalContent, JournalEntry, JournalOutcome, JournalStockRecord } from '../../types'
import SkeletonBlock from '../SkeletonBlock.vue'
import JournalContentView from './JournalContentView.vue'
import JournalEditor from './JournalEditor.vue'
import StockRecordFields from './StockRecordFields.vue'

const props = withDefaults(
  defineProps<{
    // reading:<塔羅紀錄 id> 或 stock:<市場>:<代號>（一檔股票一本，v26 計畫 2-2；每日一牌的日記 2026-11-20 拿掉）
    target: string
    // 股票日記：市場與現在的股價（新的一篇帶入「寫的時候的股價」、列表算到現在的漲跌）；塔羅日記不給
    stock?: { market: 'tw' | 'us'; quote: { price: number; date: string | null } | null } | null
    // 一進來就打開「寫一篇」
    autoCompose?: boolean
    // 日記頁上方的切換（2026-11-20 使用者要求）：read 只看，不顯示寫一篇、編輯、刪除與編輯器
    mode?: 'edit' | 'read'
    // 日記頁：撐滿外面的面板；正在寫的那一篇滿版顯示，其他篇先收起來（2026-11-20 使用者要求）
    fill?: boolean
    // 一進來就打開這一篇（日記 id；月曆點某篇日記用）：唯讀是滿版看，編輯是滿版改
    initialEntry?: string
  }>(),
  { autoCompose: false, mode: 'edit', fill: false, initialEntry: '', stock: null },
)
const emit = defineEmits<{ changed: []; count: [number] }>()

const entries = ref<JournalEntry[]>([])
// 篇數變了就告訴外面（股票日記頁左欄的摘要「日記幾篇」）
watch(() => entries.value.length, (count) => emit('count', count))
const loading = ref(true)
const loadError = ref('')
// 換對象很快時只採用最後一次的回應
let loadRequest = 0
// 讀完要打開的那一篇（只用一次）
let pendingEntry = props.initialEntry

async function load() {
  const own = ++loadRequest
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchJournal(props.target)
    if (own !== loadRequest) return
    entries.value = result.entries
    // 第一次讀完：要打開指定的那一篇（找不到就停在列表）
    const wanted = pendingEntry
    pendingEntry = ''
    const entry = wanted ? result.entries.find((item) => item.id === wanted) : null
    if (entry) openEntry(entry)
  } catch (error) {
    if (own !== loadRequest) return
    loadError.value = error instanceof Error ? error.message : '日記讀取失敗，請重新整理。'
  } finally {
    if (own === loadRequest) loading.value = false
  }
}

// ---- 寫／改一篇 ----
interface Composer {
  entryId: string | null
  title: string
  content: JournalContent
  outcome: JournalOutcome
  entryDate: string
  // 股票日記的「記錄股票」；塔羅日記是 null
  stock: StockDraft | null
}
const composer = ref<Composer | null>(null)
const restoredDraft = ref(false)
const saving = ref(false)
const saveError = ref('')
const today = taipeiToday()

const market = computed(() => props.stock?.market ?? 'tw')
const currentPrice = computed(() => props.stock?.quote?.price ?? null)

function openNew() {
  composer.value = {
    entryId: null,
    title: '',
    content: emptyDoc(),
    outcome: null,
    entryDate: today,
    stock: props.stock ? newStockDraft(props.stock.market, props.stock.quote) : null,
  }
  restoredDraft.value = false
  saveError.value = ''
}

function openEdit(entry: JournalEntry) {
  composer.value = {
    entryId: entry.id,
    title: entry.title ?? '',
    content: entry.content,
    outcome: entry.outcome,
    entryDate: entry.entryDate,
    // 改舊的一篇：寫的時候的股價沿用當時的，不換成現在的
    stock: props.stock ? stockDraftOf(entry.stock, props.stock.market) : null,
  }
  restoredDraft.value = false
  saveError.value = ''
}

// 有上次沒存的草稿就接著寫；否則看要不要直接打開
function openInitial() {
  const draft = loadDraft(props.target)
  if (draft) {
    composer.value = {
      entryId: draft.entryId,
      title: draft.title ?? '',
      content: draft.content,
      outcome: draft.outcome,
      entryDate: draft.entryDate,
      stock: props.stock ? (draft.stock ?? newStockDraft(props.stock.market, props.stock.quote)) : null,
    }
    restoredDraft.value = true
  } else if (props.autoCompose && props.mode === 'edit') {
    openNew()
  } else {
    composer.value = null
  }
}

// 編輯中自動存草稿（停手半秒後存）
let draftTimer: ReturnType<typeof setTimeout> | undefined
// 還在等那半秒的草稿；儲存、放棄時 clearTimeout 之後它就不會再被存
let pendingDraft: (() => void) | null = null
watch(
  composer,
  (value) => {
    clearTimeout(draftTimer)
    pendingDraft = null
    if (!value) return
    const target = props.target
    const write = () => {
      pendingDraft = null
      saveDraft(target, value)
    }
    pendingDraft = write
    draftTimer = setTimeout(write, 500)
  },
  { deep: true },
)
// 停手不到半秒就離開頁面（換頁、關掉彈窗）：最後打的字先存起來，不要丟掉（2026-11-26 前端優化 10）
onBeforeUnmount(() => {
  clearTimeout(draftTimer)
  pendingDraft?.()
})

const composing = computed(() => Boolean(composer.value) && props.mode === 'edit')

// 唯讀（日記頁）：點一篇滿版看那一篇，「回到列表」或 Esc 回去（2026-11-20 使用者要求）
const viewingId = ref('')
const viewing = computed(() => (props.fill && props.mode === 'read' ? (entries.value.find((entry) => entry.id === viewingId.value) ?? null) : null))
// 點列表的一篇：唯讀是滿版看，編輯是滿版改
function openEntry(entry: JournalEntry) {
  if (props.mode === 'read') viewingId.value = entry.id
  else if (!composer.value) openEdit(entry)
}
function onViewKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && viewing.value) viewingId.value = ''
}
onMounted(() => window.addEventListener('keydown', onViewKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onViewKeydown))
// 看著某一篇時切到「編輯」：直接改那一篇
watch(
  () => props.mode,
  (mode) => {
    const entry = entries.value.find((item) => item.id === viewingId.value)
    viewingId.value = ''
    if (mode === 'edit' && entry && !composer.value) openEdit(entry)
  },
)
const editingEntry = computed(() => entries.value.find((entry) => entry.id === composer.value?.entryId) ?? null)

async function save() {
  const value = composer.value
  if (!value || saving.value) return
  // 股票欄位：填錯就停在這裡
  let stock: JournalStockRecord | null | undefined
  if (value.stock) {
    const parsed = stockRecordOf(value.stock, market.value)
    if ('error' in parsed) {
      saveError.value = parsed.error
      return
    }
    stock = parsed.value
  }
  if (!hasText(value.content) && !value.outcome && !value.title.trim() && !stock) {
    saveError.value = props.stock ? '日記是空的：寫個標題或內容、記一筆股票，或至少標一下結果。' : '日記是空的：寫個標題或內容，或至少標一下結果。'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const content = trimTrailingEmpty(value.content)
    // 塔羅日記不送 stock（undefined）；股票日記送整組（null＝清掉）
    const { entry } = value.entryId
      ? await updateJournalEntry(value.entryId, { title: value.title, content, outcome: value.outcome, entryDate: value.entryDate, stock })
      : await createJournalEntry({ target: props.target, title: value.title, content, outcome: value.outcome, entryDate: value.entryDate, stock })
    entries.value = [...entries.value.filter((item) => item.id !== entry.id), entry].sort(
      (a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt),
    )
    clearTimeout(draftTimer)
    pendingDraft = null
    clearDraft(props.target)
    composer.value = null
    emit('changed')
  } catch (error) {
    // 失敗時內容留在編輯器裡（草稿也還在），可以再按一次
    saveError.value = error instanceof Error ? error.message : '儲存失敗，請再試一次。'
  } finally {
    saving.value = false
  }
}

async function cancel() {
  const value = composer.value
  if (!value) return
  const original = editingEntry.value
  // 股票欄位改了沒有：比送出去會是什麼（填錯的也算改過）
  const stockNow = value.stock ? JSON.stringify(stockRecordOf(value.stock, market.value)) : ''
  const stockChanged = original
    ? Boolean(value.stock) && stockNow !== JSON.stringify(stockRecordOf(stockDraftOf(original.stock, market.value), market.value))
    : Boolean(value.stock) && stockNow !== JSON.stringify({ value: null })
  const changed = original
    ? (original.title ?? '') !== value.title ||
      JSON.stringify(original.content) !== JSON.stringify(value.content) ||
      original.outcome !== value.outcome ||
      original.entryDate !== value.entryDate ||
      stockChanged
    : Boolean(value.title.trim()) || hasText(value.content) || value.outcome !== null || stockChanged
  if (changed && !(await confirmDialog({ title: '放棄這次的修改？', message: '還沒儲存的內容會不見。', confirmText: '放棄', danger: true }))) return
  clearTimeout(draftTimer)
  pendingDraft = null
  clearDraft(props.target)
  composer.value = null
}

// ---- 刪除 ----
const deletingId = ref('')
const deleteError = ref('')

async function remove(entry: JournalEntry) {
  const ok = await confirmDialog({
    title: '刪除這篇日記？',
    message: `「${entry.title || firstLineOf(entry.content) || dayTitle(entry.entryDate)}」會刪除，不能復原。`,
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  deletingId.value = entry.id
  deleteError.value = ''
  try {
    await deleteJournalEntry(entry.id)
    entries.value = entries.value.filter((item) => item.id !== entry.id)
    if (composer.value?.entryId === entry.id) {
      clearTimeout(draftTimer)
      pendingDraft = null
      clearDraft(props.target)
      composer.value = null
    }
    emit('changed')
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '刪除失敗，請再試一次。'
  } finally {
    deletingId.value = ''
  }
}

const OUTCOME_TONE: Record<string, string> = {
  hit: 'border-ok-hue/50 text-ok',
  partial: 'border-warn/60 text-warn',
  miss: 'border-danger-hue/50 text-danger',
}
const outcomeTone = (value: JournalOutcome) => (value ? OUTCOME_TONE[value] : 'border-tint/20 text-ink-muted')

// 股票日記列表的一行摘要：「價格 88．數量 1 張」，欄位跟著動作（不用 @ 這類符號，2026-11-20 使用者回報）
function stockSummary(record: JournalStockRecord) {
  return stockRows(record).map((row) => `${row.label} ${row.value}`).join('．')
}
// 結果標記：股票日記沒有這一項，只顯示舊日記已經標過的
const showOutcome = (value: JournalOutcome) => !props.stock || value !== null
// 寫的時候的股價 → 現在：漲跌幾 %（台股紅漲綠跌，用語意色 up／down）
function sinceWrite(record: JournalStockRecord | null | undefined) {
  const pct = changeSincePct(record?.quoteAtWrite, currentPrice.value)
  if (pct === null || !record?.quoteAtWrite) return null
  return { from: record.quoteAtWrite, pct, tone: pct > 0 ? 'text-up' : pct < 0 ? 'text-down' : 'text-ink-soft' }
}

onMounted(() => {
  void load()
  openInitial()
})
// 已經開著這一天時再按「寫點什麼」：直接打開新的一篇（已經在寫就不動）
watch(
  () => props.autoCompose,
  (value) => {
    if (value && !composer.value && props.mode === 'edit') openNew()
  },
)
// 同一個元件換了對象（月曆換一天）：重新讀、草稿也換成那一個的
watch(
  () => props.target,
  () => {
    // 上一個對象還沒存的草稿先存好（它記著的是上一個對象）
    clearTimeout(draftTimer)
    pendingDraft?.()
    void load()
    openInitial()
  },
)
</script>

<template>
  <!-- 日記頁：最矮等於日記欄（寫一篇的黃框才撐得滿），內容多就跟著長、由日記欄捲；
       用 h-full 會把高度固定住，日記一多最後一篇的底部被截掉（2026-11-20 使用者回報） -->
  <section class="flex flex-col gap-3" :class="fill ? 'min-h-full' : ''" aria-label="日記">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-subtitle font-semibold text-ink">日記{{ entries.length ? `（${entries.length}）` : '' }}</h3>
      <!-- 標題列右邊：日記頁放「編輯／唯讀」切換（actions 插槽），編輯模式再加「寫一篇」 -->
      <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
      <!-- 寫一篇：圖示按鈕（2026-11-20 使用者要求），名稱與提示照樣是「寫一篇」 -->
      <button
        v-if="!composer && mode === 'edit'"
        type="button"
        class="flex h-8 w-8 cursor-pointer items-center justify-center border-2 border-accent-hue/40 bg-accent-hue/10 text-accent transition hover:bg-accent-hue/20 active:translate-x-[1px] active:translate-y-[1px]"
        aria-label="寫一篇"
        title="寫一篇"
        @click="openNew"
      >
        <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true" shape-rendering="crispEdges"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" fill="currentColor" /></svg>
      </button>
      </div>
    </div>

    <!-- 載入中：和日記卡片同樣的形狀 -->
    <div v-if="loading" class="space-y-2" aria-hidden="true">
      <div v-for="n in 2" :key="n" class="space-y-2 border border-line bg-raised p-3">
        <SkeletonBlock class="h-4 w-40" />
        <SkeletonBlock class="h-4 w-full" />
      </div>
    </div>
    <p v-else-if="loadError" class="text-body text-danger" role="alert">{{ loadError }}</p>
    <p v-else-if="!entries.length && (!composer || mode === 'read')" class="text-body text-ink-muted">
      還沒有日記。{{ mode === 'read' ? '切到「編輯」寫第一篇。' : '按右上角的＋寫第一篇：這件事後來怎麼了，之後回來看準不準。' }}
    </p>
    <p v-if="mode === 'read' && composer" class="text-caption text-info" role="status">有一篇還沒儲存，切到「編輯」繼續寫。</p>

    <!-- 時間軸：編輯與唯讀同一種卡片，只放標題與內文第一行；正在寫或正在看的時候（日記頁）列表收起來、那一篇滿版 -->
    <ol v-if="!loading && entries.length && !(fill && composing) && !viewing" class="space-y-2">
      <li v-for="entry in entries" :key="entry.id">
        <button
          type="button"
          class="block w-full cursor-pointer border border-line bg-raised p-3 text-left transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-default disabled:opacity-50"
          :disabled="mode === 'edit' && Boolean(composer)"
          :aria-label="`${mode === 'read' ? '看' : '編輯'}「${entry.title || firstLineOf(entry.content) || dayTitle(entry.entryDate, today)}」`"
          @click="openEntry(entry)"
        >
          <span class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-caption tabular-nums text-ink-muted">{{ dayTitle(entry.entryDate, today) }}</span>
            <span v-if="showOutcome(entry.outcome)" class="border px-1.5 text-caption" :class="outcomeTone(entry.outcome)">{{ outcomeLabel(entry.outcome) }}</span>
          </span>
          <span class="mt-1.5 block truncate text-subtitle font-semibold" :class="entry.title ? 'text-ink' : 'text-ink-muted'">{{ entry.title || '（沒有標題）' }}</span>
          <span v-if="firstLineOf(entry.content)" class="mt-0.5 block truncate text-body text-ink-soft">{{ firstLineOf(entry.content) }}</span>
          <!-- 股票日記：動作、價格與數量、目標／停損，寫的時候到現在漲跌 -->
          <span v-if="hasStockRecord(entry.stock) || sinceWrite(entry.stock)" class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
            <span v-if="entry.stock?.action" class="border border-accent-hue/40 px-1.5 text-accent">{{ stockActionLabel(entry.stock.action) }}</span>
            <span v-if="hasStockRecord(entry.stock) && stockSummary(entry.stock)" class="tabular-nums text-ink-soft">{{ stockSummary(entry.stock) }}</span>
            <span v-if="sinceWrite(entry.stock)" class="tabular-nums text-ink-soft">
              寫的時候 {{ sinceWrite(entry.stock)!.from.toLocaleString('zh-TW') }}，到現在
              <span :class="sinceWrite(entry.stock)!.tone">{{ sinceWrite(entry.stock)!.pct > 0 ? '+' : '' }}{{ sinceWrite(entry.stock)!.pct }}%</span>
            </span>
          </span>
        </button>
      </li>
    </ol>

    <!-- 唯讀：滿版看一篇 -->
    <article v-if="viewing" class="flex flex-1 flex-col gap-3 border border-line bg-raised p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="h-8 cursor-pointer border-2 border-tint/20 px-3 text-button text-ink-soft transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
          @click="viewingId = ''"
        >
          ‹ 回到列表
        </button>
        <p class="flex flex-wrap items-center gap-2">
          <span class="text-caption tabular-nums text-ink-soft">{{ dayTitle(viewing.entryDate, today) }}</span>
          <span v-if="showOutcome(viewing.outcome)" class="border px-1.5 text-caption" :class="outcomeTone(viewing.outcome)">{{ outcomeLabel(viewing.outcome) }}</span>
        </p>
      </div>
      <h4 v-if="viewing.title" class="text-title font-semibold text-ink">{{ viewing.title }}</h4>
      <!-- 股票日記：這篇記的股票 -->
      <dl v-if="hasStockRecord(viewing.stock) || sinceWrite(viewing.stock)" class="flex flex-wrap gap-x-5 gap-y-1 border border-line bg-surface px-3 py-2 text-body">
        <div v-if="viewing.stock?.action" class="flex gap-1.5"><dt class="text-ink-soft">動作</dt><dd class="text-accent">{{ stockActionLabel(viewing.stock.action) }}</dd></div>
        <div v-for="row in stockRows(viewing.stock)" :key="row.label" class="flex gap-1.5"><dt class="text-ink-soft">{{ row.label }}</dt><dd class="tabular-nums text-ink">{{ row.value }}</dd></div>
        <div v-if="viewing.stock?.quoteAtWrite != null" class="flex gap-1.5">
          <dt class="text-ink-soft">寫的時候</dt>
          <dd class="tabular-nums text-ink">
            {{ viewing.stock.quoteAtWrite.toLocaleString('zh-TW') }}
            <template v-if="sinceWrite(viewing.stock)">
              → 現在 {{ currentPrice!.toLocaleString('zh-TW') }}
              <span :class="sinceWrite(viewing.stock)!.tone">（{{ sinceWrite(viewing.stock)!.pct > 0 ? '+' : '' }}{{ sinceWrite(viewing.stock)!.pct }}%）</span>
            </template>
          </dd>
        </div>
      </dl>
      <JournalContentView v-if="viewing.text" :content="viewing.content" />
      <p v-else class="text-body text-ink-muted">這篇沒有寫內容。</p>
    </article>

    <!-- 寫／改一篇。日記頁桌機（fill＋lg）：黃框撐滿日記欄，框本身不超出，只有中間的編輯區自己捲（2026-11-20 使用者要求）；
         桌機用格線：四列是說明、日期與結果、編輯區（minmax(8rem,1fr)）、按鈕，黃框最矮＝上下幾列＋8rem 的編輯區，
         編輯區加 contain-size：它的內容不算進黃框的最小高度（不加的話黃框會被內容撐高、編輯區不會自己捲），
         也不會壓到按鈕跑出框外；比這還矮才由外面的日記欄捲。手機照內容長高、整頁捲 -->
    <!-- 股票日記多一列「記錄股票」，格線多一個 auto -->
    <div
      v-if="composer && composing"
      class="flex flex-col gap-2.5 border-2 border-accent-hue/40 bg-surface p-3 sm:p-4"
      :class="fill ? (composer.stock ? 'lg:grid lg:flex-1 lg:grid-rows-[auto_auto_auto_auto_minmax(8rem,1fr)_auto]' : 'lg:grid lg:flex-1 lg:grid-rows-[auto_auto_auto_minmax(8rem,1fr)_auto]') : ''"
    >
      <p class="text-caption text-ink-muted" role="status">
        <span v-if="restoredDraft" class="text-info">接著寫上次還沒儲存的草稿．</span>{{ composer.entryId ? '修改日記' : '新的一篇' }}．草稿自動存在這台裝置，按「儲存」才存進帳號
      </p>

      <!-- 標題（2026-11-20 使用者要求）：像 Notion 的頁面標題，大字、沒有外框 -->
      <input
        v-model="composer.title"
        type="text"
        maxlength="100"
        placeholder="標題"
        aria-label="標題"
        class="w-full border-b border-line bg-transparent pb-1.5 text-title font-semibold text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/60"
      />

      <!-- 日期與結果排在同一列，放不下再換行；股票日記沒有結果 -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="flex items-center gap-1.5 text-caption text-ink-soft">
          日期
          <input
            v-model="composer.entryDate"
            type="date"
            :max="today"
            required
            class="h-7 border-2 border-tint/15 bg-surface px-1.5 text-caption text-ink"
          />
        </label>
        <div v-if="!composer.stock" class="flex flex-wrap items-center gap-1.5">
          <span id="journal-outcome-label" class="text-caption text-ink-soft">結果</span>
          <div class="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="journal-outcome-label">
            <button
              v-for="option in OUTCOME_OPTIONS"
              :key="String(option.value)"
              type="button"
              role="radio"
              :aria-checked="composer.outcome === option.value"
              class="h-7 cursor-pointer border-2 px-2 text-button transition active:translate-x-[1px] active:translate-y-[1px]"
              :class="composer.outcome === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
              @click="composer.outcome = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <StockRecordFields v-if="composer.stock" v-model="composer.stock" :market="market" />

      <div class="border border-line bg-raised px-2" :class="fill ? 'flex flex-col lg:min-h-0 lg:overflow-y-auto lg:contain-size' : ''">
        <JournalEditor v-model="composer.content" :class="fill ? 'flex-1' : ''" />
      </div>

      <div class="space-y-2">
      <p v-if="saveError" class="text-caption text-danger" role="alert">{{ saveError }}</p>
      <p v-if="deleteError" class="text-caption text-danger" role="alert">{{ deleteError }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="h-10 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/10 px-4 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-wait disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? '儲存中…' : '儲存' }}
        </button>
        <button
          type="button"
          class="h-10 cursor-pointer border-2 border-tint/20 px-4 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-60"
          :disabled="saving"
          @click="cancel"
        >
          取消
        </button>
        <!-- 刪除放在編輯畫面裡（列表卡片只放標題與第一行） -->
        <button
          v-if="editingEntry"
          type="button"
          class="ml-auto h-10 cursor-pointer border-2 border-danger-hue/30 px-4 text-button text-danger transition hover:bg-danger-hue/10 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-wait disabled:opacity-60"
          :disabled="saving || deletingId === editingEntry.id"
          @click="remove(editingEntry)"
        >
          {{ deletingId === editingEntry.id ? '刪除中…' : '刪除' }}
        </button>
      </div>
      </div>
    </div>
  </section>
</template>
