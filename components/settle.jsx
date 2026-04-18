// Balances panel + Settlement graph view

function BalancesPanel({ members, balances, baseCurrency }) {
  const max = Math.max(1, ...Object.values(balances).map(v => Math.abs(v)));
  const sorted = [...members].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));
  return (
    <div className="card">
      <div className="card-head">
        <h3>Where everyone stands</h3>
        <span className="sub">in {baseCurrency}</span>
      </div>
      {sorted.map(m => {
        const v = balances[m.id] || 0;
        const pct = (Math.abs(v) / max) * 50;
        const isPos = v >= 0;
        const inHome = Math.abs(v) / (m.home === "AUD" ? 98.4 : m.home === "SGD" ? 114.2 : 1);
        return (
          <div key={m.id} className="balance-row">
            <div className="who">
              <Avatar member={m} size="sm" />
              <div>
                <div className="name">{m.name}</div>
                <div className="home">home · {m.home}</div>
              </div>
            </div>
            <div className={"balance-bar " + (isPos ? "pos" : "neg")}>
              <div className="zero" />
              <div className="fill" style={{ width: pct + "%" }} />
            </div>
            <div className={"balance-amount " + (isPos ? "pos" : "neg")}>
              {isPos ? "+" : "−"}¥{fmt(Math.abs(v))}
              <span className="sub">≈ {formatMoney(inHome, m.home)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettlementGraph({ members, settlements, balances, baseCurrency }) {
  // Layout members around a circle
  const size = 520;
  const cx = size / 2, cy = size / 2;
  const radius = 180;
  const positions = {};
  members.forEach((m, i) => {
    const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
    positions[m.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      angle,
    };
  });

  const [hovered, setHovered] = useState(null);

  return (
    <div className="settle-wrap">
      <svg className="settle-svg" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
          </marker>
          <marker id="arrowheadDim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--rule-soft)" />
          </marker>
        </defs>

        {/* Concentric rings decoration */}
        <circle cx={cx} cy={cy} r={radius + 40} fill="none" stroke="var(--rule-soft)" strokeDasharray="2 4" />
        <circle cx={cx} cy={cy} r={radius - 60} fill="none" stroke="var(--rule-soft)" strokeDasharray="2 4" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="var(--ink-faint)">MINIMIZED</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fontFamily="var(--font-display)" fontSize="16" fontStyle="italic" fill="var(--ink)">{settlements.length} transfers</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="var(--ink-faint)">TO SETTLE</text>

        {/* Debt edges */}
        {settlements.map((s, i) => {
          const from = positions[s.from];
          const to = positions[s.to];
          // Slight offset so arrow doesn't overlap node
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          const ux = dx / len, uy = dy / len;
          const startX = from.x + ux * 28, startY = from.y + uy * 28;
          const endX = to.x - ux * 32, endY = to.y - uy * 32;
          // curved
          const mx = (startX + endX) / 2 + (-uy) * 18;
          const my = (startY + endY) / 2 + (ux) * 18;
          const isHovered = hovered === i;
          const dim = hovered !== null && !isHovered;
          const receiver = members.find(m => m.id === s.to);
          // convert to receiver's home currency
          const rate = receiver.home === "AUD" ? 98.4 : receiver.home === "SGD" ? 114.2 : 1;
          const inHome = s.amount / rate;
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
              <path
                d={`M${startX},${startY} Q${mx},${my} ${endX},${endY}`}
                fill="none"
                stroke={dim ? "var(--rule-soft)" : "var(--accent)"}
                strokeWidth={isHovered ? 2.5 : 1.5}
                markerEnd={dim ? "url(#arrowheadDim)" : "url(#arrowhead)"}
                opacity={dim ? 0.3 : 1}
              />
              {/* Amount label */}
              <g transform={`translate(${mx},${my})`} opacity={dim ? 0.3 : 1}>
                <rect x="-44" y="-14" width="88" height="28" fill="var(--paper)" stroke={isHovered ? "var(--accent)" : "var(--rule-soft)"} />
                <text x="0" y="-1" textAnchor="middle" fontFamily="var(--font-display)" fontSize="13" fill="var(--ink)">¥{fmt(s.amount, 0)}</text>
                <text x="0" y="10" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1" fill="var(--ink-faint)">{receiver.home} {fmt(inHome, 2)}</text>
              </g>
            </g>
          );
        })}

        {/* Member nodes */}
        {members.map(m => {
          const p = positions[m.id];
          const v = balances[m.id] || 0;
          const isPos = v >= 0;
          return (
            <g key={m.id} transform={`translate(${p.x},${p.y})`}>
              <circle r="26" fill={m.color} />
              <text y="5" textAnchor="middle" fontFamily="var(--font-display)" fontSize="18" fontWeight="500" fill="#fff">{m.initials}</text>
              {/* Label */}
              <g transform={`translate(0, ${p.y > cy ? 50 : -50})`}>
                <text textAnchor="middle" fontFamily="var(--font-display)" fontSize="15" fill="var(--ink)" y="0">{m.name}</text>
                <text textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill={isPos ? "var(--pos)" : "var(--neg)"} y="14" letterSpacing="0.5">
                  {isPos ? "+" : "−"}¥{fmt(Math.abs(v))}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="settle-legend">
        <div className="settle-stat">
          <span style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}>Transfers required</span>
          <span className="val">{settlements.length}</span>
        </div>
        <div className="settle-stat">
          <span style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}>Naïve approach</span>
          <span className="val" style={{ color: "var(--ink-faint)", textDecoration: "line-through" }}>
            {(() => {
              const deb = Object.values(balances).filter(v => v < -0.5).length;
              const cred = Object.values(balances).filter(v => v > 0.5).length;
              return deb * cred;
            })()}
          </span>
        </div>
        <div className="settle-stat">
          <span style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 10 }}>Total moved</span>
          <span className="val">¥{fmt(settlements.reduce((s, x) => s + x.amount, 0))}</span>
        </div>
      </div>
    </div>
  );
}

function SettlementList({ members, settlements, baseCurrency }) {
  if (!settlements.length) {
    return (
      <div className="card">
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div className="font-display" style={{ fontSize: 28, fontStyle: "italic" }}>All square.</div>
          <div style={{ color: "var(--ink-soft)", marginTop: 6 }}>Everyone has paid their share.</div>
        </div>
      </div>
    );
  }
  return (
    <div>
      {settlements.map((s, i) => {
        const from = members.find(m => m.id === s.from);
        const to = members.find(m => m.id === s.to);
        const rateFrom = from.home === "AUD" ? 98.4 : from.home === "SGD" ? 114.2 : 1;
        const rateTo = to.home === "AUD" ? 98.4 : to.home === "SGD" ? 114.2 : 1;
        const fromEq = s.amount / rateFrom;
        const toEq = s.amount / rateTo;
        return (
          <div key={i} className="settle-list-item">
            <div className="settle-who">
              <Avatar member={from} />
              <div>
                <div className="name">{from.name}</div>
                <div className="home">pays from {from.home}</div>
              </div>
            </div>
            <div className="settle-arrow">→</div>
            <div className="settle-who to">
              <div>
                <div className="name">{to.name}</div>
                <div className="home">receives in {to.home}</div>
              </div>
              <Avatar member={to} />
            </div>
            <div className="settle-amt">
              <div className="primary">¥{fmt(s.amount)}</div>
              <div className="secondary">
                {formatMoney(fromEq, from.home)} <span style={{ color: "var(--accent)" }}>→</span> {formatMoney(toEq, to.home)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { BalancesPanel, SettlementGraph, SettlementList });
