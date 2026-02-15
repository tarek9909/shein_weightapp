export default function Topbar({ email, onRefresh, onLogout }) {
  return (
    <div className="card flex-between">
      <div>
        <h2 style={{ margin: 0 }}>SHEIN Tracker</h2>
        <div className="small-text">{email}</div>
      </div>

      <div className="flex">
        <button className="button button-primary" onClick={onRefresh}>
          Refresh
        </button>
        <button className="button button-dark" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
