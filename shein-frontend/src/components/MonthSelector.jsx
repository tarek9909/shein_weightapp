import CustomDropdown from "./CustomDropdown";

export default function MonthSelector({ months = [], onChange = () => {} }) {
  return (
    <div className="month-selector">
      <label>Select Month:</label>
      <CustomDropdown
        placeholder="-- Choose Month --"
        options={months.map((m) => ({ value: m.id, label: m.name }))}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
