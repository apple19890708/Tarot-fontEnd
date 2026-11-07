<script setup lang="ts">
// 隱私權政策：Google OAuth 同意畫面切換成正式版時必須提供的公開網址（v17 規格 I）。
// 內容照實寫網站實際收集與使用的資料；功能有變動時要跟著改
const CONTACT = 'apple19890708@gmail.com'
const UPDATED = '2026-11-07'
</script>

<template>
  <article class="mx-auto max-w-2xl space-y-6 rounded-[1.75rem] border border-white/10 bg-[#0f1526] p-7 text-sm leading-7 text-stone-200">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold text-stone-50">隱私權政策</h1>
      <p class="text-stone-300">最後更新：{{ UPDATED }}</p>
    </header>

    <section class="space-y-2">
      <h2 class="text-base font-semibold text-amber-100">我們收集哪些資料</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li>註冊或登入時的電子郵件地址、顯示名稱；用 Google 登入時，另外記錄 Google 帳號的識別碼（不會取得你的 Google 密碼）。</li>
        <li>你自己建立的內容：占卜紀錄、股市追蹤清單、持股與交易紀錄、價位提醒、AI 分析紀錄。</li>
        <li>開啟推播通知時，瀏覽器提供的推播訂閱資訊。</li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold text-amber-100">資料怎麼使用</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li>讓你登入、保存並顯示你自己的紀錄。</li>
        <li>寄送重設密碼信：透過網站管理者的 Gmail 帳號寄出，只會寄給申請重設的那個信箱，不會用來寄廣告。</li>
        <li>你主動要求 AI 解讀或分析時，會把當次需要的內容（牌面、問題、行情資料、持股）送到 AI 服務產生文字。</li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold text-amber-100">不會做的事</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li>不販售、不出租你的個人資料給任何第三方。</li>
        <li>不讀取你 Google 帳號裡的信件、聯絡人或其他資料。</li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold text-amber-100">刪除資料與聯絡方式</h2>
      <p>
        想刪除帳號與所有紀錄，或對這份政策有疑問，請寄信到
        <a :href="`mailto:${CONTACT}`" class="text-amber-200 hover:underline">{{ CONTACT }}</a>。
      </p>
    </section>

    <p class="text-stone-300">
      <router-link to="/" class="text-amber-200 hover:underline">回首頁</router-link>
    </p>
  </article>
</template>
