import { useEffect, useMemo, useState } from "react";
import PageIntroCard from "../components/PageIntroCard";
import SuggestionForm from "../components/SuggestionForm";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";
import {
  extractTwitchChannelLogin,
  fetchTwitchChannelProfile,
  fetchTwitchLiveStatuses,
} from "../lib/twitch";

function ParticipantsPage() {
  const {
    items: participants,
    loading,
    error,
  } = useCollectionData(collectionNames.participants);
  const [resolvedProfiles, setResolvedProfiles] = useState({});
  const [liveStatuses, setLiveStatuses] = useState({});

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((left, right) => {
      const leftProfile = resolvedProfiles[left.id];
      const rightProfile = resolvedProfiles[right.id];
      const leftLogin = leftProfile?.login || extractTwitchChannelLogin(left.href);
      const rightLogin = rightProfile?.login || extractTwitchChannelLogin(right.href);
      const leftIsLive = Number(Boolean(leftLogin && liveStatuses[leftLogin]));
      const rightIsLive = Number(Boolean(rightLogin && liveStatuses[rightLogin]));

      if (leftIsLive !== rightIsLive) {
        return rightIsLive - leftIsLive;
      }

      return 0;
    });
  }, [participants, resolvedProfiles, liveStatuses]);

  useEffect(() => {
    if (!participants.length) {
      return;
    }

    let cancelled = false;

    const loadAllData = async () => {
      // Собираем всех участников, которым нужны профили
      const unresolvedParticipants = participants.filter(
        (participant) =>
          participant.href &&
          (!participant.name || !participant.channel || !participant.imageUrl) &&
          !Object.prototype.hasOwnProperty.call(resolvedProfiles, participant.id)
      );

      // Собираем все ссылки для проверки статуса онлайн
      const participantLinks = participants
        .map((participant) => participant.href)
        .filter((href) => extractTwitchChannelLogin(href));

      // Загружаем профили и статусы онлайн параллельно
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

        // Обновляем профили, если есть новые
        if (profileEntries.length) {
          setResolvedProfiles((current) => {
            const next = { ...current };
            profileEntries.forEach(([participantId, profile]) => {
              next[participantId] = profile;
            });
            return next;
          });
        }

        // Обновляем статусы онлайн
        setLiveStatuses(nextStatuses);
      } catch {
        if (!cancelled) {
          setLiveStatuses({});
        }
      }
    };

    loadAllData();

    // Настраиваем периодическое обновление статуса онлайн
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

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Легенды твича"
        eyebrow="Участники"
        title="Участники сообщества"
        titleAction={
          <SuggestionForm
            participantMode="linkOnly"
            triggerLabel="Подать заявку"
            type="participant"
          />
        }
      >
        {loading ? <div className="state-box">Загружаем участников...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          participants.length ? (
            <div className="participants-grid">
              {sortedParticipants.map((participant) => {
                const profile = resolvedProfiles[participant.id];
                const participantName = participant.name || profile?.displayName || "Участник";
                const participantChannel =
                  participant.channel ||
                  (profile?.login ? `twitch.tv/${profile.login}` : "") ||
                  participant.href;
                const participantImageUrl =
                  participant.imageUrl || profile?.profileImageUrl || "";
                const participantDescription = participant.description || "";
                const participantLogin =
                  profile?.login || extractTwitchChannelLogin(participant.href);
                const isLive = Boolean(participantLogin && liveStatuses[participantLogin]);

                return (
                  <a
                    className={`participant-card ${
                      isLive ? "participant-card--live" : ""
                    }`}
                    href={participant.href}
                    key={participant.id}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {isLive ? <div className="participant-card__live-badge">LIVE</div> : null}
                    {participantImageUrl ? (
                      <img
                        alt={`Аватар ${participantName}`}
                        className="participant-card__image"
                        src={participantImageUrl}
                      />
                    ) : (
                      <div className="clip-card__placeholder participant-card__placeholder">
                        <span>Участник</span>
                        <strong>{participantName}</strong>
                      </div>
                    )}
                    <div className="participant-card__body">
                      <div className="participant-card__name">{participantName}</div>
                      <div className="participant-card__channel">{participantChannel}</div>
                      {participantDescription ? (
                        <div className="participant-card__description">
                          {participantDescription}
                        </div>
                      ) : null}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="state-box">Пока нет участников. Добавь их через `/admin`.</div>
          )
        ) : null}
      </PageIntroCard>
    </main>
  );
}

export default ParticipantsPage;
