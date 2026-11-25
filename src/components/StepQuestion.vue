<script setup lang="ts" generic="D extends string = QuestionDomain">
import { computed } from 'vue'

import { canUseStock } from '../lib/auth'
import SelectField from './SelectField.vue'
import SpreadLayout from './SpreadLayout.vue'
import type { QuestionDomain, SpreadShape } from '../types'

type DomainOption = { value: D | ''; label: string; group?: string }

// v27：塔羅與雷諾曼共用。雷諾曼另外傳入問題類型（不含股市）、關掉「不指定牌陣」、加上「代表我的牌」
// allowFreeSpread 沒傳時要是 true（布林 prop 沒傳會被當成 false，塔羅會少掉「不指定牌陣」）
const props = withDefaults(defineProps<{
  question: string
  domain: D | ''
  spreadKey: string
  freeCardCount?: number
  spreads: SpreadShape[]
  disabled: boolean
  // 問題類型選項；沒給就用塔羅的（股市諮詢依權限加上）
  domainOptions?: DomainOption[]
  // 問題類型下面的說明；沒給就用塔羅的
  domainHint?: string
  // 能不能「不指定牌陣」（沒給就可以）
  allowFreeSpread?: boolean
  // 代表我的牌（雷諾曼）：有給選項才顯示；required 時沒選不能下一步
  significator?: string
  significatorOptions?: { value: string; label: string }[]
  significatorRequired?: boolean
  significatorHint?: string
}>(), { allowFreeSpread: true })

const emit = defineEmits<{
  'update:question': [value: string]
  'update:domain': [value: D | '']
  'update:spreadKey': [value: string]
  'update:freeCardCount': [value: number]
  'update:significator': [value: string]
  next: []
}>()

const allowFree = computed(() => props.allowFreeSpread)
const missingSignificator = computed(() => Boolean(props.significatorOptions && props.significatorRequired && !props.significator))

const BASE_DOMAIN_OPTIONS: { value: QuestionDomain | ''; label: string; group?: string }[] = [
  { value: '', label: '自動判斷' },
  { value: 'work', label: '工作 / 事業' },
  { value: 'money', label: '財務 / 金錢' },
  { value: 'love', label: '感情' },
  { value: 'social', label: '人際 / 家庭' },
  { value: 'study', label: '學業 / 決策' },
]

// 股市諮詢只給 admin 與開通「金融股市」的會員，另成一組和一般問題類型隔開。
// 這裡只決定顯不顯示，後端會再檢查一次
// 沒傳入選項時是塔羅（D 就是 QuestionDomain），塔羅的預設選項可以直接當成 D 用
const domainOptions = computed<DomainOption[]>(
  () =>
    props.domainOptions ??
    ((canUseStock.value
      ? [...BASE_DOMAIN_OPTIONS, { value: 'stock' as const, label: '股市諮詢', group: '金融股市' }]
      : BASE_DOMAIN_OPTIONS) as DomainOption[]),
)

const FREE_SPREAD_KEY = ''
const FREE_MAX_CARDS = 10

const spreadOptions = computed(() => [
  ...props.spreads.map((spread) => ({ value: spread.key, label: `${spread.name} · ${spread.cardCount} 張` })),
  ...(allowFree.value ? [{ value: FREE_SPREAD_KEY, label: '不指定牌陣（自由張數）' }] : []),
])

const selectedSpread = computed(() => props.spreads.find((spread) => spread.key === props.spreadKey) || null)

const freeCountOptions = computed(() =>
  Array.from({ length: FREE_MAX_CARDS }, (_, index) => ({ value: String(index + 1), label: `${index + 1} 張` })),
)
</script>

<template>
  <div class="space-y-5">
    <label class="block space-y-2">
      <span class="block text-sm font-medium text-ink-soft">問題核心</span>
      <textarea
        :value="question"
        rows="3"
        class="w-full border-2 border-tint/10 bg-tint/5 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40 focus:bg-tint/8"
        placeholder="例如：我接下來三個月的工作發展會如何？"
        @input="emit('update:question', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <div class="space-y-2">
      <SelectField
        :model-value="domain"
        label="問題類型"
        :options="domainOptions"
        @update:model-value="emit('update:domain', $event as D | '')"
      />
      <span v-if="domain === 'stock'" class="block text-xs leading-5 text-accent">
        AI 解讀時會即時查詢報價與技術指標，以數據分析為主、牌面為輔。問題裡寫上股票代號或名稱（例如 2330、台積電、輝達），沒寫就看加權指數。
      </span>
      <span v-else class="block text-xs text-ink-muted">
        {{ domainHint ?? '指定類型可讓分析的權重更準；留著自動判斷則由問題文字推測。' }}
      </span>
    </div>

    <!-- 代表我的牌（雷諾曼 D4）：由求問者自己選紳士或淑女，不和帳號性別綁定 -->
    <div v-if="significatorOptions" class="space-y-2">
      <SelectField
        :model-value="significator ?? ''"
        label="代表我的牌"
        :options="significatorOptions"
        @update:model-value="emit('update:significator', String($event))"
      />
      <span class="block text-caption" :class="missingSignificator ? 'text-warn' : 'text-ink-muted'">
        {{ missingSignificator ? '這個牌陣要先選代表你的牌。' : significatorHint }}
      </span>
    </div>

    <div class="space-y-2">
      <SelectField
        :model-value="spreadKey"
        label="牌陣"
        :options="spreadOptions"
        @update:model-value="emit('update:spreadKey', String($event))"
      />
      <!-- 不指定牌陣時沒有位置，張數改由使用者決定 -->
      <SelectField
        v-if="!selectedSpread && allowFree"
        :model-value="String(freeCardCount ?? 3)"
        label="要抽幾張"
        :options="freeCountOptions"
        @update:model-value="emit('update:freeCardCount', Number($event))"
      />
    </div>

    <div
      v-if="selectedSpread"
      class="space-y-3 border-2 border-tint/10 bg-tint/5 p-4 text-sm leading-6 text-ink-soft"
    >
      <div>
        <p class="font-medium text-ink">{{ selectedSpread.name }}</p>
        <p class="mt-1">{{ selectedSpread.description }}</p>
      </div>
      <SpreadLayout :spread="selectedSpread" />
    </div>
    <!-- check-rules-ignore-next-line 塔羅原有的一行，v27 只加了 allowFree 條件；字級照舊，避免塔羅畫面跟著變 -->
    <p v-else-if="allowFree" class="border-2 border-dashed border-tint/15 bg-sink/10 px-4 py-3 text-sm leading-6 text-ink-muted">
      不指定牌陣時沒有位置之分，分析會用相鄰兩張配對、權重均分。
    </p>

    <button
      class="w-full cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-3 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
      type="button"
      :disabled="disabled || missingSignificator"
      @click="emit('next')"
    >
      下一步：抽牌
    </button>
  </div>
</template>
