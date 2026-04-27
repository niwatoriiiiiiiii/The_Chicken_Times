const fs = require('fs');
const path = require('path');

// ============================================================
// Chicken Times: BERT + Markov NLG Engine v2
// ============================================================

// ----------------------
// Utilities
// ----------------------
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick(items) {
  const bag = [];
  for (const item of items) {
    for (let i = 0; i < item.weight; i++) bag.push(item);
  }
  return rand(bag);
}

function clean(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/がを/g, "を")
    .replace(/をを/g, "を")
    .replace(/のの/g, "の")
    .replace(/への影響への影響/g, "への影響")
    .replace(/、、+/g, "、")
    .replace(/。{2,}/g, "。")
    .replace(/、。/g, "。")
    .replace(/　+/g, "")
    .trim();
}

function uniqSentences(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const t = clean(s);
    const key = t.replace(/\s+/g, "");
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

function pickUnique(arr, used) {
  const candidates = arr.filter(x => !used.has(x));
  const choice = rand(candidates.length ? candidates : arr);
  used.add(choice);
  return choice;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ----------------------
// Semantic clusterer
// ----------------------
class SemanticClusterer {
  constructor({ embed = null, threshold = 0.82 } = {}) {
    this.embed = embed;        // BERTSimulator.embed を受け取る
    this.threshold = threshold;
    this.seenFamilies = new Set();
    this.seenVectors = [];
  }

  familyOf(text) {
    const t = clean(text);
    if (/(観測|記録|確認|点検|追跡|監視)/.test(t)) return "observe";
    if (/(不明|断定|解明|理由|可能性|見方|見込)/.test(t)) return "uncertainty";
    if (/(警戒|慎重|注視|静観|維持)/.test(t)) return "caution";
    if (/(述べた|コメント|話した|とした)/.test(t)) return "quote";
    if (/(周辺|現場|区域|区画|外周|通路|搬入口)/.test(t)) return "scene";
    if (/(引き続き|継続|続け|更新|再確認)/.test(t)) return "continuation";
    if (/(影響|懸念|変化|異常|混乱|停止|乱れ|封鎖|制限)/.test(t)) return "impact";
    if (/(再発防止|見直し|再考|本質|意味|必要性|判断|議論|整理|位置づけ)/.test(t)) return "analysis";
    return "other";
  }

  cosine(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return -1;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return -1;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  keep(text, family = null) {
    const fam = family || this.familyOf(text);
    if (this.seenFamilies.has(fam)) return false;
    this.seenFamilies.add(fam);

    if (typeof this.embed === "function") {
      const vec = this.embed(text);
      if (Array.isArray(vec) && vec.length > 0) {
        for (const item of this.seenVectors) {
          if (this.cosine(vec, item.vec) >= this.threshold) return false;
        }
        this.seenVectors.push({ fam, vec });
      }
    }

    return true;
  }
}

// ----------------------
// BERTSimulator
// 疑似BERTエンベディング: char n-gram + TF-IDF ベースの128次元ベクトル
// ・文字bigram/trigram + 和語/漢字ワードをトークンとして使用
// ・IDF重みをコーパスから学習
// ・L2正規化してcosine距離でSemanticClustererに渡す
// ----------------------
class BERTSimulator {
  constructor(dims = 128) {
    this.dims = dims;
    this._idf = new Map();
  }

  // FNV-1a 風ハッシュ → bucket インデックス
  _hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h % this.dims;
  }

  // 日本語テキストのトークナイズ
  // char bigram + trigram + 和語（ひらがな2文字以上）+ 漢語（漢字1-5文字）
  _tokenize(text) {
    const t = clean(text);
    const tokens = [];
    for (let i = 0; i < t.length - 1; i++) tokens.push(t.slice(i, i + 2));
    for (let i = 0; i < t.length - 2; i++) tokens.push(t.slice(i, i + 3));
    const words = t.match(/[\u3041-\u3096]{2,}|[\u30a1-\u30f6]{2,}|[\u4e00-\u9fff]{1,5}/g) || [];
    tokens.push(...words);
    return tokens;
  }

  // コーパスからIDF重みを学習
  trainIDF(sentences) {
    const df = new Map();
    const N = sentences.length || 1;
    for (const s of sentences) {
      for (const tok of new Set(this._tokenize(s))) {
        df.set(tok, (df.get(tok) || 0) + 1);
      }
    }
    for (const [tok, freq] of df) {
      this._idf.set(tok, Math.log((N + 1) / (freq + 1)) + 1.0);
    }
  }

  // テキスト → 128次元L2正規化ベクトル
  embed(text) {
    const tokens = this._tokenize(text);
    if (!tokens.length) return [];

    const tf = new Map();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1);

    const vec = new Array(this.dims).fill(0.0);
    for (const [tok, cnt] of tf) {
      const idf = this._idf.get(tok) ?? 1.0;
      const w = (cnt / tokens.length) * idf;
      const b = this._hash(tok);
      vec[b] += w;
      // 隣接バケットへ緩やかにスプレッド（平滑化）
      vec[(b + 1) % this.dims] += w * 0.25;
      vec[(b - 1 + this.dims) % this.dims] += w * 0.25;
    }

    // L2正規化
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vec.map(v => v / norm);
  }
}

// ----------------------
// MarkovNaturalizer
// 補助的なMarkovチェーン（弱め、文末のみ）
// ・コーパス全文から文末パターンを学習
// ・strength=0.15 の低確率でのみ発動
// ・安全な文末置換セットを使用してgrammatical breakを回避
// ・あくまで「自然化の補助」であり主役はBERT+テンプレ側
// ----------------------
class MarkovNaturalizer {
  constructor() {
    this._learnedEndings = new Map(); // 元パターン → 学習済みバリエーション[]
    this._corpusEndingSuffixes = [];  // コーパスから抽出した文末サフィックス
    this._initialized = false;

    // 安全な文末変換ルール（日本語文法を壊さないもののみ）
    this._safeTransforms = [
      { pat: /続けられている。$/, pool: ["継続されている。", "進められている。", "続いている。"] },
      { pat: /見込みだ。$/, pool: ["見通しだ。", "とみられている。", "と予想されている。"] },
      { pat: /確認された。$/, pool: ["観測された。", "記録された。", "報告された。"] },
      { pat: /進められている。$/, pool: ["続けられている。", "継続されている。"] },
      { pat: /とみられている。$/, pool: ["と考えられている。", "との見方がある。", "とされている。"] },
      { pat: /待たれている。$/, pool: ["注目されている。", "期待されている。"] },
      { pat: /続けられる。$/, pool: ["継続される。", "続く見込みだ。"] },
      { pat: /維持される。$/, pool: ["保たれる見込みだ。", "続けられる予定だ。"] },
      { pat: /可能性がある。$/, pool: ["とみられる。", "との指摘もある。"] },
      { pat: /予定だ。$/, pool: ["見通しだ。", "とされている。"] },
    ];
  }

  // コーパス全文からMarkovモデルを学習
  // bigram model（キャラクタレベル）+ 文末サフィックス抽出
  train(sentences) {
    for (const s of sentences) {
      const t = clean(s);
      if (!t.endsWith("。")) continue;
      // 文末サフィックス（3-10文字 + 。）を抽出
      const m = t.match(/([^\s。]{3,10})。$/);
      if (m) this._corpusEndingSuffixes.push(m[1] + "。");
    }
    this._initialized = true;
  }

  // 文を弱いMarkovで自然化
  // strength: 発動確率（デフォルト0.15 = 15%のみ変換）
  naturalize(sentence, strength = 0.15) {
    if (!chance(strength) || !this._initialized) return sentence;

    // 安全変換ルールを優先的に試みる
    for (const { pat, pool } of this._safeTransforms) {
      if (pat.test(sentence)) {
        const candidate = sentence.replace(pat, rand(pool));
        return clean(candidate);
      }
    }

    // どのルールにも該当しない場合はそのまま返す
    return sentence;
  }
}

// ----------------------
// Shared phrase pools
// ----------------------
const COMMON = {
  times: [
    "本日未明", "今朝早く", "昨夜", "ここ数日", "早朝", "午後にかけて",
    "観測開始以降", "確認時点で", "直近の観測では", "一部の時間帯で",
    "前日から", "同日中に", "今朝の段階で", "夜間にかけて"
  ],
  places: [
    "第3鶏舎",
    "監視区域",
    "給餌エリア",
    "柵付近",
    "外周部",
    "南側通路",
    "上空",
    "保管区画",
    "通路脇",
    "観測地点周辺",
    "北側の一角",
    "飼育区画の外縁",
    "搬入口付近",
    "記録担当の区画"
  ],
  uncertainty: [
    "詳細は不明だが", "理由はよくわかっていないが", "目的は解明されていないが",
    "現時点では断定できないが", "背景には複数の要因があるとみられるが",
    "一部では偶然との見方もあるが", "専門家の間でも意見が分かれているが",
    "記録上はまだ説明がついていないが"
  ],
  experts: [
    "現地のにわとり", "複数の個体", "観測班", "関係者", "専門家のにわとり",
    "長期観測チーム", "記録担当の個体", "警戒中のにわとり", "点検係", "監視を続ける個体"
  ],
  reactions: [
    "これまでにも似た兆候はあった", "想定外ではない", "かなり慎重に見る必要がある",
    "まずは様子を見るべきだ", "今後の推移を注視したい", "静観するしかない",
    "記録を続ける価値はある", "異常とは言い切れない", "判断は早い", "再確認が必要だ"
  ],
  closings: [
    "引き続き観測は続けられる。",
    "今後も同様の動きがあるか確認される見込みだ。",
    "原因の特定には時間がかかるとみられる。",
    "関係者は慎重な対応を続けている。",
    "追加情報が入り次第、更新される予定だ。",
    "現場では引き続き警戒が維持される。",
    "今後の観測結果が待たれている。",
    "記録の更新が進められている。"
  ],
  scenes: [
    "現場では短時間だけ空気が張りつめた。",
    "周辺では一時的に動きが止まった。",
    "その後もしばらく静かな状態が続いた。",
    "一帯では通常とは異なる雰囲気が保たれた。",
    "目立った混乱はなかったものの、警戒は解けていない。",
    "しばらくは静かな観測が続いた。"
  ],
  statuses: [
    "追加の確認が進められている。",
    "監視体制は維持されたままだ。",
    "記録の更新は続いている。",
    "現場では慎重な対応が続いている。",
    "再発防止に向けた確認が進められている。",
    "点検作業は継続されている。"
  ],
  impacts: [
    "卵の回収", "餌の供給", "安全性", "群れ全体の行動",
    "観測体制", "周囲の警戒", "保管作業", "記録の精度"
  ],
  bridges: [
    "別の見方では、", "一方で、", "その後の観測では、", "さらに、", "これを受けて、", "加えて、"
  ],
  fillers: [
    "観測は継続中だ。",
    "記録は更新されている。",
    "状況はなお注視されている。",
    "現場は落ち着きを保っている。",
    "追加の確認が進められている。"
  ]
};

// ----------------------
// Data helpers
// ----------------------
const S = (jp, slug, kind, subtype, placeRole, canMovePhysical, theme, risk, watch, angle, note) => ({
  jp, slug, kind, subtype, placeRole, canMovePhysical, theme, risk, watch, angle, note
});

const A = (title, past, slug, {
  allowedKinds,
  allowedSubtypes,
  allowedPlaceRoles,
  valency = "intransitive", // intransitive | transitive | state | relation
  requiresPhysicalMove = false,
  objects = [],
  eventPhrase = null
} = {}) => ({
  title,
  past,
  slug,
  allowedKinds,
  allowedSubtypes,
  allowedPlaceRoles,
  valency,
  requiresPhysicalMove,
  objects,
  eventPhrase
});

function compatibleActions(subject, actions) {
  return actions.filter(a => {
    if (a.allowedKinds && !a.allowedKinds.includes(subject.kind)) return false;
    if (a.allowedSubtypes && !a.allowedSubtypes.includes(subject.subtype)) return false;
    if (a.allowedPlaceRoles && !a.allowedPlaceRoles.includes(subject.placeRole)) return false;
    if (a.requiresPhysicalMove && !subject.canMovePhysical) return false;
    return true;
  });
}

function chooseAction(subject, actions) {
  const list = compatibleActions(subject, actions);
  return rand(list.length ? list : actions);
}

function makeContext(subject, action) {
  const used = new Set();
  return {
    subject,
    action,
    time: pickUnique(COMMON.times, used),
    place: pickUnique(COMMON.places, used),
    uncertainty: pickUnique(COMMON.uncertainty, used),
    expert: pickUnique(COMMON.experts, used),
    reaction: pickUnique(COMMON.reactions, used),
    closing: pickUnique(COMMON.closings, used),
    scene: pickUnique(COMMON.scenes, used),
    status: pickUnique(COMMON.statuses, used),
    impact: pickUnique(COMMON.impacts, used),
    bridge: pickUnique(COMMON.bridges, used),
    filler: pickUnique(COMMON.fillers, used)
  };
}

// ----------------------
// Grammar helpers
// ----------------------
function headline(subject, action) {
  if (subject.kind === "abstract") return `${subject.jp}の${action.title}`;
  if (subject.kind === "place") {
    if (subject.placeRole === "interior") {
      return `${subject.jp}への${action.eventPhrase || action.title}`;
    }
    return `${subject.jp}、${action.title}`;
  }
  return `${subject.jp}、${action.title}`;
}

function lead1(subject, action, ctx, category) {
  const eventPhrase = clean(action.eventPhrase || action.title);

  if (category === "Opinion" || subject.kind === "abstract") {
    return `${ctx.time}、${ctx.place}では${subject.jp}を巡る${eventPhrase}が続いている。`;
  }

  if (subject.kind === "agent") {
    if (action.valency === "transitive" && action.objects && action.objects.length) {
      return `${ctx.time}、${ctx.place}で${subject.jp}が${rand(action.objects)}を${action.past}ことが確認された。`;
    }
    return `${ctx.time}、${ctx.place}で${subject.jp}が${action.past}ことが確認された。`;
  }

  if (subject.kind === "object") {
    return `${ctx.time}、${ctx.place}で${subject.jp}の${eventPhrase}が確認された。`;
  }

  if (subject.kind === "place") {
    if (subject.placeRole === "interior") {
      return `${ctx.time}、${ctx.place}で${subject.jp}への${eventPhrase}が確認された。`;
    }
    if (subject.placeRole === "facility") {
      return `${ctx.time}、${ctx.place}で${subject.jp}が${action.past}ことが確認された。`;
    }
    if (subject.placeRole === "route") {
      return `${ctx.time}、${ctx.place}で${subject.jp}の${eventPhrase}が確認された。`;
    }
    if (subject.placeRole === "zone" || subject.placeRole === "bay") {
      return `${ctx.time}、${ctx.place}で${subject.jp}の${eventPhrase}が確認された。`;
    }
  }

  if (subject.kind === "phenomenon") {
    return `${ctx.time}、${ctx.place}で${subject.jp}が${action.past}ことが確認された。`;
  }

  return `${ctx.time}、${ctx.place}で${subject.jp}が${action.past}ことが確認された。`;
}

function lead2(subject, action, ctx, category) {
  if (category === "Opinion" || subject.kind === "abstract") {
    return `これを受けて、${subject.note}に対する見直しが進んでいる。`;
  }

  if (subject.kind === "place" && subject.placeRole === "interior") {
    return `${subject.jp}への立ち入り制限が懸念されており、${ctx.scene}`;
  }

  return `${ctx.impact}への影響が懸念されており、${ctx.scene}`;
}

// ----------------------
// Category-specific phrase banks
// ----------------------
const CATEGORY_PHRASES = {
  Human: {
    intro: [
      (s) => `記録によると、${s.jp}の行動には以前から一定の傾向が見られており、今回の事象は突発的なものではない可能性がある。`,
      (s) => `観測によると、${s.jp}は以前から似た動きを見せており、今回の事象もその延長にある可能性がある。`,
      (s) => `周囲の記録では、${s.jp}に関する同様の行動が過去にも確認されている。`
    ],
    context: [
      (s) => `朝の時間帯を中心に、${s.note}に関する記録が継続されている。`,
      (s) => `周辺では、${s.theme}とみられる動きが断続的に観測されている。`,
      (s) => `にわとり側では、${s.watch}の変化を慎重に見守っている。`
    ],
    extra: [
      () => `今後も同様の動きがあるか確認される見込みだ。`,
      () => `引き続き、周辺での観測が進められている。`,
      () => `追加の確認結果が待たれている。`
    ]
  },

  Egg: {
    intro: [
      (s) => `記録によると、${s.jp}の所在確認では以前から似た傾向が記録されており、今回も例外ではない可能性がある。`,
      (s) => `観測によると、${s.jp}は過去にも同様の変化が確認されており、今回の事象は継続的なものとみられている。`,
      (s) => `点検記録を見る限り、${s.jp}の変化は一度きりではない。`
    ],
    context: [
      (s) => `点検係は${s.watch}を中心に、所在確認を続けている。`,
      (s) => `保管区画では、${s.note}の移動経路が記録されている。`,
      (s) => `回収作業との時間差が、変化の一因である可能性もある。`
    ],
    extra: [
      () => `点検の精度そのものを見直すべきだという声もある。`,
      () => `再確認の工程が増やされる可能性がある。`,
      () => `所在の追跡は今後もしばらく続く見込みだ。`
    ]
  },

  World: {
    intro: [
      (s) => `観測によると、${s.jp}は過去にも類似の変化が確認されており、今回の動きもその延長にある可能性がある。`,
      (s) => `記録では、${s.jp}に似た変化が断続的に確認されている。`,
      (s) => `外界の変化は予測が難しく、今回も慎重な見極めが必要とされている。`
    ],
    context: [
      (s) => `${s.watch}では、変化の持続性が慎重に見極められている。`,
      (s) => `気流や視界の変化についても、継続して確認が進められている。`,
      (s) => `空模様の移り変わりは、短時間でも周辺の判断に影響を与える。`
    ],
    extra: [
      () => `今後も同様の動きがあるか確認される見込みだ。`,
      () => `外界の変化に関する追加観測が行われる予定だ。`,
      () => `記録の更新は引き続き続けられる。`
    ]
  },

  Incident: {
    intro: [
      (s) => `観測によると、${s.jp}ではこれまでも断続的に同様の事象が確認されており、今回の動きも慎重に見極められている。`,
      (s) => `記録では、${s.jp}に関する短時間の異変が過去にも確認されている。`,
      (s) => `今回の事象は、${s.note}に関する継続観測の中で確認された。`
    ],
    context: [
      (s) => {
        if (s.kind === "place" && s.placeRole === "interior") {
          return `${s.jp}への立ち入り制限が続いており、再確認が進められている。`;
        }
        if (s.kind === "place" && s.placeRole === "facility") {
          return `${s.jp}では、現在も再確認が続けられている。`;
        }
        if (s.kind === "place" && s.placeRole === "route") {
          return `${s.jp}の通行経路についても、再確認が進められている。`;
        }
        return `搬入や移動の経路についても、再確認が進められている。`;
      },
      (s) => `${s.watch}では、現在も再確認が続けられている。`,
      (s) => `短時間の混乱であっても、記録上は重要な変化として扱われている。`
    ],
    extra: [
      () => `再発防止に向けた確認が進められている。`,
      () => `点検の手順を見直す動きもある。`,
      () => `引き続き、警戒体制は維持される見込みだ。`
    ]
  }
};

const OPINION_PHRASES = {
  intro: [
    (s) => `記録によると、${s.jp}は以前から議論の対象となっており、今回の動きはその流れの延長にある可能性がある。`,
    (s) => `議論の焦点は、${s.note}をどう捉えるかに移っている。`,
    () => `これまで当然とされてきた理解を、改めて整理し直す必要がある。`
  ],
  context: [
    (s) => `${s.angle}をめぐる認識は、改めて整理されつつある。`,
    () => `にわとりの視点では、日常の中にこそ重要な問いが隠れている。`,
    () => `見方の違いはあるが、問題意識の共有は進んでいる。`
  ],
  extra: [
    () => `今後も記録と議論の両面から観察を続ける必要がある。`,
    () => `意見の違いはあるものの、理解の更新は続いている。`,
    () => `判断は急がず、記録を積み重ねる方がよいとみられている。`
  ]
};

// ----------------------
// Modes
// ----------------------
const MODE_DEFS = [
  { name: "brief",    weight: 20, lead: ["lead1"],          body: ["intro", "uncertainty", "closing"] },
  { name: "standard", weight: 40, lead: ["lead1", "lead2"], body: ["intro", "uncertainty", "quote", "context", "closing"] },
  { name: "expanded", weight: 30, lead: ["lead1", "lead2"], body: ["intro", "uncertainty", "quote", "context", "scene", "closing"] },
  { name: "feature",  weight: 10, lead: ["lead1", "lead2"], body: ["intro", "uncertainty", "quote", "context", "scene", "status", "extra", "closing"] }
];

// ----------------------
// Subjects / Actions
// ----------------------
const DB = {
  Human: {
    subjects: [
      S("人間", "human", "agent", "human", "none", true, "朝の騒ぎ", "周囲の警戒", "朝の時間帯", "人間側の意図", "観測対象の人間"),
      S("作業員", "worker", "agent", "worker", "none", true, "作業の動き", "通路の混乱", "外周部", "作業の流れ", "作業員"),
      S("白い服の人間", "white-clothed-human", "agent", "observer", "none", true, "白い影", "視認性", "柵付近", "白い服", "白い服の個体"),
      S("夜間の人間", "night-human", "agent", "night-human", "none", true, "夜間の動き", "静寂の破れ", "観測地点周辺", "夜の移動", "夜間の個体"),
      S("箱を持つ人間", "box-carrying-human", "agent", "box-holder", "none", true, "箱への接近", "保管区画", "第3鶏舎", "箱と卵", "箱を持つ個体"),
      S("観測対象の人間", "observed-human", "agent", "observer", "none", true, "観測記録", "長期記録", "記録担当", "継続観測", "観測対象")
    ],
    actions: [
      A("朝に騒ぐ", "朝に騒いだ", "make-noise-in-the-morning", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "observer", "box-holder", "night-human"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "騒ぎ"
      }),
      A("箱に話しかける", "箱に向かって話しかけた", "speak-to-a-box", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "observer", "box-holder"],
        valency: "transitive", requiresPhysicalMove: true, objects: ["箱", "記録板", "通路"],
        eventPhrase: "発話"
      }),
      A("光を持って歩く", "光を持って歩いていた", "walk-with-a-light", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "night-human"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "移動"
      }),
      A("同じ場所を何度も行き来する", "同じ場所を何度も行き来した", "pace-back-and-forth", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "observer"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "往復"
      }),
      A("突然走り出す", "突然走り出した", "suddenly-run-off", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "night-human"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "走行"
      }),
      A("卵を長時間見つめる", "卵を長時間見つめていた", "stare-at-eggs", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "observer"],
        valency: "transitive", requiresPhysicalMove: false, objects: ["卵", "保管列", "記録"],
        eventPhrase: "注視"
      }),
      A("理由なく立ち止まる", "理由なく立ち止まっていた", "stop-without-reason", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "observer", "night-human"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "停止"
      }),
      A("何度も振り返る", "何度も振り返った", "keep-looking-back", {
        allowedKinds: ["agent"], allowedSubtypes: ["human", "worker", "observer"],
        valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "振り返り"
      })
    ]
  },

  Egg: {
    subjects: [
      S("卵", "egg", "object", "egg", "none", false, "所在確認", "回収率", "点検", "卵の管理", "卵全体"),
      S("保管中の卵", "stored-eggs", "object", "egg", "none", false, "保管状態", "保管区画", "保管列", "保管の流れ", "保管中の個体"),
      S("第3鶏舎の卵", "coop-three-eggs", "object", "egg", "none", false, "第3鶏舎", "鶏舎管理", "第3鶏舎", "鶏舎内の記録", "第3鶏舎対象"),
      S("点検対象の卵", "inspected-eggs", "object", "egg", "none", false, "点検作業", "確認精度", "観測班", "点検工程", "点検対象"),
      S("回収待ちの卵", "awaiting-collection-eggs", "object", "egg", "none", false, "回収工程", "回収遅延", "給餌エリア", "待機列", "回収待ち"),
      S("整列された卵", "aligned-eggs", "object", "egg", "none", false, "整列状態", "秩序", "保管区画", "整列", "整列済み")
    ],
    actions: [
      A("再び消失する", "再び消失した", "disappear-again", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "state", eventPhrase: "消失"
      }),
      A("数が合わなくなる", "数が合わなくなった", "numbers-no-longer-match", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "state", eventPhrase: "数の不一致"
      }),
      A("保管列から外れる", "保管列から外れた", "leave-storage-line", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "passive", eventPhrase: "位置ずれ"
      }),
      A("温度変化を示す", "温度変化を示した", "show-temperature-change", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "state", eventPhrase: "温度変化"
      }),
      A("回収が遅れる", "回収が遅れた", "collection-is-delayed", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "state", eventPhrase: "回収遅延"
      }),
      A("別の場所で発見される", "別の場所で発見された", "found-elsewhere", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "passive", eventPhrase: "再発見"
      }),
      A("不自然に移動する", "不自然に移動した", "move-unnaturally", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "passive", eventPhrase: "移動"
      }),
      A("記録値とずれる", "記録値とずれた", "deviate-from-record", {
        allowedKinds: ["object"], allowedSubtypes: ["egg"], valency: "state", eventPhrase: "記録のずれ"
      })
    ]
  },

  World: {
    subjects: [
      S("空", "sky", "phenomenon", "sky", "none", false, "空の変化", "視認条件", "上空", "空模様", "空の観測"),
      S("上空", "overhead-sky", "phenomenon", "sky", "none", false, "上空の動き", "観測条件", "観測地点周辺", "上空の変化", "上空の動き"),
      S("天候", "weather", "phenomenon", "weather", "none", false, "天候の変化", "環境変動", "外周部", "気流", "天候記録"),
      S("気温", "temperature", "phenomenon", "temperature", "none", false, "気温の揺らぎ", "群れ全体の行動", "飼育区画の外縁", "温度変化", "温度観測"),
      S("風", "wind", "phenomenon", "wind", "none", false, "風向き", "飼育区画", "通路脇", "風", "風の観測"),
      S("光の筋", "beam-of-light", "phenomenon", "light", "none", false, "発光現象", "観測", "上空", "光", "発光の記録")
    ],
    actions: [
      A("謎の光が現れる", "謎の光が現れた", "mysterious-light-appears", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "light"], valency: "state", eventPhrase: "発光"
      }),
      A("色を変える", "色を変えた", "change-color", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "weather", "light"], valency: "state", eventPhrase: "色の変化"
      }),
      A("静かになる", "静かになった", "become-quiet", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "weather", "wind"], valency: "state", eventPhrase: "静まり"
      }),
      A("強い風を伴う", "強い風を伴った", "come-with-strong-wind", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["weather", "wind"], valency: "state", eventPhrase: "強風"
      }),
      A("急に暗くなる", "急に暗くなった", "suddenly-darken", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "weather", "light"], valency: "state", eventPhrase: "暗転"
      }),
      A("遠くで揺れる", "遠くで揺れた", "sway-in-the-distance", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "wind", "light"], valency: "state", eventPhrase: "揺らぎ"
      }),
      A("短時間だけ明るくなる", "短時間だけ明るくなった", "briefly-become-brighter", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "light"], valency: "state", eventPhrase: "明るさの変化"
      }),
      A("不規則に変化する", "不規則に変化した", "change-irregularly", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["weather", "sky", "wind", "temperature"], valency: "state", eventPhrase: "変化"
      }),
      A("上昇する", "上昇した", "rise", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["temperature"], valency: "state", eventPhrase: "上昇"
      }),
      A("低下する", "低下した", "fall", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["temperature"], valency: "state", eventPhrase: "低下"
      }),
      A("安定する", "安定した", "stabilize", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["temperature", "weather"], valency: "state", eventPhrase: "安定"
      }),
      A("向きを変える", "向きを変えた", "change-direction", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["wind"], valency: "state", eventPhrase: "風向きの変化"
      }),
      A("赤く染まる", "赤く染まった", "turn-red", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sky", "light"], valency: "state", eventPhrase: "赤み"
      })
    ]
  },

  Incident: {
    subjects: [
      S("群れの一部", "part-of-the-flock", "agent", "flock", "none", true, "一時離脱", "群れ全体", "通路", "離脱", "離脱個体"),
      S("給水装置", "water-system", "object", "system", "facility", false, "供給停止", "給水", "監視区域", "供給", "給水設備"),
      S("通路", "corridor", "place", "corridor", "route", false, "通路異常", "移動", "南側通路", "通過", "通路観測"),
      S("監視区域", "monitoring-zone", "place", "zone", "zone", false, "監視強化", "記録", "監視区域", "監視", "監視区域"),
      S("鶏舎", "coop", "place", "facility", "facility", false, "鶏舎の封鎖", "鶏舎運営", "鶏舎", "封鎖", "鶏舎"),
      S("鶏舎内", "inside-the-coop", "place", "interior", "interior", false, "鶏舎内の制限", "鶏舎運営", "鶏舎内", "立ち入り", "鶏舎内"),
      S("搬入口", "loading-bay", "place", "bay", "bay", false, "搬入停止", "搬入", "搬入口", "搬入", "搬入口"),
      S("水の供給", "water-supply", "phenomenon", "water", "none", false, "供給停止", "水分", "給餌エリア", "供給", "水の供給"),
      S("鳴き声の発生", "sound-emission", "phenomenon", "sound", "none", false, "鳴き声の発生", "静寂", "南側通路", "音", "鳴き声"),
      S("記録装置", "record-device", "object", "system", "facility", false, "記録異常", "記録", "記録担当", "記録", "記録装置")
    ],
    actions: [
      A("一時離脱する", "一時離脱した", "temporarily-break-away", {
        allowedKinds: ["agent"], allowedSubtypes: ["flock"], valency: "intransitive", requiresPhysicalMove: true, eventPhrase: "一時離脱"
      }),
      A("供給が停止する", "供給が停止した", "supply-stops", {
        allowedKinds: ["object", "phenomenon"], allowedSubtypes: ["system", "water"], valency: "state", eventPhrase: "供給停止"
      }),
      A("異常を示す", "異常を示した", "show-anomaly", {
        allowedKinds: ["object", "place", "phenomenon"], allowedSubtypes: ["system", "zone", "facility", "bay", "water", "sound", "corridor"],
        allowedPlaceRoles: ["facility", "route", "zone", "bay", "interior"],
        valency: "state", eventPhrase: "異常"
      }),
      A("封鎖される", "封鎖された", "be-sealed-off", {
        allowedKinds: ["place", "object"], allowedSubtypes: ["facility", "corridor", "zone", "bay", "system"],
        allowedPlaceRoles: ["facility", "route", "zone", "bay"],
        valency: "passive", eventPhrase: "封鎖"
      }),
      A("立ち入りが制限される", "立ち入りが制限された", "access-restricted", {
        allowedKinds: ["place"], allowedSubtypes: ["interior", "zone", "facility"], allowedPlaceRoles: ["interior"],
        valency: "passive", eventPhrase: "立ち入り制限"
      }),
      A("混雑が発生する", "混雑が発生した", "become-crowded", {
        allowedKinds: ["place"], allowedSubtypes: ["corridor", "zone", "bay"], allowedPlaceRoles: ["route", "zone", "bay"],
        valency: "state", eventPhrase: "混雑"
      }),
      A("未確認の動きを見せる", "未確認の動きを見せた", "show-unverified-movement", {
        allowedKinds: ["object"], allowedSubtypes: ["system"], allowedPlaceRoles: ["facility"],
        valency: "state", eventPhrase: "未確認の動き"
      }),
      A("短時間だけ沈黙する", "短時間だけ沈黙した", "become-silent-briefly", {
        allowedKinds: ["phenomenon", "place"], allowedSubtypes: ["sound", "zone", "interior", "corridor"],
        allowedPlaceRoles: ["zone", "interior", "route"], valency: "state", eventPhrase: "沈黙"
      }),
      A("不明な音を発する", "不明な音を発した", "emit-unknown-sound", {
        allowedKinds: ["phenomenon"], allowedSubtypes: ["sound"], valency: "state", eventPhrase: "不明音"
      }),
      A("一時的に混乱する", "一時的に混乱した", "become-disordered", {
        allowedKinds: ["agent", "place"], allowedSubtypes: ["flock", "zone", "facility", "interior"],
        allowedPlaceRoles: ["zone", "facility", "interior"], valency: "state", eventPhrase: "混乱"
      }),
      A("移動経路が乱れる", "移動経路が乱れた", "route-disrupted", {
        allowedKinds: ["place"], allowedSubtypes: ["corridor"], allowedPlaceRoles: ["route"], valency: "state", eventPhrase: "移動経路の乱れ"
      }),
      A("記録値が乱れる", "記録値が乱れた", "record-values-disrupted", {
        allowedKinds: ["object"], allowedSubtypes: ["system"], allowedPlaceRoles: ["facility"], valency: "state", eventPhrase: "記録値の乱れ"
      })
    ]
  },

  Opinion: {
    subjects: [
      S("卵の役割", "role-of-eggs", "abstract", "opinion", "none", false, "卵の役割", "議論", "記録", "役割", "役割の再考"),
      S("朝の騒音", "morning-noise", "abstract", "opinion", "none", false, "朝の騒音", "日課", "朝の時間帯", "音", "朝の音"),
      S("にわとりの記憶", "chicken-memory", "abstract", "opinion", "none", false, "にわとりの記憶", "記録", "観測地点周辺", "記憶", "記憶の問い直し"),
      S("観測の意義", "meaning-of-observation", "abstract", "opinion", "none", false, "観測の意義", "記録", "観測地点周辺", "意義", "観測の見直し"),
      S("群れの秩序", "flock-order", "abstract", "opinion", "none", false, "群れの秩序", "行動", "群れ", "秩序", "秩序の問い直し"),
      S("外界の意味", "meaning-of-the-outside-world", "abstract", "opinion", "none", false, "外界の意味", "認識", "上空", "意味", "外界の再考"),
      S("監視の必要性", "need-for-monitoring", "abstract", "opinion", "none", false, "監視の必要性", "観測", "記録", "必要性", "監視の見直し"),
      S("餌の供給", "feed-supply", "abstract", "opinion", "none", false, "餌の供給", "生活", "給餌エリア", "供給", "餌の分配"),
      S("鳴くという行為", "the-act-of-crowing", "abstract", "opinion", "none", false, "鳴くという行為", "表現", "朝", "鳴き声", "鳴くこと"),
      S("群れと個体", "flock-and-individual", "abstract", "opinion", "none", false, "群れと個体", "秩序", "群れ", "関係", "群れの構造"),
      S("観測すること", "the-act-of-observing", "abstract", "opinion", "none", false, "観測すること", "記録", "観測地点周辺", "観測", "観測の継続")
    ],
    actions: [
      A("見直し", "見直しが進んだ", "reconsideration", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "見直し"
      }),
      A("再考", "再考が進んだ", "rethink", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "再考"
      }),
      A("意味", "意味が問われた", "meaning", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "意味の議論"
      }),
      A("本質", "本質が探られた", "essence", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "本質の整理"
      }),
      A("必要性", "必要性が議論された", "necessity", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "必要性の議論"
      }),
      A("位置づけ", "位置づけが見直された", "positioning", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "位置づけの見直し"
      }),
      A("判断", "判断が分かれた", "judgment", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "判断"
      }),
      A("再検討", "再検討が進んだ", "reassessment", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "再検討"
      }),
      A("整理", "整理が進んだ", "organization", {
        allowedKinds: ["abstract"], allowedSubtypes: ["opinion"], valency: "relation", eventPhrase: "整理"
      })
    ]
  }
};

// ----------------------
// Slot builders
// ----------------------
function buildEventSlots(category, subject, action, ctx) {
  const introPool = CATEGORY_PHRASES[category].intro;
  const contextPool = CATEGORY_PHRASES[category].context;
  const extraPool = CATEGORY_PHRASES[category].extra;

  return {
    lead1: { family: "lead", text: lead1(subject, action, ctx, category) },
    lead2: { family: "impact", text: lead2(subject, action, ctx, category) },

    intro: { family: "analysis", text: rand(introPool)(subject, action, ctx) },
    uncertainty: { family: "uncertainty", text: `${ctx.uncertainty}現時点では原因を断定できる材料は揃っていない。` },
    quote: { family: "quote", text: `現場にいた${ctx.expert}は「${ctx.reaction}」と述べた。` },
    context: { family: "context", text: rand(contextPool)(subject, action, ctx) },
    scene: { family: "scene", text: ctx.scene },
    status: { family: "status", text: ctx.status },
    extra: { family: "extra", text: rand(extraPool)(subject, action, ctx) },
    closing: { family: "closing", text: ctx.closing }
  };
}

function buildOpinionSlots(subject, action, ctx) {
  return {
    lead1: { family: "lead", text: lead1(subject, action, ctx, "Opinion") },
    lead2: { family: "impact", text: lead2(subject, action, ctx, "Opinion") },

    intro: { family: "analysis", text: rand(OPINION_PHRASES.intro)(subject, action, ctx) },
    uncertainty: { family: "uncertainty", text: `${ctx.uncertainty}現時点では結論を急ぐ段階ではない。` },
    quote: { family: "quote", text: `現場にいた${ctx.expert}は「${ctx.reaction}」と述べた。` },
    context: { family: "context", text: rand(OPINION_PHRASES.context)(subject, action, ctx) },
    scene: { family: "scene", text: ctx.scene },
    status: { family: "status", text: ctx.status },
    extra: { family: "extra", text: rand(OPINION_PHRASES.extra)(subject, action, ctx) },
    closing: { family: "closing", text: ctx.closing }
  };
}

// ----------------------
// Assembly with semantic family dedupe (BERT-backed)
// ----------------------
function assemble(slotMap, keys, clusterer) {
  const out = [];
  for (const key of keys) {
    const slot = slotMap[key];
    if (!slot) continue;
    const family = slot.family || clusterer.familyOf(slot.text);
    if (!clusterer.keep(slot.text, family)) continue;
    out.push(clean(slot.text));
  }
  return uniqSentences(out);
}

// ----------------------
// NLGコーパス収集
// BERTSimulator の IDF 学習 + MarkovNaturalizer のトレーニングに使用
// ----------------------
function getNLGCorpus() {
  const sentences = [];

  // COMMON プールから収集
  for (const s of COMMON.uncertainty) sentences.push(s + "原因は特定されていない。");
  for (const s of COMMON.closings) sentences.push(s);
  for (const s of COMMON.scenes) sentences.push(s);
  for (const s of COMMON.statuses) sentences.push(s);
  for (const s of COMMON.fillers) sentences.push(s);
  for (const s of COMMON.reactions) sentences.push(s + "。");

  // ダミー被験者でフレーズ関数を呼び出し
  const dummySubject = {
    jp: "にわとり", note: "観測", theme: "行動", watch: "動き",
    angle: "見解", kind: "agent", placeRole: "none"
  };

  for (const cat of Object.values(CATEGORY_PHRASES)) {
    for (const pool of [cat.intro, cat.context, cat.extra]) {
      for (const fn of pool) {
        try { sentences.push(fn(dummySubject)); } catch (_) {}
      }
    }
  }

  for (const pool of [OPINION_PHRASES.intro, OPINION_PHRASES.context, OPINION_PHRASES.extra]) {
    for (const fn of pool) {
      try { sentences.push(fn(dummySubject)); } catch (_) {}
    }
  }

  return sentences.filter(Boolean);
}

// ----------------------
// Validation
// ----------------------
function validateArticle(article) {
  const text = [article.title, ...article.lead, ...article.body].join(" ");
  if (!text.includes("。")) return false;
  if (article.lead.length < 1 || article.lead.length > 2) return false;
  if (article.body.length < 3 || article.body.length > 8) return false;
  if (/がを|をを|のの|への影響への影響/.test(text)) return false;

  const normalized = [article.title, ...article.lead, ...article.body].map(clean);
  if (new Set(normalized).size !== normalized.length) return false;

  return true;
}

// ----------------------
// スコアリング（従来ペナルティ + BERT意味多様性ペナルティ）
// ----------------------

// BERT コサイン類似度ヘルパー
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 全文ペアの平均コサイン類似度を計算し多様性ペナルティを返す
// avgSim > 0.72 のとき超過分 × 90 のペナルティを与える
function bertDiversityPenalty(sentences, embedFn) {
  if (typeof embedFn !== "function" || sentences.length < 2) return 0;
  const vecs = sentences.map(s => embedFn(s));
  let totalSim = 0, count = 0;
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      totalSim += cosineSim(vecs[i], vecs[j]);
      count++;
    }
  }
  if (count === 0) return 0;
  const avgSim = totalSim / count;
  return avgSim > 0.72 ? Math.round((avgSim - 0.72) * 90) : 0;
}

function scoreArticle(article) {
  const text = [article.title, ...article.lead, ...article.body].join(" ");
  let score = 100;

  // 従来の語彙重複ペナルティ
  const penalties = [
    ["周囲", 6],
    ["一部では", 8],
    ["現場", 4],
    ["観測", 4],
    ["確認", 3],
    ["警戒", 3],
    ["不明", 3],
    ["可能性", 3],
    ["影響", 4],
    ["議論", 3],
    ["通常とは異なる", 4],
    ["引き続き", 2]
  ];

  for (const [word, penalty] of penalties) {
    const count = (text.match(new RegExp(word, "g")) || []).length;
    if (count > 2) score -= penalty * (count - 2);
  }

  if (text.length < 150) score -= 12;
  if (text.length > 1000) score -= 10;
  if (/がを|をを|のの|への影響への影響/.test(text)) score -= 40;

  const starts = article.body.map(s => s.slice(0, 4));
  if (new Set(starts).size < starts.length - 1) score -= 10;

  if (
    (text.includes("観測は継続中") && text.includes("引き続き観測")) ||
    (text.includes("警戒が維持") && text.includes("警戒が続いて"))
  ) score -= 12;

  // BERT意味多様性ペナルティ（全文ペアの平均コサイン類似度が高いと減点）
  if (article._bertEmbedFn) {
    const allSentences = [...article.lead, ...article.body];
    score -= bertDiversityPenalty(allSentences, article._bertEmbedFn);
  }

  return score;
}

// ----------------------
// Main generation
// ----------------------
function buildArticle(category, options = {}) {
  const cat = DB[category] || DB.Human;
  const subject = rand(cat.subjects);
  const action = chooseAction(subject, cat.actions);
  const ctx = makeContext(subject, action);
  const mode = weightedPick(MODE_DEFS);

  // ── [1] BERTSimulator 初期化・IDF学習 ──────────────────
  const bert = new BERTSimulator(128);
  const corpus = getNLGCorpus();
  bert.trainIDF(corpus);
  const embedFn = (t) => bert.embed(t);

  // ── [2] SemanticClusterer にBERTを注入 ──────────────────
  // 閾値0.82: BERT次元で同義文をブロックする（regex familyOf は補助として残る）
  const clusterer = new SemanticClusterer({
    embed: options.embed ?? embedFn,
    threshold: options.threshold ?? 0.82
  });

  // ── [3] テンプレ生成 → スロット → アセンブル ────────────
  const slots = category === "Opinion"
    ? buildOpinionSlots(subject, action, ctx)
    : buildEventSlots(category, subject, action, ctx);

  const title = clean(headline(subject, action));
  const lead = assemble(slots, mode.lead, clusterer);
  let body = assemble(slots, mode.body, clusterer);

  if (slots.extra && chance(0.30) && body.length < 8) {
    const extraText = clean(slots.extra.text);
    if (!body.includes(extraText)) {
      const insertAt = Math.max(1, body.length - 1);
      body.splice(insertAt, 0, extraText);
    }
  }

  if (body.length < 3) {
    body.push("追加の確認が続けられている。");
  }

  // ── [4] MarkovNaturalizer で自然化（弱め、bodyのみ） ────
  // ・strength=0.15: 15%の確率でのみ発動する補助的な変換
  // ・文法的に安全な文末パターン置換のみ実施
  const markov = new MarkovNaturalizer();
  markov.train(corpus);
  body = body.map(s => markov.naturalize(s, 0.15));
  body = uniqSentences(body);

  return {
    title,
    lead,
    body,
    category: category,
    image: "",
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
    slug: `${subject.slug}-${action.slug}`,
    recommended: Math.random() < 0.35,
    _bertEmbedFn: embedFn   // scoreArticle のBERTペナルティ計算に渡す
  };
}

function generateArticle(category, options = {}) {
  const maxTries = options.maxTries ?? 30;
  const minScore = options.minScore ?? 84;

  for (let i = 0; i < maxTries; i++) {
    const article = buildArticle(category, options);
    if (validateArticle(article) && scoreArticle(article) >= minScore) {
      const { _bertEmbedFn, ...out } = article;  // 内部プロパティは出力から除外
      return out;
    }
  }

  // フォールバック
  const cat = DB[category] || DB.Human;
  const subject = rand(cat.subjects);
  const action = chooseAction(subject, cat.actions);

  return {
    title: clean(headline(subject, action)),
    lead: [
      clean(`${rand(COMMON.times)}、${rand(COMMON.places)}で${subject.jp}に関する動きが確認された。`)
    ],
    body: [
      "詳細は不明だが、現場では引き続き観測が続けられている。",
      "原因の特定には時間がかかるとみられる。"
    ],
    category: category,
    image: "",
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
    slug: `${subject.slug}-${action.slug}`,
    recommended: false
  };
}

function generateArticleAuto(options = {}) {
  return generateArticle(rand(Object.keys(DB)), options);
}

function generateArticles(count = 5, categories = Object.keys(DB), balanced = true, options = {}) {
  const out = [];
  if (balanced) {
    const order = shuffle([...categories]);
    for (let i = 0; i < count; i++) {
      out.push(generateArticle(order[i % order.length], options));
    }
    return out;
  }

  for (let i = 0; i < count; i++) {
    out.push(generateArticle(rand(categories), options));
  }
  return out;
}

// ----------------------
// CLI: Persistence Logic
// ----------------------
function saveArticleToJSON() {
  const newsPath = path.join(__dirname, 'data', 'news.json');
  let news = [];
  try {
    news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  } catch (e) {
    console.error("Error reading news.json:", e);
    return;
  }

  // 1. カテゴリの決定 (引数があればそれを使用、なければランダム)
  const argCat = process.argv[2];
  const categoryKeys = Object.keys(DB);
  let category = argCat;
  if (!category || !categoryKeys.includes(category)) {
    category = rand(categoryKeys);
  }

  // 2. 次のIDを決定
  const nextId = news.length > 0 ? Math.max(...news.map(a => a.id)) + 1 : 1;

  // 3. 次の画像の決定 (assets/articles/[category] からランダム)
  const imgDir = path.join(__dirname, 'assets', 'articles', category.toLowerCase());
  let image = "";
  try {
    const files = fs.readdirSync(imgDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    if (files.length > 0) {
      image = rand(files);
    }
  } catch (e) {
    console.warn(`Warning: Could not read image directory ${imgDir}`);
  }

  // 4. 記事生成
  const article = generateArticle(category);
  article.id = nextId;
  article.image = image;

  // 5. 保存
  news.push(article);
  try {
    fs.writeFileSync(newsPath, JSON.stringify(news, null, 2) + '\n', 'utf8');
    console.log(`\x1b[32m✔ Success!\x1b[0m Article generated and saved to news.json`);
    console.log(`----------------------------------------`);
    console.log(`ID:      ${article.id}`);
    console.log(`Title:   ${article.title}`);
    console.log(`Cat:     ${article.category}`);
    console.log(`Image:   ${article.image}`);
    console.log(`Date:    ${article.date}`);
    console.log(`Slug:    ${article.slug}`);
    console.log(`----------------------------------------`);
    console.log(`Next step: Run 'node build.js' to generate static files.`);
  } catch (e) {
    console.error("Error writing news.json:", e);
  }
}

// 実行
if (require.main === module) {
  saveArticleToJSON();
}
