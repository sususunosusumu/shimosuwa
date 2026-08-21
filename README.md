# 下諏訪 時間プランナー — Prototype

下諏訪町で「どこへ行くか」ではなく「どう時間を過ごすか」を提案するWebアプリの試作です。

## 現在できること

- `data/places.csv` をブラウザから読み込む
- 座標が登録済みのPlaceを地図上に表示
- START / GOALを登録Placeから選択
- START / GOALをGPS（現在地）から設定
- START / GOALを地図クリックで設定
- 曜日・開始終了時刻・10時のおやつ・昼食・15時のおやつを指定
- CSVの「おやつ向き」「昼食向き」「営業時間」「定休日」を使って簡易プランを生成
- 座標間の直線距離から徒歩時間を概算
- 「別プラン」で候補を変更

## ファイル

- `index.html` — Webアプリ本体
- `data/places.csv` — Placesデータ v2

## 注意

現在はプロトタイプです。

特に以下は未完成です。

- CSV内の多くのPlaceで緯度・経度が未取得
- 徒歩時間は道路ルートではなく直線距離からの概算
- あざみ号の時刻表は未接続
- イベントデータは未接続
- 営業時間などは要公式確認の項目あり

## GitHub Pagesで公開する

GitHubのリポジトリ画面で:

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. Source を `Deploy from a branch`
5. Branch を `main`、Folderを `/ (root)`
6. `Save`

設定後、GitHub PagesのURLから試作アプリを開けます。

## 次の開発候補

1. Places全件の緯度経度補完
2. START / GOAL候補として学校・駅・公共施設などを追加
3. OSRM / Google Routes等による実道路の移動時間
4. あざみ号の停留所・時刻表
5. Eventデータ（祭り、スポーツ、地域行事など）
6. 滞在時間を指で伸縮するUI
7. スワイプでプラン全体／一部を差し替えるUI
