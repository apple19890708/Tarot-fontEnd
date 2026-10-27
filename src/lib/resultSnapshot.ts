// 占卜結果的暫存（sessionStorage）。占卜頁用它在登入來回、重新整理時還原結果；
// 登出時也要清掉，下一個人不該看到上一個人的牌。
export const RESULT_SNAPSHOT_KEY = 'tarot_result_snapshot'

export function clearResultSnapshot() {
  try {
    sessionStorage.removeItem(RESULT_SNAPSHOT_KEY)
  } catch {
    // 無痕視窗或封鎖儲存時會丟例外，本來就沒有東西可清
  }
}
