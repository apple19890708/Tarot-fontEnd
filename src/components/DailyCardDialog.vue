<script setup lang="ts">
// 每日一牌彈窗（2026-11-20 使用者要求）：每天第一次打開網站時跳出，訪客與會員都會，可以關掉。
// 訪客抽完提示登入或註冊：登入後剛抽的那張會自動存進月曆（伺服器簽的領取憑證，見 lib/dailyCard.ts）。
// 照 ui-check 的彈出層規則：背景鎖捲動、Esc／點外面／按關閉都會關
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { drawDailyCard } from '../lib/api'
import { guestCardToday, saveGuestCard, todayStatus } from '../lib/dailyCard'
import { useScrollLock } from '../lib/useScrollLock'
import type { DailyCard } from '../types'
import DailyCardPanel from './DailyCardPanel.vue'

const props = defineProps<{ loggedIn: boolean }>()
const emit = defineEmits<{ close: [] }>()

useScrollLock()
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// 訪客今天已經抽過（同一台瀏覽器）就直接顯示那張，不重抽
const dailyCard = ref<DailyCard | null>(props.loggedIn ? null : (guestCardToday()?.dailyCard ?? null))
const streak = ref(0)
const drawing = ref(false)
const error = ref('')

async function draw() {
  if (drawing.value) return
  drawing.value = true
  error.value = ''
  try {
    const result = await drawDailyCard()
    dailyCard.value = result.dailyCard
    streak.value = result.streak
    if (result.saved === false) saveGuestCard(result)
    if (result.dailyCard && props.loggedIn) todayStatus.value = 'drawn'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '抽牌失敗，請再試一次。'
  } finally {
    drawing.value = false
  }
}

// 去登入／註冊、月曆前先關掉彈窗
const go = () => emit('close')
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" @click.self="emit('close')">
      <!-- 打開時從上方滑下並淡入，和月曆的當天彈窗一致 -->
      <Transition
        appear
        enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 -translate-y-4"
      >
      <div
        class="flex max-h-[90vh] w-full max-w-xl flex-col border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]"
        role="dialog"
        aria-modal="true"
        aria-label="每日一牌"
      >
        <div class="flex items-center justify-between gap-2 border-b-2 border-frame px-4 py-3">
          <p class="font-pixel text-button text-accent">每日一牌</p>
          <button
            type="button"
            class="h-8 cursor-pointer border-2 border-tint/15 px-3 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
            @click="emit('close')"
          >
            關閉
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <DailyCardPanel :daily-card="dailyCard" :streak="streak" :loading="false" :drawing="drawing" :error="error" :saved="true" @draw="draw" />

          <!-- 訪客抽完：提示登入或註冊，這張會存進月曆 -->
          <div v-if="dailyCard && !loggedIn" class="space-y-3 border-2 border-dashed border-accent-hue/40 bg-accent-hue/5 p-4" role="status">
            <p class="text-body text-ink">登入或註冊，這張牌就會保留在月曆上，之後每天的牌也會一起記下來。</p>
            <div class="flex flex-wrap gap-2">
              <router-link
                :to="{ path: '/login', query: { redirect: '/calendar' } }"
                class="inline-flex h-10 items-center border-2 border-accent-hue/40 bg-accent-hue/10 px-4 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px]"
                @click="go"
              >
                登入
              </router-link>
              <router-link
                :to="{ path: '/register', query: { redirect: '/calendar' } }"
                class="inline-flex h-10 items-center border-2 border-tint/20 px-4 font-pixel text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
                @click="go"
              >
                註冊
              </router-link>
            </div>
          </div>

          <!-- 會員抽完：可以去月曆看（2026-11-20 使用者決定拿掉每日一牌的日記，「寫點什麼」一起移除） -->
          <div v-else-if="dailyCard && loggedIn" class="flex flex-wrap gap-2">
            <router-link
              to="/calendar"
              class="inline-flex h-10 items-center border-2 border-tint/20 px-4 font-pixel text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
              @click="go"
            >
              到月曆看看
            </router-link>
          </div>
        </div>
      </div>
      </Transition>
    </div>
  </Teleport>
</template>
