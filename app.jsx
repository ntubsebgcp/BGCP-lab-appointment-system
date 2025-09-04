
// Using global React & ReactDOM (loaded via CDN)
const { useEffect, useMemo, useState } = React;

// --- Utility helpers -------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

// time string HH:mm to minutes from midnight
const t2m = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const m2t = (m) => {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const roundTo = (minutes, step = 15) => Math.round(minutes / step) * step;
const clampToRange = (start, end, min = 8 * 60, max = 20 * 60) => [Math.max(min, start), Math.min(max, end)];

// Overlap: [a1,a2) & [b1,b2)
const isOverlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// LocalStorage helpers
const load = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// --- Accounts (demo, local-only) ------------------------------------------
const ADMIN_EMAILS = new Set(["renyi0128@gmail.com", "yshiau@g.ntu.edu.tw"].map((s) => s.toLowerCase()));
const USERS_KEY = "lab_users_v1";
const SESSION_KEY = "lab_session_v1";

// very simple non-cryptographic hash (demo only; replace with server auth in prod)
function weakHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function seedAdmins() {
  const users = load(USERS_KEY, []);
  const emails = new Set(users.map((u) => u.email.toLowerCase()));
  let changed = false;
  for (const e of ADMIN_EMAILS) {
    if (!emails.has(e)) {
      users.push({ id: uid(), email: e, name: e.split("@")[0], hash: weakHash("admin"), isAdmin: true });
      changed = true;
    }
  }
  if (changed) save(USERS_KEY, users);
  return users;
}

function getUsers() { return load(USERS_KEY, seedAdmins()); }
function setUsers(arr) { save(USERS_KEY, arr); }
function getSession() { return load(SESSION_KEY, null); }
function setSession(sess) { save(SESSION_KEY, sess); }

function findUserByEmail(email) {
  const users = getUsers();
  return users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase()) || null;
}

function canDeleteReservation(currentUser, ownerEmail) {
  const ce = currentUser?.email?.toLowerCase() || "";
  const oe = (ownerEmail || "").toLowerCase();
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true;
  return ce && oe && ce === oe;
}

// ICS export for a single reservation
function exportICS(res, instrument) {
  const dtStart = `${res.date.replace(/-/g, "")}T${res.start.replace(":", "")}00`;
  const dtEnd = `${res.date.replace(/-/g, "")}T${res.end.replace(":", "")}00`;
  const uidStr = `${res.id}@lab-booking";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lab Booking//EN",
    "BEGIN:VEVENT",
    `UID:${uidStr}`,
    `DTSTAMP:${dtStart}Z`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(res.title || `${instrument?.name || "儀器"} 預約`)}`,
    `DESCRIPTION:${escapeICS(`使用者: ${res.user}\nEmail: ${res.email || ""}\n用途: ${res.notes || ""}`)}`,
    `LOCATION:${escapeICS(instrument?.location || "實驗室")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${instrument?.name || "instrument"}-${res.date}-${res.start}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeICS(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// CSV export (all reservations)
function exportCSV(reservations, instruments) {
  const header = [
    "id",
    "instrument",
    "date",
    "start",
    "end",
    "user",
    "email",
    "title",
    "notes",
    "createdAt",
  ];
  const byId = Object.fromEntries(instruments.map((i) => [i.id, i]));
  const rows = reservations.map((r) => [
    r.id,
    byId[r.instrumentId]?.name || "",
    r.date,
    r.start,
    r.end,
    r.user,
    r.email || "",
    r.title || "",
    (r.notes || "").replaceAll(/\n|\r/g, " "),
    r.createdAt,
  ]);
  const csv = [header, ...rows]
    .map((arr) => arr.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lab-bookings-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// JSON backup
function exportJSON(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lab-booking-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Main App --------------------------------------------------------------
function BookingApp() {
  const [instruments, setInstruments] = useState(() =>
    load("lab_instruments_v1", [
      { id: uid(), name: "GC", location: "漁科所406", color: "#a78bfa", maxMinutes: 240 },
      { id: uid(), name: "溫室氣體測量儀 (Innova 1512)", location: "水工所307B", color: "#34d399", maxMinutes: 120 },
    ])
  );
  const [reservations, setReservations] = useState(() => load("lab_reservations_v1", []));
  const [adminPass, setAdminPass] = useState(() => load("lab_admin_pass_v1", ""));

  const [selectedInstr, setSelectedInstr] = useState(instruments[0]?.id || "");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [toast, setToast] = useState(null);
  const [quickCreate, setQuickCreate] = useState(null); // {date, start, end}
  const [view, setView] = useState("week"); // day|week|month

  // accounts & session
  const [currentUser, setCurrentUser] = useState(() => getSession());
  const [users, setUsersState] = useState(() => getUsers());
  useEffect(() => setUsers(users), [users]);
  useEffect(() => setSession(currentUser), [currentUser]);

  useEffect(() => save("lab_instruments_v1", instruments), [instruments]);
  useEffect(() => save("lab_reservations_v1", reservations), [reservations]);
  useEffect(() => save("lab_admin_pass_v1", adminPass), [adminPass]);

  // keep selected instrument valid
  useEffect(() => {
    if (!instruments.find((i) => i.id === selectedInstr)) {
      setSelectedInstr(instruments[0]?.id || "");
    }
  }, [instruments, selectedInstr]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
    [weekStart]
  );

  const filteredReservations = useMemo(() => {
    const res = reservations
      .filter((r) => (selectedInstr ? r.instrumentId === selectedInstr : false))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    return res;
  }, [reservations, selectedInstr]);

  const mapByDate = useMemo(() => {
    const map = {};
    for (const r of filteredReservations) {
      const key = `${r.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    for (const k in map) map[k].sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [filteredReservations]);

  const selectedInstrument = instruments.find((i) => i.id === selectedInstr) || null;

  // Handlers
  const addReservation = (r) => {
    if (!currentUser) return setToast({ type: "error", msg: "請先登入帳號" });
    // force owner info
    r.email = currentUser.email;
    r.user = r.user || currentUser.name || currentUser.email.split("@")[0];

    const instrument = instruments.find((i) => i.id === r.instrumentId);
    if (!instrument) return setToast({ type: "error", msg: "請先選擇儀器" });
    if (r.start >= r.end) return setToast({ type: "error", msg: "結束時間需晚於開始時間" });
    const dur = t2m(r.end) - t2m(r.start);
    if (instrument.maxMinutes && dur > instrument.maxMinutes) {
      return setToast({ type: "error", msg: `此儀器單次最長 ${Math.round(instrument.maxMinutes / 60)} 小時` });
    }
    const conflicts = reservations.filter(
      (x) => x.instrumentId === r.instrumentId && x.date === r.date && isOverlap(t2m(x.start), t2m(x.end), t2m(r.start), t2m(r.end))
    );
    if (conflicts.length > 0) return setToast({ type: "error", msg: "時間衝突，請改時段" });

    const newRes = { ...r, id: uid(), createdAt: new Date().toISOString() };
    setReservations((prev) => [...prev, newRes]);
    setToast({ type: "success", msg: "預約成功" });
  };

  const removeReservation = (id) => {
    const target = reservations.find((r) => r.id === id);
    if (!canDeleteReservation(currentUser, target?.email)) {
      setToast({ type: "error", msg: "只有建立者或管理員可刪除" });
      return;
    }
    setReservations((prev) => prev.filter((r) => r.id !== id));
    setToast({ type: "success", msg: "已刪除預約" });
  };

  const editReservation = (id, patch) => {
    const old = reservations.find((r) => r.id === id);
    if (!old) return false;
    if (!canDeleteReservation(currentUser, old.email)) {
      setToast({ type: "error", msg: "只有建立者或管理員可編輯" });
      return false;
    }
    const next = { ...old, ...patch };
    if (next.start >= next.end) return setToast({ type: "error", msg: "結束時間需晚於開始時間" });
    const instrument = instruments.find((i) => i.id === next.instrumentId);
    const dur = t2m(next.end) - t2m(next.start);
    if (instrument?.maxMinutes && dur > instrument.maxMinutes) {
      setToast({ type: "error", msg: `此儀器單次最長 ${Math.round(instrument.maxMinutes / 60)} 小時` });
      return false;
    }
    const conflicts = reservations.filter(
      (x) => x.id !== id && x.instrumentId === next.instrumentId && x.date === next.date && isOverlap(t2m(x.start), t2m(x.end), t2m(next.start), t2m(next.end))
    );
    if (conflicts.length > 0) return setToast({ type: "error", msg: "時間衝突，請改時段" });
    setReservations((prev) => prev.map((r) => (r.id === id ? next : r)));
    setToast({ type: "success", msg: "已更新預約" });
    return true;
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.instruments) && Array.isArray(data.reservations)) {
          setInstruments(data.instruments);
          setReservations(data.reservations);
          setToast({ type: "success", msg: "已匯入備份" });
        } else {
          setToast({ type: "error", msg: "格式不正確" });
        }
      } catch (e) {
        setToast({ type: "error", msg: "讀取失敗" });
      }
    };
    reader.readAsText(file);
  };

  // Quick create handler from calendar click
  const onCalendarClick = ({ dateISO, yRatio }) => {
    if (!selectedInstr) return setToast({ type: "error", msg: "請先選擇儀器" });
    const minutesFrom8 = Math.floor(12 * 60 * yRatio);
    let startM = roundTo(8 * 60 + minutesFrom8, 15);
    let endM = startM + 60; // default 1 hr
    ;[startM, endM] = clampToRange(startM, endM);
    const start = m2t(startM);
    const end = m2t(endM);
    setQuickCreate({ date: dateISO, start, end });
  };

  // account ops -------------------------------------------------------------
  const register = ({ name, email, password }) => {
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setToast({ type: "error", msg: "Email 格式不正確" });
    if (findUserByEmail(email)) return setToast({ type: "error", msg: "Email 已存在" });
    const u = { id: uid(), name: name.trim() || email.split("@")[0], email, hash: weakHash(password), isAdmin: ADMIN_EMAILS.has(email) };
    const next = [...users, u];
    setUsersState(next); setUsers(next);
    setToast({ type: "success", msg: "註冊成功，已自動登入" });
    setCurrentUser({ id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin });
  };
  const login = ({ email, password }) => {
    const u = findUserByEmail(email);
    if (!u || u.hash !== weakHash(password)) return setToast({ type: "error", msg: "帳號或密碼錯誤" });
    setCurrentUser({ id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin });
    setToast({ type: "success", msg: "登入成功" });
  };
  const logout = () => setCurrentUser(null);

  const resetPassword = (userId, newPass) => {
    if (!currentUser?.isAdmin) return;
    const next = users.map((u) => (u.id === userId ? { ...u, hash: weakHash(newPass) } : u));
    setUsersState(next); setUsers(next);
    setToast({ type: "success", msg: "已重設密碼" });
  };
  const removeUser = (userId) => {
    if (!currentUser?.isAdmin) return;
    const next = users.filter((u) => u.id !== userId);
    setUsersState(next); setUsers(next);
    setToast({ type: "success", msg: "已刪除帳號" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {!currentUser ? (
        <AuthGate onRegister={register} onLogin={login} />
      ) : (
        <>
          <Header
            weekStart={weekStart}
            onPrevWeek={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86400000))}
            onNextWeek={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86400000))}
            onToday={() => setWeekStart(getWeekStart(new Date()))}
            instruments={instruments}
            selectedInstr={selectedInstr}
            setSelectedInstr={setSelectedInstr}
            reservations={reservations}
            onExportCSV={() => exportCSV(reservations, instruments)}
            onExportJSON={() => exportJSON({ instruments, reservations })}
            onImportJSON={importJSON}
            view={view}
            setView={setView}
            currentUser={currentUser}
            onLogout={logout}
            users={users}
            isAdmin={currentUser.isAdmin}
            onResetPwd={resetPassword}
            onRemoveUser={removeUser}
          />

          <div className="max-w-7xl mx-auto px-4 pb-24 grid md:grid-cols-12 gap-4">
            <main className="md:col-start-2 md:col-span-10">
              {selectedInstr ? (
                view === "week" ? (
                  <WeekCalendar
                    weekDates={weekDates}
                    instrument={selectedInstrument}
                    reservations={filteredReservations}
                    mapByDate={mapByDate}
                    onCalendarClick={onCalendarClick}
                    onDelete={removeReservation}
                    onEdit={editReservation}
                    onExportICS={(r) => exportICS(r, selectedInstrument)}
                  />
                ) : view === "day" ? (
                  <DayCalendar
                    date={weekDates[0]}
                    instrument={selectedInstrument}
                    reservations={mapByDate[fmtDate(weekDates[0])] || []}
                    onCalendarClick={onCalendarClick}
                    onDelete={removeReservation}
                    onEdit={editReservation}
                    onExportICS={(r) => exportICS(r, selectedInstrument)}
                  />
                ) : (
                  <MonthCalendar
                    anchor={weekStart}
                    instrument={selectedInstrument}
                    reservations={filteredReservations}
                    onDayClick={(dateISO) => onCalendarClick({ dateISO, yRatio: (9 - 8) / 12 })}
                    onDelete={removeReservation}
                    onEdit={editReservation}
                    onExportICS={(r) => exportICS(r, selectedInstrument)}
                  />
                )
              ) : (
                <div className="bg-white border rounded-2xl p-12 text-center text-slate-500">
                  請先於上方選擇儀器後顯示行事曆。
                </div>
              )}
            </main>
          </div>

          {quickCreate && (
            <QuickCreate
              instrument={selectedInstrument}
              initial={quickCreate}
              onClose={() => setQuickCreate(null)}
              onSubmit={(payload) => {
                addReservation({ ...payload, instrumentId: selectedInstr });
                setQuickCreate(null);
              }}
            />
          )}

          {toast && (
            <Toast kind={toast.type} onClose={() => setToast(null)}>
              {toast.msg}
            </Toast>
          )}

          <Footer />
        </>
      )}
    </div>
  );
}

// --- Auth Gate -------------------------------------------------------------
function AuthGate({ onRegister, onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="bg-white border rounded-2xl w-full max-w-md p-6 space-y-4">
        <h1 className="text-xl font-bold">蕭友晉老師實驗室儀器預約系統</h1>
        <div className="flex gap-2">
          <button className={`px-3 py-2 border rounded-xl ${mode === 'login' ? 'bg-slate-900 text-white' : ''}`} onClick={() => setMode('login')}>登入</button>
          <button className={`px-3 py-2 border rounded-xl ${mode === 'register' ? 'bg-slate-900 text-white' : ''}`} onClick={() => setMode('register')}>註冊</button>
        </div>
        {mode === 'register' && (
          <div className="text-xs text-slate-600">註冊成功會自動登入。若 Email 屬於管理員名單，將自動成為管理員。</div>
        )}
        <div className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-xs text-slate-600">姓名</label>
              <input className="w-full px-3 py-2 border rounded-xl" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600">Email</label>
            <input className="w-full px-3 py-2 border rounded-xl" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} />
          </div>
          <div>
            <label className="text-xs text-slate-600">密碼</label>
            <input type="password" className="w-full px-3 py-2 border rounded-xl" value={form.password} onChange={(e)=>setForm({...form, password:e.target.value})} />
          </div>
        </div>
        <div className="flex gap-2">
          {mode === 'login' ? (
            <button className="px-3 py-2 border rounded-xl bg-slate-900 text-white" onClick={() => onLogin({ email: form.email, password: form.password })}>登入</button>
          ) : (
            <button className="px-3 py-2 border rounded-xl bg-slate-900 text-white" onClick={() => onRegister(form)}>註冊並登入</button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Header ----------------------------------------------------------------
function Header({
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
  instruments,
  selectedInstr,
  setSelectedInstr,
  reservations,
  onExportCSV,
  onExportJSON,
  onImportJSON,
  view,
  setView,
  currentUser,
  onLogout,
  users,
  isAdmin,
  onResetPwd,
  onRemoveUser,
}) {
  const end = new Date(weekStart.getTime() + 6 * 86400000);
  const label = `${fmtDate(weekStart)} ~ ${fmtDate(end)}`;

  return (
    <header className="bg-white border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">蕭友晉老師實驗室儀器預約系統</h1>
        <div className="ml-auto flex flex-wrap items中心 gap-2">
          <div className="flex items-center rounded-xl border overflow-hidden">
            <button onClick={onPrevWeek} className="px-3 py-1 hover:bg-slate-100">← 上週</button>
            <div className="px-3 py-1 text-sm bg-slate-50 border-x">{label}</div>
            <button onClick={onNextWeek} className="px-3 py-1 hover:bg-slate-100">下週 →</button>
            <button onClick={onToday} className="px-3 py-1 hover:bg-slate-100">本週</button>
          </div>

          {/* View switcher */}
          <select
            className="px-3 py-2 border rounded-xl bg-white"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="day">日視圖</option>
            <option value="week">週視圖</option>
            <option value="month">月視圖</option>
          </select>

          {/* Instrument picker */}
          <select
            className="px-3 py-2 border rounded-xl bg-white"
            value={selectedInstr}
            onChange={(e) => setSelectedInstr(e.target.value)}
          >
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>

          {/* Account menu */}
          <Menu label={currentUser?.name || currentUser?.email}>
            <div className="px-3 py-1 text-xs text-slate-500">{currentUser.email}</div>
            {isAdmin && <AdminPanel users={users} onResetPwd={onResetPwd} onRemoveUser={onRemoveUser} />}
            <Menu.Separator />
            <Menu.Item onClick={onLogout}>登出</Menu.Item>
          </Menu>

          <Menu label="匯出/備份">
            <Menu.Item onClick={onExportCSV}>匯出 CSV（所有預約）</Menu.Item>
            <Menu.Item onClick={onExportJSON}>匯出 JSON 備份</Menu.Item>
            <Menu.Separator />
            <Menu.File onFile={onImportJSON}>匯入 JSON 備份</Menu.File>
          </Menu>
        </div>
      </div>

      <div className="bg-slate-50 border-t text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4">
          <span>目前共有 {reservations.length} 筆預約</span>
          <span className="hidden sm:inline">（資料儲存在瀏覽器的 localStorage）</span>
        </div>
      </div>
    </header>
  );
}

function AdminPanel({ users, onResetPwd, onRemoveUser }) {
  return (
    <div className="px-2 py-1">
      <div className="text-xs font-semibold px-3 py-1">帳號管理（管理員）</div>
      <div className="max-h-60 overflow-auto">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-1 text-sm">
            <div className="flex-1">
              <div className="font-medium">{u.name} {u.isAdmin && <span className="text-xs text-emerald-600">(admin)</span>}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <button className="px-2 py-1 border rounded" onClick={() => onResetPwd(u.id, prompt("新密碼：") || "temp1234")}>重設密碼</button>
            <button className="px-2 py-1 border rounded text-red-600" onClick={() => onRemoveUser(u.id)}>刪除</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Quick Create Dialog ---------------------------------------------------
function QuickCreate({ instrument, initial, onClose, onSubmit }) {
  const [form, setForm] = useState({
    date: initial.date,
    start: initial.start,
    end: initial.end,
    user: "",
    email: "",
    title: `${instrument?.name || "儀器"} 使用`,
    notes: "",
  });

  return (
    <div className="fixed inset-0 bg黑/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">新增預約</h3>
          <button className="px-2 py-1 text-sm border rounded-xl" onClick={onClose}>關閉</button>
        </div>
        <div className="space-y-3 text-sm">
          <KV label="儀器" value={`${instrument?.name}（${instrument?.location || ""}）`} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-600">日期</label>
              <input type="date" className="w-full px-2 py-1 border rounded" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600">開始</label>
                <input type="time" className="w-full px-2 py-1 border rounded" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-600">結束</label>
                <input type="time" className="w-full px-2 py-1 border rounded" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-600">使用者</label>
              <input className="w-full px-2 py-1 border rounded" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-600">Email（會自動覆蓋為登入者）</label>
              <input disabled className="w-full px-2 py-1 border rounded opacity-60" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600">標題</label>
            <input className="w-full px-2 py-1 border rounded" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-600">備註</label>
            <textarea className="w-full px-2 py-1 border rounded" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              className="px-3 py-2 border rounded-xl bg-slate-900 text-white disabled:opacity-50"
              onClick={() => form.user.trim() && onSubmit({ ...form })}
              disabled={!form.user.trim()}
            >
              建立
            </button>
            <button className="px-3 py-2 border rounded-xl" onClick={onClose}>取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Week Calendar ---------------------------------------------------------
function WeekCalendar({
  weekDates,
  instrument,
  reservations,
  mapByDate,
  onCalendarClick,
  onDelete,
  onEdit,
  onExportICS,
}) {
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00~20:00 grid
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="bg-white border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-8 border-b bg-slate-50 text-sm">
        <div className="p-2 text-center text-slate-500">時間</div>
        {weekDates.map((d, idx) => (
          <div key={idx} className="p-2 text-center font-medium">
            <div className="text-slate-500 text-xs">{weekdays[new Date(d).getDay()]}</div>
            <div>{fmtDate(d)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-8 text-sm">
        {/* time col */}
        <div className="border-r bg-slate-50 select-none">
          {hours.map((h) => (
            <div key={h} className="h-16 border-t px-2 py-1 text-right text-slate-500">
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* day columns */}
        {weekDates.map((d, dayIdx) => (
          <DayColumn
            key={dayIdx}
            dateISO={fmtDate(d)}
            reservations={mapByDate[fmtDate(d)] || []}
            color={instrument?.color}
            onCalendarClick={onCalendarClick}
            onDelete={onDelete}
            onEdit={onEdit}
            onExportICS={onExportICS}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({ dateISO, reservations, color, onCalendarClick, onDelete, onEdit, onExportICS }) {
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i);
  const containerRef = React.useRef(null);

  const handleClick = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top; // px within column
    const total = rect.height; // equals 13 * 64
    let ratio = y / total;
    ratio = Math.max(0, Math.min(1, ratio));
    onCalendarClick({ dateISO, yRatio: ratio });
  };

  return (
    <div className="border-l relative cursor-crosshair" ref={containerRef} onClick={handleClick}>
      {hours.map((h, hi) => (
        <div key={hi} className="h-16 border-t"></div>
      ))}

      {/* bookings */}
      <div className="absolute inset-0">
        {reservations.map((r) => (
          <BookingBlock
            key={r.id}
            reservation={r}
            color={color}
            onDelete={onDelete}
            onEdit={onEdit}
            onExportICS={() => onExportICS(r)}
          />
        ))}
      </div>
    </div>
  );
}

function BookingBlock({ reservation, color, onDelete, onEdit, onExportICS }) {
  const top = ((t2m(reservation.start) - 8 * 60) / 60) * 64;
  const height = ((t2m(reservation.end) - t2m(reservation.start)) / 60) * 64;
  const style = { top: Math.max(0, top), height: Math.max(24, height), left: 4, right: 4, background: color };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...reservation });
  useEffect(() => setDraft({ ...reservation }), [reservation]);

  const canDel = canDeleteReservation(getSession(), reservation.email);

  return (
    <div className="absolute rounded-xl shadow-md overflow-hidden cursor-pointer ring-1 ring-black/10" style={style} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
      <div className="px-2 py-1 text-xs text-white/90">
        <div className="font-semibold truncate">{reservation.title || "已預約"}</div>
        <div>{reservation.start}–{reservation.end} ・ {reservation.user}</div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">預約詳細</h3>
              <button className="px-2 py-1 text-sm border rounded-xl" onClick={() => setOpen(false)}>關閉</button>
            </div>

            {!editing ? (
              <div className="space-y-2 text-sm">
                <KV label="日期" value={reservation.date} />
                <KV label="時間" value={`${reservation.start} ~ ${reservation.end}`} />
                <KV label="使用者" value={reservation.user} />
                {reservation.email && <KV label="Email" value={reservation.email} />}
                {reservation.title && <KV label="標題" value={reservation.title} />}
                {reservation.notes && <KV label="備註" value={reservation.notes} />}

                <div className="pt-2 flex flex-wrap gap-2">
                  <button className="px-3 py-2 border rounded-xl" onClick={onExportICS}>加到行事曆 (.ics)</button>
                  {canDel && <button className="px-3 py-2 border rounded-xl" onClick={() => setEditing(true)}>編輯</button>}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      className={`px-3 py-2 border rounded-xl ${canDel ? "text-red-600 hover:bg-red-50" : "text-slate-400 cursor-not-allowed"}`}
                      onClick={() => canDel && onDelete(reservation.id)}
                      disabled={!canDel}
                      title={canDel ? "刪除" : "只有建立者或管理員可刪除"}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600">日期</label>
                    <input type="date" className="w-full px-2 py-1 border rounded" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600">開始</label>
                    <input type="time" className="w-full px-2 py-1 border rounded" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">結束</label>
                    <input type="time" className="w-full px-2 py-1 border rounded" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600">使用者</label>
                    <input className="w-full px-2 py-1 border rounded" value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Email</label>
                    <input type="email" className="w-full px-2 py-1 border rounded" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">標題</label>
                  <input className="w-full px-2 py-1 border rounded" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600">備註</label>
                  <textarea className="w-full px-2 py-1 border rounded" rows={3} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button className="px-3 py-2 border rounded-xl bg-slate-900 text-white" onClick={() => onEdit(reservation.id, draft)}>儲存</button>
                  <button className="px-3 py-2 border rounded-xl" onClick={() => setEditing(false)}>取消</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-slate-500">{label}</div>
      <div className="col-span-2 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

// --- UI bits ---------------------------------------------------------------
function Toast({ children, onClose, kind = "info" }) {
  const bg = kind === "success" ? "bg-emerald-600" : kind === "error" ? "bg-rose-600" : "bg-slate-700";
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-xl shadow-lg ${bg}`}>
      {children}
    </div>
  );
}

function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onDoc = () => setOpen(false);
    if (open) document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);
  return (
    <div className="relative">
      <button className="px-3 py-2 border rounded-xl bg-white" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>{label}</button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border rounded-2xl shadow-lg p-1 z-50" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}
Menu.Item = function MenuItem({ children, onClick }) {
  return (
    <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50" onClick={onClick}>{children}</button>
  );
};
Menu.Separator = function Sep() {
  return <div className="my-1 border-t" />;
};
Menu.File = function MenuFile({ onFile, children }) {
  const inputRef = React.useRef(null);
  return (
    <div>
      <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50" onClick={() => inputRef.current?.click()}>{children}</button>
      <input ref={inputRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
};

function Footer() {
  return (
    <footer className="text-center text-xs text-slate-500 py-6">
      <div>© {new Date().getFullYear()} Lab Booking. Demo 版（本機儲存）。</div>
      <div>建議部署 Netlify / Vercel / GitHub Pages。正式使用請串接後端（如 Supabase / Firebase）與登入驗證。</div>
    </footer>
  );
}

// --- Date helpers ----------------------------------------------------------
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun
  const diff = (day === 0 ? -6 : 1) - day; // start from Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- Day Calendar (single column) -----------------------------------------
function DayCalendar({ date, instrument, reservations, onCalendarClick, onDelete, onEdit, onExportICS }) {
  const dateISO = fmtDate(date);
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i);
  const containerRef = React.useRef(null);
  const handleClick = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top; const total = rect.height; let ratio = Math.max(0, Math.min(1, y / total));
    onCalendarClick({ dateISO, yRatio: ratio });
  };
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
  return (
    <div className="bg-white border rounded-2xl overflow-hidden">
      <div className="border-b bg-slate-50 text-sm p-2 text-center font-medium">
        <div className="text-slate-500 text-xs">{weekday}</div>
        <div>{dateISO}</div>
      </div>
      <div className="grid grid-cols-7 text-sm">
        <div className="border-r bg-slate-50 select-none">
          {hours.map((h) => (
            <div key={h} className="h-16 border-t px-2 py-1 text-right text-slate-500">{String(h).padStart(2,"0")}:00</div>
          ))}
        </div>
        <div className="col-span-6 border-l relative cursor-crosshair" ref={containerRef} onClick={handleClick}>
          {hours.map((_, i) => (<div key={i} className="h-16 border-t"></div>))}
          <div className="absolute inset-0">
            {reservations.map((r)=> (
              <BookingBlock key={r.id} reservation={r} color={instrument?.color} onDelete={onDelete} onEdit={onEdit} onExportICS={()=>onExportICS(r)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Month Calendar (overview) --------------------------------------------
function MonthCalendar({ anchor, instrument, reservations, onDayClick, onDelete, onEdit, onExportICS }) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const firstWeekday = (start.getDay() + 6) % 7; // Monday as first
  const days = [];
  for (let i = 0; i < firstWeekday; i++) days.push(null);
  for (let d = 1; d <= end.getDate(); d++) days.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
  while (days.length % 7 !== 0) days.push(null);
  const byDate = {};
  for (const r of reservations) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }
  return (
    <div className="bg-white border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b text-center text-sm">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((w,i)=>(<div key={i} className="p-2">{w}</div>))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, idx) => {
          const dateISO = d ? fmtDate(d) : null;
          const items = dateISO ? (byDate[dateISO] || []) : [];
          return (
            <div key={idx} className={`min-h-[120px] border p-2 ${d?"hover:bg-slate-50 cursor-pointer":"bg-slate-100"}`} onClick={() => d && onDayClick(dateISO)}>
              <div className="text-xs text-slate-500 mb-1">{d ? d.getDate() : ""}</div>
              <div className="space-y-1">
                {items.slice(0,3).map((r)=> (
                  <div key={r.id} className="text-xs rounded px-2 py-1 text-white" style={{background: instrument?.color}}>
                    {r.start}-{r.end} {r.user}
                  </div>
                ))}
                {items.length>3 && <div className="text-[10px] text-slate-500">+{items.length-3} 更多…</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Dev tests (simple asserts) -------------------------------------------
(function runDevTests() {
  try {
    console.assert(t2m("09:15") === 555, "t2m failed");
    console.assert(m2t(555) === "09:15", "m2t failed");
    console.assert(isOverlap(0, 10, 9, 20) === true, "overlap true failed");
    console.assert(isOverlap(0, 10, 10, 20) === false, "overlap boundary failed");
    const esc = escapeICS("a\\b\nc,d;e");
    console.assert(esc === "a\\\\b\\nc\\,d\\;e", "escapeICS failed");
    const j = ["A", "B"].join("\n");
    console.assert(j === "A\nB", "join newline failed");
    console.assert(canDeleteReservation({email:"renyi0128@gmail.com",isAdmin:true}, "someone@x.com") === true, "admin delete failed");
    console.assert(canDeleteReservation({email:"user@x.com",isAdmin:false}, "user@x.com") === true, "owner delete failed");
    console.assert(canDeleteReservation({email:"user@x.com",isAdmin:false}, "other@x.com") === false, "non-owner delete should fail");
    console.assert(weakHash("abc") === weakHash("abc"), "hash deterministic");
    console.assert(weakHash("abc") !== weakHash("abcd"), "hash variation");
  } catch (e) {
    console.warn("Dev tests encountered an error:", e);
  }
})();

// --- Mount React root ------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<BookingApp />);
