import { useRef, useMemo, Suspense } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Float, MeshDistortMaterial } from "@react-three/drei";
import {
  ChartBarIcon,
  SparklesIcon,
  NewspaperIcon,
  ChartBarSquareIcon,
  FolderOpenIcon,
  CircleStackIcon,
  ArrowRightIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import uaiziLogo from "../../assets/logo_uaizi.png";
import nidLogo from "../../assets/nid_fundo_transparente.png";

// ─── Camera follows mouse pointer ─────────────────────────────────────────────

function CameraRig() {
  useFrame((state) => {
    state.camera.position.x +=
      (state.pointer.x * 0.9 - state.camera.position.x) * 0.04;
    state.camera.position.y +=
      (state.pointer.y * 0.6 - state.camera.position.y) * 0.04;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

// ─── Animated particle cloud ──────────────────────────────────────────────────

function Particles({ count = 1400 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 28;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 28;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.012;
    ref.current.rotation.x = state.clock.elapsedTime * 0.007;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.028} color="#60a5fa" sizeAttenuation transparent opacity={0.65} />
    </points>
  );
}

// ─── Central distorted orb ────────────────────────────────────────────────────

function CentralOrb() {
  const ref = useRef();
  useFrame((state) => {
    ref.current.rotation.y += 0.0025;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.12;
  });
  return (
    <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.7}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[2, 3]} />
        <MeshDistortMaterial
          color="#2563eb"
          distort={0.28}
          speed={1.4}
          transparent
          opacity={0.88}
          emissive="#1e3a8a"
          emissiveIntensity={0.55}
          roughness={0.08}
          metalness={0.85}
        />
      </mesh>
    </Float>
  );
}

// ─── Orbiting satellite shapes ────────────────────────────────────────────────

function SatelliteOrbs() {
  return (
    <>
      <Float speed={2.4} floatIntensity={2.2} rotationIntensity={1.2} position={[-4.2, 2, -2]}>
        <mesh rotation={[Math.PI / 3, 0, Math.PI / 6]}>
          <torusGeometry args={[0.7, 0.22, 8, 48]} />
          <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.75} transparent opacity={0.88} roughness={0.18} metalness={0.55} />
        </mesh>
      </Float>
      <Float speed={1.7} floatIntensity={1.9} rotationIntensity={0.4} position={[4.2, -1.8, -2.5]}>
        <mesh>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial color="#0d9488" emissive="#0d9488" emissiveIntensity={0.65} transparent opacity={0.9} roughness={0.1} metalness={0.7} />
        </mesh>
      </Float>
      <Float speed={3.1} floatIntensity={2.6} rotationIntensity={1.8} position={[3.5, 2.8, -1.5]}>
        <mesh>
          <octahedronGeometry args={[0.48]} />
          <meshStandardMaterial color="#db2777" emissive="#db2777" emissiveIntensity={0.65} transparent opacity={0.85} roughness={0.12} metalness={0.65} />
        </mesh>
      </Float>
      <Float speed={1.9} floatIntensity={1.6} rotationIntensity={2.2} position={[-3.6, -2.2, -1]}>
        <mesh>
          <tetrahedronGeometry args={[0.42]} />
          <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.55} transparent opacity={0.82} roughness={0.2} metalness={0.6} />
        </mesh>
      </Float>
      <Float speed={2.8} floatIntensity={3} rotationIntensity={1} position={[5.5, 0.5, -4]}>
        <mesh>
          <dodecahedronGeometry args={[0.35]} />
          <meshStandardMaterial color="#059669" emissive="#059669" emissiveIntensity={0.6} transparent opacity={0.78} />
        </mesh>
      </Float>
    </>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#020617"]} />
      <Stars radius={100} depth={70} count={4000} factor={3.5} saturation={0} fade speed={0.35} />
      <Particles />
      <CentralOrb />
      <SatelliteOrbs />
      <ambientLight intensity={0.18} />
      <pointLight position={[7, 5, 4]} intensity={3.5} color="#3b82f6" />
      <pointLight position={[-5, -4, -3]} intensity={2.2} color="#7c3aed" />
      <pointLight position={[0, 7, -5]} intensity={1.8} color="#14b8a6" />
      <pointLight position={[0, -6, 3]} intensity={1} color="#f472b6" />
      <CameraRig />
    </>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "11", label: "Datasets Federais" },
  { value: "3", label: "Planos de Acesso" },
  { value: "IA", label: "Insights Automáticos" },
  { value: "360°", label: "Visão do Município" },
];

const FEATURES = [
  {
    icon: ChartBarIcon,
    color: "text-blue-400",
    glow: "from-blue-500/15 to-blue-600/5",
    border: "border-blue-500/20",
    title: "11 Indicadores Federais",
    description: "CAGED, RAIS, PIB, Comex, Bolsa Família, Estban, PIX e mais — integrados e sempre atualizados.",
    tags: ["IBGE", "MTE", "BACEN"],
  },
  {
    icon: SparklesIcon,
    color: "text-violet-400",
    glow: "from-violet-500/15 to-violet-600/5",
    border: "border-violet-500/20",
    title: "Insights por IA",
    description: "Análises automáticas geradas por inteligência artificial a partir dos dados do seu município.",
    tags: ["Claude AI", "Automático"],
  },
  {
    icon: ChartBarSquareIcon,
    color: "text-teal-400",
    glow: "from-teal-500/15 to-teal-600/5",
    border: "border-teal-500/20",
    title: "Benchmark Municipal",
    description: "Compare seu município com outros da região ou do estado em todos os indicadores disponíveis.",
    tags: ["Ranking", "Multi-estado"],
  },
  {
    icon: FolderOpenIcon,
    color: "text-amber-400",
    glow: "from-amber-500/15 to-amber-600/5",
    border: "border-amber-500/20",
    title: "Projetos & Eixos",
    description: "Gerencie iniciativas por eixo estratégico com status, prazos e conteúdo detalhado.",
    tags: ["Estratégia", "Gestão"],
  },
  {
    icon: CircleStackIcon,
    color: "text-pink-400",
    glow: "from-pink-500/15 to-pink-600/5",
    border: "border-pink-500/20",
    title: "Dados Internos",
    description: "Registre indicadores próprios, plano de governo por secretaria e calendário de eventos municipais.",
    tags: ["CRM", "Plano de Governo", "Calendário"],
  },
  {
    icon: NewspaperIcon,
    color: "text-emerald-400",
    glow: "from-emerald-500/15 to-emerald-600/5",
    border: "border-emerald-500/20",
    title: "Releases de Imprensa",
    description: "Comunicados prontos para divulgação, gerados pela IA ou redigidos por especialistas do município.",
    tags: ["Comunicação", "IA"],
  },
];

const PLAN_HIGHLIGHTS = [
  "Acesso a todos os datasets federais",
  "Benchmark entre municípios",
  "Insights gerados por IA",
  "Gestão de projetos e eixos",
  "Dados internos e plano de governo",
  "Releases e comunicados",
];

// ─── Landing page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617]">

      {/* ── Three.js background ── */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <Canvas camera={{ position: [0, 0, 6.5], fov: 72 }} gl={{ antialias: true, alpha: false }} dpr={[1, 2]}>
            <Scene />
          </Canvas>
        </Suspense>
      </div>

      {/* ── Gradient vignette overlays ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/50 via-transparent to-[#020617]/98" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617]/60 via-transparent to-[#020617]/40" />
      </div>

      {/* ── Page content ── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Navigation ── */}
        <nav className="px-6 md:px-14 py-6 flex items-center justify-between" aria-label="Navegação principal">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <img src={uaiziLogo} alt="UAIZI — Observatório Econômico" className="h-9 object-contain" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Link to="/login">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileFocus={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm font-medium hover:bg-white/10 hover:text-white hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all backdrop-blur-sm cursor-pointer"
              >
                Entrar
              </motion.button>
            </Link>
          </motion.div>
        </nav>

        {/* ── Hero section ── */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 text-center py-8" aria-label="Hero">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
            <span className="text-blue-300 text-xs font-semibold uppercase tracking-[0.25em]">
              Plataforma de Inteligência Municipal
            </span>
          </motion.div>

          {/* NID logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <img
              src={nidLogo}
              alt="NID — Núcleo de Inteligência de Dados"
              className="h-24 md:h-36 object-contain mx-auto"
              style={{ filter: "drop-shadow(0 0 32px rgba(59,130,246,0.55)) drop-shadow(0 0 60px rgba(99,102,241,0.3))" }}
            />
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-5 leading-[1.05]"
          >
            <span className="bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">
              Núcleo de
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
              Inteligência de Dados
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6, ease: "easeOut" }}
            className="text-slate-300 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed"
          >
            Transforme indicadores econômicos federais em decisões estratégicas.
            Dados, análises e gestão municipal em um só lugar.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <Link to="/login">
              <motion.button
                whileHover={{ scale: 1.04, boxShadow: "0 0 40px rgba(99,102,241,0.45), 0 0 16px rgba(59,130,246,0.35)" }}
                whileFocus={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2.5 bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 text-white font-bold px-8 py-3.5 rounded-2xl text-sm shadow-xl shadow-blue-500/25 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-200 cursor-pointer"
              >
                <span>Acessar o NID</span>
                <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
              </motion.button>
            </Link>
          </motion.div>
        </section>

        {/* ── Stats strip ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6, ease: "easeOut" }}
          className="px-6 md:px-14 pb-10"
        >
          <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((s, i) => (
              <div
                key={i}
                className="text-center px-4 py-4 rounded-xl bg-white/[0.04] border border-white/[0.07] backdrop-blur-sm"
              >
                <p className="text-2xl font-black text-white mb-0.5">{s.value}</p>
                <p className="text-slate-400 text-xs font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Feature cards ── */}
        <section className="px-6 md:px-14 pb-12" aria-label="Funcionalidades">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="text-center text-slate-500 text-xs font-semibold uppercase tracking-widest mb-6"
          >
            Tudo que sua prefeitura precisa
          </motion.p>
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.05 + i * 0.08, duration: 0.55, ease: "easeOut" }}
                  className={`relative overflow-hidden bg-gradient-to-br ${f.glow} backdrop-blur-xl border ${f.border} rounded-2xl p-5 text-left group cursor-default`}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/[0.03] rounded-2xl transition-opacity duration-300" />
                  <div className="relative">
                    <div className={`w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center mb-4 ${f.color}`}>
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-3">{f.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {f.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-slate-400 border border-white/[0.07]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Highlights strip ── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.5, ease: "easeOut" }}
          className="px-6 md:px-14 pb-14"
          aria-label="Destaques do plano"
        >
          <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm p-6">
            <p className="text-center text-white/60 text-xs font-semibold uppercase tracking-widest mb-5">
              Incluso em todos os planos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PLAN_HIGHLIGHTS.map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <CheckIcon className="w-2.5 h-2.5 text-blue-400" aria-hidden="true" />
                  </div>
                  <span className="text-slate-300 text-xs">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Link to="/login">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileFocus={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-white/15 text-white/80 text-sm font-medium hover:bg-white/8 hover:text-white hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all backdrop-blur-sm cursor-pointer"
                >
                  Começar agora
                  <ArrowRightIcon className="w-3.5 h-3.5" aria-hidden="true" />
                </motion.button>
              </Link>
            </div>
          </div>
        </motion.section>

        {/* ── Footer ── */}
        <footer className="px-6 md:px-14 py-5 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-slate-500 text-xs">© 2025 UAIZI · Todos os direitos reservados</p>
          <p className="text-slate-500 text-xs hidden md:block">
            NID — Núcleo de Inteligência de Dados
          </p>
        </footer>
      </div>
    </div>
  );
}
