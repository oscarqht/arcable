import React from 'react';
import { Space } from '../../types/workspace';

interface SpaceIconProps {
  space: Space;
  size?: number;
  className?: string;
}

/** Shows the matching Raindrop collection cover, with the local emoji as a fallback. */
export const SpaceIcon: React.FC<SpaceIconProps> = ({ space, size = 20, className }) => {
  if (!space.coverUrl) return <span className={className}>{space.emojiIcon || '📁'}</span>;

  return (
    <img
      className={className}
      src={space.coverUrl}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  );
};
