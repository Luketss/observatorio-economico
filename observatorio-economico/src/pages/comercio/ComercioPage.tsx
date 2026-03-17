import Card from "../../components/ui/Card";
import comercioData from "../../data/comercio.json";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = ["#2563EB", "#F59E0B"];

export default function ComercioPage() {
  const ultimo = comercioData[comercioData.length - 1];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">
        Comércio Exterior
      </h1>

      {/* BAR CHART */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Exportações vs Importações
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={comercioData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="exportacoes" fill="#2563EB" />
              <Bar dataKey="importacoes" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* PIE CHART */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Participação {ultimo.ano}
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={[
                  { name: "Exportações", value: ultimo.exportacoes },
                  { name: "Importações", value: ultimo.importacoes },
                ]}
                dataKey="value"
                outerRadius={120}
                label
              >
                {COLORS.map((color, index) => (
                  <Cell key={index} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* AREA CHART */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Evolução Comercial (Área)
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <AreaChart data={comercioData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="exportacoes"
                stroke="#2563EB"
                fill="#93C5FD"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* SCATTER PLOT */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Correlação Exportação x Importação
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey="exportacoes" name="Exportações" />
              <YAxis dataKey="importacoes" name="Importações" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={comercioData} fill="#2563EB" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* STACKED BAR */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Volume Comercial (Stacked)
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <BarChart data={comercioData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ano" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="exportacoes" stackId="a" fill="#2563EB" />
              <Bar dataKey="importacoes" stackId="a" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* RADAR CHART */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Perfil Comercial (Radar)
        </h2>
        <div className="w-full h-80">
          <ResponsiveContainer>
            <RadarChart
              data={[
                {
                  categoria: "Exportações",
                  valor: ultimo.exportacoes,
                },
                {
                  categoria: "Importações",
                  valor: ultimo.importacoes,
                },
              ]}
            >
              <PolarGrid />
              <PolarAngleAxis dataKey="categoria" />
              <PolarRadiusAxis />
              <Radar
                dataKey="valor"
                stroke="#2563EB"
                fill="#2563EB"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
