<script setup lang="ts">
// 會員選單（v26 計畫 3）：頂欄只留品牌、「占卜」與會員頭像，其他功能收進頭像的選單。
// - 桌機：從頭像往下展開，靠右對齊
// - 手機：同一份選單從頂欄下方整排往下展開（D5：拿掉漢堡；方向照使用者偏好的「從上而下」，不用底部彈窗）
// - 照 ui-check 彈出層規則：點外面、Esc、選了項目都會關；方向鍵上下選、Home／End；目前所在的頁面亮起
// 要顯示哪些頁面由 App 的 navRoutes 決定（權限、角色、股市權限都已經過濾），這裡只分組
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { currentUser, isAdmin } from '../lib/auth'
import { todayStatus } from '../lib/dailyCard'

export interface MenuRoute {
  name: string
  path: string
  label: string
  tier: 'public' | 'member' | 'stock'
  admin: boolean
  group?: 'tarot' | 'stock'
}

const props = defineProps<{ routes: MenuRoute[]; wide: boolean }>()
const emit = defineEmits<{ signOut: [] }>()

const route = useRoute()
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

// 頭像：先用名字的第一個字（之後要上傳照片再另外做）
const initial = computed(() => Array.from(currentUser.value?.displayName?.trim() || '?')[0]!.toUpperCase())

// 分組照路由的 meta.menuGroup：塔羅（塔羅紀錄、占卜月曆）、股市（股市追蹤、股市分析紀錄）；
// 管理者頁放「管理」，其他（管理者自訂的頁面）放「其他頁面」（2026-11-20 使用者要求：拆掉「我的紀錄」）
const groups = computed(() => {
  const tarot = props.routes.filter((r) => r.group === 'tarot')
  const stock = props.routes.filter((r) => r.group === 'stock')
  const admin = props.routes.filter((r) => r.admin && !r.group)
  const others = props.routes.filter((r) => !r.group && !r.admin)
  return [
    { key: 'tarot', label: '塔羅', items: tarot },
    { key: 'stock', label: '股市', items: stock },
    { key: 'others', label: '其他頁面', items: others },
    { key: 'admin', label: '管理', items: admin },
  ].filter((group) => group.items.length)
})

const pending = computed(() => todayStatus.value === 'pending')

function items() {
  return [...(panelEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    items()[0]?.focus()
  }
}

function close(focusButton = false) {
  open.value = false
  if (focusButton) buttonEl.value?.focus()
}

// 換頁就收起來（點了選單裡的項目也是換頁）
watch(() => route.fullPath, () => close())

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    close(true)
    return
  }
  const list = items()
  if (!list.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = list.indexOf(document.activeElement as HTMLElement)
  const next =
    event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : event.key === 'ArrowDown' ? (index + 1) % list.length : (index - 1 + list.length) % list.length
  list[next]?.focus()
}

function onPointerDown(event: PointerEvent) {
  if (open.value && !rootEl.value?.contains(event.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeydown, true)
})

const ITEM = 'flex w-full items-center gap-2 px-4 py-2 text-left font-pixel text-[12px] transition hover:bg-tint/10 focus:bg-tint/10 focus:outline-none active:bg-tint/15'
const itemClass = (name: string, tier: MenuRoute['tier']) => {
  const active = route.name === name
  if (active) return 'bg-selected text-on-selected'
  return tier === 'stock' ? 'text-ok-hue' : tier === 'member' ? 'text-info-hue' : 'text-ink-soft'
}
</script>

<template>
  <div ref="rootEl" class="sm:relative">
    <button
      ref="buttonEl"
      type="button"
      class="flex cursor-pointer items-center gap-2 border-2 border-transparent px-1 py-0.5 transition hover:border-tint/20 active:translate-x-[1px] active:translate-y-[1px]"
      :class="open ? 'border-tint/30 bg-tint/10' : ''"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="member-menu"
      :aria-label="`會員選單：${currentUser?.displayName ?? ''}${pending ? '（今天的每日一牌還沒抽）' : ''}`"
      @click="toggle"
    >
      <!-- 頭像：名字的第一個字。今天還沒抽每日一牌時右上角紅點 -->
      <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-accent-hue bg-accent-hue/15 font-pixel text-[12px] text-accent">
        {{ initial }}
        <span v-if="pending" class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger-hue" aria-hidden="true" />
      </span>
      <span v-if="wide" class="max-w-[10em] truncate font-pixel text-[12px] text-ink" :title="currentUser?.displayName">{{ currentUser?.displayName }}</span>
      <span v-if="wide && isAdmin" class="border-2 border-accent-hue/40 bg-accent-hue/10 px-1.5 py-0.5 font-pixel text-[12px] text-accent">admin</span>
      <span v-if="wide" class="text-caption text-ink-muted transition" :class="open ? 'rotate-180' : ''" aria-hidden="true">▾</span>
    </button>

    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        id="member-menu"
        ref="panelEl"
        class="absolute z-30 border-frame bg-surface py-2 shadow-[0_6px_0_var(--c-shade)] sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-64 sm:border-2 sm:shadow-[6px_6px_0_var(--c-shade)] max-sm:inset-x-0 max-sm:top-full max-sm:max-h-[calc(100vh-5rem)] max-sm:overflow-y-auto max-sm:border-b-4"
        role="menu"
        aria-label="會員選單"
      >
        <!-- 誰登入著 -->
        <div class="border-b border-line px-4 pb-2.5 pt-1">
          <p class="flex items-center gap-2 truncate font-pixel text-[12px] text-ink">
            {{ currentUser?.displayName }}
            <span v-if="isAdmin" class="border-2 border-accent-hue/40 bg-accent-hue/10 px-1.5 py-0.5 font-pixel text-[12px] text-accent">admin</span>
          </p>
          <p class="mt-0.5 truncate text-caption text-ink-muted" :title="currentUser?.email">{{ currentUser?.email }}</p>
        </div>

        <div v-for="group in groups" :key="group.key" class="border-b border-line py-1.5" role="group" :aria-label="group.label">
          <p class="px-4 pb-1 text-caption text-ink-muted">{{ group.label }}</p>
          <router-link
            v-for="item in group.items"
            :key="item.name"
            :to="item.path"
            role="menuitem"
            :class="[ITEM, itemClass(item.name, item.tier)]"
            :aria-current="route.name === item.name ? 'page' : undefined"
          >
            <span class="flex-1">{{ item.label }}</span>
            <template v-if="item.name === 'calendar' && pending">
              <span class="h-2 w-2 rounded-full bg-danger-hue" aria-hidden="true" />
              <span class="sr-only">（今天還沒抽）</span>
            </template>
          </router-link>
        </div>

        <div class="py-1.5">
          <router-link to="/account" role="menuitem" :class="[ITEM, itemClass('account', 'public')]" :aria-current="route.name === 'account' ? 'page' : undefined">
            帳號設定
          </router-link>
          <button type="button" role="menuitem" :class="[ITEM, 'text-ink-soft hover:text-danger']" @click="emit('signOut')">登出</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
