import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, iconPosition = 'start', className = '', id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-main">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted ${iconPosition === 'end' ? 'end-3' : 'start-3'}`}>
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`app-input w-full px-3 py-2.5 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none ${icon ? (iconPosition === 'end' ? 'pe-10' : 'ps-10') : ''} ${error ? 'app-input-error' : ''} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-status-danger">{error}</span>}
        {helperText && !error && <span className="text-xs text-ink-muted">{helperText}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
