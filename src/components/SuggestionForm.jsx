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
  const form = isClip ? clipForm : participantForm;

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      await createDocument(collectionNames.suggestions, {
        type,
        status: "pending",
        ...form,
        clipSlug: isClip ? extractTwitchClipSlug(form.clipSlug) : undefined,
      });

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
              <p className="suggestion-modal__text">
                Заполни форму, и предложение отправится на модерацию в админку.
              </p>
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
                      required
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
                      required
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
                      type="url"
                      value={clipForm.thumbnailUrl}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Контакт для связи</span>
                    <input
                      onChange={(event) =>
                        setClipForm((current) => ({ ...current, contact: event.target.value }))
                      }
                      placeholder="@telegram / discord / email"
                      type="text"
                      value={clipForm.contact}
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
                      required
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
                      required
                      type="url"
                      value={participantForm.imageUrl}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Контакт для связи</span>
                    <input
                      onChange={(event) =>
                        setParticipantForm((current) => ({
                          ...current,
                          contact: event.target.value,
                        }))
                      }
                      placeholder="@telegram / discord / email"
                      type="text"
                      value={participantForm.contact}
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
