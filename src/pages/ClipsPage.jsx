import { useState } from "react";
import ClipModal from "../components/ClipModal";
import PageIntroCard from "../components/PageIntroCard";
import SuggestionForm from "../components/SuggestionForm";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";
import { extractTwitchClipSlug } from "../lib/twitch";

function ClipsPage() {
  const { items: clips, loading, error } = useCollectionData(collectionNames.clips);
  const [selectedClip, setSelectedClip] = useState(null);

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Здесь собраны клипы в формате карточек. Список загружается из Firebase, а при нажатии открывается popup с выбранным видео."
        eyebrow="Клипы"
        title="Подборка лучших клипов"
        titleAction={<SuggestionForm type="clip" />}
      >
        {loading ? <div className="state-box">Загружаем клипы...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          clips.length ? (
            <div className="clips-grid">
              {clips.map((clip) => (
                <article
                  className="clip-card"
                  key={clip.id}
                  onClick={() => setSelectedClip(clip)}
                >
                  <div className="clip-card__preview">
                    {clip.thumbnailUrl ? (
                      <img alt={clip.title} className="clip-card__thumbnail" src={clip.thumbnailUrl} />
                    ) : clip.clipSlug ? (
                      <div className="clip-card__placeholder">
                        <span>Twitch Clip</span>
                        <strong>{extractTwitchClipSlug(clip.clipSlug)}</strong>
                      </div>
                    ) : (
                      <div className="clip-card__placeholder">
                        <span>Twitch Clip</span>
                        <strong>Slug не указан</strong>
                      </div>
                    )}
                  </div>
                  <div className="clip-card__body">
                    <div className="clip-card__title">{clip.title}</div>
                    <div className="clip-card__text">{clip.preview}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="state-box">Пока нет клипов. Добавь их через `/admin`.</div>
          )
        ) : null}
      </PageIntroCard>

      <ClipModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
    </main>
  );
}

export default ClipsPage;
