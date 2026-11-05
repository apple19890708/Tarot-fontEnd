<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { addPushDevice, fetchNotifyStatus, linkDiscord, removePushDevice, sendTestNotify, unlinkDiscord } from '../../lib/api'
import { currentSubscription, deviceLabel, notificationPermission, pushSupport, subscribePush, unsubscribePush } from '../../lib/push'
import { useCooldown } from '../../lib/useCooldown'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { MarketNotifyStatus } from '../../types'

// 到價推播設定。網頁關著時，由外部排程在交易時段檢查提醒，到價就推播。
// - 瀏覽器推播：所有會員，一台裝置按一次「開啟」（iPhone 要先加入主畫面）
// - Discord Webhook：只有管理者看得到（後端 GET /notify 對其他人回 discord: null，綁定 API 也擋 403）
const status = ref<MarketNotifyStatus | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'error'>('loading')
// 載入失敗的訊息
const error = ref('')
// 推播與 Discord 的訊息分開，各自顯示在自己的區塊，才不會看錯是哪一邊出問題
const pushMessage = ref('')
const pushError = ref('')
const discordMessage = ref('')
const discordError = ref('')
const busy = ref<'' | 'push-on' | 'push-off' | 'remove' | 'link' | 'unlink' | 'test'>('')

const support = pushSupport()
// 這台裝置目前的訂閱 endpoint（用來判斷這台有沒有開）
const thisEndpoint = ref<string | null>(null)

async function load() {
  loadStatus.value = 'loading'
  error.value = ''
  try {
    const [result, subscription] = await Promise.all([fetchNotifyStatus(), currentSubscription().catch(() => null)])
    status.value = result
    thisEndpoint.value = subscription?.endpoint ?? null
    loadStatus.value = 'ready'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '通知設定暫時讀不到。'
    loadStatus.value = 'error'
  }
}
onMounted(load)

const thisDevice = computed(() => status.value?.push.devices.find((d) => d.endpoint === thisEndpoint.value) ?? null)
const otherDevices = computed(() => status.value?.push.devices.filter((d) => d.endpoint !== thisEndpoint.value) ?? [])
const permissionDenied = computed(() => notificationPermission() === 'denied')
const anyChannel = computed(() => Boolean(status.value?.push.devices.length || status.value?.discord?.linked))

function reset() {
  pushMessage.value = ''
  pushError.value = ''
  discordMessage.value = ''
  discordError.value = ''
}

async function enablePush() {
  reset()
  const publicKey = status.value?.push.publicKey
  if (!publicKey) return
  busy.value = 'push-on'
  try {
    const subscription = await subscribePush(publicKey)
    status.value = await addPushDevice(subscription.toJSON(), deviceLabel())
    thisEndpoint.value = subscription.endpoint
    pushMessage.value = '這台裝置已開啟通知，可以按「送測試通知」確認。'
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : '開啟失敗'
  } finally {
    busy.value = ''
  }
}

async function disablePush() {
  reset()
  busy.value = 'push-off'
  try {
    if (thisDevice.value) status.value = await removePushDevice(thisDevice.value.id)
    await unsubscribePush()
    thisEndpoint.value = null
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : '關閉失敗'
  } finally {
    busy.value = ''
  }
}

async function removeDevice(id: string) {
  reset()
  busy.value = 'remove'
  try {
    status.value = await removePushDevice(id)
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : '移除失敗'
  } finally {
    busy.value = ''
  }
}

// 送測試通知：按完 15 秒內不能再按
const testCooldown = useCooldown(15)
function test() {
  if (busy.value !== '') return
  void testCooldown.run(doTest)
}

async function doTest() {
  reset()
  busy.value = 'test'
  try {
    const result = await sendTestNotify()
    const parts = []
    if (result.push) parts.push(`${result.push} 台裝置`)
    if (result.discord) parts.push('Discord')
    pushMessage.value = `測試通知已送到 ${parts.join('、')}。`
    // 部分管道失敗（例如推播成功、Discord 失敗）也要說
    if (result.errors?.length) pushError.value = result.errors.join('；')
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : '送出失敗'
  } finally {
    busy.value = ''
  }
  // 失效的裝置會被後端移除，重新讀一次狀態
  try {
    status.value = await fetchNotifyStatus()
  } catch {
    // 讀不到就維持原本的畫面
  }
}

// ---- Discord（管理者）----
const editingDiscord = ref(false)
const webhookUrl = ref('')

async function link() {
  reset()
  if (!webhookUrl.value.trim()) {
    discordError.value = '請貼上 Webhook 網址。'
    return
  }
  busy.value = 'link'
  try {
    status.value = await linkDiscord(webhookUrl.value.trim())
    webhookUrl.value = ''
    editingDiscord.value = false
    discordMessage.value = 'Discord 綁定完成，頻道應該收到一則確認訊息了。'
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : '綁定失敗'
  } finally {
    busy.value = ''
  }
}

async function unlink() {
  if (!window.confirm('確定要解除 Discord 綁定嗎？')) return
  reset()
  busy.value = 'unlink'
  try {
    status.value = await unlinkDiscord()
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : '解除失敗'
  } finally {
    busy.value = ''
  }
}

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : ''
}

const BUTTON = 'shrink-0 cursor-pointer border-2 px-3 py-1.5 text-[12px] transition disabled:opacity-60 font-pixel'
const PRIMARY = 'border-amber-200/40 bg-amber-200/15 text-amber-50 hover:bg-amber-200/25'
const SECONDARY = 'border-white/15 text-stone-300 hover:bg-white/10'
</script>

<template>
  <div class="space-y-3 border-2 border-white/10 bg-white/[0.03] p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-stone-100">到價推播</p>
      <span v-if="anyChannel" class="border border-emerald-300/40 px-2 py-0.5 text-[11px] text-emerald-200">已開啟</span>
    </div>

    <!-- 載入中：說明列、按鈕列 -->
    <div v-if="loadStatus === 'loading'" class="space-y-2">
      <SkeletonBlock class="h-3.5 w-full max-w-md rounded-none" />
      <div class="flex gap-2">
        <SkeletonBlock class="h-[2.125rem] w-40 rounded-none" />
        <SkeletonBlock class="h-[2.125rem] w-28 rounded-none" />
      </div>
    </div>

    <div v-else-if="loadStatus === 'error'" class="flex flex-wrap items-center gap-3 text-xs text-rose-200">
      <span>{{ error }}</span>
      <button type="button" :class="[BUTTON, 'border-rose-200/30']" @click="load">重試</button>
    </div>

    <template v-else-if="status">
      <!-- ── 瀏覽器推播（所有人）── -->
      <div class="space-y-2">
        <p v-if="!status.push.available" class="text-xs leading-5 text-stone-400">
          伺服器還沒開放推播，目前只有網頁開著時才會檢查提醒。
        </p>
        <p v-else-if="support === 'ios-needs-install'" class="text-xs leading-5 text-amber-100/90">
          iPhone／iPad 要先把網站加到主畫面：用 Safari 開啟 → 下方「分享」→「加入主畫面」，再從主畫面的圖示開啟網站，回到這裡開啟通知（iOS 16.4 以上）。
        </p>
        <p v-else-if="support === 'unsupported'" class="text-xs leading-5 text-stone-400">這個瀏覽器不支援推播通知，請改用 Chrome、Edge、Firefox 或 Safari。</p>

        <template v-else>
          <p class="text-xs leading-5 text-stone-400">
            開啟後，網頁關著也會跳出到價通知（交易時段約每 10 分鐘檢查一次，可能晚幾分鐘）。每台裝置要分別開啟。
          </p>
          <p v-if="permissionDenied && !thisDevice" class="text-xs leading-5 text-rose-200">
            這個瀏覽器封鎖了本站的通知，請到網址列左邊的網站設定把「通知」改成允許，再重新整理。
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="thisDevice">
              <span class="text-xs text-emerald-200">這台裝置（{{ thisDevice.label || '目前的瀏覽器' }}）已開啟</span>
              <button type="button" :class="[BUTTON, SECONDARY]" :disabled="busy !== ''" @click="disablePush">
                {{ busy === 'push-off' ? '關閉中…' : '關閉這台' }}
              </button>
            </template>
            <button v-else type="button" :class="[BUTTON, PRIMARY]" :disabled="busy !== '' || permissionDenied" @click="enablePush">
              {{ busy === 'push-on' ? '開啟中…' : '開啟這台裝置的通知' }}
            </button>
            <button v-if="anyChannel" type="button" :class="[BUTTON, SECONDARY]" :disabled="busy !== '' || testCooldown.active.value" @click="test">
              {{ busy === 'test' ? '送出中…' : testCooldown.active.value ? `送測試通知（${testCooldown.remaining.value}）` : '送測試通知' }}
            </button>
          </div>
        </template>

        <p v-if="pushMessage" class="text-xs text-emerald-200">{{ pushMessage }}</p>
        <p v-if="pushError" class="text-xs leading-5 text-rose-200">{{ pushError }}</p>

        <!-- 其他已開啟的裝置（換手機、換電腦時可以在這裡移除舊的） -->
        <ul v-if="otherDevices.length" class="space-y-1 text-xs">
          <li class="text-stone-500">其他已開啟的裝置</li>
          <li v-for="device in otherDevices" :key="device.id" class="flex flex-wrap items-center gap-2">
            <span class="text-stone-300">{{ device.label || '未命名裝置' }}</span>
            <span class="text-stone-500">{{ dateText(device.createdAt) }}</span>
            <button type="button" class="cursor-pointer border border-white/15 px-1.5 text-[11px] text-stone-400 transition hover:bg-white/10" :disabled="busy !== ''" @click="removeDevice(device.id)">
              移除
            </button>
          </li>
        </ul>
      </div>

      <!-- ── Discord（只有管理者會拿到 status.discord）── -->
      <details v-if="status.discord" class="border-t border-white/10 pt-2 text-xs">
        <summary class="cursor-pointer text-stone-300 marker:text-stone-200 hover:text-stone-100">
          Discord 通知（管理者專用）
          <span v-if="status.discord.linked" class="ml-1 text-emerald-200">已綁定</span>
        </summary>
        <div class="mt-2 space-y-2">
          <template v-if="status.discord.linked && !editingDiscord">
            <p class="leading-5 text-stone-400">
              {{ dateText(status.discord.linkedAt) }} 綁定（<span class="font-mono text-stone-300">{{ status.discord.hint }}</span>）。
            </p>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="[BUTTON, SECONDARY]" :disabled="busy !== ''" @click="editingDiscord = true">換一個 Webhook</button>
              <button type="button" :class="[BUTTON, SECONDARY]" :disabled="busy !== ''" @click="unlink">解除綁定</button>
            </div>
          </template>
          <template v-else>
            <p class="leading-5 text-stone-400">
              頻道「編輯頻道」→「整合」→「Webhook」→「新 Webhook」→「複製 Webhook 網址」，貼到下面。後端會先送一則確認訊息，成功才儲存；之後不會再顯示完整網址。
            </p>
            <form class="flex flex-wrap gap-2" @submit.prevent="link">
              <input
                v-model="webhookUrl"
                type="url"
                autocomplete="off"
                spellcheck="false"
                aria-label="Discord Webhook 網址"
                class="min-w-0 flex-[1_1_16rem] border-2 border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40"
                placeholder="https://discord.com/api/webhooks/…"
              />
              <button type="submit" :class="[BUTTON, PRIMARY, 'py-2']" :disabled="busy !== ''">
                {{ busy === 'link' ? '確認中…' : '綁定' }}
              </button>
              <button v-if="status.discord.linked" type="button" :class="[BUTTON, SECONDARY, 'py-2']" @click="editingDiscord = false">取消</button>
            </form>
          </template>
          <p v-if="discordMessage" class="text-emerald-200">{{ discordMessage }}</p>
          <p v-if="discordError" class="leading-5 text-rose-200">{{ discordError }}</p>
        </div>
      </details>
    </template>
  </div>
</template>
