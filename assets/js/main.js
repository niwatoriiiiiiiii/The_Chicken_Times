import { db, auth, signInAnonymously } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// CLS対策
if (typeof window.targetArticleId !== "undefined") document.body.classList.add("is-detail");
if (typeof window.targetCategory !== "undefined") document.body.classList.add("is-category");

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

const dateEl = document.getElementById("date");
if (dateEl) dateEl.textContent = `${ymd}, ${week}`;

let basePath = "";
if (typeof window.targetArticleId !== "undefined") {
  basePath = "../../../../";
} else if (typeof window.targetCategory !== "undefined") {
  basePath = "../../";
}

let currentUser = null;
const authPromise = signInAnonymously(auth).then(result => {
  currentUser = result.user;
  return currentUser;
});

function showSkeletons() {
  const latestContainer = document.getElementById("articles-latest");
  const gridContainer = document.getElementById("articles-grid");
  const mainContainer = document.getElementById("articles");

  if (typeof window.targetArticleId === "undefined" && typeof window.targetCategory === "undefined") {
    // ホーム画面
    if (latestContainer) {
      latestContainer.innerHTML = "";
      for (let i = 0; i < 3; i++) renderSkeleton(latestContainer);
    }
    if (gridContainer) {
      gridContainer.innerHTML = "";
      // グリッド用の簡易スケルトン
      for (let i = 0; i < 2; i++) {
        const skel = document.createElement("div");
        skel.className = "skeleton-article";
        skel.style.flexDirection = "column";
        skel.innerHTML = `<div class="skeleton-image" style="width:100%"></div><div class="skeleton-text" style="margin-top:10px"></div>`;
        gridContainer.appendChild(skel);
      }
    }
  } else if (mainContainer) {
    // カテゴリまたは記事詳細（記事詳細は実際にはJSで上書きされるがフォールバックとして）
    mainContainer.innerHTML = "";
    for (let i = 0; i < 3; i++) renderSkeleton(mainContainer);
  }
}

function renderSkeleton(container) {
  const skel = document.createElement("div");
  skel.className = "skeleton-article";
  skel.innerHTML = `
    <div class="article-text">
      <div class="skeleton skeleton-text" style="width: 30%"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width: 90%"></div>
    </div>
    <div class="skeleton skeleton-image"></div>
  `;
  container.appendChild(skel);
}

showSkeletons();

fetch(basePath + "data/news.json")
  .then(res => res.json())
  .then(data => {
    // 1. サイドバーのレンダリング
    renderSidebar(data);

    // 2. メインコンテンツのレンダリング
    const container = document.getElementById("articles");
    const latestContainer = document.getElementById("articles-latest");
    const gridContainer = document.getElementById("articles-grid");

    if (typeof window.targetArticleId !== "undefined") {
      // 記事詳細ページ
      const article = data.find(a => a.id === window.targetArticleId);
      if (article) {
        document.title = `${article.title} - THE CHICKEN TIMES`;
        if (container) {
          container.innerHTML = "";
          renderArticle(container, article, true);
        }
        initFirebaseForArticle(window.targetArticleId);
      }
      return;
    }

    if (typeof window.targetCategory !== "undefined") {
      // カテゴリページ
      if (container) {
        container.innerHTML = "";
        const catHeading = document.createElement("h1");
        catHeading.className = "category-title";
        catHeading.textContent = `${window.targetCategory} News`;
        container.appendChild(catHeading);
        const filtered = data.filter(a => a.category === window.targetCategory);
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        filtered.forEach(article => renderArticle(container, article, false));
      }
      return;
    }

    // ホーム画面
    if (latestContainer && gridContainer) {
      latestContainer.innerHTML = "";
      gridContainer.innerHTML = "";
      
      // 日付順にソート
      const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
      
      // 最新3件
      const latest3 = sorted.slice(0, 3);
      latest3.forEach(article => renderArticle(latestContainer, article, false));
      
      // 最新3件以外からランダムに2件
      const others = sorted.slice(3);
      const random2 = shuffle([...others]).slice(0, 2);
      random2.forEach(article => renderGridArticle(gridContainer, article));
    }
  });

function renderSidebar(data) {
  const featuredContainer = document.getElementById("side-featured");
  const listContainer = document.getElementById("recommended");
  if (!featuredContainer || !listContainer) return;

  featuredContainer.innerHTML = "";
  listContainer.innerHTML = "";

  const recommended = data.filter(a => a.recommended);
  const shuffled = shuffle([...recommended]);

  // 大項目 (1件)
  if (shuffled.length > 0) {
    const featured = shuffled[0];
    const articleUrl = `${basePath}articles/${featured.date}/${featured.category.toLowerCase()}/${featured.slug}/`;
    featuredContainer.innerHTML = `
      <div class="side-featured-item">
        <a href="${articleUrl}" style="text-decoration:none; color:inherit;">
          <img src="${basePath}assets/articles/${featured.category.toLowerCase()}/${featured.image}" alt="">
          <div class="article-meta">${featured.category} | ${featured.date}</div>
          <h2>${featured.title}</h2>
          <p>${Array.isArray(featured.lead) ? featured.lead[0] : featured.lead}</p>
        </a>
      </div>
    `;
  }

  // 小項目 (リスト 5件)
  const remaining = shuffled.slice(1, 6);
  remaining.forEach(article => {
    const itemEl = document.createElement("li");
    itemEl.className = "side-article";
    const articleUrl = `${basePath}articles/${article.date}/${article.category.toLowerCase()}/${article.slug}/`;
    const sidebarLead = Array.isArray(article.lead) ? article.lead[0] : article.lead;
    itemEl.innerHTML = `
      <a href="${articleUrl}" style="display:contents; color:inherit; text-decoration:none;">
        <img src="${basePath}assets/articles/${article.category.toLowerCase()}/${article.image}" alt="">
        <div class="side-article-info">
          <h3>${article.title}</h3>
          <p>${sidebarLead}</p>
        </div>
      </a>
    `;
    listContainer.appendChild(itemEl);
  });
}

function renderArticle(container, article, isDetail) {
  const el = document.createElement("article");
  el.className = isDetail ? "headline is-detail" : "headline is-list";
  const articleUrl = isDetail ? "#" : `${basePath}articles/${article.date}/${article.category.toLowerCase()}/${article.slug}/`;
  const textWrapper = document.createElement("div");
  textWrapper.className = "article-text";
  const titleHtml = isDetail 
    ? `<h1>${article.title}</h1>`
    : `<h1><a href="${articleUrl}" style="color:inherit; text-decoration:none;">${article.title}</a></h1>`;
  const metadataEl = document.createElement("div");
  metadataEl.className = "article-meta";
  metadataEl.innerHTML = `${article.category} | ${article.date} <span id="view-count-wrap"></span>`;
  const leadContainer = document.createElement("div");
  leadContainer.className = "lead-container";
  const leads = Array.isArray(article.lead) ? article.lead : [article.lead];
  leads.forEach(lText => {
    const p = document.createElement("p");
    p.className = "lead";
    p.textContent = lText;
    leadContainer.appendChild(p);
  });
  textWrapper.appendChild(metadataEl);
  textWrapper.insertAdjacentHTML('beforeend', titleHtml);
  textWrapper.appendChild(leadContainer);

  if (isDetail) {
    const bodyContainer = document.createElement("div");
    bodyContainer.id = "body-content";
    article.body.forEach(pText => {
      const pEl = document.createElement("p");
      pEl.textContent = pText;
      bodyContainer.appendChild(pEl);
    });
    textWrapper.appendChild(bodyContainer);
    const reactionContainer = document.createElement("div");
    reactionContainer.id = "reaction-area";
    reactionContainer.className = "reaction-bar";
    textWrapper.appendChild(reactionContainer);
  }

  if (article.image && article.category) {
    const imageSrc = `${basePath}assets/articles/${article.category.toLowerCase()}/${article.image}`;
    const imageHtml = isDetail
      ? `<img src="${imageSrc}" class="article-image" width="1000" height="562">`
      : `<a href="${articleUrl}" class="article-image-wrapper"><img src="${imageSrc}" class="article-image" width="500" height="333"></a>`;
    if (isDetail) {
      el.appendChild(textWrapper);
      textWrapper.insertBefore(createElementFromHTML(imageHtml), textWrapper.querySelector('.lead-container'));
    } else {
      const contentWrapper = document.createElement("div");
      contentWrapper.className = "article-content";
      contentWrapper.appendChild(textWrapper);
      contentWrapper.insertAdjacentHTML('beforeend', imageHtml);
      el.appendChild(contentWrapper);
    }
  } else {
    el.appendChild(textWrapper);
  }
  container.appendChild(el);
}

function renderGridArticle(container, article) {
  const div = document.createElement("div");
  div.className = "grid-article";
  const articleUrl = `${basePath}articles/${article.date}/${article.category.toLowerCase()}/${article.slug}/`;
  const imageSrc = `${basePath}assets/articles/${article.category.toLowerCase()}/${article.image}`;
  const lead = Array.isArray(article.lead) ? article.lead[0] : article.lead;
  
  div.innerHTML = `
    <a href="${articleUrl}" class="article-image-wrapper">
      <img src="${imageSrc}" class="article-image" alt="">
    </a>
    <div class="article-meta">${article.category} | ${article.date}</div>
    <h2><a href="${articleUrl}" style="color:inherit; text-decoration:none;">${article.title}</a></h2>
    <p class="lead">${lead}</p>
  `;
  container.appendChild(div);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let userReactions = [];
let lastCounts = {};

async function initFirebaseForArticle(articleId) {
  const user = await authPromise;
  const docRef = doc(db, "articles", articleId.toString());
  const userStatusRef = doc(db, "articles", articleId.toString(), "user_status", user.uid);
  onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      lastCounts = data.reactions || {};
      updateViewCountUI(data.views || 0);
      refreshReactionUI(articleId);
    }
  });
  onSnapshot(userStatusRef, (userSnap) => {
    userReactions = (userSnap.exists() && userSnap.data().reactedEmojis) || [];
    refreshReactionUI(articleId);
  });
  const userStatusSnap = await getDoc(userStatusRef);
  if (!userStatusSnap.exists() || !userStatusSnap.data().hasViewed) {
    await setDoc(docRef, { views: increment(1) }, { merge: true });
    await setDoc(userStatusRef, { hasViewed: true }, { merge: true });
  }
}

function updateViewCountUI(count) {
  const wrap = document.getElementById("view-count-wrap");
  if (wrap) {
    wrap.innerHTML = `<span class="view-count">🐔 ${count.toLocaleString()} views</span>`;
  }
}

const EMOJI_LIST = ["🐔","🐣","🎈","✨","🎉","🔎","💡","📌","🥚","🍳","🍗","🍴","🌏","⭐","⚡","🔥","❤️","🧡","💛","💚","💙","🩵","💜","💦","💤","💥","💢","❗","❓","💭"];

function refreshReactionUI(articleId) {
  const area = document.getElementById("reaction-area");
  if (!area) return;
  area.innerHTML = "";
  
  EMOJI_LIST.forEach(emoji => {
    const count = lastCounts[emoji] || 0;
    const isActed = userReactions.includes(emoji);
    if (count > 0 || isActed) {
      const btn = document.createElement("button");
      btn.className = `reaction-btn ${isActed ? 'acted' : ''}`;
      btn.innerHTML = `${emoji} <span class="count">${count}</span>`;
      btn.onclick = () => handleReactionClick(articleId, emoji);
      area.appendChild(btn);
    }
  });

  const pickerWrapper = document.createElement("div");
  pickerWrapper.className = "emoji-picker-wrapper";

  const addBtn = document.createElement("button");
  addBtn.className = "add-reaction-btn";
  addBtn.innerHTML = "🐔";
  addBtn.onclick = (e) => {
    e.stopPropagation();
    toggleEmojiPicker(pickerWrapper);
  };
  pickerWrapper.appendChild(addBtn);

  const picker = document.createElement("div");
  picker.className = "emoji-picker"; 
  EMOJI_LIST.forEach(emoji => {
    const span = document.createElement("span");
    span.className = "picker-emoji";
    span.textContent = emoji;
    span.onclick = (e) => {
      e.stopPropagation();
      handleReactionClick(articleId, emoji);
      toggleEmojiPicker(pickerWrapper, false);
    };
    picker.appendChild(span);
  });
  pickerWrapper.appendChild(picker);
  area.appendChild(pickerWrapper);
}

function toggleEmojiPicker(wrapper, force) {
  const picker = wrapper.querySelector(".emoji-picker");
  if (!picker) return;
  
  const isOpening = force !== undefined ? force : !picker.classList.contains("show");
  
  if (isOpening) {
    document.querySelectorAll(".emoji-picker.show").forEach(p => closePicker(p));

    // 表示前に計算 (透明な状態で配置)
    picker.style.display = "grid";
    picker.style.visibility = "hidden";
    adjustPickerPosition(picker);
    
    // 計算が終わってから表示
    picker.style.visibility = "visible";
    picker.classList.add("show");
  } else {
    closePicker(picker);
  }
}

function closePicker(picker) {
  picker.classList.remove("show");
  // アニメーション完了後に非表示
  setTimeout(() => {
    if (!picker.classList.contains("show")) {
      picker.style.display = "none";
      // 位置の初期化（再計算をスムーズにするため）
      picker.style.left = "";
      picker.style.right = "";
      picker.style.transform = "";
    }
  }, 150);
}

function adjustPickerPosition(picker) {
  picker.style.left = "50%";
  picker.style.right = "auto";
  picker.style.transform = "translateX(-50%)";

  const rect = picker.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const padding = 10;

  if (rect.left < padding) {
    const offset = padding - rect.left;
    picker.style.transform = `translateX(calc(-50% + ${offset}px))`;
  } else if (rect.right > viewportWidth - padding) {
    const offset = rect.right - (viewportWidth - padding);
    picker.style.transform = `translateX(calc(-50% - ${offset}px))`;
  }
}

document.addEventListener("click", () => {
  document.querySelectorAll(".emoji-picker.show").forEach(p => closePicker(p));
});

async function handleReactionClick(articleId, emoji) {
  const user = auth.currentUser;
  if (!user) return;
  const docRef = doc(db, "articles", articleId.toString());
  const userStatusRef = doc(db, "articles", articleId.toString(), "user_status", user.uid);
  const isActed = userReactions.includes(emoji);
  if (isActed) {
    await updateDoc(docRef, { [`reactions.${emoji}`]: increment(-1) });
    await updateDoc(userStatusRef, { reactedEmojis: userReactions.filter(e => e !== emoji) });
  } else {
    await updateDoc(docRef, { [`reactions.${emoji}`]: increment(1) }, { merge: true });
    await setDoc(userStatusRef, { reactedEmojis: [...userReactions, emoji] }, { merge: true });
  }
}

function createElementFromHTML(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
}
