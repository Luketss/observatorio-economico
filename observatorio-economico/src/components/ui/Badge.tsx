interface Props {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "neutral";
}

export default function Badge({ children, variant = "neutral" }: Props) {
  const variants = {
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
    danger: "bg-red-100 text-red-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-md ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
