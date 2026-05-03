import { useEffect, useState } from "react";
import PageIntroCard from "../components/PageIntroCard";
import SuggestionForm from "../components/SuggestionForm";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";
import { fetchTwitchChannelProfile } from "../lib/twitch";

function ParticipantsPage() {
  const {
    items: participants,
    loading,
    error,
  } = useCollectionData(collectionNames.participants);
  const [resolvedProfiles, setResolvedProfiles] = useState({});

  useEffect(() => {
    const unresolvedParticipants = participants.filter(
      (participant) =>
        participant.href &&
        (!participant.name || !participant.channel || !participant.imageUrl) &&
        !Object.prototype.hasOwnProperty.call(resolvedProfiles, participant.id)
    );

    if (!unresolvedParticipants.length) {
      return;
    }

    let cancelled = false;

    Promise.all(
      unresolvedParticipants.map(async (participant) => {
        try {
          const profile = await fetchTwitchChannelProfile(participant.href);
          return [participant.id, profile];
        } catch {
          return [participant.id, null];
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setResolvedProfiles((current) => {
        const next = { ...current };
        entries.forEach(([participantId, profile]) => {
          next[participantId] = profile;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [participants, resolvedProfiles]);

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Легенды твича"
        eyebrow="Участники"
        title="Участники сообщества"
        // titleAction={<SuggestionForm type="participant" />}
      >
        {loading ? <div className="state-box">Загружаем участников...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          participants.length ? (
            <div className="participants-grid">
              {participants.map((participant) => {
                const profile = resolvedProfiles[participant.id];
                const participantName = participant.name || profile?.displayName || "Участник";
                const participantChannel =
                  participant.channel ||
                  (profile?.login ? `twitch.tv/${profile.login}` : "") ||
                  participant.href;
                const participantImageUrl =
                  participant.imageUrl || profile?.profileImageUrl || "";
                const participantDescription =
                  participant.description || profile?.description || "";

                return (
                  <a
                    className="participant-card"
                    href={participant.href}
                    key={participant.id}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
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
