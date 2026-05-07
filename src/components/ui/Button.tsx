import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-primary-500 text-white border border-primary-500 shadow-[var(--shadow-soft)] hover:bg-primary-600 active:bg-primary-700 hover:shadow-md active:scale-[0.98]',
  secondary: 'bg-white text-ink-main border border-ivory-border shadow-[var(--shadow-soft)] hover:bg-ivory-muted hover:border-primary-300',
  danger:    'bg-status-danger text-white border border-status-danger shadow-[var(--shadow-soft)] hover:opacity-90 active:scale-[0.98]',
  ghost:     'bg-transparent text-ink-muted border border-transparent hover:bg-ivory-muted',
  icon:      'bg-transparent text-ink-muted border border-transparent hover:bg-ivory-muted p-2 rounded-xl aspect-square',
};

const sizeClasses = { sm: 'px-3 py-1 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-base' };

const Spinner = () => (
  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className = '', disabled, children, ...props }, ref) => {
    const stateClass = loading ? 'cursor-wait opacity-50' : disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${variantClasses[variant]} ${variant === 'icon' ? '' : sizeClasses[size]} ${stateClass} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
export default Button;
