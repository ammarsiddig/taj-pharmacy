import { useState, useEffect, useCallback } from 'react';

interface NumpadProps {
  initialValue?: number;
  maxValue?: number;
  decimals?: number;
  isActive?: boolean;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export default function Numpad({
  initialValue = 0,
  maxValue,
  decimals = 2,
  isActive = true,
  onConfirm,
  onCancel,
}: NumpadProps) {
  const [display, setDisplay] = useState(() =>
    initialValue > 0
      ? decimals > 0
        ? initialValue.toFixed(decimals)
        : String(initialValue)
      : '',
  );

  const append = useCallback((char: string) => {
    setDisplay((prev) => {
      if (char === '.') {
        if (decimals === 0) return prev;
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const next = prev + char;
      const dotIdx = next.indexOf('.');
      if (dotIdx >= 0 && next.length - dotIdx - 1 > decimals) return prev;
      const num = parseFloat(next);
      if (maxValue !== undefined && num > maxValue) return prev;
      return next;
    });
  }, [decimals, maxValue]);

  const backspace = useCallback(() => setDisplay((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setDisplay(''), []);

  // Keyboard support
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      // Don't steal keyboard events from native text inputs
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ('0123456789'.includes(e.key)) {
        e.preventDefault();
        append(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        append('.');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(parseFloat(display) || 0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clear();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, append, backspace, clear, display, onConfirm, onCancel]);

  const buttons = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', '⌫'],
  ];

  return (
    <div className="bg-ivory-surface border border-ivory-border rounded-sm shadow-lg p-3 w-[240px] select-none" dir="ltr">
      {/* Display */}
      <div className="mb-2 px-3 py-2 bg-ivory-muted rounded-sm text-lg tabular-nums text-ink-main min-h-[40px] flex items-center">
        {display || <span className="text-ink-placeholder">0</span>}
      </div>

      {/* Digit grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        {buttons.flat().map((btn) => (
          <button
            key={btn}
            type="button"
            onClick={() => (btn === '⌫' ? backspace() : append(btn))}
            className="h-[48px] text-lg font-medium bg-ivory-muted border border-ivory-border rounded-sm text-ink-main active:bg-primary-100"
          >
            {btn}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            clear();
            onCancel();
          }}
          className="h-[44px] text-sm font-medium bg-ivory-muted border border-ivory-border rounded-sm text-ink-muted active:bg-status-danger-bg"
        >
          مسح
        </button>
        <button
          type="button"
          onClick={() => onConfirm(parseFloat(display) || 0)}
          className="h-[44px] text-sm font-bold bg-primary-600 rounded-sm text-ivory-surface active:bg-primary-700"
        >
          تأكيد
        </button>
      </div>
    </div>
  );
}
