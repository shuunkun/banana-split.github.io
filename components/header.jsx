// Masthead + tabs + members strip

function Masthead({ trip }) {
  return (
    <header className="masthead">
      <div className="issue">
        <div>Vol. 01 · Issue 14</div>
        <div style={{ marginTop: 4 }}>Ledger Edition</div>
      </div>
      <h1 className="title">
        The Ski <span className="amp">&amp;</span> Settle
      </h1>
      <div className="meta">
        <div>Shared Tab · {trip.location}</div>
        <div style={{ marginTop: 4 }}>{trip.dates}</div>
      </div>
    </header>
  );
}

function Tabs({ value, onChange, counts }) {
  const tabs = [
    { id: "expenses", label: "Expenses", count: counts.expenses },
    { id: "settle", label: "Settlement", count: counts.settle },
    { id: "people", label: "People", count: counts.people },
    { id: "activity", label: "Activity" },
  ];
  return (
    <nav className="tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          className={"tab " + (value === t.id ? "active" : "")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function MembersStrip({ members, activeId, onSelect, onAdd, onRemove }) {
  const splitters = members.filter(m => m.splitsByDefault).length;
  const sponsors  = members.length - splitters;
  return (
    <div className="members-strip">
      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginRight: 6 }}>
        Party of {members.length} · {splitters} splitting · {sponsors} sponsor{sponsors === 1 ? "" : "s"} ·
      </span>
      {members.map(m => {
        const isSponsor = !m.splitsByDefault;
        const isActive = activeId === m.id;
        return (
          <div
            key={m.id}
            className={"member-chip " + (isActive ? "active" : "")}
            style={{ ...(isSponsor ? { borderStyle: "dashed" } : {}), position: "relative", paddingRight: 26 }}
          >
            <button
              onClick={() => onSelect(m.id === activeId ? null : m.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
              title={`Filter by ${m.name}`}
            >
              <Avatar member={m} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
                <span className="name">
                  {m.name}
                  {isSponsor && (
                    <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", border: "1px solid currentColor", borderRadius: 2, verticalAlign: "middle", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                      sponsor
                    </span>
                  )}
                </span>
                <span className="home">{m.home}</span>
              </div>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(m); }}
              title={`Remove ${m.name} from trip`}
              aria-label={`Remove ${m.name}`}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 18, height: 18, padding: 0, borderRadius: "50%",
                border: "none", background: "transparent",
                fontSize: 14, lineHeight: "16px", color: "var(--ink-faint)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--neg)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-faint)"; }}
            >×</button>
          </div>
        );
      })}
      <button className="add-member-btn" onClick={onAdd}>+ Add member</button>
    </div>
  );
}

function HeroSummary({ trip, totalBase, perHead, myBalance, myMember, memberCount }) {
  const isPos = myBalance >= 0;
  return (
    <section className="hero">
      <div className="hero-cell primary">
        <div className="hero-trip-name">{trip.name}</div>
        <div className="hero-trip-meta">{trip.dates}</div>
        <div className="hero-trip-meta" style={{ marginTop: 4 }}>{trip.location}</div>
        <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", background: "var(--bg-soft)", borderRadius: 999, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)" }}>
          <span>Base</span>
          <span style={{ color: "var(--ink)" }}>{trip.baseCurrencyFlag} {trip.baseCurrency}</span>
        </div>
      </div>
      <div className="hero-cell">
        <div className="label">Trip total</div>
        <div className="value">
          <span className="curr">¥</span>{fmt(totalBase)}
        </div>
        <div className="foot">across {memberCount} travellers</div>
      </div>
      <div className="hero-cell">
        <div className="label">Per head</div>
        <div className="value">
          <span className="curr">¥</span>{fmt(perHead)}
        </div>
        <div className="foot">if split evenly</div>
      </div>
      <div className="hero-cell">
        <div className="label">{myMember.name}'s position</div>
        <div className="value" style={{ color: isPos ? "var(--pos)" : "var(--neg)" }}>
          <span className="curr">{isPos ? "+" : "−"}¥</span>{fmt(Math.abs(myBalance))}
        </div>
        <div className="foot">
          {isPos ? "Owed to you · " : "You owe · "}
          ≈ {formatMoney(Math.abs(myBalance) / 98.4, "AUD")}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Masthead, Tabs, MembersStrip, HeroSummary });
