import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Font from "expo-font";

import * as Print from "expo-print";

// Import Local helpers & DB functions
import {
  initDb,
  getAccounts,
  addAccount,
  updateAccount,
  getIncomes,
  addIncome,
  getTransfers,
  addTransfer,
  getExpenses,
  addExpense,
  getHeldFunds,
  addHeldFunds,
  getBorrowings,
  addBorrowing,
  deleteTransaction,
  exportDbToJson,
  importJsonToDb,
  getHeldReturns,
  addHeldReturn,
} from "./database";
import { translations } from "./translations";

function getDefaultSources(lang) {
  if (lang === "hi") return ["वजीफा", "सरकारी वजीफा", "फ्रीलांस"];
  if (lang === "gu") return ["સ્ટાઇપેન્ડ", "સરકારી સ્ટાઇપેન્ડ", "ફ્રીલાન્સ"];
  return ["Stipend", "Gov Stipend", "Freelance"];
}

// Custom SVG Icons (bypassing Lucide React)
import {
  WalletIcon,
  PiggyBankIcon,
  TransferIcon,
  UsersIcon,
  LandmarkIcon,
  PlusIcon,
  XIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  AlertCircleIcon,
  OweIcon,
  HistoryIcon,
  PencilIcon,
  TrashIcon,
  GearIcon,
} from "./Icons";

// Local storage key for AsyncStorage configurations
const SETTINGS_KEY = "@hisab_tracker_settings_v3";

export default function App() {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [lang, setLang] = useState("en"); // en, hi, gu
  const [defaultSavingId, setDefaultSavingId] = useState("");
  const [defaultSpendingId, setDefaultSpendingId] = useState("");

  const [tab, setTab] = useState("dashboard"); // dashboard, income, transfer, spend, owe, history, settings
  const [modal, setModal] = useState(null); // { type: 'addAccount' | 'addIncome' | ... }
  
  // App data list state mirroring database tables
  const [accounts, setAccounts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [heldFunds, setHeldFunds] = useState([]);
  const [borrowings, setBorrowings] = useState([]);
  const [heldReturns, setHeldReturns] = useState([]);

  // Customizable Income Sources
  const [incomeSources, setIncomeSources] = useState(["Stipend", "Gov Stipend", "Freelance"]);

  // Global History Filter States (lifted so they can be set from Dashboard)
  const [historyFilterMode, setHistoryFilterMode] = useState("all"); // all, month, year, custom
  const [historyFilterMonth, setHistoryFilterMonth] = useState("all");
  const [historyFilterYear, setHistoryFilterYear] = useState("all");
  const [historyFilterStartDate, setHistoryFilterStartDate] = useState("");
  const [historyFilterEndDate, setHistoryFilterEndDate] = useState("");
  const [historyFilterType, setHistoryFilterType] = useState("all");

  // Load custom fonts from URL at runtime
  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          "Inter-Regular": "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf",
          "Inter-Medium": "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf",
          "Inter-Bold": "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYfZhrib2Bg-4.ttf",
          "IBM-Plex-Mono": "https://fonts.gstatic.com/s/ibmplexmono/v15/-F63FjtGzMvjXdnqd1GDy1q46klrfOM.ttf",
        });
        setFontsLoaded(true);
      } catch (e) {
        console.warn("Failed to load web fonts. Falling back to default system fonts.");
        setFontsLoaded(true); // fall back to system fonts rather than locking UI
      }
    })();
  }, []);

  // Initialize DB and load storage settings
  useEffect(() => {
    (async () => {
      try {
        initDb();
        
        // Load Settings from AsyncStorage
        const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.lang) {
            setLang(parsed.lang);
            if (parsed.incomeSources && Array.isArray(parsed.incomeSources)) {
              setIncomeSources(parsed.incomeSources);
            } else {
              setIncomeSources(getDefaultSources(parsed.lang));
            }
          } else {
            if (parsed.incomeSources && Array.isArray(parsed.incomeSources)) {
              setIncomeSources(parsed.incomeSources);
            } else {
              setIncomeSources(getDefaultSources("en"));
            }
          }
          if (parsed.defaultSavingId) setDefaultSavingId(parsed.defaultSavingId);
          if (parsed.defaultSpendingId) setDefaultSpendingId(parsed.defaultSpendingId);
        } else {
          setIncomeSources(getDefaultSources("en"));
        }
        
        refreshData();
      } catch (err) {
        console.error("Database initialization failed", err);
      } finally {
        setDbLoaded(true);
      }
    })();
  }, []);

  // Save Settings to AsyncStorage
  const saveSettings = async (nextLang, nextSavingId, nextSpendingId, nextSources) => {
    try {
      const obj = {
        lang: nextLang ?? lang,
        defaultSavingId: nextSavingId ?? defaultSavingId,
        defaultSpendingId: nextSpendingId ?? defaultSpendingId,
        incomeSources: nextSources ?? incomeSources,
      };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error("Failed to persist settings", e);
    }
  };

  // Helper to query all records from SQLite and sync state
  const refreshData = () => {
    const accList = getAccounts();
    setAccounts(accList);
    setIncomes(getIncomes());
    setTransfers(getTransfers());
    setExpenses(getExpenses());
    setHeldFunds(getHeldFunds());
    setBorrowings(getBorrowings());
    setHeldReturns(getHeldReturns());

    // Auto primary account logic if only 1 account exists
    if (accList.length === 1) {
      const singleId = accList[0].id;
      setDefaultSavingId(singleId);
      setDefaultSpendingId(singleId);
      saveSettings(lang, singleId, singleId);
    }
  };

  // Safe wrapper for string localization
  const t = useCallback((key) => {
    const dict = translations[lang] || translations["en"];
    return dict[key] || key;
  }, [lang]);

  // Derived financial calculation variables
  const heldRemaining = (h) => Number(h.amount) - Number(h.used);
  const borrowRemaining = (b) => Number(b.amount) - Number(b.repaid);

  const totalHeldRemaining = useMemo(() => heldFunds.reduce((s, h) => s + heldRemaining(h), 0), [heldFunds]);
  const totalOwedToOthers = useMemo(() => borrowings.reduce((s, b) => s + borrowRemaining(b), 0), [borrowings]);
  const totalGivenToOthers = useMemo(() => expenses.filter((e) => e.category === "given").reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const totalIncome = useMemo(() => incomes.reduce((s, e) => s + Number(e.amount), 0), [incomes]);
  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.balance), 0), [accounts]);
  const netWorth = useMemo(() => totalBalance - totalHeldRemaining - totalOwedToOthers, [totalBalance, totalHeldRemaining, totalOwedToOthers]);

  // Handle Log Deletion
  const handleDeleteTransaction = (type, id) => {
    Alert.alert(
      t("delete"),
      t("deleteWarning"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: () => {
            deleteTransaction(type, id);
            refreshData();
          },
        },
      ]
    );
  };

  // Backups: Export App Settings only
  const handleExportSettingsBackup = async () => {
    try {
      const obj = {
        version: "hisab-settings-v1",
        settings: {
          lang,
          defaultSavingId,
          defaultSpendingId,
          incomeSources,
        }
      };
      const fileUri = FileSystem.documentDirectory + "hisab_settings_backup.json";
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(obj), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: t("settingsBackupOnly"),
          mimeType: "application/json",
        });
      } else {
        Alert.alert("Sharing unavailable");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Settings Backup Export Failed", err.message);
    }
  };

  // Backups: Export Full Backup (Database + Settings)
  const handleExportFullBackup = async () => {
    try {
      const dbJsonStr = exportDbToJson();
      const parsed = JSON.parse(dbJsonStr);
      parsed.settings = {
        lang,
        defaultSavingId,
        defaultSpendingId,
        incomeSources,
      };

      const fileUri = FileSystem.documentDirectory + "hisab_full_backup.json";
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(parsed), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: t("fullBackup"),
          mimeType: "application/json",
        });
      } else {
        Alert.alert("Sharing unavailable");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Full Backup Export Failed", err.message);
    }
  };

  // Backups: Import and Restore via Document Picker (Auto-detect version/format)
  const handleImportBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const fileUri = res.assets[0].uri;

      // Read backup string
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const parsed = JSON.parse(fileContent);
      if (!parsed) throw new Error("Invalid file content");

      if (parsed.version === "hisab-settings-v1") {
        // Settings-only backup
        const s = parsed.settings;
        if (s) {
          if (s.lang) setLang(s.lang);
          if (s.defaultSavingId) setDefaultSavingId(s.defaultSavingId);
          if (s.defaultSpendingId) setDefaultSpendingId(s.defaultSpendingId);
          if (s.incomeSources) setIncomeSources(s.incomeSources);
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        }
        Alert.alert(t("backupRestore"), t("importSuccess"));
      } else if (parsed.version === "sqlite-hisab-v1") {
        // Database-only backup (old format)
        importJsonToDb(fileContent);
        refreshData();
        Alert.alert(t("backupRestore"), t("importSuccess"));
      } else if (parsed.version === "sqlite-hisab-v2") {
        // Full backup (database + settings)
        importJsonToDb(fileContent);
        if (parsed.settings) {
          const s = parsed.settings;
          if (s.lang) setLang(s.lang);
          if (s.defaultSavingId) setDefaultSavingId(s.defaultSavingId);
          if (s.defaultSpendingId) setDefaultSpendingId(s.defaultSpendingId);
          if (s.incomeSources) setIncomeSources(s.incomeSources);
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        }
        refreshData();
        Alert.alert(t("backupRestore"), t("importSuccess"));
      } else {
        throw new Error("Unsupported backup file version");
      }
    } catch (err) {
      console.error(err);
      Alert.alert(t("backupRestore"), t("importFailed"));
    }
  };

  if (!dbLoaded || !fontsLoaded) {
    return (
      <View style={[styles.mainContainer, styles.loaderContainer]}>
        <ActivityIndicator size="large" color="#4FD1AE" />
        <Text style={styles.loaderText}>{t("loading")}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1620" />
      
      {/* App Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>{t("appTitle")}</Text>
          <Text style={styles.headerTitle}>{t("appTitle")}</Text>
        </View>
        <TouchableOpacity style={styles.settingsHeaderBtn} onPress={() => setTab("settings")}>
          <GearIcon size={20} color={tab === "settings" ? "#4FD1AE" : "#8CA0A8"} />
        </TouchableOpacity>
      </View>

      {/* Main Screen scroll area */}
      <ScrollView contentContainerStyle={styles.scrollArea}>
        {tab === "dashboard" && (
          <DashboardTab
            t={t}
            accounts={accounts}
            netWorth={netWorth}
            incomes={incomes}
            totalGivenToOthers={totalGivenToOthers}
            totalHeldRemaining={totalHeldRemaining}
            totalOwedToOthers={totalOwedToOthers}
            onIncomePress={(mode) => {
              setHistoryFilterType("income");
              if (mode === "monthly") {
                const currentMonth = new Date().toISOString().slice(0, 7);
                setHistoryFilterMode("month");
                setHistoryFilterMonth(currentMonth);
              } else {
                setHistoryFilterMode("all");
              }
              setTab("history");
            }}
          />
        )}
        
        {tab === "income" && (
          <IncomeTab
            t={t}
            incomes={incomes}
            onAdd={() => setModal({ type: "addIncome" })}
            onDelete={(id) => handleDeleteTransaction("income", id)}
          />
        )}

        {tab === "transfer" && (
          <TransferTab
            t={t}
            transfers={transfers}
            onAdd={() => setModal({ type: "transfer" })}
            onDelete={(id) => handleDeleteTransaction("transfer", id)}
          />
        )}

        {tab === "spend" && (
          <SpendTab
            t={t}
            expenses={expenses}
            onAdd={() => setModal({ type: "addExpense" })}
            onDelete={(id) => handleDeleteTransaction("expense", id)}
          />
        )}

        {tab === "owe" && (
          <OweTab
            t={t}
            heldFunds={heldFunds}
            borrowings={borrowings}
            expenses={expenses}
            heldReturns={heldReturns}
            heldRemaining={heldRemaining}
            borrowRemaining={borrowRemaining}
            onAddHeld={() => setModal({ type: "addHeld" })}
            onAddBorrow={() => setModal({ type: "addBorrow" })}
            onDeleteHeld={(id) => handleDeleteTransaction("held_funds", id)}
            onDeleteBorrow={(id) => handleDeleteTransaction("borrowings", id)}
            onRecordReturn={(exp, heldEntry) => setModal({ type: "recordHeldReturn", expenseId: exp.id, expenseAmount: exp.amount, expensePerson: heldEntry.person, expenseNote: exp.note, heldId: heldEntry.id })}
            onDeleteReturn={(returnId) => handleDeleteTransaction("held_return", returnId)}
          />
        )}

        {tab === "history" && (
          <HistoryTab
            t={t}
            incomes={incomes}
            transfers={transfers}
            expenses={expenses}
            heldReturns={heldReturns}
            onDelete={handleDeleteTransaction}
            filterMode={historyFilterMode}
            setFilterMode={setHistoryFilterMode}
            filterMonth={historyFilterMonth}
            setFilterMonth={setHistoryFilterMonth}
            filterYear={historyFilterYear}
            setFilterYear={setHistoryFilterYear}
            filterStartDate={historyFilterStartDate}
            setFilterStartDate={setHistoryFilterStartDate}
            filterEndDate={historyFilterEndDate}
            setFilterEndDate={setHistoryFilterEndDate}
            filterType={historyFilterType}
            setFilterType={setHistoryFilterType}
          />
        )}

        {tab === "settings" && (
          <SettingsTab
            t={t}
            lang={lang}
            setLang={(v) => {
              setLang(v);
              saveSettings(v, defaultSavingId, defaultSpendingId);
            }}
            accounts={accounts}
            defaultSavingId={defaultSavingId}
            setDefaultSavingId={(v) => {
              setDefaultSavingId(v);
              saveSettings(lang, v, defaultSpendingId);
            }}
            defaultSpendingId={defaultSpendingId}
            setDefaultSpendingId={(v) => {
              setDefaultSpendingId(v);
              saveSettings(lang, defaultSavingId, v);
            }}
            incomeSources={incomeSources}
            onSaveSources={(newSources) => {
              setIncomeSources(newSources);
              saveSettings(lang, defaultSavingId, defaultSpendingId, newSources);
            }}
            onAddAccount={() => setModal({ type: "addAccount" })}
            onEditAccount={(id) => setModal({ type: "editAccount", id })}
            onExportSettings={handleExportSettingsBackup}
            onExportFull={handleExportFullBackup}
            onImport={handleImportBackup}
          />
        )}
      </ScrollView>

      {/* Persistent Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TabBtn icon={WalletIcon} label={t("home")} active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
        <TabBtn icon={TrendingUpIcon} label={t("income")} active={tab === "income"} onClick={() => setTab("income")} />
        <TabBtn icon={TransferIcon} label={t("transfer")} active={tab === "transfer"} onClick={() => setTab("transfer")} />
        <TabBtn icon={TrendingDownIcon} label={t("spend")} active={tab === "spend"} onClick={() => setTab("spend")} />
        <TabBtn icon={OweIcon} label={t("owe")} active={tab === "owe"} onClick={() => setTab("owe")} />
        <TabBtn icon={HistoryIcon} label={t("history")} active={tab === "history"} onClick={() => setTab("history")} />
      </View>

      {/* Modal Overlay Controller */}
      {modal && (
        <ModalRouter
          modal={modal}
          accounts={accounts}
          heldFunds={heldFunds}
          borrowings={borrowings}
          heldReturns={heldReturns}
          incomeSources={incomeSources}
          heldRemaining={heldRemaining}
          borrowRemaining={borrowRemaining}
          defaultSavingId={defaultSavingId}
          defaultSpendingId={defaultSpendingId}
          t={t}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            refreshData();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------- UI COMPONENTS ----------------

function TabBtn({ icon: Icon, label, active, onClick }) {
  return (
    <TouchableOpacity onPress={onClick} style={styles.tabBtn} activeOpacity={0.7}>
      <Icon size={18} color={active ? "#4FD1AE" : "#5F707A"} />
      <Text style={[styles.tabLabel, { color: active ? "#4FD1AE" : "#5F707A" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function IndianRupee(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function EmptyRow({ text }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

// Transaction Row with Delete Trigger
function ListRow({ title, sub, amount, positive, onDelete }) {
  return (
    <View style={styles.listRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listRowTitle}>{title}</Text>
        {sub && <Text style={styles.listRowSub}>{sub}</Text>}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={[styles.listRowAmount, { color: positive ? "#4FD1AE" : "#EAF2F0" }]}>
          {positive ? "+" : ""}{IndianRupee(amount)}
        </Text>
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.rowDeleteBtn} activeOpacity={0.7}>
            <TrashIcon size={14} color="#E8768A" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// 1. Dashboard Tab View
function DashboardTab({ t, accounts, netWorth, incomes, totalGivenToOthers, totalHeldRemaining, totalOwedToOthers, onIncomePress }) {
  const [viewMode, setViewMode] = useState("monthly"); // monthly or lifetime

  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthlyIncome = useMemo(() => {
    return incomes
      .filter((e) => e.date.slice(0, 7) === currentMonthStr)
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [incomes, currentMonthStr]);

  const totalIncome = useMemo(() => {
    return incomes.reduce((s, e) => s + Number(e.amount), 0);
  }, [incomes]);

  return (
    <View>
      <Card style={styles.netWorthCard}>
        <Text style={styles.labelAccent}>{t("netWorth")}</Text>
        <Text style={styles.netWorthText}>{IndianRupee(netWorth)}</Text>
      </Card>

      <Text style={styles.sectionLabel}>{t("accounts")}</Text>
      {accounts.map((a) => (
        <Card key={a.id} style={styles.accountRowCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PiggyBankIcon size={16} color="#8CA0A8" />
            <View>
              <Text style={styles.accountNameText}>{a.name}</Text>
              <Text style={styles.accountTypeText}>
                {a.type === "saving" ? t("savingType") : a.type === "spending" ? t("spendingType") : t("otherType")}
              </Text>
            </View>
          </View>
          <Text style={styles.accountBalanceText}>{IndianRupee(a.balance)}</Text>
        </Card>
      ))}

      {/* Income Card with Toggle & Tap Interaction */}
      <Card style={{ paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => onIncomePress(viewMode)} activeOpacity={0.7}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={styles.labelAccent}>
              {viewMode === "monthly" ? t("monthly") + " " + t("income") : t("lifetimeIncome")}
            </Text>
            
            {/* Horizontal mini-toggle chips */}
            <View style={{ flexDirection: "row", gap: 4, backgroundColor: "#101B27", padding: 2, borderRadius: 6, borderWidth: 1, borderColor: "#24313F" }}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setViewMode("monthly");
                }}
                style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }, viewMode === "monthly" && { backgroundColor: "#4FD1AE15" }]}
              >
                <Text style={[{ fontSize: 9, color: "#8CA0A8" }, viewMode === "monthly" && { color: "#4FD1AE", fontWeight: "bold" }]}>
                  {t("monthly")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setViewMode("lifetime");
                }}
                style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }, viewMode === "lifetime" && { backgroundColor: "#4FD1AE15" }]}
              >
                <Text style={[{ fontSize: 9, color: "#8CA0A8" }, viewMode === "lifetime" && { color: "#4FD1AE", fontWeight: "bold" }]}>
                  {t("allTime")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.metricText, { color: "#4FD1AE", fontSize: 22, fontWeight: "600" }]}>
            {IndianRupee(viewMode === "monthly" ? monthlyIncome : totalIncome)}
          </Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={styles.labelAccent}>{t("givenToOthers")}</Text>
        <Text style={styles.metricText}>{IndianRupee(totalGivenToOthers)}</Text>
      </Card>

      {totalHeldRemaining !== 0 && (
        <Card style={styles.heldCardDashed}>
          <Text style={[styles.labelAccent, { color: "#E8A34D" }]}>{t("notYoursHeld")}</Text>
          <Text style={[styles.metricText, { color: "#E8A34D" }]}>{IndianRupee(totalHeldRemaining)}</Text>
        </Card>
      )}

      {totalOwedToOthers !== 0 && (
        <Card style={styles.owedCardDashed}>
          <Text style={[styles.labelAccent, { color: "#E8768A" }]}>{t("youOweOthers")}</Text>
          <Text style={[styles.metricText, { color: "#E8768A" }]}>{IndianRupee(totalOwedToOthers)}</Text>
        </Card>
      )}
    </View>
  );
}

// 2. Income Tab View
function IncomeTab({ t, incomes, onAdd, onDelete }) {
  return (
    <View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
        <PlusIcon size={16} color="#0F1620" />
        <Text style={styles.addBtnText}>{t("addIncome")}</Text>
      </TouchableOpacity>

      <Card>
        <Text style={styles.sectionLabel}>{t("history")}</Text>
        {incomes.length === 0 && <EmptyRow text={t("noIncomeLogged")} />}
        {[...incomes].reverse().map((e) => (
          <ListRow
            key={e.id}
            title={`${e.source} → ${e.accountName}`}
            sub={e.date}
            amount={e.amount}
            positive
            onDelete={() => onDelete(e.id)}
          />
        ))}
      </Card>
    </View>
  );
}

// 3. Transfer Tab View
function TransferTab({ t, transfers, onAdd, onDelete }) {
  return (
    <View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
        <PlusIcon size={16} color="#0F1620" />
        <Text style={styles.addBtnText}>{t("moveMoney")}</Text>
      </TouchableOpacity>

      <Card>
        <Text style={styles.sectionLabel}>{t("history")}</Text>
        {transfers.length === 0 && <EmptyRow text={t("noTransfers")} />}
        {[...transfers].reverse().map((t) => (
          <ListRow
            key={t.id}
            title={`${t.fromName} → ${t.toName}`}
            sub={t.date}
            amount={t.amount}
            onDelete={() => onDelete(t.id)}
          />
        ))}
      </Card>
    </View>
  );
}

// 4. Spend Tab View
function SpendTab({ t, expenses, onAdd, onDelete }) {
  return (
    <View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
        <PlusIcon size={16} color="#0F1620" />
        <Text style={styles.addBtnText}>{t("logExpense")}</Text>
      </TouchableOpacity>

      <Card>
        <Text style={styles.sectionLabel}>{t("history")}</Text>
        {expenses.length === 0 && <EmptyRow text={t("noExpenses")} />}
        {[...expenses].reverse().map((e) => {
          let title = e.note || t("personalSpendMsg");
          if (e.category === "given") title = `${t("givenToMsg")} ${e.recipient}`;
          if (e.category === "heldUse") title = `${t("usedHeldMsgPrefix")} ${e.person}${t("usedHeldMsgSuffix")}`;
          if (e.category === "borrowRepay") title = `${t("repaidPrefix")} ${e.person}`;

          return (
            <ListRow
              key={e.id}
              title={title}
              sub={`${e.accountName} · ${e.date}`}
              amount={e.amount}
              onDelete={() => onDelete(e.id)}
            />
          );
        })}
      </Card>
    </View>
  );
}

// 5. Owe Tab View
function OweTab({ t, heldFunds, borrowings, expenses, heldReturns, heldRemaining, borrowRemaining, onAddHeld, onAddBorrow, onDeleteHeld, onDeleteBorrow, onRecordReturn, onDeleteReturn }) {
  return (
    <View>
      {/* Held Section */}
      <Card style={styles.heldCardDashed}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <LandmarkIcon size={14} color="#E8A34D" />
          <Text style={styles.heldHeaderTitle}>{t("heldForOthers")}</Text>
        </View>
        <Text style={styles.heldHeaderDesc}>{t("heldForOthersDesc")}</Text>
      </Card>
      
      <TouchableOpacity style={styles.addBtn} onPress={onAddHeld} activeOpacity={0.8}>
        <PlusIcon size={16} color="#0F1620" />
        <Text style={styles.addBtnText}>{t("addHeldFunds")}</Text>
      </TouchableOpacity>

      {heldFunds.length === 0 && <EmptyRow text={t("nothingHeldRightNow")} />}
      {[...heldFunds].reverse().map((h) => {
        const activeUses = expenses.filter(e => e.category === "heldUse" && e.ref_id === h.id);
        const fundReturns = heldReturns.filter(r => r.held_id === h.id);

        return (
          <Card key={h.id}>
            <View style={styles.oweRowHeader}>
              <Text style={styles.owePersonName}>{h.person}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={styles.oweDate}>{h.date}</Text>
                <TouchableOpacity onPress={() => onDeleteHeld(h.id)} activeOpacity={0.7}>
                  <TrashIcon size={13} color="#E8768A" />
                </TouchableOpacity>
              </View>
            </View>
            {h.note && <Text style={styles.oweNote}>{h.note}</Text>}
            <View style={styles.oweSplitMetrics}>
              <View>
                <Text style={styles.oweMetricLabel}>{t("heldAmount")}</Text>
                <Text style={styles.oweMetricVal}>{IndianRupee(h.amount)}</Text>
              </View>
              <View>
                <Text style={styles.oweMetricLabel}>{t("usedAmount")}</Text>
                <Text style={styles.oweMetricVal}>{IndianRupee(h.used)}</Text>
              </View>
              <View>
                <Text style={styles.oweMetricLabel}>{t("remainingAmount")}</Text>
                <Text style={[styles.oweMetricVal, { color: "#E8A34D" }]}>{IndianRupee(heldRemaining(h))}</Text>
              </View>
            </View>

            {/* List Active IPO Uses */}
            {activeUses.length > 0 && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: "#1B2733", paddingTop: 8 }}>
                <Text style={[styles.sectionLabel, { marginTop: 4, marginBottom: 4, fontSize: 10 }]}>
                  {t("activeApplications")}
                </Text>
                {activeUses.map((exp) => {
                  const returnRecord = fundReturns.find(r => r.expense_id === exp.id);
                  return (
                    <View key={exp.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, borderColor: "#1B2733" }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: "#EAF2F0", fontSize: 12 }}>
                          {exp.note ? exp.note : t("usedHeldFundsMsg")}
                        </Text>
                        <Text style={{ color: "#8CA0A8", fontSize: 9, fontFamily: "IBM-Plex-Mono" }}>
                          {exp.date} · {exp.accountName}
                        </Text>
                      </View>
                      
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ color: "#EAF2F0", fontSize: 12, fontFamily: "IBM-Plex-Mono", marginRight: 4 }}>
                          {IndianRupee(exp.amount)}
                        </Text>
                        
                        {returnRecord ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={{ backgroundColor: "#4FD1AE20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: "#4FD1AE40" }}>
                              <Text style={{ color: "#4FD1AE", fontSize: 9, fontWeight: "bold" }}>
                                {t("settled")}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => onDeleteReturn(returnRecord.id)} activeOpacity={0.7} style={styles.rowDeleteBtn}>
                              <TrashIcon size={10} color="#E8768A" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => onRecordReturn(exp, h)}
                            style={{ backgroundColor: "#E8A34D20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#E8A34D" }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: "#E8A34D", fontSize: 10, fontWeight: "bold" }}>
                              {t("recordSettlement")}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* List Settlements History */}
            {fundReturns.length > 0 && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: "#1B2733", paddingTop: 8 }}>
                <Text style={[styles.sectionLabel, { marginTop: 4, marginBottom: 4, fontSize: 10 }]}>
                  {t("settlementDetails")}
                </Text>
                {fundReturns.map((ret) => (
                  <View key={ret.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 0.5, borderColor: "#1C2835" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#8CA0A8", fontSize: 11 }}>
                        {ret.note || t("recordSettlement")}
                      </Text>
                      <Text style={{ color: "#5F707A", fontSize: 9 }}>
                        {ret.date} · {ret.accountName}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: "#4FD1AE", fontSize: 11, fontFamily: "IBM-Plex-Mono" }}>
                        +{IndianRupee(ret.returned_amount)}
                      </Text>
                      {ret.profit_loss !== 0 && (
                        <Text style={{ color: ret.profit_loss >= 0 ? "#4FD1AE" : "#E8768A", fontSize: 9, fontFamily: "IBM-Plex-Mono" }}>
                          {ret.profit_loss >= 0 ? "+" : ""}{IndianRupee(ret.profit_loss)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      })}

      {/* Borrowings Section */}
      <Card style={[styles.owedCardDashed, { marginTop: 24 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <OweIcon size={14} color="#E8768A" />
          <Text style={styles.borrowHeaderTitle}>{t("borrowedFromOthers")}</Text>
        </View>
        <Text style={styles.borrowHeaderDesc}>{t("borrowedDesc")}</Text>
      </Card>

      <TouchableOpacity style={styles.addBtn} onPress={onAddBorrow} activeOpacity={0.8}>
        <PlusIcon size={16} color="#0F1620" />
        <Text style={styles.addBtnText}>{t("addBorrowing")}</Text>
      </TouchableOpacity>

      {borrowings.length === 0 && <EmptyRow text={t("nothingBorrowed")} />}
      {[...borrowings].reverse().map((b) => (
        <Card key={b.id}>
          <View style={styles.oweRowHeader}>
            <Text style={styles.owePersonName}>{b.person}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={styles.oweDate}>{b.date}</Text>
              <TouchableOpacity onPress={() => onDeleteBorrow(b.id)} activeOpacity={0.7}>
                <TrashIcon size={13} color="#E8768A" />
              </TouchableOpacity>
            </View>
          </View>
          {b.note && <Text style={styles.oweNote}>{b.note}</Text>}
          <View style={styles.oweSplitMetrics}>
            <View>
              <Text style={styles.oweMetricLabel}>{t("borrowedAmount")}</Text>
              <Text style={styles.oweMetricVal}>{IndianRupee(b.amount)}</Text>
            </View>
            <View>
              <Text style={styles.oweMetricLabel}>{t("repaidAmount")}</Text>
              <Text style={styles.oweMetricVal}>{IndianRupee(b.repaid)}</Text>
            </View>
            <View>
              <Text style={styles.oweMetricLabel}>{t("stillOwe")}</Text>
              <Text style={[styles.oweMetricVal, { color: "#E8768A" }]}>{IndianRupee(borrowRemaining(b))}</Text>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

// 6. History Tab View (with dynamic SVG vector charts)
function HistoryTab({
  t,
  incomes,
  transfers,
  expenses,
  heldReturns,
  onDelete,
  filterMode,
  setFilterMode,
  filterMonth,
  setFilterMonth,
  filterYear,
  setFilterYear,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  filterType,
  setFilterType,
}) {
  const categoryLabels = useMemo(() => ({
    personal: t("personal"),
    given: t("given"),
    heldUse: t("useHeld"),
    borrowRepay: t("repayDebt"),
    income: t("income"),
    transfer: t("transfer"),
    held_return: t("recordSettlement"),
  }), [t]);

  // Merge SQLite tables into a unified chronologically sorted log
  const allLogs = useMemo(() => {
    const list = [];
    incomes.forEach((i) =>
      list.push({ id: i.id, date: i.date, category: "income", title: `${t("incomeLabel")}: ${i.source} → ${i.accountName}`, amount: i.amount, sign: 1 })
    );
    transfers.forEach((tr) =>
      list.push({ id: tr.id, date: tr.date, category: "transfer", title: `${t("transfer")}: ${tr.fromName} → ${tr.toName}`, amount: tr.amount, sign: 0 })
    );
    expenses.forEach((e) => {
      let labelText = e.note || t("personalSpendMsg");
      if (e.category === "given") labelText = `${t("givenToMsg")} ${e.recipient}`;
      if (e.category === "heldUse") labelText = `${t("usedHeldMsgPrefix")} ${e.person}${t("usedHeldMsgSuffix")}`;
      if (e.category === "borrowRepay") labelText = `${t("repaidPrefix")} ${e.person}`;
      list.push({ id: e.id, date: e.date, category: e.category, title: labelText, amount: e.amount, sign: -1 });
    });
    heldReturns.forEach((hr) =>
      list.push({ id: hr.id, date: hr.date, category: "held_return", title: `${t("recordSettlement")}: ${hr.person} → ${hr.accountName}`, amount: hr.returned_amount, sign: 1 })
    );
    // Sort descending
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [incomes, transfers, expenses, heldReturns, t]);

  // Extract unique months YYYY-MM
  const months = useMemo(() => {
    const set = new Set(allLogs.map((log) => log.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [allLogs]);

  // Extract unique years YYYY
  const years = useMemo(() => {
    const set = new Set(allLogs.map((log) => log.date.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [allLogs]);

  // Filter conditions based on active mode
  const filtered = useMemo(() => {
    return allLogs.filter((log) => {
      // 1. Period filter
      if (filterMode === "month" && filterMonth !== "all" && !log.date.startsWith(filterMonth)) return false;
      if (filterMode === "year" && filterYear !== "all" && !log.date.startsWith(filterYear)) return false;
      if (filterMode === "custom") {
        if (filterStartDate && log.date < filterStartDate) return false;
        if (filterEndDate && log.date > filterEndDate) return false;
      }
      
      // 2. Type filter
      if (filterType !== "all" && log.category !== filterType) return false;
      
      return true;
    });
  }, [allLogs, filterMode, filterMonth, filterYear, filterStartDate, filterEndDate, filterType]);

  const spentTotal = useMemo(() => filtered.filter((i) => i.sign === -1).reduce((s, i) => s + i.amount, 0), [filtered]);
  const incomeTotal = useMemo(() => filtered.filter((i) => i.sign === 1).reduce((s, i) => s + i.amount, 0), [filtered]);

  // Category breakdown for chart
  const categoriesBreakdown = useMemo(() => {
    const sums = {};
    filtered.filter((i) => i.sign === -1).forEach((item) => {
      sums[item.category] = (sums[item.category] || 0) + item.amount;
    });
    return Object.entries(sums).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const maxSpentInCategory = categoriesBreakdown.length > 0 ? categoriesBreakdown[0][1] : 1;

  // Document Export: CSV (Excel compatible)
  const handleExportCsv = async () => {
    try {
      let csvContent = "Date,Type,Title,Amount,Direction\n";
      filtered.forEach((log) => {
        const typeStr = categoryLabels[log.category] || log.category;
        const cleanTitle = (log.title || "").replace(/,/g, " ");
        const direction = log.sign === 1 ? "IN" : log.sign === -1 ? "OUT" : "TRANSFER";
        csvContent += `${log.date},${typeStr},${cleanTitle},${log.amount},${direction}\n`;
      });

      const fileUri = FileSystem.documentDirectory + `hisab_report_${new Date().toISOString().slice(0, 10)}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: t("exportCsv"),
          mimeType: "text/csv",
        });
      } else {
        Alert.alert("Sharing unavailable");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("CSV Export Failed", err.message);
    }
  };

  // Document Export: PDF Report via expo-print
  const handleExportPdf = async () => {
    try {
      let tableRows = "";
      filtered.forEach((log) => {
        const typeStr = categoryLabels[log.category] || log.category;
        const color = log.sign === 1 ? "#4FD1AE" : log.sign === -1 ? "#E8768A" : "#EAF2F0";
        const signStr = log.sign === 1 ? "+" : log.sign === -1 ? "-" : "";
        tableRows += `
          <tr style="border-bottom: 1px solid #1F2A38;">
            <td style="padding: 10px; font-family: monospace;">${log.date}</td>
            <td style="padding: 10px; font-weight: bold;">${typeStr}</td>
            <td style="padding: 10px; color: #8CA0A8;">${log.title}</td>
            <td style="padding: 10px; text-align: right; font-family: monospace; color: ${color}; font-weight: bold;">
              ${signStr}₹${log.amount.toFixed(2)}
            </td>
          </tr>
        `;
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${t("appTitle")} - Report</title>
          <style>
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              background-color: #0F1620;
              color: #EAF2F0;
              margin: 40px;
            }
            .header {
              border-bottom: 2px solid #4FD1AE;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              color: #4FD1AE;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .subtitle {
              color: #8CA0A8;
              font-size: 14px;
              margin-top: 5px;
            }
            .summary {
              display: flex;
              gap: 20px;
              margin-bottom: 30px;
            }
            .card {
              flex: 1;
              background-color: #141F2C;
              border: 1px solid #1F2A38;
              border-radius: 10px;
              padding: 15px;
            }
            .card-label {
              font-size: 11px;
              color: #8CA0A8;
              text-transform: uppercase;
            }
            .card-value {
              font-size: 20px;
              font-weight: bold;
              margin-top: 5px;
              font-family: monospace;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th {
              background-color: #141F2C;
              color: #4FD1AE;
              text-align: left;
              padding: 10px;
              font-weight: bold;
              border-bottom: 2px solid #1F2A38;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${t("appTitle")} - ${t("history")}</div>
            <div class="subtitle">Generated on ${new Date().toLocaleDateString()}</div>
          </div>
          
          <div class="summary">
            <div class="card">
              <div class="card-label">${t("incomeLabel")}</div>
              <div class="card-value" style="color: #4FD1AE;">₹${incomeTotal.toFixed(2)}</div>
            </div>
            <div class="card">
              <div class="card-label">${t("spentLabel")}</div>
              <div class="card-value" style="color: #E8768A;">₹${spentTotal.toFixed(2)}</div>
            </div>
            <div class="card">
              <div class="card-label">${t("netSavings")}</div>
              <div class="card-value" style="color: #EAF2F0;">₹${(incomeTotal - spentTotal).toFixed(2)}</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: t("exportPdf"),
          mimeType: "application/pdf",
        });
      } else {
        Alert.alert("Sharing unavailable");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("PDF Export Failed", err.message);
    }
  };

  return (
    <View>
      {/* 1. Document Export Section */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <TouchableOpacity onPress={handleExportPdf} style={[styles.addBtn, { flex: 1, marginTop: 0, backgroundColor: "#E8A34D" }]} activeOpacity={0.8}>
          <Text style={[styles.addBtnText, { color: "#0F1620" }]}>{t("exportPdf")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExportCsv} style={[styles.addBtn, { flex: 1, marginTop: 0 }]} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>{t("exportCsv")}</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Filtering Period Selector */}
      <View style={styles.historyFilterRow}>
        <Text style={styles.btrLabel}>{t("historyFilterMode")}</Text>
        <View style={styles.segControl}>
          {["all", "month", "year", "custom"].map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setFilterMode(mode)}
              style={[styles.segBtn, filterMode === mode && styles.segBtnActive]}
            >
              <Text style={[styles.segBtnText, filterMode === mode && styles.segBtnTextActive]}>
                {mode === "all" ? t("allTime") : mode === "month" ? t("monthly") : mode === "year" ? t("yearly") : t("customRange")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 3. Sub-period filters */}
      {filterMode === "month" && (
        <View style={{ marginTop: 10, backgroundColor: "#101B27", borderRadius: 10, borderWidth: 1, borderColor: "#24313F" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => setFilterMonth("all")} style={[styles.filterChip, filterMonth === "all" && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, filterMonth === "all" && styles.filterChipTextActive]}>{t("allTime")}</Text>
            </TouchableOpacity>
            {months.map((m) => (
              <TouchableOpacity key={m} onPress={() => setFilterMonth(m)} style={[styles.filterChip, filterMonth === m && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, filterMonth === m && styles.filterChipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {filterMode === "year" && (
        <View style={{ marginTop: 10, backgroundColor: "#101B27", borderRadius: 10, borderWidth: 1, borderColor: "#24313F" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => setFilterYear("all")} style={[styles.filterChip, filterYear === "all" && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, filterYear === "all" && styles.filterChipTextActive]}>{t("allTime")}</Text>
            </TouchableOpacity>
            {years.map((y) => (
              <TouchableOpacity key={y} onPress={() => setFilterYear(y)} style={[styles.filterChip, filterYear === y && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, filterYear === y && styles.filterChipTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {filterMode === "custom" && (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.btrLabel}>{t("startDate")}</Text>
            <TextInput
              style={styles.btrInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#52626C"
              value={filterStartDate}
              onChangeText={setFilterStartDate}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.btrLabel}>{t("endDate")}</Text>
            <TextInput
              style={styles.btrInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#52626C"
              value={filterEndDate}
              onChangeText={setFilterEndDate}
            />
          </View>
        </View>
      )}

      {/* 4. Filter Transaction Type */}
      <View style={{ height: 8 }} />
      <View style={{ backgroundColor: "#101B27", borderRadius: 10, borderWidth: 1, borderColor: "#24313F", padding: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity onPress={() => setFilterType("all")} style={[styles.filterChip, filterType === "all" && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filterType === "all" && styles.filterChipTextActive]}>{t("allTypes")}</Text>
          </TouchableOpacity>
          {Object.keys(categoryLabels).map((cat) => (
            <TouchableOpacity key={cat} onPress={() => setFilterType(cat)} style={[styles.filterChip, filterType === cat && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, filterType === cat && styles.filterChipTextActive]}>{categoryLabels[cat]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 5. Income/Spent Overview cards */}
      <View style={styles.historySumsRow}>
        <Card style={{ flex: 1, marginTop: 0 }}>
          <Text style={styles.labelAccent}>{t("incomeLabel")}</Text>
          <Text style={[styles.metricText, { color: "#4FD1AE", fontSize: 16 }]}>{IndianRupee(incomeTotal)}</Text>
        </Card>
        <Card style={{ flex: 1, marginTop: 0 }}>
          <Text style={styles.labelAccent}>{t("spentLabel")}</Text>
          <Text style={[styles.metricText, { fontSize: 16 }]}>{IndianRupee(spentTotal)}</Text>
        </Card>
      </View>

      {/* 6. Custom Vector Category Chart */}
      {categoriesBreakdown.length > 0 && (
        <Card>
          <Text style={styles.sectionLabel}>{t("byCategory")}</Text>
          <View style={{ marginTop: 8, gap: 12 }}>
            {categoriesBreakdown.map(([cat, amt]) => {
              const widthPct = (amt / maxSpentInCategory) * 100;
              return (
                <View key={cat}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: "#8CA0A8", fontSize: 12 }}>{categoryLabels[cat] || cat}</Text>
                    <Text style={{ color: "#EAF2F0", fontSize: 12, fontFamily: "IBM-Plex-Mono" }}>{IndianRupee(amt)}</Text>
                  </View>
                  <View style={styles.chartTrack}>
                    <View style={[styles.chartBar, { width: `${widthPct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* 7. Transaction Log list */}
      <Card>
        <Text style={styles.sectionLabel}>{t("transactions")}</Text>
        {filtered.length === 0 && <EmptyRow text={t("nothingHereYet")} />}
        {filtered.map((item) => (
          <ListRow
            key={item.id}
            title={item.title}
            sub={item.date}
            amount={item.amount}
            positive={item.sign === 1}
            onDelete={() => onDelete(item.category, item.id)}
          />
        ))}
      </Card>
    </View>
  );
}

// 7. Settings Tab View (Added management and configurations)
function SettingsTab({
  t,
  lang,
  setLang,
  accounts,
  defaultSavingId,
  setDefaultSavingId,
  defaultSpendingId,
  setDefaultSpendingId,
  incomeSources,
  onSaveSources,
  onAddAccount,
  onEditAccount,
  onExportSettings,
  onExportFull,
  onImport,
}) {
  return (
    <View>
      {/* 1. Language Toggle */}
      <Card>
        <Text style={styles.sectionLabel}>{t("language")}</Text>
        <View style={styles.languageSelectionRow}>
          <TouchableOpacity onPress={() => setLang("en")} style={[styles.langBtn, lang === "en" && styles.langBtnActive]}>
            <Text style={[styles.langBtnText, lang === "en" && styles.langBtnTextActive]}>English</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLang("hi")} style={[styles.langBtn, lang === "hi" && styles.langBtnActive]}>
            <Text style={[styles.langBtnText, lang === "hi" && styles.langBtnTextActive]}>हिंदी</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLang("gu")} style={[styles.langBtn, lang === "gu" && styles.langBtnActive]}>
            <Text style={[styles.langBtnText, lang === "gu" && styles.langBtnTextActive]}>ગુજરાતી</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* 2. Bank Accounts Management */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={styles.sectionLabel}>{t("manageAccounts")}</Text>
          <TouchableOpacity style={styles.addAccountSettingsBtn} onPress={onAddAccount} activeOpacity={0.7}>
            <PlusIcon size={14} color="#4FD1AE" />
            <Text style={styles.addAccountSettingsText}>{t("add")}</Text>
          </TouchableOpacity>
        </View>
        
        {accounts.length === 0 && <EmptyRow text={t("noAccountsYet")} />}
        {accounts.map((a) => (
          <View key={a.id} style={styles.settingsAccountRow}>
            <View>
              <Text style={styles.accountNameText}>{a.name}</Text>
              <Text style={styles.accountTypeText}>
                {a.type === "saving" ? t("savingType") : a.type === "spending" ? t("spendingType") : t("otherType")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={styles.accountBalanceText}>{IndianRupee(a.balance)}</Text>
              <TouchableOpacity onPress={() => onEditAccount(a.id)} style={styles.editPenBtn}>
                <PencilIcon size={13} color="#8CA0A8" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      {/* 2.5 Customizable Income Sources */}
      <Card>
        <Text style={styles.sectionLabel}>{t("customSourcesTitle")}</Text>
        <Text style={styles.taggingDescText}>{t("customSourcesDesc")}</Text>
        
        <View style={{ marginTop: 8 }}>
          <Text style={styles.btrLabel}>{t("sourceLabel1")}</Text>
          <TextInput
            style={styles.btrInput}
            value={incomeSources[0] || ""}
            onChangeText={(v) => {
              const next = [...incomeSources];
              next[0] = v;
              onSaveSources(next);
            }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.btrLabel}>{t("sourceLabel2")}</Text>
          <TextInput
            style={styles.btrInput}
            value={incomeSources[1] || ""}
            onChangeText={(v) => {
              const next = [...incomeSources];
              next[1] = v;
              onSaveSources(next);
            }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.btrLabel}>{t("sourceLabel3")}</Text>
          <TextInput
            style={styles.btrInput}
            value={incomeSources[2] || ""}
            onChangeText={(v) => {
              const next = [...incomeSources];
              next[2] = v;
              onSaveSources(next);
            }}
          />
        </View>
      </Card>

      {/* 3. Account Default Tagging */}
      {accounts.length > 0 && (
        <Card>
          <Text style={styles.sectionLabel}>{t("taggingHeading")}</Text>
          <Text style={styles.taggingDescText}>{t("taggingDesc")}</Text>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.btrLabel}>{t("defaultSavingAcc")}</Text>
            <View style={styles.pickerWrapper}>
              <ModalPicker
                options={[{ id: "", name: t("none") }, ...accounts]}
                value={defaultSavingId}
                onChange={setDefaultSavingId}
                t={t}
              />
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.btrLabel}>{t("defaultSpendingAcc")}</Text>
            <View style={styles.pickerWrapper}>
              <ModalPicker
                options={[{ id: "", name: t("none") }, ...accounts]}
                value={defaultSpendingId}
                onChange={setDefaultSpendingId}
                t={t}
              />
            </View>
          </View>
        </Card>
      )}

      {/* 4. Backup & Restore */}
      <Card>
        <Text style={styles.sectionLabel}>{t("backupRestore")}</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          <TouchableOpacity style={styles.settingsBackupBtn} onPress={onExportSettings} activeOpacity={0.8}>
            <Text style={styles.settingsBackupBtnText}>{t("settingsBackupOnly")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsBackupBtn} onPress={onExportFull} activeOpacity={0.8}>
            <Text style={styles.settingsBackupBtnText}>{t("fullBackup")}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.settingsBackupBtn, { backgroundColor: "#101B27", borderWidth: 1, borderColor: "#24313F" }]} onPress={onImport} activeOpacity={0.8}>
            <Text style={[styles.settingsBackupBtnText, { color: "#8CA0A8" }]}>{t("importBackup")}</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </View>
  );
}

// Custom Modal Picker to bypass standard HTML select tag issues
function ModalPicker({ options, value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.id === value) || options[0];

  return (
    <View>
      <TouchableOpacity style={styles.pickerButton} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={styles.pickerButtonText}>{selectedOption.name}</Text>
        <Text style={styles.pickerButtonArrow}>▼</Text>
      </TouchableOpacity>
      
      <Modal visible={open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>{t("selectAcc")}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <XIcon size={16} color="#8CA0A8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 250 }}>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.pickerItem, opt.id === value && styles.pickerItemActive]}
                  onPress={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, opt.id === value && styles.pickerItemTextActive]}>{opt.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----------------- MODALS ROUTER -----------------

function ModalRouter({ modal, accounts, heldFunds, borrowings, heldReturns, incomeSources, heldRemaining, borrowRemaining, defaultSavingId, defaultSpendingId, t, onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [type, setType] = useState("other");

  const [source, setSource] = useState("");
  const [customSourceText, setCustomSourceText] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(defaultSavingId || accounts[0]?.id || "");
  const [transferToId, setTransferToId] = useState(defaultSpendingId || accounts[1]?.id || accounts[0]?.id || "");

  // Expenses Tab variables
  const [category, setCategory] = useState("personal"); // personal, given, heldUse, borrowRepay
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [heldId, setHeldId] = useState(heldFunds[0]?.id || "");
  const [borrowId, setBorrowId] = useState(borrowings[0]?.id || "");
  
  // Owe tab adds
  const [person, setPerson] = useState("");

  // Held Return states
  const [principalReturned, setPrincipalReturned] = useState("");
  const [friendProfitShare, setFriendProfitShare] = useState("");
  const [keepPrincipal, setKeepPrincipal] = useState(true);
  const [keepProfit, setKeepProfit] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // Pre-load parameters on load
  useEffect(() => {
    if (modal.type === "editAccount") {
      const acc = accounts.find((a) => a.id === modal.id);
      if (acc) {
        setName(acc.name);
        setType(acc.type);
      }
    } else if (modal.type === "addIncome") {
      setSource(incomeSources && incomeSources[0] ? incomeSources[0] : t("stipend"));
      setAccountId(defaultSavingId || accounts[0]?.id || "");
    } else if (modal.type === "recordHeldReturn") {
      setAmount(String(modal.expenseAmount || ""));
      setPrincipalReturned(String(modal.expenseAmount || ""));
      setAccountId(defaultSavingId || accounts[0]?.id || "");
      setDate(new Date().toISOString().slice(0, 10));
      setNote(modal.expenseNote ? `${t("recordSettlement")} - ${modal.expenseNote}` : t("recordSettlement"));
      setKeepPrincipal(true);
      setKeepProfit(true);
    }
  }, [modal, accounts, incomeSources, defaultSavingId]);

  // Resolve pre-selection logic for expenses
  useEffect(() => {
    if (modal.type === "addExpense") {
      setAccountId(defaultSpendingId || accounts[0]?.id || "");
    }
  }, [modal, defaultSpendingId, accounts]);

  // Dynamically compute default friend profit share when amount or principal changes
  useEffect(() => {
    if (modal.type === "recordHeldReturn") {
      const p = (Number(amount) || 0) - (Number(principalReturned) || 0);
      setFriendProfitShare(p > 0 ? String(p) : "0");
    }
  }, [amount, principalReturned, modal.type]);

  const refundAmt = Number(amount) || 0;
  const princAmt = Number(principalReturned) || 0;

  const handleSubmit = () => {
    if (modal.type === "addAccount") {
      if (!name.trim()) return;
      addAccount(name, balance, type);
    } 
    
    else if (modal.type === "editAccount") {
      if (!name.trim()) return;
      updateAccount(modal.id, name, type);
    } 
    
    else if (modal.type === "addIncome") {
      const amt = Number(amount) || 0;
      if (amt <= 0 || !accountId) return;
      const finalSource = source === t("other") ? (customSourceText.trim() || t("other")) : source;
      addIncome(finalSource, amt, accountId);
    } 
    
    else if (modal.type === "transfer") {
      const amt = Number(amount) || 0;
      if (amt <= 0 || !accountId || !transferToId || accountId === transferToId) return;
      addTransfer(accountId, transferToId, amt);
    } 
    
    else if (modal.type === "addExpense") {
      const amt = Number(amount) || 0;
      if (amt <= 0 || !accountId) return;
      if (category === "heldUse" && !heldId) return;
      if (category === "borrowRepay" && !borrowId) return;

      const refId = category === "heldUse" ? heldId : category === "borrowRepay" ? borrowId : null;
      const refPerson = category === "heldUse" ? heldFunds.find(h => h.id === heldId)?.person : category === "borrowRepay" ? borrowings.find(b => b.id === borrowId)?.person : null;

      addExpense(category, accountId, amt, null, recipient, note, refPerson, refId);
    } 
    
    else if (modal.type === "addHeld") {
      const amt = Number(amount) || 0;
      if (!person.trim() || amt <= 0 || !accountId) return;
      addHeldFunds(person, amt, accountId, note);
    } 
    
    else if (modal.type === "addBorrow") {
      const amt = Number(amount) || 0;
      if (!person.trim() || amt <= 0 || !accountId) return;
      addBorrowing(person, amt, accountId, note);
    }

    else if (modal.type === "recordHeldReturn") {
      const amt = Number(amount) || 0;
      const princ = Number(principalReturned) || 0;
      const pLoss = amt - princ;
      const fShare = Number(friendProfitShare) || 0;
      if (amt <= 0 || !accountId || !modal.heldId || !modal.expenseId) return;

      addHeldReturn(
        modal.heldId,
        modal.expenseId,
        accountId,
        amt,
        princ,
        pLoss,
        fShare,
        keepPrincipal,
        keepProfit,
        date,
        note
      );
    }

    onSuccess();
  };

  const getTitle = () => {
    if (modal.type === "addAccount") return t("addBankAcc");
    if (modal.type === "editAccount") return t("editBankAcc");
    if (modal.type === "addIncome") return t("addIncome");
    if (modal.type === "transfer") return t("transfer");
    if (modal.type === "addExpense") return t("logExpense");
    if (modal.type === "addHeld") return t("addHeldFunds");
    if (modal.type === "addBorrow") return t("addBorrowing");
    if (modal.type === "recordHeldReturn") return t("recordSettlement");
    return "";
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          {/* Modal Header */}
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalHeaderTitle}>{getTitle()}</Text>
            <TouchableOpacity onPress={onClose}>
              <XIcon size={18} color="#8CA0A8" />
            </TouchableOpacity>
          </View>

          {/* Form Content Router */}
          <ScrollView style={{ maxHeight: 400 }}>
            {/* Account Form */}
            {(modal.type === "addAccount" || modal.type === "editAccount") && (
              <View>
                <Text style={styles.btrLabel}>{t("accountName")}</Text>
                <TextInput style={styles.btrInput} placeholder="HDFC, SBI, Cash" placeholderTextColor="#52626C" value={name} onChangeText={setName} />
                
                {modal.type === "addAccount" && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.btrLabel}>{t("startingBalance")}</Text>
                    <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={balance} onChangeText={setBalance} />
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("accountTypeLabel")}</Text>
                  <View style={styles.segControl}>
                    {["saving", "spending", "other"].map((tKey) => (
                      <TouchableOpacity
                        key={tKey}
                        onPress={() => setType(tKey)}
                        style={[styles.segBtn, type === tKey && styles.segBtnActive]}
                      >
                        <Text style={[styles.segBtnText, type === tKey && styles.segBtnTextActive]}>
                          {tKey === "saving" ? t("savingType") : tKey === "spending" ? t("spendingType") : t("otherType")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {modal.type === "editAccount" && (
                  <Text style={styles.formTipText}>{t("editAccountTip")}</Text>
                )}
              </View>
            )}

            {/* Income Form */}
            {modal.type === "addIncome" && (
              <View>
                <Text style={styles.btrLabel}>{t("source")}</Text>
                <View style={styles.segControl}>
                  {[...(incomeSources || []), t("other")].map((sKey) => (
                    <TouchableOpacity
                      key={sKey}
                      onPress={() => {
                        setSource(sKey);
                        if (sKey !== t("other")) {
                          setCustomSourceText("");
                        }
                      }}
                      style={[styles.segBtn, source === sKey && styles.segBtnActive]}
                    >
                      <Text style={[styles.segBtnText, source === sKey && styles.segBtnTextActive]} numberOfLines={1}>{sKey}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {source === t("other") && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.btrLabel}>{t("enterOtherSource")}</Text>
                    <TextInput
                      style={styles.btrInput}
                      placeholder={t("otherSourcePlaceholder")}
                      placeholderTextColor="#52626C"
                      value={customSourceText}
                      onChangeText={setCustomSourceText}
                    />
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("amountReceived")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("goesInto")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                  </View>
                </View>

                <Text style={styles.formTipText}>{t("splitTip")}</Text>
              </View>
            )}

            {/* Transfer Form */}
            {modal.type === "transfer" && (
              <View>
                <Text style={styles.btrLabel}>{t("from")}</Text>
                <View style={styles.pickerWrapper}>
                  <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("to")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={transferToId} onChange={setTransferToId} t={t} />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("amount")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>
              </View>
            )}

            {/* Expenses Form */}
            {modal.type === "addExpense" && (
              <View>
                <Text style={styles.btrLabel}>{t("expenseType")}</Text>
                <View style={styles.segControl}>
                  {["personal", "given"].map((k) => (
                    <TouchableOpacity key={k} onPress={() => setCategory(k)} style={[styles.segBtn, category === k && styles.segBtnActive]}>
                      <Text style={[styles.segBtnText, category === k && styles.segBtnTextActive]}>{t(k)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.segControl, { marginTop: 6 }]}>
                  {["heldUse", "borrowRepay"].map((k) => (
                    <TouchableOpacity key={k} onPress={() => setCategory(k)} style={[styles.segBtn, category === k && styles.segBtnActive]}>
                      <Text style={[styles.segBtnText, category === k && styles.segBtnTextActive]}>{t(k)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {category === "given" && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.btrLabel}>{t("givenTo")}</Text>
                    <TextInput style={styles.btrInput} placeholder="e.g. Parents" placeholderTextColor="#52626C" value={recipient} onChangeText={setRecipient} />
                  </View>
                )}

                {category === "heldUse" && (
                  heldFunds.length === 0 ? (
                    <Text style={styles.formWarningText}>No held funds yet. Add some in the Owe tab first.</Text>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.btrLabel}>{t("whoseHeld")}</Text>
                      <View style={styles.pickerWrapper}>
                        <ModalPicker
                          options={heldFunds.map(h => ({ id: h.id, name: `${h.person} — ${IndianRupee(heldRemaining(h))} left` }))}
                          value={heldId}
                          onChange={setHeldId}
                          t={t}
                        />
                      </View>
                    </View>
                  )
                )}

                {category === "borrowRepay" && (
                  borrowings.length === 0 ? (
                    <Text style={styles.formWarningText}>No debts logged yet. Add some in the Owe tab first.</Text>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.btrLabel}>{t("whichDebt")}</Text>
                      <View style={styles.pickerWrapper}>
                        <ModalPicker
                          options={borrowings.map(b => ({ id: b.id, name: `${b.person} — ${IndianRupee(borrowRemaining(b))} owed` }))}
                          value={borrowId}
                          onChange={setBorrowId}
                          t={t}
                        />
                      </View>
                    </View>
                  )
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("paidFrom")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("amount")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("noteOpt")}</Text>
                  <TextInput
                    style={styles.btrInput}
                    placeholder={category === "heldUse" ? "e.g., Hyundai IPO, Zomato IPO" : "Coffee, grocery, etc."}
                    placeholderTextColor="#52626C"
                    value={note}
                    onChangeText={setNote}
                  />
                </View>
              </View>
            )}

            {/* Add Held Form */}
            {modal.type === "addHeld" && (
              <View>
                <Text style={styles.btrLabel}>{t("whoseMoney")}</Text>
                <TextInput style={styles.btrInput} placeholder="Friend's name" placeholderTextColor="#52626C" value={person} onChangeText={setPerson} />

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("amountGivenToYou")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("sittingAccount")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("noteOpt")}</Text>
                  <TextInput style={styles.btrInput} placeholder="For IPO application, etc." placeholderTextColor="#52626C" value={note} onChangeText={setNote} />
                </View>
              </View>
            )}

            {/* Add Borrow Form */}
            {modal.type === "addBorrow" && (
              <View>
                <Text style={styles.btrLabel}>{t("whoBorrowedFrom")}</Text>
                <TextInput style={styles.btrInput} placeholder="Lender's name" placeholderTextColor="#52626C" value={person} onChangeText={setPerson} />

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("amountBorrowed")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("accountItWentInto")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("noteOpt")}</Text>
                  <TextInput style={styles.btrInput} placeholder="Emergency fund, etc." placeholderTextColor="#52626C" value={note} onChangeText={setNote} />
                </View>
              </View>
            )}

            {/* Record Held Return Modal Form */}
            {modal.type === "recordHeldReturn" && (
              <View>
                <Text style={styles.owePersonName}>{t("settlementDetails")}</Text>
                <Text style={[styles.oweNote, { marginBottom: 12 }]}>
                  {t("heldForOthers")}: {modal.expensePerson} · {t("amount")}: {IndianRupee(modal.expenseAmount)}
                </Text>

                <View>
                  <Text style={styles.btrLabel}>{t("refundAmount")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={amount} onChangeText={setAmount} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("principalAmount")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={principalReturned} onChangeText={setPrincipalReturned} />
                </View>

                <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.btrLabel}>{t("profitLoss")}</Text>
                  <Text style={[styles.accountBalanceText, { color: (refundAmt - princAmt) >= 0 ? "#4FD1AE" : "#E8768A" }]}>
                    {IndianRupee(refundAmt - princAmt)}
                  </Text>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("friendProfitShare")}</Text>
                  <TextInput style={styles.btrInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#52626C" value={friendProfitShare} onChangeText={setFriendProfitShare} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("goesInto")}</Text>
                  <View style={styles.pickerWrapper}>
                    <ModalPicker options={accounts} value={accountId} onChange={setAccountId} t={t} />
                  </View>
                </View>

                <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.btrLabel, { width: "65%" }]}>{t("keepPrincipal")}</Text>
                  <TouchableOpacity
                    onPress={() => setKeepPrincipal(!keepPrincipal)}
                    style={[styles.segBtn, { flex: 0, width: 80 }, keepPrincipal && styles.segBtnActive]}
                  >
                    <Text style={[styles.segBtnText, keepPrincipal && styles.segBtnTextActive]}>
                      {keepPrincipal ? t("save") : t("cancel")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {Number(friendProfitShare) > 0 && (
                  <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.btrLabel, { width: "65%" }]}>{t("keepProfit")}</Text>
                    <TouchableOpacity
                      onPress={() => setKeepProfit(!keepProfit)}
                      style={[styles.segBtn, { flex: 0, width: 80 }, keepProfit && styles.segBtnActive]}
                    >
                      <Text style={[styles.segBtnText, keepProfit && styles.segBtnTextActive]}>
                        {keepProfit ? t("save") : t("cancel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("startDate")}</Text>
                  <TextInput style={styles.btrInput} placeholder="YYYY-MM-DD" placeholderTextColor="#52626C" value={date} onChangeText={setDate} />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.btrLabel}>{t("noteOpt")}</Text>
                  <TextInput style={styles.btrInput} placeholder="e.g. IPO returned" placeholderTextColor="#52626C" value={note} onChangeText={setNote} />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Submit Trigger */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
            <Text style={styles.submitBtnText}>{t("save")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ----------------- STYLING (DARK MATRIX THEME) -----------------

const styles = StyleSheet.create({
  // Global Layouts
  mainContainer: {
    flex: 1,
    backgroundColor: "#0F1620",
  },
  loaderContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loaderText: {
    color: "#8CA0A8",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#1F2A38",
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#8CA0A8",
    textTransform: "uppercase",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  headerTitle: {
    fontSize: 22,
    color: "#EAF2F0",
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  settingsHeaderBtn: {
    padding: 8,
    backgroundColor: "#141F2C",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2A38",
  },
  scrollArea: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 100, // headroom above bottom bar
  },

  // Navigation
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#1F2A38",
    backgroundColor: "#121C29",
    paddingBottom: Platform.OS === "ios" ? 22 : 12, // account for safe area
    paddingTop: 10,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },

  // Cards
  card: {
    backgroundColor: "#141F2C",
    borderWidth: 1,
    borderColor: "#1F2A38",
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
  },
  netWorthCard: {
    marginTop: 18,
    backgroundColor: "#16283A", // gradient-like solid shift
    borderColor: "#1E354D",
  },
  netWorthText: {
    fontSize: 28,
    color: "#4FD1AE",
    fontFamily: "IBM-Plex-Mono",
    marginTop: 4,
    fontWeight: "600",
  },
  metricText: {
    fontSize: 16,
    color: "#EAF2F0",
    fontFamily: "IBM-Plex-Mono",
    marginTop: 4,
  },
  labelAccent: {
    fontSize: 11,
    color: "#8CA0A8",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  sectionLabel: {
    fontSize: 12,
    color: "#8CA0A8",
    marginTop: 16,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 13,
    color: "#5F707A",
    paddingVertical: 18,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },

  // Account details
  accountRowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  accountNameText: {
    fontSize: 14,
    color: "#EAF2F0",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  accountTypeText: {
    fontSize: 10,
    color: "#5F707A",
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  accountBalanceText: {
    fontSize: 15,
    color: "#EAF2F0",
    fontFamily: "IBM-Plex-Mono",
    fontWeight: "600",
  },

  // Actions
  addBtn: {
    backgroundColor: "#4FD1AE",
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
  },
  addBtnText: {
    color: "#0F1620",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },

  // List Items
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#1B2733",
  },
  listRowTitle: {
    fontSize: 13,
    color: "#EAF2F0",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  listRowSub: {
    fontSize: 10,
    color: "#8CA0A8",
    marginTop: 2,
    fontFamily: "IBM-Plex-Mono",
  },
  listRowAmount: {
    fontSize: 13,
    fontFamily: "IBM-Plex-Mono",
  },
  rowDeleteBtn: {
    padding: 6,
    backgroundColor: "#201419",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3E1E25",
  },

  // Owe Metrics
  heldCardDashed: {
    borderStyle: "dashed",
    borderColor: "#E8A34D",
  },
  owedCardDashed: {
    borderStyle: "dashed",
    borderColor: "#E8768A",
  },
  heldHeaderTitle: {
    fontSize: 12,
    color: "#E8A34D",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  heldHeaderDesc: {
    fontSize: 11,
    color: "#8CA0A8",
    lineHeight: 15,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  borrowHeaderTitle: {
    fontSize: 12,
    color: "#E8768A",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  borrowHeaderDesc: {
    fontSize: 11,
    color: "#8CA0A8",
    lineHeight: 15,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  oweRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  owePersonName: {
    fontSize: 14,
    color: "#EAF2F0",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  oweDate: {
    fontSize: 10,
    color: "#8CA0A8",
    fontFamily: "IBM-Plex-Mono",
  },
  oweNote: {
    fontSize: 12,
    color: "#8CA0A8",
    marginTop: 3,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  oweSplitMetrics: {
    flexDirection: "row",
    gap: 20,
    marginTop: 10,
  },
  oweMetricLabel: {
    fontSize: 10,
    color: "#8CA0A8",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  oweMetricVal: {
    fontSize: 13,
    color: "#EAF2F0",
    fontFamily: "IBM-Plex-Mono",
    marginTop: 2,
  },

  // Modals framework
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(6,10,15,0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#141F2C",
    borderTopWidth: 1,
    borderColor: "#24313F",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalHeaderTitle: {
    fontSize: 16,
    color: "#EAF2F0",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  btrInput: {
    backgroundColor: "#101B27",
    borderWidth: 1,
    borderColor: "#24313F",
    color: "#EAF2F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "IBM-Plex-Mono",
  },
  btrLabel: {
    fontSize: 12,
    color: "#8CA0A8",
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  segControl: {
    flexDirection: "row",
    gap: 6,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#24313F",
    backgroundColor: "#101B27",
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: "#4FD1AE15",
    borderColor: "#4FD1AE",
  },
  segBtnText: {
    fontSize: 12,
    color: "#8CA0A8",
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  segBtnTextActive: {
    color: "#4FD1AE",
  },
  formTipText: {
    fontSize: 11,
    color: "#8CA0A8",
    marginTop: 8,
    lineHeight: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  formWarningText: {
    fontSize: 12,
    color: "#E8768A",
    marginTop: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  submitBtn: {
    backgroundColor: "#4FD1AE",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: {
    color: "#0F1620",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },

  // Custom picker dropdowns
  pickerWrapper: {
    backgroundColor: "#101B27",
    borderWidth: 1,
    borderColor: "#24313F",
    borderRadius: 10,
  },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerButtonText: {
    color: "#EAF2F0",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  pickerButtonArrow: {
    color: "#8CA0A8",
    fontSize: 10,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#1F2A38",
  },
  pickerItemActive: {
    backgroundColor: "#4FD1AE10",
  },
  pickerItemText: {
    color: "#8CA0A8",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  pickerItemTextActive: {
    color: "#4FD1AE",
  },

  // Settings screen styles
  languageSelectionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#24313F",
    backgroundColor: "#101B27",
    alignItems: "center",
  },
  langBtnActive: {
    borderColor: "#4FD1AE",
    backgroundColor: "#4FD1AE15",
  },
  langBtnText: {
    color: "#8CA0A8",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Medium",
  },
  langBtnTextActive: {
    color: "#4FD1AE",
  },
  addAccountSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#1D322F",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#274F47",
  },
  addAccountSettingsText: {
    color: "#4FD1AE",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },
  settingsAccountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#1F2A38",
  },
  editPenBtn: {
    padding: 6,
    backgroundColor: "#1C2735",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2B3C50",
  },
  taggingDescText: {
    fontSize: 11,
    color: "#8CA0A8",
    lineHeight: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
    marginBottom: 8,
  },
  settingsBackupBtn: {
    backgroundColor: "#4FD1AE",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  settingsBackupBtnText: {
    color: "#0F1620",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Bold",
  },

  // History Charts vectors
  historyFilterRow: {
    marginTop: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#141F2C",
    borderWidth: 1,
    borderColor: "#1F2A38",
  },
  filterChipActive: {
    backgroundColor: "#4FD1AE",
    borderColor: "#4FD1AE",
  },
  filterChipText: {
    color: "#8CA0A8",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter-Regular",
  },
  filterChipTextActive: {
    color: "#0F1620",
    fontWeight: "600",
  },
  historySumsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  chartTrack: {
    height: 6,
    backgroundColor: "#1A2533",
    borderRadius: 3,
    marginTop: 4,
    overflow: "hidden",
  },
  chartBar: {
    height: "100%",
    backgroundColor: "#4FD1AE",
    borderRadius: 3,
  },
});
