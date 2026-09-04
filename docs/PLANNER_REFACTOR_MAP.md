# Planner V1.11 → Integrated Core migration map

基準: planner rebuild 1.11 / commit edcc58e053eba71df8defd3fd80acdc36ef6a27f

## 目的

現行 V1.11 の挙動を維持しながら、後読みスクリプトによる関数上書き構成を段階的に廃止する。

現行読み込み順:

1. place-data.js
2. planner-app.js
3. planner-v4.js
4. planner-v5.js
5. planner-v6.js
6. planner-v7.js
7. planner-v8.js
8. place-priority.js
9. planner-wait-optimizer.js
10. place-guide.js
11. google-place-window.js

## 原則

- V1.11 は比較対象として残す。
- planner-v4〜v8 をいきなり削除しない。
- 新 planner-core.js は最初は index.html から読み込まない。
- 生成前に制約を処理し、DOM 描画後の補正を減らす。
- PlaceData はデータ層として継続利用する。
- GTFS は PlannerCore.Transport.Bus に集約する。
- UI とプラン生成ロジックを分離する。

## 移行先モジュール

### PlannerCore.Config

移行元:
- planner-v6.js: walkMax = 10
- planner-v6〜v8.js: busWaitMax = 10
- planner-wait-optimizer.js: max absorb = 30

将来:
- 徒歩上限 5 / 10 / 15 / 20 / 30 分を UI 設定から渡す。
- busWaitMax は原則 10 分固定。

### PlannerCore.Time

移行元:
- planner-app.js: min(), fmt()
- planner-v7/v8: autoWindow(), makeWindows()

仕様:
- 昼食 11:30–13:30
- おやつ 1回: 15時前後
- おやつ 2回: 午前10時前後 + 午後15時前後
- 手動時刻・時間帯指定は自動配置より優先

### PlannerCore.PlacePolicy

移行元:
- planner-app.js: match(), autoAllowed(), candidateBase()
- place-priority.js

仕様:
- 自動候補は行く価値ポイント 3以上
- 4・5を強く優先
- 1・2もユーザー直接指定なら使用可能
- hidden は自動除外
- conditional は UI 設定時のみ自動候補

### PlannerCore.Score

移行元:
- planner-v4〜v8 の routeScore / scorePlace 系

評価軸:
- 行く価値ポイント
- 現在地からの距離
- GOAL 方向への進行
- 迂回量
- 雨の日適性
- 高齢者適性
- policy = recommended / near / balanced
- promote / conditional

重要:
単純な「近さ」ではなく、
current → candidate → goal の自然さを評価する。

### PlannerCore.Transport

#### Walk
移行元:
- planner-app.js: walk()

仕様:
- 直線距離ベース概算は当面維持
- 徒歩上限を適用

#### Bike / Car
移行元:
- planner-v4〜v8 simpleDuration / moveEstimate

仕様:
- 当面は距離ベース概算
- 将来 Routes API / OSRM 等へ置換可能な interface にする

#### Bus / GTFS
移行元:
- planner-v4〜v8 GTFS 読み込み・busPreview/busMove

仕様:
- stops/routes/trips/stop_times/calendar
- Place → bus stop の徒歩上限を適用
- bus stop → Place の徒歩上限を適用
- バス待ちは最大10分
- 条件に合う便がなければ、徒歩上限内のみ徒歩フォールバック

### PlannerCore.Schedule

移行元:
- planner-v7/v8 の nextChoice / urgency / candidate

仕様:
- 入力順を旅程順として扱わない
- 時間窓の強い希望から優先
- 柔軟な希望は route score で順序決定
- GOAL 到着可能性を常に確認
- ユーザー指定 Place は自動候補より強く尊重

### PlannerCore.Fill

移行元:
- planner-v5〜v8 の filler / chooseOptional

仕様:
空き時間は原則として
1. 未消化希望
2. 高価値の観光・公園・カフェ等
3. 近隣散策
4. 休憩
の順。

長い「余裕時間」を作らない。

### PlannerCore.GapOptimizer

移行元:
- planner-wait-optimizer.js

現行:
描画後 DOM を監視し、「少し待つ」を前の柔軟 Place に吸収。

統合後:
DOM 描画前の itinerary 配列に対して処理する。

優先:
1. 前の柔軟 Place の滞在を延長
2. 短い立ち寄り
3. 最後に数分だけ待つ

柔軟:
- 観光
- 温泉 / 足湯
- 公園 / 散歩
- 広場
- 博物館 / 美術館
- 休憩
- 自動追加候補

原則延ばさない:
- 昼食
- 朝食
- 夕食
- おやつ

バス発車時刻による待ちは固定制約として別扱い。

### PlannerCore.Editor

移行元:
- planner-v7/v8 PlannerV7 / PlannerV8

維持:
- 早める
- 遅める
- 時間帯変更
- 行き先変更
- 変更後の後続予定再計算

## UI側に残すもの

planner-app.js から最終的に planner-ui.js へ移す:

- START / GOAL select
- GPS
- 地図クリック
- Leaflet 描画
- wishlist DOM
- result DOM
- summary DOM
- transport selector
- UI events

PlannerCore は DOM を直接操作しない設計を目標とする。

## 移行フェーズ

### Phase A — 基準固定
完了:
- V1.11 commit を基準化
- refactor/planner-core-v1 ブランチ作成

### Phase B — Core skeleton
- planner-core.js を追加
- index.html からは読み込まない
- 時間窓、行く価値、route score、gap optimizer の pure logic を実装

### Phase C — Shadow comparison
- 旧 planner-v8 で作った結果と、新 Core の内部結果を同じ入力で比較
- UI は旧版を表示したままにする

### Phase D — UI 接続
- planner-ui.js から PlannerCore.plan() を呼ぶ
- V1.11 と同じ主要シナリオを確認

最低確認シナリオ:
1. 徒歩 / 9:00–16:00 / 昼食 + 観光 + 温泉 + おやつ
2. 自転車 / 10:00–14:00 / 昼食 + 観光
3. バス / 徒歩上限10分 / 待ち10分以下
4. 昼食が10時台に出ない
5. おやつ1回が15時前後
6. おやつ2回が午前・午後
7. GOAL方向に逆戻りしにくい
8. 行く価値1・2が自動候補に出ない
9. 行く価値1・2を直接指定すれば使える
10. 「少し待つ」が柔軟Placeへ吸収される

### Phase E — 旧層停止
index.html から順に外す:
- planner-v4.js
- planner-v5.js
- planner-v6.js
- planner-v7.js
- planner-v8.js
- place-priority.js
- planner-wait-optimizer.js

### Phase F — 整理
安定後に旧コードを archive または削除。

## 完了条件

- V1.11 の主要UI/仕様を維持
- Plannerの最終生成ロジックが1つ
- 同名関数上書きがない
- Gap調整がDOM後処理ではなく itinerary 内処理
- GTFS読込が1箇所
- 行く価値フィルタが1箇所
- 時間帯ルールが1箇所
