import { useRef, useMemo, Suspense } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Float, MeshDistortMaterial } from "@react-three/drei";
import uaiziLogo from "../../assets/logo_uaizi.png";
import nidLogo from "../../assets/nid_fundo_transparente.png";

// ─── Camera follows mouse pointer for subtle parallax ────────────────────────

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

// ─── Animated particle cloud ─────────────────────────────────────────────────

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
      <pointsMaterial
        size={0.028}
        color="#60a5fa"
        sizeAttenuation
        transparent
        opacity={0.65}
      />
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
      {/* Violet torus — upper left */}
      <Float speed={2.4} floatIntensity={2.2} rotationIntensity={1.2} position={[-4.2, 2, -2]}>
        <mesh rotation={[Math.PI / 3, 0, Math.PI / 6]}>
          <torusGeometry args={[0.7, 0.22, 8, 48]} />
          <meshStandardMaterial
            color="#7c3aed"
            emissive="#7c3aed"
            emissiveIntensity={0.75}
            transparent
            opacity={0.88}
            roughness={0.18}
            metalness={0.55}
          />
        </mesh>
      </Float>

      {/* Teal sphere — lower right */}
      <Float speed={1.7} floatIntensity={1.9} rotationIntensity={0.4} position={[4.2, -1.8, -2.5]}>
        <mesh>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial
            color="#0d9488"
            emissive="#0d9488"
            emissiveIntensity={0.65}
            transparent
            opacity={0.9}
            roughness={0.1}
            metalness={0.7}
          />
        </mesh>
      </Float>

      {/* Pink octahedron — upper right */}
      <Float speed={3.1} floatIntensity={2.6} rotationIntensity={1.8} position={[3.5, 2.8, -1.5]}>
        <mesh>
          <octahedronGeometry args={[0.48]} />
          <meshStandardMaterial
            color="#db2777"
            emissive="#db2777"
            emissiveIntensity={0.65}
            transparent
            opacity={0.85}
            roughness={0.12}
            metalness={0.65}
          />
        </mesh>
      </Float>

      {/* Sky-blue tetrahedron — lower left */}
      <Float speed={1.9} floatIntensity={1.6} rotationIntensity={2.2} position={[-3.6, -2.2, -1]}>
        <mesh>
          <tetrahedronGeometry args={[0.42]} />
          <meshStandardMaterial
            color="#0284c7"
            emissive="#0284c7"
            emissiveIntensity={0.55}
            transparent
            opacity={0.82}
            roughness={0.2}
            metalness={0.6}
          />
        </mesh>
      </Float>

      {/* Small emerald dodecahedron — far right mid */}
      <Float speed={2.8} floatIntensity={3} rotationIntensity={1} position={[5.5, 0.5, -4]}>
        <mesh>
          <dodecahedronGeometry args={[0.35]} />
          <meshStandardMaterial
            color="#059669"
            emissive="#059669"
            emissiveIntensity={0.6}
            transparent
            opacity={0.78}
          />
        </mesh>
      </Float>
    </>
  );
}

// ─── Full 3D scene ────────────────────────────────────────────────────────────

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

// ─── Feature cards data ───────────────────────────────────────────────────────

const FEATURES = [
  {
    gradient: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/20",
    icon: "📊",
    title: "12 Indicadores Federais",
    description:
      "CAGED, RAIS, PIB, Comex, Bolsa Família, Estban e mais — todos integrados e atualizados.",
  },
  {
    gradient: "from-violet-500/20 to-violet-600/5",
    border: "border-violet-500/20",
    icon: "🤖",
    title: "Insights por IA",
    description:
      "Análises automáticas geradas por inteligência artificial a partir dos dados do seu município.",
  },
  {
    gradient: "from-teal-500/20 to-teal-600/5",
    border: "border-teal-500/20",
    icon: "📰",
    title: "Releases de Imprensa",
    description:
      "Comunicados prontos para divulgação, gerados pela IA ou redigidos por especialistas.",
  },
];

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617]">
      {/* ── Three.js background ── */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <Canvas
            camera={{ position: [0, 0, 6.5], fov: 72 }}
            gl={{ antialias: true, alpha: false }}
            dpr={[1, 2]}
          >
            <Scene />
          </Canvas>
        </Suspense>
      </div>

      {/* ── Gradient vignette overlays ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/50 via-transparent to-[#020617]/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617]/60 via-transparent to-[#020617]/40" />
      </div>

      {/* ── Page content ── */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* ── Navigation ── */}
        <nav className="px-6 md:px-14 py-6 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <img src={uaiziLogo} alt="UAIZI" className="h-9 object-contain" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Link to="/login">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-white/75 text-sm font-medium hover:bg-white/10 hover:text-white hover:border-white/30 transition-all backdrop-blur-sm"
              >
                Entrar
              </motion.button>
            </Link>
          </motion.div>
        </nav>

        {/* ── Hero section ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center py-8">
          {/* Eyebrow label */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.7 }}
            className="text-blue-400 text-xs font-bold uppercase tracking-[0.3em] mb-8"
          >
            Plataforma de Inteligência Municipal
          </motion.p>

          {/* NID logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.75, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <img
              src={nidLogo}
              alt="NID"
              className="h-24 md:h-36 object-contain mx-auto"
              style={{
                filter: "drop-shadow(0 0 32px rgba(59,130,246,0.55)) drop-shadow(0 0 60px rgba(99,102,241,0.3))",
              }}
            />
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-5 leading-[1.05]"
          >
            <span className="bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
              Núcleo de
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
              Inteligência de Dados
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-11 leading-relaxed"
          >
            Transforme indicadores econômicos federais em decisões estratégicas.
            <br className="hidden md:block" />
            Dados, análises e releases de imprensa — tudo em um só lugar para a sua prefeitura.
          </motion.p>

          {/* CTA button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.7 }}
          >
            <Link to="/login">
              <motion.button
                whileHover={{
                  scale: 1.06,
                  boxShadow: "0 0 50px rgba(99,102,241,0.5), 0 0 20px rgba(59,130,246,0.4)",
                }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-size-200 hover:bg-right text-white font-bold px-10 py-4 rounded-2xl text-base shadow-2xl shadow-blue-500/30 transition-all duration-300"
              >
                <span>Acessar o NID</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </motion.button>
            </Link>
          </motion.div>
        </div>

        {/* ── Feature cards ── */}
        <div className="px-6 md:px-14 pb-14">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.12, duration: 0.7, ease: "easeOut" }}
                className={`relative overflow-hidden bg-gradient-to-br ${f.gradient} backdrop-blur-xl border ${f.border} rounded-2xl p-6 text-left hover:scale-[1.02] transition-transform duration-300 group`}
              >
                {/* Subtle inner glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/[0.03] rounded-2xl transition-opacity duration-300" />
                <div className="relative">
                  <div className="text-2xl mb-3">{f.icon}</div>
                  <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">{f.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-5 border-t border-white/[0.05] flex items-center justify-between">
          <p className="text-slate-700 text-xs">© 2025 UAIZI · Todos os direitos reservados</p>
          <p className="text-slate-700 text-xs hidden md:block">Powered by UAIZI</p>
        </div>
      </div>
    </div>
  );
}
