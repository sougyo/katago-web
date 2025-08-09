# 囲碁対局システム - KataGo GTP

GTP（Go Text Protocol）をサポートする囲碁プログラム（KataGo）とブラウザベースの対局システムです。

## 機能

- 19x19の碁盤をブラウザで表示
- KataGoとのGTP通信による対局
- リアルタイムの手の反映
- 対局ログの表示
- レスポンシブデザイン

## 前提条件

- Node.js (v14以上)
- KataGoがインストールされていること
- KataGoの設定ファイルとモデルファイル

## セットアップ

1. 依存関係をインストール:
```bash
npm install
```

2. 環境変数を設定:
```bash
export KATAGO_HOME="/path/to/your/katago"
```

または、`.env`ファイルを作成:
```
KATAGO_HOME=/path/to/your/katago
```

3. KataGoの設定を確認:
- `$KATAGO_HOME/katago` - KataGo実行ファイル
- `$KATAGO_HOME/default_gtp.cfg` - 設定ファイル
- `$KATAGO_HOME/a.bin.gz` - モデルファイル

## 使用方法

1. サーバーを起動:
```bash
npm start
```

2. ブラウザで `http://localhost:3000` にアクセス

3. 「ゲーム開始」ボタンをクリックして対局を開始

4. 碁盤をクリックして手を打つ

## 操作方法

- **碁盤クリック**: 手を打つ
- **パスボタン**: パスする
- **リセットボタン**: ゲームをリセット
- **ゲーム開始ボタン**: 新しい対局を開始

## ファイル構成

```
├── server.js          # Expressサーバー
├── gtp-client.js      # GTP通信クライアント
├── package.json       # 依存関係
├── README.md          # このファイル
└── public/
    ├── index.html     # メインHTML
    ├── style.css      # スタイルシート
    └── script.js      # フロントエンドJavaScript
```

## GTPプロトコル

このシステムは以下のGTPコマンドを使用します:

- `boardsize 19` - 盤面サイズ設定
- `clear_board` - 盤面クリア
- `komi 6.5` - コミ設定
- `play <color> <move>` - 手を打つ
- `genmove <color>` - AIの手を生成
- `showboard` - 盤面表示
- `quit` - 終了

## トラブルシューティング

### KataGoが見つからない
- `KATAGO_HOME`環境変数が正しく設定されているか確認
- KataGoの実行ファイルが存在するか確認

### 通信エラー
- KataGoプロセスが正常に起動しているか確認
- 設定ファイルとモデルファイルのパスが正しいか確認

### ブラウザで表示されない
- ポート3000が使用可能か確認
- ファイアウォールの設定を確認

## 開発

開発モードで起動:
```bash
npm run dev
```

## ライセンス

MIT License
