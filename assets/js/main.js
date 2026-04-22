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
  const container = document.getElementById("articles");
  if (!container) return;
  if (typeof window.targetArticleId === "undefined") {
    container.innerHTML = "";
    for (let i = 0; i < 3; i++) {
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
  }
}

showSkeletons();

fetch(basePath + "data/news.json")
  .then(res => res.json())
  .then(data => {
    const recommendedContainer = document.getElementById("recommended");
    if (recommendedContainer) {
      recommendedContainer.innerHTML = "";
      const recommended = data.filter(a => a.recommended);
      for (let i = recommended.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [recommended[i], recommended[j]] = [recommended[j], recommended[i]];
      }
      recommended.forEach(a => {
        const itemEl = document.createElement("li");
        itemEl.className = "side-article";
        const articleUrl = `${basePath}articles/${a.date}/${a.tag.toLowerCase()}/${a.slug}/`;
        const sidebarLead = Array.isArray(a.lead) ? a.lead[0] : a.lead;
        itemEl.innerHTML = `
          <a href="${articleUrl}" style="display:contents; color:inherit; text-decoration:none;">
            <img src="${basePath}assets/articles/${a.tag.toLowerCase()}/${a.image}" alt="" style="aspect-ratio: 1/1; object-fit: cover;">
            <div class="side-article-info">
              <h3>${a.title}</h3>
              <p>${sidebarLead}</p>
            </div>
          </a>
        `;
        recommendedContainer.appendChild(itemEl);
      });
    }

    const container = document.getElementById("articles");
    if (container) container.innerHTML = ""; 

    if (typeof window.targetArticleId !== "undefined") {
      const article = data.find(a => a.id === window.targetArticleId);
      if (article) {
        document.title = `${article.title} - THE CHICKEN TIMES`;
        renderArticle(container, article, true);
        initFirebaseForArticle(window.targetArticleId);
      }
      return;
    }

    if (typeof window.targetCategory !== "undefined") {
      const catHeading = document.createElement("h1");
      catHeading.className = "category-title";
      catHeading.textContent = `${window.targetCategory} News`;
      container.appendChild(catHeading);
      data = data.filter(a => a.tag === window.targetCategory);
    }

    data.forEach(article => {
      renderArticle(container, article, false);
    });
  });

function renderArticle(container, article, isDetail) {
  const el = document.createElement("article");
  el.className = isDetail ? "headline is-detail" : "headline is-list";
  const articleUrl = isDetail ? "#" : `${basePath}articles/${article.date}/${article.tag.toLowerCase()}/${article.slug}/`;
  const textWrapper = document.createElement("div");
  textWrapper.className = "article-text";
  const titleHtml = isDetail 
    ? `<h1>${article.title}</h1>`
    : `<h1><a href="${articleUrl}" style="color:inherit; text-decoration:none;">${article.title}</a></h1>`;
  const metadataEl = document.createElement("div");
  metadataEl.className = "article-meta";
  metadataEl.innerHTML = `${article.tag} | ${article.date} <span id="view-count-wrap"></span>`;
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

  if (article.image && article.tag) {
    const imageSrc = `${basePath}assets/articles/${article.tag.toLowerCase()}/${article.image}`;
    const imageHtml = isDetail
      ? `<img src="${imageSrc}" class="article-image" width="1000" height="562">`
      : `<a href="${articleUrl}"><img src="${imageSrc}" class="article-image" width="500" height="333"></a>`;
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
