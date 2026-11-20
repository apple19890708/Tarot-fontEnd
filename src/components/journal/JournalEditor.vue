<script setup lang="ts">
// 占卜日記的編輯器（Tiptap 3，v26 計畫 2）：Notion 的手感，參考 Tiptap 的 Notion 範本（2026-11-20 使用者提供截圖）。
// - 空白時提示「輸入 / 叫出選單」；打 / 跳出分組的區塊選單（方向鍵選、Enter 確定、Esc 關，後面打字可以篩選）
// - 每一段左邊：「+」在下面開新的一行並叫出選單；「⠿」把手可以拖曳（桌機），點一下開選單：
//   轉換成（內文、標題、清單、待辦、引用）、複製一份、複製文字、往上移、往下移、刪除
// - Markdown 快捷鍵：# 標題、- 清單、1. 編號、[ ] 待辦、> 引用
// - 選取文字時出現小工具列：粗體、斜體、刪除線、標示
// 官方的拖曳把手擴充會連帶要求多人共編的套件（yjs），所以把手自己做
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  BLOCK_TYPES,
  deleteTopBlock,
  duplicateTopBlock,
  focusTopBlock,
  insertSlashBelow,
  journalExtensions,
  moveTopBlock,
  topBlock,
  topBlockIndexAt,
  turnTopBlockInto,
  type BlockType,
  type SlashItem,
  type SlashState,
} from '../../lib/journalEditor'
import type { JournalContent } from '../../types'

const props = defineProps<{ modelValue: JournalContent; ariaLabel?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: JournalContent] }>()

const slash = reactive<SlashState>({ open: false, items: [], index: 0, rect: null, select: () => {} })

const editor = useEditor({
  content: props.modelValue,
  extensions: journalExtensions({ placeholder: '輸入 / 叫出選單', slash }),
  editorProps: {
    attributes: {
      class: 'journal-prose min-h-[12rem] py-2 pr-1 text-body text-ink outline-none',
      'aria-label': props.ariaLabel ?? '日記內容',
      role: 'textbox',
      'aria-multiline': 'true',
    },
  },
  // 一打開就有一段的把手（原本要先滑過或點進去才出現，使用者以為點了沒反應）
  onCreate: () => void nextTick(() => setActive(0)),
  onUpdate: ({ editor: current }) => {
    emit('update:modelValue', current.getJSON() as JournalContent)
    // 內容變了，把手跟著這一段的新位置
    void nextTick(() => active.value && setActive(Math.min(active.value.index, current.state.doc.childCount - 1)))
  },
  onSelectionUpdate: ({ editor: current }) => {
    if (!hovering.value && !menuOpen.value) setActive(topBlockIndexAt(current.state.doc, current.state.selection.from))
  },
})

// 外面換了內容（例如載入草稿、改編另一篇）才同步進來；自己打字造成的不重設，游標才不會跳
watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value
    if (!current || JSON.stringify(current.getJSON()) === JSON.stringify(value)) return
    current.commands.setContent(value, { emitUpdate: false })
    void nextTick(() => setActive(0))
  },
)

// ---- 每一段左邊的「+」與把手 ----
const hovering = ref(false)
const active = ref<{ index: number; top: number } | null>(null)
const menuOpen = ref(false)
const turnIntoOpen = ref(false)
const copied = ref(false)

function blockElement(index: number) {
  return (editor.value?.view.dom.children[index] as HTMLElement | undefined) ?? null
}

function setActive(index: number) {
  const el = blockElement(index)
  active.value = el ? { index, top: el.offsetTop } : null
}

function onPointerMove(event: PointerEvent) {
  if (menuOpen.value || !editor.value) return
  hovering.value = true
  const children = [...editor.value.view.dom.children] as HTMLElement[]
  const index = children.findIndex((el) => {
    const rect = el.getBoundingClientRect()
    return event.clientY >= rect.top - 4 && event.clientY <= rect.bottom + 4
  })
  if (index >= 0) setActive(index)
}

// 這一段是什麼類型（把手選單的「轉換成」打勾用）
const activeNodeName = computed(() => {
  if (!editor.value || !active.value) return ''
  return topBlock(editor.value.state.doc, active.value.index)?.node.type.name ?? ''
})
const canTurnInto = computed(() => activeNodeName.value !== 'horizontalRule')
const currentTypeKey = ref('')

function openMenu() {
  const current = editor.value
  if (!current || !active.value) return
  if (menuOpen.value) {
    closeMenu()
    return
  }
  // 先把游標放進這一段，「轉換成」才知道目前是哪一種
  if (canTurnInto.value && focusTopBlock(current, active.value.index)) {
    currentTypeKey.value = BLOCK_TYPES.find((type) => type.isActive(current))?.key ?? ''
  } else {
    currentTypeKey.value = ''
  }
  menuOpen.value = true
  turnIntoOpen.value = false
  copied.value = false
}

function closeMenu() {
  menuOpen.value = false
  turnIntoOpen.value = false
}

function after(index: number | null) {
  closeMenu()
  if (index !== null) void nextTick(() => setActive(index))
}

function turnInto(type: BlockType) {
  const current = editor.value
  if (!current || !active.value) return
  const index = active.value.index
  turnTopBlockInto(current, index, type)
  after(index)
}

function duplicate() {
  if (!editor.value || !active.value) return
  after(duplicateTopBlock(editor.value, active.value.index))
}

async function copyText() {
  const current = editor.value
  if (!current || !active.value) return
  const block = topBlock(current.state.doc, active.value.index)
  try {
    await navigator.clipboard.writeText(block?.node.textContent ?? '')
    copied.value = true
    setTimeout(closeMenu, 700)
  } catch {
    // 瀏覽器不給寫剪貼簿（非 https、權限）：選起這一段讓使用者自己複製
    if (block) current.view.dispatch(current.state.tr.setSelection(NodeSelection.create(current.state.doc, block.pos)))
    closeMenu()
  }
}

function move(direction: -1 | 1) {
  if (!editor.value || !active.value) return
  after(moveTopBlock(editor.value, active.value.index, direction))
}

function removeBlock() {
  const current = editor.value
  if (!current || !active.value) return
  const index = active.value.index
  deleteTopBlock(current, index)
  after(Math.min(index, current.state.doc.childCount - 1))
}

function addBelow() {
  if (!editor.value || !active.value) return
  closeMenu()
  insertSlashBelow(editor.value, active.value.index)
}

// 桌機拖曳：選起整個區塊交給 ProseMirror 的拖放（StarterKit 的 dropcursor 會畫出放下的位置）
function onDragStart(event: DragEvent) {
  const current = editor.value
  if (!current || !active.value || !event.dataTransfer) return
  const block = topBlock(current.state.doc, active.value.index)
  if (!block) return
  const view = current.view
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.pos)))
  const slice = view.state.selection.content()
  ;(view as unknown as { dragging: { slice: typeof slice; move: boolean } | null }).dragging = { slice, move: true }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', block.node.textContent)
  const el = blockElement(active.value.index)
  if (el) event.dataTransfer.setDragImage(el, 0, 0)
  closeMenu()
}

// 把手選單：點外面、按 Esc 關（Esc 只關這一層，不連外面的彈窗一起關）
function onDocumentPointerDown(event: PointerEvent) {
  if (menuOpen.value && !(event.target as HTMLElement).closest('[data-block-controls]')) closeMenu()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) {
    event.stopPropagation()
    closeMenu()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onKeydown, true)
})

// ---- 斜線選單：分組、游標下方，不超出畫面 ----
const MENU_WIDTH = 256
function slashStyle() {
  const rect = slash.rect
  if (!rect) return {}
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
  const below = rect.bottom + 6
  // 下面放不下就放上面
  const top = below + 340 > window.innerHeight ? Math.max(8, rect.top - 346) : below
  return { left: `${left}px`, top: `${top}px`, width: `${MENU_WIDTH}px` }
}
// 依分組排好，每組第一個前面放組名
const slashRows = computed(() =>
  slash.items.map((item, index) => ({ item, index, groupTitle: index === 0 || slash.items[index - 1]!.group !== item.group ? item.group : '' })),
)
function pickSlash(item: SlashItem) {
  slash.select(item)
}

const markButtons = [
  { mark: 'bold', label: '粗體', text: 'B', cls: 'font-bold', run: () => editor.value?.chain().focus().toggleBold().run() },
  { mark: 'italic', label: '斜體', text: 'I', cls: 'italic', run: () => editor.value?.chain().focus().toggleItalic().run() },
  { mark: 'strike', label: '刪除線', text: 'S', cls: 'line-through', run: () => editor.value?.chain().focus().toggleStrike().run() },
  { mark: 'highlight', label: '標示', text: '標示', cls: '', run: () => editor.value?.chain().focus().toggleHighlight().run() },
]

const MENU_ITEM = 'flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-button transition hover:bg-tint/10 active:bg-tint/15 disabled:cursor-not-allowed disabled:opacity-40'
const ICON = 'inline-flex w-6 shrink-0 justify-center text-caption text-ink-muted'
</script>

<template>
  <div class="relative flex flex-col pl-14" @pointermove="onPointerMove" @pointerleave="hovering = false">
    <!-- 每一段左邊：+ 與把手 -->
    <div v-if="editor && active" data-block-controls class="absolute left-0 z-10 flex items-start gap-0.5" :style="{ top: `${active.top}px` }">
      <button
        type="button"
        class="flex h-7 w-6 cursor-pointer items-center justify-center text-subtitle leading-none text-ink-muted transition hover:bg-tint/10 hover:text-ink active:bg-tint/15"
        aria-label="在下面新增一段"
        title="在下面新增一段"
        @click="addBelow"
      >
        +
      </button>
      <button
        type="button"
        draggable="true"
        class="flex h-7 w-6 cursor-grab items-center justify-center text-ink-muted transition hover:bg-tint/10 hover:text-ink active:cursor-grabbing active:bg-tint/15"
        :class="menuOpen ? 'bg-tint/15 text-ink' : ''"
        aria-label="這一段的選單（也可以拖曳移動）"
        title="點一下開選單，按住拖曳移動"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @dragstart="onDragStart"
        @click="openMenu"
      >
        <span aria-hidden="true" class="grid grid-cols-2 gap-[3px]">
          <span v-for="n in 6" :key="n" class="h-[3px] w-[3px] bg-current" />
        </span>
      </button>

      <!-- 把手選單 -->
      <div v-if="menuOpen" class="absolute left-14 top-0 z-20 w-56 border-2 border-frame bg-surface py-1 shadow-[4px_4px_0_var(--c-shade)]" role="menu" aria-label="這一段">
        <template v-if="canTurnInto">
          <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-ink-soft']" :aria-expanded="turnIntoOpen" @click="turnIntoOpen = !turnIntoOpen">
            <span :class="ICON">⇄</span>
            <span class="flex-1">轉換成</span>
            <span class="text-caption text-ink-muted transition" :class="turnIntoOpen ? 'rotate-90' : ''" aria-hidden="true">›</span>
          </button>
          <div v-if="turnIntoOpen" class="border-y border-line bg-sink/10 py-1" role="group" aria-label="轉換成">
            <button
              v-for="type in BLOCK_TYPES"
              :key="type.key"
              type="button"
              role="menuitemradio"
              :aria-checked="currentTypeKey === type.key"
              :class="[MENU_ITEM, 'pl-6', currentTypeKey === type.key ? 'text-ink' : 'text-ink-soft']"
              @click="turnInto(type)"
            >
              <span :class="ICON">{{ type.icon }}</span>
              <span class="flex-1">{{ type.label }}</span>
              <span v-if="currentTypeKey === type.key" class="text-caption text-accent" aria-hidden="true">✓</span>
            </button>
          </div>
          <div class="my-1 border-t border-line" />
        </template>
        <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-ink-soft']" @click="duplicate">
          <span :class="ICON">⧉</span><span class="flex-1">複製一份</span>
        </button>
        <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-ink-soft']" @click="copyText">
          <span :class="ICON">⎘</span><span class="flex-1">{{ copied ? '已複製文字' : '複製文字' }}</span>
        </button>
        <div class="my-1 border-t border-line" />
        <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-ink-soft']" :disabled="active.index === 0" @click="move(-1)">
          <span :class="ICON">↑</span><span class="flex-1">往上移</span>
        </button>
        <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-ink-soft']" :disabled="active.index >= editor.state.doc.childCount - 1" @click="move(1)">
          <span :class="ICON">↓</span><span class="flex-1">往下移</span>
        </button>
        <div class="my-1 border-t border-line" />
        <button type="button" role="menuitem" :class="[MENU_ITEM, 'text-danger hover:bg-danger-hue/10']" @click="removeBlock">
          <span :class="[ICON, 'text-danger']">✕</span><span class="flex-1">刪除這段</span>
        </button>
      </div>
    </div>

    <!-- 編輯區撐滿外框（日記頁滿版時），點空白處也能開始打字 -->
    <EditorContent :editor="editor" class="flex flex-1 flex-col [&>.ProseMirror]:flex-1" @click.self="editor?.commands.focus('end')" />

    <!-- 選取文字時的小工具列 -->
    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :should-show="({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection)"
      class="flex border-2 border-frame bg-surface shadow-[4px_4px_0_var(--c-shade)]"
    >
      <button
        v-for="item in markButtons"
        :key="item.mark"
        type="button"
        class="h-8 min-w-8 cursor-pointer px-2 text-button transition hover:bg-tint/10 active:bg-tint/15"
        :class="[item.cls, editor.isActive(item.mark) ? 'bg-selected text-on-selected' : 'text-ink-soft']"
        :aria-label="item.label"
        :aria-pressed="editor.isActive(item.mark)"
        @click="item.run"
      >
        {{ item.text }}
      </button>
    </BubbleMenu>

    <!-- 斜線選單（分組） -->
    <Teleport to="body">
      <div
        v-if="slash.open && slash.rect"
        class="fixed z-[70] max-h-[21rem] overflow-y-auto border-2 border-frame bg-surface py-1 shadow-[4px_4px_0_var(--c-shade)]"
        :style="slashStyle()"
      >
        <ul role="listbox" aria-label="插入區塊">
          <li v-for="row in slashRows" :key="row.item.key" role="option" :aria-selected="row.index === slash.index">
            <p v-if="row.groupTitle" class="px-3 pb-1 pt-2 text-caption font-semibold text-ink-muted" :class="row.index > 0 ? 'mt-1 border-t border-line' : ''">{{ row.groupTitle }}</p>
            <button
              type="button"
              :class="[MENU_ITEM, row.index === slash.index ? 'bg-tint/10 text-ink' : 'text-ink-soft']"
              @mousedown.prevent
              @mouseenter="slash.index = row.index"
              @click="pickSlash(row.item)"
            >
              <span :class="ICON">{{ row.item.icon }}</span>
              <span class="flex-1 text-body">{{ row.item.label }}</span>
              <span v-if="row.item.hint" class="text-caption text-ink-muted">{{ row.item.hint }}</span>
            </button>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>
