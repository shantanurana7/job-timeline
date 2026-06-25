import { getInitials } from '@/lib/utils';

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#06b6d4','#22c55e','#f59e0b','#ef4444','#3b82f6',
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ firstName = '', lastName = '', avatarUrl, size = 'md' }: AvatarProps) {
  const initials = getInitials(firstName, lastName);
  const color = getColor(firstName + lastName);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className={`avatar avatar-${size}`}
        style={{ objectFit: 'cover' }}
      />
    );
  }

  return (
    <div
      className={`avatar avatar-${size}`}
      style={{ background: `${color}20`, color }}
    >
      {initials}
    </div>
  );
}
