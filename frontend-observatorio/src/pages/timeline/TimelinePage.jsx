import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import MandatoTimeline from "../../components/MandatoTimeline";

export default function TimelinePage() {
  const { user } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: "28px" }}
    >
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <CalendarDaysIcon
          style={{ width: "28px", height: "28px", color: "var(--accent-1)", flexShrink: 0 }}
        />
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "22px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              margin: 0,
            }}
          >
            Timeline do Mandato
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
              color: "var(--text-dim)",
              marginTop: "2px",
              letterSpacing: "0.02em",
            }}
          >
            Marcos e eventos relevantes do mandato municipal.
          </p>
        </div>
      </div>

      <MandatoTimeline />
    </motion.div>
  );
}
