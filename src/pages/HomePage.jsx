import { useEffect, useMemo, useRef, useState } from "react";
import { homeHeroLines } from "../data/siteData";
import useSectionSnap from "../hooks/useSectionSnap";

function HomePage() {
  const joinHref = "https://clck.ru/3TQG34";
  const sectionRefs = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);
  const [ctaReady, setCtaReady] = useState(false);
  const activeHomeSections = [];
  const [visibleSections, setVisibleSections] = useState(() =>
    activeHomeSections.map(() => false)
  );
  const particleSpecs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        id: index,
        size: 60 + index * 20,
        left: `${10 + index * 11}%`,
        duration: `${8 + index * 1.2}s`,
        delay: `${index * 0.35}s`,
        variant: ["gold", "bronze", "light"][index % 3],
      })),
    []
  );

  useSectionSnap(sectionRefs, activeIndex, setActiveIndex);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHeroVisible(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCtaReady(true);
    }, 2700);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sections = sectionRefs.current.filter(Boolean);
    if (!sections.length) {
      return undefined;
    }

    const intersectionRatios = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.dataset.index);
          intersectionRatios.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);

          setVisibleSections((current) => {
            const next = [...current];
            if (index > 0) {
              next[index - 1] = entry.intersectionRatio > 0.3;
            }
            return next;
          });
        });

        let nextActiveIndex = 0;
        let maxRatio = 0;

        intersectionRatios.forEach((ratio, index) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            nextActiveIndex = index;
          }
        });

        setActiveIndex(nextActiveIndex);
      },
      { threshold: [0.3, 0.6] }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <main className="home-page">
      <div className="cursor-glow" aria-hidden="true" />

      <div className="screen-dots" aria-label="Навигация по блокам">
        {[0, ...activeHomeSections.map((_, index) => index + 1)].map((index) => (
          <button
            key={index}
            aria-label={`Экран ${index + 1}`}
            className={`screen-dots__item ${
              activeIndex === index ? "screen-dots__item--active" : ""
            }`}
            onClick={() => {
              const target = sectionRefs.current[index];
              if (target) {
                setActiveIndex(index);
                window.scrollTo({
                  top: Math.round(target.getBoundingClientRect().top + window.scrollY),
                  behavior: "smooth",
                });
              }
            }}
            type="button"
          />
        ))}
      </div>

      <div className="home-scroll">
        <section
          className="screen screen--hero"
          data-index="0"
          ref={(node) => {
            sectionRefs.current[0] = node;
          }}
        >
          <div className="smoke-particles" aria-hidden="true">
            {particleSpecs.map((particle) => (
              <span
                key={particle.id}
                className={`particle particle--${particle.variant}`}
                style={{
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  left: particle.left,
                  animationDuration: particle.duration,
                  animationDelay: particle.delay,
                }}
              />
            ))}
          </div>

          <div className="hero-copy">
            {homeHeroLines.map((line, index) => (
              <div
                key={line}
                className={`hero-copy__line ${
                  heroVisible ? "hero-copy__line--visible" : ""
                }`}
                style={{ transitionDelay: `${0.3 + index * 0.5}s` }}
              >
                <span>{line}</span>
              </div>
            ))}
          </div>

          <a
            className={`scroll-indicator ${
              ctaReady ? "scroll-indicator--cta" : ""
            }`}
            href={joinHref}
            rel="noreferrer noopener"
            target="_blank"
          >
            <span>Вступить</span>
            <div className="scroll-indicator__line" />
          </a>
        </section>

        {/*
          Временно отключили нижний блок главной.
          Чтобы вернуть его обратно, достаточно снова рендерить `homeSections`.
        */}
        {activeHomeSections.map((section, index) => (
          <section
            key={section.id}
            className="screen"
            data-index={index + 1}
            ref={(node) => {
              sectionRefs.current[index + 1] = node;
            }}
          >
            <a href={joinHref}
              target="_blank"
              rel="noreferrer noopener"
              className={`feature-card ${
                visibleSections[index] ? "feature-card--visible" : ""
              }`}
            >
              <div className="feature-card__number">{section.id}</div>
              <div className="feature-card__content">
                <span className={`feature-card__tag feature-card__tag--${section.tagTone}`}>
                  {section.tag}
                </span>
                <h2 className="feature-card__title">{section.title}</h2>
                <p className="feature-card__text">{section.description}</p>
              </div>
            </a>
          </section>
        ))}
      </div>
    </main>
  );
}

export default HomePage;
