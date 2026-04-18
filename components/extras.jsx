// Tweaks panel + Add Member modal + People view

function TweaksPanel({ open, theme, setTheme, density, setDensity, currencyMode, setCurrencyMode }) {
  return (
    <div className={"tweaks-panel " + (open ? "open" : "")}>
      <h4>Tweaks</h4>
      <div className="tweak-group">
        <div className="label">Theme</div>
        <div className="tweak-opts">
          <button className={"tweak-opt " + (theme === "paper" ? "on" : "")} onClick={() => setTheme("paper")}>Paper</button>
          <button className={"tweak-opt " + (theme === "fresh" ? "on" : "")} onClick={() => setTheme("fresh")}>Fresh</button>
          <button className={"tweak-opt " + (theme === "terminal" ? "on" : "")} onClick={() => setTheme("terminal")}>Terminal</button>
        </div>
      </div>
      <div className="tweak-group">
        <div className="label">Currency display</div>
        <div className="tweak-opts">
          <button className={"tweak-opt " + (currencyMode === "base" ? "on" : "")} onClick={() => setCurrencyMode("base")}>Base only</button>
          <button className={"tweak-opt " + (currencyMode === "both" ? "on" : "")} onClick={() => setCurrencyMode("both")}>Base + home</button>
        </div>
      </div>
      <div className="tweak-group">
        <div className="label">Density</div>
        <div className="tweak-opts">
          <button className={"tweak-opt " + (density === "cozy" ? "on" : "")} onClick={() => setDensity("cozy")}>Cozy</button>
          <button className={"tweak-opt " + (density === "compact" ? "on" : "")} onClick={() => setDensity("compact")}>Compact</button>
        </div>
      </div>
    </div>
  );
}

function RemoveMemberModal({ member, expenses, balances, onClose, onConfirm }) {
  if (!member) return null;
  const paidCount = expenses.filter(e => e.payer === member.id).length;
  const paidTotal = expenses.filter(e => e.payer === member.id).reduce((s, e) => s + e.amount, 0);
  const splitCount = expenses.filter(e => e.split.among.includes(member.id)).length;
  const balance = balances[member.id] || 0;
  const hasHistory = paidCount > 0 || splitCount > 0;
  const hasOpenBalance = Math.abs(balance) > 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--neg)", marginBottom: 4 }}>
              Confirm removal
            </div>
            <h2>Remove {member.name} from the trip?</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: "var(--bg-soft)", border: "1px solid var(--rule-soft)", marginBottom: 18 }}>
            <Avatar member={member} size="lg" />
            <div style={{ flex: 1 }}>
              <div className="font-display" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>{member.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
                {member.homeFlag} {member.home} · {member.splitsByDefault ? "splits in" : "sponsor"}
              </div>
            </div>
          </div>

          {!hasHistory && (
            <div style={{ padding: 14, border: "1px solid var(--rule-soft)", marginBottom: 18, fontSize: 13, lineHeight: 1.5, color: "var(--ink-soft)" }}>
              No expenses tied to {member.name}. Removing is clean — nothing else changes.
            </div>
          )}

          {hasHistory && (
            <>
              <div style={{ padding: 14, border: "1px solid var(--rule-soft)", marginBottom: 14, background: "var(--bg-soft)" }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
                  History in this trip
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)" }}>Paid</div>
                    <div className="font-display" style={{ fontSize: 17 }}>{paidCount}×</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>¥{fmt(paidTotal)}</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)" }}>Split into</div>
                    <div className="font-display" style={{ fontSize: 17 }}>{splitCount}×</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>expenses</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)" }}>Balance</div>
                    <div className="font-display" style={{ fontSize: 17, color: balance >= 0 ? "var(--pos)" : "var(--neg)" }}>
                      {balance >= 0 ? "+" : "−"}¥{fmt(Math.abs(balance))}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>{balance >= 0 ? "owed to" : "owes"}</div>
                  </div>
                </div>
              </div>

              {hasOpenBalance && (
                <div style={{ padding: 12, border: "1px solid var(--neg)", marginBottom: 14, fontSize: 12, lineHeight: 1.5, color: "var(--ink)", background: "rgba(184,73,61,0.06)" }}>
                  <strong>Heads up:</strong> {member.name} has an open balance. If they've already settled in cash outside the app, proceed. Otherwise you might want to record the settlement first.
                </div>
              )}

              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
                What should happen to their expenses?
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  type="button"
                  className="tweak-opt"
                  style={{ padding: 14, textAlign: "left" }}
                  onClick={() => onConfirm("reassign")}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, textTransform: "none", letterSpacing: 0, marginBottom: 4 }}>
                    Keep expenses, just remove them from splits
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-mono)" }}>
                    Expenses they paid stay in the ledger (marked "former member"). They drop out of every split they were in — the remaining people re-share. <strong>Recommended if they actually went on the trip.</strong>
                  </div>
                </button>
                <button
                  type="button"
                  className="tweak-opt"
                  style={{ padding: 14, textAlign: "left" }}
                  onClick={() => onConfirm("delete")}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, textTransform: "none", letterSpacing: 0, marginBottom: 4 }}>
                    Delete everything they touched
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-mono)" }}>
                    Wipe their {paidCount} paid expense{paidCount === 1 ? "" : "s"} and pull them from {splitCount} shared bill{splitCount === 1 ? "" : "s"}. Use this if they were added by mistake.
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {!hasHistory && (
            <button className="btn" style={{ background: "var(--neg)", color: "#fff", borderColor: "var(--neg)" }} onClick={() => onConfirm("delete")}>
              Remove {member.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddMemberModal({ onClose, onAdd, existingCount }) {
  const [name, setName] = useState("");
  const [home, setHome] = useState("AUD");
  const [splitsByDefault, setSplitsByDefault] = useState(true);
  const colors = ["#C9593B", "#5B7C6A", "#8A5A8C", "#3E5C78", "#B08A3E", "#5F6B8A", "#7A4A3A"];
  const flags = { AUD: "🇦🇺", SGD: "🇸🇬", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", NZD: "🇳🇿" };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
              Member {existingCount + 1}
            </div>
            <h2>Who's joining?</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Name</label>
            <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Taro" autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Default behaviour in expenses</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" className={"tweak-opt " + (splitsByDefault ? "on" : "")} style={{ padding: 12, fontSize: 11, textAlign: "left" }} onClick={() => setSplitsByDefault(true)}>
                Splits in<br/>
                <span style={{ fontSize: 9, opacity: 0.7, textTransform: "none", letterSpacing: 0 }}>Pre-ticked on every new expense</span>
              </button>
              <button type="button" className={"tweak-opt " + (!splitsByDefault ? "on" : "")} style={{ padding: 12, fontSize: 11, textAlign: "left" }} onClick={() => setSplitsByDefault(false)}>
                Sponsor<br/>
                <span style={{ fontSize: 9, opacity: 0.7, textTransform: "none", letterSpacing: 0 }}>Pays the card, opts out of splits</span>
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              Override per expense by tapping pills — defaults are just a starting point.
            </div>
          </div>
          <div className="field">
            <label className="field-label">Home currency</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["AUD", "SGD", "USD", "EUR", "GBP", "JPY", "NZD"].map(c => (
                <button key={c} type="button" className={"tweak-opt " + (home === c ? "on" : "")} style={{ padding: "10px 14px", fontSize: 12 }} onClick={() => setHome(c)}>
                  {flags[c]} {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={!name.trim()} onClick={() => {
              const initials = name.trim().charAt(0).toUpperCase();
              onAdd({ id: "m" + Date.now(), name: name.trim(), initials, home, homeFlag: flags[home], color: colors[existingCount % colors.length], canPay: true, splitsByDefault });
              onClose();
            }}>Add to trip</button>
        </div>
      </div>
    </div>
  );
}

function PeopleView({ members, expenses, balances, onRemove }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>The party</h3>
        <span className="sub">{members.length} travellers · {members.filter(m=>m.splitsByDefault).length} splitting · {new Set(members.map(m => m.home)).size} home currencies</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {members.map(m => {
          const paid = expenses.filter(e => e.payer === m.id).reduce((s, e) => s + e.amount, 0);
          const timesPaid = expenses.filter(e => e.payer === m.id).length;
          const inHome = Math.abs(balances[m.id] || 0) / (m.home === "AUD" ? 98.4 : m.home === "SGD" ? 114.2 : 1);
          const isPos = (balances[m.id] || 0) >= 0;
          const isSponsor = !m.splitsByDefault;
          return (
            <div key={m.id} style={{ position: "relative", border: isSponsor ? "1px dashed var(--ink)" : "1px solid var(--rule-soft)", padding: 18, background: "var(--bg-soft)" }}>
              {onRemove && (
                <button
                  onClick={() => onRemove(m)}
                  title={`Remove ${m.name}`}
                  aria-label={`Remove ${m.name}`}
                  style={{
                    position: "absolute", top: 10, right: 10,
                    width: 22, height: 22, padding: 0, borderRadius: "50%",
                    border: "1px solid var(--rule-soft)", background: "var(--paper)",
                    fontSize: 14, lineHeight: "20px", color: "var(--ink-faint)",
                    cursor: "pointer", fontFamily: "var(--font-mono)"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--neg)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--neg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--ink-faint)"; e.currentTarget.style.borderColor = "var(--rule-soft)"; }}
                >×</button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <Avatar member={m} size="lg" />
                <div>
                  <div className="font-display" style={{ fontSize: 20, letterSpacing: "-0.01em" }}>{m.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
                    {m.homeFlag} Home · {m.home}{isSponsor && <> · <span style={{ color: "var(--accent)" }}>sponsor</span></>}
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rule-soft)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>Paid</div>
                  <div className="font-display" style={{ fontSize: 18 }}>¥{fmt(paid)}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>{timesPaid} time{timesPaid === 1 ? "" : "s"}</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>Position</div>
                  <div className="font-display" style={{ fontSize: 18, color: isPos ? "var(--pos)" : "var(--neg)" }}>
                    {isPos ? "+" : "−"}¥{fmt(Math.abs(balances[m.id] || 0))}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>≈ {formatMoney(inHome, m.home)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityView({ expenses, members }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Activity feed</h3>
        <span className="sub">Chronological, newest last</span>
      </div>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 1, background: "var(--rule-soft)" }} />
        {expenses.map((e, i) => {
          const payer = members.find(m => m.id === e.payer);
          return (
            <div key={e.id} style={{ position: "relative", padding: "10px 0 10px 14px", borderBottom: i < expenses.length - 1 ? "1px solid var(--rule-soft)" : "none" }}>
              <div style={{ position: "absolute", left: -21, top: 16, width: 9, height: 9, borderRadius: "50%", background: payer.color, border: "2px solid var(--paper)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-faint)", textTransform: "uppercase", marginRight: 10 }}>{e.date}</span>
                  <span className="font-display" style={{ fontSize: 16, letterSpacing: "-0.01em" }}>
                    <span style={{ color: "var(--accent)" }}>{payer.name}</span> paid for <em>{e.title}</em>
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  ¥{fmt(e.amount)} · locked @ {e.lockedRate.rate}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { TweaksPanel, AddMemberModal, RemoveMemberModal, PeopleView, ActivityView });
