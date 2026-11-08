# 帳號連結（Identity Linking）— Web「連結 Google」

對齊 iOS：`MissionBoard-iOS/docs/ACCOUNT_LINKING_zh.md`、Android：`MissionBoard-Android/docs/ACCOUNT_LINKING_zh.md`。

## 產品話術

- **已用 Email（或已在 iPhone 用 Apple／連結 Google）登入後，到「我的 → 帳號」按「連結 Google」。**
- 連結後是**同一個** Supabase `auth.users`；之後可在 **Android** 用 Google 登入同一帳。
- Web／Android **不做 Sign in with Apple**（Apple 登入可繼續延後）。
- 「連結 Google」是 `linkIdentity`（綁到目前 session），**不是**再 `signInWithOAuth` 開新帳。

## 老闆／Dashboard 必做一次

Supabase Dashboard → **Authentication → Providers（或 Auth settings）** → 勾選 **Enable manual linking**。

未勾選時，設定頁會顯示「Manual linking is off…／尚未開啟手動連結」。

同 email 且已驗證時，Supabase **Automatic linking** 仍會自動併 identity；不同 email（例如 Apple `@icloud.com` vs Google `@gmail.com`）必須靠手動連結。

Redirect URL 需允許：`https://app.onyxlab.dev/auth/callback`（及本機 `http://localhost:3000/auth/callback`）。

## Web 行為（本切片）

- 顯示來源：GoTrue `user.identities`（**不要**只信 `profiles.auth_provider`）。
- 連結：瀏覽器 `supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } })` → OAuth → `/auth/callback?flow=link&next=/app/settings?link=ok` → `exchangeCodeForSession`。
- 入口：`/app/settings` 帳號區（`AccountPanel` → `LinkedIdentitiesPanel`）。
- Callback：`flow=link`（或 `next` 帶 `link=`）失敗時導回設定頁 `link_error=manual|taken|failed`，**不要**誤當成登入失敗而開第二個帳／丟到裸 login 當新 session 來源。

## 手動驗收

1. Dashboard 已開 Manual linking；Google provider 已 enable；Redirect URLs 含 web callback。
2. 用 **Email**（或已連好 Apple 的帳）登入 https://app.onyxlab.dev 。
3. 我的／設定 → 帳號：應列出目前 identities；若無 Google，顯示「連結 Google」。
4. 點連結 → 選 Google 帳號 → 回到設定頁成功提示；列表出現 Google。
5. 同一 Google 在 **Android** 登入 → 應進入**同一 user**（同空間／資料）。
6. 取消 Google 選帳：無錯誤橫幅（或僅回到設定）。
7. 若該 Google 已綁另一 user：顯示「已被其他帳占用」類文案。
8. 關閉 Manual linking 再試：應看到手動連結未開提示。
9. **確認沒有** Web Apple 登入／連結鈕（本切片範圍外）。

## 範圍外

- Unlink、admin 合併已分裂雙帳腳本、Web Sign in with Apple。
