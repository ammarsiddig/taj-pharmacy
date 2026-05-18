interface SkeletonProps {
  width?: string;
  height?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

export default function Skeleton({ width = '100%', height = '16px', rounded = 'sm', className = '' }: SkeletonProps) {
  const roundedMap = { sm: '4px', md: '8px', lg: '12px', full: '9999px' };
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: roundedMap[rounded] }}
      aria-hidden="true"
    />
  );
}
