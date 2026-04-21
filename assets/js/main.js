const d = new Date();

const ymd = d.toLocaleDateString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const week = d.toLocaleDateString("en-US", {
  timeZone: "Asia/Tokyo",
  weekday: "long" 
});

document.getElementById("date").textContent = `${ymd}, ${week}`;

const basePath = typeof window.targetCategory !== "undefined" ? "../../" : "";

fetch(basePath + "data/news.json")
  .then(res => res.json())
  .then(data => {
    const recommendedContainer = document.getElementById("recommended");
    if (recommendedContainer) {
      recommendedContainer.innerHTML = "";
      
      // おすすめ記事を抽出してシャッフル
      const recommended = data.filter(a => a.recommended);
      for (let i = recommended.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [recommended[i], recommended[j]] = [recommended[j], recommended[i]];
      }

      recommended.forEach(a => {
        const itemEl = document.createElement("li");
        itemEl.className = "side-article";
        
        const imgEl = document.createElement("img");
        imgEl.src = `${basePath}assets/articles/${a.tag.toLowerCase()}/${a.image}`;
        
        const infoEl = document.createElement("div");
        infoEl.className = "side-article-info";
        
        const titleEl = document.createElement("h3");
        titleEl.textContent = a.title;
        
        const leadEl = document.createElement("p");
        leadEl.textContent = a.lead;
        
        infoEl.appendChild(titleEl);
        infoEl.appendChild(leadEl);
        
        itemEl.appendChild(imgEl);
        itemEl.appendChild(infoEl);
        recommendedContainer.appendChild(itemEl);
      });
    }

    const container = document.getElementById("articles");

    if (typeof window.targetCategory !== "undefined") {
      const sideEl = document.querySelector('.side');
      const mainEl = document.querySelector('.main');
      if (sideEl) sideEl.style.display = 'none';
      if (mainEl) {
        mainEl.style.borderRight = 'none';
        mainEl.style.paddingRight = '0';
      }
      const layoutEl = document.querySelector('.layout');
      if (layoutEl) {
        layoutEl.style.gridTemplateColumns = '1fr';
        layoutEl.style.maxWidth = '1300px';
      }

      const catHeading = document.createElement("h1");
      catHeading.textContent = `${window.targetCategory} News`;
      catHeading.style.fontFamily = '"Playfair Display", "Noto Serif JP", serif';
      catHeading.style.fontSize = '46px';
      catHeading.style.marginBottom = '50px';
      catHeading.style.borderBottom = '1px solid #ccc';
      catHeading.style.paddingBottom = '15px';
      catHeading.style.textAlign = 'center';
      container.appendChild(catHeading);

      data = data.filter(a => a.tag === window.targetCategory);
    }

    data.forEach(article => {
      const el = document.createElement("article");
      el.className = "headline";

      const contentWrapper = document.createElement("div");
      contentWrapper.className = "article-content";

      const textWrapper = document.createElement("div");
      textWrapper.className = "article-text";

      const titleEl = document.createElement("h1");
      titleEl.textContent = article.title;

      const metadataEl = document.createElement("div");
      metadataEl.className = "article-meta";
      metadataEl.textContent = `${article.tag} | ${article.date}`;

      const leadEl = document.createElement("p");
      leadEl.className = "lead";
      leadEl.textContent = article.lead;

      const bodyContainer = document.createElement("div");
      article.body.forEach(pText => {
        const pEl = document.createElement("p");
        pEl.textContent = pText;
        bodyContainer.appendChild(pEl);
      });

      textWrapper.appendChild(metadataEl);
      textWrapper.appendChild(titleEl);
      textWrapper.appendChild(leadEl);
      textWrapper.appendChild(bodyContainer);

      if (article.image && article.tag) {
        const imageSrc = `${basePath}assets/articles/${article.tag.toLowerCase()}/${article.image}`;
        const imageEl = document.createElement("img");
        imageEl.className = "article-image";
        imageEl.src = imageSrc;
        
        contentWrapper.appendChild(textWrapper);
        contentWrapper.appendChild(imageEl);
        el.appendChild(contentWrapper);
      } else {
        el.appendChild(textWrapper);
      }

      container.appendChild(el);
    });
  });
