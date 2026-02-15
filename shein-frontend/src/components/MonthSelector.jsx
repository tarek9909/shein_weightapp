export default function MonthSelector({ months = [], onChange = () => {} }) {
  return (
    <div className="month-selector">
      <label>Select Month:</label>
      <select onChange={(e) => onChange(e.target.value)}>
        <option value="">-- Choose Month --</option>

        {months.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
