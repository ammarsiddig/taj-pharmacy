import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
}

export default function Card({ children, className = '', onClick, as = 'div' }: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={`app-card p-4 ${className}`}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
