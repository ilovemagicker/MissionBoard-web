# Web ↔ Mobile（Work Assistants）差距清單

產品名：**Work Assistants**／任務助理。Repo 仍為 `MissionBoard-web`。  
後端：與 MissionBoard-iOS 同一 Supabase；canonical migrations 在 iOS repo，`web/supabase/migrations` 僅鏡像。

更新日期：2026-10-14（Schedule W1 合併後）

## 已上線（Web）

- 任務列表／建立／詳情、步驟認領／指派、留言、封存
- 任務日曆（`/app/calendar`）
- 動態 feed + Realtime
- 空間建立／邀請／審核／轉讓／封存刪除
- Google OAuth + email 登入
- 排班 **W1**：`/app/schedule` 月格、自己班次 CRUD、當日上班／休息
- Free／Pro UI（仍以 mock／localStorage 為主；`022` 鏡像已備）

## 排班相對 mobile 缺口（優先下一波）

- 班次範本 CRUD + 套用到月（migrations `009`／`010`／`028`）
- 批次產生／generation batch（`011`）
- 請假（`012`）
- 換班申請／核准（`013`／`014`／`027`）
- 油漆模式（快速畫班）
- 為他人建班／admin 編輯他人班次（W1 僅自己）
- 排班分享圖／匯出日曆（`015`）
- Widget／本地提醒（mobile-only）

## 其它產品缺口（非排班）

- 「我的」完整頁（個人檔、通知偏好、刪帳）— Web 有設定／方案 stub
- Push（Web Push 後期；APNs／FCM 為 mobile）
- 任務：優先級／決策、開始提醒、週期任務、投票／公告、巢狀步驟（iOS `029`–`037`）
- 真實 entitlements 讀 `user_entitlements`（helpers 已備；checkout 仍 iOS／Play 優先）
- 多語：Web 僅 zh-Hant／en；mobile 另有 ja／ko／zh-Hans

## 建議實作順序

1. ~~Schedule W1~~ ✅  
2. 範本列表＋套用（最小 slice）或月 roster 唯讀強化  
3. Admin 代建班／編輯他人  
4. 請假／換班  
5. 任務進階功能與真實 Pro 讀取  

不在 Web 硬做與 schema 衝突的表；新 migration 一律先落 iOS repo 再鏡像。
