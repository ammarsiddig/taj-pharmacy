interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 24, className = '' }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      style={{ color: 'var(--color-primary-600)' }}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-ivory-border)" strokeWidth="3" />
      <path d="M12 2a10 10 0 019.95 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
