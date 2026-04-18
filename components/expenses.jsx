// Expense list, row, and detail drawer

function ExpenseRow({ expense, members, onClick, baseCurrency }) {
  const payer = members.find(m => m.id === expense.payer);
  const participants = expense.split.among.map(id => members.find(m => m.id === id));
  const [m, d] = expense.date.split(" ");
  return (
    <div className="expense-row" onClick={onClick}>
      <div className="expense-date">
        <span className="day">{d}</span>
        {m}
      </div>
      <div className="expense-main">
        <div className="title">{expense.title}</div>
        <div className="expense-meta">
          <span className="expense-cat">{expense.category}</span>
          <span className="dot">·</span>
          <span>Split {participants.length} ways</span>
          <span className="dot">·</span>
          <FxChip lockedRate={expense.lockedRate} baseCurrency={baseCurrency} />
          {expense.receipt && (
            <>
              <span className="dot">·</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
                ◉ Receipt
              </span>
            </>
          )}
        </div>
      </div>
      <div className="expense-payer">
        <Avatar member={payer} size="sm" />
        <span className="name">{payer.name}</span>
      </div>
      <div className="expense-amount">
        <div className="primary">
          <span className="sym">{currSymbol(expense.currency)}</span>{fmt(expense.amount, decimalsFor(expense.currency))}
        </div>
        <div className="secondary">
          ≈ {formatMoney(expense.payerEquivalent.amount, expense.payerEquivalent.currency)} paid
        </div>
      </div>
    </div>
  );
}

function ExpenseList({ expenses, members, onOpen, filters, baseCurrency }) {
  const filtered = expenses.filter(e => {
    if (filters.category !== "all" && e.category !== filters.category) return false;
    if (filters.member && !e.split.among.includes(filters.member) && e.payer !== filters.member) return false;
    return true;
  });
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Ledger</h3>
        <span className="sub">{filtered.length} entries · ¥{fmt(total)} total</span>
      </div>
      <div className="expense-list">
        {filtered.map(e => (
          <ExpenseRow
            key={e.id}
            expense={e}
            members={members}
            baseCurrency={baseCurrency}
            onClick={() => onOpen(e)}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-faint)", fontFamily: "var(--font-display)", fontSize: 18, fontStyle: "italic" }}>
            No entries match this view.
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseDetail({ expense, members, onClose, baseCurrency }) {
  if (!expense) return null;
  const payer = members.find(m => m.id === expense.payer);
  const share = expense.amount / expense.split.among.length;
  const shareInPayerCurr = share / expense.lockedRate.rate;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
              {expense.date} · {expense.category}
            </div>
            <h2>{expense.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Amount block */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingBottom: 20, borderBottom: "1px solid var(--rule-soft)" }}>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>Charged amount</div>
              <div className="font-display" style={{ fontSize: 36, letterSpacing: "-0.02em" }}>
                <span className="mono" style={{ fontSize: 14, color: "var(--ink-soft)", marginRight: 4 }}>¥</span>
                {fmt(expense.amount)}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>Paid in Japan · {baseCurrency}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>{payer.name} actually paid</div>
              <div className="font-display" style={{ fontSize: 36, letterSpacing: "-0.02em", color: "var(--accent)" }}>
                {formatMoney(expense.payerEquivalent.amount, expense.payerEquivalent.currency)}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>via {expense.lockedRate.note}</div>
            </div>
          </div>

          {/* FX lock detail */}
          <div className="fx-lock-widget" style={{ marginTop: 20 }}>
            <div className="hd">
              <span>Locked exchange rate</span>
              <span className="lock-icon">
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="2" y="4.5" width="6" height="4.5" rx="0.5"/>
                  <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5"/>
                </svg>
                LOCKED
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.01em" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>1 {expense.lockedRate.from}</span>
              <span style={{ color: "var(--ink-faint)" }}>=</span>
              <span>{expense.lockedRate.rate} {baseCurrency}</span>
            </div>
            <div className="fx-lock-note">
              Rate from {expense.lockedRate.note} at time of payment. Market today: 98.40 JPY/AUD, 114.20 JPY/SGD.
            </div>
          </div>

          {/* Split breakdown */}
          <div style={{ marginTop: 22 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 12 }}>
              Split equally among {expense.split.among.length}
            </div>
            <div style={{ border: "1px solid var(--rule-soft)" }}>
              {expense.split.among.map((pid, idx, arr) => {
                const p = members.find(x => x.id === pid);
                const inHome = share / (p.home === "AUD" ? 98.4 : p.home === "SGD" ? 114.2 : 1);
                const isLast = idx === arr.length - 1;
                return (
                  <div key={pid} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, padding: "10px 14px", borderBottom: isLast ? "none" : "1px solid var(--rule-soft)", alignItems: "center" }}>
                    <Avatar member={p} size="sm" />
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>Home: {p.home}</div>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "right" }}>
                      ≈ {formatMoney(inHome, p.home)}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 17, textAlign: "right", minWidth: 90 }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>¥</span>{fmt(share)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <div className="btn-row">
            <button className="btn ghost">Edit</button>
            <button className="btn">Duplicate</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ExpenseList, ExpenseRow, ExpenseDetail });
