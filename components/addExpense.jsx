// Add Expense modal — with receipt scan, FX lock, split picker

function AddExpense({ members, trip, onClose, onSave }) {
  const [step, setStep] = useState(0); // 0=entry, 1=scanning
  const [mode, setMode] = useState("manual"); // "manual" | "receipt"
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [payer, setPayer] = useState(members[0].id);
  const [homeAmount, setHomeAmount] = useState("");  // what the bank charged the payer, in their home currency
  const [lockFrom, setLockFrom] = useState(members[0].home);
  const [lockNote, setLockNote] = useState("");
  // Default split: everyone flagged splitsByDefault. Per-expense overrides win over role.
  const defaultSplit = new Set(members.filter(m => m.splitsByDefault).map(m => m.id));
  const [participants, setParticipants] = useState(defaultSplit);
  const [scanStatus, setScanStatus] = useState(""); // informational during scan
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhotoUrl, setScanPhotoUrl] = useState(null);
  const [scanRawText, setScanRawText] = useState("");
  const [scanCandidates, setScanCandidates] = useState(null); // {totals:[], merchant, date}
  // Line items for itemised splitting. Each: {id, desc, price, assignees: Set<memberId>}
  const [items, setItems] = useState([]);
  // Translation: map of original text -> {translated, engine}. Null engine means not yet translated.
  const [translations, setTranslations] = useState({});
  // Translation consent state: 'unknown' | 'declined' | 'downloading' | 'ready' | 'unavailable' | 'dict-only'
  const [translatorState, setTranslatorState] = useState("unknown");
  const [translatorProgress, setTranslatorProgress] = useState(0);
  const [showRawLines, setShowRawLines] = useState(false);
  const fileInputRef = useRef(null);

  const payerMember = members.find(m => m.id === payer);
  // Update lockFrom default when payer changes
  useEffect(() => {
    setLockFrom(payerMember.home);
  }, [payer]);

  // Derive the locked rate from the two amounts: rate = JPY / home
  const marketRate = lockFrom === "AUD" ? 98.4 : lockFrom === "SGD" ? 114.2 : 1;
  const lockedRate = (Number(amount) && Number(homeAmount)) ? Number(amount) / Number(homeAmount) : null;
  const delta = lockedRate ? ((lockedRate - marketRate) / marketRate) * 100 : 0;

  // Translate a batch of strings using window.translator (native → dict fallback).
  // Runs asynchronously; updates `translations` state as each resolves.
  const translateAll = useCallback(async (strings, srcLang) => {
    if (!srcLang || srcLang === "en" || !window.translator) return;
    for (const text of strings) {
      if (!text || translations[text]) continue;
      const { translated, engine } = await window.translator.translate(text, srcLang);
      if (translated) {
        setTranslations(prev => ({ ...prev, [text]: { translated, engine } }));
      }
    }
  }, [translations]);

  // When items change AND we have a detected source language, translate them.
  useEffect(() => {
    const src = scanCandidates?.sourceLang;
    if (!src || src === "en") return;
    const itemStrings = items.map(it => it.desc).filter(Boolean);
    const rawStrings = (scanCandidates?.rawLines || []).map(l => l.text).filter(Boolean);
    const strings = [...new Set([...itemStrings, ...rawStrings])];
    if (strings.length === 0) return;
    // Only translate if user has opted in to native, OR dict is available (JP)
    if (translatorState === "ready" || src === "ja") {
      translateAll(strings, src);
    }
  }, [items, scanCandidates, translatorState, translateAll]);

  // Probe translator availability when OCR finishes with non-English text
  useEffect(() => {
    const src = scanCandidates?.sourceLang;
    if (!src || src === "en" || !window.translator) return;
    if (translatorState !== "unknown") return;
    (async () => {
      const avail = await window.translator.isAvailable(src, "en");
      if (avail === "native-ready") {
        await window.translator.requestConsent(src);
        setTranslatorState("ready");
      } else if (avail === "native-download") {
        setTranslatorState("downloadable");
      } else if (avail === "dict") {
        setTranslatorState("dict-only");
      } else {
        setTranslatorState("unavailable");
      }
    })();
  }, [scanCandidates, translatorState]);

  function enableTranslator() {
    const src = scanCandidates?.sourceLang || "ja";
    setTranslatorState("downloading");
    setTranslatorProgress(0);
    window.translator.requestConsent(src, (bytes) => {
      // Language packs are ~30MB; show a rough 0–100 based on observed bytes (cap at 30MB)
      setTranslatorProgress(Math.min(100, Math.round((bytes / (30 * 1024 * 1024)) * 100)));
    }).then(ok => {
      setTranslatorState(ok ? "ready" : "unavailable");
    });
  }

  function toggleParticipant(id) {    const next = new Set(participants);
    if (next.has(id)) next.delete(id); else next.add(id);
    setParticipants(next);
  }

  function handleReceiptDrop() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  // Parse OCR text for receipt-ish fields. All regex, no AI.
  function parseReceiptText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // ============================================================
    // OCR NUMBER FIX-UP — common misreads in price columns
    // ============================================================
    const fixNumber = (s) => s
      .replace(/[Oo]/g, '0')      // letter O → zero
      .replace(/[lI|]/g, '1')     // l / I / | → one
      .replace(/[Bß]/g, '8')      // B / ß → eight
      .replace(/[Zz](?=\d|$)/g, '2'); // trailing Z → two

    // Match money-ish tokens (more permissive than before, allow OCR-fuzzed digits)
    const moneyRx = /([¥￥$€£₹]?\s*)([\dOolI|B]{1,3}(?:[,.\s][\dOolI|B]{3})+|[\dOolI|B]{2,})(?:[.,](\d{1,2}))?/g;
    const totalKeywordRx = /(^|\b)(total|grand\s*total|amount\s*due|balance|合計|小計|総計|お会計|会計|計)(\b|$)/i;
    const skipLineRx = /(tax|vat|gst|tip|service\s*charge|change\s*due|cash|visa|master|amex|jcb|discover|signature|消費税|サービス料|お釣り|釣銭|お預り|お預かり|電話|tel|phone|〒|領収|ありがとう|お買上|点数|いらっしゃ|レジ|registr)/i;
    const dropIfOnly = /^[\W_\d]+$/; // punctuation / numbers only

    // ============================================================
    // PASS 1 — TOTAL CANDIDATES (priority: total-keyword > near-bottom > elsewhere)
    // ============================================================
    const totals = [];
    lines.forEach((line, idx) => {
      const isTotalLine = totalKeywordRx.test(line);
      const isSkippable = skipLineRx.test(line);
      const rx = new RegExp(moneyRx.source, 'g');
      let m;
      while ((m = rx.exec(line))) {
        const raw = fixNumber(m[2]).replace(/[,.\s]/g, '');
        let n = parseInt(raw, 10);
        if (m[3]) n = parseFloat(n + '.' + m[3]);
        if (!Number.isFinite(n) || n < 100 || n >= 10_000_000) continue;
        const priority = isTotalLine ? 3 : (isSkippable ? -1 : (idx > lines.length - 6 ? 1 : 0));
        totals.push({ value: n, line, priority });
      }
    });
    // Dedup by value, keep highest priority per value
    const dedupMap = new Map();
    for (const t of totals) {
      const prev = dedupMap.get(t.value);
      if (!prev || t.priority > prev.priority) dedupMap.set(t.value, t);
    }
    const dedupTotals = [...dedupMap.values()].sort((a, b) => (b.priority - a.priority) || (b.value - a.value));

    // ============================================================
    // PASS 2 — LINE ITEMS — aggressive parser
    // Strategy: walk lines, find "<description><separator><price>" OR carry
    // a description forward if the next line is a standalone price.
    // ============================================================
    const items = [];
    const rawLinesAnnotated = []; // every original line + whether auto-captured

    const standalonePriceRx = /^[¥￥$€£]?\s*([\dOolI|B]{1,3}(?:[,.\s][\dOolI|B]{3})+|[\dOolI|B]{2,})(?:[.,](\d{1,2}))?\s*[円]?\s*\*?$/;
    const trailingPriceRx = /^(.{2,50}?)[\s.·:—–\-]+[¥￥$€£]?\s*([\dOolI|B]{1,3}(?:[,.\s][\dOolI|B]{3})+|[\dOolI|B]{2,})(?:[.,](\d{1,2}))?\s*[円]?\s*\*?$/;

    let pendingDesc = null; // description waiting for a price on a subsequent line

    lines.forEach((line, idx) => {
      const annotated = { idx, text: line, captured: false };

      // Skip junk
      if (dropIfOnly.test(line) || skipLineRx.test(line) || totalKeywordRx.test(line)) {
        rawLinesAnnotated.push(annotated);
        pendingDesc = null;
        return;
      }

      // Case A: standalone price that might close a pendingDesc
      const standalone = line.match(standalonePriceRx);
      if (standalone && pendingDesc) {
        const raw = fixNumber(standalone[1]).replace(/[,.\s]/g, '');
        let price = parseInt(raw, 10);
        if (standalone[2]) price = parseFloat(price + '.' + standalone[2]);
        if (Number.isFinite(price) && price >= 10 && price < 2_000_000) {
          items.push({ desc: pendingDesc, price });
          annotated.captured = true;
          pendingDesc = null;
          rawLinesAnnotated.push(annotated);
          return;
        }
      }

      // Case B: full "description + price" on one line
      const trailing = line.match(trailingPriceRx);
      if (trailing) {
        const desc = trailing[1].replace(/[*#=\-•·]+\s*$/, '').trim();
        const raw = fixNumber(trailing[2]).replace(/[,.\s]/g, '');
        let price = parseInt(raw, 10);
        if (trailing[3]) price = parseFloat(price + '.' + trailing[3]);
        const validDesc = desc && desc.length >= 2 && desc.length <= 50 && !/^\d+$/.test(desc) && !totalKeywordRx.test(desc) && !skipLineRx.test(desc);
        if (validDesc && Number.isFinite(price) && price >= 10 && price < 2_000_000) {
          items.push({ desc, price });
          annotated.captured = true;
          pendingDesc = null;
          rawLinesAnnotated.push(annotated);
          return;
        }
      }

      // Case C: description-only line (no price) — queue for next line
      if (!/\d/.test(line) && line.length >= 2 && line.length <= 50) {
        pendingDesc = line;
      } else {
        pendingDesc = null;
      }
      rawLinesAnnotated.push(annotated);
    });

    // Dedup items (same desc+price appearing twice)
    const seen = new Set();
    const dedupedItems = [];
    for (const it of items) {
      const key = it.desc.toLowerCase() + "|" + it.price;
      if (seen.has(key)) {
        // Merge: bump the existing one's quantity in its description
        const existing = dedupedItems.find(d => d.desc.toLowerCase() === it.desc.toLowerCase() && d.price === it.price);
        if (existing) existing.qty = (existing.qty || 1) + 1;
      } else {
        seen.add(key);
        dedupedItems.push({ ...it });
      }
    }

    // Flag suspicious items (price > 50% of total) — likely a subtotal caught as an item
    const likelyTotal = dedupTotals[0]?.value;
    if (likelyTotal) {
      dedupedItems.forEach(it => {
        if (it.price > likelyTotal * 0.7) it.suspicious = true;
      });
    }

    // ============================================================
    // MERCHANT / DATE / CATEGORY (unchanged logic, cleaner filter)
    // ============================================================
    const merchant = (lines.slice(0, 5).find(l =>
      l.length > 3 && l.length < 42 && !/^\d|^\W+$|receipt|tel|phone|〒/i.test(l)
    ) || lines[0] || "").replace(/[*#=\-]+/g, '').trim();

    const monthShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let date = "";
    const dateRx1 = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/;
    const dateRx2 = /(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/;
    for (const line of lines) {
      let m = line.match(dateRx1);
      if (m) { date = `${monthShort[+m[2]-1]} ${+m[3]}`; break; }
      m = line.match(dateRx2);
      if (m) { date = `${monthShort[+m[2]-1]} ${+m[1]}`; break; }
    }

    const merchantLower = merchant.toLowerCase();
    let category = "Food";
    if (/hotel|inn|airbnb|lodge|ryokan|旅館|ホテル/i.test(merchant)) category = "Lodging";
    else if (/taxi|cab|uber|rail|jr|bus|metro|タクシー|バス/i.test(merchant)) category = "Transport";
    else if (/ski|rental|lift|lesson|onsen|spa|温泉|スキー/i.test(merchant)) category = "Activity";
    else if (/mart|store|shop|market|daiso|muji|lawson|family|seven|セブン|ローソン|ファミマ|ダイソー|無印/i.test(merchant)) category = "Shopping";

    // Detect dominant source language from text (for translation)
    let sourceLang = "en";
    const jpChars = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
    const cjkTotal = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    if (jpChars > 10) sourceLang = "ja";
    else if (cjkTotal > 10) sourceLang = "zh";

    return {
      totals: dedupTotals,
      merchant,
      date,
      category,
      items: dedupedItems,
      rawLines: rawLinesAnnotated,
      sourceLang,
    };
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = () => res(window.Tesseract);
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep(1);
    setScanProgress(0);
    setScanCandidates(null);
    setScanRawText("");
    setScanStatus("Loading OCR engine (~2MB, first run only)…");

    // Show the photo preview
    const photoUrl = URL.createObjectURL(file);
    setScanPhotoUrl(photoUrl);

    try {
      const Tesseract = await loadTesseract();
      setScanStatus("Recognising text…");
      const result = await Tesseract.recognize(file, "eng+jpn", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setScanProgress(Math.round(m.progress * 100));
          } else if (m.status) {
            setScanStatus(m.status.charAt(0).toUpperCase() + m.status.slice(1) + "…");
          }
        },
      });
      const text = result?.data?.text || "";
      setScanRawText(text);
      const parsed = parseReceiptText(text);
      setScanCandidates(parsed);
      setScanStatus("✓ Read — confirm below");

      // Auto-fill with best guesses
      if (parsed.totals[0]) setAmount(String(parsed.totals[0].value));
      if (parsed.merchant) setTitle(parsed.merchant);
      setCategory(parsed.category);

      // Hydrate line items — default everyone in `defaultSplit` is ticked
      if (parsed.items && parsed.items.length >= 3) {
        const initialItems = parsed.items.map((it, i) => ({
          id: "it" + i,
          desc: it.desc,
          price: it.price,
          assignees: new Set(defaultSplit),
        }));
        setItems(initialItems);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn("OCR failed", err);
      setScanStatus("Couldn't read automatically — type the total below");
    }
  }

  function toggleItemAssignee(itemId, memberId) {
    setItems(items.map(it => {
      if (it.id !== itemId) return it;
      const next = new Set(it.assignees);
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
      return { ...it, assignees: next };
    }));
  }

  function updateItem(itemId, field, value) {
    setItems(items.map(it => it.id === itemId ? { ...it, [field]: value } : it));
  }

  function addItem() {
    setItems([...items, { id: "it" + Date.now(), desc: "", price: 0, assignees: new Set(defaultSplit) }]);
  }

  function removeItem(itemId) {
    setItems(items.filter(it => it.id !== itemId));
  }

  // Itemised sum (for reconciliation warning)
  const itemsSum = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const reconcileDelta = Number(amount) - itemsSum; // positive = tax/service not accounted for
  const hasItems = items.length > 0;

  function handleSave() {
    // If user didn't provide a home amount, fall back to today's market rate
    const rate = lockedRate || marketRate;
    const totalPayerEq = Number(homeAmount) || (Number(amount) / rate);
    const lockedRateObj = { from: lockFrom, rate: Number(rate.toFixed(2)), note: lockNote || (lockedRate ? `${payerMember.name}'s card` : "market rate") };

    // No itemisation → single expense, simple path
    if (!hasItems) {
      onSave({
        id: "new-" + Date.now(),
        date: "Feb 20",
        title: title || "Untitled expense",
        category,
        amount: Number(amount) || 0,
        currency: "JPY",
        payer,
        lockedRate: lockedRateObj,
        payerEquivalent: { currency: lockFrom, amount: totalPayerEq },
        split: { type: "equal", among: Array.from(participants) },
        receipt: mode === "receipt",
      });
      onClose();
      return;
    }

    // Itemised path — group items by who they're assigned to, proportionally redistribute non-item overhead
    // (tax/service/rounding) from Number(amount) - itemsSum across each item.
    const overhead = Number(amount) - itemsSum;
    const overheadFactor = itemsSum > 0 ? (1 + overhead / itemsSum) : 1;

    const groups = new Map(); // key = sorted assignee ids joined → {items: [], total}
    items.forEach(it => {
      const price = Number(it.price) || 0;
      if (price <= 0 || it.assignees.size === 0) return;
      const key = Array.from(it.assignees).sort().join(",");
      if (!groups.has(key)) groups.set(key, { assignees: Array.from(it.assignees), items: [], total: 0 });
      const g = groups.get(key);
      g.items.push(it);
      g.total += price * overheadFactor;
    });

    // Emit one parent expense per group. The rate lock stays consistent across all of them.
    const now = Date.now();
    let i = 0;
    for (const g of groups.values()) {
      const itemLabels = g.items.map(it => it.desc).slice(0, 3).join(", ") + (g.items.length > 3 ? ` +${g.items.length - 3}` : "");
      const subTotal = Math.round(g.total);
      const parentTitle = title || "Receipt";
      const groupTitle = g.assignees.length === participants.size
        ? `${parentTitle} — shared (${g.items.length} item${g.items.length === 1 ? "" : "s"})`
        : `${parentTitle} — ${itemLabels}`;
      onSave({
        id: "new-" + now + "-" + i,
        date: "Feb 20",
        title: groupTitle,
        category,
        amount: subTotal,
        currency: "JPY",
        payer,
        lockedRate: lockedRateObj,
        payerEquivalent: { currency: lockFrom, amount: subTotal / rate },
        split: { type: "equal", among: g.assignees },
        receipt: mode === "receipt",
      });
      i++;
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
              New entry · {trip.name}
            </div>
            <h2>Add an expense</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 22, border: "1px solid var(--rule-soft)" }}>
            <button
              className="tweak-opt"
              style={{ flex: 1, padding: 12, fontSize: 11, background: mode === "receipt" ? "var(--ink)" : "transparent", color: mode === "receipt" ? "var(--paper)" : "var(--ink)", border: "none", borderRight: "1px solid var(--rule-soft)" }}
              onClick={() => setMode("receipt")}
            >
              ◉ Scan receipt
            </button>
            <button
              className="tweak-opt"
              style={{ flex: 1, padding: 12, fontSize: 11, background: mode === "manual" ? "var(--ink)" : "transparent", color: mode === "manual" ? "var(--paper)" : "var(--ink)", border: "none" }}
              onClick={() => setMode("manual")}
            >
              ⌨ Enter manually
            </button>
          </div>

          {mode === "receipt" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                style={{ display: "none" }}
              />
              {!scanPhotoUrl && (
                <div className="receipt-drop" onClick={handleReceiptDrop}>
                  <div className="icon">◐</div>
                  <div className="hint">
                    <strong>Drop a photo or tap to upload</strong><br/>
                    <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      on-device OCR · Tesseract.js · no API, no cost
                    </span>
                  </div>
                </div>
              )}
              {scanPhotoUrl && (
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, marginBottom: 18, padding: 12, border: "1px solid var(--rule-soft)", background: "var(--bg-soft)" }}>
                  <div style={{ position: "relative", width: 120, height: 160, overflow: "hidden", background: "#000" }}>
                    <img src={scanPhotoUrl} alt="receipt" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: step === 1 ? 0.5 : 1 }} />
                    {step === 1 && scanProgress > 0 && scanProgress < 100 && (
                      <div style={{ position: "absolute", left: 0, right: 0, top: `${scanProgress}%`, height: 2, background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
                      Receipt · {step === 1 ? `${scanProgress}%` : "done"}
                    </div>
                    <div className="font-display" style={{ fontSize: 15, lineHeight: 1.2, marginBottom: 8 }}>
                      {scanStatus || "Ready"}
                    </div>
                    {step === 1 && (
                      <div style={{ height: 3, background: "var(--rule-soft)", marginBottom: 10 }}>
                        <div style={{ height: "100%", width: `${scanProgress}%`, background: "var(--accent)", transition: "width 0.2s" }} />
                      </div>
                    )}
                    {scanCandidates && scanCandidates.totals.length > 1 && (
                      <div>
                        <div className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
                          Possible totals — tap to use
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {scanCandidates.totals.slice(0, 5).map((t, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setAmount(String(t.value))}
                              style={{
                                padding: "4px 9px",
                                border: "1px solid var(--rule-soft)",
                                background: Number(amount) === t.value ? "var(--ink)" : "var(--paper)",
                                color: Number(amount) === t.value ? "var(--paper)" : "var(--ink)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                cursor: "pointer"
                              }}
                            >
                              ¥{fmt(t.value)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {scanCandidates && scanCandidates.items && scanCandidates.items.length >= 2 && !hasItems && (
                      <div className="mono" style={{ fontSize: 10, color: "var(--pos)", marginTop: 8, letterSpacing: "0.04em" }}>
                        ✦ {scanCandidates.items.length} line items found · scroll down to split per-item
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setScanPhotoUrl(null); setScanCandidates(null); setScanStatus(""); setScanProgress(0); }}
                      style={{ marginTop: 10, background: "none", border: "none", color: "var(--ink-faint)", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                    >
                      Replace photo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="field">
            <label className="field-label">Description</label>
            <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Dinner at Kamimura…" />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label">Amount · charged in JPY</label>
              <div className="amount-input">
                <span className="curr">¥</span>
                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Category</label>
              <select className="field-select" value={category} onChange={e => setCategory(e.target.value)}>
                <option>Food</option>
                <option>Activity</option>
                <option>Transport</option>
                <option>Lodging</option>
                <option>Shopping</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Paid by</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={"split-pill " + (payer === m.id ? "on" : "")}
                  style={{ opacity: 1, borderColor: payer === m.id ? "var(--accent)" : "var(--rule-soft)" }}
                  onClick={() => setPayer(m.id)}
                >
                  <Avatar member={m} size="sm" />
                  <span>{m.name}</span>
                  <span className="share">{m.home}</span>
                </button>
              ))}
            </div>
          </div>

          {/* FX LOCK — based on what hit the payer's bank, not a rate */}
          <div className="fx-lock-widget">
            <div className="hd">
              <span>What {payerMember.name}'s bank actually charged</span>
              <span className="lock-icon">
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="2" y="4.5" width="6" height="4.5" rx="0.5"/>
                  <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5"/>
                </svg>
                LOCKED
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", lineHeight: 1.4 }}>
              Check {payerMember.name}'s banking app and type the amount that hit the account — we'll lock the rate from there.
            </div>
            <div className="fx-lock-row">
              <div>
                <label className="field-label">Their card's currency</label>
                <select className="field-select" value={lockFrom} onChange={e => setLockFrom(e.target.value)}>
                  <option value="AUD">🇦🇺 AUD</option>
                  <option value="SGD">🇸🇬 SGD</option>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="EUR">🇪🇺 EUR</option>
                  <option value="GBP">🇬🇧 GBP</option>
                  <option value="NZD">🇳🇿 NZD</option>
                </select>
              </div>
              <div className="fx-eq">=</div>
              <div>
                <label className="field-label">Amount in {lockFrom} · as per bank statement</label>
                <div className="amount-input">
                  <span className="curr">{lockFrom === "AUD" ? "A$" : lockFrom === "SGD" ? "S$" : lockFrom === "USD" ? "$" : lockFrom === "EUR" ? "€" : lockFrom === "GBP" ? "£" : lockFrom === "NZD" ? "NZ$" : ""}</span>
                  <input
                    type="text"
                    value={homeAmount}
                    onChange={e => setHomeAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="858.90"
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                </div>
              </div>
            </div>
            <div className="fx-lock-note">
              <span>Note: </span>
              <input
                style={{ border: "none", background: "transparent", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)", outline: "none", width: 180 }}
                placeholder="e.g. CBA debit, Wise card…"
                value={lockNote}
                onChange={e => setLockNote(e.target.value)}
              />
            </div>
            {amount && homeAmount && lockedRate && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)" }}>
                    Locked rate
                  </div>
                  <div>
                    <span className="font-display" style={{ fontSize: 22, color: "var(--accent)" }}>
                      {lockedRate.toFixed(2)}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", marginLeft: 6 }}>
                      JPY per {lockFrom}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-faint)" }}>
                    vs market ({marketRate})
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: delta > 0.5 ? "var(--neg)" : (delta < -0.5 ? "var(--pos)" : "var(--ink-faint)") }}>
                    {Math.abs(delta) < 0.05 ? "at market" : (delta > 0 ? `+${delta.toFixed(2)}% — bank fee` : `${delta.toFixed(2)}% — better than market`)}
                  </div>
                </div>
              </div>
            )}
            {amount && !homeAmount && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule-soft)", fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
                Leave blank for cash payments · we'll use today's market rate ({marketRate} JPY/{lockFrom}) as a best guess.
              </div>
            )}
          </div>

          {!hasItems && (
            <div className="field" style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <label className="field-label" style={{ margin: 0 }}>Split equally between · {participants.size} people</label>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                Sponsors are unticked by default · tap any pill to override for this expense only
              </div>
              <div className="split-pills">
                {members.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={"split-pill " + (participants.has(m.id) ? "on" : "")}
                    onClick={() => toggleParticipant(m.id)}
                  >
                    <Avatar member={m} size="sm" />
                    <span>{m.name}</span>
                    {!m.splitsByDefault && <span className="share" style={{ color: "var(--accent)" }}>sponsor</span>}
                    {participants.has(m.id) && amount && (
                      <span className="share">
                        ¥{fmt(Number(amount) / participants.size, 0)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {amount && (
                <button
                  type="button"
                  onClick={() => {
                    // If OCR found items, populate from those; otherwise seed with one blank line
                    if (scanCandidates?.items?.length >= 2) {
                      setItems(scanCandidates.items.map((it, i) => ({
                        id: "it" + Date.now() + "-" + i,
                        desc: it.desc,
                        price: it.price,
                        assignees: new Set(defaultSplit),
                      })));
                    } else {
                      setItems([
                        { id: "it" + Date.now(), desc: "", price: 0, assignees: new Set(defaultSplit) },
                      ]);
                    }
                  }}
                  style={{ display: "flex", width: "100%", marginTop: 14, padding: "14px 16px", background: "var(--bg-soft)", border: "1px solid var(--rule)", borderRadius: 6, cursor: "pointer", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}
                >
                  <div>
                    <div className="font-display" style={{ fontSize: 14, color: "var(--ink)", marginBottom: 2 }}>
                      Some items only apply to some people?
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.04em" }}>
                      {scanCandidates?.items?.length >= 2
                        ? `${scanCandidates.items.length} items auto-detected · assign per-person`
                        : "Split line-by-line · add items manually"}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Itemise →
                  </span>
                </button>
              )}
            </div>
          )}

          {hasItems && (
            <div className="field" style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <label className="field-label" style={{ margin: 0 }}>Per-item split · {items.length} line{items.length === 1 ? "" : "s"}</label>
                <button
                  type="button"
                  onClick={() => setItems([])}
                  style={{ background: "transparent", border: "1px solid var(--rule)", borderRadius: 6, padding: "4px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--ink-faint)", cursor: "pointer" }}
                >
                  ← back to simple split
                </button>
              </div>

              {/* Translation consent / status banner */}
              {scanCandidates?.sourceLang && scanCandidates.sourceLang !== "en" && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 6, background: "var(--bg-soft)", border: "1px solid var(--rule-soft)", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                  {translatorState === "downloadable" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span>
                        <span style={{ color: "var(--accent)" }}>◉</span> {scanCandidates.sourceLang === "ja" ? "Japanese" : "Non-English"} text detected.
                        {" "}<span style={{ color: "var(--ink-faint)" }}>Enable offline translation? (~30MB, one-time)</span>
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => setTranslatorState("dict-only")} style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-faint)", padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", letterSpacing: "inherit" }}>Not now</button>
                        <button type="button" onClick={enableTranslator} style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)", padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", letterSpacing: "inherit" }}>Enable</button>
                      </div>
                    </div>
                  )}
                  {translatorState === "downloading" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>Downloading {scanCandidates.sourceLang === "ja" ? "Japanese" : ""} language pack…</span>
                        <span>{translatorProgress}%</span>
                      </div>
                      <div style={{ height: 2, background: "var(--rule-soft)" }}>
                        <div style={{ height: "100%", width: `${translatorProgress}%`, background: "var(--accent)", transition: "width 0.2s" }} />
                      </div>
                    </div>
                  )}
                  {translatorState === "ready" && (
                    <span style={{ color: "var(--pos)" }}>✓ Chrome translator active · {window.translator?.status?.nativeHits || 0} items translated on-device</span>
                  )}
                  {translatorState === "dict-only" && (
                    <span><span style={{ color: "var(--ink-faint)" }}>Using built-in Japanese dictionary</span> · {Object.keys(translations).length} items translated · <button type="button" onClick={enableTranslator} style={{ background: "transparent", border: "none", color: "var(--accent)", padding: 0, fontSize: 10, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", letterSpacing: "inherit" }}>enable Chrome translator</button></span>
                  )}
                  {translatorState === "unavailable" && (
                    <span style={{ color: "var(--ink-faint)" }}>Translation unavailable in this browser · text shown as-is</span>
                  )}
                </div>
              )}

              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
                Assign each line to whoever consumed it · tax &amp; service proportionally redistributed · saves as {(() => {
                  const groups = new Set();
                  items.forEach(it => { if (it.assignees.size > 0 && Number(it.price) > 0) groups.add(Array.from(it.assignees).sort().join(",")); });
                  const n = groups.size;
                  return `${n} ledger entr${n === 1 ? "y" : "ies"}`;
                })()}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((it, idx) => {
                  const tr = translations[it.desc];
                  return (
                  <div key={it.id} style={{ border: "1px solid " + (it.suspicious ? "var(--neg)" : "var(--rule)"), borderRadius: 8, padding: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", minWidth: 18 }}>{String(idx + 1).padStart(2, "0")}</span>
                      <input
                        type="text"
                        value={it.desc}
                        onChange={(e) => updateItem(it.id, "desc", e.target.value)}
                        placeholder="Item description"
                        style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid var(--rule-soft)", padding: "4px 0", fontFamily: "inherit", fontSize: 13, color: "var(--ink)", outline: "none" }}
                      />
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>¥</span>
                      <input
                        type="number"
                        value={it.price || ""}
                        onChange={(e) => updateItem(it.id, "price", e.target.value)}
                        placeholder="0"
                        style={{ width: 80, background: "transparent", border: "none", borderBottom: "1px solid var(--rule-soft)", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)", outline: "none", textAlign: "right" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        style={{ background: "transparent", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
                        aria-label="Remove item"
                      >×</button>
                    </div>
                    {/* Translation line (appears if original was translated) */}
                    {tr && tr.translated && tr.translated.toLowerCase() !== it.desc.toLowerCase() && (
                      <div style={{ paddingLeft: 26, marginTop: 2, marginBottom: 8, display: "flex", gap: 6, alignItems: "baseline" }}>
                        <span style={{ fontSize: 12, color: "var(--ink-faint)", fontStyle: "italic" }}>↳ {tr.translated}</span>
                        <span className="mono" style={{ fontSize: 9, color: "var(--ink-faint)", opacity: 0.5, letterSpacing: "0.04em" }}>
                          {tr.engine === "native" ? "chrome" : "dict"}
                        </span>
                      </div>
                    )}
                    {it.suspicious && (
                      <div className="mono" style={{ paddingLeft: 26, marginTop: 2, marginBottom: 8, fontSize: 10, color: "var(--neg)", letterSpacing: "0.04em" }}>
                        ⚠ Price is {Math.round((it.price / Number(amount)) * 100)}% of total — check if this is a subtotal
                      </div>
                    )}
                    <div style={{ marginTop: tr || it.suspicious ? 0 : 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {members.filter(m => m.canPay || m.splitsByDefault).map(m => {
                        const on = it.assignees.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleItemAssignee(it.id, m.id)}
                            className={"split-pill " + (on ? "on" : "")}
                            style={{ fontSize: 11, padding: "4px 8px", gap: 5 }}
                          >
                            <Avatar member={m} size="sm" />
                            <span>{m.name}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(defaultSplit);
                          updateItem(it.id, "assignees", all);
                        }}
                        style={{ background: "transparent", border: "1px dashed var(--rule)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-faint)", cursor: "pointer" }}
                      >
                        Reset → all
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addItem}
                style={{ width: "100%", marginTop: 10, background: "transparent", border: "1px dashed var(--rule)", borderRadius: 8, padding: "10px", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)", cursor: "pointer" }}
              >
                + Add line
              </button>

              {/* Raw OCR lines — toggle open to promote missed lines into items */}
              {scanCandidates?.rawLines && scanCandidates.rawLines.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowRawLines(!showRawLines)}
                    style={{ width: "100%", background: "transparent", border: "1px solid var(--rule-soft)", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)" }}
                  >
                    <span>{showRawLines ? "▾" : "▸"} Raw OCR text · {scanCandidates.rawLines.filter(l => !l.captured).length} uncaptured lines</span>
                    <span>{scanCandidates.rawLines.length} total</span>
                  </button>
                  {showRawLines && (
                    <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", border: "1px solid var(--rule-soft)", borderRadius: 6 }}>
                      {scanCandidates.rawLines.map((ln, i) => {
                        const tr = translations[ln.text];
                        return (
                          <div key={i} style={{ padding: "6px 10px", borderBottom: i === scanCandidates.rawLines.length - 1 ? "none" : "1px solid var(--rule-soft)", display: "flex", gap: 8, alignItems: "center", background: ln.captured ? "color-mix(in oklch, var(--pos) 5%, transparent)" : "transparent" }}>
                            <span className="mono" style={{ fontSize: 9, color: "var(--ink-faint)", minWidth: 22, opacity: 0.6 }}>{String(i + 1).padStart(2, "0")}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: ln.captured ? "var(--ink-faint)" : "var(--ink)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {ln.text}
                              </div>
                              {tr && tr.translated && tr.translated.toLowerCase() !== ln.text.toLowerCase() && (
                                <div style={{ fontSize: 10, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 1 }}>↳ {tr.translated}</div>
                              )}
                            </div>
                            {ln.captured ? (
                              <span className="mono" style={{ fontSize: 9, color: "var(--pos)", letterSpacing: "0.06em" }}>✓ in items</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  // Try to infer a price from trailing number
                                  const m = ln.text.match(/[¥￥]?\s*(\d{1,3}(?:[,.\s]\d{3})+|\d{2,})\s*[円]?\s*\*?$/);
                                  let price = 0;
                                  let desc = ln.text;
                                  if (m) {
                                    price = parseInt(m[1].replace(/[,.\s]/g, ''), 10);
                                    desc = ln.text.slice(0, m.index).trim();
                                  }
                                  setItems([...items, { id: "it" + Date.now() + i, desc, price, assignees: new Set(defaultSplit) }]);
                                }}
                                style={{ background: "transparent", border: "1px solid var(--rule)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--accent)", cursor: "pointer", letterSpacing: "0.04em" }}
                              >
                                + add
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Reconciler */}
              <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--rule-soft)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--ink-faint)" }}>Items subtotal</span>
                  <span>¥{fmt(itemsSum, 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--ink-faint)" }}>Tax / service / rounding</span>
                  <span style={{ color: reconcileDelta < 0 ? "var(--neg)" : "var(--ink)" }}>
                    {reconcileDelta >= 0 ? "+" : ""}¥{fmt(reconcileDelta, 0)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--rule-soft)", marginTop: 6 }}>
                  <span style={{ color: "var(--ink)" }}>Receipt total</span>
                  <span style={{ color: "var(--ink)" }}>¥{fmt(Number(amount) || 0, 0)}</span>
                </div>
                {reconcileDelta < 0 && (
                  <div style={{ marginTop: 8, padding: "6px 8px", background: "color-mix(in oklch, var(--neg) 10%, transparent)", borderRadius: 4, color: "var(--neg)", fontSize: 10, letterSpacing: "0.04em" }}>
                    ⚠ Items sum exceeds receipt total · check line prices
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
            {amount ? `Total ¥${fmt(Number(amount))} · ¥${fmt(Number(amount) / participants.size)} each` : "Enter an amount to preview"}
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn accent" onClick={handleSave} disabled={!amount || !title}>Lock &amp; save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AddExpense });
