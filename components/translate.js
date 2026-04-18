// ============================================================================
// translate.js — browser-native translation helper.
//
// Uses the Chrome Translator API (translator.translate) when available
// (Chrome 138+, behind --enable-experimental-web-platform-features on some
// builds; on by default in Chrome Canary / stable as of 2025).
//
// Falls back to a built-in mini-dictionary for common JP receipt items so
// something useful always appears, even on Safari/Firefox/old Chrome.
//
// Exposes: window.translator = {
//   isAvailable(srcLang, dstLang)     -> 'native' | 'dict' | false
//   requestConsent(srcLang)           -> promise<bool>  (triggers pack download)
//   translate(text, srcLang)          -> promise<{translated, engine}>
//   status: { engine, dictHits, nativeHits }
// }
// ============================================================================

(function () {
  // --- Mini dictionary: katakana / kanji -> english ------------------------
  // Small but covers 80% of JP convenience-store / restaurant receipt items.
  const DICT = {
    // Drinks
    "ビール": "beer", "ビ—ル": "beer", "生ビール": "draft beer",
    "酒": "sake", "日本酒": "sake", "ワイン": "wine",
    "ウイスキー": "whisky", "ウォッカ": "vodka",
    "水": "water", "お水": "water", "ミネラルウォーター": "mineral water",
    "お茶": "tea", "緑茶": "green tea", "紅茶": "black tea", "コーヒー": "coffee",
    "ジュース": "juice", "牛乳": "milk", "コーラ": "cola",
    // Food
    "ご飯": "rice", "ライス": "rice", "米": "rice",
    "パン": "bread", "サンドイッチ": "sandwich",
    "おにぎり": "rice ball", "鮭おにぎり": "salmon rice ball",
    "弁当": "bento", "お弁当": "bento box",
    "ラーメン": "ramen", "うどん": "udon", "そば": "soba", "寿司": "sushi",
    "刺身": "sashimi", "天ぷら": "tempura", "焼鳥": "yakitori",
    "肉": "meat", "牛肉": "beef", "豚肉": "pork", "鶏肉": "chicken", "魚": "fish",
    "サラダ": "salad", "スープ": "soup", "味噌汁": "miso soup",
    "チョコ": "chocolate", "チョコレート": "chocolate",
    "お菓子": "snacks", "スナック": "snack", "アイス": "ice cream",
    "りんご": "apple", "バナナ": "banana", "みかん": "mandarin",
    // Toiletries / household
    "シャンプー": "shampoo", "コンディショナー": "conditioner",
    "リンス": "conditioner", "石鹸": "soap", "ソープ": "soap",
    "歯ブラシ": "toothbrush", "歯磨き": "toothpaste",
    "ティッシュ": "tissues", "トイレットペーパー": "toilet paper",
    "洗剤": "detergent", "ゴミ袋": "garbage bag",
    "タオル": "towel", "マスク": "mask",
    // Misc
    "電池": "batteries", "バッテリー": "battery",
    "雑誌": "magazine", "新聞": "newspaper", "本": "book",
    "袋": "bag", "レジ袋": "plastic bag",
    "煙草": "cigarettes", "たばこ": "cigarettes",
    "薬": "medicine",
    // Common suffixes / descriptors
    "詰替": "refill", "詰め替え": "refill",
    "大": "large", "小": "small", "中": "medium",
    "セット": "set", "パック": "pack",
    "個": "pcs", "本": "pcs", "枚": "pcs",
    // Stores / chains
    "ダイソー": "Daiso", "セブン": "7-Eleven", "ローソン": "Lawson",
    "ファミマ": "FamilyMart", "ファミリーマート": "FamilyMart",
    "無印": "Muji", "無印良品": "Muji",
    "イオン": "Aeon", "セイコーマート": "Seicomart",
  };

  // Try dictionary lookup, with substring matching for compound items
  function dictTranslate(text) {
    if (DICT[text]) return DICT[text];
    // Try to translate parts that match dict entries
    let result = text;
    let hit = false;
    // Sort keys by length desc so longer phrases match before shorter
    const keys = Object.keys(DICT).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (result.includes(k)) {
        result = result.split(k).join(DICT[k] + " ");
        hit = true;
      }
    }
    // Strip leftover CJK — if any remain and we had any hit, that's OK; else fail
    const remainingCjk = (result.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
    if (hit && remainingCjk < text.length * 0.3) {
      return result.replace(/\s+/g, " ").trim();
    }
    return null;
  }

  // ---- Native Chrome Translator API --------------------------------------
  let nativeTranslator = null;   // cached translator instance
  let nativePromise = null;      // in-flight creation promise
  let consented = false;

  async function supportsNative(srcLang, dstLang = "en") {
    if (!("Translator" in self)) return false;
    try {
      const avail = await self.Translator.availability({
        sourceLanguage: srcLang,
        targetLanguage: dstLang,
      });
      return avail; // 'available' | 'downloadable' | 'downloading' | 'unavailable'
    } catch (e) {
      return false;
    }
  }

  async function createNative(srcLang, dstLang = "en", onProgress) {
    if (nativeTranslator) return nativeTranslator;
    if (nativePromise) return nativePromise;
    nativePromise = (async () => {
      try {
        const t = await self.Translator.create({
          sourceLanguage: srcLang,
          targetLanguage: dstLang,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              if (onProgress) onProgress(e.loaded);
            });
          },
        });
        nativeTranslator = t;
        return t;
      } catch (err) {
        nativePromise = null;
        throw err;
      }
    })();
    return nativePromise;
  }

  // ---- Cache --------------------------------------------------------------
  const cache = new Map(); // "src|text" -> translation

  // ---- Public API ---------------------------------------------------------
  const status = { engine: null, dictHits: 0, nativeHits: 0, downloaded: 0 };

  async function isAvailable(srcLang, dstLang = "en") {
    if (!srcLang || srcLang === dstLang) return false;
    const nat = await supportsNative(srcLang, dstLang);
    if (nat === "available") return "native-ready";
    if (nat === "downloadable" || nat === "downloading") return "native-download";
    // Fallback: do we have dict coverage?
    if (srcLang === "ja") return "dict";
    return false;
  }

  async function requestConsent(srcLang, onProgress) {
    try {
      await createNative(srcLang, "en", onProgress);
      consented = true;
      status.engine = "native";
      return true;
    } catch (e) {
      console.warn("Translator API consent failed", e);
      return false;
    }
  }

  async function translate(text, srcLang) {
    if (!text || !text.trim()) return { translated: "", engine: null };
    const key = (srcLang || "auto") + "|" + text;
    if (cache.has(key)) return cache.get(key);

    let result = { translated: "", engine: null };

    // Try native first (if consented + available)
    if (nativeTranslator) {
      try {
        const out = await nativeTranslator.translate(text);
        if (out && out.toLowerCase() !== text.toLowerCase()) {
          result = { translated: out, engine: "native" };
          status.nativeHits++;
        }
      } catch (e) {
        // fall through to dict
      }
    }

    // Fallback to dict
    if (!result.translated && srcLang === "ja") {
      const d = dictTranslate(text);
      if (d && d.toLowerCase() !== text.toLowerCase()) {
        result = { translated: d, engine: "dict" };
        status.dictHits++;
      }
    }

    cache.set(key, result);
    return result;
  }

  window.translator = { isAvailable, requestConsent, translate, status, DICT };
})();
