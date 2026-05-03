import PageIntroCard from "../components/PageIntroCard";
import SuggestionForm from "../components/SuggestionForm";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function ParticipantsPage() {
  const {
    items: participants,
    loading,
    error,
  } = useCollectionData(collectionNames.participants);

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
              {participants.map((participant) => (
                <a
                  className="participant-card"
                  href={participant.href}
                  key={participant.id}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <img
                    alt={`Аватар ${participant.name}`}
                    className="participant-card__image"
                    src={participant.imageUrl}
                  />
                  <div className="participant-card__body">
                    <div className="participant-card__name">{participant.name}</div>
                    <div className="participant-card__channel">{participant.channel}</div>
                  </div>
                </a>
              ))}
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
