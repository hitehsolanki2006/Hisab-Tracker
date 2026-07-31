import * as SQLite from 'expo-sqlite';

// Open synchronous database reference
const db = SQLite.openDatabaseSync('hisab_tracker.db');

// Helper to generate unique ID
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Today's date string helper (YYYY-MM-DD)
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 1. Database Schema Initialization
export function initDb() {
  // Enable Write-Ahead Logging for faster writes and create tables
  db.execSync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0.0,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL, /* personal, given, heldUse, borrowRepay */
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      recipient TEXT,
      note TEXT,
      person TEXT,
      ref_id TEXT
    );

    CREATE TABLE IF NOT EXISTS held_funds (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      used REAL NOT NULL DEFAULT 0.0,
      account_id TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS borrowings (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      repaid REAL NOT NULL DEFAULT 0.0,
      account_id TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS held_returns (
      id TEXT PRIMARY KEY,
      held_id TEXT NOT NULL,
      expense_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      returned_amount REAL NOT NULL,
      principal_returned REAL NOT NULL,
      profit_loss REAL NOT NULL,
      friend_profit_share REAL NOT NULL,
      keep_principal INTEGER NOT NULL,
      keep_profit INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      income_id TEXT
    );
  `);

  // Migration: Add income_id column to held_returns if it doesn't exist
  try {
    db.execSync('ALTER TABLE held_returns ADD COLUMN income_id TEXT;');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Insert default accounts if none exist
  const accountCount = db.getFirstSync('SELECT COUNT(*) as cnt FROM accounts');
  if (accountCount.cnt === 0) {
    db.runSync('INSERT INTO accounts (id, name, balance, type) VALUES (?, ?, ?, ?)', 'acc-saving', 'Saving', 0.0, 'saving');
    db.runSync('INSERT INTO accounts (id, name, balance, type) VALUES (?, ?, ?, ?)', 'acc-spending', 'Spending', 0.0, 'spending');
  }
}

// 2. Account Queries & Inserts
export function getAccounts() {
  return db.getAllSync('SELECT * FROM accounts');
}

export function addAccount(name, balance, type) {
  const id = uid();
  db.runSync(
    'INSERT INTO accounts (id, name, balance, type) VALUES (?, ?, ?, ?)',
    id,
    name.trim(),
    Number(balance) || 0.0,
    type
  );
  return id;
}

export function updateAccount(id, name, type) {
  db.runSync(
    'UPDATE accounts SET name = ?, type = ? WHERE id = ?',
    name.trim(),
    type,
    id
  );
}

// 3. Transactions Operations (With Automatic Account Balance Adjustment)

// Incomes
export function getIncomes() {
  return db.getAllSync('SELECT i.*, a.name as accountName FROM incomes i JOIN accounts a ON i.account_id = a.id');
}

export function addIncome(source, amount, accountId, date) {
  const id = uid();
  const amt = Number(amount) || 0;
  const d = date || todayStr();
  
  // Transaction: Insert income + update account balance
  db.runSync('INSERT INTO incomes (id, source, amount, account_id, date) VALUES (?, ?, ?, ?, ?)', id, source, amt, accountId, d);
  db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', amt, accountId);
  return id;
}

// Transfers
export function getTransfers() {
  return db.getAllSync('SELECT t.*, f.name as fromName, o.name as toName FROM transfers t JOIN accounts f ON t.from_id = f.id JOIN accounts o ON t.to_id = o.id');
}

export function addTransfer(fromId, toId, amount, date) {
  const id = uid();
  const amt = Number(amount) || 0;
  const d = date || todayStr();

  db.runSync('INSERT INTO transfers (id, from_id, to_id, amount, date) VALUES (?, ?, ?, ?, ?)', id, fromId, toId, amt, d);
  db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', amt, fromId);
  db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', amt, toId);
  return id;
}

// Expenses
export function getExpenses() {
  return db.getAllSync('SELECT e.*, a.name as accountName FROM expenses e JOIN accounts a ON e.account_id = a.id');
}

export function addExpense(category, accountId, amount, date, recipient, note, person, refId) {
  const id = uid();
  const amt = Number(amount) || 0;
  const d = date || todayStr();

  db.runSync(
    'INSERT INTO expenses (id, category, account_id, amount, date, recipient, note, person, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, category, accountId, amt, d, recipient || null, note || null, person || null, refId || null
  );
  
  // Subtract from the account balance
  db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', amt, accountId);

  // If this spent from held funds, update held_funds counters
  if (category === 'heldUse' && refId) {
    db.runSync('UPDATE held_funds SET used = used + ? WHERE id = ?', amt, refId);
  }

  // If this repaid debt, update borrowings counters
  if (category === 'borrowRepay' && refId) {
    db.runSync('UPDATE borrowings SET repaid = repaid + ? WHERE id = ?', amt, refId);
  }

  return id;
}

// Held Funds
export function getHeldFunds() {
  return db.getAllSync('SELECT h.*, a.name as accountName FROM held_funds h JOIN accounts a ON h.account_id = a.id');
}

export function addHeldFunds(person, amount, accountId, note, date) {
  const id = uid();
  const amt = Number(amount) || 0;
  const d = date || todayStr();

  db.runSync(
    'INSERT INTO held_funds (id, person, amount, used, account_id, note, date) VALUES (?, ?, ?, 0.0, ?, ?, ?)',
    id, person.trim(), amt, accountId, note || null, d
  );
  
  // Adding held money INCREASES physical balance
  db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', amt, accountId);
  return id;
}

// Borrowings
export function getBorrowings() {
  return db.getAllSync('SELECT b.*, a.name as accountName FROM borrowings b JOIN accounts a ON b.account_id = a.id');
}

export function addBorrowing(person, amount, accountId, note, date) {
  const id = uid();
  const amt = Number(amount) || 0;
  const d = date || todayStr();

  db.runSync(
    'INSERT INTO borrowings (id, person, amount, repaid, account_id, note, date) VALUES (?, ?, ?, 0.0, ?, ?, ?)',
    id, person.trim(), amt, accountId, note || null, d
  );
  
  // Borrowing money INCREASES physical balance
  db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', amt, accountId);
  return id;
}

// 4. Deleting transactions & reverting account balances
export function deleteTransaction(type, transactionId) {
  if (type === 'income') {
    const item = db.getFirstSync('SELECT * FROM incomes WHERE id = ?', transactionId);
    if (!item) return;
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', item.amount, item.account_id);
    db.runSync('DELETE FROM incomes WHERE id = ?', transactionId);
  } 
  
  else if (type === 'transfer') {
    const item = db.getFirstSync('SELECT * FROM transfers WHERE id = ?', transactionId);
    if (!item) return;
    db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', item.amount, item.from_id);
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', item.amount, item.to_id);
    db.runSync('DELETE FROM transfers WHERE id = ?', transactionId);
  } 
  
  else if (type === 'held_funds') {
    const item = db.getFirstSync('SELECT * FROM held_funds WHERE id = ?', transactionId);
    if (!item) return;
    // Reverse adding held funds (subtracts balance)
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', item.amount, item.account_id);
    // Also delete any sub-expenses associated with this ref_id
    const childExpenses = db.getAllSync('SELECT * FROM expenses WHERE ref_id = ?', transactionId);
    for (const exp of childExpenses) {
      db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', exp.amount, exp.account_id);
      db.runSync('DELETE FROM expenses WHERE id = ?', exp.id);
    }
    db.runSync('DELETE FROM held_funds WHERE id = ?', transactionId);
  } 
  
  else if (type === 'borrowings') {
    const item = db.getFirstSync('SELECT * FROM borrowings WHERE id = ?', transactionId);
    if (!item) return;
    // Reverse adding borrowings (subtracts balance)
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', item.amount, item.account_id);
    // Delete associated repayments
    const childExpenses = db.getAllSync('SELECT * FROM expenses WHERE ref_id = ?', transactionId);
    for (const exp of childExpenses) {
      db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', exp.amount, exp.account_id);
      db.runSync('DELETE FROM expenses WHERE id = ?', exp.id);
    }
    db.runSync('DELETE FROM borrowings WHERE id = ?', transactionId);
  } 
  
  else if (type === 'held_return') {
    const item = db.getFirstSync('SELECT * FROM held_returns WHERE id = ?', transactionId);
    if (!item) return;

    const princ = Number(item.principal_returned) || 0;
    const amt = Number(item.returned_amount) || 0;
    const fShare = Number(item.friend_profit_share) || 0;
    const kp = item.keep_principal === 1;
    const kpr = item.keep_profit === 1;

    // 1. Revert Account changes:
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', amt, item.account_id);
    if (!kp) {
      db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', princ, item.account_id);
    }
    if (!kpr && fShare > 0) {
      db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', fShare, item.account_id);
    }

    // 2. Revert Held Fund changes:
    db.runSync('UPDATE held_funds SET used = used + ? WHERE id = ?', princ, item.held_id);
    if (!kp) {
      db.runSync('UPDATE held_funds SET amount = amount + ? WHERE id = ?', princ, item.held_id);
    }
    if (kpr && fShare > 0) {
      db.runSync('UPDATE held_funds SET amount = amount - ? WHERE id = ?', fShare, item.held_id);
    }

    // 3. Revert personal income if logged
    if (item.income_id) {
      db.runSync('DELETE FROM incomes WHERE id = ?', item.income_id);
    }

    // 4. Delete record
    db.runSync('DELETE FROM held_returns WHERE id = ?', transactionId);
  }

  else {
    // This is an expense (personal, given, heldUse, or borrowRepay)
    const item = db.getFirstSync('SELECT * FROM expenses WHERE id = ?', transactionId);
    if (!item) return;
    
    // Reverse account balance reduction (add money back)
    db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', item.amount, item.account_id);
    
    // Reverse held funds counter
    if (item.category === 'heldUse' && item.ref_id) {
      db.runSync('UPDATE held_funds SET used = used - ? WHERE id = ?', item.amount, item.ref_id);
    }
    
    // Reverse borrowing counter
    if (item.category === 'borrowRepay' && item.ref_id) {
      db.runSync('UPDATE borrowings SET repaid = repaid - ? WHERE id = ?', item.amount, item.ref_id);
    }

    db.runSync('DELETE FROM expenses WHERE id = ?', transactionId);
  }
}

// Held Returns Queries
export function getHeldReturns() {
  return db.getAllSync('SELECT hr.*, a.name as accountName, h.person as person FROM held_returns hr JOIN accounts a ON hr.account_id = a.id JOIN held_funds h ON hr.held_id = h.id');
}

export function addHeldReturn(heldId, expenseId, accountId, returnedAmount, principalReturned, profitLoss, friendProfitShare, keepPrincipal, keepProfit, date, note) {
  const id = uid();
  const amt = Number(returnedAmount) || 0;
  const princ = Number(principalReturned) || 0;
  const pLoss = Number(profitLoss) || 0;
  const fShare = Number(friendProfitShare) || 0;
  const d = date || todayStr();

  const kp = keepPrincipal ? 1 : 0;
  const kpr = keepProfit ? 1 : 0;

  const myShare = pLoss - fShare;
  let incId = null;
  if (myShare > 0) {
    const personName = db.getFirstSync('SELECT person FROM held_funds WHERE id = ?', heldId)?.person || '';
    const sourceStr = `Profit Share (${personName})`;
    incId = addIncome(sourceStr, myShare, accountId, d);
  }

  // Insert refund record with income_id
  db.runSync(
    'INSERT INTO held_returns (id, held_id, expense_id, account_id, returned_amount, principal_returned, profit_loss, friend_profit_share, keep_principal, keep_profit, date, note, income_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, heldId, expenseId, accountId, amt, princ, pLoss, fShare, kp, kpr, d, note || null, incId
  );

  // 1. Account balance adjustment: Add returnedAmount to receiving account
  // If myShare was logged as income, that already added myShare to the balance.
  // So we only add the remaining amount: amt - myShare
  const balanceAddAmt = myShare > 0 ? (amt - myShare) : amt;
  db.runSync('UPDATE accounts SET balance = balance + ? WHERE id = ?', balanceAddAmt, accountId);

  // 2. Account balance adjustment: If principal was returned immediately, subtract from account
  if (!keepPrincipal) {
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', princ, accountId);
  }

  // 3. Account balance adjustment: If friend's profit share was returned immediately, subtract from account
  if (!keepProfit && fShare > 0) {
    db.runSync('UPDATE accounts SET balance = balance - ? WHERE id = ?', fShare, accountId);
  }

  // 4. Update held fund entry:
  // - Subtract principalReturned from used
  db.runSync('UPDATE held_funds SET used = used - ? WHERE id = ?', princ, heldId);

  // - Adjust held_funds amount if principal returned immediately
  if (!keepPrincipal) {
    db.runSync('UPDATE held_funds SET amount = amount - ? WHERE id = ?', princ, heldId);
  }

  // - Adjust held_funds amount if keeping profit share as held
  if (keepProfit && fShare > 0) {
    db.runSync('UPDATE held_funds SET amount = amount + ? WHERE id = ?', fShare, heldId);
  }

  return id;
}

// 5. Database Backup and Restore
export function exportDbToJson() {
  const accounts = db.getAllSync('SELECT * FROM accounts');
  const incomes = db.getAllSync('SELECT * FROM incomes');
  const transfers = db.getAllSync('SELECT * FROM transfers');
  const expenses = db.getAllSync('SELECT * FROM expenses');
  const held_funds = db.getAllSync('SELECT * FROM held_funds');
  const borrowings = db.getAllSync('SELECT * FROM borrowings');
  const held_returns = db.getAllSync('SELECT * FROM held_returns');

  return JSON.stringify({
    version: 'sqlite-hisab-v2',
    accounts,
    incomes,
    transfers,
    expenses,
    held_funds,
    borrowings,
    held_returns
  });
}

export function importJsonToDb(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || (data.version !== 'sqlite-hisab-v1' && data.version !== 'sqlite-hisab-v2')) {
    throw new Error('Invalid backup format');
  }

  // WIPE DB
  db.runSync('DELETE FROM accounts');
  db.runSync('DELETE FROM incomes');
  db.runSync('DELETE FROM transfers');
  db.runSync('DELETE FROM expenses');
  db.runSync('DELETE FROM held_funds');
  db.runSync('DELETE FROM borrowings');
  db.runSync('DELETE FROM held_returns');

  // RESTORE Accounts
  if (Array.isArray(data.accounts)) {
    for (const a of data.accounts) {
      db.runSync('INSERT INTO accounts (id, name, balance, type) VALUES (?, ?, ?, ?)', a.id, a.name, a.balance, a.type);
    }
  }

  // RESTORE Incomes
  if (Array.isArray(data.incomes)) {
    for (const i of data.incomes) {
      db.runSync('INSERT INTO incomes (id, source, amount, account_id, date) VALUES (?, ?, ?, ?, ?)', i.id, i.source, i.amount, i.account_id, i.date);
    }
  }

  // RESTORE Transfers
  if (Array.isArray(data.transfers)) {
    for (const t of data.transfers) {
      db.runSync('INSERT INTO transfers (id, from_id, to_id, amount, date) VALUES (?, ?, ?, ?, ?)', t.id, t.from_id, t.to_id, t.amount, t.date);
    }
  }

  // RESTORE Expenses
  if (Array.isArray(data.expenses)) {
    for (const e of data.expenses) {
      db.runSync(
        'INSERT INTO expenses (id, category, account_id, amount, date, recipient, note, person, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        e.id, e.category, e.account_id, e.amount, e.date, e.recipient, e.note, e.person, e.ref_id
      );
    }
  }

  // RESTORE Held Funds
  if (Array.isArray(data.held_funds)) {
    for (const h of data.held_funds) {
      db.runSync('INSERT INTO held_funds (id, person, amount, used, account_id, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)', h.id, h.person, h.amount, h.used, h.account_id, h.note, h.date);
    }
  }

  // RESTORE Borrowings
  if (Array.isArray(data.borrowings)) {
    for (const b of data.borrowings) {
      db.runSync('INSERT INTO borrowings (id, person, amount, repaid, account_id, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)', b.id, b.person, b.amount, b.repaid, b.account_id, b.note, b.date);
    }
  }

  // RESTORE Held Returns
  if (Array.isArray(data.held_returns)) {
    for (const r of data.held_returns) {
      db.runSync(
        'INSERT INTO held_returns (id, held_id, expense_id, account_id, returned_amount, principal_returned, profit_loss, friend_profit_share, keep_principal, keep_profit, date, note, income_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        r.id, r.held_id, r.expense_id, r.account_id, Number(r.returned_amount), Number(r.principal_returned), Number(r.profit_loss), Number(r.friend_profit_share), Number(r.keep_principal), Number(r.keep_profit), r.date, r.note, r.income_id || null
      );
    }
  }
}
