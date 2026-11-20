<script setup lang="ts">
// 通知中心的面板（v26 計畫 5）：桌機是鈴鐺下方的下拉，手機是底部彈窗（sheet，背景不能捲）。
// 上方「全部標成已讀」「清除已讀」；列表依日期分組（今天、昨天、更早），點一則標成已讀並前往相關頁面；每則可以單獨刪除。
// 開關、點外面、Esc 由 NotificationBell 處理
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { clearReadNotifications, deleteNotification, fetchNotifications, markNotificationsRead } from '../lib/api'
import { confirmDialog } from '../lib/confirm'
import {
  groupNotifications,
  NOTIFICATION_KIND_LABELS,
  notificationRoute,
  notificationTime,
  refreshUnreadNotifications,
  unreadNotifications,
} from '../lib/notifications'
import { useScrollLock } from '../lib/useScrollLock'
import type { AppNotification } from '../types'
import SkeletonBlock from './SkeletonBlock.vue'

const props = defineProps<{ sheet: boolean }>()
const emit = defineEmits<{ close: [] }>()

// 手機的底部彈窗：背景不能捲（打開時才掛上這個元件，sheet 在掛上時就決定了）
if (props.sheet) useScrollLock()

const router = useRouter()
const items = ref<AppNotification[]>([])
const hasMore = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')
const actionError = ref('')
const busy = ref<'' | 'read-all' | 'clear'>('')
const now = ref(new Date())

const groups = computed(() => groupNotifications(items.value, now.value))
const hasUnread = computed(() => unreadNotifications.value > 0 || items.value.some((item) => !item.read))
// 列表沒載完時，後面可能還有已讀的
const hasRead = computed(() => hasMore.value || items.value.some((item) => item.read))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchNotifications()
    items.value = result.notifications
    hasMore.value = result.hasMore
    now.value = new Date()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '通知讀取失敗，請再試一次。'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  const last = items.value[items.value.length - 1]
  if (!last || loadingMore.value) return
  loadingMore.value = true
  actionError.value = ''
  try {
    const result = await fetchNotifications(last.id)
    const seen = new Set(items.value.map((item) => item.id))
    items.value = [...items.value, ...result.notifications.filter((item) => !seen.has(item.id))]
    hasMore.value = result.hasMore
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '讀取更多通知失敗，請再試一次。'
  } finally {
    loadingMore.value = false
  }
}

// 點一則：標成已讀（畫面先改，失敗也照樣前往），有相關頁面就過去並關掉面板
async function openItem(item: AppNotification) {
  if (!item.read) {
    item.read = true
    unreadNotifications.value = Math.max(0, unreadNotifications.value - 1)
    markNotificationsRead([item.id])
      .catch(() => undefined)
      .finally(() => void refreshUnreadNotifications(true))
  }
  const path = notificationRoute(item.url)
  if (path) {
    emit('close')
    await router.push(path)
  }
}

async function markAllRead() {
  busy.value = 'read-all'
  actionError.value = ''
  try {
    await markNotificationsRead()
    items.value = items.value.map((item) => ({ ...item, read: true }))
    unreadNotifications.value = 0
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '標成已讀失敗，請再試一次。'
  } finally {
    busy.value = ''
    void refreshUnreadNotifications(true)
  }
}

async function clearRead() {
  const ok = await confirmDialog({
    title: '清除已讀的通知？',
    message: '看過的通知會全部刪掉，刪了就找不回來。還沒看的會留著。',
    confirmText: '清除',
    danger: true,
  })
  if (!ok) return
  busy.value = 'clear'
  actionError.value = ''
  try {
    await clearReadNotifications()
    // 重新讀：後面還沒載入的已讀也被清掉了，第一頁要補上原本排在後面的未讀
    await load()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '清除失敗，請再試一次。'
  } finally {
    busy.value = ''
  }
}

// 單獨刪一則：通知本身只是提醒的副本（D11 本來就會自動刪），照計畫書不另外確認；刪失敗把它放回來
const deleting = ref(new Set<string>())
async function remove(item: AppNotification) {
  if (deleting.value.has(item.id)) return
  deleting.value = new Set([...deleting.value, item.id])
  actionError.value = ''
  try {
    await deleteNotification(item.id)
    items.value = items.value.filter((entry) => entry.id !== item.id)
    if (!item.read) unreadNotifications.value = Math.max(0, unreadNotifications.value - 1)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '刪除失敗，請再試一次。'
  } finally {
    const next = new Set(deleting.value)
    next.delete(item.id)
    deleting.value = next
  }
}

onMounted(load)

const ACTION = 'h-8 cursor-pointer border-2 border-tint/20 px-2.5 text-button text-ink-soft transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0'
const ICON_TONE: Record<AppNotification['kind'], string> = {
  'price-alert': 'border-accent-hue/50 text-accent',
  'ex-dividend': 'border-ok-hue/50 text-ok',
  test: 'border-info-hue/50 text-info',
  system: 'border-tint/30 text-ink-soft',
}
</script>

<template>
  <section class="flex min-h-0 flex-col" aria-label="通知">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
      <h2 class="text-subtitle font-semibold text-ink">通知</h2>
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" :class="ACTION" :disabled="loading || Boolean(busy) || !hasUnread" @click="markAllRead">
          {{ busy === 'read-all' ? '標記中…' : '全部標成已讀' }}
        </button>
        <button type="button" :class="ACTION" :disabled="loading || Boolean(busy) || !hasRead" @click="clearRead">
          {{ busy === 'clear' ? '清除中…' : '清除已讀' }}
        </button>
        <button
          v-if="sheet"
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center border-2 border-tint/20 text-ink-soft transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
          aria-label="關閉通知"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </div>

    <p v-if="actionError" class="border-b border-line px-4 py-2 text-caption text-danger" role="alert">{{ actionError }}</p>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <!-- 載入中：和通知同樣的形狀 -->
      <ul v-if="loading" class="divide-y divide-line" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="flex gap-2.5 px-4 py-3">
          <SkeletonBlock class="h-7 w-7 shrink-0" />
          <span class="flex-1 space-y-1.5">
            <SkeletonBlock class="h-4 w-3/4" />
            <SkeletonBlock class="h-3.5 w-full" />
          </span>
        </li>
      </ul>
      <div v-else-if="loadError" class="space-y-2 px-4 py-4">
        <p class="text-body text-danger" role="alert">{{ loadError }}</p>
        <button type="button" :class="ACTION" @click="load">再試一次</button>
      </div>
      <p v-else-if="!items.length" class="px-4 py-6 text-body text-ink-soft">
        還沒有通知。價位提醒到價、除息前一天的提醒都會收在這裡，保留 90 天。
      </p>

      <template v-else>
        <div v-for="group in groups" :key="group.key" role="group" :aria-label="group.label">
          <p class="sticky top-0 z-[1] border-b border-line bg-surface px-4 py-1 text-caption text-ink-muted">{{ group.label }}</p>
          <ul class="divide-y divide-line">
            <li v-for="item in group.items" :key="item.id" class="flex items-stretch" :class="item.read ? '' : 'bg-accent-hue/5'">
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer gap-2.5 py-2.5 pl-4 pr-1 text-left transition hover:bg-tint/10 active:bg-tint/15"
                :aria-label="`${item.read ? '' : '未讀．'}${NOTIFICATION_KIND_LABELS[item.kind]}：${item.title}${notificationRoute(item.url) ? '（前往相關頁面）' : ''}`"
                @click="openItem(item)"
              >
                <!-- 種類圖示；未讀時右上角小點 -->
                <span class="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border-2" :class="ICON_TONE[item.kind]" :title="NOTIFICATION_KIND_LABELS[item.kind]" aria-hidden="true">
                  <svg viewBox="0 0 16 16" class="h-4 w-4" shape-rendering="crispEdges">
                    <path v-if="item.kind === 'price-alert'" d="M2 12h2v2H2zM5 9h2v5H5zM8 10h2v4H8zM11 5h2v9h-2zM10 2h4v4h-2V4h-2z" fill="currentColor" />
                    <path v-else-if="item.kind === 'ex-dividend'" d="M5 2h6v2h2v2h1v4h-1v2h-2v2H5v-2H3v-2H2V6h1V4h2zm2 3v1H6v2h3v1H6v1h1v1h2v-1h1V8H7V7h3V6H9V5z" fill="currentColor" />
                    <path v-else-if="item.kind === 'test'" d="M7 1h2v1h2v1h1v5h1v2h1v2H2v-2h1V8h1V3h1V2h2zM6 13h4v2H6z" fill="currentColor" />
                    <path v-else d="M7 2h2v2H7zM6 6h3v6h1v2H6v-2h1V8H6z" fill="currentColor" />
                  </svg>
                  <span v-if="!item.read" class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger-hue" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-start gap-2">
                    <span class="min-w-0 flex-1 text-body" :class="item.read ? 'text-ink-soft' : 'font-semibold text-ink'">{{ item.title }}</span>
                    <span class="shrink-0 whitespace-nowrap text-caption tabular-nums text-ink-muted">{{ notificationTime(item.createdAt, now) }}</span>
                  </span>
                  <span v-if="item.body" class="mt-0.5 line-clamp-2 block text-caption text-ink-soft">{{ item.body }}</span>
                </span>
              </button>
              <button
                type="button"
                class="flex w-9 shrink-0 cursor-pointer items-center justify-center text-ink-muted transition hover:bg-danger-hue/10 hover:text-danger active:bg-danger-hue/15 disabled:cursor-wait disabled:opacity-50"
                :disabled="deleting.has(item.id)"
                :aria-label="`刪除「${item.title}」`"
                :title="`刪除這則通知`"
                @click="remove(item)"
              >
                ✕
              </button>
            </li>
          </ul>
        </div>
        <div v-if="hasMore" class="border-t border-line px-4 py-2.5">
          <button type="button" :class="[ACTION, 'w-full']" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? '載入中…' : '載入更早的通知' }}</button>
        </div>
      </template>
    </div>
  </section>
</template>
