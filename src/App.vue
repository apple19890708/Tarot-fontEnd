<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from './components/ConfirmDialog.vue'
import DailyCardDialog from './components/DailyCardDialog.vue'
import DivinationMenu from './components/DivinationMenu.vue'
import FloatingMenu from './components/FloatingMenu.vue'
import MemberMenu from './components/MemberMenu.vue'
import type { MenuRoute } from './components/MemberMenu.vue'
import NotificationBell from './components/NotificationBell.vue'
import PixelWorld from './components/PixelWorld.vue'
import { canUseLenormand, canUseStock, currentUser, isLoggedIn, logout } from './lib/auth'
import { confirmState } from './lib/confirm'
import { sectionNav } from './lib/sectionNav'
import { fetchTodayDailyCard } from './lib/api'
import { claimGuestCardIfAny, guestCardToday, markPrompted, promptedToday, taipeiToday, todayStatus } from './lib/dailyCard'
import { alertDetail, alertTitle, dismissTriggered, startAlertWatcher, stopAlertWatcher, triggeredAlerts } from './lib/marketAlerts'
import { healthLabel, refreshHealth } from './lib/health'
import { refreshUnreadNotifications, startNotificationWatcher, stopNotificationWatcher } from './lib/notifications'
import { prefersReducedMotion } from './lib/motion'
import type { SceneKey } from './lib/pixel/core'
import { sceneBus } from './lib/sceneBus'

const router = useRouter()
const route = useRoute()
// 右上角的水晶球選單全站都有（日夜模式）；牌面風格只在看得到牌的地方出現：占卜結果（第 3 步）與我的紀錄
// （股票分析分頁由 sectionNav.cardStyle = false 再關掉）；跳到段落由各頁登記
const showCardStyle = computed(
	() =>
		(route.name === 'home' && sceneBus.step === 3) ||
		route.name === 'history' ||
		// 股市分析紀錄：股票分析分頁由 sectionNav.cardStyle = false 再關掉（同拆頁前的行為）
		(route.name === 'market-records' && ((route.query.tab ?? 'stock') !== 'stock' || Boolean(sectionNav.value))),
)

onMounted(refreshHealth)

// 價位提醒：有金融股市權限的人開著網頁時定期檢查；登出或權限被收回就停
watch(canUseStock, (allowed) => (allowed ? startAlertWatcher() : stopAlertWatcher()), { immediate: true })
onBeforeUnmount(stopAlertWatcher)

// 通知中心（v26 計畫 5）：登入時定期查未讀數，登出就停、數字歸零
watch(isLoggedIn, (loggedIn) => (loggedIn ? startNotificationWatcher() : stopNotificationWatcher()), { immediate: true })
onBeforeUnmount(stopNotificationWatcher)
// 網頁上跳出到價提示時，後端已經存進通知中心了（回應前存好），鈴鐺馬上跟著加
watch(
	() => triggeredAlerts.value.length,
	(count, previous) => {
		if (count > (previous ?? 0)) void refreshUnreadNotifications(true)
	},
)

// 像素世界的場景由路由的 meta.scene 決定，沒寫的頁面（含管理者自訂的路由）是最安靜的星夜。
// 路由準備好之前先不畫，免得第一次載入時把「起始空路由」當成星夜、播一段多餘的過場
const routerReady = ref(false)
router.isReady().then(() => (routerReady.value = true))
const scene = computed<SceneKey | null>(() =>
  routerReady.value ? ((route.meta.scene as SceneKey | undefined) ?? 'sky') : null,
)
// 背景壓暗多少：首頁 0（夜景是主角），要讀資料的頁面預設 0.15（0.35 使用者覺得太暗），背景只當畫框
const sceneDim = computed(() => (route.meta.sceneDim as number | undefined) ?? 0.15)

// 換頁時場景不同，就等背景過場播完再淡入頁面內容，不要一進來就蓋在過場上。
// 在場景改變當下（App 自己的 pre watcher，比畫面更新早）先藏起來，PixelWorld 回報過場結束再顯示；
// 分頁在背景時動畫迴圈會暫停、過場不會結束，所以最多等 1.5 秒就照樣顯示。減少動態時沒有過場，不藏
const contentHidden = ref(false)
let revealFallback: ReturnType<typeof setTimeout> | undefined
function reveal() {
  contentHidden.value = false
  clearTimeout(revealFallback)
}
watch(scene, (next, prev) => {
  if (!prev || !next || next === prev || prefersReducedMotion()) return
  contentHidden.value = true
  clearTimeout(revealFallback)
  revealFallback = setTimeout(reveal, 1500)
})
watch(
  () => sceneBus.transitioning,
  (moving) => {
    if (!moving) reveal()
  },
)
onBeforeUnmount(() => clearTimeout(revealFallback))

// sm 斷點（640px）。手機的會員頭像只顯示頭像（不顯示名字）；
// 初值直接讀 matchMedia，桌機才不會先閃一下收合的樣子
const DESKTOP_QUERY = '(min-width: 640px)'
const isDesktop = ref(typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches)
let mediaQuery: MediaQueryList | null = null

function onBreakpointChange(event: MediaQueryListEvent) {
  isDesktop.value = event.matches
}

onMounted(() => {
  mediaQuery = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = mediaQuery.matches
  mediaQuery.addEventListener('change', onBreakpointChange)
})

onBeforeUnmount(() => mediaQuery?.removeEventListener('change', onBreakpointChange))


// 目前所在的頁面亮起；用路由名稱比對，網址帶 query（例如紀錄頁的 ?id=）也算同一頁
// 會員專屬的頁面另外上色，一眼看得出哪些是登入後才有的：
// 一般會員頁（我的紀錄）藍、金融股市權限頁（股市追蹤）綠；目前所在的頁面只變色（和其他頁一樣變琥珀色），不加底線
const NAV_TIER_STYLES = {
  member: { idle: 'text-info-hue hover:text-info', active: 'text-warn' },
  stock: { idle: 'text-ok-hue hover:text-ok', active: 'text-warn' },
} as const

function navClass(name: string, tier: 'public' | keyof typeof NAV_TIER_STYLES = 'public') {
  const active = route.name === name
  if (tier === 'public') {
    return active ? 'text-warn' : 'text-ink-soft hover:text-warn'
  }
  return active ? NAV_TIER_STYLES[tier].active : NAV_TIER_STYLES[tier].idle
}

// 導覽列只顯示目前角色進得去的頁面
const navRoutes = computed(() =>
  router
    .getRoutes()
    .filter((route) => route.name && !route.meta?.guest && !route.meta?.hidden)
    // 要登入才進得去的頁面（例如我的紀錄），沒登入就不列出來
    .filter((route) => !route.meta?.auth || isLoggedIn.value)
    .filter((route) => !route.meta?.role || route.meta.role === currentUser.value?.role)
    .filter((route) => !route.meta?.stock || canUseStock.value)
    .filter((route) => !route.meta?.lenormand || canUseLenormand.value)
    .map((route) => ({
      name: String(route.name),
      path: route.path,
      label: String(route.meta?.title || route.name),
      // 上色用：金融股市權限頁 > 登入才有的頁 > 一般頁（管理者頁維持一般樣式）
      tier: route.meta?.stock ? ('stock' as const) : route.meta?.auth ? ('member' as const) : ('public' as const),
      admin: route.meta?.role === 'admin',
      // 會員選單的分類（塔羅／雷諾曼／股市），沒寫的放「其他頁面」
      group: route.meta?.menuGroup as MenuRoute['group'],
    })),
)
// 會員選單裡的頁面：「占卜」固定在頂欄，帳號設定在選單底部，其他都收進選單（v26 計畫 3）
// 順序照 meta.menuOrder（getRoutes() 會依路徑重新排序，不是宣告的順序），沒寫的排在後面
const menuRoutes = computed(() =>
  navRoutes.value
    .filter((r) => r.name !== 'home' && r.name !== 'account')
    .sort((a, b) => (menuOrderOf(a.name) ?? 99) - (menuOrderOf(b.name) ?? 99)),
)
function menuOrderOf(name: string) {
  return router.getRoutes().find((r) => r.name === name)?.meta?.menuOrder as number | undefined
}

function signOut() {
  logout()
  router.push('/')
}

// ---- 每日一牌（2026-11-20 使用者要求）----
// 每天第一次打開網站時跳出彈窗（訪客與會員都會，關掉就不再跳）；會員今天已經抽過（例如在別的裝置）就不跳。
// 登入、註冊、重設密碼這類頁面（meta.guest／hidden）先不跳，等使用者離開那些頁面再跳。
// 登入或註冊後，把訪客今天抽的牌存進月曆；todayStatus 給頂欄的小點與月曆提醒
const dailyOpen = ref(false)

async function refreshTodayStatus() {
  if (!isLoggedIn.value) {
    todayStatus.value = 'unknown'
    return null
  }
  try {
    await claimGuestCardIfAny()
    const result = await fetchTodayDailyCard()
    todayStatus.value = result.dailyCard ? 'drawn' : 'pending'
    return result
  } catch {
    return null
  }
}

let checkingDaily = false
async function maybePromptDaily() {
  if (dailyOpen.value || checkingDaily || route.meta?.guest || route.meta?.hidden) return
  const today = taipeiToday()
  if (promptedToday(today)) return
  checkingDaily = true
  try {
    if (isLoggedIn.value) {
      const result = await refreshTodayStatus()
      // 查不到就這次不跳，下次換頁再試；今天已經抽過就不跳
      if (!result) return
      if (result.dailyCard) {
        markPrompted(today)
        return
      }
    } else if (guestCardToday(today)) {
      markPrompted(today)
      return
    }
    markPrompted(today)
    dailyOpen.value = true
  } finally {
    checkingDaily = false
  }
}

router.isReady().then(() => {
  void maybePromptDaily()
  watch(() => route.name, () => void maybePromptDaily())
  // 登入、註冊後（含彈窗裡按「登入」回來）：存訪客抽的牌、更新今天抽了沒；登出就清掉
  watch(isLoggedIn, () => void refreshTodayStatus(), { immediate: true })
})
</script>

<template>
	<!-- 兩列格線：top bar 依內容高度，主內容撐滿剩下的畫面，頁面可以用 min-h-full 做滿版 -->
	<!-- 全站都有像素世界（PixelWorld）墊在後面，外層不上底色才看得到 -->
	<div class="grid min-h-screen grid-rows-[auto_1fr] text-ink">
		<PixelWorld :scene="scene" :dim="sceneDim" />
		<!-- 頁首半透明、貼著夜景：白天也用黑夜的顏色（on-scene）。白天的米白 85% 疊在深藍夜景上會混成灰米色（2026-11-08 使用者回報） -->
		<header class="on-scene relative border-b-2 border-frame bg-surface/85">
			<div class="mx-auto flex min-w-0 items-center justify-between gap-4 px-5 py-3">
				<div class="min-w-0 leading-tight">
					<!-- 網站名稱 Tarot Bar、標語「小酌一杯，抽一張牌」（v24 第六節，2026-11-17 使用者決定） -->
					<p class="text-[10px] tracking-[0.3em] text-accent">小酌一杯，抽一張牌</p>
					<p class="font-pixel text-[12px] text-ink">Tarot Bar</p>
					<p class="truncate text-[11px] text-ink-muted sm:text-xs">{{ healthLabel }}</p>
				</div>

				<!-- 會員選單（v26 計畫 3）：頂欄只留「占卜」與會員頭像，其他頁面收進頭像的選單；手機也一樣（拿掉漢堡） -->
				<nav class="flex shrink-0 items-center gap-3 sm:gap-4" aria-label="主要">
					<!-- 能用雷諾曼的人：「占卜」是選單（塔羅／雷諾曼）；其他人（含訪客）維持單一連結，不給只有一個選項的選單 -->
					<DivinationMenu v-if="canUseLenormand" />
					<router-link v-else to="/" class="font-pixel text-[12px] transition" :class="navClass('home')">占卜</router-link>
					<!-- 通知鈴鐺（v26 計畫 5）在頭像左邊 -->
					<NotificationBell v-if="isLoggedIn" :wide="isDesktop" />
					<MemberMenu v-if="isLoggedIn" :routes="menuRoutes" :wide="isDesktop" @sign-out="signOut" />
					<template v-else>
						<!-- 未登入：管理者自訂的公開頁面在桌機照樣排在頂欄 -->
						<template v-if="isDesktop">
							<router-link v-for="r in menuRoutes" :key="r.name" :to="r.path" class="font-pixel text-[12px] transition" :class="navClass(r.name)">{{ r.label }}</router-link>
						</template>
						<router-link to="/login" class="font-pixel text-[12px] transition" :class="navClass('login')">登入</router-link>
						<router-link to="/register" class="border-2 border-accent-hue/40 bg-accent-hue/10 px-3 py-1 text-center font-pixel text-[14px] text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px]">註冊</router-link>
					</template>
				</nav>
			</div>
		</header>

		<!--
			右上的浮動選單（像素水晶球）：切換日夜模式、牌面風格；在結果頁還能跳到各段落。
			原本這裡是單純的牌面開關，收進選單裡
		-->
		<FloatingMenu :cards="showCardStyle" />

		<!-- 每日一牌：每天第一次打開網站時跳出 -->
		<DailyCardDialog v-if="dailyOpen" :logged-in="isLoggedIn" @close="dailyOpen = false" />

		<!-- 過場中先隱形（版面照占位，淡入時不會跳動），播完再用 0.3 秒淡入 -->
		<main
			class="mx-auto w-full min-w-0 px-4 py-3 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:p-5"
			:class="[contentHidden ? 'invisible opacity-0' : 'opacity-100', route.meta?.wide ? 'max-w-[1600px]' : 'max-w-7xl']"
		>
			<router-view />
		</main>

		<!-- 價位提醒到價：固定在右下角，按掉才消失 -->
		<div v-if="triggeredAlerts.length" class="fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="assertive">
			<div
				v-for="alert in triggeredAlerts"
				:key="alert.id"
				class="border-2 border-accent-hue/50 bg-surface p-3 shadow-[0_6px_0_var(--c-shade)]"
			>
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm font-semibold text-accent">
						{{ alert.target.name }} {{ alertTitle(alert) }}
					</p>
					<button type="button" class="cursor-pointer text-ink-muted hover:text-ink" aria-label="關閉提醒" @click="dismissTriggered(alert.id)">✕</button>
				</div>
				<p class="mt-1 text-xs text-ink-muted">{{ alertDetail(alert) }}</p>
				<router-link to="/market" class="mt-2 inline-block font-pixel text-[12px] text-warn hover:underline" @click="dismissTriggered(alert.id)">
					到股市追蹤看看
				</router-link>
			</div>
		</div>

		<!-- 全站共用的確認彈窗（lib/confirm.ts 的 confirmDialog）：有待確認的事才掛上 -->
		<ConfirmDialog v-if="confirmState" />
	</div>
</template>

<style scoped></style>
