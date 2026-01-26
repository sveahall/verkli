'use client';

import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * @typedef {string | import('react').ReactNode} GridItem
 * @param {{
 *  items?: GridItem[],
 *  gradientColor?: string,
 *  rows?: number,
 *  cols?: number
 * }} props
 */
const GridMotion = ({ items = [], gradientColor = 'black', rows = 4, cols = 7 }) => {
  const gridRef = useRef(null);
  const rowRefs = useRef([]);
  const mouseXRef = useRef(0);

  const totalItems = Math.max(1, rows * cols);
  const combinedItems = useMemo(() => {
    const fallbackItems = Array.from({ length: totalItems }, (_, index) => `Item ${index + 1}`);
    return items.length > 0 ? items.slice(0, totalItems) : fallbackItems;
  }, [items, totalItems]);

  useEffect(() => {
    gsap.ticker.lagSmoothing(0);
    mouseXRef.current = window.innerWidth / 2;

    const handleMouseMove = e => {
      mouseXRef.current = e.clientX;
    };

    const updateMotion = () => {
      const maxMoveAmount = 300;
      const baseDuration = 0.8;
      const inertiaFactors = [0.6, 0.4, 0.3, 0.2];

      rowRefs.current.forEach((row, index) => {
        if (row) {
          const direction = index % 2 === 0 ? 1 : -1;
          const moveAmount = ((mouseXRef.current / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) * direction;

          gsap.to(row, {
            x: moveAmount,
            duration: baseDuration + inertiaFactors[index % inertiaFactors.length],
            ease: 'power3.out',
            overwrite: 'auto'
          });
        }
      });
    };

    gsap.ticker.add(updateMotion);

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      gsap.ticker.remove(updateMotion);
    };
  }, []);

  return (
    <div className="noscroll loading" ref={gridRef}>
      <section
        className="intro"
        style={{
          background: `radial-gradient(circle, ${gradientColor} 0%, transparent 100%)`
        }}
      >
        <div
          className="gridMotion-container"
          style={{
            '--grid-rows': rows,
            '--grid-cols': cols,
          }}
        >
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="row" ref={el => (rowRefs.current[rowIndex] = el)}>
              {Array.from({ length: cols }).map((_, itemIndex) => {
                const content = combinedItems[rowIndex * cols + itemIndex];
                return (
                  <div key={itemIndex} className="row__item">
                    <div className="row__item-inner" style={{ backgroundColor: '#111' }}>
                      {typeof content === 'string' && content.startsWith('http') ? (
                        <div
                          className="row__item-img"
                          style={{
                            backgroundImage: `url(${content})`
                          }}
                        ></div>
                      ) : (
                        <div className="row__item-content">{content}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="fullview"></div>
      </section>
    </div>
  );
};

export default GridMotion;
