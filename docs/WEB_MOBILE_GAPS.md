# Web ↔ Mobile（Work Assistants）差距清單

產品名：**Work Assistants**／任務助理。Repo 仍為 `MissionBoard-web`。  
後端：與 MissionBoard-iOS 同一 Supabase；canonical migrations 在 iOS repo，`web/supabase/migrations` 僅鏡像。

更新日期：2026-10-14（深層連結自動兌換／Deep-link auto-redeem）

## 已上線（Web）

- 任務列表／建立／詳情、步驟認領／指派、留言、封存
- 任務日曆（`/app/calendar`）
- 動態 feed + Realtime
- 空間建立／邀請／審核／轉讓／封存刪除
- Google OAuth + email 登入
- 排班 **W1**：`/app/schedule` 月格、自己班次 CRUD、當日上班／休息
- 排班 **班次範本（最小）**：列表／新增／編輯／刪除；套用到所選日；migrations 鏡像 `009`／`010`／`028`
- 排班 **admin 代建／油漆**：空間 owner／admin 可為其他成員建班／編輯／刪除；油漆模式（選範本或自訂時段 → 點日曆空日畫班；可選對象；完成離開；復原上一筆）；鏡像 `011`（`shifts_insert_admin` + `generation_batch_id`）
- 排班 **請假／換班**：登記休假（日／區間／0.25 天比例；本人或 admin 編輯刪除）；換班／代班申請（RPC）、同意／核准／拒絕／取消；空間核准模式（admin_required／peer_accept）；鏡像 `012`／`013`／`014`／`027`
- 排班 **班表節奏精靈（Rotation wizard）**：分步（區間→積木→預覽→完成）；任意起迄日（上限 400 天）；自訂上班／休息積木循環（加減／排序）；快捷樣式（每天、平日、做四休四、做五休二；平日仍為日曆週末休息）；對象（admin 可多人）／同相位或錯開／略過或覆寫；寫入 `source=generated` + `generation_batch_id`；可復原上一批；可清除區間內 generated 班；對齊 iOS RotationGenerate 主流程
- 排班 **匯出／分享**：目前月份 → `.ics` 日曆下載、月班表 PNG（canvas）、列印預覽；可選本人／全成員／指定成員。**家人分享碼（015）**：owner／admin 於排班頁產生／複製／撤銷重產 `MB-FAM-xxxx`；任何人登入後於空間頁兌換 → `role=viewer` 唯讀排班；viewer 隱藏編輯／請假／換班／油漆／批次／範本。RPC：`ensure_schedule_share_code`／`rotate_schedule_share_code`／`lookup_schedule_share_code`／`join_as_schedule_viewer`
- Free／Pro UI：讀取 `user_entitlements`（`022`／`038` 鏡像）；設定頁顯示來源／到期；DEBUG localStorage 僅覆寫測試；checkout 仍為 App Store／Play stub
- 任務 **週期／重複**：建立與詳情可設 daily／weekly／monthly／interval、產生時刻、結束條件；停止／恢復／移除；列表與詳情顯示 ↻。鏡像 `030`（欄位依賴）／`031`／`036`（步驟從最新清單複製；產生由 pg_cron）
- 任務 **巢狀步驟**：`parent_step_id`；詳情樹狀縮排、降一層／升一層、新增子步驟；父步驟完成由子步驟決定；列表步驟進度只計 leaf。鏡像 `033`
- 任務 **投票（032）**：任務詳情可建立／投票／結束／刪除；單選／複選、匿名、截止；結果條與最終選項；RPC `create_mission_poll`／`cast_poll_vote`／`close_mission_poll`／`delete_mission_poll`／`poll_results`
- 空間／任務 **公告（032／034）**：任務頂部公告板（編輯者可發）；任務列表頂部空間公告（僅 owner／admin 發佈；收起／全部列表／已讀）；鏡像 `032`／`034`
- 任務 **開始提醒（030）**：建立／詳情可設開始時間（`start_time_minutes`）、時區、提醒提前期（null＝收件人預設／0＝不提醒／15／60／1440）；設定頁可改個人預設與開關（`user_notification_preferences`）。推播仍由 server cron → APNs／FCM（mobile）；Web 不實作 Web Push
- **「我的」完整頁（`/app/settings`）**：個人資料（顯示名稱／頭像 URL）、完整通知偏好（含 `030`／`032`／`034`／`037` 欄位與班次提前量）、方案／配額、登出、刪除帳號（Edge `delete-account`，與 mobile 同語意）。導覽標籤改為「我的」
- 步驟 **截止日＋到期提醒 UI（037）**：任務詳情巢狀步驟可設／清 `deadline_date`；設定頁可關「步驟今日到期」早上推播。鏡像 `035`（推播 locale）／`037`；推播仍 mobile
- **Deep links（Web）**：登入後可回到原本網址（middleware 帶 `next`＝path＋query；email／Google OAuth 皆尊重 `next`；`/auth/callback?next=`）。任務詳情 `/app/missions/[id]`；空間邀請 `/join?code=MB-xxxx-xxxx` → `/app/spaces?invite=`（登入後**自動送出加入申請**一次，已是成員／已有 pending 視為軟成功，並清掉 query）；家人排班碼 `/join/family?code=MB-FAM-xxxx` 或短網址 `/s/MB-FAM-xxxx` → `/app/spaces?family=`（登入後**自動兌換**為 viewer、切換 active space、導向排班；已是成員亦軟成功並清 query）；排班月份 `/app/schedule?ym=YYYY-MM`（切月同步 URL）。家人分享面板可「複製連結」。**不做** Universal Links → native app、Web Push
- **多語**：Web 語系選單與 cookie 持久化支援 `zh-Hant`／`zh-Hans`／`en`／`ja`／`ko`（與 mobile `AppLanguage` 對齊）；切換時同步 `user_notification_preferences.locale`（`en`／`zh`／`zh-hans`／`ja`／`ko`）。`src/lib/i18n.ts` 全 key 五語齊；登入頁／App shell／任務／排班／空間／動態／設定／分享匯出／投票公告皆走 `t()`。行銷首頁 `/` 仍以繁中為主（未納 i18n）。產品名維持 Work Assistants／任務助理

## 排班相對 mobile 缺口（優先下一波）

- ~~班次範本 CRUD + 套用到所選日~~ ✅
- ~~油漆模式（快速畫班）／為他人建班／admin 編輯他人班次~~ ✅
- ~~批次產生／generation batch（`011`）~~ ✅（自訂 pattern wizard＋任意區間＋preview＋undo＋clear generated in range；與 iOS 對齊。剩餘刻意差距：無完整逐日 preview 列表長表、無 EditButton 風格的拖曳排序（Web 用上下鍵））
- ~~請假（`012`）~~ ✅
- ~~換班申請／核准（`013`／`014`／`027`）~~ ✅
- ~~排班分享圖／匯出日曆（`015`）~~ ✅（Web：client ICS＋PNG／列印＋家人分享碼 create／rotate／redeem／viewer 唯讀）
- Widget／本地提醒（mobile-only）

## 其它產品缺口（非排班）

- ~~「我的」完整頁（個人檔、通知偏好、刪帳）~~ ✅（`/app/settings`；Web Push 仍不做）
- Push（Web Push 後期；APNs／FCM 為 mobile）
- 任務：~~優先級／決策~~ ✅（`029`）；~~週期任務~~ ✅（`031`／`036`）；~~巢狀步驟~~ ✅（`033`）；~~投票／公告~~ ✅（`032`／`034`）；~~開始提醒 UI~~ ✅（`030`；推播仍 mobile）；~~步驟截止 push UI（`037`／`035`）~~ ✅（推播仍 mobile）
- ~~真實 entitlements 讀 `user_entitlements`~~ ✅（checkout 仍 iOS／Play 優先；無 Stripe）
- ~~多語：Web 僅 zh-Hant／en；mobile 另有 ja／ko／zh-Hans~~ ✅（Web 已齊五語；少數新增字串若暫時落後以 en 補）
- ~~Deep links／分享後開啟正確畫面~~ ✅（見上；Universal Links／app → native 仍不做）

## 建議實作順序

1. ~~Schedule W1~~ ✅  
2. ~~範本列表＋套用到所選日（最小 slice）~~ ✅  
3. ~~Admin 代建班／編輯他人／油漆模式~~ ✅  
4. ~~請假／換班~~ ✅  
5. ~~整月批次產生／undo batch~~ ✅ → ~~自訂節奏精靈~~ ✅  
6. ~~排班分享／匯出（`015`）~~ ✅（client export＋家人分享碼 UI）；~~真實 Pro 讀取~~ ✅；~~任務優先度／決策人（`029`）~~ ✅；~~週期任務（`031`／`036`）＋巢狀步驟（`033`）~~ ✅；~~投票／公告（`032`／`034`）~~ ✅；~~開始提醒 UI（`030`）~~ ✅；~~「我的」頁＋步驟截止 UI（`037`／`035`）~~ ✅；~~多語 ja／ko／zh-Hans~~ ✅；~~Web deep links~~ ✅（含 invite／family **auto-redeem**）  

Auth redirect（Cloudflare／自訂網域）：`https://app.onyxlab.dev/auth/callback`（與 Vercel 網域並存於 Supabase Redirect URLs）。

不在 Web 硬做與 schema 衝突的表；新 migration 一律先落 iOS repo 再鏡像。
