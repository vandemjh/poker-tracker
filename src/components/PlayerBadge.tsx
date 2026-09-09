import React from 'react';
import { getPlayerColors, getContrastTextColor } from '../utils/playerColors';

interface PlayerBadgeProps {
  name: string;
  className?: string;
  showSuit?: boolean;
}

const PlayerBadge: React.FC<PlayerBadgeProps> = ({
  name,
  className,
  showSuit = true,
}) => {
  const { color, suitChar } = getPlayerColors(name);
  const textColor = getContrastTextColor(color);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap align-middle ${className ?? ''}`}
      style={{ backgroundColor: color, color: textColor }}
    >
      {showSuit && <span>{suitChar}</span>}
      <span>{name}</span>
    </span>
  );
};

export default PlayerBadge;