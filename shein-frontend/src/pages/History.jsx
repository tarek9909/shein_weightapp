import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { getHistory } from "../api/historyApi";
import { getMonths } from "../api/monthApi"; // ✅ use your API instead of raw URL
import CustomDropdown from "../components/CustomDropdown";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function useMedia(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

function Accordion({
  open,
  onToggle,
  header,
  children,
  durationMs = 500,
  scrollable = false,
  maxBodyVh = 70,
}) {
  const scrollBoxRef = React.useRef(null);
  const contentRef = React.useRef(null);

  const [mounted, setMounted] = React.useState(false);
  const [animateIn, setAnimateIn] = React.useState(false);
  const [maxH, setMaxH] = React.useState(0);

  const maxScrollablePx =
    typeof window !== "undefined"
      ? Math.floor((window.innerHeight * maxBodyVh) / 100)
      : 600;

  const measure = React.useCallback(() => {
    if (!contentRef.current) return;
    setMaxH(contentRef.current.scrollHeight);
  }, []);

  React.useEffect(() => {
    let raf1, raf2;

    if (open) {
      setMounted(true);
      setAnimateIn(false);

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          measure();
          setAnimateIn(true);
        });
      });
    } else {
      setAnimateIn(false);
      const t = setTimeout(() => setMounted(false), durationMs + 40);
      return () => clearTimeout(t);
    }

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, durationMs, measure]);

  useLayoutEffect(() => {
    if (!mounted) return;

    measure();

    const ro = new ResizeObserver(() => {
      measure();
    });

    if (contentRef.current) ro.observe(contentRef.current);

    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [mounted, measure]);

  const animatedMax = scrollable ? Math.min(maxH, maxScrollablePx) : maxH;

  return (
    <div style={styles.accWrap}>
      <button type="button" onClick={onToggle} style={styles.accHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        <span
          style={{
            ...styles.chev2,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {mounted && (
        <div
          style={{
            ...styles.accBodyOuter,
            transition: `max-height ${durationMs}ms cubic-bezier(.16, 1, .3, 1),
                         opacity ${durationMs}ms ease,
                         transform ${durationMs}ms cubic-bezier(.16, 1, .3, 1)`,
            maxHeight: animateIn ? animatedMax : 0,
            opacity: animateIn ? 1 : 0,
            transform: animateIn ? "translateY(0px)" : "translateY(-14px)",
          }}
        >
          <div
            ref={scrollBoxRef}
            style={{
              ...styles.accBodyInner,
              overflowY: scrollable ? "auto" : "visible",
              maxHeight: scrollable ? `${maxScrollablePx}px` : "none",
              paddingRight: scrollable ? 8 : 0,
            }}
          >
            <div ref={contentRef}>{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function History() {
  const [months, setMonths] = useState([]);
  const [monthId, setMonthId] = useState("");
  const [history, setHistory] = useState(null);
  const [loadingMonths, setLoadingMonths] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  const isMobile = useMedia("(max-width: 640px)");
  const isTablet = useMedia("(max-width: 960px)");

  // ✅ token from login (store it when user signs in)
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    (async () => {
      setLoadingMonths(true);
      setError("");

      if (!token) {
        setError("You are not logged in. Please sign in first.");
        setLoadingMonths(false);
        return;
      }

      try {
        // ✅ get months for this logged-in user (backend must enforce)
        const data = await getMonths(); // monthApi will include token (we’ll adjust monthApi next)
        setMonths(data || []);
        if (data?.length) setMonthId(String(data[0].id));
      } catch (e) {
        setError(e.message || "Failed to load months");
      } finally {
        setLoadingMonths(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!monthId) return;

    (async () => {
      setLoadingHistory(true);
      setError("");
      setHistory(null);

      if (!token) {
        setError("You are not logged in. Please sign in first.");
        setLoadingHistory(false);
        return;
      }

      try {
        const data = await getHistory(monthId); // historyApi will include token (we’ll adjust next)
        if (!data.ok) throw new Error(data.error || "Failed to load history");
        setHistory(data);
      } catch (e) {
        setError(e.message || "Failed to load history");
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [monthId, token]);

  const summary = history?.summary;
  const orders = history?.orders || [];

  const meta = useMemo(() => {
    const carts = orders.reduce((a, o) => a + (o.carts?.length || 0), 0);
    const customers = orders.reduce(
      (a, o) => a + (o.carts || []).reduce((b, c) => b + (c.customers?.length || 0), 0),
      0
    );
    return { orders: orders.length, carts, customers };
  }, [orders]);

  return (
    <div style={{ ...styles.page, ...(isMobile ? styles.pageMobile : null) }}>
      <div style={{ ...styles.headerRow, ...(isMobile ? styles.headerRowMobile : null) }}>
        <div style={{ ...(isMobile ? { width: "100%" } : null) }}>
          <h1 style={{ ...styles.h1, ...(isMobile ? styles.h1Mobile : null) }}>History</h1>
          <div style={styles.sub}>
            Read-only view of orders, carts, customers, payments and customs.
          </div>
        </div>

        <div style={{ ...styles.controls, ...(isMobile ? styles.controlsMobile : null) }}>
          <label style={styles.label}>Month</label>
          <CustomDropdown
            value={monthId}
            onChange={(e) => setMonthId(e.target.value)}
            disabled={loadingMonths || !months.length}
            placeholder="Select Month"
            options={months.map((m) => ({
              value: String(m.id),
              label: `${m.name} (#${m.id})`,
            }))}
          />
        </div>
      </div>

      {(loadingMonths || loadingHistory) && <SkeletonBar />}
      {error && <Alert>{error}</Alert>}

      {history && (
        <>
          <div
            style={{
              ...styles.statsGrid,
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : isTablet
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(4, minmax(0, 1fr))",
              gap: isMobile ? 8 : 14,
            }}
          >
            <Stat title="Customs" value={`$${money(summary?.customs_fee)}`} />
            <Stat title="Payments" value={`$${money(summary?.payments_total)}`} />
            <Stat title="Paid (Orders)" value={`$${money(summary?.orders_paid_total)}`} />
            <Stat title="Collected (Orders)" value={`$${money(summary?.orders_collected_total)}`} />
          </div>

          <div style={styles.metaRow}>
            <Pill label={`Orders: ${meta.orders}`} />
            <Pill label={`Carts: ${meta.carts}`} />
            <Pill label={`Customers: ${meta.customers}`} />
          </div>

          <div style={styles.list}>
            {orders.length === 0 ? (
              <EmptyState text="No orders for this month." />
            ) : (
              orders.map((o) => <OrderCard key={o.id} order={o} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* --- rest of your components unchanged --- */
function OrderCard({ order }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.card}>
      <Accordion
        open={open}
        onToggle={() => setOpen((v) => !v)}
        durationMs={500}
        scrollable={true}
        maxBodyVh={70}
        header={
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={styles.cardTitle}>Order # {order.order_name}</div>
            <div style={styles.cardBadgesRow}>
              <Badge label={`Paid: $${money(order.paid_amount)}`} />
              <Badge label={`Collected: $${money(order.collected_total)}`} />
              <Badge label={`Carts: ${order.carts?.length || 0}`} variant="soft" />
            </div>
          </div>
        }
      >
        {(order.carts || []).length === 0 ? (
          <EmptyState text="No carts for this order." compact />
        ) : (
          (order.carts || []).map((c) => <CartCard key={c.cart_id} cart={c} />)
        )}
      </Accordion>
    </div>
  );
}

function CartCard({ cart }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.innerCard}>
      <Accordion
        open={open}
        onToggle={() => setOpen((v) => !v)}
        durationMs={450}
        scrollable={false}
        header={
          <div>
            <div style={styles.innerTitle}>Cart # {cart.cart_order_number ?? "-"}</div>
            <div style={styles.cardBadgesRow}>
              <Badge label={`Cart Price: $${money(cart.cart_price)}`} variant="soft" />
              <Badge label={`Collected: $${money(cart.collected_total)}`} />
              <Badge label={`Customers: ${cart.customers?.length || 0}`} variant="soft" />
            </div>
          </div>
        }
      >
        <div style={styles.innerBody}>
          <CustomersTable customers={cart.customers || []} />
        </div>
      </Accordion>
    </div>
  );
}

function CustomersTable({ customers }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>USD to Collect</Th>
            <Th>Delivery #</Th>
            <Th>Status</Th>
            <Th>Delivery Status</Th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <Td colSpan={5}>
                <span style={styles.muted}>No customers in this cart.</span>
              </Td>
            </tr>
          ) : (
            customers.map((c) => (
              <tr key={c.id}>
                <Td>
                  {c.customer_name?.trim() ? c.customer_name : <span style={styles.muted}>(empty)</span>}
                </Td>
                <Td>${money(c.usd_to_collect)}</Td>
                <Td>{c.delivery_number ?? <span style={styles.muted}>-</span>}</Td>
                <Td>{c.status ?? <span style={styles.muted}>-</span>}</Td>
                <Td>{c.delivery_status ?? <span style={styles.muted}>-</span>}</Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statTitle}>{title}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function Badge({ label, variant = "solid" }) {
  const s = variant === "soft" ? styles.badgeSoft : styles.badge;
  return <span style={s}>{label}</span>;
}

function Pill({ label }) {
  return <span style={styles.pill}>{label}</span>;
}

function Alert({ children }) {
  return <div style={styles.alert}>{children}</div>;
}

function EmptyState({ text, compact }) {
  return (
    <div style={{ ...styles.empty, padding: compact ? 10 : 16 }}>
      <div style={{ fontWeight: 600 }}>{text}</div>
    </div>
  );
}

function SkeletonBar() {
  return (
    <div style={styles.skelWrap}>
      <div style={styles.skel} />
    </div>
  );
}

function Th({ children }) {
  return <th style={styles.th}>{children}</th>;
}
function Td({ children, colSpan }) {
  return (
    <td style={styles.td} colSpan={colSpan}>
      {children}
    </td>
  );
}

/* styles object unchanged (keep yours) */
const styles = {
  page: {
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
    padding: "16px 0 48px",
    fontFamily: "inherit",
    color: "#0f172a",
  },
  pageMobile: { padding: "8px 0 32px" },

  headerRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid #e2e8f0",
  },
  headerRowMobile: { flexDirection: "column", alignItems: "stretch", gap: 14 },

  h1: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: -0.6,
    color: "#0f172a",
  },
  h1Mobile: { fontSize: 24 },

  sub: { color: "#64748b", marginTop: 6, fontSize: 14, fontWeight: 500 },

  controls: { display: "flex", flexDirection: "column", gap: 8, minWidth: 280 },
  controlsMobile: { minWidth: "unset", width: "100%" },

  label: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  select: {
    borderRadius: 10,
    border: "1.5px solid #e2e8f0",
    padding: "10px 14px",
    background: "#fff",
    outline: "none",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
  },
  selectMobile: { width: "100%" },

  statsGrid: { display: "grid", gap: 14, marginTop: 14, marginBottom: 14 },

  stat: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 16,
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  statTitle: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: -0.3,
    wordBreak: "break-word",
  },

  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 6 },

  pill: {
    fontSize: 11.5,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#334155",
    fontWeight: 700,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  list: { marginTop: 16, display: "flex", flexDirection: "column", gap: 14 },

  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    overflow: "hidden",
  },

  cardTitle: { fontWeight: 800, fontSize: 16, color: "#0f172a", wordBreak: "break-word", letterSpacing: -0.2 },

  innerCard: {
    border: "1px solid #eef2f7",
    borderRadius: 14,
    background: "#f8fafc",
    marginBottom: 10,
    overflow: "hidden",
    color: "#0f172a",
  },

  innerTitle: { fontWeight: 700, fontSize: 14, wordBreak: "break-word" },
  innerBody: { paddingTop: 4 },

  muted: { color: "#64748b", fontWeight: 600 },

  cardBadgesRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },

  badge: {
    fontSize: 11.5,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#4f46e5",
    color: "#fff",
    fontWeight: 700,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  badgeSoft: {
    fontSize: 11.5,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#4338ca",
    fontWeight: 700,
    border: "1px solid #c7d2fe",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  tableWrap: {
    overflowX: "auto",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    WebkitOverflowScrolling: "touch",
  },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 680 },

  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11.5,
    fontWeight: 800,
    textTransform: "uppercase",
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1.5px solid #e2e8f0",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },

  alert: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    border: "1px solid #fecdd3",
    background: "#fff1f2",
    color: "#be123c",
    fontWeight: 700,
    wordBreak: "break-word",
  },

  empty: { border: "1.5px dashed #e2e8f0", borderRadius: 14, background: "#ffffff", color: "#334155", padding: 24, textAlign: "center" },

  skelWrap: { marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff", padding: 16 },

  skel: {
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9)",
    backgroundSize: "200% 100%",
    animation: "sk 1.2s ease-in-out infinite",
  },

  accWrap: { display: "flex", flexDirection: "column" },

  accHeader: {
    width: "100%",
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  accBodyOuter: { overflow: "hidden", willChange: "max-height, opacity, transform" },

  accBodyInner: { padding: "14px 16px", paddingTop: 0, scrollbarGutter: "stable" },

  chev2: { color: "#94a3b8", fontWeight: 900, transition: "transform 220ms ease" },
};
