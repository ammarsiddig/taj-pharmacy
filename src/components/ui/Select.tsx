import { type SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink-main">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            app-input w-full px-3 py-2.5 text-sm text-ink-main
            focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100
            ${error ? 'border-status-danger' : ''}
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-status-danger">{error}</span>}
      </div>
    );
  },
);

Select.displayName = 'Select';
export default Select;
