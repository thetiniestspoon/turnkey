import { motion } from 'framer-motion'

export function AdvisorOrb({ onClick, hasInsight }: { onClick: () => void; hasInsight?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 group"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title="Ask Advisor"
    >
      <div className="relative w-14 h-14">
        {/* Ambient glow */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/40 blur-lg group-hover:blur-xl transition-all" />
        {/* Orb body */}
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg flex items-center justify-center">
          <span className="text-xl">🦝</span>
        </div>
        {/* Pulse ring when has insight */}
        {hasInsight && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-amber-400"
            animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>
    </motion.button>
  )
}
