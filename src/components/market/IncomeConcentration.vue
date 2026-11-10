<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import HelpTip from '../HelpTip.vue'
import { saveConcentrationThresholds } from '../../lib/api'
import type { IncomeConcentration } from '../../types'

// 集中度提醒（v20 2.9.8）：放在摘要下面。超過門檻的提醒文字由後端產生（concentration.warnings），這裡直接顯示；
// 持股與產業的占比只排成一行小標籤。門檻可以在「調整門檻」改（存在帳號的股市設定），存完請父元件重抓
const props = defineProps<{ concentration: IncomeConcentration }>()
const emit = defineEmits<{ saved: [] }>()

const top = computed(() => props.concentration.holdings.slice(0, 5))

// ---- 調整門檻 ----
const editing = ref(false)
const form = ref({ holding: '', industry: '' })
const saving = ref(false)
const error = ref('')
watch(
  () => props.concentration.thresholds,
  (t) => {
    form.value = { holding: String(t.holding), industry: String(t.industry) }
  },
  { immediate: true },
)
async function save() {
  const holding = Number(form.value.holding)
  const industry = Number(form.value.industry)
  const valid = (value: number) => Number.isFinite(value) && value >= 5 && value <= 100
  if (!valid(holding) || !valid(industry)) {
    error.value = '門檻要在 5～100% 之間。'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await saveConcentrationThresholds({ holding, industry })
    editing.value = false
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '儲存失敗'
  } finally {
    saving.value = false
  }
}

const INPUT_CLASS =
  'w-16 border-2 border-tint/10 bg-tint/5 px-2 py-1 text-right text-body tabular-nums text-ink outline-none focus:border-accent-hue/40'
</script>

<template>
  <section v-if="concentration.count" class="space-y-2 border-2 px-3 py-2.5" :class="concentration.warnings.length ? 'border-warn/40 bg-warn/5' : 'border-tint/10'">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="flex items-center gap-1 text-body" :class="concentration.warnings.length ? 'text-warn' : 'text-ink-muted'">
        集中度{{ concentration.warnings.length ? '提醒' : '：沒有超過門檻' }}<HelpTip term="concentration" />
      </p>
      <button
        type="button"
        class="cursor-pointer border border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
        :aria-expanded="editing"
        @click="editing = !editing"
      >
        {{ editing ? '取消' : `調整門檻（${concentration.thresholds.holding}%／${concentration.thresholds.industry}%）` }}
      </button>
    </div>

    <ul v-if="concentration.warnings.length" class="space-y-1 text-body text-ink">
      <li v-for="warning in concentration.warnings" :key="`${warning.type}:${warning.key}`" class="flex gap-1.5">
        <span class="text-warn" aria-hidden="true">!</span><span>{{ warning.text }}</span>
      </li>
    </ul>

    <!-- 占比：持股（前 5 檔）、產業 -->
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption tabular-nums">
      <span class="text-ink-muted">持股占比</span>
      <span v-for="holding in top" :key="holding.id" class="border border-tint/15 px-1.5 text-ink-soft">{{ holding.name }} {{ holding.pct }}%</span>
    </div>
    <div v-if="concentration.industries.length" class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption tabular-nums">
      <span class="text-ink-muted">產業占比</span>
      <span v-for="industry in concentration.industries" :key="industry.code" class="border border-tint/15 px-1.5 text-ink-soft" :title="industry.names.join('、')">
        {{ industry.label }} {{ industry.pct }}%
      </span>
      <span v-if="concentration.unclassifiedPct" class="text-ink-muted">（ETF 與美股不分產業，佔 {{ concentration.unclassifiedPct }}%）</span>
    </div>
    <p v-if="concentration.excludedUs" class="text-caption text-warn">匯率暫時取不到，{{ concentration.excludedUs }} 檔美股沒算進來。</p>

    <form v-if="editing" class="flex flex-wrap items-center gap-2 border-t border-tint/10 pt-2 text-body" @submit.prevent="save">
      <label class="flex items-center gap-1.5 text-ink-soft">單一持股超過 <input v-model="form.holding" inputmode="decimal" :class="INPUT_CLASS" aria-label="單一持股門檻（%）" />%</label>
      <label class="flex items-center gap-1.5 text-ink-soft">單一產業超過 <input v-model="form.industry" inputmode="decimal" :class="INPUT_CLASS" aria-label="單一產業門檻（%）" />%</label>
      <button
        type="submit"
        class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-3 py-1 text-button text-accent transition hover:bg-accent-hue/25 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60"
        :disabled="saving"
      >
        {{ saving ? '儲存中…' : '儲存' }}
      </button>
      <p v-if="error" class="w-full text-body text-danger">{{ error }}</p>
    </form>
  </section>
</template>
