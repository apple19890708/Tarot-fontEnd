// 居酒屋店內（我的紀錄）：第一人稱，坐在桌前往下看（計畫書 2.8，使用者 2026-11-03 改的方向）。
// 紀錄內容是放在桌上的和紙菜單（DOM），會蓋住畫面中間，所以桌上的東西都放在左右兩側：
// - 遠景（畫面最上緣一小段）：暖色的店內牆面、酒架剪影
// - 淺色檜木桌面（使用者選的；試過象牙白、黑漆都不喜歡）：木板接縫往遠處微微收攏，做出透視
// - 左邊：捲起來的濕毛巾、筷架上的筷子；右邊：清酒壺與小酒杯、冒熱氣的湯碗
// - 服務生的手偶爾從右邊伸進來放一小碟毛豆，過一陣子再伸手收走
// - 偶爾有服務生從桌子另一頭走過：離得很近、只看得到胸口到腰（頭在畫面外、下半身被桌緣擋住），有時托著酒壺或一道菜
import { dot, glowSprite, makeLayer, rngTools, type Ctx, type Layer, type Size } from './core'

interface Wisp { x: number; y: number; life: number; drift: number }

// 走過的服務生：小圖放大的倍數、往上提多少（讓衣領貼著畫面上緣、腰帶剛好在桌緣上方），以及從畫面外多遠走進來
const PASSER_SCALE = 2
const PASSER_LIFT = 10
const PASSER_OFF = 50
// 服務生木盤上可能端的東西：酒壺，或三種菜（烤雞肉串、生魚片、炸雞塊）
type TrayItem = 'sake' | 'yakitori' | 'sashimi' | 'karaage'
const TRAY_DISHES: TrayItem[] = ['yakitori', 'sashimi', 'karaage']

export function createInterior() {
  let W = 320
  let H = 180
  let horizon = 43
  let room: Layer
  let t = 0
  let wisps: Wisp[] = []
  let bowl = { x: 0, y: 0 }
  let cup = { x: 0, y: 0 }
  let dishSpot = { x: 0, y: 0 }
  // 服務生的手：in 伸進來、hold 停一下（放下或拿起）、out 縮回去。take 表示這趟是來收碟子
  const hand = { state: 'idle' as 'idle' | 'in' | 'hold' | 'out', p: 0, timer: 8, take: false }
  let dishOnTable = false
  // 走過去的服務生：dir 是方向（0 表示沒人），phase 是擺手的相位，tray 是這趟木盤上端的東西（null 表示空手）
  const passer = { x: 0, dir: 0 as -1 | 0 | 1, phase: 0, tray: null as TrayItem | null, timer: 5 }

  function build(size: Size) {
    ;({ W, H } = size)
    horizon = Math.round(H * 0.24)
    const { r, between } = rngTools(20261107)
    room = makeLayer(W, H)
    const g = room.ctx

    // 遠景：暖色牆、柱子、酒架的剪影（低對比，不搶菜單）
    dot(g, 0, 0, W, horizon, '#6e5038')
    for (let n = 0; n < W; n += 1) dot(g, between(0, W - 1), between(0, horizon - 1), 1, 1, r() < 0.5 ? '#664a33' : '#76573d')
    for (let x = 0; x < W; x += Math.max(60, Math.round(W / 5))) dot(g, x, 0, 3, horizon, '#4a301c')
    const shelfY = horizon - 9
    dot(g, 0, shelfY, W, 2, '#4a301c')
    for (let x = between(2, 8); x < W - 4; x += between(5, 9)) {
      const h = between(5, 9)
      dot(g, x, shelfY - h, 3, h, '#55392a')
      dot(g, x + 1, shelfY - h - 2, 1, 2, '#55392a')
    }
    const wash = glowSprite(40, '#ffb36b', 0.035)
    for (const f of [0.2, 0.5, 0.8]) g.drawImage(wash, Math.round(W * f) - 40, -24)

    // 桌面：淺色檜木、透視的木板接縫、淡淡的木紋
    dot(g, 0, horizon, W, H - horizon, '#e3c48e')
    dot(g, 0, horizon, W, 2, '#a8834f')
    dot(g, 0, horizon + 2, W, 1, '#f2dcae')
    const farGap = 22
    const nearGap = 36
    for (let i = -Math.ceil(W / farGap); i <= Math.ceil(W / farGap); i += 1) {
      const xf = W / 2 + i * farGap
      const xn = W / 2 + i * nearGap
      for (let y = horizon + 3; y < H; y += 1) {
        const q = (y - horizon) / (H - horizon)
        const x = Math.round(xf + (xn - xf) * q)
        if (x >= 0 && x < W) dot(g, x, y, 1, 1, '#cfae76')
      }
    }
    for (let n = 0; n < W * 0.8; n += 1) {
      const y = between(horizon + 4, H - 1)
      dot(g, between(0, W - 6), y, between(3, 8), 1, r() < 0.7 ? '#d8b880' : '#ecd2a0')
    }
    dot(g, 0, H - 3, W, 3, '#c9a46e')
    // 頭頂的燈打在桌上的一片暖光
    g.drawImage(glowSprite(60, '#fff0c8', 0.03), Math.round(W / 2) - 60, horizon - 20)

    // 左邊：捲起來的濕毛巾（放在小托盤上）
    const ox = 4
    const oy = Math.round(H * 0.38)
    dot(g, ox - 1, oy + 6, 26, 3, '#3b2618')
    dot(g, ox, oy, 24, 7, '#e8e4dc')
    for (let x = ox + 4; x < ox + 24; x += 5) dot(g, x, oy, 1, 7, '#cfcabe')
    dot(g, ox, oy + 6, 24, 1, '#bdb7aa')
    // 左下：筷架與筷子（斜放）
    const cy = Math.round(H * 0.72)
    dot(g, 14, cy, 6, 3, '#3d5a80')
    dot(g, 14, cy, 6, 1, '#5a78a0')
    for (let k = 0; k < 34; k += 1) {
      dot(g, 4 + Math.round(k * 0.55), cy + 16 - k, 1, 1, k < 6 ? '#5b3b28' : '#c9a46e')
      dot(g, 7 + Math.round(k * 0.55), cy + 17 - k, 1, 1, k < 6 ? '#5b3b28' : '#b8955e')
    }

    // 右邊：清酒壺（白瓷、藍色腰帶）
    const tx = W - 22
    const ty = Math.round(H * 0.28)
    ;[4, 4, 4, 6, 8, 10, 12, 12, 12, 12, 12, 12, 10, 8].forEach((w, row) => {
      dot(g, tx + 6 - Math.floor(w / 2), ty + row, w, 1, row >= 7 && row <= 8 ? '#3d5a80' : '#e8e4dc')
    })
    dot(g, tx + 1, ty + 7, 1, 6, '#ffffff')
    dot(g, tx, ty + 14, 12, 1, '#2a1a14', 0.4)
    // 小酒杯（內側有藍色的蛇目圈）
    cup = { x: W - 30, y: Math.round(H * 0.42) }
    dot(g, cup.x, cup.y, 9, 5, '#e8e4dc')
    dot(g, cup.x + 1, cup.y, 7, 2, '#f3e6b0')
    dot(g, cup.x + 3, cup.y + 3, 3, 1, '#3d5a80')
    dot(g, cup.x, cup.y + 5, 9, 1, '#2a1a14', 0.35)
    // 湯碗：黑漆碗、紅色碗緣、味噌湯
    bowl = { x: W - 34, y: Math.round(H * 0.66) }
    dot(g, bowl.x, bowl.y, 22, 2, '#a8322a')
    dot(g, bowl.x + 1, bowl.y + 1, 20, 2, '#b8854a')
    dot(g, bowl.x + 4, bowl.y + 1, 3, 1, '#7fa35a')
    dot(g, bowl.x + 12, bowl.y + 2, 2, 1, '#e8e4dc')
    ;[22, 20, 18, 16, 13].forEach((w, row) => dot(g, bowl.x + 11 - Math.floor(w / 2), bowl.y + 3 + row, w, 1, '#1f140c'))
    dot(g, bowl.x + 3, bowl.y + 4, 4, 1, '#4a301c')
    dot(g, bowl.x + 2, bowl.y + 8, 18, 1, '#2a1a14', 0.35)

    dishSpot = { x: W - 30, y: Math.round(H * 0.53) }
    wisps = []
    hand.state = 'idle'
    hand.timer = 6 + r() * 6
    hand.take = false
    dishOnTable = false
    passer.dir = 0
    passer.timer = 3 + r() * 5
  }

  function step(dt: number) {
    t += dt
    // 熱氣：從碗口冒出來，左右飄著往上升、慢慢淡掉
    if (Math.random() < dt * 4) wisps.push({ x: bowl.x + 6 + Math.random() * 10, y: bowl.y, life: 0, drift: Math.random() * Math.PI * 2 })
    for (const w of wisps) {
      w.life += dt
      w.y -= 6 * dt
    }
    wisps = wisps.filter((w) => w.life < 2.2)

    // 桌子另一頭的服務生：每 10～22 秒從左或右走過一趟，約 6 秒走完（離得近，看起來走得快）
    if (passer.dir === 0) {
      passer.timer -= dt
      if (passer.timer <= 0) {
        passer.dir = Math.random() < 0.5 ? 1 : -1
        passer.x = passer.dir > 0 ? -PASSER_OFF : W + PASSER_OFF
        // 四成空手；托盤的話酒壺最常見，三種菜輪流偶爾出現
        const roll = Math.random()
        passer.tray = roll < 0.4 ? null : roll < 0.64 ? 'sake' : TRAY_DISHES[Math.floor(Math.random() * TRAY_DISHES.length)] ?? 'sake'
      }
    } else {
      passer.x += passer.dir * 70 * dt
      passer.phase += dt * 8
      if (passer.x < -PASSER_OFF - 10 || passer.x > W + PASSER_OFF + 10) {
        passer.dir = 0
        passer.timer = 10 + Math.random() * 12
      }
    }

    // 服務生的手：沒有碟子就來放一碟；碟子放一陣子後再伸手收走
    if (hand.state === 'idle') {
      hand.timer -= dt
      if (hand.timer <= 0) {
        hand.take = dishOnTable
        hand.state = 'in'
        hand.p = 0
      }
    } else if (hand.state === 'in') {
      hand.p = Math.min(1, hand.p + dt * 1.4)
      if (hand.p >= 1) (hand.state = 'hold'), (hand.timer = 0.6)
    } else if (hand.state === 'hold') {
      hand.timer -= dt
      if (hand.timer <= 0) {
        dishOnTable = !hand.take
        hand.state = 'out'
      }
    } else {
      hand.p = Math.max(0, hand.p - dt * 1.4)
      if (hand.p <= 0) {
        hand.state = 'idle'
        // 放好後等 14～24 秒來收；收走後等 10～22 秒再上下一碟
        hand.timer = dishOnTable ? 14 + Math.random() * 10 : 10 + Math.random() * 12
      }
    }
  }

  function drawDish(ctx: Ctx, x: number, y: number) {
    dot(ctx, x, y, 14, 4, '#e8e4dc')
    dot(ctx, x + 1, y + 4, 12, 1, '#cfcabe')
    for (const [dx, dy] of [[3, 1], [6, 0], [9, 1], [5, 2], [8, 2]] as const) dot(ctx, x + dx, y + dy, 2, 1, '#7fa35a')
  }

  function drawHand(ctx: Ctx) {
    if (hand.state === 'idle') return
    // 從畫面右緣伸進來：深藍袖子、手掌；托著碟子的時候碟子跟著手走
    const hx = W - Math.round(hand.p * 30)
    const hy = dishSpot.y - 2
    const carrying = hand.take ? hand.state === 'out' : hand.state !== 'out'
    if (carrying) drawDish(ctx, hx - 4, hy + 2)
    dot(ctx, hx + 6, hy, 30, 8, '#24365e')
    dot(ctx, hx + 6, hy, 30, 1, '#3b5285')
    dot(ctx, hx, hy + 1, 7, 6, '#e0b890')
    dot(ctx, hx - 2, hy + 2, 3, 2, '#e0b890')
  }

  function drawPasser(ctx: Ctx) {
    if (passer.dir === 0) return
    const x0 = Math.round(passer.x) - 9 * PASSER_SCALE
    // 走路時身體一上一下
    const bob = Math.abs(Math.sin(passer.phase)) > 0.7 ? 1 : 0
    const swing = Math.round(Math.sin(passer.phase) * 2)
    // 下面的座標都是 18 格寬的小圖；放大 PASSER_SCALE 倍、往上提 PASSER_LIFT，像離桌子很近、只看得到胸口到腰。
    // dir 為負時左右翻過來；超過桌緣（horizon）的部分不畫，被桌子擋住
    const px = (dx: number, y: number, w: number, h: number, color: string) => {
      const top = y * PASSER_SCALE - PASSER_LIFT + bob
      const hh = Math.min(h * PASSER_SCALE, horizon - top)
      if (hh <= 0) return
      const left = passer.dir > 0 ? dx : 18 - dx - w
      dot(ctx, x0 + left * PASSER_SCALE, top, w * PASSER_SCALE, hh, color)
    }
    // 後面那隻手（離我們遠，顏色深一點），跟前手反方向擺
    if (!passer.tray) {
      px(-2 - swing, 6, 4, 14, '#1b2a4a')
      px(-2 - swing, 20, 3, 3, '#c9a07a')
    }
    // 脖子（頭在畫面外）、深藍法被、白色衣領
    px(7, -2, 4, 6, '#e0b890')
    px(0, 4, 18, 6, '#24365e')
    px(1, 3, 16, 60, '#24365e')
    px(1, 4, 1, 60, '#3b5285')
    for (let k = 0; k < 9; k += 1) {
      px(6 + Math.floor(k / 3), 3 + k, 1, 1, '#e8e4dc')
      px(11 - Math.floor(k / 3), 3 + k, 1, 1, '#e8e4dc')
    }
    // 腰帶與白圍裙
    px(1, 24, 16, 3, '#8a2a24')
    px(3, 27, 12, 40, '#e8e4dc')
    px(8, 28, 1, 40, '#cfcabe')
    if (passer.tray) {
      // 前手彎起來托著木盤
      px(15, 10, 6, 4, '#24365e')
      px(19, 14, 3, 2, '#e0b890')
      px(15, 13, 14, 2, '#3b2618')
      if (passer.tray === 'sake') {
        // 一支酒壺（白瓷、藍腰帶）
        px(20, 7, 4, 6, '#e8e4dc')
        px(21, 5, 2, 2, '#e8e4dc')
        px(20, 9, 4, 1, '#3d5a80')
      } else if (passer.tray === 'yakitori') {
        // 烤雞肉串：白長盤上兩串，醬燒色的肉塊夾著蔥
        px(16, 11, 12, 2, '#e8e4dc')
        px(17, 9, 11, 1, '#d8b880')
        px(18, 8, 2, 2, '#7a3e1e')
        px(21, 8, 2, 2, '#8a4a24')
        px(24, 8, 2, 2, '#7a3e1e')
        px(20, 10, 1, 1, '#7fa35a')
        px(18, 10, 2, 1, '#8a4a24')
        px(23, 10, 2, 1, '#7a3e1e')
      } else if (passer.tray === 'sashimi') {
        // 生魚片：木板上鮭魚、鮪魚、紫蘇葉
        px(16, 10, 12, 3, '#c9a46e')
        px(17, 8, 3, 2, '#f08a5d')
        px(17, 8, 3, 1, '#ffc2a0')
        px(20, 8, 3, 2, '#f08a5d')
        px(20, 8, 3, 1, '#ffc2a0')
        px(23, 8, 2, 2, '#c0303a')
        px(25, 8, 2, 2, '#5f7a3a')
      } else {
        // 炸雞塊：白盤上生菜、金黃的炸雞與一片檸檬
        px(16, 11, 12, 2, '#e8e4dc')
        px(17, 9, 4, 2, '#7fa35a')
        px(20, 8, 3, 3, '#b8743a')
        px(23, 9, 3, 2, '#c98a44')
        px(21, 7, 2, 1, '#d89a50')
        px(26, 9, 2, 2, '#f3d24a')
      }
    } else {
      px(15 + swing, 6, 4, 14, '#24365e')
      px(16 + swing, 20, 3, 3, '#e0b890')
    }
  }

  function draw(ctx: Ctx) {
    ctx.drawImage(room.img, 0, 0)
    drawPasser(ctx)
    for (const w of wisps) {
      const a = Math.min(0.35, w.life * 0.6) * (1 - w.life / 2.2)
      dot(ctx, Math.round(w.x + Math.sin(t * 2 + w.drift) * 2), Math.round(w.y), 2, 1, '#f2efe8', a)
    }
    if (dishOnTable) drawDish(ctx, dishSpot.x, dishSpot.y)
    drawHand(ctx)
  }

  return { build, step, draw }
}
