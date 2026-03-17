import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  title: string;
  value: string;
  trend?: number; // percentual
}

export default function KpiCard({ title, value, trend }: Props) {
  const isPositive = trend && trend > 0;

  return (
    <Card className="flex flex-col gap-3">
      <span className="text-sm text-slate-500">{title}</span>

      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-slate-800">
          {value}
        </span>

        {trend !== undefined && (
          <Badge variant={isPositive ? "success" : "danger"}>
            <span className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          </Badge>
        )}
      </div>
    </Card>
  );
}
