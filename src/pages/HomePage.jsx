import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { homeHeroLines } from "../data/siteData";
import useSectionSnap from "../hooks/useSectionSnap";
import { extractTwitchChannelLogin, fetchTwitchChannelProfile, fetchTwitchLiveStatuses } from "../lib/twitch";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function HomePage() {
  const joinHref = "https://clck.ru/3TQG34";
  const heroLinks = [
    {
      label: "Правила",
      href: "https://docs.google.com/spreadsheets/d/1hnTlFLwf_wfy3xviqUAXE9yQ6bFbsgnOqHQo6_WBpas/edit?gid=0#gid=0",
    },
    {
      label: "Описание",
      href: "https://drive.google.com/file/d/1KHPyTOIIftW5uL5bjNK9GFAkVtio2IEq/view",
    },
    {
      label: "Чат ТГ",
      href: "https://t.me/+J9-liq6gEh0xMWYy",
    },
    {
      label: "Политика ПДн",
      href: "/privacy",
    },
  ];
  const sectionRefs = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);
  const [ctaReady, setCtaReady] = useState(false);
  const activeHomeSections = [];
  const [visibleSections, setVisibleSections] = useState(() =>
    activeHomeSections.map(() => false)
  );
  
  // Загрузка данных участников для отображения онлайн-стримеров
  const { items: participants } = useCollectionData(collectionNames.participants);
  const [liveStatuses, setLiveStatuses] = useState({});
  const [resolvedProfiles, setResolvedProfiles] = useState({});
  const [displayedStreamers, setDisplayedStreamers] = useState([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Получаем список онлайн-стримеров
  const onlineStreamers = useMemo(() => {
    if (!participants.length) return [];
    
    const streamersWithStatus = participants
      .map((participant) => {
        const profile = resolvedProfiles[participant.id];
        const login = profile?.login || extractTwitchChannelLogin(participant.href);
        const isLive = Boolean(login && liveStatuses[login]);
        const imageUrl = participant.imageUrl || profile?.profileImageUrl;
        const displayName = participant.name || profile?.displayName || login || "Стример";
        
        return { login, isLive, imageUrl, displayName, href: participant.href };
      })
      .filter((s) => s.isLive && s.login);
    
    return streamersWithStatus;
  }, [participants, resolvedProfiles, liveStatuses]);

  // Логика прокрутки списка стримеров
  useEffect(() => {
    if (onlineStreamers.length <= 5) {
      setDisplayedStreamers(onlineStreamers.slice(0, 5));
      setScrollOffset(0);
      return;
    }

    // Показываем первые 5 стримеров
    const initialStreamers = onlineStreamers.slice(0, 5);
    setDisplayedStreamers(initialStreamers);

    const intervalId = setInterval(() => {
      setScrollOffset((prev) => {
        const newOffset = prev + 1;
        if (newOffset >= onlineStreamers.length) {
          return 0;
        }
        return newOffset;
      });
    }, 7000);

    return () => clearInterval(intervalId);
  }, [onlineStreamers]);

  useEffect(() => {
    if (onlineStreamers.length > 5) {
      const visible = [];
      for (let i = 0; i < 5; i++) {
        const index = (scrollOffset + i) % onlineStreamers.length;
        visible.push(onlineStreamers[index]);
      }
      setDisplayedStreamers(visible);
    }
  }, [scrollOffset, onlineStreamers]);

  useEffect(() => {
    if (!participants.length) {
      return;
    }

    let cancelled = false;

    const loadAllData = async () => {
      const unresolvedParticipants = participants.filter(
        (participant) =>
          participant.href &&
          (!participant.name || !participant.channel || !participant.imageUrl) &&
          !Object.prototype.hasOwnProperty.call(resolvedProfiles, participant.id)
      );

      const participantLinks = participants
        .map((participant) => participant.href)
        .filter((href) => extractTwitchChannelLogin(href));

      const profilesPromise = unresolvedParticipants.length
        ? Promise.all(
            unresolvedParticipants.map(async (participant) => {
              try {
                const profile = await fetchTwitchChannelProfile(participant.href);
                return [participant.id, profile];
              } catch {
                return [participant.id, null];
              }
            })
          )
        : Promise.resolve([]);

      const liveStatusesPromise = participantLinks.length
        ? fetchTwitchLiveStatuses(participantLinks)
        : Promise.resolve({});

      try {
        const [profileEntries, nextStatuses] = await Promise.all([
          profilesPromise,
          liveStatusesPromise,
        ]);

        if (cancelled) {
          return;
        }

        if (profileEntries.length) {
          setResolvedProfiles((current) => {
            const next = { ...current };
            profileEntries.forEach(([participantId, profile]) => {
              next[participantId] = profile;
            });
            return next;
          });
        }

        setLiveStatuses(nextStatuses);
      } catch {
        if (!cancelled) {
          setLiveStatuses({});
        }
      }
    };

    loadAllData();

    let intervalId = null;
    const fiveMinuteTimerId = window.setTimeout(() => {
      const refreshLiveStatuses = async () => {
        const participantLinksForRefresh = participants
          .map((participant) => participant.href)
          .filter((href) => extractTwitchChannelLogin(href));

        if (!participantLinksForRefresh.length) {
          return;
        }

        try {
          const nextStatuses = await fetchTwitchLiveStatuses(participantLinksForRefresh);
          if (!cancelled) {
            setLiveStatuses(nextStatuses);
          }
        } catch {
          // Игнорируем ошибки при обновлении
        }
      };

      refreshLiveStatuses();
      intervalId = window.setInterval(refreshLiveStatuses, 10 * 60 * 1000);
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(fiveMinuteTimerId);
      window.clearInterval(intervalId);
    };
  }, [participants]);

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

      <div
        className={`hero-links ${ctaReady ? "hero-links--visible" : ""}`}
        aria-label="Полезные ссылки"
      >
        {heroLinks.map((link) =>
          link.href.startsWith("/") ? (
            <Link key={link.label} className="hero-links__item hero-links__item--legal" to={link.href}>
              {link.label}
            </Link>
          ) : (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="hero-links__item"
            >
              {link.label}
            </a>
          )
        )}
      </div>

      {/* Список активных стримеров */}
      {displayedStreamers.length > 0 && (
        <div
          className={`active-streamers-wrapper ${
            ctaReady ? "active-streamers-wrapper--visible" : ""
          }`}
          aria-label="Активные стримеры"
        >
          <div className="live-badge">LIVE</div>
          <div className="active-streamers-list">
            {displayedStreamers.map((streamer) => (
              <a
                key={streamer.login}
                href={streamer.href}
                target="_blank"
                rel="noreferrer noopener"
                className="active-streamers-list__item"
                aria-label={`Смотреть ${streamer.displayName}`}
              >
                {streamer.imageUrl ? (
                  <img src={streamer.imageUrl} alt={streamer.displayName} />
                ) : (
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    background: 'rgba(224, 84, 84, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: '#fff'
                  }}>
                    {streamer.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="active-streamers-list__tooltip">{streamer.displayName}</span>
              </a>
            ))}
          </div>
        </div>
      )}

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

          <div className={`hero-legal ${ctaReady ? "hero-legal--visible" : ""}`}>
            Отправляя заявки и подключая Twitch-канал, вы соглашаетесь с
            {" "}
            <Link className="hero-legal__link" to="/privacy">
              политикой обработки персональных данных
            </Link>
            .
          </div>
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
