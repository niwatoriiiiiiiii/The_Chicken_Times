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

      el.innerHTML = `
        <h1>${article.title}</h1>
        <p class="lead">${article.lead}</p>
        <div>
          ${article.body.map(p => `<p>${p}</p>`).join("")}
        </div>
      `;

      container.appendChild(el);
    });
  });

const trending = ["卵、再び消失", "夜間の光", "人間の騒音"];

document.getElementById("trending").innerHTML =
  trending.map(t => `<li>${t}</li>`).join("");
  
