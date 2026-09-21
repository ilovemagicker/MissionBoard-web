# Mission Board Web — 功能設計（先於 UI 細節）

對齊 iOS App（[MissionBoard-iOS](https://github.com/ilovemagicker/MissionBoard-iOS)），同一套 **Supabase**（Auth + Postgres + RLS）。  
本文只定「做什麼、完成標準、優先順序」；視覺稿與元件庫之後再細化。

**原則**

- Web 是完整客戶端，不是只讀儀表板（MVP 後要能建立／編輯）。
- 權限一律靠 Supabase RLS；前端不另發明後門。
- 文案預設繁中，可切換 English（與 iOS 一致）。
- 不做廣告；之後 Free／Pro 額度與 iOS 共用規則。

---

## 1. 角色與帳號

| 功能 | 說明 | 完成標準 |
|------|------|----------|
| Email 登入 | email + 密碼 | 成功後進工作台；錯誤可讀 |
| Email 註冊 | 顯示名稱 + email + 密碼 | 建立 account；可選驗證信流程 |
| 登出 | 清 session | 回到登入／首頁 |
| 訪客 | Web **不做** guest／mock（與 iOS 模擬器訪客不同） | — |
| Google 登入 | 與 iOS 同一 Supabase Google provider | ✅ OAuth 回調後進工作台 |
| Apple 登入 | 暫緩（iOS 也先隱藏） | — |

**驗收：** 用 iOS 已註冊帳號可在 Web 登入並看到同一 Spaces／任務。

---

## 2. 資訊架構（IA）

建議導覽（桌面側欄／手機底欄二選一，實作時再定）：

1. **任務 (Missions)** — 目前空間的任務列表  
2. **日曆 (Calendar)** — 依日期看任務  
3. **動態 (Activity)** — 最新／過往動作  
4. **空間 (Spaces)** — 管理空間、邀請、成員  

全域：**空間切換器**（與 iOS 右上／標題列同概念）— 切換後任務／日曆／動態都跟著 scope。

---

## 3. 功能模組

### 3.1 Spaces（空間）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| S1 | 列出我的空間 | ✅ | 名稱、角色（owner／admin／member） |
| S2 | 建立空間 | ✅ | 名稱 → 寫入 `spaces` + membership |
| S3 | 邀請碼加入 | ✅ | 輸入碼 → join request 或直接加入（依現行 SQL） |
| S4 | 審核加入申請 | ✅ | admin／owner 可同意／拒絕 |
| S5 | 成員列表 | ✅ | 顯示名稱、角色 |
| S6 | 離開／踢人 | ✅ | 對齊 iOS RLS／RPC |
| S7 | 轉讓擁有者 | ✅ | `transfer_space_ownership` UI（owner 選成員 → 確認） |
| S8 | 封存／刪除空間 | ✅ | 對齊 `archive_space` / `unarchive_space` / `delete_space` |
| S9 | 空間切換器 | ✅ | 全域 active space |

### 3.2 Missions（任務）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| M1 | 列表（目前空間） | ✅ | 標題、狀態、截止、步驟進度、已讀／進行中數 |
| M2 | 搜尋＋篩選 | ✅ | All／Active／Done；進階：我的／逾期／指派給我 |
| M3 | 顯示封存 | ✅ | toggle show archived (`?archived=1`) |
| M4 | 建立任務 | ✅ | 標題、說明、開始／截止、可選 AI stub 步驟 |
| M5 | 任務詳情 | ✅ | 狀態、說明、日期、圖示、已讀／進行中、步驟、留言 |
| M6 | 更新狀態 | ✅ | todo／inProgress／done |
| M7 | 我要進行中 | ✅ | toggle worker |
| M8 | 已讀紀錄 | ✅ | 開啟詳情寫 reader；點 Chip 看誰／何時（`read_at`） |
| M9 | 封存／刪除任務 | ✅ | `archive_mission` / `unarchive_mission` + DELETE |
| M10 | 旗幟圖示 | ⏳ | 選 SF 對應或 Web emoji／icon set |

### 3.3 Steps（步驟）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| T1 | 列表＋勾選完成 | ✅ | `is_done`／`completed_at` |
| T2 | 新增步驟 | ✅ | 標題＋排序 |
| T3 | 認領／取消認領 | ✅ | 認領＝申請；建立者同意後 assignee；本人可取消認領 |
| T4 | 指派成員 | ✅ | 僅任務建立者或空間 owner/admin；RPC `assign_step` |
| T5 | 步驟截止日 | ✅ | optional date |
| T6 | 步驟留言 | ✅ | 依 step_id |
| T7 | 顯示新增／完成時間 | ✅ | 相對時間 |

### 3.4 Comments（留言）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| C1 | 任務層留言 | ✅ | 列表＋送出 |
| C2 | 步驟層留言 | ✅ | 展開步驟後可見 |

### 3.5 Calendar（日曆）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| K1 | 月曆＋選日 | ✅ | `/app/calendar` 顯示有任務的日子 |
| K2 | 顏色規則 | ✅ | 截止紅、逾期紫、進行中等（對齊 iOS） |
| K3 | 當日任務列表 | ✅ | 點日期看任務，連到詳情 |

### 3.6 Activity（動態）

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| A1 | 最新／過往 | ✅ | `activity_events`（migration `006`）；Newest（24h）／Earlier |
| A2 | 已讀狀態 | ✅ | localStorage last-seen timestamp（無 `is_read` 欄） |
| A3 | 點進任務 | ✅ | 有 `mission_id` 時連到 `/app/missions/[id]` |
| A4 | Realtime | ✅ | subscribe `activity_events` by `space_id`；任務列表輕量 realtime |

> 註：需在 Supabase 執行 `006_activity_events.sql`，並確認 Dashboard → Replication 已啟用 `activity_events`（與可選 `missions`）。
>
> 步驟認領：執行 `007_step_claim_requests.sql`。成員不可直接設自己為 assignee；建立 claim request 後由 `missions.creator_id` 同意／拒絕。指派他人僅建立者或空間 admin/owner。

### 3.7 設定／其它

| ID | 功能 | MVP? | 完成標準 |
|----|------|------|----------|
| P1 | 語言切換 zh-Hant／en | ✅ | 持久化 preference |
| P2 | 通知偏好 | ❌ Web | 瀏覽器推播後期；不做 APNs |
| P3 | 新手引導 | ⏳ | 可選、可跳過 |
| P4 | 離線提示 | ⏳ | 請求失敗／無網路 banner |

---

## 4. 建議實作波次

### Wave 0 — 已有

- 首頁、Email 登入／註冊殼、Dashboard 唯讀 Spaces／Missions 列表  

### Wave 1 — Web MVP（功能優先） — **done**

目標：在瀏覽器完成「日常使用」閉環（不必開 iOS）。

1. 空間切換器 + active space  
2. 任務列表（搜尋／基本篩選）  
3. 建立任務  
4. 任務詳情：狀態、進行中、步驟勾選／新增／認領／指派、留言  
5. Spaces：建立、邀請碼、成員、審核申請  
6. 登出 + 語言  

### Wave 2 — 對齊強化 — **done**

- ✅ 已讀／進行中名單＋時間  
- ✅ 日曆  
- ✅ 封存／刪除  
- ✅ Google 登入  

### Wave 3 — 平台化（部分）

- ✅ 轉讓擁有者 UI  
- ✅ Activity + `activity_events` + Realtime  
- ⏳ Free／Pro 額度 UI  
- ⏳ 與 iOS deep link／分享連結  
- ⏳ Web Push  
- 行銷站與 App shell 分離（可選）  

---

## 5. 畫面清單（Wave 1）

| 路由 | 用途 |
|------|------|
| `/` | 行銷／入口 |
| `/login` | 登入／註冊 |
| `/app` 或 `/dashboard` | 殼層＋空間切換 |
| `/app/missions` | 任務列表 |
| `/app/missions/new` | 建立 |
| `/app/missions/[id]` | 詳情 |
| `/app/spaces` | 空間管理 |
| `/app/spaces/join` | 邀請碼 |
| `/app/calendar` | 月曆 |
| `/app/activity` | 動態（目前空間） |
| `/auth/callback` | Google OAuth 回調 |

---

## 6. 資料與權限

- 表：沿用 iOS migrations（`spaces`、`space_members`、`missions`、`mission_steps`、`mission_comments`、`mission_readers`、`mission_workers`、`activity_events`、join requests、RPCs）。  
- Web 只用 **anon key + user JWT**；不放 service role。  
- 寫入失敗要顯示 RLS／網路錯誤，不靜默吞掉。  

---

## 7. 非功能

| 項目 | 目標 |
|------|------|
| 響應式 | 手機可用；桌面舒適 |
| 效能 | 列表分頁或 limit；詳情按需載入步驟／留言 |
| 無障礙 | 表單 label、按鈕可鍵盤操作 |
| 部署 | Vercel；Preview／Production env |

---

## 8. 刻意不做（目前）

- Guest／Mock 帳號  
- Apple Sign In  
- 真 AI 產步驟（維持 stub／手動）  
- APNs／Web Push（後期）  
- 複雜權限矩陣以外的 enterprise SSO  

---

## 9. 下一步

**Wave 1 / Wave 2 已完成；Wave 3 已補轉讓擁有者 + Activity/Realtime。** 之後可選額度 UI、deep link、Web Push。  
**必須：** 在 Supabase SQL Editor 執行 `006_activity_events.sql` 與 `007_step_claim_requests.sql`（見 web `supabase/migrations/` 或 iOS 同名檔），並在 Dashboard → Database → Publications / Realtime 確認 `activity_events`（與可選 `missions`）已加入。  
UI 在功能可用後再統一視覺（可對齊 iOS 的藍＋卡片語言）。
