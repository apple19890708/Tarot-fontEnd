<script setup lang="ts">
import { ref } from 'vue'
import { confirmDialog } from '../../lib/confirm'

import { createWatchGroup, deleteWatchGroup, renameWatchGroup, reorderWatchGroups } from '../../lib/api'
import type { MarketWatchGroup } from '../../types'

// 管理自選清單：新增、改名、調整順序、刪除（刪除時只從各檔拿掉這個清單，一檔可以同時在好幾個清單）
const props = defineProps<{ groups: MarketWatchGroup[] }>()
const emit = defineEmits<{ changed: [groups: MarketWatchGroup[]]; removed: [id: string] }>()

const MAX_GROUPS = 10
const newName = ref('')
const editingId = ref('')
const editName = ref('')
const busy = ref(false)
const error = ref('')

async function run(task: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try {
    await task()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失敗'
  } finally {
    busy.value = false
  }
}

function add() {
  const name = newName.value.trim()
  if (!name) return
  void run(async () => {
    const { group } = await createWatchGroup(name)
    emit('changed', [...props.groups, group])
    newName.value = ''
  })
}

function startRename(group: MarketWatchGroup) {
  editingId.value = group.id
  editName.value = group.name
}

function saveRename(group: MarketWatchGroup) {
  const name = editName.value.trim()
  if (!name || name === group.name) {
    editingId.value = ''
    return
  }
  void run(async () => {
    const { group: updated } = await renameWatchGroup(group.id, name)
    emit('changed', props.groups.map((g) => (g.id === updated.id ? updated : g)))
    editingId.value = ''
  })
}

function move(index: number, delta: number) {
  const next = [...props.groups]
  const [moved] = next.splice(index, 1)
  if (!moved) return
  next.splice(index + delta, 0, moved)
  void run(async () => {
    const { groups } = await reorderWatchGroups(next.map((g) => g.id))
    emit('changed', groups)
  })
}

async function remove(group: MarketWatchGroup) {
  const ok = await confirmDialog({
    title: '刪除清單',
    message: `刪除清單「${group.name}」？
股票不會被刪掉，只是從這個清單拿掉；沒有放在其他清單的會變成「未分類」。`,
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  void run(async () => {
    const { groups } = await deleteWatchGroup(group.id)
    emit('changed', groups)
    emit('removed', group.id)
  })
}

const SMALL = 'cursor-pointer border border-tint/15 px-1.5 py-0.5 text-caption text-ink-muted transition hover:bg-tint/10 disabled:opacity-40'
</script>

<template>
  <div class="space-y-2 text-body">
    <ul v-if="groups.length" class="space-y-1">
      <li v-for="(group, index) in groups" :key="group.id" class="flex flex-wrap items-center gap-2">
        <template v-if="editingId === group.id">
          <input
            v-model="editName"
            maxlength="20"
            class="min-w-0 flex-[1_1_8rem] border-2 border-tint/10 bg-tint/5 px-2 py-1 text-body text-ink outline-none focus:border-accent-hue/40"
            :aria-label="`清單「${group.name}」的新名稱`"
            @keydown.enter.prevent="saveRename(group)"
            @keydown.esc="editingId = ''"
          />
          <button type="button" :class="SMALL" :disabled="busy" @click="saveRename(group)">儲存</button>
          <button type="button" :class="SMALL" @click="editingId = ''">取消</button>
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 truncate text-ink">{{ group.name }}</span>
          <button type="button" :class="SMALL" :disabled="busy || index === 0" :aria-label="`把「${group.name}」往前移`" @click="move(index, -1)">↑</button>
          <button type="button" :class="SMALL" :disabled="busy || index === groups.length - 1" :aria-label="`把「${group.name}」往後移`" @click="move(index, 1)">↓</button>
          <button type="button" :class="SMALL" :disabled="busy" @click="startRename(group)">改名</button>
          <button type="button" :class="SMALL" :disabled="busy" @click="remove(group)">刪除</button>
        </template>
      </li>
    </ul>
    <p v-else class="text-ink-muted">還沒有清單。新增後，加入股票時可以選放進哪個清單，展開卡片也可以「移到清單」。</p>

    <form v-if="groups.length < MAX_GROUPS" class="flex flex-wrap gap-2" @submit.prevent="add">
      <input
        v-model="newName"
        maxlength="20"
        class="min-w-0 flex-[1_1_10rem] border-2 border-tint/10 bg-tint/5 px-2 py-1 text-body text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40"
        placeholder="新清單名稱（例如 長期存股）"
        aria-label="新清單名稱"
      />
      <button type="submit" class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-3 py-1 text-button text-accent transition hover:bg-accent-hue/25 disabled:opacity-60 font-pixel" :disabled="busy || !newName.trim()">
        新增清單
      </button>
    </form>
    <p v-else class="text-ink-muted">清單最多 {{ MAX_GROUPS }} 個。</p>
    <p v-if="error" class="text-danger">{{ error }}</p>
  </div>
</template>
