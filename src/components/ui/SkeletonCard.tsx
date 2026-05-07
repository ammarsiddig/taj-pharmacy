import React from 'react';

interface SkeletonCardProps {
  className?: string;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = '' }) => {
  return (
    <div className={`app-card p-5 animate-in ${className}`.trim()}>
      <div className="skeleton skeleton-circle mb-3" />
      <div className="skeleton skeleton-title mb-2" />
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-text mt-2" style={{ width: '40%' }} />
    </div>
  );
};

export default SkeletonCard;
