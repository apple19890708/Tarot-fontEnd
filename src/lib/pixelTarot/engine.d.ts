// engine.js 的型別宣告
// 後端牌面圖片路徑（例如 /cards/wands-01.jpg）對應到的像素牌序號；對不上回傳 -1
export function pixelCardIndex(image: string): number
// 同一張牌的像素版圖片（data URL，已放大 4 倍、補成 7:12）；對不上或瀏覽器不支援 canvas 時回傳 null
export function pixelCardUrl(image: string): string | null
