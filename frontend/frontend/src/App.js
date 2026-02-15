import { useState } from "react";
import Setup from "./pages/Setup";
import Orders from "./pages/Orders";
import "./styles/app.css";

export default function App() {
  const [email, setEmail] = useState(localStorage.getItem("user_email") || "");

  const logout = () => {
    localStorage.removeItem("user_email");
    setEmail("");
  };

  if (!email) return <Setup onDone={setEmail} />;

  return <Orders email={email} onLogout={logout} />;
}
