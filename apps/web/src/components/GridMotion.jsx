'use client';

import { useEffect, useMemo, useRef } from 'react';

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
  const pointerXRef = useRef(0.5);
  const scrollYRef = useRef(0);
  const rafRef = useRef(0);
  const isVisibleRef = useRef(false);
  const isHoveringRef = useRef(false);
  const isPageVisibleRef = useRef(true);
  const reduceMotionRef = useRef(false);
  const shouldAnimateRef = useRef(true);

  const totalItems = Math.max(1, rows * cols);
  const combinedItems = useMemo(() => {
    const fallbackItems = Array.from({ length: totalItems }, (_, index) => `Item ${index + 1}`);
    return items.length > 0 ? items.slice(0, totalItems) : fallbackItems;
  }, [items, totalItems]);

  useEffect(() => {
    const gridElement = gridRef.current;
    const containerElement = containerRef.current;
    if (!gridElement || !containerElement) return;

    pointerXRef.current = 0.5;
    scrollYRef.current = window.scrollY;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileOrCoarseQuery = window.matchMedia('(max-width: 1024px), (pointer: coarse)');
    const rowPositions = rowRefs.current.map(() => 0);
    let autoAnimTime = 0;
    let containerRotation = 0;
    let containerScale = 1;
    let scrollRafId = 0;
    let lastFrame = 0;
    const frameInterval = 1000 / 45;

    const applyStaticLayout = () => {
      containerElement.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
      rowRefs.current.forEach((row, index) => {
        if (!row) return;
        rowPositions[index] = 0;
        row.style.transform = 'translate3d(0,0,0)';
      });
    };

    const stopAnimation = () => {
      if (!rafRef.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const startAnimation = () => {
      if (rafRef.current || !shouldAnimateRef.current || !isVisibleRef.current || !isPageVisibleRef.current) return;
      rafRef.current = requestAnimationFrame(updateMotion);
    };

    const syncMotionPreference = () => {
      reduceMotionRef.current = motionQuery.matches;
      shouldAnimateRef.current = !reduceMotionRef.current && !mobileOrCoarseQuery.matches;
      if (shouldAnimateRef.current) {
        startAnimation();
      } else {
        stopAnimation();
        applyStaticLayout();
      }
    };

    const updateMotion = (now) => {
      rafRef.current = 0;
      if (!shouldAnimateRef.current || !isVisibleRef.current || !isPageVisibleRef.current) return;
      if (now - lastFrame < frameInterval) {
        startAnimation();
        return;
      }

      const elapsed = lastFrame === 0 ? frameInterval : now - lastFrame;
      lastFrame = now;
      autoAnimTime += elapsed * 0.00042;

      const cappedScroll = Math.min(scrollYRef.current, window.innerHeight * 1.6);
      const scrollProgress = scrollYRef.current / (window.innerHeight * 0.75);
      const targetRotation = scrollProgress * 4.5;
      const targetScale = 1 + Math.min(scrollProgress * 0.03, 0.08);
      containerRotation += (targetRotation - containerRotation) * 0.08;
      containerScale += (targetScale - containerScale) * 0.08;
      containerElement.style.transform = `translate3d(0,0,0) rotate(${containerRotation.toFixed(3)}deg) scale(${containerScale.toFixed(3)})`;

      rowRefs.current.forEach((row, index) => {
        if (!row) return;
        const direction = index % 2 === 0 ? 1 : -1;
        const offset = index * 0.72;
        const amplitude = 22 + index * 8;
        const autoDrift = Math.sin(autoAnimTime + offset) * amplitude * direction;
        const scrollParallax = cappedScroll * (0.09 + index * 0.03) * direction;
        const pointerOffset = (pointerXRef.current - 0.5) * 160 * direction;
        const targetX = isHoveringRef.current
          ? pointerOffset + scrollParallax * 0.25
          : autoDrift + scrollParallax;

        rowPositions[index] += (targetX - rowPositions[index]) * (isHoveringRef.current ? 0.14 : 0.08);
        row.style.transform = `translate3d(${rowPositions[index].toFixed(2)}px,0,0)`;
      });

      startAnimation();
    };

    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      if (isPageVisibleRef.current) {
        startAnimation();
      } else {
        stopAnimation();
      }
    };

    const handlePointerMove = (event) => {
      pointerXRef.current = event.clientX / window.innerWidth;
      isHoveringRef.current = true;
      startAnimation();
    };

    const handlePointerLeave = () => {
      isHoveringRef.current = false;
      pointerXRef.current = 0.5;
      startAnimation();
    };

    const handleScroll = () => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollYRef.current = window.scrollY;
        scrollRafId = 0;
        startAnimation();
      });
    };

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (isVisibleRef.current) {
          startAnimation();
        } else {
          stopAnimation();
        }
      },
      { threshold: 0.08 }
    );
    visibilityObserver.observe(gridElement);

    isPageVisibleRef.current = !document.hidden;
    motionQuery.addEventListener('change', syncMotionPreference);
    mobileOrCoarseQuery.addEventListener('change', syncMotionPreference);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    gridElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    gridElement.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('scroll', handleScroll, { passive: true });
    syncMotionPreference();

    return () => {
      visibilityObserver.disconnect();
      motionQuery.removeEventListener('change', syncMotionPreference);
      mobileOrCoarseQuery.removeEventListener('change', syncMotionPreference);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      gridElement.removeEventListener('pointermove', handlePointerMove);
      gridElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('scroll', handleScroll);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      stopAnimation();
    };
  }, [cols, rows]);

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
