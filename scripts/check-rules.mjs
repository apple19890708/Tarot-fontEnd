#!/usr/bin/env node
// 專案規則檢查：把 ui-check／verify 裡「能用程式判斷」的規則自動跑一遍。
//
// 只檢查「這次新增或改動的行」：舊程式還有很多舊寫法（text-xs、text-stone-400…），
// 規則是「改到哪一塊就順手換」，所以不追溯沒動到的行。
//
//   node scripts/check-rules.mjs                 本機：工作區（含未追蹤的新檔）對 HEAD 的改動
//   node scripts/check-rules.mjs --base <ref>    CI：對 <ref> 之後的改動（ref 無效時退回 HEAD~1）
//   node scripts/check-rules.mjs --all           稽核：掃整個 src，只列各規則的命中數（不擋）
//
// 例外：同一行寫 check-rules-ignore，或上一行寫 check-rules-ignore-next-line（都要附原因），
// 例如純裝飾符號（牌背 ✦、空牌位）要用 /50 透明度。
// 新增規則：照 RULES 的格式加一條，message 寫清楚「改用什麼」，並附上當初出問題的例子。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SCAN = /^src\/.*\.(vue|ts)$/
const IGNORE_MARK = 'check-rules-ignore'
const WASHI = new Set(['f1e7cf', 'e9dcc0', 'f6eedb', 'e6dac0', 'efe6d2', '2a1a14', 'a8322a', 'bf3d33', '3d5a80', '3d6b2e', '2f6b3a', 'b45309'])

const RULES = [
  {
    id: 'dim-text',
    level: 'error',
    pattern: /(?<![\w-])(?:[\w-]+:)*text-[a-z][\w-]*\/(\d{1,2})(?![\w])/g,
    when: (m) => Number(m[1]) <= 80,
    message: '文字色不加 /80 以下的透明度（白天對比只剩 3～4:1）。最淡用 text-ink-muted，要區分就換顏色。',
  },
  {
    id: 'dim-gray',
    level: 'error',
    pattern: /(?<![\w-])(?:[\w-]+:)*text-stone-(?:400|500|600|700)\b/g,
    message: '不要用暗灰色字；改用語意色 text-ink-muted／text-ink-soft。',
  },
  {
    id: 'font-size',
    level: 'error',
    pattern: /(?<![\w-])(?:[\w-]+:)*text-(?:xs|sm|base|lg|[2-9]?xl|\[\d+(?:\.\d+)?(?:px|rem|em)\])(?![\w-])/g,
    skipLine: (line) => line.includes('font-pixel'),
    message: '字級用語意 class：text-display／title／subtitle／body／caption／button（像素字 font-pixel 例外）。',
  },
  {
    id: 'legacy-color',
    level: 'error',
    pattern:
      /(?<![\w-])(?:[\w-]+:)*(?:(?:bg|text|border|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\]|(?:bg|border)-(?:white|black)\/\d+|(?:text|bg|border)-(?:stone|amber|rose|emerald|sky|slate|zinc|neutral|gray|red|green|yellow|orange|teal|cyan|indigo|violet|purple|pink|lime|blue)-\d{2,3}(?:\/\d+)?)(?![\w-])/g,
    // 刻意固定色、不分日夜的地方：管理頁（像素＋和紙）、像素夜景（扇形牌堆、飛牌、背景、回到頂端）
    exempt: [
      'src/pages/AdminUsers.vue',
      'src/components/AdminUserDialog.vue',
      'src/components/FanDeck.vue',
      'src/components/FlyingCard.vue',
      'src/components/PixelWorld.vue',
      'src/components/BackToTop.vue',
    ],
    // 和紙色票（我的紀錄、紙主題，兩種模式都一樣）可以直接寫
    when: (m) => !/text-stone-(?:400|500|600|700)\b/.test(m[0]) && !WASHI.has((/#([0-9a-fA-F]{3,8})/.exec(m[0])?.[1] ?? '').toLowerCase()),
    message: '顏色用語意色（bg-surface、border-line、text-ink、text-accent、bg-tint/5、border-accent-hue/40…），日夜模式才會跟著換。見 ui-check 第 0 節。',
  },
  {
    id: 'native-select',
    level: 'error',
    files: /\.vue$/,
    pattern: /<select[\s>]/g,
    exempt: ['src/components/SelectField.vue'],
    message: '下拉選單用 SelectField.vue（原生 select 的清單由作業系統畫，深底深字看不見）。',
  },
  {
    id: 'raw-table',
    level: 'error',
    files: /\.vue$/,
    pattern: /<table[\s>]/g,
    exempt: ['src/components/DataTable.vue', 'src/pages/AdminUsers.vue'],
    message: '表格用 DataTable.vue（全部靠左、第一欄固定、樣式統一）。',
  },
  {
    id: 'native-confirm',
    level: 'error',
    pattern: /(?<![\w.$])(?:window\.)?confirm\s*\(/g,
    message: '刪除確認用 src/lib/confirm.ts 的 await confirmDialog({ … , danger: true })，不要用 window.confirm。',
  },
  {
    id: 'native-smooth-scroll',
    level: 'error',
    pattern: /scrollTo\s*\(\s*\{[^}]*behavior\s*:\s*['"]smooth/g,
    exempt: ['src/lib/motion.ts'],
    message: '整頁捲動用 src/lib/motion.ts 的 smoothScrollTo(top)（原生平滑捲動在長頁面幾乎瞬間到頂）。',
  },
  {
    id: 'direct-marked',
    level: 'error',
    pattern: /from\s+['"]marked['"]/g,
    exempt: ['src/lib/aiMarkdown.ts'],
    message: 'AI 的 Markdown 用 src/lib/aiMarkdown.ts 的 renderAiMarkdown（處理中文粗體、表格上色）。',
  },
  {
    id: 'native-checkbox-accent',
    level: 'error',
    pattern: /(?<![\w-])accent-(?:amber|rose|stone|emerald)-\d{2,3}/g,
    message: '勾選用 CheckboxField.vue（原生 checkbox 配 accent-* 在白天模式顏色不對）。',
  },
  {
    id: 'root-path',
    level: 'error',
    pattern: /(?:\b(?:src|href)=["']|url\(\s*['"]?|location\.href\s*=\s*['"])\/(?!\/)/g,
    message: '線上掛在 /Tarot-fontEnd/，路徑不要寫死開頭的 /；用 import.meta.env.BASE_URL 或 router。',
  },
  {
    id: 'ts-suppress',
    level: 'error',
    pattern: /@ts-(?:ignore|nocheck)\b/g,
    message: '不要用 @ts-ignore／@ts-nocheck 蓋掉型別錯誤，把型別修好。',
  },
  {
    id: 'explicit-any',
    level: 'warn',
    files: /\.(ts|vue)$/,
    pattern: /(?::\s*any\b|\bas\s+any\b|<any>)/g,
    message: '避免 any；型別跟著後端走（src/types.ts）。',
  },
  {
    // 例：v27 StepDraw 的 orientations?: boolean 用 props.orientations !== false 判斷，塔羅沒傳，
    // Vue 把沒傳的布林 prop 當成 false，塔羅的正逆位按鈕就不見了（2026-11-25 回歸測試抓到）
    id: 'boolean-prop-absent',
    level: 'error',
    files: /\.vue$/,
    pattern: /\bprops\.\w+\s*!==\s*false\b/g,
    message: '布林 prop 沒傳時 Vue 會給 false（不是 undefined），!== false 永遠擋不住；用 withDefaults 給預設值 true，直接判斷 props.xxx。',
  },
]

// ---------- 取得改動的行 ----------

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 })
  return { ok: r.status === 0, out: r.stdout ?? '' }
}

function resolveBase(ref) {
  if (ref && !/^0+$/.test(ref) && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok) return ref
  return git(['rev-parse', '--verify', '--quiet', 'HEAD~1']).ok ? 'HEAD~1' : null
}

// 回傳 Map<file, Set<lineNo>>
function changedLines(base, includeUntracked) {
  const result = new Map()
  const add = (file, n) => {
    if (!result.has(file)) result.set(file, new Set())
    result.get(file).add(n)
  }
  const diff = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', base, '--', 'src']).out
  let file = null
  let n = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice(6)
    } else if (line.startsWith('@@')) {
      n = Number(/\+(\d+)/.exec(line)?.[1] ?? 0)
    } else if (file && line.startsWith('+')) {
      add(file, n++)
    }
  }
  if (includeUntracked) {
    for (const f of git(['ls-files', '--others', '--exclude-standard', '--', 'src']).out.split('\n').filter(Boolean)) {
      const count = readFileSync(join(ROOT, f), 'utf8').split('\n').length
      for (let i = 1; i <= count; i++) add(f, i)
    }
  }
  return result
}

function allLines() {
  const result = new Map()
  for (const f of git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src']).out.split('\n').filter(Boolean)) {
    if (!existsSync(join(ROOT, f))) continue
    const count = readFileSync(join(ROOT, f), 'utf8').split('\n').length
    result.set(f, new Set(Array.from({ length: count }, (_, i) => i + 1)))
  }
  return result
}

// 比對基準與目前的 dependencies／devDependencies（scripts 之類的變動不算）
function packageWarnings(base, useWorkingTree) {
  const deps = (json) => ({ ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) })
  try {
    const before = deps(JSON.parse(git(['show', `${base}:package.json`]).out))
    const after = deps(
      JSON.parse(useWorkingTree ? readFileSync(join(ROOT, 'package.json'), 'utf8') : git(['show', 'HEAD:package.json']).out),
    )
    const changes = []
    for (const [name, v] of Object.entries(after)) {
      if (!(name in before)) changes.push(`新增 ${name}@${v}`)
      else if (before[name] !== v) changes.push(`${name} ${before[name]} → ${v}`)
    }
    for (const name of Object.keys(before)) if (!(name in after)) changes.push(`移除 ${name}`)
    return changes.length ? [`套件有變動，要先經使用者同意：${changes.join('、')}`] : []
  } catch {
    return []
  }
}

// ---------- 主程式 ----------

const args = process.argv.slice(2)
const auditMode = args.includes('--all')
// 帶了 --base 就是 CI 模式；值是空的或全 0（新分支第一次推送）時退回 HEAD~1
const baseArg = args.includes('--base') ? (args[args.indexOf('--base') + 1] ?? '') : null
const base = baseArg !== null ? resolveBase(baseArg) : 'HEAD'

if (!auditMode && !base) {
  console.log('check-rules：找不到可比較的基準（第一個 commit？），略過。')
  process.exit(0)
}

const targets = auditMode ? allLines() : changedLines(base, baseArg === null)
const findings = []

for (const [file, lineNos] of targets) {
  if (!SCAN.test(file) || !existsSync(join(ROOT, file))) continue
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
  for (const n of [...lineNos].sort((a, b) => a - b)) {
    const text = lines[n - 1]
    if (text == null) continue
    if (text.includes(IGNORE_MARK) || (lines[n - 2] ?? '').includes(`${IGNORE_MARK}-next-line`)) continue
    for (const rule of RULES) {
      if (rule.files && !rule.files.test(file)) continue
      if (rule.exempt?.includes(file)) continue
      if (rule.skipLine?.(text)) continue
      for (const m of text.matchAll(rule.pattern)) {
        if (rule.when && !rule.when(m)) continue
        findings.push({ rule, file, line: n, hit: m[0].trim() })
      }
    }
  }
}

if (auditMode) {
  const counts = new Map()
  for (const f of findings) counts.set(f.rule.id, (counts.get(f.rule.id) ?? 0) + 1)
  console.log('整個 src 的命中數（舊程式，改到時順手換）：')
  for (const rule of RULES) console.log(`  ${rule.id.padEnd(24)} ${counts.get(rule.id) ?? 0}`)
  if (args.includes('--verbose')) for (const f of findings) console.log(`${f.rule.id}\t${f.file}:${f.line}\t${f.hit}`)
  process.exit(0)
}

const errors = findings.filter((f) => f.rule.level === 'error')
const warns = findings.filter((f) => f.rule.level === 'warn')
const pkgWarns = packageWarnings(base, baseArg === null)

function print(list) {
  const byRule = new Map()
  for (const f of list) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, [])
    byRule.get(f.rule).push(f)
  }
  for (const [rule, items] of byRule) {
    console.log(`\n[${rule.id}] ${rule.message}`)
    for (const f of items) console.log(`  ${f.file}:${f.line}  ${f.hit}`)
  }
}

if (warns.length || pkgWarns.length) {
  console.log('⚠ 提醒（不擋）：')
  print(warns)
  for (const w of pkgWarns) console.log(`\n[package] ${w}`)
}
if (errors.length) {
  console.log(`\n✘ 規則檢查沒過（${errors.length} 處，只看這次改動的行）：`)
  print(errors)
  console.log(`\n真的需要例外時，同一行加註解 ${IGNORE_MARK}，或上一行加 ${IGNORE_MARK}-next-line（附原因）。`)
  process.exit(1)
}
console.log(`✔ 規則檢查通過（比對 ${baseArg !== null ? base : '工作區 vs HEAD'}）`)
