
// React App 簡化版
const { useState } = React;

function App() {
  const [user, setUser] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [instrument, setInstrument] = useState("GC");

  const login = () => setUser({ name: "測試用戶", email: "test@example.com" });
  const logout = () => setUser(null);

  const addReservation = () => {
    setReservations([...reservations, { id: Date.now(), instrument, user: user.name, time: new Date().toLocaleString() }]);
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">蕭友晉老師實驗室儀器預約系統</h1>
      {!user ? (
        <button onClick={login} className="px-3 py-2 border rounded bg-blue-500 text-white">登入</button>
      ) : (
        <div>
          <p>歡迎，{user.name} ({user.email})</p>
          <button onClick={logout} className="px-3 py-2 border rounded bg-gray-200">登出</button>

          <div className="mt-4">
            <label>選擇儀器：</label>
            <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className="border px-2 py-1">
              <option value="GC">GC（漁科所406）</option>
              <option value="GHG">溫室氣體測量儀（水工所307B）</option>
            </select>
            <button onClick={addReservation} className="ml-2 px-3 py-2 border rounded bg-green-500 text-white">新增預約</button>
          </div>

          <div className="mt-6">
            <h2 className="font-semibold">已預約清單</h2>
            <ul className="list-disc ml-6">
              {reservations.map(r => (
                <li key={r.id}>{r.instrument} - {r.user} - {r.time}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
