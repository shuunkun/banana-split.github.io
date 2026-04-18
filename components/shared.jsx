// Shared helpers and primitives used across the app
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// Format number with commas, configurable decimals
function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function currSymbol(code) {
  return ({
    JPY: "¥", AUD: "A$", SGD: "S$", USD: "$", EUR: "€", GBP: "£"
  })[code] || code + " ";
}
function decimalsFor(code) {
  return code === "JPY" ? 0 : 2;
}
function formatMoney(amount, code) {
  const d = decimalsFor(code);
  return `${currSymbol(code)}${fmt(amount, d)}`;
}

// Given an expense paid in base currency (JPY), compute equivalent in payer's home via locked rate
function convertViaLockedRate(jpyAmount, lockedRate) {
  // lockedRate.rate = JPY per 1 unit of lockedRate.from
  return jpyAmount / lockedRate.rate;
}

// Compute everyone's balance in the BASE currency (JPY)
// Positive = they are owed money (paid > consumed)
// Negative = they owe money
function computeBalances(trip, members, expenses) {
  const balances = {};
  members.forEach(m => balances[m.id] = 0);
  expenses.forEach(e => {
    // Credit the payer with full amount
    balances[e.payer] += e.amount;
    // Debit each participant with their share
    const share = e.amount / e.split.among.length;
    e.split.among.forEach(pid => {
      balances[pid] -= share;
    });
  });
  return balances;
}

// Debt simplification — minimize transactions
// Classic greedy approach: match largest creditor with largest debtor until all settled.
// Returns list of { from, to, amount } in BASE currency
function simplifyDebts(balances) {
  const list = Object.entries(balances).map(([id, v]) => ({ id, v })).filter(x => Math.abs(x.v) > 0.5);
  const creditors = list.filter(x => x.v > 0).sort((a,b) => b.v - a.v).map(x => ({...x}));
  const debtors = list.filter(x => x.v < 0).sort((a,b) => a.v - b.v).map(x => ({...x, v: -x.v}));
  const result = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0], d = debtors[0];
    const amt = Math.min(c.v, d.v);
    result.push({ from: d.id, to: c.id, amount: amt });
    c.v -= amt; d.v -= amt;
    if (c.v < 0.5) creditors.shift();
    if (d.v < 0.5) debtors.shift();
  }
  return result;
}

// Avatar component with home-currency "passport"
function Avatar({ member, size = "md", showPassport = true }) {
  const cls = size === "sm" ? "avatar sm" : size === "lg" ? "avatar lg" : "avatar";
  return (
    <div className={cls} style={{ background: member.color }}>
      {member.initials}
      {showPassport && <span className="passport">{member.homeFlag}</span>}
    </div>
  );
}

// Section rule (editorial divider)
function Rule({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 14px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
      {label && <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-faint)" }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
    </div>
  );
}

// FX chip — shows locked rate with small padlock
function FxChip({ lockedRate, baseCurrency }) {
  if (!lockedRate) return null;
  return (
    <span className="fx-chip" title={`Locked rate: 1 ${lockedRate.from} = ${lockedRate.rate} ${baseCurrency}`}>
      <svg className="lock" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="2" y="4.5" width="6" height="4.5" rx="0.5"/>
        <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5"/>
      </svg>
      <span className="rate">{lockedRate.rate}</span>
      <span style={{ color: "var(--ink-faint)" }}>{baseCurrency}/{lockedRate.from}</span>
    </span>
  );
}

Object.assign(window, { fmt, currSymbol, decimalsFor, formatMoney, convertViaLockedRate, computeBalances, simplifyDebts, Avatar, Rule, FxChip });
