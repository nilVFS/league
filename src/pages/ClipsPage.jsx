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

function ClipsPage() {
  const { items: clips, loading, error } = useCollectionData(collectionNames.clips);
  const [selectedClip, setSelectedClip] = useState(null);
  const [resolvedThumbnails, setResolvedThumbnails] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClips = useMemo(() => {
    if (!searchQuery.trim()) return clips;
    const query = searchQuery.toLowerCase().trim();
    return clips.filter(
      (clip) =>
        clip.title?.toLowerCase().includes(query) ||
        clip.description?.toLowerCase().includes(query) ||
        clip.preview?.toLowerCase().includes(query) ||
        clip.broadcasterName?.toLowerCase().includes(query)
    );
  }, [clips, searchQuery]);

  useEffect(() => {
    const clipsWithoutThumbnail = filteredClips.filter(
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
  }, [filteredClips, resolvedThumbnails]);

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
            <>
              <div className="clips-search">
                <input
                  type="text"
                  placeholder="Поиск клипов..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="clips-search__input"
                />
              </div>
              <div className="clips-grid">
                {filteredClips.map((clip) => (
                  <article className="clip-card" key={clip.id} onClick={() => setSelectedClip(clip)}>
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
                ))}
              </div>
            </>
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
