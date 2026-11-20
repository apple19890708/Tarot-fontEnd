// 占卜日記的編輯器設定（Tiptap 3，v26 計畫 2，D4）。
// 只開後端白名單收的節點與標記（services/journalContent.js）：段落、標題 1～3、項目／編號／待辦清單、引用、分隔線、
// 粗體、斜體、刪除線、標示。程式碼、連結、底線、圖片都不開，前後端兩邊要一起改。
// Notion 手感：空白時提示「輸入 / 叫出選單」、斜線選單、Markdown 快捷鍵（StarterKit 內建 # - 1. > ，待辦清單 [ ] ）
import { Extension, type ChainedCommands, type Editor } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import type { Node as PmNode } from '@tiptap/pm/model'
import { PluginKey, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Suggestion from '@tiptap/suggestion'

// 區塊類型：斜線選單的「樣式」與把手選單的「轉換成」共用（2026-11-20 使用者要求參考 Tiptap 的 Notion 範本）。
// 先 clearNodes 把目前這段還原成段落（離開清單、引用），再套新的類型
export interface BlockType {
  key: string
  label: string
  // 選單左邊的小圖示（文字）
  icon: string
  // Markdown 快捷鍵提示
  hint: string
  keywords: string[]
  apply: (chain: ChainedCommands) => ChainedCommands
  // 游標在這種區塊裡嗎（「轉換成」顯示目前是哪一種）
  isActive: (editor: Editor) => boolean
}

export const BLOCK_TYPES: BlockType[] = [
  {
    key: 'paragraph',
    label: '內文',
    icon: 'T',
    hint: '',
    keywords: ['內文', '文字', 'text', 'paragraph', 'p'],
    apply: (c) => c.clearNodes(),
    isActive: (e) => e.isActive('paragraph') && !e.isActive('bulletList') && !e.isActive('orderedList') && !e.isActive('taskList') && !e.isActive('blockquote'),
  },
  { key: 'h1', label: '大標題', icon: 'H1', hint: '#', keywords: ['標題', 'h1', 'heading', 'title'], apply: (c) => c.clearNodes().setHeading({ level: 1 }), isActive: (e) => e.isActive('heading', { level: 1 }) },
  { key: 'h2', label: '中標題', icon: 'H2', hint: '##', keywords: ['標題', 'h2', 'heading'], apply: (c) => c.clearNodes().setHeading({ level: 2 }), isActive: (e) => e.isActive('heading', { level: 2 }) },
  { key: 'h3', label: '小標題', icon: 'H3', hint: '###', keywords: ['標題', 'h3', 'heading'], apply: (c) => c.clearNodes().setHeading({ level: 3 }), isActive: (e) => e.isActive('heading', { level: 3 }) },
  { key: 'bullet', label: '項目清單', icon: '•', hint: '-', keywords: ['清單', 'list', 'bullet', 'ul'], apply: (c) => c.clearNodes().toggleBulletList(), isActive: (e) => e.isActive('bulletList') },
  { key: 'ordered', label: '編號清單', icon: '1.', hint: '1.', keywords: ['清單', '編號', 'list', 'number', 'ol'], apply: (c) => c.clearNodes().toggleOrderedList(), isActive: (e) => e.isActive('orderedList') },
  { key: 'task', label: '待辦清單', icon: '☐', hint: '[ ]', keywords: ['待辦', '清單', 'todo', 'task', 'check'], apply: (c) => c.clearNodes().toggleTaskList(), isActive: (e) => e.isActive('taskList') },
  { key: 'quote', label: '引用', icon: '❝', hint: '>', keywords: ['引用', 'quote'], apply: (c) => c.clearNodes().toggleBlockquote(), isActive: (e) => e.isActive('blockquote') },
]

export interface SlashItem {
  key: string
  // 選單裡的分組
  group: '樣式' | '插入' | '文字樣式'
  label: string
  icon: string
  hint: string
  // 打 / 後面接這些字也找得到（中英都收）
  keywords: string[]
  run: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  ...BLOCK_TYPES.map((type) => ({
    key: type.key,
    group: '樣式' as const,
    label: type.label,
    icon: type.icon,
    hint: type.hint,
    keywords: type.keywords,
    run: (e: Editor) => void type.apply(e.chain().focus()).run(),
  })),
  { key: 'divider', group: '插入', label: '分隔線', icon: '—', hint: '---', keywords: ['分隔', 'divider', 'hr', 'line'], run: (e) => e.chain().focus().setHorizontalRule().run() },
  { key: 'highlight', group: '文字樣式', label: '重點標示', icon: '✦', hint: '', keywords: ['重點', '標示', 'highlight', 'mark'], run: (e) => e.chain().focus().toggleHighlight().run() },
]

export function filterSlashItems(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) => item.label.includes(q) || item.keywords.some((word) => word.toLowerCase().startsWith(q)))
}

// 斜線選單的狀態：編輯器元件傳一個 reactive 物件進來，選單由元件自己畫
export interface SlashState {
  open: boolean
  items: SlashItem[]
  index: number
  rect: { left: number; top: number; bottom: number } | null
  select: (item: SlashItem) => void
}

function slashCommand(state: SlashState) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey('journalSlash'),
          char: '/',
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run()
            props.run(editor)
          },
          render: () => {
            const sync = (props: { items: SlashItem[]; clientRect?: (() => DOMRect | null) | null; command: (item: SlashItem) => void }) => {
              const rect = props.clientRect?.()
              state.items = props.items
              state.index = Math.min(state.index, Math.max(0, props.items.length - 1))
              state.rect = rect ? { left: rect.left, top: rect.top, bottom: rect.bottom } : null
              state.select = (item) => props.command(item)
              state.open = props.items.length > 0
            }
            return {
              onStart: (props) => {
                state.index = 0
                sync(props)
              },
              onUpdate: sync,
              onExit: () => {
                state.open = false
              },
              onKeyDown: ({ event }) => {
                if (!state.open) return false
                const count = state.items.length
                if (event.key === 'ArrowDown') state.index = (state.index + 1) % count
                else if (event.key === 'ArrowUp') state.index = (state.index - 1 + count) % count
                else if (event.key === 'Enter') state.select(state.items[state.index]!)
                else if (event.key === 'Escape') state.open = false
                else return false
                return true
              },
            }
          },
        }),
      ]
    },
  })
}

export function journalExtensions(options: { placeholder?: string; slash?: SlashState } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // 拖曳區塊時放下位置的線
      dropcursor: { color: 'var(--c-accent-hue)', width: 2 },
      code: false,
      codeBlock: false,
      link: false,
      underline: false,
    }),
    TaskList,
    // 勾選框的無障礙名稱（預設是英文）
    TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node, checked) => `${checked ? '已完成' : '待辦'}：${node.textContent || '空白的待辦'}` } }),
    Highlight,
    ...(options.placeholder ? [Placeholder.configure({ placeholder: options.placeholder })] : []),
    ...(options.slash ? [slashCommand(options.slash)] : []),
  ]
}

// ---- 區塊（最上層的段落、標題、清單…）：拖曳把手與上移／下移用 ----

// 第 index 個最上層區塊的起點位置與節點
export function topBlock(doc: PmNode, index: number) {
  if (index < 0 || index >= doc.childCount) return null
  let pos = 0
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize
  return { pos, node: doc.child(index) }
}

// 游標所在的最上層區塊是第幾個
export function topBlockIndexAt(doc: PmNode, pos: number) {
  const resolved = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size))
  return resolved.depth === 0 ? Math.min(resolved.index(0), doc.childCount - 1) : resolved.index(0)
}

// 把第 index 個區塊往上或往下移一格；回傳移動後的位置（移不動回 null）
export function moveTopBlock(editor: Editor, index: number, direction: -1 | 1) {
  const { state } = editor
  const doc = state.doc
  const target = index + direction
  const block = topBlock(doc, index)
  const neighbor = topBlock(doc, target)
  if (!block || !neighbor) return null
  const tr = state.tr.delete(block.pos, block.pos + block.node.nodeSize)
  const insertAt = direction === -1 ? neighbor.pos : block.pos + neighbor.node.nodeSize
  tr.insert(insertAt, block.node)
  editor.view.dispatch(tr.scrollIntoView())
  return target
}

export function deleteTopBlock(editor: Editor, index: number) {
  const block = topBlock(editor.state.doc, index)
  if (!block) return
  // 只剩一個區塊時清成空段落（文件不能是空的）
  if (editor.state.doc.childCount === 1) {
    editor.commands.clearContent(true)
    return
  }
  editor.view.dispatch(editor.state.tr.delete(block.pos, block.pos + block.node.nodeSize))
}

// 把游標放進第 index 個區塊（把手選單的「轉換成」要先選到那一段）
export function focusTopBlock(editor: Editor, index: number) {
  const block = topBlock(editor.state.doc, index)
  if (!block) return false
  const selection = TextSelection.near(editor.state.doc.resolve(block.pos + 1))
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  return true
}

export function turnTopBlockInto(editor: Editor, index: number, type: BlockType) {
  if (!focusTopBlock(editor, index)) return
  type.apply(editor.chain().focus()).run()
}

// 複製一份放在下面
export function duplicateTopBlock(editor: Editor, index: number) {
  const block = topBlock(editor.state.doc, index)
  if (!block) return null
  editor.view.dispatch(editor.state.tr.insert(block.pos + block.node.nodeSize, block.node.copy(block.node.content)).scrollIntoView())
  return index + 1
}

// 「+」：在這段下面開新的一行並叫出斜線選單；這段本身是空段落就直接在這裡叫
export function insertSlashBelow(editor: Editor, index: number) {
  const block = topBlock(editor.state.doc, index)
  if (!block) return
  if (block.node.type.name === 'paragraph' && block.node.content.size === 0) {
    editor.chain().focus().setTextSelection(block.pos + 1).insertContent('/').run()
    return
  }
  const at = block.pos + block.node.nodeSize
  editor.chain().focus().insertContentAt(at, { type: 'paragraph' }).setTextSelection(at + 1).insertContent('/').run()
}
