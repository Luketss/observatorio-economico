import { useState } from "react";
import { motion } from "framer-motion";
import cagedData from "../../data/caged_oliveira.json";
import empresasData from "../../data/empresas_oliveira.json";
import raisData from "../../data/rais_oliveira.json";

type Message = {
  id: number;
  role: "user" | "bot";
  content: string;
};

export default function ChatBotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "bot",
      content:
        "Olá 👋 Sou o Assistente Econômico de Oliveira. Pergunte sobre CAGED, empresas ou RAIS.",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [typingText, setTypingText] = useState("");

  const cagedObj = cagedData as unknown as {
    serie: { ano: number; mes: number; saldo: number }[];
  };
  const caged = cagedObj.serie ?? [];

  const empresas = empresasData as unknown as {
    aberturas: number;
  }[];

  const raisObj = raisData as unknown as {
    anual: { ano: number; total_vinculos: number }[];
  };
  const rais = raisObj.anual ?? [];

  function gerarResposta(texto: string) {
    const lower = texto.toLowerCase();

    const ultimoCaged = caged[caged.length - 1];
    const totalEmpresas = empresas.reduce(
      (acc, e) => acc + e.aberturas,
      0
    );
    const ultimoRais = rais[rais.length - 1];

    if (lower.includes("caged") || lower.includes("saldo")) {
      return `No último mês disponível (${ultimoCaged.ano}-${String(
        ultimoCaged.mes
      ).padStart(2, "0")}), o saldo foi ${
        ultimoCaged.saldo
      } empregos.`;
    }

    if (lower.includes("empresa")) {
      return `Desde 2021, Oliveira registrou ${totalEmpresas} empresas abertas no total.`;
    }

    if (
      lower.includes("rais") ||
      lower.includes("emprego formal")
    ) {
      return `No último ano disponível (${ultimoRais.ano}), Oliveira possui ${ultimoRais.total_vinculos} empregos formais.`;
    }

    return "Posso informar dados sobre CAGED, empresas ou RAIS de Oliveira.";
  }

  function digitarTextoCompleto(texto: string) {
    let index = 0;
    setTypingText("");

    const intervalo = setInterval(() => {
      index++;
      setTypingText(texto.slice(0, index));

      if (index >= texto.length) {
        clearInterval(intervalo);
        setLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "bot",
            content: texto,
          },
        ]);
        setTypingText("");
      }
    }, 18);
  }

  function handleEnviar() {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const resposta = gerarResposta(userMessage.content);

    setTimeout(() => {
      digitarTextoCompleto(resposta);
    }, 500);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <h1 className="text-2xl font-bold text-slate-800 mb-4">
        Atendimento Inteligente — Oliveira
      </h1>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-xl max-w-[80%] ${
              msg.role === "user"
                ? "bg-blue-600 text-white ml-auto"
                : "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
            }`}
          >
            {msg.content}
          </motion.div>
        ))}

        {loading && (
          <div className="p-3 rounded-xl bg-slate-200 dark:bg-slate-700 max-w-[80%]">
            {typingText || "Digitando..."}
          </div>
        )}
      </div>

      {/* Área fixa de input */}
      <div className="sticky bottom-0 pt-4 bg-white dark:bg-slate-900">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && handleEnviar()
            }
            placeholder="Digite sua pergunta..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleEnviar}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
