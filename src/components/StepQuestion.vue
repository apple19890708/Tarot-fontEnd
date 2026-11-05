<script setup lang="ts">
import { computed } from 'vue'

import { canUseStock } from '../lib/auth'
import SelectField from './SelectField.vue'
import SpreadLayout from './SpreadLayout.vue'
import type { QuestionDomain, Spread } from '../types'

const props = defineProps<{
  question: string
  domain: QuestionDomain | ''
  spreadKey: string
  freeCardCount: number
  spreads: Spread[]
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:question': [value: string]
  'update:domain': [value: QuestionDomain | '']
  'update:spreadKey': [value: string]
  'update:freeCardCount': [value: number]
  next: []
}>()

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
const domainOptions = computed(() =>
  canUseStock.value
    ? [...BASE_DOMAIN_OPTIONS, { value: 'stock' as const, label: '股市諮詢', group: '金融股市' }]
    : BASE_DOMAIN_OPTIONS,
)

const FREE_SPREAD_KEY = ''
const FREE_MAX_CARDS = 10

const spreadOptions = computed(() => [
  ...props.spreads.map((spread) => ({ value: spread.key, label: `${spread.name} · ${spread.cardCount} 張` })),
  { value: FREE_SPREAD_KEY, label: '不指定牌陣（自由張數）' },
])

const selectedSpread = computed(() => props.spreads.find((spread) => spread.key === props.spreadKey) || null)

const freeCountOptions = computed(() =>
  Array.from({ length: FREE_MAX_CARDS }, (_, index) => ({ value: String(index + 1), label: `${index + 1} 張` })),
)
</script>

<template>
  <div class="space-y-5">
    <label class="block space-y-2">
      <span class="block text-sm font-medium text-stone-200">問題核心</span>
      <textarea
        :value="question"
        rows="3"
        class="w-full border-2 border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40 focus:bg-white/8"
        placeholder="例如：我接下來三個月的工作發展會如何？"
        @input="emit('update:question', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <div class="space-y-2">
      <SelectField
        :model-value="domain"
        label="問題類型"
        :options="domainOptions"
        @update:model-value="emit('update:domain', $event as QuestionDomain | '')"
      />
      <span v-if="domain === 'stock'" class="block text-xs leading-5 text-amber-100/80">
        AI 解讀時會即時查詢報價與技術指標，以數據分析為主、牌面為輔。問題裡寫上股票代號或名稱（例如 2330、台積電、輝達），沒寫就看加權指數。
      </span>
      <span v-else class="block text-xs text-stone-400">
        指定類型可讓分析的權重更準；留著自動判斷則由問題文字推測。
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
        v-if="!selectedSpread"
        :model-value="String(freeCardCount)"
        label="要抽幾張"
        :options="freeCountOptions"
        @update:model-value="emit('update:freeCardCount', Number($event))"
      />
    </div>

    <div
      v-if="selectedSpread"
      class="space-y-3 border-2 border-white/10 bg-white/5 p-4 text-sm leading-6 text-stone-200/75"
    >
      <div>
        <p class="font-medium text-stone-50">{{ selectedSpread.name }}</p>
        <p class="mt-1">{{ selectedSpread.description }}</p>
      </div>
      <SpreadLayout :spread="selectedSpread" />
    </div>
    <p v-else class="border-2 border-dashed border-white/15 bg-black/10 px-4 py-3 text-sm leading-6 text-stone-400">
      不指定牌陣時沒有位置之分，分析會用相鄰兩張配對、權重均分。
    </p>

    <button
      class="w-full cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-5 py-3 text-[12px] font-medium text-amber-50 transition hover:bg-amber-200/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
      type="button"
      :disabled="disabled"
      @click="emit('next')"
    >
      下一步：抽牌
    </button>
  </div>
</template>
