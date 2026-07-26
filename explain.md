# Hisab Tracker — Project Explanation

A single-file React app for tracking personal income, multiple bank accounts,
transfers, expenses, money held for others, and money borrowed from others.
Built to run as a Claude artifact today, and designed to be portable to a
real mobile/web app later with minimal changes.

---

## 1. High-level architecture

```
budget_tracker.jsx  (one file, ~700 lines)
│
├── State (single object, held in React useState)
│     accounts[], incomeEntries[], transfers[], expenses[],
│     heldFunds[], borrowings[]
│
├── Persistence layer
│     window.storage.get() / .set()  → currently Claude-artifact storage
│
├── Layout components
│     TabBtn, Card, ListRow, EmptyRow, AddBtn, ModalShell, SubmitBtn,
│     AccountSelect, TypeSelect
│
├── Screens (one per bottom tab)
│     Dashboard, IncomeTab, TransferTab, ExpensesTab, OweTab, HistoryTab
│
└── Modals (forms that write to state)
      AddAccountModal, EditAccountModal, AddIncomeModal, TransferModal,
      AddExpenseModal, AddHeldModal, AddBorrowModal
```

**Everything is one component tree.** There's no routing library, no
backend, no API calls. The "app" is just React state + a save/load call.
This keeps it easy to read top-to-bottom and easy to port.

### The core pattern: `update(fn)`

Every single action in the app — adding income, transferring money, editing
an account — goes through one function:

```js
const update = (fn) => {
  setState((prev) => {
    const next = fn(structuredClone(prev));   // clone so we never mutate old state directly
    persist(next);                             // save to storage
    return next;                                // update the UI
  });
};
```

Any modal calls it like this:

```js
update((s) => {
  const acc = s.accounts.find((a) => a.id === accountId);
  acc.balance += amount;
  s.incomeEntries.push({ id: uid(), amount, ... });
  return s;
});
```

If you ever want to add a new feature, this is the one pattern to copy:
clone state, mutate the clone, push/update the relevant array, return it.

---

## 2. Data model

This is the actual shape of everything the app remembers. Understanding
this is the key to understanding the whole app — every screen is just a
different view or filter over these six arrays.

```js
{
  accounts: [
    { id, name, balance, type }   // type: "saving" | "spending" | "other"
  ],
  incomeEntries: [
    { id, source, amount, accountId, accountName, date }
  ],
  transfers: [
    { id, fromId, toId, fromName, toName, amount, date }
  ],
  expenses: [
    {
      id, category, accountId, accountName, amount, date,
      // category-specific fields:
      recipient,   // only if category === "given"
      note,        // only if category === "personal"
      person,      // only if category === "heldUse" or "borrowRepay"
      refId,       // id of the heldFunds/borrowings entry this touched
    }
  ],
  heldFunds: [
    { id, person, amount, used, accountId, note, date }
  ],
  borrowings: [
    { id, person, amount, repaid, accountId, note, date }
  ],
}
```

**Why `expenses` is one array with a `category` field, instead of four
separate arrays:** every expense does the same underlying thing (money
leaves an account), it's just tagged differently. Keeping them together is
what makes the History tab's month/category filtering possible — it can
loop over one array instead of merging four.

**Derived numbers are never stored** — they're calculated every render:
- Held money still outstanding: `amount - used` per entry
- Debt still owed: `amount - repaid` per entry
- Net worth: `sum(all account balances) - total held remaining - total owed to others`

This last formula is the one subtle but important design decision in the
whole app: money sitting in your Spending account from a friend's held
funds, or from something you borrowed, inflates your account *balance* but
is **not actually yours**. Net worth subtracts both out, so the number on
your dashboard is your real financial position, not just "cash on hand."

---

## 3. Features, screen by screen

### Dashboard (Home)
- Net worth card (the formula above)
- List of every account, with balance and its Saving/Spending/Other tag
- Pencil icon on each account → rename or re-tag it
- "Add another bank / account" button
- Lifetime income total
- Total given to others
- "Held for others" card (only shows if non-zero)
- "You owe others" card (only shows if non-zero)

### Income
- Log a payment: source (Stipend / Government stipend / Other), amount, and
  which account it lands in
- To split one payment across two accounts, log it twice — deliberately
  simple rather than building a multi-way split UI for a rare case

### Transfer
- Move money between any two accounts (not just Saving ↔ Spending anymore —
  works for however many accounts you've added)

### Spend
Four expense types, chosen with two rows of toggle buttons:
1. **Personal** — your own spending, optional note
2. **Given** — money given to someone (parent, etc.), tracked by name
3. **Use held** — spend from money you're minding for someone else; you
   pick *whose* held funds, and it automatically increases that entry's
   `used` amount
4. **Repay debt** — pay back something you borrowed; picks a borrowing
   entry and increases its `repaid` amount

In both 3 and 4, the account balance drops (money physically left your
account) **and** the related held-funds/borrowing entry updates — one
action, two effects, which is what keeps the Owe tab accurate without you
maintaining it by hand.

### Owe (held funds + borrowing, side by side)
- **Held for others**: person, total handed to you, how much used, how
  much remains — remains is the amount you still need to hand back or
  spend on their behalf
- **Borrowed**: person, total borrowed, how much repaid, how much you
  still owe

### History
- Filter by month (auto-generated from your actual data) or "All time"
- Filter by transaction type (income, transfer, personal, given, held use,
  debt repayment)
- Income vs. Spent totals for the current filter
- Spending broken down by category
- Full transaction list, most recent first

---

## 4. Persistence — the one thing to change if you move this

Right now, saving/loading uses:

```js
await window.storage.get(STORAGE_KEY);
await window.storage.set(STORAGE_KEY, JSON.stringify(next));
```

`window.storage` **only exists inside a Claude.ai artifact.** It won't
exist if you paste this file into Expo, a plain Vite app, CodeSandbox, or
any other environment — those calls will just throw.

Everywhere else in the file is plain React and will work unchanged. You
only need to replace the two `window.storage` calls in the top-level
`BudgetTracker` component (in the `useEffect` load, and inside `persist`).
Swap targets depending on where you take it:

| Environment | Replace with |
|---|---|
| Expo / React Native | `expo-sqlite`, storing the same JSON blob or normalizing into real tables |
| Plain web app (Vite/CRA) | `localStorage.getItem` / `setItem` |
| Web app with a real backend | An API route that reads/writes to Postgres |

Because the whole app treats storage as "one JSON blob in, one JSON blob
out," the swap is small — you're not touching any of the UI or the
`update()` logic, just the two functions that talk to storage.

---

## 5. Design decisions worth knowing about (in case you extend it)

- **Numbers use a monospace font** (`IBM Plex Mono`) everywhere money is
  displayed, so digits align in columns — a small thing that makes a
  ledger feel like a ledger rather than a generic app.
- **Amber/dashed styling** is reserved for "held for others" — a visual
  signal that this money behaves differently from your own.
- **Red/pink dashed styling** is reserved for "borrowed" — money you owe,
  visually distinct from held funds so the two custody-style balances
  don't blur together.
- **`refId`** on expense entries links an expense back to the held-fund or
  borrowing entry it affected — useful if you later want a "show me every
  time I touched this friend's money" view; the data's already there, it's
  just not surfaced in the UI yet.
- **Accounts are a flat list, not hardcoded to two** — this was the change
  that made "add a third bank later" possible without breaking anything
  built before it, since Income/Transfer/Spend all just render whatever's
  in `state.accounts`.

---

## 6. If you keep extending this yourself

Good next additions, and roughly how much they'd touch:
- **Delete/undo a transaction** — needs a delete button on `ListRow` plus
  a reverse-the-effect branch in `update()` for each entry type (a bit
  fiddly, since you'd need to un-apply balance changes)
- **Export to CSV** — build the same `buildHistory()` array already used
  by the History tab, then join it into CSV text and trigger a download
- **Recurring income** (e.g. stipend arrives monthly) — a small reminder,
  not automation, since this app never talks to your real bank
- **Multi-way income split** — a small form change in `AddIncomeModal` if
  logging income twice ever becomes annoying