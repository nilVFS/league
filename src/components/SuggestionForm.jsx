import { useEffect, useState } from "react";
import { collectionNames, createDocument } from "../lib/content";
import { extractTwitchClipSlug } from "../lib/twitch";

const initialClipState = {
  title: "",
  preview: "",
  description: "",
  clipSlug: "",
  thumbnailUrl: "",
  contact: "",
};

const initialParticipantState = {
  name: "",
  channel: "",
  href: "",
  imageUrl: "",
  contact: "",
};

function SuggestionForm({ type }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [clipForm, setClipForm] = useState(initialClipState);
  const [participantForm, setParticipantForm] = useState(initialParticipantState);

  const isClip = type === "clip";

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const reset = () => {
    setClipForm(initialClipState);
    setParticipantForm(initialParticipantState);
  };

  const getParticipantChannelLabel = (href, fallbackName = "") => {
    const value = href.trim();
    if (!value) {
      return fallbackName.trim();
    }

    try {
      const url = new URL(value);
      const channelName = url.pathname.split("/").filter(Boolean)[0];
      return channelName ? `${url.hostname}/${channelName}` : url.hostname;
    } catch {
      return fallbackName.trim() || value;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      if (isClip) {
        const title = clipForm.title.trim();
        const clipSlug = extractTwitchClipSlug(clipForm.clipSlug);

        if (!title) {
          throw new Error("Укажи название клипа.");
        }

        if (!clipSlug) {
          throw new Error("Укажи ссылку на Twitch Clip.");
        }

        await createDocument(collectionNames.suggestions, {
          type,
          status: "pending",
          title,
          preview: clipForm.preview.trim() || title,
          description: clipForm.description.trim() || clipForm.preview.trim() || title,
          clipSlug,
          thumbnailUrl: clipForm.thumbnailUrl.trim(),
          contact: clipForm.contact.trim(),
        });
      } else {
        const name = participantForm.name.trim();
        const href = participantForm.href.trim();

        if (!name) {
          throw new Error("Укажи ник участника.");
        }

        if (!href) {
          throw new Error("Укажи ссылку на канал.");
        }

        await createDocument(collectionNames.suggestions, {
          type,
          status: "pending",
          name,
          channel:
            participantForm.channel.trim() || getParticipantChannelLabel(href, name),
          href,
          imageUrl: participantForm.imageUrl.trim(),
          contact: participantForm.contact.trim(),
        });
      }

      reset();
      setOpen(false);
      setStatus("Спасибо. Предложение отправлено на модерацию.");
    } catch (error) {
      setStatus(error.message || "Не удалось отправить предложение.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="suggestion-box">
      <button
        className="admin-button suggestion-box__trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        Предложить
      </button>

      {status ? <div className="state-box">{status}</div> : null}

      {open ? (
        <div
          className="suggestion-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="suggestion-modal__dialog">
            <button
              aria-label="Закрыть"
              className="modal__close"
              onClick={() => setOpen(false)}
              type="button"
            >
              ×
            </button>

            <div className="suggestion-modal__header">
              <h2 className="suggestion-modal__title">
                {isClip ? "Предложить клип" : "Предложить участника"}
              </h2>
            </div>

            <form className="suggestion-form" onSubmit={handleSubmit}>
              {isClip ? (
                <>
                  <label className="admin-field">
                    <span>Название клипа</span>
                    <input
                      onChange={(event) =>
                        setClipForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                      type="text"
                      value={clipForm.title}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Короткий текст</span>
                    <textarea
                      onChange={(event) =>
                        setClipForm((current) => ({ ...current, preview: event.target.value }))
                      }
                      placeholder="Необязательно. Если пусто, подставим название."
                      rows="3"
                      value={clipForm.preview}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Описание</span>
                    <textarea
                      onChange={(event) =>
                        setClipForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Необязательно. Если пусто, возьмём короткий текст."
                      rows="4"
                      value={clipForm.description}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Ссылка на Twitch Clip или slug</span>
                    <input
                      onChange={(event) =>
                        setClipForm((current) => ({ ...current, clipSlug: event.target.value }))
                      }
                      required
                      type="text"
                      value={clipForm.clipSlug}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Ссылка на превью</span>
                    <input
                      onChange={(event) =>
                        setClipForm((current) => ({
                          ...current,
                          thumbnailUrl: event.target.value,
                        }))
                      }
                      placeholder="Необязательно"
                      type="url"
                      value={clipForm.thumbnailUrl}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="admin-field">
                    <span>Ник участника</span>
                    <input
                      onChange={(event) =>
                        setParticipantForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                      type="text"
                      value={participantForm.name}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Подпись канала</span>
                    <input
                      onChange={(event) =>
                        setParticipantForm((current) => ({
                          ...current,
                          channel: event.target.value,
                        }))
                      }
                      placeholder="Необязательно. Если пусто, соберём из ссылки."
                      type="text"
                      value={participantForm.channel}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Ссылка на канал</span>
                    <input
                      onChange={(event) =>
                        setParticipantForm((current) => ({
                          ...current,
                          href: event.target.value,
                        }))
                      }
                      required
                      type="url"
                      value={participantForm.href}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Ссылка на изображение</span>
                    <input
                      onChange={(event) =>
                        setParticipantForm((current) => ({
                          ...current,
                          imageUrl: event.target.value,
                        }))
                      }
                      placeholder="Необязательно"
                      type="url"
                      value={participantForm.imageUrl}
                    />
                  </label>
                </>
              )}

              <div className="admin-actions">
                <button className="admin-button" disabled={submitting} type="submit">
                  {submitting ? "Отправляем..." : "Отправить на модерацию"}
                </button>
                <button
                  className="admin-button admin-button--ghost"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SuggestionForm;
