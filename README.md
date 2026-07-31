# Hisab Tracker 📱📊 (Pocket-Logger)

Hisab Tracker (Pocket-Logger) is a localized, offline-first personal finance ledger application built using React Native and Expo. It helps you track multiple bank accounts, personal expenses, income sources, internal account transfers, and complex liabilities like borrowing money or holding funds for others.

The application uses **SQLite** (via `expo-sqlite`) for secure, local, and synchronous database persistence, allowing you to manage your finances completely offline without needing any cloud storage or APIs.

---

## 🌟 Key Features

- **🌐 Multi-lingual Support**: Full localization in **English (en)**, **Hindi (hi)**, and **Gujarati (gu)**.
- **🏦 Multi-Account Management**: Create and track saving, spending, or custom bank accounts with accurate individual balances.
- **💸 Smart Income Logging**: Log incoming funds with custom sources (e.g., Stipend, Government Stipend, Other) and instantly route them to default or custom accounts.
- **🔄 Internal Transfers**: Seamlessly move money between accounts to keep balances aligned.
- **📉 Comprehensive Expense Tracking**: Log expenses under four distinct categories:
  1. **Personal**: Everyday personal spending (with notes).
  2. **Given**: Money given to others (e.g., family, friends).
  3. **Use Held**: Spend directly out of money you are holding for someone else (automatically updates liabilities).
  4. **Repay Debt**: Pay back money you previously borrowed (automatically reduces outstanding debt).
- **🤝 Owe Tracker (Double-Sided Ledger)**:
  - **Held Funds**: Meticulously tracks cash given to you by others to hold (minding). Displays the total, used amount, and remaining balance.
  - **Borrowed Funds**: Tracks cash you borrowed from others, displaying the total, repaid amount, and outstanding debt.
- **📉 Real Net Worth Calculation**: Calculates your true net worth by subtracting held funds and borrowed debts from your actual physical bank balances:
  $$\text{Net Worth} = \sum(\text{Account Balances}) - \text{Total Held Outstanding} - \text{Total Owed to Others}$$
- **📅 Filterable History**: Filter history by month or category type, with automatic summaries showing Total Income vs. Total Spent, plus visual categorization of personal spending.
- **⚙️ Preferences & Tagging**: Set default accounts for income and expenses for faster entry.
- **💾 Backup & Restore**: Export the complete SQLite database as a JSON string to share/backup, and restore it at any time.

---

## 📁 Project Structure

```
Pocket-Logger/
├── .github/
│   └── workflows/
│       └── android-build.yml  # GitHub Actions workflow for building Android APKs
├── assets/                    # Images, icons, and splash screens
├── App.js                     # Root screen layouts, state, tabs, forms, and UI styling
├── database.js                # SQLite table definitions, CRUD operations, transactions, and backup/restore
├── Icons.js                   # Custom SVG icons for tab/action navigation
├── translations.js            # Localization dictionaries (English, Hindi, Gujarati)
├── app.json                   # Expo configuration metadata (name, slug, icons, packages)
├── package.json               # Node dependencies and Expo script configurations
└── explain.md                 # Original architecture details and design decisions
```

---

## 💾 Database Schema

The database runs locally using `expo-sqlite`. Here is the schema defined in [database.js](file:///d:/My%20projects/Pocket-Logger/database.js):

### 1. `accounts`
Stores bank/cash account records.
- `id` (TEXT, PRIMARY KEY): Unique identifier.
- `name` (TEXT): Name of the account.
- `balance` (REAL): Current ledger balance.
- `type` (TEXT): Type (`saving` | `spending` | `other`).

### 2. `incomes`
Tracks income transactions.
- `id` (TEXT, PRIMARY KEY)
- `source` (TEXT): Source description (e.g., stipend, government, other).
- `amount` (REAL): Received amount.
- `account_id` (TEXT): Foreign key referencing `accounts.id`.
- `date` (TEXT): ISO date string (`YYYY-MM-DD`).

### 3. `transfers`
Tracks internal transfers between accounts.
- `id` (TEXT, PRIMARY KEY)
- `from_id` (TEXT): Origin account ID.
- `to_id` (TEXT): Destination account ID.
- `amount` (REAL)
- `date` (TEXT)

### 4. `expenses`
Consolidated table of outgoing transactions.
- `id` (TEXT, PRIMARY KEY)
- `category` (TEXT): Category (`personal` | `given` | `heldUse` | `borrowRepay`).
- `account_id` (TEXT): Origin account ID.
- `amount` (REAL)
- `date` (TEXT)
- `recipient` (TEXT, NULLABLE): For `given` category.
- `note` (TEXT, NULLABLE): For `personal` category.
- `person` (TEXT, NULLABLE): Name of person for `heldUse` or `borrowRepay`.
- `ref_id` (TEXT, NULLABLE): Reference ID referencing `held_funds.id` or `borrowings.id`.

### 5. `held_funds`
Tracks funds held on behalf of others.
- `id` (TEXT, PRIMARY KEY)
- `person` (TEXT): Name of the depositor.
- `amount` (REAL): Initial amount received.
- `used` (REAL): Amount spent or returned.
- `account_id` (TEXT): Account where funds are physically stored.
- `note` (TEXT, NULLABLE)
- `date` (TEXT)

### 6. `borrowings`
Tracks money borrowed from others.
- `id` (TEXT, PRIMARY KEY)
- `person` (TEXT): Name of lender.
- `amount` (REAL): Initial borrowed amount.
- `repaid` (REAL): Repaid amount.
- `account_id` (TEXT): Account where funds were received.
- `note` (TEXT, NULLABLE)
- `date` (TEXT)

---

## 🛠️ Getting Started

### 📋 Prerequisites

To run this app locally, ensure you have:
- [Node.js](https://nodejs.org/) installed (v18+ recommended)
- [Expo Go](https://expo.dev/client) app installed on your physical mobile device, or an emulator set up.

### 🚀 Running the App Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hitehsolanki2006/Hisab-Tracker.git
   cd Hisab-Tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Expo server:**
   ```bash
   npx expo start
   ```

4. **Run the App:**
   - Scan the QR code displayed in the terminal with your **Expo Go** app (Android) or default Camera app (iOS).
   - Press `a` to run on an Android emulator or `i` to run on an iOS simulator.

---

## 🤖 CI/CD Build Pipeline

This repository includes a Github Actions workflow located at [.github/workflows/android-build.yml](file:///d:/My%20projects/Pocket-Logger/.github/workflows/android-build.yml). 

Whenever you push to the repository, it automatically:
1. Sets up Node, Java 17, and the Android SDK.
2. Resolves project dependencies.
3. Prebuilds the native Android project via `npx expo prebuild --platform android`.
4. Compiles the native codebase and generates a **Release APK** (`assembleRelease`).
5. Uploads the build artifact and releases it directly to the repository's GitHub Releases page under the `latest` tag for immediate download.

---

## 🎨 Design Theme & UI System

- **Colors**: Designed with a sleek, high-contrast dark theme (`#0F1620` background) for comfort and visual efficiency.
- **Typography**: Uses custom font families, with **IBM Plex Mono** reserved for monetary values to align columns neatly.
- **Visual Indicators**: 
  - 🔸 **Amber/Dashed Borders**: Represent "Held Funds" (reminding you it isn't your money).
  - 🔴 **Red/Pink Dashed Borders**: Represent "Borrowed Funds" (reminding you of outstanding liabilities).
