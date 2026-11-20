// npm test：跑 vitest，但先把 Windows 的磁碟代號轉成大寫（2026-11-20）。
// 工作目錄是小寫的 d:\…（VS Code 工作區、Claude Code 的 hook 都是）時，vitest 4 會把自己載入兩份，
// 每個測試檔都在 describe 那行丟「Cannot read properties of undefined (reading 'config')」；大寫 D:\ 就正常。
// 其他平台不受影響，原樣執行。
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const cwd = process.cwd().replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`)
const result = spawnSync(process.execPath, [join(cwd, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
