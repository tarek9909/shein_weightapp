import React from "react";

export default function PaymentsColumn({ data }) {
  return (
    <div className="column">
      <h2>Payments</h2>
      {data.map(p => <div key={p.id}>${p.payment_amount}</div>)}
    </div>
  );
}
