import type { ReactNode } from 'react';

/** Shared input styling so forms stay visually consistent. */
export const inputClass =
  'mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-brand-gold-ink focus:border-brand-gold-ink dark:focus:ring-brand-gold dark:focus:border-brand-gold bg-transparent dark:text-dark-text';

export const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

export const primaryButtonClass =
  'w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-brand-dark hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-dark transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

export const goldButtonClass =
  'flex justify-center items-center gap-2 py-3 px-6 rounded-full shadow-sm text-sm font-bold text-brand-dark bg-brand-gold hover:bg-brand-gold-light transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, subtitle, action }) => (
  <div className="text-center my-8 md:my-12">
    <h2 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-text">{title}</h2>
    {subtitle && <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Card: React.FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-dark-card rounded-lg shadow-xl p-6 ${className}`}>{children}</div>
);