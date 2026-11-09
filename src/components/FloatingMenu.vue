<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { isLoggedIn, logoutEverywhere } from '../lib/auth'
import { cardStyle, setCardStyle, type CardStyle } from '../lib/cardStyle'
import { confirmDialog } from '../lib/confirm'
import { setTheme, theme, type Theme } from '../lib/theme'
import CrystalBallIcon from './CrystalBallIcon.vue'
import { sectionNav, type SectionNavItem } from '../lib/sectionNav'

// 浮在畫面右上的選單：像素水晶球按鈕，全站都有。打開後可以切換日夜模式；
// 看得到牌的頁面（cards）多一區牌面風格，結果頁再多一區「跳到段落」，內容很長時用來快速移動。
const props = defineProps<{ cards?: boolean }>()

const open = ref(false)
const items = ref<SectionNavItem[]>([])
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const route = useRoute()

// 預設黑夜（計畫書 v18）
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'night', label: '黑夜' },
  { value: 'day', label: '白天' },
]

const STYLE_OPTIONS: { value: CardStyle; label: string }[] = [
  { value: 'original', label: '原版' },
  { value: 'pixel', label: '像素' },
]

// 每次打開都重新收集：AI 解讀可能是後來才出現的
function refreshItems() {
  items.value = sectionNav.value?.items() ?? []
}

watch(open, (isOpen) => {
  if (isOpen) refreshItems()
})
// 打開著的時候換到別的結果（例如紀錄頁點另一筆），清單跟著換
watch(sectionNav, () => {
  if (open.value) refreshItems()
})
watch(
  () => route.fullPath,
  () => (open.value = false),
)

// ---- 帳號：登出所有裝置（懷疑帳號被盜、或在別人電腦忘了登出）----
// 2026-11-09 使用者決定先關閉（之後有需要再開）：改成 true 就會出現在選單裡。
// 後端 POST /api/auth/logout-all 照常保留；重設密碼仍會讓所有裝置登出
const SHOW_LOGOUT_ALL = false
const router = useRouter()
const loggingOutAll = ref(false)
const logoutAllError = ref('')
async function onLogoutAll() {
  const ok = await confirmDialog({
    title: '登出所有裝置',
    message:
      '所有登入中的手機、電腦（包含這一台）都會被登出，要重新輸入密碼才能再用。\n懷疑帳號被別人用了，可以先按這個，再用「忘記密碼」換一組新密碼。',
    confirmText: '全部登出',
    danger: true,
  })
  if (!ok) return
  loggingOutAll.value = true
  logoutAllError.value = ''
  try {
    await logoutEverywhere()
    open.value = false
    void router.push('/')
  } catch (error) {
    logoutAllError.value = error instanceof Error ? error.message : '暫時登出不了，請稍後再試。'
  } finally {
    loggingOutAll.value = false
  }
}

const showCardStyle = computed(() => props.cards && sectionNav.value?.cardStyle !== false)

function jump(item: SectionNavItem) {
  open.value = false
  item.go()
}

// 點選單外面、或按 Esc 就收起來；Esc 時把焦點還給按鈕，鍵盤使用者不會迷路
function onPointerDown(event: PointerEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    buttonEl.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- z-20 低於手機導覽選單（z-30），選單展開時會蓋過它；位置沿用原本的牌面開關 -->
  <div ref="rootEl" class="fixed right-4 top-20 z-20 md:right-8">
    <button
      ref="buttonEl"
      type="button"
      class="flex h-11 w-11 cursor-pointer items-center justify-center border-2 border-frame bg-surface shadow-[3px_3px_0_var(--c-shade)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      :class="open ? 'text-orb-glow' : 'text-orb hover:text-orb-glow'"
      :aria-expanded="open"
      aria-controls="floating-menu"
      aria-label="選單"
      title="選單"
      @click="open = !open"
    >
      <CrystalBallIcon class="h-7 w-7" :sparkle="open" />
    </button>

    <Transition
      enter-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 [transition-timing-function:steps(3)] motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        id="floating-menu"
        class="absolute right-0 top-full mt-2 max-h-[calc(100dvh-8rem)] w-60 overflow-y-auto border-2 border-frame bg-surface p-3 shadow-[4px_4px_0_var(--c-shade)]"
      >
        <!-- 日夜模式：每一頁都有，選擇記在這台瀏覽器 -->
        <section>
          <p class="text-xs text-accent">日夜模式</p>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              v-for="option in THEME_OPTIONS"
              :key="option.value"
              type="button"
              class="cursor-pointer border-2 px-2 py-1 text-sm transition active:translate-x-[2px] active:translate-y-[2px]"
              :class="theme === option.value ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-muted hover:bg-raised'"
              :aria-pressed="theme === option.value"
              @click="setTheme(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <!-- 牌面風格：所有畫面的牌面一起換，選擇記在這台瀏覽器；只在看得到牌的頁面出現 -->
        <section v-if="showCardStyle" class="mt-3 border-t-2 border-line pt-3">
          <p class="text-xs text-accent">牌面風格</p>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              v-for="option in STYLE_OPTIONS"
              :key="option.value"
              type="button"
              class="cursor-pointer border-2 px-2 py-1 text-sm transition active:translate-x-[2px] active:translate-y-[2px]"
              :class="cardStyle === option.value ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-muted hover:bg-raised'"
              :aria-pressed="cardStyle === option.value"
              @click="setCardStyle(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <!-- 帳號：登入時才出現（目前關閉，見 SHOW_LOGOUT_ALL） -->
        <section v-if="SHOW_LOGOUT_ALL && isLoggedIn" class="mt-3 border-t-2 border-line pt-3">
          <p class="text-xs text-accent">帳號</p>
          <button
            type="button"
            class="mt-2 w-full cursor-pointer border-2 border-danger-hue/40 px-2 py-1 text-sm text-danger transition hover:bg-danger-hue/10 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loggingOutAll"
            @click="onLogoutAll"
          >
            {{ loggingOutAll ? '登出中…' : '登出所有裝置' }}
          </button>
          <p v-if="logoutAllError" class="mt-1.5 text-xs text-danger">{{ logoutAllError }}</p>
        </section>

        <!-- 只有結果頁會登記段落，其他頁面這區不出現 -->
        <nav
          v-if="items.length > 0"
          aria-label="跳到段落"
          class="mt-3 border-t-2 border-line pt-3"
        >
          <p class="text-xs text-accent">跳到段落</p>
          <ul class="mt-2 space-y-0.5">
            <li v-for="(item, index) in items" :key="`${index}-${item.label}`">
              <button
                type="button"
                class="w-full cursor-pointer px-2 py-1 text-left transition hover:bg-raised hover:text-accent"
                :class="item.level === 2 ? 'pl-5 text-xs text-ink-muted' : 'text-sm text-ink-soft'"
                @click="jump(item)"
              >
                <span v-if="item.level === 2" class="mr-1 text-ink-muted" aria-hidden="true">·</span>{{ item.label }}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </Transition>
  </div>
</template>
