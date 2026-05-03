import { useEffect } from "react";
import { getTwitchClipEmbedUrl } from "../lib/twitch";

function ClipModal({ clip, onClose }) {
  useEffect(() => {
    if (!clip) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [clip, onClose]);

  if (!clip) {
    return null;
  }

  const embedUrl = getTwitchClipEmbedUrl(clip.clipSlug);

  return (
    <div
      aria-hidden={clip ? "false" : "true"}
      className="modal is-open"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal__dialog">
        <button
          aria-label="Закрыть"
          className="modal__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        {embedUrl ? (
          <iframe
            allowFullScreen
            className="modal__iframe"
            src={embedUrl}
            title={clip.title}
          />
        ) : (
          <div className="modal__empty">Для этого клипа не указан Twitch slug.</div>
        )}
        <div className="modal__meta">
          <div className="modal__title">{clip.title}</div>
          <div className="modal__text">{clip.description}</div>
        </div>
      </div>
    </div>
  );
}

export default ClipModal;
