import { useEffect, useMemo, useRef, useState } from "react";
import { homeHeroLines, homeSections } from "../data/siteData";
import useSectionSnap from "../hooks/useSectionSnap";

function HomePage() {
  const sectionRefs = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);
  const [visibleSections, setVisibleSections] = useState(() =>
    homeSections.map(() => false)
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
    const sections = sectionRefs.current.filter(Boolean);
    if (!sections.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.dataset.index);
          if (entry.isIntersecting) {
            setActiveIndex(index);
          }

          setVisibleSections((current) => {
            const next = [...current];
            next[index - 1] = entry.intersectionRatio > 0.3;
            return next;
          });
        });
      },
      { threshold: [0.3, 0.6] }
    );

    sections.slice(1).forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <main className="home-page">
      <div className="cursor-glow" aria-hidden="true" />

      <div className="screen-dots" aria-label="Навигация по блокам">
        {[0, ...homeSections.map((_, index) => index + 1)].map((index) => (
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

          <div className="scroll-indicator">
            <span>Scroll</span>
            <div className="scroll-indicator__line" />
          </div>
        </section>

        {homeSections.map((section, index) => (
          <section
            key={section.id}
            className="screen"
            data-index={index + 1}
            ref={(node) => {
              sectionRefs.current[index + 1] = node;
            }}
          >
            <div
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

                <div className="feature-card__stats">
                  {section.stats.map((stat) => (
                    <div className="feature-card__stat" key={stat.label}>
                      <div className="feature-card__stat-value">{stat.value}</div>
                      <div className="feature-card__stat-label">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export default HomePage;
