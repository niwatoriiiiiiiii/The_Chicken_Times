const fs = require('fs');
const path = require('path');

// 1. news.json の読み込み
const newsPath = path.join(__dirname, 'data', 'news.json');
const articlesRaw = fs.readFileSync(newsPath, 'utf8');
const articles = JSON.parse(articlesRaw);

// 2. テンプレートの定義
const ARTICLE_TEMPLATE = `<!doctype html>
<html lang="jp">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@200..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../../../assets/css/base.css" />
    <link rel="stylesheet" href="../../../../assets/css/article.css" />
    <title>THE CHICKEN TIMES</title>
    <script>
      window.targetArticleId = {{ID}};
    </script>
  </head>
  <body>
    <header>
      <div class="header-inner">
        <div class="logo"><a href="../../../../index.html">THE CHICKEN TIMES</a></div>
        <div class="sub">All the News That’s Fit for Chickens</div>
        <div class="meta" id="date"></div>
      </div>
      <ul class="global-nav">
        <li><a href="../../../../index.html">Home</a></li>
        <li><a href="../../../../category/human/">Human</a></li>
        <li><a href="../../../../category/egg/">Egg</a></li>
        <li><a href="../../../../category/world/">World</a></li>
        <li><a href="../../../../category/incident/">Incident</a></li>
        <li><a href="../../../../category/opinion/">Opinion</a></li>
      </ul>
    </header>

    <main class="layout">
      <section class="main">
        <div id="articles"></div>
      </section>

      <aside class="side">
        <ul id="recommended"></ul>
      </aside>
    </main>

    <footer>
      <div class="footer-inner">
        <p>&copy; 2026 The Chicken Times. Created by niwatoriiiiiiiii.</p>
      </div>
    </footer>
    <script type="module" src="../../../../assets/js/main.js"></script>
  </body>
</html>`;

const CATEGORY_TEMPLATE = `<!doctype html>
<html lang="jp">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@200..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../assets/css/base.css" />
    <link rel="stylesheet" href="../../assets/css/category.css" />
    <title>{{CAT_NAME}} News - THE CHICKEN TIMES</title>
    <script>
      window.targetCategory = "{{CAT_NAME}}";
    </script>
  </head>
  <body>
    <header>
      <div class="header-inner">
        <div class="logo"><a href="../../index.html">THE CHICKEN TIMES</a></div>
        <div class="sub">All the News That’s Fit for Chickens</div>
        <div class="meta" id="date"></div>
      </div>
      <ul class="global-nav">
        <li><a href="../../index.html">Home</a></li>
        <li><a href="../../category/human/">Human</a></li>
        <li><a href="../../category/egg/">Egg</a></li>
        <li><a href="../../category/world/">World</a></li>
        <li><a href="../../category/incident/">Incident</a></li>
        <li><a href="../../category/opinion/">Opinion</a></li>
      </ul>
    </header>

    <main class="layout">
      <section class="main">
        <div id="articles"></div>
      </section>
      <aside class="side">
        <ul id="recommended"></ul>
      </aside>
    </main>

    <footer>
      <div class="footer-inner">
        <p>&copy; 2026 The Chicken Times. Created by niwatoriiiiiiiii.</p>
      </div>
    </footer>
    <script type="module" src="../../assets/js/main.js"></script>
  </body>
</html>`;

// 3. 記事ページの生成
console.log('Generating article pages...');
articles.forEach(article => {
    const dir = path.join(__dirname, 'articles', article.date, article.category.toLowerCase(), article.slug);
    const filePath = path.join(dir, 'index.html');
    
    // スキップロジック
    if (fs.existsSync(filePath)) {
        // console.log(`- Skipped: ${article.date}/${article.category}/${article.slug}`);
        return;
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const content = ARTICLE_TEMPLATE.replace('{{ID}}', article.id);
    fs.writeFileSync(filePath, content);
    console.log(`- Created: ${article.date}/${article.category}/${article.slug}`);
});

// 4. カテゴリページの生成（カテゴリを自動収集）
console.log('Generating category pages...');
const categories = [...new Set(articles.map(a => a.category))];
categories.forEach(category => {
    const dir = path.join(__dirname, 'category', category.toLowerCase());
    const filePath = path.join(dir, 'index.html');

    // スキップロジック
    if (fs.existsSync(filePath)) {
        // console.log(`- Skipped: category/${category.toLowerCase()}`);
        return;
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const content = CATEGORY_TEMPLATE.replace(/{{CAT_NAME}}/g, category);
    fs.writeFileSync(filePath, content);
    console.log(`- Created: category/${category.toLowerCase()}`);
});

console.log('Build completed successfully!');
