// Main App — composes everything together

function App() {
  const data = window.TRIP_DATA;
  const [members, setMembers] = useState(data.members);
  const [expenses, setExpenses] = useState(data.expenses);
  const [tab, setTab] = useState("expenses");
  const [activeMember, setActiveMember] = useState(null);
  const [openExpense, setOpenExpense] = useState(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState(null); // member being confirmed for deletion
  const [view, setView] = useState("desktop"); // desktop | mobile | both
  const [toast, setToast] = useState(null);

  // Tweaks
  const [theme, setTheme] = useState("paper");
  const [density, setDensity] = useState("cozy");
  const [currencyMode, setCurrencyMode] = useState("both");
  const [tweaksOpen, setTweaksOpen] = useState(false);

  // Listen for tweak-mode messages from host
  useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    }
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.className = theme === "paper" ? "" : "theme-" + theme;
    document.body.style.setProperty("--density", density === "cozy" ? "1" : "0.85");
  }, [theme, density]);

  // Ghost member shown in rows for former trip members who paid for things.
  // Never in splits, never in balances, never selectable — just a label for historical expenses.
  const GHOST_MEMBER = { id: "__removed__", name: "Former member", initials: "—", home: "—", homeFlag: "—", color: "#8A8378", canPay: false, splitsByDefault: false, __ghost: true };
  const membersWithGhost = expenses.some(e => e.payer === "__removed__") ? [...members, GHOST_MEMBER] : members;

  const balances = useMemo(() => computeBalances(data.trip, members, expenses), [members, expenses]);
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);
  const totalBase = expenses.reduce((s, e) => s + e.amount, 0);
  const perHead = members.length > 0 ? totalBase / members.length : 0;
  const myMember = activeMember ? members.find(m => m.id === activeMember) : members[0];
  const myBalance = balances[myMember.id] || 0;

  const [filterCategory, setFilterCategory] = useState("all");
  const categories = ["all", ...Array.from(new Set(expenses.map(e => e.category)))];

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function handleAddExpense(e) {
    setExpenses([...expenses, e]);
    showToast(`Locked at ${e.lockedRate.rate} ${data.trip.baseCurrency}/${e.lockedRate.from}`);
  }
  function handleAddMember(m) {
    setMembers([...members, m]);
    showToast(`${m.name} joined the trip`);
  }
  function handleRequestRemove(m) {
    if (members.length <= 1) {
      showToast("Can't remove the last member of a trip");
      return;
    }
    setRemovingMember(m);
  }
  function handleConfirmRemove(strategy) {
    const m = removingMember;
    if (!m) return;
    let nextExpenses = expenses;
    if (strategy === "delete") {
      // Drop every expense where this member was payer; drop them from split lists
      nextExpenses = expenses
        .filter(e => e.payer !== m.id)
        .map(e => ({ ...e, split: { ...e.split, among: e.split.among.filter(id => id !== m.id) } }))
        .filter(e => e.split.among.length > 0);
    } else if (strategy === "reassign") {
      // Keep expenses paid by this person but leave them detached (payer = __removed__)
      // and remove from all split lists.
      nextExpenses = expenses.map(e => {
        const among = e.split.among.filter(id => id !== m.id);
        return { ...e, payer: e.payer === m.id ? "__removed__" : e.payer, split: { ...e.split, among } };
      }).filter(e => e.split.among.length > 0);
    }
    setExpenses(nextExpenses);
    setMembers(members.filter(x => x.id !== m.id));
    if (activeMember === m.id) setActiveMember(null);
    setRemovingMember(null);
    showToast(`${m.name} removed from the trip`);
  }

  function DesktopContent() {
    return (
      <>
        <Masthead trip={data.trip} />
        <MembersStrip
          members={members}
          activeId={activeMember}
          onSelect={setActiveMember}
          onAdd={() => setAddingMember(true)}
          onRemove={handleRequestRemove}
        />
        <HeroSummary
          trip={data.trip}
          totalBase={totalBase}
          perHead={perHead}
          myBalance={myBalance}
          myMember={myMember}
          memberCount={members.length}
        />
        <Tabs
          value={tab}
          onChange={setTab}
          counts={{ expenses: expenses.length, settle: settlements.length, people: members.length }}
        />
        {tab === "expenses" && (
          <div className="layout">
            <div>
              <div className="action-bar">
                <div className="filter-chips">
                  {categories.map(c => (
                    <button
                      key={c}
                      className={"filter-chip " + (filterCategory === c ? "on" : "")}
                      onClick={() => setFilterCategory(c)}
                    >
                      {c === "all" ? "All categories" : c}
                    </button>
                  ))}
                </div>
                <div className="spacer" />
                <button className="btn accent" onClick={() => setAddingExpense(true)}>+ New expense</button>
              </div>
              <ExpenseList
                expenses={expenses}
                members={membersWithGhost}
                onOpen={setOpenExpense}
                filters={{ category: filterCategory, member: activeMember }}
                baseCurrency={data.trip.baseCurrency}
              />
            </div>
            <aside>
              <BalancesPanel members={members} balances={balances} baseCurrency={data.trip.baseCurrency} />
              <div className="card" style={{ marginTop: 18 }}>
                <div className="card-head">
                  <h3>FX reference</h3>
                  <span className="sub">Today's market</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { pair: "JPY / AUD", rate: data.marketRates.JPY_per_AUD },
                    { pair: "JPY / SGD", rate: data.marketRates.JPY_per_SGD },
                    { pair: "AUD / SGD", rate: data.marketRates.AUD_per_SGD },
                  ].map(r => (
                    <div key={r.pair} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8, borderBottom: "1px dashed var(--rule-soft)" }}>
                      <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--ink-soft)" }}>{r.pair}</span>
                      <span className="font-display" style={{ fontSize: 18 }}>{r.rate}</span>
                    </div>
                  ))}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.06em", marginTop: 10 }}>
                  Used only as a sanity check · actual rates are locked per payment.
                </div>
              </div>
            </aside>
          </div>
        )}
        {tab === "settle" && (
          <div className="layout">
            <div>
              <div className="card">
                <div className="card-head">
                  <h3>Debt, simplified</h3>
                  <span className="sub">Greedy min-transfer algorithm</span>
                </div>
                <SettlementGraph
                  members={members}
                  settlements={settlements}
                  balances={balances}
                  baseCurrency={data.trip.baseCurrency}
                />
              </div>
              <div style={{ marginTop: 18 }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 10 }}>
                  Transfer list
                </div>
                <SettlementList members={members} settlements={settlements} baseCurrency={data.trip.baseCurrency} />
                <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn ghost">Export CSV</button>
                  <button className="btn">Send WhatsApp summary</button>
                </div>
              </div>
            </div>
            <aside>
              <BalancesPanel members={members} balances={balances} baseCurrency={data.trip.baseCurrency} />
            </aside>
          </div>
        )}
        {tab === "people" && <PeopleView members={members} expenses={expenses} balances={balances} onRemove={handleRequestRemove} />}
        {tab === "activity" && <ActivityView expenses={expenses} members={membersWithGhost} />}
      </>
    );
  }

  function MobileContent() {
    return (
      <div className="mobile-frame">
        <div className="mobile-screen">
          <Masthead trip={data.trip} />
          <HeroSummary
            trip={data.trip}
            totalBase={totalBase}
            perHead={perHead}
            myBalance={myBalance}
            myMember={myMember}
            memberCount={members.length}
          />
          <Tabs
            value={tab}
            onChange={setTab}
            counts={{ expenses: expenses.length, settle: settlements.length, people: members.length }}
          />
          {tab === "expenses" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button className="btn accent" style={{ padding: "8px 12px", fontSize: 10 }} onClick={() => setAddingExpense(true)}>+ Add</button>
              </div>
              <ExpenseList
                expenses={expenses}
                members={membersWithGhost}
                onOpen={setOpenExpense}
                filters={{ category: filterCategory, member: activeMember }}
                baseCurrency={data.trip.baseCurrency}
              />
              <div style={{ marginTop: 14 }}>
                <BalancesPanel members={members} balances={balances} baseCurrency={data.trip.baseCurrency} />
              </div>
            </>
          )}
          {tab === "settle" && (
            <>
              <div className="card">
                <div className="card-head"><h3 style={{ fontSize: 18 }}>Settle up</h3></div>
                <SettlementList members={members} settlements={settlements} baseCurrency={data.trip.baseCurrency} />
              </div>
            </>
          )}
          {tab === "people" && <PeopleView members={members} expenses={expenses} balances={balances} onRemove={handleRequestRemove} />}
          {tab === "activity" && <ActivityView expenses={expenses} members={membersWithGhost} />}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="view-switcher">
        <button className={view === "desktop" ? "on" : ""} onClick={() => setView("desktop")}>Desktop</button>
        <button className={view === "mobile" ? "on" : ""} onClick={() => setView("mobile")}>Mobile</button>
        <button className={view === "both" ? "on" : ""} onClick={() => setView("both")}>Both</button>
      </div>

      {view === "desktop" && (
        <div className="app-shell" data-screen-label="Desktop · Dashboard">
          <DesktopContent />
        </div>
      )}
      {view === "mobile" && (
        <div data-screen-label="Mobile · Dashboard" style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", justifyContent: "center" }}>
          <MobileContent />
        </div>
      )}
      {view === "both" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 30, alignItems: "start", padding: "20px 30px" }}>
          <div data-screen-label="Desktop · Dashboard" style={{ minWidth: 0 }}>
            <DesktopContent />
          </div>
          <div data-screen-label="Mobile · Dashboard">
            <MobileContent />
          </div>
        </div>
      )}

      {openExpense && (
        <ExpenseDetail
          expense={openExpense}
          members={membersWithGhost}
          onClose={() => setOpenExpense(null)}
          baseCurrency={data.trip.baseCurrency}
        />
      )}
      {addingExpense && (
        <AddExpense
          members={members}
          trip={{ ...data.trip, marketRates: data.marketRates }}
          onClose={() => setAddingExpense(false)}
          onSave={handleAddExpense}
        />
      )}
      {addingMember && (
        <AddMemberModal
          existingCount={members.length}
          onClose={() => setAddingMember(false)}
          onAdd={handleAddMember}
        />
      )}
      {removingMember && (
        <RemoveMemberModal
          member={removingMember}
          expenses={expenses}
          balances={balances}
          onClose={() => setRemovingMember(null)}
          onConfirm={handleConfirmRemove}
        />
      )}

      <TweaksPanel
        open={tweaksOpen}
        theme={theme} setTheme={setTheme}
        density={density} setDensity={setDensity}
        currencyMode={currencyMode} setCurrencyMode={setCurrencyMode}
      />

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
