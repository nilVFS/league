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

function formatDateKey(timestampMs) {
  const date = new Date(timestampMs);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ClipsPage() {
  const { items: clips, loading, error } = useCollectionData(collectionNames.clips);
  const [selectedClip, setSelectedClip] = useState(null);
  const [resolvedThumbnails, setResolvedThumbnails] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClips = useMemo(() => {
    if (!searchQuery.trim()) {
      return clips;
    }
    const query = searchQuery.toLowerCase().trim();
    return clips.filter((clip) => {
      const title = clip.title?.toLowerCase() || "";
      const channel = clip.broadcasterName?.toLowerCase() || "";
      return title.includes(query) || channel.includes(query);
    });
  }, [clips, searchQuery]);

  const groupedClips = useMemo(() => {
    const groups = {};
    filteredClips.forEach((clip) => {
      const createdAtMs = getClipTimestampMs(clip.importedAt || clip.createdAt);
      const dateKey = formatDateKey(createdAtMs);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(clip);
    });
    return groups;
  }, [filteredClips]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedClips).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB - dateA;
    });
  }, [groupedClips]);

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
            <>
              <div className="clips-search">
                <input
                  type="text"
                  className="clips-search__input"
                  placeholder="Поиск по названию или каналу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {sortedDateKeys.map((dateKey) => (
                <section key={dateKey} className="clips-day-group">
                  <h2 className="clips-day-group__title">{dateKey}</h2>
                  <div className="clips-grid">
                    {groupedClips[dateKey].map((clip) => {
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
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
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
