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
  const containerRef = useRef(null);
  const rowRefs = useRef([]);
  const mouseXRef = useRef(0);
  const scrollYRef = useRef(0);

  const totalItems = Math.max(1, rows * cols);
  const combinedItems = useMemo(() => {
    const fallbackItems = Array.from({ length: totalItems }, (_, index) => `Item ${index + 1}`);
    return items.length > 0 ? items.slice(0, totalItems) : fallbackItems;
  }, [items, totalItems]);

  useEffect(() => {
    gsap.ticker.lagSmoothing(0);
    mouseXRef.current = window.innerWidth / 2;
    scrollYRef.current = window.scrollY;
    
    let isHovering = false;
    let autoAnimTime = 0;
    let rafId = null;

    const handleMouseMove = e => {
      mouseXRef.current = e.clientX;
      isHovering = true;
    };

    const handleMouseLeave = () => {
      isHovering = false;
    };

    const handleScroll = () => {
      if (rafId) return; // Throttle med requestAnimationFrame
      rafId = requestAnimationFrame(() => {
        scrollYRef.current = window.scrollY;
        rafId = null;
      });
    };

    // Skapa quickTo för smoothare container-animationer
    let containerRotation, containerScale;
    if (containerRef.current) {
      containerRotation = gsap.quickTo(containerRef.current, 'rotation', {
        duration: 1.2,
        ease: 'power2.out'
      });
      containerScale = gsap.quickTo(containerRef.current, 'scale', {
        duration: 1.2,
        ease: 'power2.out'
      });
    }

    const updateMotion = () => {
      const maxMoveAmount = 300;
      const baseDuration = 0.8;
      const inertiaFactors = [0.6, 0.4, 0.3, 0.2];

      // Öka tid för auto-animation
      autoAnimTime += 0.01;

      // Scroll-baserad rotation och zoom (smoothare med quickTo)
      const scrollProgress = scrollYRef.current / (window.innerHeight * 0.5);
      const rotation = scrollProgress * 8;
      const scale = Math.min(1 + (scrollProgress * 0.05), 1.15);

      if (containerRotation && containerScale) {
        containerRotation(rotation);
        containerScale(scale);
      }

      rowRefs.current.forEach((row, index) => {
        if (row) {
          const direction = index % 2 === 0 ? 1 : -1;
          
          // Kombinera auto-drift, scroll-parallax och musinteraktion
          const offset = index * 0.7;
          const amplitude = 60 + (index * 20);
          const autoDrift = Math.sin(autoAnimTime + offset) * amplitude * direction;
          
          // Parallax-effekt baserat på scroll
          const scrollParallax = (scrollYRef.current * (0.3 + index * 0.15)) * direction;
          
          let moveAmount;
          if (isHovering) {
            // Musinteraktion (men behåll lite av scroll-effekten)
            const mouseMove = ((mouseXRef.current / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) * direction;
            moveAmount = mouseMove + scrollParallax * 0.3;
          } else {
            // Auto-drift + scroll-parallax
            moveAmount = autoDrift + scrollParallax;
          }

          gsap.to(row, {
            x: moveAmount,
            duration: isHovering ? baseDuration + inertiaFactors[index % inertiaFactors.length] : 1.2,
            ease: isHovering ? 'power3.out' : 'power1.inOut',
            overwrite: 'auto'
          });
        }
      });
    };

    gsap.ticker.add(updateMotion);

    const gridElement = gridRef.current;
    if (gridElement) {
      gridElement.addEventListener('mousemove', handleMouseMove);
      gridElement.addEventListener('mouseleave', handleMouseLeave);
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (gridElement) {
        gridElement.removeEventListener('mousemove', handleMouseMove);
        gridElement.removeEventListener('mouseleave', handleMouseLeave);
      }
      window.removeEventListener('scroll', handleScroll);
      gsap.ticker.remove(updateMotion);
      if (rafId) cancelAnimationFrame(rafId);
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
          ref={containerRef}
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
