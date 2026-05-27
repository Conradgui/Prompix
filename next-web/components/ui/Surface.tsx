import { motion } from 'framer-motion';

interface SurfaceProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export default function Surface({ children, className = '', interactive = false }: SurfaceProps) {
  if (!interactive) {
    return (
      <div className={`rounded-ag border border-ag-border bg-ag-surface backdrop-blur-xl shadow-ag transition-all duration-300 ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.008, boxShadow: '0 20px 48px -12px var(--ag-shadow)' }}
      whileTap={{ y: -1, scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`rounded-ag border border-ag-border bg-ag-surface backdrop-blur-xl shadow-ag transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
}
