import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'title' | 'card' | 'circle' | 'tableRow' | 'custom';
  className?: string;
  count?: number;
}

const Skeleton: React.FC<SkeletonProps> = ({ variant = 'custom', className = '', count = 1 }) => {
  const classes = {
    text: 'skeleton skeleton-text',
    title: 'skeleton skeleton-title',
    card: 'skeleton skeleton-card',
    circle: 'skeleton skeleton-circle',
    tableRow: 'skeleton skeleton-table-row',
    custom: 'skeleton',
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`${classes[variant]} ${className}`.trim()}
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </>
  );
};

export default Skeleton;
