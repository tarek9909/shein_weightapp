import React from "react";

export default function CustomsColumn({ data }) {
  return (
    <div className="column">
      <h2>Customs</h2>
      {data.map(c => <div key={c.id}>${c.customs_fee}</div>)}
    </div>
  );
}
