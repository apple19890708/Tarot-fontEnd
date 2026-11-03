// 像素風塔羅牌的繪圖引擎（78 張，計畫書 doc/v01-pixel-night-home-plan.md 2.9）。
// 全部用程式逐格畫：80×128 的格子、共用 30 色色盤、Bayer 抖色、角色層自動描邊。
// 原稿是展示頁（artifact），改牌面時兩邊一起改。這個檔案是 JS（繪圖座標資料量大，不逐行加型別），型別宣告在 engine.d.ts。
// 只在使用者切到像素牌面時才動態載入（見 src/lib/cardStyle.ts）。

// ===================== 引擎 =====================
const W = 80, H = 128
// 整副牌共用的 30 色色盤（每張牌一定在 30 色以內）
const C = {
  K: '#1a1226', D: '#3a2a4a', GL: '#ffd86b', G: '#e0a838', GD: '#9a6420', PA: '#f4e6c4', PD: '#e2cc9a', WH: '#fffbea',
  SL: '#ffe9a8', SO: '#ffb45a', BL: '#9fd8f0', B: '#4a8fd8', BD: '#2a4f9a', NV: '#1e2a5a', PL: '#b59ce8', PU: '#7a52c0',
  R: '#d83a3a', RD: '#8a1e2a', GRL: '#8ed05a', GR: '#3f9a46', GRD: '#1f5a3a', TE: '#2f8a8a', SK: '#f6c79a', SKD: '#d8946a',
  BR: '#8a5a32', BRD: '#523220', GYL: '#c8c4d8', GY: '#8a86a0', PK: '#f08ab0', OR: '#f07a2a',
}
const SC = [6, 16, 73, 101] // 中間畫面 x 6–73、y 16–101
let L = null, CLIP = null

function set(x, y, c) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= W || y >= H) return
  if (CLIP && (x < CLIP[0] || y < CLIP[1] || x > CLIP[2] || y > CLIP[3])) return
  if (typeof c === 'function') { c = c(x, y); if (c === undefined) return }
  L[y * W + x] = c
}
function get(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= H ? null : L[y * W + x] }
function rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c) }
function disc(cx, cy, r, c) {
  const r2 = r * r + r * 0.6
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) set(x, y, c)
    }
}
function ring(cx, cy, r, c) {
  const o = r * r + r * 0.6, i = (r - 1) * (r - 1) + (r - 1) * 0.6
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d <= o && d > i) set(x, y, c)
    }
}
// Bresenham，t 是粗細
function line(x0, y0, x1, y1, c, t = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  const o = Math.floor((t - 1) / 2)
  let e = dx + dy
  for (;;) {
    if (t === 1) set(x0, y0, c); else rect(x0 - o, y0 - o, t, t, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * e
    if (e2 >= dy) { e += dy; x0 += sx }
    if (e2 <= dx) { e += dx; y0 += sy }
  }
}
// 多邊形（even-odd 規則），p 是 [x0, y0, x1, y1, ...]
function poly(p, c) {
  let y0 = Infinity, y1 = -Infinity
  for (let i = 1; i < p.length; i += 2) { y0 = Math.min(y0, p[i]); y1 = Math.max(y1, p[i]) }
  const n = p.length / 2
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const sy = y + 0.5, xs = []
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], ay = p[i * 2 + 1], j = (i + 1) % n, bx = p[j * 2], by = p[j * 2 + 1]
      if ((ay <= sy) !== (by <= sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) set(x, y, c)
  }
}
// Bayer 4×4 抖色
const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bt = (x, y) => (BY[(y & 3) * 4 + (x & 3)] + 0.5) / 16
// 兩色混合：lv 是第二色所佔的比例
const mix = (a, b, lv) => (x, y) => (bt(x, y) < lv ? b : a)
function vgrad(x, y, w, h, st) {
  for (let j = 0; j < h; j++) {
    const t = h > 1 ? (j / (h - 1)) * (st.length - 1) : 0
    const i = Math.min(st.length - 2, Math.floor(t)), f = t - i
    for (let k = 0; k < w; k++) set(x + k, y + j, f > bt(x + k, y + j) ? st[i + 1] : st[i])
  }
}
// 放射狀抖色，st 由內到外，null 表示不畫
function rgrad(cx, cy, r, st) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy) / r
      if (d > 1) continue
      const t = d * (st.length - 1), i = Math.min(st.length - 2, Math.floor(t)), f = t - i
      const c = f > bt(x, y) ? st[i + 1] : st[i]
      if (c) set(x, y, c)
    }
}

// 3×5 點陣字
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111',
}
function textW(s, sc) { let w = 0; for (const ch of s) w += (ch === ' ' ? 2 : 4) * sc; return w - sc }
function text(s, x, y, c, sc = 1) {
  for (const ch of s) {
    if (ch === ' ') { x += 2 * sc; continue }
    const g = FONT[ch]
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') rect(x + i * sc, y + j * sc, sc, sc, c)
    x += 4 * sc
  }
}

// ===================== 共用的小元件 =====================
function sky(st, y0 = 16, y1 = 101) { vgrad(6, y0, 68, y1 - y0 + 1, st) }
function sun(cx, cy, r) {
  for (let a = 0; a < 16; a++) {
    const t = (a * Math.PI) / 8, l = a % 2 ? r + 3 : r + 5
    line(cx + Math.cos(t) * (r + 1), cy + Math.sin(t) * (r + 1), cx + Math.cos(t) * l, cy + Math.sin(t) * l, C.GL)
  }
  disc(cx, cy, r, C.G)
  disc(cx - 1, cy - 1, r - 1.5, C.GL)
}
function cloud(x, y, w = 10) {
  rect(x + 1, y + 2, w - 1, 3, C.GYL)
  disc(x + 3, y + 2, 2.5, C.GYL); disc(x + w - 3, y + 2, 2.5, C.GYL)
  disc(x + 3, y + 1, 2.5, C.WH); disc(x + w / 2, y, 3, C.WH); disc(x + w - 3, y + 1, 2.5, C.WH)
  rect(x + 1, y + 1, w - 2, 2, C.WH)
}
// 光從左上來：山的左半亮、右半暗
function mountain(x, y, hw, base, c, cd, snow) {
  poly([x - hw, base, x + 0.5, y, x + 0.5, base], c)
  poly([x + 0.5, y, x + hw + 1, base, x + 0.5, base], cd)
  if (snow) { poly([x - 3, y + 5, x + 0.5, y, x + 4, y + 5], snow); set(x - 2, y + 6, snow); set(x, y + 6, snow); set(x + 2, y + 6, snow) }
}
function star8(cx, cy, r, c) {
  line(cx - r, cy, cx + r, cy, c); line(cx, cy - r, cx, cy + r, c)
  const d = Math.round(r * 0.55)
  line(cx - d, cy - d, cx + d, cy + d, c); line(cx - d, cy + d, cx + d, cy - d, c)
  disc(cx, cy, r * 0.22 + 0.6, c)
}
function twinkle(x, y, c = C.WH) { set(x, y, c); set(x - 1, y, c); set(x + 1, y, c); set(x, y - 1, c); set(x, y + 1, c) }
function pentagram(cx, cy, r, c, down) {
  const pts = []
  for (let k = 0; k < 5; k++) { const a = (down ? Math.PI / 2 : -Math.PI / 2) + (k * 2 * Math.PI) / 5; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) }
  for (let k = 0; k < 5; k++) { const a = pts[k], b = pts[(k + 2) % 5]; line(a[0], a[1], b[0], b[1], c) }
}
function rose(x, y, c = C.R) { disc(x, y, 1.6, c); set(x, y, c === C.WH ? C.GYL : C.RD); set(x - 2, y + 1, C.GR); set(x + 2, y + 1, C.GR) }
function lily(x, y) { line(x, y, x, y + 4, C.GR); set(x - 1, y, C.WH); set(x + 1, y, C.WH); set(x, y - 1, C.WH); set(x, y, C.GL) }

// ---- 人物 ----
// 頭：半徑 4 的臉、頭髮、往右側的陰影（光從左上）
function face(cx, cy, o = {}) {
  const sk = o.skin || C.SK, skd = o.skinD || C.SKD
  // 長髮只垂在臉的兩側，不要整塊墊在下巴底下
  if (o.hair && o.long) { rect(cx - 5, cy - 1, 2, o.long, o.hair); rect(cx + 4, cy - 1, 2, o.long, o.hair) }
  if (o.hair) disc(cx, cy - 1, 4.4, o.hair)
  disc(cx, cy + 0.5, 3.6, sk)
  for (let y = cy - 2; y <= cy + 4; y++) if (get(cx + 3, y) === sk) set(cx + 3, y, skd)
  if (o.hair) { rect(cx - 3, cy - 3, 7, 1, o.hair); set(cx - 4, cy - 1, o.hair); set(cx + 4, cy - 1, o.hair) }
  if (o.beard) poly([cx - 4, cy + 2, cx + 5, cy + 2, cx + 2, cy + (o.beardLen || 9), cx - 1, cy + (o.beardLen || 9)], o.beard)
  set(cx - 2, cy + 1, o.eye || C.K); set(cx + 1, cy + 1, o.eye || C.K)
  if (!o.beard) set(cx - 3, cy + 2, C.PK)
}
// 袍子：梯形，右側一條暗面
function robe(cx, yT, yB, hT, hB, c, cd) {
  poly([cx - hT, yT, cx + hT + 1, yT, cx + hB + 1, yB, cx - hB, yB], c)
  if (cd) poly([cx + hT - 1, yT, cx + hT + 1, yT, cx + hB + 1, yB, cx + hB - 2, yB], cd)
}
// 天使的翅膀（以畫面中線 x=40 左右對稱）：一根根羽毛從肩膀往上放射，尖端排成弧形，肩上一團覆羽。
// sy 是肩膀高度；光從左上來，左翼用 fillL、右翼用偏暗的 fillR，羽毛下緣用 lineC 分出層次
function wings(sy, fillL, fillR, lineC) {
  const oy = sy - 34
  const TIPS = [[20, 22], [18, 26], [19, 30], [21, 35], [25, 38]]
  for (const side of [1, -1]) {
    const sx = side > 0 ? 34 : 46, fx = (x) => (side > 0 ? x : 80 - x), fill = side > 0 ? fillL : fillR
    for (const [tx, ty] of TIPS) line(sx, sy, fx(tx), ty + oy, fill, 3)
    for (const [tx, ty] of TIPS.slice(0, 4)) line(sx, sy + 2, fx(tx), ty + oy + 2, lineC)
    disc(side > 0 ? 31 : 49, sy - 2, 3, fill)
  }
}
function arm(x0, y0, x1, y1, c, skin = C.SK) { line(x0, y0, x1, y1, c, 2); rect(x1 - 1, y1 - 1, 2, 2, skin) }
// 角落的四活物：天使、老鷹、牛、獅子（命運之輪、世界）
function beasts() {
  disc(9, 24, 3, C.WH); disc(19, 24, 3, C.WH); face(14, 23, { hair: C.G }); rect(11, 28, 6, 2, C.R)
  disc(61, 24, 3, C.BR); disc(71, 24, 3, C.BR); disc(66, 23, 3.5, C.GYL); poly([68, 22, 72, 24, 68, 25], C.G); set(65, 22, C.K); rect(63, 28, 6, 2, C.R)
  line(10, 87, 8, 83, C.WH, 2); line(18, 87, 20, 83, C.WH, 2); disc(14, 90, 3.5, C.BR); rect(12, 92, 5, 2, C.PK); set(12, 89, C.K); set(16, 89, C.K); rect(11, 95, 7, 2, C.R)
  disc(66, 90, 4.5, C.OR); disc(66, 91, 2.6, C.G); set(65, 90, C.K); set(67, 90, C.K); set(66, 92, C.BRD); rect(63, 96, 7, 2, C.R)
}

// ===================== 22 張牌 =====================
const CARDS = [
  {
    num: '0', en: 'THE FOOL', zh: '愚者', title: 'The Fool',
    keys: ['懸崖邊緣', '白玫瑰', '肩上的行囊', '白狗', '太陽', '雪山', '羽毛帽'],
    // 照使用者給的參考圖重畫：大太陽與光暈、兩朵雲、一排薰衣草色雪山、起伏的草地與土層、左下的灰色懸崖
    bg() {
      sky([C.SO, C.SL, C.SL])
      rgrad(63, 30, 13, [C.GL, C.GL, null]); disc(63, 30, 6.5, C.GL); disc(63, 30, 5.5, C.SL)
      cloud(17, 30, 13); cloud(33, 23, 9)
      mountain(12, 66, 11, 82, C.PL, C.PU, C.WH); mountain(25, 63, 12, 82, C.PL, C.PU, C.WH)
      mountain(50, 67, 12, 82, C.PL, C.PU, C.WH); mountain(69, 63, 12, 82, C.PL, C.PU, C.WH)
      poly([6, 84, 12, 80, 22, 79, 34, 81, 46, 79, 60, 80, 74, 78, 74, 93, 6, 93], mix(C.GR, C.GRL, 0.25))
      rect(6, 92, 68, 10, mix(C.BR, C.BRD, 0.3)); rect(6, 92, 68, 1, C.GRD)
      poly([6, 89, 20, 89, 23, 102, 6, 102], mix(C.GYL, C.PL, 0.4)); line(20, 89, 23, 101, C.GY)
      for (const [x, y] of [[60, 88], [66, 87], [14, 85], [70, 90]]) { set(x, y, C.R); set(x + 1, y, C.WH) }
    },
    ch() {
      // 手杖斜撐在右手，頂端掛著紫色行囊
      line(46, 77, 59, 43, C.BR, 2)
      disc(59, 41, 3, C.PU); set(58, 40, C.PL); set(57, 41, C.PL)
      // 跨步的黃色緊身褲與紅褐色靴子
      line(38, 77, 35, 85, C.G, 2); line(44, 77, 47, 87, C.G, 2)
      rect(32, 85, 5, 3, C.RD); rect(45, 87, 6, 3, C.RD)
      // 綠色長袍、白色披肩領、紅腰帶與花點
      robe(41, 58, 78, 5, 9, C.TE, C.GRD)
      poly([33, 57, 50, 57, 52, 62, 31, 62], C.WH); rect(31, 61, 21, 1, C.GYL)
      rect(33, 70, 16, 1, C.R)
      for (const [x, y, c] of [[36, 66, C.GL], [44, 64, C.R], [38, 74, C.GL], [46, 72, C.GL], [42, 76, C.R], [35, 71, C.B]]) set(x, y, c)
      // 左手拿白玫瑰、右手握手杖
      arm(33, 60, 30, 63, C.WH); line(30, 62, 30, 59, C.GR); disc(30, 58, 1.4, C.WH); set(30, 58, C.GL)
      arm(49, 60, 50, 65, C.WH)
      // 頭：臉朝左，後腦是橘色頭髮；綠帽、紅羽毛
      disc(41, 52, 3.8, C.SK); rect(44, 50, 2, 5, C.OR); set(43, 55, C.SKD)
      set(39, 52, C.K); set(42, 52, C.K); set(38, 54, C.PK)
      poly([36, 50, 46, 50, 45, 46, 38, 46], C.GR); rect(36, 49, 11, 1, C.GRD); rect(38, 46, 4, 1, C.GRL)
      line(45, 46, 49, 40, C.R, 2)
      // 右邊的小白狗，朝著愚者、尾巴翹起
      rect(51, 77, 12, 5, C.WH); rect(51, 81, 12, 1, C.GYL)
      disc(51, 75, 2.6, C.WH); rect(47, 75, 2, 2, C.WH); set(52, 72, C.GYL); set(53, 73, C.GYL); set(50, 74, C.K)
      rect(52, 82, 1, 5, C.WH); rect(54, 82, 1, 4, C.GYL); rect(60, 82, 1, 5, C.WH); rect(62, 82, 1, 4, C.GYL)
      line(63, 77, 66, 73, C.WH)
    },
  },
  {
    num: 'I', en: 'THE MAGICIAN', zh: '魔術師', title: 'The Magician',
    keys: ['高舉的權杖', '指向地面的手', '無限符號', '桌上的聖杯、寶劍、錢幣、權杖', '紅玫瑰與白百合', '紅袍白衣'],
    bg() {
      sky([C.GL, C.SL])
      for (let x = 7; x < 74; x += 6) { disc(x + 2, 18, 2, C.R); set(x + 2, 18, C.RD); set(x - 1, 20, C.GR); set(x + 5, 20, C.GR) }
      rect(6, 20, 68, 1, C.GR)
      ring(38, 47, 2, C.GD); ring(42, 47, 2, C.GD)
      rect(6, 88, 68, 14, C.GR)
    },
    ch() {
      robe(40, 63, 99, 4, 10, C.R, C.RD); robe(40, 64, 99, 2, 4, C.WH, C.GYL)
      rect(36, 74, 9, 1, C.B)
      arm(37, 65, 32, 46, C.R); line(32, 36, 32, 46, C.WH, 2); set(31, 36, C.GL); set(32, 36, C.GL)
      arm(43, 65, 52, 80, C.R)
      face(40, 58, { hair: C.BRD }); rect(36, 55, 9, 1, C.WH)
      rect(10, 82, 60, 3, C.BR); rect(10, 82, 60, 1, C.G); rect(12, 85, 56, 17, C.BRD); for (let x = 20; x < 68; x += 12) rect(x, 85, 1, 17, C.BR)
      rect(14, 76, 5, 4, C.G); rect(13, 75, 7, 1, C.GL); rect(16, 80, 1, 2, C.G)
      disc(25, 79, 2.6, C.G); pentagram(25, 79, 2.2, C.GD)
      line(57, 81, 67, 77, C.GYL); rect(58, 79, 1, 3, C.G)
      line(30, 81, 37, 80, C.BR)
      for (let x = 9; x < 72; x += 7) { rose(x, 98); lily(x + 3, 95) }
    },
  },
  {
    num: 'II', en: 'THE HIGH PRIESTESS', zh: '女祭司', title: 'The High Priestess',
    keys: ['黑柱 B 與白柱 J', '石榴帷幕', '三相月冠', '胸前十字', 'TORA 經卷', '腳邊的新月', '藍袍'],
    bg() {
      sky([C.NV, C.BD])
      rect(16, 20, 48, 70, C.PU)
      for (let y = 24, r = 0; y < 86; y += 8, r++) for (let x = 20 + (r % 2) * 4; x < 62; x += 8) { disc(x, y, 1.4, C.R); set(x, y - 2, C.GR) }
      rect(6, 90, 68, 12, C.GY); for (let x = 6; x < 74; x += 8) rect(x, 90, 1, 12, C.GYL); rect(6, 95, 68, 1, C.GYL)
      rect(7, 18, 11, 3, C.GY); rect(8, 21, 9, 81, C.D); rect(8, 21, 1, 81, C.PU); text('B', 11, 26, C.WH)
      rect(62, 18, 11, 3, C.GY); rect(63, 21, 9, 81, C.PA); rect(70, 21, 2, 81, C.PD); text('J', 65, 26, C.K)
    },
    ch() {
      robe(40, 61, 99, 4, 13, C.BL, C.B)
      poly([35, 62, 37, 62, 31, 99, 27, 99], C.WH)
      rect(39, 63, 2, 8, C.WH); rect(37, 65, 6, 2, C.WH)
      face(40, 56, { hair: C.BRD, long: 10 })
      disc(40, 49, 2, C.WH); line(34, 47, 36, 51, C.WH); line(46, 47, 44, 51, C.WH)
      rect(35, 74, 10, 5, C.PA); rect(35, 74, 1, 5, C.PD); rect(37, 76, 6, 1, C.GD); rect(34, 76, 2, 2, C.SK)
      disc(40, 97, 4, C.GL); disc(40, 95, 3.4, C.BL)
    },
  },
  {
    num: 'III', en: 'THE EMPRESS', zh: '女皇', title: 'The Empress',
    keys: ['十二星冠', '金星符號的心形盾', '麥田', '森林與瀑布', '權杖', '石榴花紋長袍', '紅色軟墊'],
    bg() {
      sky([C.SO, C.GL, C.SL], 16, 60)
      for (let x = 4; x < 76; x += 7) { disc(x + 3, 58, 5, C.GRD); disc(x + 2, 56, 3, C.GR) }
      rect(62, 46, 6, 20, mix(C.BL, C.WH, 0.4)); rect(60, 64, 10, 2, C.WH)
      rect(6, 62, 68, 40, mix(C.G, C.GL, 0.3))
      for (let x = 7; x < 74; x += 3) { line(x, 101, x, 92, C.GD); set(x, 91, C.GL); set(x, 90, C.G) }
    },
    ch() {
      rect(24, 64, 32, 26, C.R); rect(50, 64, 6, 26, C.RD); rect(24, 64, 32, 1, C.PK)
      robe(40, 61, 96, 4, 12, C.WH, C.GYL)
      for (const [x, y] of [[37, 70], [43, 74], [36, 81], [42, 86], [47, 91], [33, 92]]) { set(x, y, C.R); set(x, y - 1, C.GR) }
      arm(37, 63, 32, 70, C.WH); line(31, 59, 31, 76, C.G); disc(31, 58, 1.6, C.GL)
      arm(43, 63, 47, 74, C.WH)
      face(40, 56, { hair: C.G, long: 10 })
      for (let i = 0; i < 12; i++) { const a = Math.PI * (1.05 + (i / 11) * 0.9); set(40 + Math.cos(a) * 7.5, 55 + Math.sin(a) * 7, C.GL) }
      disc(23, 85, 3, C.GYL); disc(28, 85, 3, C.GYL); poly([20, 86, 31.5, 86, 25.5, 93], C.GYL)
      ring(25.5, 84.5, 1.8, C.GD); rect(25, 86, 1, 4, C.GD); rect(24, 88, 3, 1, C.GD)
    },
  },
  {
    num: 'IV', en: 'THE EMPEROR', zh: '皇帝', title: 'The Emperor',
    keys: ['公羊頭石座', '安卡權杖', '寶球', '白鬍子', '金冠', '盔甲', '荒涼的山'],
    bg() {
      sky([C.RD, C.R, C.OR, C.SO], 16, 80)
      mountain(16, 50, 14, 82, C.BR, C.BRD); mountain(64, 46, 16, 82, C.BR, C.BRD); mountain(40, 58, 16, 82, C.OR, C.BR)
      rect(6, 80, 68, 22, mix(C.BRD, C.BR, 0.25)); rect(6, 84, 12, 2, C.B)
    },
    ch() {
      rect(20, 46, 40, 52, C.GY); rect(20, 46, 3, 52, C.GYL); rect(56, 46, 4, 52, C.D)
      disc(22, 47, 3, C.WH); ring(22, 47, 3, C.GD); disc(58, 47, 3, C.WH); ring(58, 47, 3, C.GD)
      disc(22, 76, 2, C.WH); disc(58, 76, 2, C.WH)
      robe(40, 61, 98, 5, 13, C.R, C.RD)
      rect(34, 88, 4, 10, C.GYL); rect(43, 88, 4, 10, C.GY)
      face(40, 56, { hair: C.WH, beard: C.WH, beardLen: 11 })
      rect(36, 49, 9, 3, C.G); set(36, 48, C.GL); set(40, 47, C.GL); set(44, 48, C.GL); set(40, 50, C.R)
      arm(36, 64, 31, 70, C.R); line(31, 56, 31, 80, C.G); ring(31, 53, 2, C.G); rect(29, 56, 5, 1, C.G)
      arm(44, 64, 49, 72, C.R); disc(50, 69, 2.6, C.G); set(49, 68, C.GL); rect(50, 65, 1, 2, C.G)
    },
  },
  {
    num: 'V', en: 'THE HIEROPHANT', zh: '教皇', title: 'The Hierophant',
    keys: ['三重冠', '祝福手勢', '三重十字杖', '兩根灰柱', '兩名修士', '交叉的鑰匙', '紅袍'],
    bg() {
      sky([C.GYL, C.GY])
      rect(8, 16, 10, 86, C.GY); rect(8, 16, 2, 86, C.GYL); rect(16, 16, 2, 86, C.D)
      rect(62, 16, 10, 86, C.GY); rect(62, 16, 2, 86, C.GYL); rect(70, 16, 2, 86, C.D)
      rect(6, 86, 68, 16, mix(C.GY, C.D, 0.25))
    },
    ch() {
      rect(30, 40, 20, 46, C.GD); rect(30, 40, 20, 2, C.G)
      robe(40, 55, 90, 4, 12, C.R, C.RD); rect(39, 56, 3, 34, C.WH)
      face(40, 50, {})
      poly([36, 46, 45, 46, 43.5, 35, 37.5, 35], C.G); rect(36, 43, 10, 1, C.GL); rect(37, 40, 8, 1, C.GL); rect(38, 37, 6, 1, C.GL); rect(40, 32, 2, 3, C.G)
      arm(37, 57, 32, 50, C.R); set(31, 47, C.SK); set(32, 47, C.SK); set(31, 48, C.SK)
      line(49, 38, 49, 82, C.G); rect(47, 40, 5, 1, C.G); rect(46, 43, 7, 1, C.G); rect(45, 46, 9, 1, C.G)
      arm(43, 57, 48, 62, C.R)
      robe(24, 88, 101, 4, 9, C.OR, C.R); for (const [x, y] of [[21, 93], [26, 97], [23, 99]]) rose(x, y)
      disc(24, 84, 3.6, C.BR); set(24, 82, C.SK); set(25, 82, C.SK)
      robe(56, 88, 101, 4, 9, C.B, C.BD); for (const [x, y] of [[53, 93], [58, 96], [55, 99]]) lily(x, y - 1)
      disc(56, 84, 3.6, C.BRD); set(56, 82, C.SK); set(57, 82, C.SK)
      line(36, 91, 44, 98, C.G); line(44, 91, 36, 98, C.GYL); rect(35, 90, 2, 2, C.G); rect(44, 90, 2, 2, C.GYL)
    },
  },
  {
    num: 'VI', en: 'THE LOVERS', zh: '戀人', title: 'The Lovers',
    keys: ['大天使拉斐爾', '太陽', '男與女', '知識之樹與蛇', '火焰之樹', '中間的高山'],
    bg() {
      sky([C.B, C.BL, C.SL])
      sun(40, 22, 6)
      mountain(40, 56, 11, 94, C.PL, C.PU, C.WH)
      rect(6, 92, 68, 10, C.GR); rect(6, 92, 68, 1, C.GRL)
      line(14, 94, 14, 70, C.BR, 2)
      for (const [x, y] of [[10, 68], [14, 64], [18, 68], [9, 74], [19, 74], [14, 71]]) { disc(x, y, 2, C.OR); set(x, y, C.GL) }
      line(66, 94, 66, 72, C.BR, 2); disc(66, 66, 7, C.GR); disc(64, 64, 4, C.GRL)
      for (const [x, y] of [[62, 66], [69, 63], [67, 70], [63, 71]]) set(x, y, C.R)
      for (let y = 74; y < 92; y++) set(66 + (y % 4 < 2 ? -1 : 2), y, C.GRL)
      set(64, 74, C.R)
    },
    ch() {
      wings(34, C.WH, mix(C.WH, C.GYL, 0.3), C.GYL)
      robe(40, 35, 46, 3, 7, C.PL, C.PU)
      arm(37, 37, 31, 41, C.PL); arm(43, 37, 49, 41, C.PL)
      face(40, 30, { hair: C.OR })
      cloud(26, 42, 28)
      face(24, 58, { hair: C.BRD })
      robe(24, 63, 82, 3, 3, C.SK, C.SKD); line(23, 82, 22, 97, C.SK, 2); line(26, 82, 27, 97, C.SKD, 2)
      arm(21, 65, 18, 76, C.SK); arm(27, 65, 31, 60, C.SK)
      face(56, 58, { hair: C.G, long: 16 })
      robe(56, 63, 82, 3, 4, C.SK, C.SKD); line(55, 82, 54, 97, C.SK, 2); line(58, 82, 59, 97, C.SKD, 2)
      arm(53, 65, 49, 60, C.SK); arm(59, 65, 62, 76, C.SK)
    },
  },
  {
    num: 'VII', en: 'THE CHARIOT', zh: '戰車', title: 'The Chariot',
    keys: ['黑白兩隻人面獅身', '深藍星星天篷', '肩上的新月', '星冠', '權杖', '有翼圓盤的石造戰車', '身後的城牆與河'],
    // 重新設計：天篷改深藍綴星、戰車前臉加有翼圓盤與兩側車輪、
    // 人面獅身改成正面坐姿（條紋頭巾、前爪），黑白兩隻分站車前
    bg() {
      sky([C.GL, C.SL], 16, 72)
      rect(6, 60, 68, 12, C.PD); rect(6, 60, 68, 1, C.PA); for (let x = 6; x < 74; x += 4) rect(x, 58, 2, 2, C.PD)
      for (let y = 63; y < 72; y += 3) for (let x = 6 + (y % 2) * 3; x < 74; x += 6) rect(x, y, 1, 1, C.GD)
      rect(8, 44, 9, 16, C.PD); rect(14, 44, 3, 16, C.GD); poly([7, 44, 18, 44, 12.5, 36], C.R); rect(11, 49, 2, 3, C.D)
      rect(63, 42, 9, 18, C.PD); rect(69, 42, 3, 18, C.GD); poly([62, 42, 73, 42, 67.5, 34], C.R); rect(66, 47, 2, 3, C.D)
      for (const x of [20, 58]) { disc(x, 57, 3, C.GR); set(x - 1, 55, C.GRL) }
      rect(6, 72, 68, 4, C.B); rect(9, 73, 10, 1, C.BL); rect(44, 74, 12, 1, C.BL)
      rect(6, 76, 68, 26, mix(C.PD, C.G, 0.25))
    },
    ch() {
      // 天篷：四根柱子撐著深藍布，布上綴金星、下緣垂流蘇
      line(22, 30, 22, 70, C.GY); line(58, 30, 58, 70, C.GY); line(23, 30, 23, 70, C.GYL); line(59, 30, 59, 70, C.GYL)
      rect(19, 25, 43, 6, C.NV); rect(19, 25, 43, 1, C.BD)
      for (let x = 22; x < 60; x += 5) twinkle(x, 28, C.GL)
      for (let x = 19; x < 62; x += 2) set(x, 31, C.NV)
      // 車輪（在車身兩側，前面被人面獅身擋住一部分）
      for (const wx of [17, 63]) { disc(wx, 84, 6, C.GD); disc(wx, 84, 4.5, C.G); disc(wx, 84, 1.5, C.GD); line(wx - 4, 84, wx + 4, 84, C.GD); line(wx, 80, wx, 88, C.GD) }
      // 御者：站在車裡，只露出腰部以上；盔甲、肩上新月、星冠、右手持權杖
      line(30, 38, 30, 68, C.BR); disc(30, 37, 1.5, C.GL)
      robe(40, 53, 70, 5, 7, C.GYL, C.GY)
      rect(38, 57, 5, 5, C.G); set(40, 59, C.R)
      for (const [mx, d] of [[34, -1], [46, 1]]) { disc(mx, 54, 2.4, C.GL); disc(mx + d, 53, 2, C.GYL) }
      arm(35, 56, 31, 62, C.GYL)
      arm(45, 56, 49, 63, C.GYL)
      face(40, 48, { hair: C.GL })
      rect(36, 43, 9, 2, C.G); set(36, 42, C.GL); set(44, 42, C.GL)
      twinkle(40, 40, C.GL)
      // 石造車身：前臉有翼圓盤，下面一面盾
      rect(20, 66, 40, 18, C.GYL); rect(54, 66, 6, 18, C.GY); rect(20, 66, 40, 2, C.WH)
      rect(20, 68, 40, 1, C.GY)
      disc(40, 73, 2.4, C.R); set(39, 72, C.PK)
      poly([37, 73, 28, 70, 29, 74, 37, 75], C.B); poly([43, 73, 52, 70, 51, 74, 43, 75], C.BD)
      rect(36, 77, 9, 5, C.G); rect(36, 77, 9, 1, C.GL); disc(40, 79.5, 1.4, C.RD)
      // 人面獅身：正面坐姿，條紋頭巾、前爪；黑的在左、白的在右
      const sphinx = (cx, body, shade, stripe, faceC) => {
        poly([cx - 5, 84, cx + 6, 84, cx + 7, 92, cx - 6, 92], body)
        for (let y = 86; y < 92; y += 2) rect(cx - 5, y, 12, 1, stripe)
        disc(cx + 0.5, 84, 4, body); rect(cx - 3, 81, 8, 1, stripe)
        rect(cx - 2, 84, 6, 6, faceC); set(cx - 1, 86, C.K); set(cx + 2, 86, C.K); rect(cx, 88, 2, 1, shade)
        rect(cx - 7, 92, 15, 6, body); rect(cx + 3, 92, 5, 6, shade)
        rect(cx - 7, 97, 5, 2, body); rect(cx + 3, 97, 5, 2, shade)
      }
      sphinx(25, C.D, C.K, C.GY, C.D)
      sphinx(55, C.WH, C.GYL, C.B, C.WH)
      set(24, 86, C.GL); set(27, 86, C.GL)
    },
  },
  {
    num: 'VIII', en: 'STRENGTH', zh: '力量', title: 'Strength',
    keys: ['合上獅口的女子', '獅子', '無限符號', '花環', '白袍', '藍色的山'],
    bg() {
      sky([C.GL, C.SL], 16, 80)
      mountain(48, 48, 18, 80, C.BL, C.B, C.WH)
      rect(6, 78, 68, 24, mix(C.GR, C.GRL, 0.3))
      for (const [x, y] of [[10, 86], [16, 95], [64, 98]]) { set(x, y, C.R); set(x + 1, y, C.GL) }
      ring(32, 49, 2, C.K); ring(36, 49, 2, C.K)
    },
    ch() {
      rect(42, 80, 24, 12, C.G); rect(42, 88, 24, 4, C.GD); rect(43, 92, 3, 6, C.G); rect(48, 92, 3, 5, C.GD); rect(58, 92, 3, 6, C.G); rect(63, 92, 3, 5, C.GD)
      line(66, 82, 71, 75, C.G); disc(71, 74, 1.4, C.BR)
      disc(46, 77, 7, mix(C.OR, C.BR, 0.3)); disc(45, 78, 4, C.G); set(43, 77, C.K); rect(40, 80, 5, 2, C.RD); set(41, 80, C.WH)
      robe(34, 64, 99, 3, 10, C.WH, C.GYL)
      for (let x = 30; x <= 38; x += 2) set(x, 72, x % 4 ? C.R : C.GR)
      face(34, 59, { hair: C.G, long: 8 })
      for (const x of [30, 32, 34, 36, 38]) set(x, 54, x % 4 ? C.R : C.GR)
      arm(31, 66, 41, 75, C.WH); arm(37, 66, 41, 81, C.WH)
      // 獅子的眼睛最後畫，才不會被女子的手蓋掉
      rect(45, 76, 2, 2, C.K); set(45, 76, C.WH); set(43, 79, C.BRD)
    },
  },
  {
    num: 'IX', en: 'THE HERMIT', zh: '隱士', title: 'The Hermit',
    keys: ['六芒星燈籠', '手杖', '灰色斗篷與兜帽', '白鬍子', '雪峰', '夜空'],
    bg() {
      sky([C.D, C.NV, C.BD])
      for (const [x, y] of [[12, 22], [30, 20], [52, 26], [66, 20], [60, 40], [18, 38]]) set(x, y, C.WH)
      poly([6, 82, 34, 70, 74, 90, 74, 102, 6, 102], C.WH); poly([34, 70, 74, 90, 74, 102, 50, 102], mix(C.WH, C.GYL, 0.5))
      rgrad(25, 69, 12, [C.SO, C.BD, null])
    },
    ch() {
      line(48, 52, 46, 99, C.BR)
      robe(38, 60, 99, 5, 11, C.GY, C.D); rect(33, 61, 1, 38, C.GYL)
      disc(38, 57, 6, C.GY)
      face(37, 58, { beard: C.WH, beardLen: 12 })
      arm(34, 63, 26, 66, C.GY)
      rect(23, 66, 5, 7, C.G); rect(24, 67, 3, 5, C.GL); set(25, 69, C.WH); set(25, 68, C.WH); set(25, 70, C.WH); set(24, 69, C.WH); set(26, 69, C.WH)
      arm(42, 63, 47, 66, C.GY)
    },
  },
  {
    num: 'X', en: 'WHEEL OF FORTUNE', zh: '命運之輪', title: 'Wheel of Fortune',
    keys: ['刻著 TARO 的輪子', '持劍的人面獅身', '往下的蛇', '往上的阿努比斯', '四角的天使、老鷹、牛、獅子', '雲'],
    bg() {
      sky([C.B, C.BL])
      cloud(7, 26, 14); cloud(59, 26, 14); cloud(7, 92, 14); cloud(59, 92, 14); cloud(30, 88, 20)
    },
    ch() {
      disc(40, 58, 17, C.OR); disc(40, 58, 14.5, C.GL); disc(40, 58, 8, C.OR); disc(40, 58, 6.5, C.SL); disc(40, 58, 2, C.OR)
      for (let a = 0; a < 8; a++) { const t = (a * Math.PI) / 4 + Math.PI / 8; line(40 + Math.cos(t) * 7, 58 + Math.sin(t) * 7, 40 + Math.cos(t) * 14, 58 + Math.sin(t) * 14, C.OR) }
      text('T', 39, 42, C.RD); text('A', 50, 56, C.RD); text('R', 39, 70, C.RD); text('O', 28, 56, C.RD)
      rect(35, 37, 11, 4, C.B); disc(42, 34, 2.6, C.B); rect(40, 31, 5, 2, C.BD); set(43, 34, C.K)
      line(36, 27, 36, 38, C.GYL); rect(35, 36, 3, 1, C.G)
      for (let y = 40; y < 78; y++) { const x = 20 + Math.round(Math.sin(y / 3) * 2); set(x, y, C.G); set(x + 1, y, C.GD) }
      disc(21, 78, 1.6, C.G)
      robe(60, 68, 82, 2, 4, C.R, C.RD); disc(60, 64, 2.8, C.R); poly([61, 63, 66, 65, 61, 66], C.R); line(59, 62, 58, 58, C.R); line(61, 62, 62, 58, C.R); set(61, 63, C.K)
      beasts()
    },
  },
  {
    num: 'XI', en: 'JUSTICE', zh: '正義', title: 'Justice',
    keys: ['豎直的劍', '天秤', '方形寶石的冠', '紅袍綠披風', '兩根柱子', '紫色帷幕'],
    bg() {
      sky([C.GL, C.SL], 16, 26)
      rect(14, 24, 52, 62, C.PU); for (let x = 18; x < 66; x += 6) rect(x, 24, 1, 62, C.PL)
      rect(7, 16, 8, 86, C.GY); rect(7, 16, 2, 86, C.GYL); rect(65, 16, 8, 86, C.GY); rect(65, 16, 2, 86, C.GYL)
      rect(6, 86, 68, 16, C.GY); rect(6, 86, 68, 1, C.GYL)
    },
    ch() {
      rect(28, 42, 24, 46, C.GY); rect(28, 42, 24, 2, C.GYL)
      poly([34, 62, 36, 62, 31, 96, 27, 96], C.GR); poly([45, 62, 47, 62, 53, 96, 49, 96], C.GRD)
      robe(40, 61, 99, 5, 12, C.R, C.RD)
      face(40, 56, { hair: C.BR, long: 6 })
      rect(36, 49, 9, 3, C.G); set(36, 48, C.GL); set(44, 48, C.GL); rect(39, 49, 3, 2, C.B)
      arm(36, 63, 30, 68, C.R); line(30, 38, 30, 66, C.GYL); set(30, 37, C.WH); rect(28, 66, 5, 1, C.G); rect(30, 67, 1, 3, C.BRD)
      arm(44, 63, 50, 67, C.R); rect(50, 67, 1, 3, C.G); rect(44, 70, 13, 1, C.G)
      line(44, 70, 42, 76, C.G); line(44, 70, 46, 76, C.G); rect(41, 76, 7, 1, C.G)
      line(56, 70, 54, 76, C.G); line(56, 70, 58, 76, C.G); rect(53, 76, 7, 1, C.G)
    },
  },
  {
    num: 'XII', en: 'THE HANGED MAN', zh: '吊人', title: 'The Hanged Man',
    keys: ['倒吊', '交叉成「4」的雙腿', '光環', '活木 T 字架', '背在身後的手', '藍衣紅褲'],
    bg() {
      sky([C.GYL, C.BL])
      rect(6, 94, 68, 8, C.GR); rect(6, 94, 68, 1, C.GRL)
      rgrad(40, 79, 10, [C.GL, C.SL, null])
      line(14, 20, 14, 101, C.BR, 3); line(66, 20, 66, 101, C.BR, 3); line(12, 22, 68, 22, C.BR, 3); rect(12, 21, 56, 1, C.GD)
      for (const [x, y] of [[20, 19], [34, 19], [52, 19], [62, 19], [12, 40], [68, 52], [12, 70]]) { disc(x, y, 2, C.GR); set(x - 1, y - 1, C.GRL) }
    },
    ch() {
      line(40, 23, 40, 26, C.PD)
      rect(38, 26, 4, 2, C.BRD)
      line(40, 28, 40, 48, C.R, 3)
      line(39, 47, 33, 40, C.R, 2); line(33, 40, 39, 36, C.R, 2); rect(38, 35, 3, 2, C.BRD)
      robe(40, 48, 72, 7, 4, C.B, C.BD); rect(34, 58, 13, 1, C.BRD)
      line(36, 70, 32, 64, C.B, 2); line(45, 70, 48, 64, C.B, 2)
      disc(40, 79, 4.4, C.GL); disc(40, 77.5, 3.6, C.SK); set(43, 77, C.SKD); set(43, 76, C.SKD)
      set(38, 76, C.K); set(41, 76, C.K)
    },
  },
  {
    num: 'XIII', en: 'DEATH', zh: '死神', title: 'Death',
    keys: ['騎白馬的黑甲骷髏', '白玫瑰黑旗', '倒下的國王', '祈禱的主教', '孩子', '雙塔間升起的太陽', '河與船'],
    bg() {
      sky([C.GY, C.GYL, C.SL], 16, 80)
      disc(63, 72, 5, C.GL)
      rect(55, 56, 5, 26, C.GYL); rect(66, 56, 5, 26, C.GYL); rect(58, 56, 2, 26, C.GY); rect(69, 56, 2, 26, C.GY)
      rect(6, 80, 68, 6, C.B); rect(10, 82, 8, 1, C.BL); rect(44, 81, 4, 2, C.BRD)
      rect(6, 86, 68, 16, mix(C.GRD, C.GR, 0.3))
    },
    ch() {
      line(50, 62, 54, 74, C.GYL, 2)
      rect(24, 62, 26, 12, C.WH); rect(24, 71, 26, 3, C.GYL)
      poly([24, 62, 31, 62, 25, 50, 19, 52], C.WH); rect(12, 50, 9, 5, C.WH); set(14, 51, C.K); rect(12, 53, 3, 2, C.GYL)
      rect(26, 74, 2, 14, C.WH); rect(31, 74, 2, 12, C.GYL); rect(43, 74, 2, 14, C.WH); rect(47, 74, 2, 12, C.GYL)
      rect(30, 60, 14, 6, C.R)
      robe(38, 46, 64, 3, 5, C.D, C.NV); rect(35, 48, 1, 14, C.GY)
      disc(38, 40, 4, C.D); line(38, 36, 44, 33, C.R, 2)
      disc(38, 42, 3.4, C.WH); set(37, 42, C.K); set(39, 42, C.K); rect(37, 45, 3, 1, C.GYL)
      line(30, 28, 30, 62, C.BR); rect(31, 28, 13, 9, C.D); disc(37, 32, 2.5, C.WH); set(37, 32, C.GL)
      rect(12, 92, 15, 4, C.R); disc(29, 93, 2.8, C.SK); rect(30, 89, 4, 2, C.G)
      robe(60, 80, 98, 3, 6, C.GL, C.G); face(60, 76, {}); poly([57, 73, 64, 73, 60.5, 66], C.G); rect(56, 82, 2, 2, C.SK)
      disc(50, 92, 2.6, C.SK); disc(50, 90.5, 2.6, C.GL); disc(50, 92.5, 2, C.SK); rect(48, 95, 5, 5, C.PA)
    },
  },
  {
    num: 'XIV', en: 'TEMPERANCE', zh: '節制', title: 'Temperance',
    keys: ['紅翼天使', '兩杯之間流動的水', '一腳在水中一腳在岸上', '胸前的三角形', '通往山頂皇冠的小路', '鳶尾花'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      mountain(62, 60, 12, 84, C.PL, C.PU, C.WH)
      rgrad(62, 58, 6, [C.GL, C.SL, null])
      rect(6, 82, 40, 20, mix(C.GR, C.GRL, 0.25))
      rect(38, 86, 36, 16, C.B); rect(42, 90, 8, 1, C.BL); rect(56, 95, 10, 1, C.BL)
      poly([44, 86, 50, 86, 63, 62, 61, 62], C.PD)
      for (const x of [10, 16, 22]) { line(x, 92, x, 86, C.GR); disc(x, 85, 1.4, C.PU); set(x, 84, C.PL) }
    },
    ch() {
      poly([30, 58, 13, 40, 17, 62, 28, 72], C.R); poly([38, 58, 55, 40, 51, 62, 40, 72], C.RD)
      line(17, 46, 28, 62, C.RD); line(51, 46, 40, 62, C.R)
      robe(34, 59, 98, 4, 10, C.WH, C.GYL)
      rect(32, 62, 5, 5, C.GYL); poly([32, 66.5, 37, 66.5, 34.5, 62], C.OR)
      disc(34, 53, 6, C.GL)
      face(34, 54, { hair: C.GL }); set(34, 51, C.G)
      arm(31, 61, 26, 66, C.WH); rect(23, 64, 4, 4, C.G); rect(23, 64, 4, 1, C.GL)
      arm(37, 61, 44, 74, C.WH); rect(44, 73, 4, 4, C.G); rect(44, 73, 4, 1, C.GL)
      line(27, 67, 44, 74, C.BL); line(27, 68, 44, 75, C.WH)
      rect(29, 96, 4, 2, C.SK); rect(38, 97, 4, 2, C.SKD)
    },
  },
  {
    num: 'XV', en: 'THE DEVIL', zh: '惡魔', title: 'The Devil',
    keys: ['山羊角', '蝙蝠翅膀', '倒五芒星', '朝下的火炬', '鎖鏈', '被鎖住的男女', '黑色台座'],
    bg() {
      sky([C.D, C.NV, C.D])
      pentagram(40, 27, 6, C.WH, true)
      rect(28, 72, 24, 16, C.GY); rect(28, 72, 24, 2, C.GYL); rect(48, 74, 4, 14, C.D)
      rect(6, 94, 68, 8, C.BRD)
    },
    ch() {
      poly([36, 44, 12, 30, 16, 38, 11, 46, 18, 46, 15, 54, 34, 56], C.PU)
      poly([44, 44, 68, 30, 64, 38, 69, 46, 62, 46, 65, 54, 46, 56], C.PU)
      line(16, 38, 34, 50, C.D); line(64, 38, 46, 50, C.D)
      robe(40, 47, 66, 4, 6, C.BR, C.BRD); rect(35, 64, 4, 8, C.BRD); rect(42, 64, 4, 8, C.BRD); rect(35, 71, 4, 1, C.GY); rect(42, 71, 4, 1, C.GY)
      line(36, 39, 32, 33, C.GYL, 2); line(44, 39, 48, 33, C.GYL, 2)
      face(40, 42, { skin: C.SKD, skinD: C.BR, eye: C.R })
      arm(36, 49, 30, 44, C.BR, C.SKD)
      arm(44, 49, 50, 58, C.BR, C.SKD); line(50, 58, 53, 68, C.BRD, 2); disc(53, 70, 2, C.OR); set(53, 71, C.GL)
      line(34, 78, 24, 82, C.GYL); line(46, 78, 56, 82, C.GYL)
      face(22, 80, { hair: C.BRD }); set(19, 75, C.GYL); set(25, 75, C.GYL)
      robe(22, 85, 96, 3, 3, C.SK, C.SKD); rect(20, 96, 2, 3, C.SK); rect(23, 96, 2, 3, C.SKD)
      line(18, 92, 13, 89, C.OR); set(12, 88, C.GL)
      face(58, 80, { hair: C.G, long: 8 }); set(55, 75, C.GYL); set(61, 75, C.GYL)
      robe(58, 85, 96, 3, 3, C.SK, C.SKD); rect(56, 96, 2, 3, C.SK); rect(59, 96, 2, 3, C.SKD)
      line(62, 92, 66, 90, C.GR); disc(67, 91, 1.4, C.PU); disc(66, 93, 1.2, C.PU)
    },
  },
  {
    num: 'XVI', en: 'THE TOWER', zh: '塔', title: 'The Tower',
    keys: ['閃電', '被打飛的王冠', '窗口竄出的火焰', '墜落的兩人', '落下的火花', '岩峰'],
    bg() {
      sky([C.D, C.NV, C.BD])
      disc(62, 22, 5, C.GY); disc(68, 25, 4, C.GY); disc(14, 30, 4, C.GY)
      line(10, 16, 22, 30, C.GL, 2); line(22, 30, 18, 34, C.GL, 2); line(18, 34, 32, 44, C.GL, 2)
      poly([16, 102, 30, 80, 50, 78, 64, 102], C.BRD); poly([16, 102, 30, 80, 36, 80, 28, 102], C.BR)
    },
    ch() {
      rect(32, 40, 16, 40, C.GYL); rect(44, 40, 4, 40, C.GY)
      for (let y = 44; y < 80; y += 5) rect(32, y, 16, 1, C.GY)
      rect(31, 37, 18, 3, C.GYL); for (let x = 31; x < 49; x += 4) rect(x, 35, 2, 2, C.GYL)
      rect(36, 48, 3, 4, C.OR); rect(42, 58, 3, 4, C.OR); rect(37, 70, 4, 8, C.D)
      disc(36, 34, 3, C.OR); disc(42, 32, 3, C.R); disc(39, 31, 2, C.GL)
      rect(46, 46, 3, 2, C.OR); set(48, 45, C.GL); rect(45, 56, 4, 2, C.R); set(46, 55, C.GL)
      rect(50, 26, 8, 3, C.G); set(50, 25, C.GL); set(54, 24, C.GL); set(57, 25, C.GL)
      robe(20, 50, 64, 2, 5, C.R, C.RD); disc(20, 68, 3, C.SK); rect(17, 70, 7, 2, C.G); line(17, 52, 13, 48, C.SK); line(23, 52, 27, 48, C.SK)
      robe(60, 58, 72, 2, 5, C.B, C.BD); disc(60, 76, 3, C.SK); disc(60, 77.5, 2.4, C.BRD); line(57, 60, 54, 56, C.SK); line(63, 60, 66, 56, C.SK)
      for (const [x, y] of [[12, 56], [26, 40], [54, 42], [66, 64], [16, 78], [58, 88], [24, 94]]) { set(x, y, C.GL); set(x, y + 1, C.OR) }
    },
  },
  {
    num: 'XVII', en: 'THE STAR', zh: '星星', title: 'The Star',
    keys: ['八芒大星', '七顆小星', '跪著倒水的女子', '兩只水壺', '池水與大地', '樹上的朱鷺'],
    // 重新設計：大星加光暈、七顆小星繞一圈；女子單膝跪在岸邊、右腳踩進池裡；
    // 兩道水流畫在背景層（不描邊，才像水不像棍子），倒在地上的那道分成五條小溪；右後方小丘的樹上停著朱鷺
    bg() {
      sky([C.NV, C.BD, C.PU], 16, 84)
      rgrad(40, 30, 13, [C.SL, C.GL, null, null])
      for (let k = 0; k < 7; k++) {
        // 整圈轉半格，正上方留空，小星才不會黏在大星的尖角上
        const a = -Math.PI / 2 + Math.PI / 7 + (k * 2 * Math.PI) / 7
        const x = Math.round(40 + Math.cos(a) * 26), y = Math.round(31 + Math.sin(a) * 14)
        star8(x, y, 2, C.GL); set(x, y, C.WH)
      }
      star8(40, 30, 10, C.GL); star8(40, 30, 5, C.WH); disc(40, 30, 2, C.WH)
      mountain(18, 64, 14, 84, C.PU, C.D, C.PL)
      poly([46, 84, 56, 70, 74, 67, 74, 86], C.GRD); poly([46, 84, 56, 70, 60, 70, 52, 84], C.GR)
      line(64, 70, 64, 58, C.BRD); disc(64, 55, 5, C.GR); disc(62, 53, 2.5, C.GRL)
      disc(66, 49, 1.6, C.R); line(67, 49, 70, 51, C.RD); line(65, 50, 65, 52, C.RD)
      // 岸與池
      rect(6, 82, 40, 20, mix(C.GR, C.GRL, 0.25)); rect(6, 82, 40, 1, C.GRL)
      poly([44, 85, 52, 83, 74, 83, 74, 102, 40, 102], C.B); line(44, 85, 52, 83, C.BL)
      for (const [x, y, w] of [[50, 90, 8], [62, 95, 9], [48, 99, 6]]) rect(x, y, w, 1, C.BL)
      // 左壺的水倒在地上，分成五條小溪
      line(23, 75, 21, 79, C.BL); line(21, 79, 19, 84, C.BL); line(22, 76, 20, 80, C.WH)
      for (const [x, y] of [[8, 90], [11, 95], [16, 98], [23, 97], [27, 92]]) line(19, 85, x, y, C.BL)
      // 右壺的水倒進池裡，落點有水花
      line(53, 75, 55, 80, C.BL); line(55, 80, 56, 87, C.BL); line(54, 75, 56, 80, C.WH)
      set(54, 88, C.WH); set(58, 88, C.WH); rect(53, 89, 7, 1, C.BL)
    },
    ch() {
      // 金色長髮垂在背後
      poly([33, 56, 37, 56, 36, 76, 31, 78], C.GL)
      robe(38, 63, 76, 3, 4, C.SK, C.SKD)
      // 左膝跪地、小腿貼著地面往後；右腿屈起，腳踩進池裡
      line(36, 76, 35, 85, C.SK, 3); line(34, 86, 27, 87, C.SKD, 2)
      line(40, 76, 46, 79, C.SK, 3); line(46, 79, 47, 88, C.SKD, 2)
      face(38, 58, { hair: C.GL, long: 8 })
      // 兩手各拿一只陶壺：左壺往地上倒、右壺往池裡倒
      arm(35, 65, 29, 72, C.SK)
      disc(26, 75, 2.6, C.OR); rect(27, 75, 2, 3, C.RD); rect(26, 71, 2, 2, C.OR); set(23, 74, C.OR)
      arm(41, 65, 48, 71, C.SK)
      disc(50, 74, 2.6, C.OR); rect(51, 74, 2, 3, C.RD); rect(49, 70, 2, 2, C.OR); set(53, 74, C.OR)
    },
  },
  {
    num: 'XVIII', en: 'THE MOON', zh: '月亮', title: 'The Moon',
    keys: ['有臉的月亮', '落下的露珠', '狗與狼', '從池中爬出的螯蝦', '兩座塔', '蜿蜒的小路'],
    bg() {
      sky([C.BD, C.B, C.BL], 16, 74)
      for (let a = 0; a < 16; a++) { const t = (a * Math.PI) / 8; line(40 + Math.cos(t) * 11, 30 + Math.sin(t) * 11, 40 + Math.cos(t) * (a % 2 ? 13 : 15), 30 + Math.sin(t) * (a % 2 ? 13 : 15), C.GL) }
      disc(40, 30, 9, C.GL); disc(43, 30, 7, C.SL); rect(40, 28, 3, 1, C.GD); set(46, 31, C.GD); rect(43, 34, 3, 1, C.GD)
      for (const [x, y] of [[22, 44], [30, 48], [40, 46], [50, 48], [58, 44], [34, 54], [46, 54]]) { set(x, y, C.GL); set(x, y + 1, C.G) }
      mountain(40, 60, 18, 74, C.PL, C.PU, C.WH)
      rect(8, 50, 8, 30, C.GYL); rect(14, 50, 2, 30, C.GY); poly([7, 50, 17, 50, 12, 45], C.GY); rect(11, 56, 2, 3, C.GL)
      rect(64, 50, 8, 30, C.GYL); rect(70, 50, 2, 30, C.GY); poly([63, 50, 73, 50, 68, 45], C.GY); rect(67, 56, 2, 3, C.GL)
      rect(6, 72, 68, 18, mix(C.GR, C.GRD, 0.3))
      poly([37, 90, 44, 90, 46, 84, 41, 78, 44, 72, 41, 72, 38, 78, 42, 84], C.PD)
      rect(6, 90, 68, 12, C.B); rect(12, 94, 10, 1, C.BL); rect(54, 96, 12, 1, C.BL)
    },
    ch() {
      rect(16, 80, 10, 5, C.GL); rect(16, 84, 10, 1, C.G); rect(17, 85, 1, 4, C.GL); rect(24, 85, 1, 4, C.GL); disc(27, 77, 2.6, C.GL); line(28, 75, 30, 72, C.GL); set(27, 77, C.K); line(16, 81, 13, 78, C.GL)
      rect(54, 80, 10, 5, C.GY); rect(54, 84, 10, 1, C.D); rect(55, 85, 1, 4, C.GY); rect(62, 85, 1, 4, C.GY); disc(53, 77, 2.6, C.GY); line(52, 75, 50, 72, C.GY); set(53, 77, C.K); line(64, 81, 67, 78, C.GY)
      rect(38, 93, 5, 6, C.OR); rect(41, 93, 2, 6, C.R); disc(36, 91, 1.6, C.R); disc(45, 91, 1.6, C.R); line(39, 92, 37, 88, C.OR); line(42, 92, 44, 88, C.OR)
    },
  },
  {
    num: 'XIX', en: 'THE SUN', zh: '太陽', title: 'The Sun',
    keys: ['有臉的太陽', '騎白馬的孩子', '紅色大旗', '向日葵', '石牆', '紅羽毛'],
    bg() {
      sky([C.BL, C.SL], 16, 66)
      for (let a = 0; a < 20; a++) { const t = (a * Math.PI) / 10; line(40 + Math.cos(t) * 12, 32 + Math.sin(t) * 12, 40 + Math.cos(t) * (a % 2 ? 15 : 18), 32 + Math.sin(t) * (a % 2 ? 15 : 18), a % 2 ? C.G : C.GL) }
      disc(40, 32, 11, C.G); disc(39, 31, 9, C.GL)
      set(36, 30, C.GD); set(43, 30, C.GD); rect(38, 35, 4, 1, C.GD); set(37, 34, C.GD); set(42, 34, C.GD)
      for (const x of [12, 22, 32, 48, 58, 68]) { line(x, 66, x, 58, C.GR); disc(x, 57, 2.6, C.GL); disc(x, 57, 1, C.BR) }
      rect(6, 64, 68, 14, C.GYL); for (let y = 64; y < 78; y += 4) rect(6, y, 68, 1, C.GY); for (let x = 8; x < 74; x += 8) rect(x + ((x / 8) % 2) * 4, 65, 1, 3, C.GY)
      rect(6, 78, 68, 24, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      line(28, 46, 29, 88, C.BR)
      poly([28, 46, 14, 44, 8, 52, 13, 60, 28, 58], C.R); poly([14, 44, 8, 52, 13, 60, 12, 52], C.RD)
      rect(30, 80, 24, 10, C.WH); rect(30, 87, 24, 3, C.GYL)
      poly([50, 80, 56, 80, 62, 70, 57, 68], C.WH); rect(57, 67, 7, 5, C.WH); set(61, 68, C.K)
      rect(32, 90, 2, 10, C.WH); rect(37, 90, 2, 9, C.GYL); rect(46, 90, 2, 10, C.WH); rect(51, 90, 2, 9, C.GYL)
      line(30, 81, 25, 88, C.GYL, 2)
      robe(39, 71, 82, 3, 4, C.SK, C.SKD)
      line(38, 82, 36, 88, C.SK, 2)
      face(39, 66, { hair: C.GL })
      for (const x of [35, 37, 39, 41, 43]) set(x, 62, x % 4 === 3 ? C.R : C.GR)
      line(40, 62, 46, 57, C.R, 2)
      arm(36, 72, 29, 64, C.SK)
    },
  },
  {
    num: 'XX', en: 'JUDGEMENT', zh: '審判', title: 'Judgement',
    keys: ['吹號的天使加百列', '紅十字白旗', '從棺木中站起的人', '高舉的雙手', '冰山', '海'],
    bg() {
      sky([C.B, C.BL, C.SL], 16, 88)
      mountain(14, 66, 12, 88, C.WH, C.GYL); mountain(66, 68, 12, 88, C.WH, C.GYL)
      rect(6, 86, 68, 16, C.BD); rect(10, 92, 10, 1, C.B); rect(50, 98, 14, 1, C.B)
    },
    ch() {
      wings(31, C.R, mix(C.R, C.RD, 0.35), C.RD)
      robe(40, 32, 44, 3, 6, C.PL, C.PU)
      face(40, 27, { hair: C.G })
      cloud(24, 40, 32)
      // 號角：從嘴邊往左下斜伸的細長金管，上緣一條亮線，尾端張開成喇叭口（口內深色）；手扶在管子上
      line(37, 30, 24, 42, C.G); line(37, 29, 24, 41, C.GL)
      poly([24.7, 42.7, 23.3, 41.3, 17.6, 43.4, 22.4, 48.6], C.G)
      line(18, 44, 22, 48, C.GD)
      rect(33, 32, 2, 2, C.SK)
      // 號角下掛的紅十字白旗
      rect(26, 41, 7, 6, C.WH); rect(29, 41, 1, 6, C.R); rect(26, 43, 7, 1, C.R)
      rect(31, 90, 18, 6, C.BR); rect(31, 90, 18, 1, C.G)
      robe(40, 84, 92, 3, 4, C.GYL, C.GY); face(40, 79, { skin: C.GYL, skinD: C.GY })
      line(37, 85, 32, 77, C.GYL, 2); line(44, 85, 48, 77, C.GYL, 2)
      rect(12, 92, 14, 5, C.BR); rect(12, 92, 14, 1, C.G)
      robe(19, 86, 93, 2, 3, C.GYL, C.GY); face(19, 81, { skin: C.GYL, skinD: C.GY, hair: C.G, long: 6 }); line(16, 87, 13, 80, C.GYL); line(22, 87, 25, 80, C.GYL)
      rect(54, 93, 14, 4, C.BR); rect(54, 93, 14, 1, C.G)
      disc(61, 88, 2.8, C.GYL); rect(59, 91, 5, 3, C.GYL); line(59, 91, 56, 86, C.GYL); line(63, 91, 66, 86, C.GYL); set(60, 88, C.K); set(62, 88, C.K)
    },
  },
  {
    num: 'XXI', en: 'THE WORLD', zh: '世界', title: 'The World',
    keys: ['月桂花環', '紅色緞帶', '舞者', '紫色長巾', '雙手的權杖', '四角的四活物'],
    bg() {
      sky([C.B, C.BL, C.SL])
      cloud(7, 26, 14); cloud(59, 26, 14); cloud(7, 92, 14); cloud(59, 92, 14)
    },
    ch() {
      for (let y = 30; y <= 86; y++) for (let x = 22; x <= 58; x++) {
        const e = ((x - 40) / 16) ** 2 + ((y - 58) / 26) ** 2
        if (e <= 1 && e >= 0.7) set(x, y, (x + y) % 3 === 0 ? C.GRL : bt(x, y) < 0.4 ? C.GRD : C.GR)
      }
      line(37, 30, 43, 36, C.R, 2); line(43, 30, 37, 36, C.R, 2); line(37, 80, 43, 86, C.R, 2); line(43, 80, 37, 86, C.R, 2)
      face(40, 43, { hair: C.BRD, long: 6 })
      robe(40, 48, 63, 3, 4, C.SK, C.SKD)
      line(41, 63, 41, 78, C.SK, 2); line(39, 63, 35, 70, C.SKD, 2); line(35, 70, 40, 74, C.SKD, 2)
      poly([35, 48, 44, 50, 46, 66, 41, 72, 38, 62, 42, 54], C.PU); line(44, 50, 46, 66, C.PL)
      arm(37, 50, 31, 56, C.SK); line(31, 51, 31, 61, C.WH)
      arm(43, 50, 49, 55, C.SK); line(49, 50, 49, 60, C.WH)
      beasts()
    },
  },
]

// ===================== 56 張小阿卡納 =====================
// 數字牌用花色符號排成牌點、背景依花色換場景；王牌是從雲裡伸出的手；宮廷牌是侍者站立、騎士騎馬、皇后與國王坐王座

// ---- 花色符號（畫在角色層，會自動描邊） ----
function wandSym(cx, cy, h) {
  const t = Math.round(cy - h / 2)
  rect(cx, t, 2, h, C.BR); rect(cx, t, 1, h, C.SO); rect(cx, t - 1, 2, 1, C.GRL)
  for (let y = t + 2; y < t + h - 3; y += Math.max(4, Math.round(h / 4))) { set(cx - 1, y, C.GR); set(cx - 2, y - 1, C.GRL); set(cx + 2, y + 2, C.GR); set(cx + 3, y + 1, C.GRL) }
}
function swordSym(cx, cy, h) {
  const t = Math.round(cy - h / 2), bl = h - 6
  set(cx, t, C.GYL); rect(cx, t + 1, 2, bl, C.GYL); rect(cx, t + 1, 1, bl, C.WH)
  rect(cx - 2, t + 1 + bl, 6, 1, C.G); rect(cx, t + 2 + bl, 2, 3, C.BRD); rect(cx, t + 5 + bl, 2, 1, C.G)
}
function cupSym(cx, cy, w) {
  const h = Math.round(w * 0.9), top = Math.round(cy - h / 2), bh = Math.round(h * 0.5)
  poly([cx - w / 2, top, cx + w / 2, top, cx + w / 4, top + bh, cx - w / 4, top + bh], C.G)
  rect(cx - w / 2, top, w, 1, C.GL); rect(Math.round(cx - w / 2 + 1), top + 1, 1, Math.max(1, bh - 2), C.GL)
  rect(cx - 1, top + bh, 2, h - bh - 1, C.G); rect(Math.round(cx - w / 3), top + h - 1, Math.round((w * 2) / 3), 1, C.GD)
}
function pentSym(cx, cy, r) { disc(cx, cy, r, C.G); ring(cx, cy, r, C.GD); pentagram(cx, cy, r - 1.6, C.GD); set(cx - r + 2, cy - r + 2, C.GL) }

// ---- 花色的背景場景 ----
function wandsBg() {
  sky([C.SO, C.SL], 16, 84)
  mountain(20, 62, 16, 84, C.OR, C.BR); mountain(56, 66, 14, 84, C.SO, C.OR)
  rect(6, 84, 68, 18, mix(C.G, C.GD, 0.3)); rect(6, 84, 68, 1, C.GL)
}
function pentaclesBg() {
  sky([C.SL, C.GL], 16, 82)
  for (let x = 4; x < 78; x += 8) { disc(x, 80, 4.5, C.GRD); set(x - 1, 77, C.GR) }
  rect(6, 82, 68, 20, mix(C.GR, C.GRL, 0.3)); rect(6, 82, 68, 1, C.GRL)
  for (const [x, y] of [[10, 88], [22, 95], [48, 92], [64, 97], [70, 86]]) { set(x, y, C.R); set(x + 1, y, C.WH) }
}
function swordsBg() {
  sky([C.GY, C.GYL, C.BL], 16, 86)
  cloud(8, 24, 16); cloud(48, 32, 18); cloud(26, 50, 12)
  rect(6, 86, 68, 16, mix(C.GY, C.D, 0.3)); rect(6, 86, 68, 1, C.GYL)
}
function cupsBg() {
  sky([C.BL, C.SL], 16, 80)
  rect(6, 80, 68, 22, C.B); rect(6, 80, 68, 1, C.WH)
  for (let y = 84; y < 102; y += 4) for (let x = 6 + (y % 8 ? 4 : 0); x < 74; x += 10) rect(x, y, 4, 1, C.BL)
}

const SUITS = [
  { en: 'WANDS', title: 'Wands', zh: '權杖', unit: '支', el: '火', scene: '沙漠與遠山', bg: wandsBg, robe: C.OR, robeD: C.RD, horse: [C.BR, C.BRD], aceKey: '冒出新芽的權杖',
    sym: (x, y, s) => wandSym(x, y, { s: 14, m: 22, c: 40 }[s]) },
  { en: 'PENTACLES', title: 'Pentacles', zh: '錢幣', unit: '枚', el: '土', scene: '花園與綠籬', bg: pentaclesBg, robe: C.GR, robeD: C.GRD, horse: [C.BRD, C.D], aceKey: '掌心托著的錢幣',
    sym: (x, y, s) => pentSym(x, y, { s: 5, m: 7, c: 6 }[s]) },
  { en: 'SWORDS', title: 'Swords', zh: '寶劍', unit: '把', el: '風', scene: '灰藍天空與雲', bg: swordsBg, robe: C.B, robeD: C.BD, horse: [C.WH, C.GYL], aceKey: '劍尖的王冠與花環',
    sym: (x, y, s) => swordSym(x, y, { s: 14, m: 22, c: 34 }[s]) },
  { en: 'CUPS', title: 'Cups', zh: '聖杯', unit: '只', el: '水', scene: '海與浪', bg: cupsBg, robe: C.BL, robeD: C.B, horse: [C.GYL, C.GY], aceKey: '五道水流與白鴿',
    sym: (x, y, s) => cupSym(x, y, { s: 8, m: 12, c: 10 }[s]) },
]

// 數字牌的牌點位置（2～10）
const PIPS = {
  2: [[40, 38], [40, 78]],
  3: [[40, 30], [40, 58], [40, 86]],
  4: [[28, 38], [52, 38], [28, 78], [52, 78]],
  5: [[28, 34], [52, 34], [40, 58], [28, 82], [52, 82]],
  6: [[28, 32], [52, 32], [28, 58], [52, 58], [28, 84], [52, 84]],
  7: [[28, 30], [52, 30], [40, 44], [28, 58], [52, 58], [28, 86], [52, 86]],
  8: [[28, 30], [52, 30], [40, 44], [28, 58], [52, 58], [40, 72], [28, 86], [52, 86]],
  9: [[28, 28], [52, 28], [28, 48], [52, 48], [40, 58], [28, 68], [52, 68], [28, 88], [52, 88]],
  10: [[28, 28], [52, 28], [40, 38], [28, 48], [52, 48], [28, 68], [52, 68], [40, 78], [28, 88], [52, 88]],
}

// ---- 王牌：從左邊雲裡伸出的手 ----
function aceCh(si) {
  const s = SUITS[si]
  if (si === 0 || si === 2) {
    // 權杖、寶劍：手直握；寶劍的劍尖套著王冠、兩側垂花環
    const fy = si === 0 ? 58 : 88
    if (si === 0) wandSym(31, 58, 72)
    else {
      // 劍長 50 格（劍柄落在拳頭裡），劍尖下方套王冠、兩側垂花環
      swordSym(31, 65, 50)
      const t = 40
      rect(27, t + 4, 10, 3, C.G); set(27, t + 3, C.GL); set(31, t + 2, C.GL); set(36, t + 3, C.GL); set(32, t + 5, C.R)
      line(26, t + 9, 28, t + 17, C.GR); line(37, t + 9, 35, t + 17, C.GR); set(27, t + 13, C.R); set(36, t + 13, C.R)
    }
    rect(16, fy - 2, 12, 5, C.SK); rect(16, fy + 2, 12, 1, C.SKD)
    rect(28, fy - 4, 7, 8, C.SK); rect(33, fy - 4, 2, 8, C.SKD); for (let y = fy - 2; y <= fy + 2; y += 2) rect(28, y, 3, 1, C.SKD)
    cloud(6, fy - 6, 16)
  } else {
    // 錢幣、聖杯：手心朝上托著
    if (si === 1) pentSym(38, 52, 14)
    else {
      cupSym(38, 52, 22)
      disc(38, 26, 2, C.WH); line(33, 24, 43, 24, C.WH); set(38, 28, C.GYL); rect(37, 31, 3, 1, C.GL)
    }
    rect(16, 74, 14, 5, C.SK); rect(16, 78, 14, 1, C.SKD)
    rect(28, 70, 18, 4, C.SK); rect(28, 73, 18, 1, C.SKD); for (let x = 30; x < 46; x += 3) set(x, 70, C.SKD)
    cloud(6, 68, 16)
  }
}
// 聖杯王牌的五道水流畫在背景層，不描邊才像水
function aceCupsStreams() {
  for (const [x0, x1] of [[28, 22], [31, 28], [45, 48], [48, 54]]) { line(x0, 44, x1, 98, C.BL); line(x0 + 1, 44, x1 + 1, 98, C.WH) }
  for (const [x, y] of [[34, 38], [38, 36], [42, 38]]) set(x, y, C.WH)
}

// ---- 宮廷牌 ----
function horse(cx, feet, c, cd, saddle) {
  rect(cx - 12, feet - 24, 24, 9, c); rect(cx - 12, feet - 17, 24, 2, cd)
  poly([cx + 8, feet - 24, cx + 13, feet - 24, cx + 17, feet - 32, cx + 12, feet - 34], c)
  rect(cx + 13, feet - 36, 7, 5, c); set(cx + 14, feet - 37, cd); set(cx + 17, feet - 35, C.K); rect(cx + 18, feet - 33, 2, 2, cd)
  rect(cx - 10, feet - 15, 2, 15, c); rect(cx - 6, feet - 15, 2, 14, cd); rect(cx + 6, feet - 15, 2, 15, c); rect(cx + 10, feet - 15, 2, 14, cd)
  line(cx - 12, feet - 23, cx - 16, feet - 13, cd, 2)
  rect(cx - 4, feet - 25, 9, 3, saddle)
}
function courtCh(si, rank) {
  const s = SUITS[si]
  if (rank === 11) {
    // 侍者：站著，雙手捧著花色符號
    line(35, 88, 34, 96, C.BRD, 2); line(38, 88, 39, 96, C.BRD, 2); rect(32, 96, 4, 2, C.BRD); rect(38, 96, 4, 2, C.BRD)
    robe(36, 63, 88, 3, 7, s.robe, s.robeD); rect(32, 74, 9, 1, C.G)
    face(36, 58, { hair: C.BR })
    rect(32, 53, 9, 2, s.robe); set(41, 53, C.GL)
    s.sym(50, 62, 'c')
    arm(39, 65, 48, 66, s.robe); arm(34, 65, 31, 74, s.robe)
  } else if (rank === 12) {
    // 騎士：穿盔甲騎馬，羽飾是花色的代表色，手往前舉著符號
    horse(36, 98, s.horse[0], s.horse[1], s.robe)
    line(37, 74, 39, 82, C.GY, 2)
    robe(36, 58, 75, 3, 5, C.GYL, C.GY); rect(33, 64, 7, 2, s.robe)
    face(36, 53, {}); rect(32, 48, 9, 2, C.GYL); line(36, 47, 31, 42, s.robe, 2)
    s.sym(52, 56, 'c')
    arm(39, 61, 50, 62, C.GYL)
  } else {
    // 皇后、國王：坐在王座上，戴冠，手持符號；國王有鬍子
    const king = rank === 14
    rect(26, 44, 28, 54, C.GY); rect(26, 44, 3, 54, C.GYL); rect(51, 44, 3, 54, C.D); rect(26, 44, 28, 2, s.robe)
    robe(40, 61, 98, 5, 12, s.robe, s.robeD)
    poly([35, 62, 37, 62, 32, 98, 29, 98], C.WH)
    face(40, 56, king ? { hair: C.BR, beard: C.BR } : { hair: C.BR, long: 8 })
    rect(36, 49, 9, 2, C.G); set(36, 48, C.GL); set(40, king ? 46 : 47, C.GL); set(44, 48, C.GL); if (king) set(40, 47, C.G)
    s.sym(52, 66, 'c')
    arm(44, 64, 50, 70, s.robe); arm(36, 64, 33, 74, s.robe)
  }
}

// ---- 情境牌用的共用小工具 ----
// 站立的人：h 是身高（頭心到腳底），o.back 畫背影；armL / armR 是手掌位置
function person(cx, feet, o) {
  const h = o.h || 40, hy = feet - h, hip = hy + Math.round(h * 0.55), st = o.stride || 0
  line(cx - 1, hip, cx - 2 - st, feet - 2, o.leg || C.BRD, 2)
  line(cx + 2, hip, cx + 3 + st, feet - 2, o.leg2 || o.leg || C.BRD, 2)
  rect(cx - 4 - st, feet - 2, 4, 2, o.shoe || C.BRD); rect(cx + 2 + st, feet - 2, 4, 2, o.shoe2 || o.shoe || C.BRD)
  robe(cx, hy + 5, o.long ? feet - 2 : hip + 2, 3, o.w || 5, o.c, o.cd)
  if (o.belt) rect(cx - 4, hy + Math.round(h * 0.4), 9, 1, o.belt)
  if (o.back) disc(cx, hy - 0.5, 4.2, o.hair || C.BR)
  else face(cx, hy, { hair: o.hair || C.BR, long: o.longHair })
  if (o.armL) arm(cx - 3, hy + 6, o.armL[0], o.armL[1], o.sleeve || o.c)
  if (o.armR) arm(cx + 3, hy + 6, o.armR[0], o.armR[1], o.sleeve || o.c)
  return hy
}
// 斜擺的權杖：(x0, y0) 是頂端，會冒新芽
function wandAt(x0, y0, x1, y1) {
  line(x0, y0, x1, y1, C.BR, 2); line(x0, y0, x1, y1, C.SO)
  for (const t of [0.2, 0.5, 0.78]) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; set(x - 2, y, C.GR); set(x - 3, y - 1, C.GRL); set(x + 2, y + 1, C.GR) }
  set(x0, y0 - 1, C.GRL)
}
function castle(x, base, w, h) {
  rect(x, base - h, w, h, C.GYL); rect(x + w - 2, base - h, 2, h, C.GY)
  for (let i = x; i < x + w; i += 3) rect(i, base - h - 2, 2, 2, C.GYL)
  const tx = Math.round(x + w / 2 - 2)
  rect(tx, base - h - 7, 5, 7, C.GYL); poly([tx - 1, base - h - 7, tx + 6, base - h - 7, tx + 2.5, base - h - 12], C.R); rect(tx + 2, base - h - 4, 1, 2, C.D)
}

// ---- 權杖 14 張情境（照 Rider-Waite 的構圖） ----
const WANDS_SCENES = {
  1: {
    keys: ['從雲中伸出的手', '冒出新芽的權杖', '山丘上的城堡', '河流'],
    bg() {
      sky([C.SO, C.SL], 16, 74)
      poly([6, 76, 20, 66, 36, 72, 52, 62, 74, 70, 74, 102, 6, 102], mix(C.GR, C.GRL, 0.3))
      castle(56, 66, 12, 8)
      poly([30, 102, 38, 102, 44, 90, 52, 80, 49, 80, 39, 90], C.B)
      disc(14, 74, 3, C.GRD); disc(22, 76, 3, C.GRD)
    },
    ch: () => aceCh(0),
  },
  2: {
    keys: ['站在城垛上的男子', '手中的地球儀', '一支握著、一支固定在牆上', '遠方的海與陸地', '牆上的玫瑰與百合'],
    bg() {
      sky([C.BL, C.SL], 16, 64)
      mountain(60, 54, 10, 64, C.PL, C.PU)
      rect(6, 64, 68, 8, C.B); rect(10, 66, 10, 1, C.BL); rect(40, 68, 12, 1, C.BL)
      rect(6, 72, 68, 10, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      wandSym(14, 60, 40); wandSym(48, 60, 40)
      const hy = person(38, 100, { h: 44, c: C.OR, cd: C.RD, hair: C.BRD, long: true, armL: [31, 66], armR: [47, 62] })
      rect(34, hy - 5, 9, 3, C.RD)
      disc(30, 64, 3, C.B); set(29, 63, C.GR); set(31, 65, C.GR); set(29, 62, C.BL)
      rect(6, 80, 68, 22, C.GYL); rect(6, 80, 68, 1, C.WH)
      for (let x = 6; x < 74; x += 8) rect(x, 76, 4, 4, C.GYL)
      for (const y of [86, 92, 98]) rect(6, y, 68, 1, C.GY)
      rose(58, 90); lily(63, 87)
    },
  },
  3: {
    keys: ['背對我們的男子', '三支權杖', '金色的海', '遠航的船', '懸崖'],
    bg() {
      sky([C.SO, C.GL, C.SL], 16, 66)
      mountain(64, 52, 10, 66, C.PL, C.PU)
      rect(6, 66, 68, 22, mix(C.GL, C.SO, 0.4)); rect(12, 72, 8, 1, C.WH); rect(44, 82, 10, 1, C.WH)
      rect(20, 72, 8, 2, C.BRD); poly([23, 64, 23, 71, 28, 71], C.WH)
      rect(50, 78, 8, 2, C.BRD); poly([53, 70, 53, 77, 58, 77], C.WH)
      poly([6, 88, 74, 85, 74, 102, 6, 102], C.BR); poly([6, 87, 74, 84, 74, 87, 6, 90], C.GR)
    },
    ch() {
      wandSym(16, 64, 44); wandSym(60, 64, 44); wandSym(46, 64, 48)
      const hy = person(38, 98, { h: 42, c: C.R, cd: C.RD, back: true, hair: C.BR, long: true, armR: [45, 66] })
      rect(34, hy - 2, 9, 1, C.GR); line(35, hy + 5, 41, hy + 24, C.GR, 2)
    },
  },
  4: {
    keys: ['四支權杖', '上方掛著花環', '舉起花束的兩人', '身後的城堡', '慶典'],
    bg() {
      sky([C.GL, C.SL], 16, 80)
      castle(30, 80, 20, 14)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (const x of [14, 24, 56, 66]) wandSym(x, 68, 56)
      for (let x = 14; x <= 66; x++) {
        const y = Math.round(41 + 7 * Math.sin((Math.PI * (x - 14)) / 52))
        set(x, y, C.GR); set(x, y + 1, C.GRD); if (x % 4 === 0) set(x, y + 2, x % 8 ? C.R : C.GL)
      }
      person(36, 96, { h: 30, c: C.PU, cd: C.D, long: true, hair: C.GL, armL: [32, 58], armR: [40, 58] })
      disc(32, 56, 1.6, C.R); set(31, 55, C.GR)
      person(46, 96, { h: 30, c: C.R, cd: C.RD, long: true, hair: C.BR, armL: [42, 58], armR: [50, 58] })
      disc(50, 56, 1.6, C.GL); set(51, 55, C.GR)
    },
  },
  5: {
    keys: ['五個年輕人', '揮舞交錯的權杖', '各穿不同顏色的衣服', '爭執與競爭'],
    bg() {
      sky([C.BL, C.SL], 16, 80)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      wandAt(30, 36, 12, 84); wandAt(46, 34, 24, 86); wandAt(40, 32, 40, 88); wandAt(34, 34, 56, 86); wandAt(50, 36, 68, 84)
      person(12, 98, { h: 32, c: C.R, cd: C.RD, hair: C.BR, armR: [18, 68] })
      person(24, 98, { h: 32, c: C.B, cd: C.BD, hair: C.GL, armR: [31, 68] })
      person(40, 98, { h: 32, c: C.GR, cd: C.GRD, hair: C.BRD, armL: [39, 68], armR: [41, 72] })
      person(56, 98, { h: 32, c: C.OR, cd: C.RD, hair: C.D, armL: [48, 68] })
      person(68, 98, { h: 32, c: C.PU, cd: C.D, hair: C.OR, armL: [62, 68] })
    },
  },
  6: {
    keys: ['騎白馬凱旋的人', '頭戴月桂冠', '權杖頂端的花環', '歡迎的群眾', '綠色馬衣'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (const [x, y] of [[10, 70], [18, 74], [62, 74], [70, 70]]) wandSym(x, y, 44)
      horse(36, 96, C.WH, C.GYL, C.GR)
      rect(25, 72, 22, 7, C.GR); rect(25, 78, 22, 1, C.GL)
      line(37, 73, 39, 82, C.R, 2)
      robe(36, 56, 73, 3, 5, C.R, C.RD)
      face(36, 51, { hair: C.BR }); for (let x = 32; x <= 40; x += 2) set(x, 47, C.GR)
      wandSym(50, 52, 52); ring(50, 28, 3, C.GR); set(48, 32, C.R); set(52, 32, C.R)
      arm(39, 59, 49, 58, C.R)
      for (const [x, hair, c] of [[12, C.BR, C.B], [20, C.GL, C.OR], [60, C.BRD, C.PU], [68, C.OR, C.GR]]) {
        rect(x - 4, 94, 9, 8, c); disc(x, 89, 3.4, hair); disc(x, 90.5, 2.6, C.SK)
      }
    },
  },
  7: {
    keys: ['站在高處的男子', '橫擋的一支權杖', '從下方湧上的六支權杖', '左右不同的鞋'],
    bg() {
      sky([C.SO, C.SL], 16, 80)
      mountain(20, 60, 14, 82, C.PL, C.PU)
      poly([30, 82, 40, 76, 74, 74, 74, 102, 30, 102], mix(C.GR, C.GRL, 0.3))
      rect(6, 92, 30, 10, C.GRD)
    },
    ch() {
      for (let k = 0; k < 6; k++) { const x = 8 + k * 5; wandAt(x + 8, 64 + (k % 2) * 4, x, 101) }
      wandAt(60, 40, 30, 58)
      person(50, 76, { h: 40, c: C.GR, cd: C.GRD, hair: C.BR, leg: C.OR, shoe: C.BRD, shoe2: C.GL, stride: 2, armL: [42, 52], armR: [56, 43] })
    },
  },
  8: {
    keys: ['飛越天空的八支權杖', '平行斜落', '河流', '山丘上的房子'],
    bg() {
      sky([C.BL, C.SL], 16, 80)
      poly([6, 82, 24, 72, 44, 78, 64, 70, 74, 74, 74, 102, 6, 102], mix(C.GR, C.GRL, 0.3))
      poly([22, 102, 30, 102, 40, 90, 52, 82, 48, 82, 34, 90], C.B)
      rect(56, 68, 7, 5, C.PA); poly([55, 68, 64, 68, 59.5, 64], C.R)
    },
    // 間距要拉開（垂直於權杖方向約 6 格），太密會黏成一片木板
    ch() { for (let k = 0; k < 8; k++) wandAt(10 + k * 7, 22 + k, 28 + k * 7, 54 + k) },
  },
  9: {
    keys: ['頭上纏著繃帶的男子', '握著一支權杖戒備', '身後八支權杖像圍籬', '受傷但仍堅守'],
    bg() {
      sky([C.GYL, C.BL], 16, 84)
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (const x of [10, 16, 22, 28, 52, 58, 64, 70]) wandSym(x, 64, 52)
      wandSym(46, 66, 60)
      const hy = person(38, 98, { h: 44, c: C.BR, cd: C.BRD, hair: C.D, leg: C.GY, armL: [44, 74], armR: [45, 64] })
      rect(34, hy - 4, 9, 2, C.WH); set(36, hy - 3, C.R)
    },
  },
  10: {
    keys: ['彎腰扛著十支權杖的男子', '權杖擋住了視線', '走向遠方的城鎮', '田地'],
    bg() {
      sky([C.SO, C.SL], 16, 80)
      castle(58, 80, 12, 10)
      rect(6, 80, 68, 22, mix(C.GR, C.G, 0.35)); for (const y of [86, 92, 98]) rect(6, y, 68, 1, C.GD)
    },
    ch() {
      person(34, 98, { h: 40, c: C.OR, cd: C.RD, hair: C.BR, stride: 3, leg: C.BRD })
      for (let k = 0; k < 10; k++) wandAt(30 + k * 2.6, 34 + Math.abs(k - 4.5), 36 + k * 0.8, 84)
      arm(37, 64, 42, 70, C.OR); arm(31, 64, 40, 74, C.OR)
    },
  },
  11: {
    keys: ['年輕的侍者', '仰望手中的權杖', '帶紅羽毛的帽子', '衣服上的火蜥蜴', '沙漠與遠山'],
    bg: wandsBg,
    ch() {
      wandSym(46, 58, 72)
      const hy = person(34, 98, { h: 44, c: C.OR, cd: C.RD, hair: C.GL, belt: C.G, armL: [45, 70], armR: [45, 58] })
      for (const [x, y] of [[33, 66], [34, 67], [35, 66], [32, 74], [33, 75], [34, 74]]) set(x, y, C.BRD)
      rect(30, hy - 5, 9, 2, C.RD); line(37, hy - 5, 41, hy - 10, C.R, 2)
    },
  },
  12: {
    keys: ['騎士', '揚蹄的棕馬', '舉起的權杖', '頭盔上的羽飾', '沙漠與遠山'],
    bg: wandsBg,
    ch: () => courtCh(0, 12),
  },
  13: {
    keys: ['坐在王座上的皇后', '一手權杖一手向日葵', '王座上的獅子', '腳邊的黑貓', '沙漠與遠山'],
    bg: wandsBg,
    ch() {
      courtCh(0, 13)
      disc(27, 46, 2.5, C.G); set(26, 46, C.K); set(28, 46, C.K); disc(53, 46, 2.5, C.G); set(52, 46, C.K); set(54, 46, C.K)
      line(33, 74, 31, 66, C.GR); disc(31, 64, 2.4, C.GL); set(31, 64, C.BR)
      rect(19, 93, 8, 5, C.D); disc(28, 91, 2.5, C.D); set(27, 88, C.D); set(29, 88, C.D); set(27, 91, C.GL); set(29, 91, C.GL); line(19, 93, 16, 88, C.D)
    },
  },
  14: {
    keys: ['坐在王座上的國王', '手持權杖', '王座上的獅子與火蜥蜴', '腳邊的火蜥蜴', '沙漠與遠山'],
    bg: wandsBg,
    ch() {
      courtCh(0, 14)
      disc(27, 46, 2.5, C.G); set(26, 46, C.K); set(28, 46, C.K); disc(53, 46, 2.5, C.G); set(52, 46, C.K); set(54, 46, C.K)
      for (const [x, y] of [[27, 60], [28, 61], [27, 62], [52, 70], [53, 71], [52, 72]]) set(x, y, C.OR)
      line(18, 97, 28, 97, C.OR, 2); disc(29, 96, 1.6, C.OR); set(30, 95, C.K); set(20, 99, C.OR); set(26, 99, C.OR); line(18, 97, 15, 94, C.OR)
    },
  },
}

// ---- 錢幣 14 張情境（照 Rider-Waite 的構圖） ----
// 犁過的田：一行行褐色犁溝（侍者、騎士）
function plowedBg() {
  sky([C.SL, C.GL], 16, 74)
  mountain(58, 58, 14, 74, C.PL, C.PU, C.WH)
  for (const x of [12, 20, 66]) { line(x, 74, x, 68, C.BRD); disc(x, 66, 3, C.GRD) }
  rect(6, 74, 68, 28, C.BR); for (let y = 76; y < 102; y += 3) rect(6, y, 68, 1, C.BRD)
  rect(6, 74, 68, 1, C.GR)
}
const PENTACLES_SCENES = {
  1: {
    keys: ['從雲中伸出的手', '掌心托著的錢幣', '玫瑰拱門的綠籬', '通往遠山的小路', '白百合'],
    bg() {
      sky([C.SL, C.GL], 16, 66)
      mountain(40, 50, 12, 66, C.PL, C.PU, C.WH)
      // 綠籬中間留一道玫瑰拱門，從門洞看得到遠山
      rect(6, 64, 27, 14, C.GRD); rect(48, 64, 26, 14, C.GRD)
      for (let a = Math.PI; a <= Math.PI * 2; a += 0.05) { const x = 40.5 + Math.cos(a) * 8, y = 66 + Math.sin(a) * 9; rect(x - 1, y - 1, 2, 2, C.GRD) }
      for (const a of [3.4, 4.1, 4.7, 5.3, 6.0]) set(40.5 + Math.cos(a) * 8, 66 + Math.sin(a) * 9, C.R)
      for (let x = 8; x < 74; x += 5) if (x < 31 || x > 50) set(x, 65, C.R)
      rect(6, 78, 68, 24, mix(C.GR, C.GRL, 0.3)); poly([36, 102, 44, 102, 42, 78, 38, 78], C.PD)
      for (const x of [10, 16, 58, 66]) lily(x, 88)
    },
    ch: () => aceCh(1),
  },
  2: {
    keys: ['跳舞的年輕人', '兩枚錢幣', '連起來的無限符號', '高帽', '浪上起伏的船'],
    bg() {
      sky([C.BL, C.SL], 16, 66)
      rect(6, 66, 68, 22, C.B)
      for (let x = 6; x < 74; x++) { const y = Math.round(70 + Math.sin(x / 5) * 3); set(x, y, C.WH); set(x, y + 1, C.BL) }
      rect(14, 64, 9, 3, C.BRD); poly([17, 56, 17, 63, 22, 63], C.WH)
      rect(54, 70, 9, 3, C.BRD); poly([57, 62, 57, 69, 62, 69], C.WH)
      rect(6, 88, 68, 14, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (let t = 0; t < Math.PI * 2; t += 0.04) {
        const d = 1 + Math.sin(t) ** 2
        set(40 + (16 * Math.cos(t)) / d, 60 + (10 * Math.sin(t) * Math.cos(t)) / d, C.GR)
      }
      const hy = person(40, 98, { h: 44, c: C.OR, cd: C.RD, hair: C.BR, leg: C.R, shoe: C.GR, stride: 2, armL: [28, 62], armR: [52, 58] })
      rect(36, hy - 11, 9, 8, C.RD); rect(34, hy - 4, 13, 1, C.RD)
      pentSym(26, 62, 5); pentSym(54, 58, 5)
    },
  },
  3: {
    keys: ['教堂裡的石匠', '站在工作凳上', '修士與拿著設計圖的建築師', '拱門上刻的三枚錢幣'],
    bg() {
      rect(6, 16, 68, 86, C.GYL); for (let y = 22; y < 90; y += 6) rect(6, y, 68, 1, C.GY)
      poly([40, 20, 70, 34, 70, 90, 60, 90, 60, 38, 40, 28, 20, 38, 20, 90, 10, 90, 10, 34], C.GY)
      pentSym(40, 36, 4); pentSym(32, 46, 4); pentSym(48, 46, 4)
      rect(6, 90, 68, 12, mix(C.GY, C.D, 0.3))
    },
    ch() {
      rect(44, 82, 18, 3, C.BR); rect(45, 85, 2, 13, C.BRD); rect(59, 85, 2, 13, C.BRD)
      const hy = person(53, 82, { h: 36, c: C.PU, cd: C.D, hair: C.BR, leg: C.GY, armL: [46, 56], armR: [56, 60] })
      line(46, 56, 44, 52, C.GY); rect(56, 58, 3, 2, C.BRD)
      person(16, 98, { h: 42, c: C.BR, cd: C.BRD, hair: C.BRD, long: true, armR: [22, 70] })
      person(29, 98, { h: 42, c: C.R, cd: C.RD, hair: C.GL, long: true, armL: [24, 70], armR: [34, 68] })
      rect(20, 66, 10, 7, C.PA); rect(20, 66, 10, 1, C.PD); rect(22, 69, 6, 1, C.GD)
      void hy
    },
  },
  4: {
    keys: ['坐著緊抱錢幣的男子', '頭上頂著一枚', '腳下踩著兩枚', '身後的城市'],
    bg() {
      sky([C.GYL, C.BL], 16, 80)
      for (const [x, h] of [[8, 14], [18, 20], [28, 12], [52, 18], [62, 24], [70, 14]]) { rect(x, 80 - h, 8, h, C.GY); rect(x + 6, 80 - h, 2, h, C.D); rect(x + 3, 80 - h + 4, 2, 2, C.GL) }
      rect(6, 80, 68, 22, C.GY); rect(6, 80, 68, 1, C.GYL)
    },
    ch() {
      rect(30, 78, 20, 14, C.GY); rect(30, 78, 20, 1, C.GYL)
      poly([34, 58, 46, 58, 52, 92, 28, 92], C.D)
      robe(40, 56, 92, 4, 9, C.R, C.RD)
      face(40, 51, { hair: C.BR })
      rect(36, 44, 9, 3, C.G); set(36, 43, C.GL); set(44, 43, C.GL)
      pentSym(40, 38, 4.5)
      pentSym(40, 66, 5.5)
      arm(36, 58, 35, 66, C.R); arm(44, 58, 45, 66, C.R)
      pentSym(32, 96, 4.5); pentSym(48, 96, 4.5)
      rect(30, 93, 5, 2, C.BRD); rect(46, 93, 5, 2, C.BRD)
    },
  },
  5: {
    keys: ['雪夜裡的兩個窮人', '拄著拐杖、頭纏繃帶的男子', '裹著披巾的女子', '亮著五枚錢幣的彩繪玻璃窗'],
    bg() {
      sky([C.NV, C.BD], 16, 86)
      rect(46, 16, 28, 72, C.GY); for (let y = 20; y < 88; y += 5) rect(46, y, 28, 1, C.D)
      rect(51, 22, 18, 36, C.D); disc(60, 26, 9, C.D)
      rect(53, 26, 14, 30, C.GL); disc(60, 28, 7, C.GL); rect(53, 40, 14, 1, C.OR); rect(60, 22, 1, 34, C.OR)
      for (const [x, y] of [[57, 30], [63, 30], [60, 37], [57, 47], [63, 47]]) { ring(x, y, 2, C.GD); set(x, y, C.R) }
      rect(6, 86, 68, 16, mix(C.WH, C.GYL, 0.3)); rect(6, 86, 68, 1, C.WH)
      for (const [x, y] of [[10, 20], [22, 28], [34, 18], [14, 44], [30, 52], [40, 36], [18, 66], [36, 72], [70, 64], [52, 78]]) set(x, y, C.WH)
    },
    ch() {
      const hy = person(30, 98, { h: 38, c: C.GY, cd: C.D, hair: C.BR, leg: C.GY, stride: 1, armL: [25, 74], armR: [35, 74] })
      rect(26, hy - 4, 9, 2, C.WH)
      line(25, 74, 23, 97, C.BRD); line(35, 74, 37, 97, C.BRD)
      const hy2 = person(14, 98, { h: 36, c: C.GR, cd: C.GRD, hair: C.D, long: true, armL: [12, 70] })
      ring(14, hy2 - 0.5, 5, C.GR)
    },
  },
  6: {
    keys: ['拿著天秤的商人', '施捨給跪著的窮人', '兩個跪地的人', '六枚錢幣'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      castle(54, 84, 14, 10)
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (const [x, y] of [[26, 24], [40, 24], [54, 24], [33, 34], [47, 34], [40, 44]]) pentSym(x, y, 4)
      person(42, 98, { h: 44, c: C.R, cd: C.RD, hair: C.BR, long: true, belt: C.G, armL: [32, 68], armR: [52, 58] })
      rect(52, 58, 1, 3, C.G); rect(47, 61, 11, 1, C.G); line(47, 61, 46, 66, C.G); line(57, 61, 58, 66, C.G); rect(44, 66, 5, 1, C.G); rect(56, 66, 5, 1, C.G)
      for (const [x, y] of [[31, 72], [30, 76], [29, 80]]) set(x, y, C.GL)
      robe(24, 82, 97, 3, 7, C.BR, C.BRD); face(24, 78, { hair: C.BRD }); arm(26, 84, 28, 80, C.BR)
      robe(60, 82, 97, 3, 7, C.B, C.BD); face(60, 78, { hair: C.D }); arm(58, 84, 55, 80, C.B)
    },
  },
  7: {
    keys: ['倚著鋤頭的農夫', '長出七枚錢幣的灌木', '看著自己的收成', '田地'],
    bg() {
      sky([C.BL, C.SL], 16, 80)
      mountain(60, 60, 14, 80, C.PL, C.PU)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      disc(28, 74, 13, C.GR); disc(22, 70, 7, C.GRL); line(28, 86, 28, 97, C.BRD, 2)
      for (const [x, y] of [[20, 66], [30, 62], [37, 70], [23, 77], [33, 80], [18, 84]]) pentSym(x, y, 4)
      pentSym(50, 94, 4)
      line(46, 58, 44, 97, C.BR); rect(41, 96, 6, 2, C.GY)
      person(56, 98, { h: 42, c: C.OR, cd: C.RD, hair: C.BR, leg: C.B, armL: [46, 62], armR: [47, 64] })
    },
  },
  8: {
    keys: ['坐在工作台前的工匠', '正在雕刻的錢幣', '掛在木柱上的六枚', '地上的一枚', '遠方的城鎮'],
    bg() {
      sky([C.BL, C.SL], 16, 80)
      poly([6, 80, 14, 74, 28, 80], C.GR); castle(10, 76, 10, 8)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3)); poly([6, 92, 74, 86, 74, 90, 6, 96], C.PD)
    },
    ch() {
      line(62, 22, 62, 98, C.BR, 2)
      for (const y of [28, 40, 52, 64, 76, 88]) pentSym(62, y, 4.5)
      rect(24, 86, 30, 3, C.BR); rect(25, 89, 2, 9, C.BRD); rect(51, 89, 2, 9, C.BRD)
      robe(36, 62, 86, 3, 6, C.B, C.BD); face(36, 57, { hair: C.BR })
      line(34, 86, 32, 97, C.R, 2); line(39, 86, 41, 97, C.R, 2)
      pentSym(46, 82, 4.5)
      arm(39, 64, 46, 76, C.B); line(46, 76, 49, 72, C.BRD, 2); arm(33, 64, 42, 80, C.B)
      pentSym(18, 96, 4)
    },
  },
  9: {
    keys: ['葡萄園裡的女子', '手上停著獵鷹', '九枚錢幣', '葡萄藤', '遠處的莊園'],
    bg() {
      sky([C.GL, C.SL], 16, 84)
      castle(54, 84, 16, 12)
      for (const x of [10, 22, 62, 70]) { line(x, 84, x, 54, C.GRD); for (let y = 58; y < 84; y += 7) { disc(x - 2, y, 1.6, C.PU); set(x + 2, y + 3, C.GR) } }
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      for (const [x, y] of [[52, 58], [60, 54], [68, 60], [52, 70], [60, 66], [68, 72], [14, 62], [14, 74], [22, 68]]) pentSym(x, y, 4)
      const hy = person(36, 98, { h: 46, c: C.GL, cd: C.G, hair: C.BR, long: true, longHair: 6, armL: [44, 54], armR: [42, 72] })
      for (const [x, y] of [[33, 66], [38, 72], [34, 80], [40, 86], [36, 92]]) set(x, y, C.R)
      rect(31, hy - 5, 11, 2, C.RD)
      disc(45, 50, 2.2, C.BR); set(47, 50, C.GL); rect(44, 47, 2, 1, C.R); line(44, 52, 42, 55, C.BRD)
    },
  },
  10: {
    keys: ['坐著的老人與兩隻白狗', '拱門下的一家三口', '排成生命之樹的十枚錢幣', '拱門外的城堡'],
    // 重畫：十枚錢幣集中在上半部排成生命之樹，人物全部放在下半部，彼此不重疊
    bg() {
      sky([C.BL, C.SL], 16, 84)
      rect(44, 56, 30, 28, C.GY); rect(48, 64, 22, 20, C.BL); disc(59, 64, 11, C.BL); rect(44, 56, 30, 2, C.GYL)
      castle(54, 80, 10, 6)
      rect(6, 84, 68, 18, C.GY); rect(6, 84, 68, 1, C.GYL); for (let x = 10; x < 74; x += 8) rect(x, 85, 1, 17, C.GYL)
    },
    ch() {
      for (const [x, y] of [[40, 20], [28, 26], [52, 26], [28, 36], [52, 36], [40, 41], [28, 46], [52, 46], [40, 51], [40, 61]]) pentSym(x, y, 4)
      rect(8, 84, 16, 4, C.BR)
      robe(16, 72, 96, 3, 7, C.PU, C.D); for (const [x, y] of [[14, 78], [18, 86], [13, 92]]) set(x, y, C.GL)
      face(16, 68, { hair: C.WH, beard: C.WH, beardLen: 8 })
      for (const dx of [26, 33]) { rect(dx - 3, 93, 7, 3, C.WH); disc(dx + 4, 91, 1.8, C.WH); rect(dx - 2, 96, 1, 2, C.WH); rect(dx + 2, 96, 1, 2, C.WH); set(dx + 5, 90, C.K) }
      person(50, 98, { h: 32, c: C.R, cd: C.RD, hair: C.BR, armR: [55, 82] })
      person(66, 98, { h: 30, c: C.B, cd: C.BD, hair: C.GL, long: true, armL: [60, 82] })
      person(58, 98, { h: 20, c: C.GR, cd: C.GRD, hair: C.GL })
    },
  },
  11: {
    keys: ['年輕的侍者', '雙手舉著錢幣凝視', '犁過的田', '樹與遠山'],
    bg: plowedBg,
    ch() {
      const hy = person(38, 98, { h: 46, c: C.GR, cd: C.GRD, hair: C.BR, leg: C.BR, belt: C.G, armL: [34, 42], armR: [46, 42] })
      rect(33, hy - 5, 11, 3, C.R); line(41, hy - 5, 44, hy, C.R, 2)
      pentSym(40, 36, 6)
    },
  },
  12: {
    keys: ['騎士', '靜立的黑馬', '手上的錢幣', '犁過的田'],
    bg: plowedBg,
    ch: () => courtCh(1, 12),
  },
  13: {
    keys: ['坐在王座上的皇后', '懷中捧著錢幣', '玫瑰花架', '右下角的兔子'],
    bg() {
      sky([C.SL, C.GL], 16, 82)
      for (let x = 8; x < 74; x += 6) { rose(x, 20); set(x + 3, 22, C.GR) }
      mountain(16, 62, 12, 82, C.PL, C.PU, C.WH)
      rect(6, 82, 68, 20, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      courtCh(1, 13)
      rect(58, 95, 7, 4, C.BR); disc(66, 94, 2, C.BR); line(66, 91, 67, 88, C.BR); set(67, 94, C.K); set(57, 96, C.WH)
    },
  },
  14: {
    keys: ['坐在王座上的國王', '葡萄花紋的長袍', '王座上的牛頭', '手持錢幣', '身後的城堡'],
    bg() {
      sky([C.GL, C.SL], 16, 82)
      castle(54, 70, 16, 14)
      for (const x of [10, 18, 66]) { line(x, 82, x, 60, C.GRD); disc(x - 1, 64, 1.6, C.PU); disc(x + 1, 72, 1.6, C.PU) }
      rect(6, 82, 68, 20, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      courtCh(1, 14)
      for (const [x, y] of [[37, 70], [43, 76], [36, 84], [45, 88], [40, 94], [34, 92]]) { disc(x, y, 1.4, C.PU); set(x + 1, y - 2, C.GRL) }
      for (const x of [27, 53]) { disc(x, 46, 2.5, C.BRD); set(x - 3, 43, C.GYL); set(x + 3, 43, C.GYL) }
    },
  },
}

// ---- 寶劍 14 張情境（照 Rider-Waite 的構圖） ----
// 任意角度的劍：(x0, y0) 是劍尖、(x1, y1) 是劍柄末端
function swordAt(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L
  const gx = x1 - ux * 4, gy = y1 - uy * 4
  line(x0, y0, gx, gy, C.GYL, 2); line(x0, y0, gx, gy, C.WH)
  line(gx - uy * 3, gy + ux * 3, gx + uy * 3, gy - ux * 3, C.G)
  line(gx + ux, gy + uy, x1 - ux, y1 - uy, C.BRD, 2); set(x1, y1, C.G)
}
const SWORDS_SCENES = {
  1: {
    keys: ['從雲中伸出的手', '直立的寶劍', '劍尖的王冠與花環', '底下的群山'],
    bg() {
      sky([C.GY, C.GYL, C.BL], 16, 101)
      cloud(48, 30, 18)
      mountain(22, 80, 16, 102, C.PL, C.PU, C.WH); mountain(48, 84, 14, 102, C.PL, C.PU, C.WH); mountain(66, 78, 12, 102, C.PL, C.PU, C.WH)
    },
    ch: () => aceCh(2),
  },
  2: {
    keys: ['蒙眼的女子', '雙手交叉抱著兩把劍', '坐在石凳上', '身後的海與礁石', '新月'],
    bg() {
      sky([C.NV, C.BD], 16, 70)
      disc(62, 24, 4, C.GL); disc(64, 23, 3.6, C.NV)
      rect(6, 70, 68, 20, C.B); rect(10, 74, 10, 1, C.BL); rect(48, 80, 12, 1, C.BL)
      disc(16, 72, 3, C.GY); disc(58, 74, 2.5, C.GY)
      rect(6, 90, 68, 12, C.GY); rect(6, 90, 68, 1, C.GYL)
    },
    ch() {
      rect(28, 86, 24, 4, C.GYL); rect(30, 90, 3, 8, C.GY); rect(47, 90, 3, 8, C.GY)
      robe(40, 61, 92, 4, 10, C.GYL, C.GY)
      face(40, 56, { hair: C.BRD })
      rect(35, 56, 10, 2, C.WH)
      swordAt(14, 32, 44, 64); swordAt(66, 32, 36, 64)
      arm(37, 62, 44, 65, C.GYL); arm(43, 62, 36, 65, C.GYL)
    },
  },
  3: {
    keys: ['被三把劍刺穿的紅心', '暴風雲', '斜落的雨'],
    bg() {
      sky([C.GY, C.GYL], 16, 101)
      for (const [x, y, r] of [[14, 22, 7], [26, 20, 8], [44, 22, 7], [60, 20, 8], [70, 26, 6]]) { disc(x, y + 2, r, C.D); disc(x, y, r, C.GY) }
      for (let k = 0; k < 18; k++) { const x = 8 + ((k * 23) % 64), y = 34 + ((k * 17) % 60); line(x, y, x - 2, y + 4, C.BL) }
    },
    ch() {
      // 三把劍先畫、心後畫：劍身被心擋住，看起來是從心的後面穿過去，劍柄和劍尖露在心的上下
      swordAt(40, 92, 40, 30); swordAt(48, 88, 16, 38); swordAt(32, 88, 64, 38)
      disc(33, 58, 9, C.R); disc(47, 58, 9, C.R); poly([24, 60, 57, 60, 40.5, 82], C.R)
      poly([47, 50, 56, 58, 41, 81, 50, 62], C.RD); set(29, 53, C.PK); set(30, 52, C.PK)
    },
  },
  4: {
    keys: ['躺在石棺上的騎士雕像', '雙手合十', '牆上三把朝下的劍', '棺側的一把劍', '彩繪玻璃窗'],
    bg() {
      rect(6, 16, 68, 86, C.GYL); for (let y = 20; y < 76; y += 6) rect(6, y, 68, 1, C.GY)
      rect(10, 20, 14, 18, C.D); rect(11, 21, 12, 16, C.B); rect(11, 21, 6, 8, C.R); rect(17, 29, 6, 8, C.GL); rect(16, 21, 1, 16, C.D); rect(11, 28, 12, 1, C.D)
      rect(6, 96, 68, 6, C.GY)
    },
    ch() {
      swordAt(30, 60, 30, 26); swordAt(42, 60, 42, 26); swordAt(54, 60, 54, 26)
      rect(10, 76, 60, 20, C.GY); rect(10, 76, 60, 2, C.GYL); rect(64, 76, 6, 20, C.D)
      swordAt(16, 88, 62, 88)
      rect(18, 70, 40, 6, C.GYL); rect(18, 74, 40, 2, C.GY); disc(60, 71, 3, C.GYL)
    },
  },
  5: {
    keys: ['得意的男子', '手上三把劍', '地上兩把劍', '垂頭離開的兩人', '破碎的雲'],
    bg() {
      sky([C.GYL, C.BL], 16, 80)
      for (const [x, y] of [[12, 24], [40, 20], [58, 30]]) poly([x, y, x + 14, y - 3, x + 18, y + 2, x + 6, y + 5], C.GY)
      rect(46, 72, 28, 10, C.B)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      person(60, 86, { h: 24, c: C.B, cd: C.BD, back: true, hair: C.BR })
      person(69, 87, { h: 22, c: C.GY, cd: C.D, back: true, hair: C.GL })
      swordAt(12, 97, 30, 93); swordAt(18, 100, 36, 98)
      swordAt(52, 30, 46, 64); swordAt(58, 34, 47, 64)
      person(40, 98, { h: 44, c: C.R, cd: C.RD, hair: C.OR, leg: C.GR, armL: [34, 66], armR: [46, 62] })
      swordAt(32, 97, 34, 66)
    },
  },
  6: {
    keys: ['撐船的船夫', '船上蜷縮的女人與孩子', '插在船上的六把劍', '左邊起浪、右邊平靜的水'],
    bg() {
      sky([C.GYL, C.BL], 16, 70)
      poly([50, 70, 58, 62, 74, 60, 74, 70], C.GR); for (const x of [60, 68]) { line(x, 64, x, 58, C.BRD); disc(x, 56, 3, C.GRD) }
      rect(6, 70, 68, 32, C.B)
      for (let y = 74; y < 102; y += 4) for (let x = 8; x < 34; x += 7) rect(x, y, 3, 1, C.WH)
      for (let y = 76; y < 102; y += 6) rect(46, y, 20, 1, C.BL)
    },
    ch() {
      const hy = person(30, 88, { h: 16, c: C.GR, cd: C.GRD, hair: C.GL }); void hy
      robe(40, 72, 88, 4, 8, C.D, C.NV); disc(40, 70, 4.5, C.D); disc(39, 71, 2.6, C.SK)
      line(64, 46, 54, 101, C.BR)
      person(58, 88, { h: 38, c: C.OR, cd: C.RD, hair: C.BR, armL: [61, 60], armR: [57, 70] })
      for (const x of [20, 25, 30, 35, 40, 45]) swordAt(x, 92, x, 72)
      poly([10, 86, 64, 86, 58, 95, 16, 95], C.BRD); rect(10, 86, 54, 1, C.BR)
    },
  },
  7: {
    keys: ['躡手躡腳離開的男子', '抱走五把劍', '留在原地的兩把', '回頭張望', '軍營帳篷'],
    bg() {
      sky([C.GL, C.SL], 16, 82)
      for (const [x, y] of [[16, 72], [30, 68], [54, 70], [66, 74]]) { poly([x - 6, y + 10, x, y, x + 6, y + 10], C.PD); line(x, y, x, y + 10, C.R) }
      rect(6, 82, 68, 20, mix(C.PD, C.G, 0.3))
    },
    ch() {
      swordAt(10, 98, 10, 80); swordAt(16, 98, 16, 80)
      // 五把劍平行疊著抱在懷裡、劍尖朝後，每把間隔 4 格（太擠會疊成一團白色）
      for (let k = 0; k < 5; k++) swordAt(22 - k * 3, 52 + k * 6, 44, 59 + k * 3)
      const hy = person(46, 98, { h: 42, c: C.R, cd: C.RD, hair: C.BR, leg: C.GL, stride: 3, armL: [40, 63], armR: [48, 64] })
      rect(42, hy - 5, 9, 2, C.R)
    },
  },
  8: {
    keys: ['被綁住雙眼的女子', '身上的繩子', '圍在四周的八把劍', '崖上的城堡', '泥地裡的水窪'],
    bg() {
      sky([C.GY, C.GYL], 16, 80)
      poly([48, 80, 54, 64, 74, 60, 74, 80], C.GY); castle(58, 62, 12, 8)
      rect(6, 80, 68, 22, mix(C.GY, C.GR, 0.3)); rect(14, 92, 10, 2, C.B); rect(50, 96, 12, 2, C.B)
    },
    ch() {
      for (const [x, y] of [[12, 62], [18, 66], [24, 60], [30, 64], [50, 64], [56, 60], [62, 66], [68, 62]]) swordAt(x, 98, x, y)
      person(40, 98, { h: 44, c: C.R, cd: C.RD, hair: C.BR, long: true })
      rect(35, 54, 10, 2, C.WH)
      for (const y of [62, 68, 74, 80]) line(35, y, 45, y + 3, C.WH)
    },
  },
  9: {
    keys: ['從床上坐起掩面的人', '牆上橫掛的九把劍', '玫瑰與星座的被子', '黑夜'],
    bg() {
      sky([C.D, C.NV], 16, 101)
      for (let k = 0; k < 9; k++) swordAt(12, 20 + k * 5, 68, 20 + k * 5)
    },
    ch() {
      robe(36, 62, 76, 4, 7, C.WH, C.GYL)
      face(36, 57, { hair: C.BR })
      rect(32, 57, 8, 3, C.SK); rect(32, 59, 8, 1, C.SKD)
      rect(10, 72, 60, 10, C.B); for (let x = 12; x < 70; x += 6) { rect(x, 74, 4, 4, (x / 6) % 2 ? C.R : C.GL) }
      rect(10, 82, 60, 14, C.BR); rect(10, 82, 60, 1, C.G); for (let x = 16; x < 66; x += 10) rect(x, 86, 6, 6, C.BRD)
    },
  },
  10: {
    keys: ['趴倒在地的男子', '背上插著十把劍', '紅色披風', '漆黑的天空與黎明的地平線', '平靜的水'],
    bg() {
      sky([C.D, C.D, C.BD], 16, 70)
      rect(6, 70, 68, 4, C.GL); rect(6, 72, 68, 2, C.SO)
      mountain(18, 64, 12, 74, C.D, C.K); mountain(58, 66, 14, 74, C.D, C.K)
      rect(6, 74, 68, 12, C.BD); rect(12, 78, 12, 1, C.B)
      rect(6, 86, 68, 16, C.D)
    },
    ch() {
      // 趴倒的人：頭在左（側臉朝外）、往前伸的手、紅披風蓋著身體、腿和鞋在右
      line(8, 91, 16, 91, C.SK, 2)
      disc(15, 86, 3.4, C.BRD); disc(14, 87.5, 2.4, C.SK); set(13, 87, C.K)
      rect(46, 86, 16, 3, C.BR); rect(46, 88, 16, 1, C.BRD); rect(62, 85, 3, 4, C.BRD)
      poly([18, 84, 44, 82, 49, 90, 18, 90], C.R); poly([18, 88, 49, 88, 49, 90, 18, 90], C.RD)
      // 十把劍插在背上：較短、角度稍微錯開，才不會排成一道柵欄
      for (let k = 0; k < 10; k++) swordAt(20 + k * 3, 85, 20 + k * 3 + (k % 2 ? 2 : -2), 66 + (k % 3) * 3)
    },
  },
  11: {
    keys: ['年輕的侍者', '雙手舉著劍', '站在山丘上', '風吹的雲與飛鳥'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      cloud(10, 26, 16); cloud(52, 22, 14)
      for (const [x, y] of [[30, 30], [38, 26], [62, 40]]) { set(x - 1, y, C.D); set(x, y + 1, C.D); set(x + 1, y, C.D) }
      poly([6, 96, 30, 84, 50, 86, 74, 92, 74, 102, 6, 102], mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      swordAt(46, 26, 45, 66)
      person(36, 96, { h: 46, c: C.PU, cd: C.D, hair: C.BR, leg: C.GL, armL: [44, 62], armR: [46, 64] })
    },
  },
  12: {
    keys: ['騎士', '衝鋒的白馬', '高舉的劍', '風暴的雲'],
    bg: swordsBg,
    ch: () => courtCh(2, 12),
  },
  13: {
    keys: ['坐在王座上的皇后', '直握的寶劍', '王座上的蝴蝶', '雲'],
    bg: swordsBg,
    ch() {
      courtCh(2, 13)
      for (const x of [27, 53]) { set(x - 1, 47, C.PL); set(x + 1, 47, C.PL); set(x, 48, C.D) }
    },
  },
  14: {
    keys: ['坐在王座上的國王', '直握的寶劍', '王座上的蝴蝶', '雲'],
    bg: swordsBg,
    ch() {
      courtCh(2, 14)
      for (const x of [27, 53]) { set(x - 1, 47, C.PL); set(x + 1, 47, C.PL); set(x, 48, C.D) }
    },
  },
}

// ---- 聖杯 14 張情境（照 Rider-Waite 的構圖） ----
// 倒在地上的杯子，杯口灑出液體（紅酒或綠色）
function spilledCup(x, y, liquid) {
  poly([x, y, x + 6, y - 2, x + 7, y + 2, x + 1, y + 4], C.G); rect(x + 6, y - 1, 2, 3, C.GD)
  poly([x - 1, y + 1, x - 6, y + 3, x, y + 4], liquid)
}
const CUPS_SCENES = {
  1: {
    keys: ['從雲中伸出的手', '湧出五道水流的聖杯', '銜著聖餅的白鴿', '開著蓮花的池塘'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      rect(6, 84, 68, 18, C.B); rect(6, 84, 68, 1, C.BL)
      for (const x of [12, 30, 56, 68]) { rect(x - 3, 92, 7, 2, C.GR); disc(x, 90, 1.6, C.PK); set(x, 89, C.WH) }
      aceCupsStreams()
    },
    ch: () => aceCh(3),
  },
  2: {
    keys: ['交換聖杯的男女', '雙蛇杖', '帶翅膀的獅子頭', '山丘上的房子'],
    bg() {
      sky([C.BL, C.SL], 16, 82)
      poly([44, 82, 58, 68, 74, 66, 74, 82], C.GR); rect(60, 62, 8, 6, C.PA); poly([59, 62, 69, 62, 64, 57], C.R)
      rect(6, 82, 68, 20, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      line(40, 32, 40, 54, C.G)
      for (let y = 36; y < 54; y++) { set(40 + Math.round(Math.sin(y / 2) * 2), y, C.GR); set(40 - Math.round(Math.sin(y / 2) * 2), y, C.GRL) }
      line(36, 30, 28, 24, C.R, 2); line(44, 30, 52, 24, C.R, 2); disc(40, 30, 3.2, C.R); set(39, 29, C.K); set(41, 29, C.K)
      person(27, 98, { h: 44, c: C.GL, cd: C.G, hair: C.BR, leg: C.D, armR: [36, 68] })
      person(53, 98, { h: 42, c: C.WH, cd: C.GYL, hair: C.GL, long: true, longHair: 6, armL: [44, 68] })
      cupSym(37, 65, 8); cupSym(43, 65, 8)
    },
  },
  3: {
    keys: ['舉杯共舞的三個女子', '腳邊的南瓜與葡萄', '慶祝豐收'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      person(22, 96, { h: 42, c: C.R, cd: C.RD, hair: C.GL, long: true, armR: [29, 50] })
      person(40, 96, { h: 44, c: C.WH, cd: C.GYL, back: true, hair: C.BR, long: true, armR: [41, 46] })
      person(58, 96, { h: 42, c: C.OR, cd: C.GR, hair: C.BRD, long: true, armL: [51, 50] })
      cupSym(29, 46, 7); cupSym(41, 41, 7); cupSym(51, 46, 7)
      for (const x of [10, 30, 66]) { disc(x, 97, 2.6, C.OR); set(x, 94, C.GR) }
      for (const x of [18, 48]) { disc(x, 98, 1.4, C.PU); disc(x + 2, 98, 1.4, C.PU); disc(x + 1, 96, 1.4, C.PU) }
    },
  },
  4: {
    keys: ['坐在樹下抱胸的年輕人', '面前的三只杯子', '雲中的手遞來第四只', '不為所動'],
    bg() {
      sky([C.BL, C.SL], 16, 84)
      line(16, 98, 16, 44, C.BR, 3); disc(18, 36, 12, C.GR); disc(14, 32, 6, C.GRL)
      rect(6, 84, 68, 18, mix(C.GR, C.GRL, 0.3))
    },
    ch() {
      rect(22, 88, 18, 6, C.BD); rect(20, 93, 6, 2, C.BRD); rect(36, 93, 6, 2, C.BRD)
      robe(30, 62, 90, 4, 8, C.B, C.BD)
      face(30, 57, { hair: C.GL })
      rect(25, 67, 11, 3, C.B); rect(27, 68, 2, 2, C.SK); rect(33, 68, 2, 2, C.SK)
      cupSym(46, 92, 8); cupSym(56, 94, 8); cupSym(66, 92, 8)
      cloud(54, 40, 18)
      rect(52, 50, 8, 3, C.SK); cupSym(49, 46, 8)
    },
  },
  5: {
    keys: ['披黑斗篷垂頭的人', '倒下的三只杯子', '身後還立著的兩只', '河、橋與城堡'],
    bg() {
      sky([C.GY, C.GYL], 16, 80)
      castle(58, 70, 10, 8)
      rect(6, 80, 68, 10, C.B); rect(10, 84, 10, 1, C.BL)
      poly([50, 82, 72, 82, 72, 78, 61, 74, 50, 78], C.GY); disc(61, 82, 4, C.B)
      rect(6, 90, 68, 12, C.GRD)
    },
    ch() {
      cupSym(56, 92, 8); cupSym(66, 94, 8)
      person(36, 98, { h: 46, c: C.D, cd: C.NV, hair: C.D, long: true, w: 9 })
      disc(36, 51, 5, C.D); disc(34, 53, 2.2, C.SK)
      spilledCup(16, 95, C.R); spilledCup(24, 98, C.GR); spilledCup(12, 99, C.R)
    },
  },
  6: {
    keys: ['遞出花杯的男孩', '接過花杯的女孩', '插著白花的六只杯子', '古老的房子與院子'],
    bg() {
      sky([C.GL, C.SL], 16, 72)
      rect(8, 52, 16, 22, C.PD); poly([7, 52, 25, 52, 16, 44], C.R); rect(12, 58, 3, 4, C.D)
      rect(54, 46, 18, 28, C.PD); rect(70, 46, 2, 28, C.GD); poly([53, 46, 73, 46, 63, 38], C.R); rect(60, 54, 4, 5, C.D)
      rect(6, 74, 68, 28, mix(C.PD, C.G, 0.25)); for (let y = 78; y < 102; y += 6) rect(6, y, 68, 1, C.GD)
    },
    ch() {
      for (const [x, y] of [[12, 92], [22, 95], [58, 95], [68, 92], [50, 78]]) { cupSym(x, y, 8); set(x - 1, y - 5, C.WH); set(x + 1, y - 5, C.WH); set(x, y - 6, C.WH) }
      rect(46, 82, 8, 16, C.GYL)
      person(30, 98, { h: 36, c: C.R, cd: C.RD, hair: C.BR, leg: C.B, armR: [37, 76] })
      person(44, 98, { h: 30, c: C.GL, cd: C.G, hair: C.GL, long: true, armL: [39, 78] })
      cupSym(38, 74, 7); set(37, 70, C.WH); set(39, 70, C.WH); set(38, 69, C.WH)
    },
  },
  7: {
    keys: ['背對我們的剪影', '雲上的七只杯子', '杯中的人頭、蒙紗人影、蛇、城堡、珠寶、花環、龍', '幻想與誘惑'],
    bg() {
      sky([C.GYL, C.BL], 16, 101)
      cloud(12, 40, 56); cloud(22, 66, 46)
    },
    ch() {
      const cups = [[22, 36], [34, 36], [46, 36], [58, 36], [30, 62], [44, 62], [58, 62]]
      for (const [x, y] of cups) cupSym(x, y, 9)
      disc(22, 27, 2.4, C.SK); rect(20, 24, 5, 1, C.GL); set(21, 27, C.K); set(23, 27, C.K)
      disc(34, 27, 2.6, C.WH); rect(32, 28, 5, 3, C.WH)
      for (let x = 43; x <= 49; x++) set(x, 27 + (x % 2), C.GR); set(49, 26, C.R)
      rect(56, 24, 5, 6, C.GYL); set(56, 23, C.GYL); set(60, 23, C.GYL)
      set(29, 53, C.R); set(31, 53, C.GL); set(30, 52, C.B); set(30, 54, C.GL)
      ring(44, 53, 2.4, C.GR)
      poly([55, 55, 61, 52, 59, 56], C.R); set(61, 51, C.R)
      disc(16, 84, 5, C.D); poly([4, 102, 6, 92, 26, 92, 30, 102], C.D)
    },
  },
  8: {
    keys: ['持杖遠去的人', '疊起來的八只杯子', '有臉的月亮', '夜色中的山', '水'],
    bg() {
      sky([C.NV, C.BD], 16, 72)
      disc(56, 26, 6, C.GL); disc(54, 26, 5, C.SL); set(52, 25, C.GD); rect(51, 28, 2, 1, C.GD)
      mountain(40, 46, 18, 80, C.GY, C.D); mountain(66, 54, 12, 80, C.GY, C.D)
      rect(6, 80, 68, 22, C.BD); rect(10, 86, 14, 1, C.B); rect(50, 92, 10, 1, C.B)
    },
    ch() {
      for (const x of [10, 18, 26, 34, 42]) cupSym(x, 95, 7)
      for (const x of [14, 22, 38]) cupSym(x, 88, 7)
      line(61, 58, 60, 82, C.BR)
      person(56, 82, { h: 28, c: C.R, cd: C.RD, back: true, hair: C.BR, long: true, armR: [60, 66] })
    },
  },
  9: {
    keys: ['坐在長凳上抱胸的男子', '滿足的笑容', '身後弧形排開的九只杯子', '藍色的桌布'],
    bg() {
      sky([C.GL, C.SL], 16, 101)
      rect(8, 50, 64, 30, C.B); for (let x = 12; x < 72; x += 8) rect(x, 52, 1, 28, C.BL); rect(8, 50, 64, 2, C.BD)
      rect(6, 92, 68, 10, C.PD)
    },
    ch() {
      for (let k = 0; k < 9; k++) { const x = 12 + k * 7; cupSym(x, Math.round(38 + 0.012 * (x - 40) ** 2), 6) }
      rect(26, 88, 28, 4, C.BR)
      robe(40, 62, 90, 5, 11, C.WH, C.GYL)
      face(40, 57, { hair: C.BR }); rect(35, 51, 11, 3, C.R)
      rect(34, 66, 13, 3, C.WH); rect(35, 67, 2, 2, C.SK); rect(44, 67, 2, 2, C.SK)
      line(37, 90, 36, 97, C.R, 2); line(43, 90, 44, 97, C.R, 2)
    },
  },
  10: {
    keys: ['擁抱舉手的夫妻', '跳舞的兩個孩子', '彩虹上的十只杯子', '河邊的房子'],
    bg() {
      sky([C.BL, C.SL], 16, 82)
      for (const [r, c] of [[30, C.R], [28, C.OR], [26, C.GL], [24, C.GR], [22, C.B]]) {
        for (let a = Math.PI; a <= Math.PI * 2; a += 0.02) set(40 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.9, c)
      }
      poly([50, 82, 60, 72, 74, 72, 74, 82], C.GR); rect(60, 68, 8, 5, C.PA); poly([59, 68, 69, 68, 64, 64], C.R)
      rect(6, 82, 68, 20, mix(C.GR, C.GRL, 0.3)); poly([40, 102, 48, 102, 58, 84, 54, 84], C.B)
    },
    ch() {
      for (let k = 0; k < 10; k++) { const a = Math.PI + 0.25 + (k * (Math.PI - 0.5)) / 9; cupSym(Math.round(40 + Math.cos(a) * 26), Math.round(62 + Math.sin(a) * 23), 6) }
      person(28, 98, { h: 40, c: C.B, cd: C.BD, hair: C.BR, leg: C.R, armL: [22, 58], armR: [33, 70] })
      person(38, 98, { h: 38, c: C.R, cd: C.RD, hair: C.GL, long: true, armR: [44, 58] })
      person(54, 98, { h: 22, c: C.GL, cd: C.G, hair: C.BR, armR: [58, 86] })
      person(62, 98, { h: 22, c: C.PK, cd: C.R, hair: C.GL, long: true, armL: [58, 86] })
    },
  },
  11: {
    keys: ['年輕的侍者', '杯中探出頭的魚', '蓮花紋的衣服', '身後的海'],
    bg() {
      sky([C.BL, C.SL], 16, 78)
      rect(6, 78, 68, 24, C.B); for (let y = 82; y < 102; y += 4) for (let x = 6 + (y % 8 ? 4 : 0); x < 74; x += 10) rect(x, y, 4, 1, C.BL)
    },
    ch() {
      const hy = person(36, 98, { h: 46, c: C.B, cd: C.BD, hair: C.BR, leg: C.PK, armR: [47, 62] })
      for (const [x, y] of [[33, 64], [38, 70], [34, 76], [39, 80]]) set(x, y, C.PK)
      rect(31, hy - 5, 11, 3, C.BL); line(41, hy - 4, 44, hy + 4, C.BL)
      cupSym(49, 60, 10); disc(49, 53, 2, C.TE); set(48, 52, C.K); set(51, 54, C.TE)
    },
  },
  12: {
    keys: ['騎士', '緩步的白馬', '帶翅膀的頭盔', '向前遞出的聖杯', '河流'],
    bg() {
      sky([C.BL, C.SL], 16, 80)
      mountain(58, 58, 14, 80, C.PL, C.PU, C.WH)
      rect(6, 80, 68, 22, mix(C.GR, C.GRL, 0.3)); poly([50, 102, 58, 102, 70, 84, 66, 84], C.B)
    },
    ch() {
      courtCh(3, 12)
      line(31, 47, 28, 44, C.WH); line(41, 47, 44, 44, C.WH)
    },
  },
  13: {
    keys: ['坐在海邊王座上的皇后', '有蓋的華麗聖杯', '岸邊的卵石', '海'],
    bg() {
      sky([C.BL, C.SL], 16, 72)
      rect(6, 72, 68, 16, C.B); rect(10, 76, 10, 1, C.BL); rect(54, 80, 10, 1, C.BL)
      rect(6, 88, 68, 14, C.PD); for (const [x, y] of [[10, 94], [20, 98], [60, 92], [68, 98]]) disc(x, y, 1.4, C.GY)
    },
    ch() {
      courtCh(3, 13)
      disc(52, 60, 2, C.GL); set(52, 57, C.G); set(49, 63, C.GL); set(55, 63, C.GL)
    },
  },
  14: {
    keys: ['坐在海上王座的國王', '手持聖杯與權杖', '遠處的船', '躍出海面的魚'],
    bg() {
      sky([C.BL, C.SL], 16, 74)
      rect(6, 74, 68, 28, C.B); for (let y = 78; y < 102; y += 4) for (let x = 6 + (y % 8 ? 4 : 0); x < 74; x += 10) rect(x, y, 4, 1, C.BL)
      rect(10, 68, 10, 3, C.BRD); poly([14, 58, 14, 67, 19, 67], C.WH)
      poly([62, 82, 66, 76, 70, 80, 66, 84], C.GY); set(65, 79, C.K)
    },
    ch() {
      courtCh(3, 14)
      line(33, 74, 31, 60, C.G); disc(31, 59, 1.4, C.GL)
      rect(6, 96, 68, 6, C.B); for (let x = 8; x < 74; x += 6) rect(x, 96, 3, 1, C.WH)
    },
  },
}

const RANK_EN = ['', 'ACE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'PAGE', 'KNIGHT', 'QUEEN', 'KING']
const RANK_TITLE = RANK_EN.map((r) => r.charAt(0) + r.slice(1).toLowerCase())
const RANK_ZH = ['', '王牌', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍者', '騎士', '皇后', '國王']
const RANK_NUM = ['', 'ACE', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'PAGE', 'KNIGHT', 'QUEEN', 'KING']
const COUNT_ZH = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十']

const MINOR = []
SUITS.forEach((s, si) => {
  for (let rank = 1; rank <= 14; rank++) {
    let keys, ch
    if (rank === 1) {
      keys = ['從雲中伸出的手', s.aceKey, `${s.el}元素`, s.scene]
      ch = () => aceCh(si)
    } else if (rank <= 10) {
      keys = [`${COUNT_ZH[rank]}${s.unit}${s.zh}`, `${s.el}元素`, s.scene]
      ch = () => { for (const [x, y] of PIPS[rank]) s.sym(x, y, rank <= 3 ? 'm' : 's') }
    } else {
      keys = [{ 11: '站立的年輕侍者', 12: '騎馬的騎士', 13: '坐在王座上的皇后', 14: '坐在王座上的國王' }[rank], `手持${s.zh}`, `${s.el}元素`, s.scene]
      ch = () => courtCh(si, rank)
    }
    let bg = rank === 1 && si === 3 ? () => { s.bg(); aceCupsStreams() } : s.bg
    // 四個花色都用情境版本
    const scene = [WANDS_SCENES, PENTACLES_SCENES, SWORDS_SCENES, CUPS_SCENES][si]?.[rank]
    if (scene) ({ keys, bg, ch } = scene)
    MINOR.push({
      num: RANK_NUM[rank], en: `${RANK_EN[rank]} OF ${s.en}`, zh: `${s.zh}${RANK_ZH[rank]}`, title: `${RANK_TITLE[rank]} of ${s.title}`,
      eyebrow: `MINOR ARCANA · ${s.en}`, group: s.zh, short: RANK_ZH[rank], keys, bg, ch,
    })
  }
})
CARDS.forEach((c) => { c.eyebrow = `MAJOR ARCANA · ${c.num}`; c.group = '大阿卡納'; c.short = `${c.num} ${c.zh}` })
const ALL = [...CARDS, ...MINOR]

// ===================== 合成 =====================

// 卡框：外 1px 深紫黑、2px 金（左上亮右下暗）、1px 深色、羊皮紙內底；四角切圓
function edgeDist(x, y) {
  const R = 5
  const cx = x < R ? R : x > W - 1 - R ? W - 1 - R : null
  const cy = y < R ? R : y > H - 1 - R ? H - 1 - R : null
  if (cx !== null && cy !== null) return Math.floor(R + 0.5 - Math.hypot(x - cx, y - cy))
  return Math.min(x, y, W - 1 - x, H - 1 - y)
}
function drawFrame(card) {
  CLIP = null
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = edgeDist(x, y)
    if (d < 0) continue
    const lit = Math.min(x, y) <= Math.min(W - 1 - x, H - 1 - y)
    set(x, y, d === 0 ? C.K : d <= 2 ? (lit ? C.GL : C.GD) : d === 3 ? C.D : C.PA)
  }
  // 標頭：羅馬數字置中，兩側短線＋小菱形
  const nw = textW(card.num, 1), nx = Math.round((W - nw) / 2)
  text(card.num, nx, 6, C.D)
  const diamond = (cx, cy) => { set(cx, cy - 1, C.G); set(cx - 1, cy, C.G); set(cx, cy, C.GD); set(cx + 1, cy, C.G); set(cx, cy + 1, C.G) }
  line(12, 8, nx - 4, 8, C.GD); diamond(11, 8)
  line(nx + nw + 3, 8, W - 13, 8, C.GD); diamond(W - 12, 8)
  // 中間畫面外框
  for (let x = 5; x <= 74; x++) { set(x, 15, C.K); set(x, 102, C.K) }
  for (let y = 15; y <= 102; y++) { set(5, y, C.K); set(74, y, C.K) }
  // 名稱：放得下就 2 倍，不加陰影
  rect(7, 105, 66, 1, C.PD); rect(7, 123, 66, 1, C.PD)
  const sc = textW(card.en, 2) <= 68 ? 2 : 1
  const tw = textW(card.en, sc), tx = Math.round((W - tw) / 2), ty = sc === 2 ? 109 : 112
  text(card.en, tx, ty, C.D, sc)
}

function renderCard(card) {
  const F = new Array(W * H).fill(null)
  L = F; drawFrame(card)
  const bg = new Array(W * H).fill(null), chl = new Array(W * H).fill(null)
  CLIP = SC
  L = bg; card.bg()
  L = chl; card.ch()
  // 角色層自動描邊：空格的上下左右有角色像素就填深色
  const edge = []
  for (let y = SC[1]; y <= SC[3]; y++) for (let x = SC[0]; x <= SC[2]; x++) {
    const i = y * W + x
    if (chl[i]) continue
    const has = (xx, yy) => xx >= SC[0] && xx <= SC[2] && yy >= SC[1] && yy <= SC[3] && chl[yy * W + xx]
    if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) edge.push(i)
  }
  for (const i of edge) chl[i] = C.K
  for (let y = SC[1]; y <= SC[3]; y++) for (let x = SC[0]; x <= SC[2]; x++) { const i = y * W + x; F[i] = chl[i] || bg[i] || C.PA }
  CLIP = null
  return F
}




// ===================== 對外介面 =====================
// 後端的牌面圖片檔名：major-00-fool.jpg、wands-01.jpg … cups-14.jpg（11～14 依序是侍者、騎士、皇后、國王）
const SUIT_BASE = { wands: 22, pentacles: 36, swords: 50, cups: 64 }
const SCALE = 4
// 輸出成 7:12（和網站的牌卡格一樣），上下補透明，object-cover 才不會裁到牌框
const OUT_H = Math.round((W * 12) / 7)
const OFFSET_Y = Math.floor((OUT_H - H) / 2)
const cache = new Map()

export function pixelCardIndex(image) {
  const m = /(major|wands|pentacles|swords|cups)-(\d+)/.exec(image || '')
  if (!m) return -1
  const n = Number(m[2])
  const idx = m[1] === 'major' ? n : SUIT_BASE[m[1]] + n - 1
  return idx >= 0 && idx < ALL.length ? idx : -1
}

export function pixelCardUrl(image) {
  const idx = pixelCardIndex(image)
  if (idx < 0) return null
  if (cache.has(idx)) return cache.get(idx)
  const px = renderCard(ALL[idx])
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = OUT_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  for (let i = 0; i < px.length; i++) {
    if (!px[i]) continue
    ctx.fillStyle = px[i]
    ctx.fillRect((i % W) * SCALE, (Math.floor(i / W) + OFFSET_Y) * SCALE, SCALE, SCALE)
  }
  const url = canvas.toDataURL('image/png')
  cache.set(idx, url)
  return url
}
