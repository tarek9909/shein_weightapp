import React from "react";

export default function OrdersColumn({ data }) {
  return (
    <div className="column">
      <h2>Orders</h2>
      {data.map(o => <div key={o.id}>{o.order_details}</div>)}
    </div>
  );
}
