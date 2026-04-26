# 🐔 THE CHICKEN TIMES

> **All the News That’s Fit for Chickens**
>
> 「にわとりの、にわとりによる、にわとりのためのニュースサイト」

THE CHICKEN TIMES は、高度な文章生成エンジン（NLG）と静的サイトジェネレーター（SSG）を組み合わせた、モダンなにわとり専用ニュースプラットフォームです。

## ✨ 主な機能

- **🤖 記事自動生成エンジン (`generate.js`)**
  - マルコフ連鎖とテンプレート、さらに独自スコアリングロジックを組み合わせた NLG エンジン。
  - カテゴリに応じた画像を自動的にランダム選択。
  - 次の ID を自動計算し、`news.json` への永続化までを一気通貫で実行。
- **🚀 超高速ビルドシステム (`build.js`)**
  - `news.json` を元に、数秒で数千記事の静的 HTML を生成可能。
  - **差分ビルド機能**: 既に生成済みのファイルはスキップし、新規・更新分のみを処理する最適化ロジックを搭載。
- **📱 プレミアム・デザイン**
  - バニラ CSS による美しくレスポンシブな新聞風レイアウト。
  - カテゴリごとに整理されたアーカイブ機能。
- **📦 依存関係ゼロ**
  - Node.js の標準ライブラリのみで動作。`node_modules` の管理やインストール作業は一切不要。

## 🛠 技術スタック

- **Front-end**: HTML5, Vanilla CSS, JavaScript (ES Modules)
- **Engine/SSG**: Node.js (fs, path)
- **Database**: JSON-based Flat File (`data/news.json`)

## 📖 使い方

### 1. 記事を生成する
以下のコマンドを実行すると、ランダムなカテゴリ（または引数で指定したカテゴリ）で新しいニュース記事が生成され、`news.json` に追加されます。

```bash
# ランダムに生成
node generate.js

# カテゴリを指定して生成 (Human, Egg, World, Incident, Opinion)
node generate.js World
```

### 2. サイトをビルドする
生成された記事データを元に、静的な HTML ファイルを生成します。

```bash
node build.js
```
※ `articles/` および `category/` フォルダ内に新しいファイルが生成されます。

## 📂 ディレクトリ構造

```text
The_Chicken_Times/
├── articles/           # 生成された個別記事ページ
├── category/           # 生成されたカテゴリアーカイブ
├── assets/             # 静的アセット
│   ├── css/            # base.css, home.css, article.css 等
│   ├── js/             # main.js 等
│   └── articles/       # カテゴリ別の記事用画像
├── data/
│   └── news.json       # 全記事のソースデータ
├── generate.js         # 記事生成エンジン
├── build.js            # 静的サイトジェネレーター
└── index.html          # ホームページ（最新記事一覧）
```

## ⚖️ License

[MIT License](./LICENSE)
