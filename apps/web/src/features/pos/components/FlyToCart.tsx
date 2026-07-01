import React, { useState, useEffect } from 'react';
import { EventBus } from '@logiscore/core';

interface FlyAnimation {
  id: string;
  fromX: number;
  fromY: number;
  imageUrl: string;
  destX: number;
  destY: number;
}

export const FlyToCart = () => {
  const [animations, setAnimations] = useState<FlyAnimation[]>([]);

  useEffect(() => {
    const sub = EventBus.on('CART.ADD_ANIMATION', (payload: unknown) => {
      const { fromX, fromY, imageUrl } = payload as { fromX: number; fromY: number; imageUrl: string };
      const badge = document.querySelector('[data-cart-badge]');
      if (!badge) return;

      const rect = badge.getBoundingClientRect();
      const destX = rect.left + rect.width / 2 - fromX;
      const destY = rect.top + rect.height / 2 - fromY;

      const id = Math.random().toString(36).substr(2, 9);
      setAnimations((prev) => [...prev, { id, fromX, fromY, imageUrl, destX, destY }]);

      setTimeout(() => {
        setAnimations((prev) => prev.filter((a) => a.id !== id));
      }, 800);
    });
    return () => EventBus.off(sub);
  }, []);

  if (animations.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-1000">
      {animations.map((anim) => (
        <div
          key={anim.id}
          className="absolute w-12 h-12 rounded-full overflow-hidden shadow-xl animate-fly-to-cart"
          style={{
            left: anim.fromX,
            top: anim.fromY,
            transform: 'translate(-50%, -50%)',
            '--fly-x': `${anim.destX}px`,
            '--fly-y': `${anim.destY}px`,
          } as React.CSSProperties}
        >
          {anim.imageUrl && (
            <img
              src={anim.imageUrl}
              alt="flying"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );
};
