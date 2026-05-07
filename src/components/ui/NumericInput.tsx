import { useState, useRef, type CSSProperties } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: string;
}

export default function NumericInput({
  value,
  onChange,
  min = 0,
  max,
  step = 0.01,
  placeholder = '0',
  className = '',
  style,
  label,
  autoFocus,
  disabled,
  error,
}: NumericInputProps) {
  const [display, setDisplay] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 2) : 0;

  const formatValue = (v: number): string => {
    if (v === 0) return '';
    return decimals > 0 ? v.toFixed(decimals) : String(v);
  };

  const handleFocus = () => {
    const formatted = formatValue(value);
    setDisplay(formatted);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    let parsed = parseFloat(display ?? '') || 0;
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    onChange(parsed);
    setDisplay(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
      setDisplay(raw);
    }
  };

  const shown = display !== null ? display : formatValue(value);

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-ink-main">{label}</label>}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={shown}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        style={style}
        className={`app-input w-full px-3 py-2.5 text-[15px] rounded-xl text-ink-main tabular-nums placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${error ? 'border-status-danger' : 'border-ivory-border'} ${className}`}
      />
      {error && <span className="text-xs text-status-danger">{error}</span>}
    </div>
  );
}
