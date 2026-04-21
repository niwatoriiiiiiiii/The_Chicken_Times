const d = new Date();

const ymd = d.toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const week = d.toLocaleDateString("en-US", { 
  weekday: "long" 
});

document.getElementById("date").textContent = `${ymd}, ${week}`;

fetch("data/news.json")
  .then(res => res.json())
  .then(data => {
    const container = document.getElementById("articles");

    data.forEach(article => {
      const el = document.createElement("article");
      el.className = "headline";

      const titleEl = document.createElement("h1");
      titleEl.textContent = article.title;

      const leadEl = document.createElement("p");
      leadEl.className = "lead";
      leadEl.textContent = article.lead;

      const bodyContainer = document.createElement("div");
      article.body.forEach(pText => {
        const pEl = document.createElement("p");
        pEl.textContent = pText;
        bodyContainer.appendChild(pEl);
      });

      el.appendChild(titleEl);
      el.appendChild(leadEl);
      el.appendChild(bodyContainer);

      container.appendChild(el);
    });
  });

const trending = ["卵、再び消失", "夜間の光", "人間の騒音"];

const trendingContainer = document.getElementById("trending");
trending.forEach(t => {
  const liEl = document.createElement("li");
  liEl.textContent = t;
  trendingContainer.appendChild(liEl);
});
  
