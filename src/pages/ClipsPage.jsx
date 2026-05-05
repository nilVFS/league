import { useEffect, useMemo, useState } from "react";
import ClipModal from "../components/ClipModal";
import PageIntroCard from "../components/PageIntroCard";
import SuggestionForm from "../components/SuggestionForm";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";
import {
  extractTwitchClipSlug,
  fetchTwitchClipThumbnailBySlug,
} from "../lib/twitch";

const NEW_CLIP_WINDOW_MS = 24 * 60 * 60 * 1000;

function getClipTimestampMs(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function ClipsPage() {
  const { items: clips, loading, error } = useCollectionData(collectionNames.clips);
  const [selectedClip, setSelectedClip] = useState(null);
  const [resolvedThumbnails, setResolvedThumbnails] = useState({});
  const sortedClips = useMemo(() => {
    return [...clips].sort((left, right) => {
      const leftCreatedAtMs = getClipTimestampMs(left.importedAt || left.createdAt);
      const rightCreatedAtMs = getClipTimestampMs(right.importedAt || right.createdAt);
      const now = Date.now();
      const leftIsNew = leftCreatedAtMs && now - leftCreatedAtMs < NEW_CLIP_WINDOW_MS;
      const rightIsNew = rightCreatedAtMs && now - rightCreatedAtMs < NEW_CLIP_WINDOW_MS;

      if (leftIsNew !== rightIsNew) {
        return Number(rightIsNew) - Number(leftIsNew);
      }

      return 0;
    });
  }, [clips]);

  useEffect(() => {
    const clipsWithoutThumbnail = clips.filter(
      (clip) =>
        clip.clipSlug &&
        !clip.thumbnailUrl &&
        !Object.prototype.hasOwnProperty.call(resolvedThumbnails, clip.id)
    );

    if (!clipsWithoutThumbnail.length) {
      return;
    }

    let cancelled = false;

    Promise.all(
      clipsWithoutThumbnail.map(async (clip) => {
        try {
          const thumbnailUrl = await fetchTwitchClipThumbnailBySlug(clip.clipSlug);
          return [clip.id, thumbnailUrl];
        } catch {
          return [clip.id, ""];
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setResolvedThumbnails((current) => {
        const next = { ...current };
        entries.forEach(([clipId, thumbnailUrl]) => {
          next[clipId] = thumbnailUrl;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clips, resolvedThumbnails]);

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Здесь собраны клипы участников. Вы можете предлагать свои клипы."
        eyebrow="Клипы"
        title="Подборка лучших клипов"
        titleAction={<SuggestionForm type="clip" />}
      >
        {loading ? <div className="state-box">Загружаем клипы...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          clips.length ? (
            <div className="clips-grid">
              {sortedClips.map((clip) => {
                const createdAtMs = getClipTimestampMs(clip.importedAt || clip.createdAt);
                const isNew =
                  createdAtMs &&
                  Date.now() - createdAtMs < NEW_CLIP_WINDOW_MS;

                return (
                  <article className="clip-card" key={clip.id} onClick={() => setSelectedClip(clip)}>
                    {isNew ? <div className="clip-card__new-badge">NEW</div> : null}
                    <div className="clip-card__preview">
                      {clip.thumbnailUrl || resolvedThumbnails[clip.id] ? (
                        <img
                          alt={clip.title}
                          className="clip-card__thumbnail"
                          src={clip.thumbnailUrl || resolvedThumbnails[clip.id]}
                        />
                      ) : clip.clipSlug ? (
                        <div className="clip-card__placeholder">
                          <span>Twitch Clip</span>
                          <strong>{clip.title || extractTwitchClipSlug(clip.clipSlug)}</strong>
                        </div>
                      ) : (
                        <div className="clip-card__placeholder">
                          <span>Twitch Clip</span>
                          <strong>{clip.title || "Ссылка не указана"}</strong>
                        </div>
                      )}
                    </div>
                    <div className="clip-card__body">
                      {clip.broadcasterName ? (
                        <div className="clip-card__channel">{clip.broadcasterName}</div>
                      ) : null}
                      <div className="clip-card__title">{clip.title}</div>
                      <div className="clip-card__text">
                        {clip.preview || clip.description || "Откройте клип, чтобы посмотреть запись."}
                      </div>
                    </div>
                  </article>
                );
              })}
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
