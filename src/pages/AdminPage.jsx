import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import PageIntroCard from "../components/PageIntroCard";
import { seedAwards, seedClips, seedParticipants } from "../data/seedContent";
import useCollectionData from "../hooks/useCollectionData";
import {
  collectionNames,
  createDocument,
  deleteDocument,
  isCollectionEmpty,
  seedCollection,
  updateDocument,
} from "../lib/content";
import { auth } from "../lib/firebase";
import {
  extractTwitchClipSlug,
  fetchTwitchChannelProfile,
  fetchTwitchClipThumbnailBySlug,
} from "../lib/twitch";

const clipInitialState = {
  title: "",
  preview: "",
  description: "",
  clipSlug: "",
  thumbnailUrl: "",
};

const participantInitialState = {
  name: "",
  channel: "",
  href: "",
  imageUrl: "",
  description: "",
};

const awardInitialState = {
  category: "",
  title: "",
  score: "",
  description: "",
};

const adminTabs = [
  { id: "clips", label: "Клипы" },
  { id: "participants", label: "Участники" },
  { id: "awards", label: "Награды" },
  { id: "requests", label: "Запросы" },
];

function AdminPage() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [activeTab, setActiveTab] = useState("clips");
  const [clipForm, setClipForm] = useState(clipInitialState);
  const [participantForm, setParticipantForm] = useState(participantInitialState);
  const [awardForm, setAwardForm] = useState(awardInitialState);
  const [editingClipId, setEditingClipId] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState("");
  const [editingAwardId, setEditingAwardId] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState("");

  const clipsState = useCollectionData(collectionNames.clips);
  const participantsState = useCollectionData(collectionNames.participants);
  const awardsState = useCollectionData(collectionNames.awards);
  const suggestionsState = useCollectionData(collectionNames.suggestions);

  const pendingSuggestions = useMemo(
    () =>
      suggestionsState.items.filter((item) => item.status === "pending"),
    [suggestionsState.items]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const setMessage = (message) => {
    setStatus(message);
  };

  const resolveClipThumbnailUrl = async (clipSlug, currentThumbnailUrl = "") => {
    const manualThumbnailUrl = currentThumbnailUrl.trim();
    if (manualThumbnailUrl) {
      return manualThumbnailUrl;
    }

    try {
      return await fetchTwitchClipThumbnailBySlug(clipSlug);
    } catch {
      return "";
    }
  };

  const resetClipForm = () => {
    setClipForm(clipInitialState);
    setEditingClipId("");
  };

  const resetParticipantForm = () => {
    setParticipantForm(participantInitialState);
    setEditingParticipantId("");
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

  const resolveParticipantData = async (formValue) => {
    const href = formValue.href.trim();
    const manualName = formValue.name.trim();
    const manualChannel = formValue.channel.trim();
    const manualImageUrl = formValue.imageUrl.trim();
    const manualDescription = formValue.description.trim();

    let profile = null;
    try {
      profile = await fetchTwitchChannelProfile(href);
    } catch {
      profile = null;
    }

    return {
      name: manualName || profile?.displayName || "",
      channel:
        manualChannel ||
        (profile?.login ? `twitch.tv/${profile.login}` : "") ||
        getParticipantChannelLabel(href, manualName),
      href,
      imageUrl: manualImageUrl || profile?.profileImageUrl || "",
      description: manualDescription,
    };
  };

  const resetAwardForm = () => {
    setAwardForm(awardInitialState);
    setEditingAwardId("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    setSubmitting("login");

    try {
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      setMessage("Вход выполнен. Панель управления готова к работе.");
    } catch (error) {
      setAuthError(error.message || "Не удалось войти.");
    } finally {
      setSubmitting("");
    }
  };

  const handleLogout = async () => {
    setSubmitting("logout");
    try {
      await signOut(auth);
      setMessage("Вы вышли из аккаунта.");
    } finally {
      setSubmitting("");
    }
  };

  const handleSeed = async () => {
    setSubmitting("seed");
    setMessage("");

    try {
      const [clipsEmpty, participantsEmpty, awardsEmpty] = await Promise.all([
        isCollectionEmpty(collectionNames.clips),
        isCollectionEmpty(collectionNames.participants),
        isCollectionEmpty(collectionNames.awards),
      ]);

      if (!clipsEmpty || !participantsEmpty || !awardsEmpty) {
        throw new Error("Сидинг доступен только для пустых коллекций.");
      }

      await Promise.all([
        seedCollection(collectionNames.clips, seedClips),
        seedCollection(collectionNames.participants, seedParticipants),
        seedCollection(collectionNames.awards, seedAwards),
      ]);

      setMessage("Тестовые данные загружены в Firebase.");
    } catch (error) {
      setMessage(error.message || "Не удалось выполнить сидинг.");
    } finally {
      setSubmitting("");
    }
  };

  const handleClipSubmit = async (event) => {
    event.preventDefault();
    setSubmitting("clip");
    setMessage("");

    try {
      const clipSlug = extractTwitchClipSlug(clipForm.clipSlug);
      const title = clipForm.title.trim();

      if (!title) {
        throw new Error("Укажи название клипа.");
      }
      if (!clipSlug) {
        throw new Error("Укажи ссылку на Twitch Clip или его slug.");
      }

      const preview = clipForm.preview.trim() || title;
      const description = clipForm.description.trim() || preview;
      const thumbnailUrl = await resolveClipThumbnailUrl(
        clipSlug,
        clipForm.thumbnailUrl
      );

      const payload = {
        title,
        preview,
        description,
        clipSlug,
        thumbnailUrl,
      };

      if (editingClipId) {
        await updateDocument(collectionNames.clips, editingClipId, payload);
        setMessage("Клип обновлён.");
      } else {
        await createDocument(collectionNames.clips, payload);
        setMessage("Клип добавлен.");
      }

      resetClipForm();
    } catch (error) {
      setMessage(error.message || "Не удалось сохранить клип.");
    } finally {
      setSubmitting("");
    }
  };

  const handleParticipantSubmit = async (event) => {
    event.preventDefault();
    setSubmitting("participant");
    setMessage("");

    try {
      const href = participantForm.href.trim();

      if (!href) {
        throw new Error("Укажи ссылку на канал.");
      }

      const payload = await resolveParticipantData(participantForm);

      if (!payload.name) {
        throw new Error("Не удалось определить ник участника. Укажи его вручную.");
      }

      if (editingParticipantId) {
        await updateDocument(collectionNames.participants, editingParticipantId, payload);
        setMessage("Участник обновлён.");
      } else {
        await createDocument(collectionNames.participants, payload);
        setMessage("Участник добавлен.");
      }

      resetParticipantForm();
    } catch (error) {
      setMessage(error.message || "Не удалось сохранить участника.");
    } finally {
      setSubmitting("");
    }
  };

  const handleAwardSubmit = async (event) => {
    event.preventDefault();
    setSubmitting("award");
    setMessage("");

    try {
      const payload = {
        category: awardForm.category.trim() || "Общие",
        title: awardForm.title.trim(),
        score: Number(awardForm.score),
        description: awardForm.description.trim(),
      };

      if (editingAwardId) {
        await updateDocument(collectionNames.awards, editingAwardId, payload);
        setMessage("Награда обновлена.");
      } else {
        await createDocument(collectionNames.awards, payload);
        setMessage("Награда добавлена.");
      }

      resetAwardForm();
    } catch (error) {
      setMessage(error.message || "Не удалось сохранить награду.");
    } finally {
      setSubmitting("");
    }
  };

  const handleDelete = async (collectionName, id, label) => {
    setSubmitting(`delete-${id}`);
    setMessage("");
    try {
      await deleteDocument(collectionName, id);
      setMessage(`${label} удалён.`);
    } catch (error) {
      setMessage(error.message || "Не удалось удалить запись.");
    } finally {
      setSubmitting("");
    }
  };

  const handleApproveSuggestion = async (suggestion) => {
    setSubmitting(`approve-${suggestion.id}`);
    setMessage("");

    try {
      if (suggestion.type === "clip") {
        const clipSlug = suggestion.clipSlug || "";
        const thumbnailUrl = await resolveClipThumbnailUrl(
          clipSlug,
          suggestion.thumbnailUrl || ""
        );

        await createDocument(collectionNames.clips, {
          title: suggestion.title || "",
          preview: suggestion.preview || "",
          description: suggestion.description || "",
          clipSlug,
          thumbnailUrl,
        });
      }

      if (suggestion.type === "participant") {
        await createDocument(collectionNames.participants, {
          name: suggestion.name || "",
          channel: suggestion.channel || "",
          href: suggestion.href || "",
          imageUrl: suggestion.imageUrl || "",
          description: suggestion.description || "",
        });
      }

      await updateDocument(collectionNames.suggestions, suggestion.id, {
        status: "approved",
      });

      setMessage("Запрос принят.");
    } catch (error) {
      setMessage(error.message || "Не удалось принять запрос.");
    } finally {
      setSubmitting("");
    }
  };

  const handleRejectSuggestion = async (suggestionId) => {
    setSubmitting(`reject-${suggestionId}`);
    setMessage("");

    try {
      await updateDocument(collectionNames.suggestions, suggestionId, {
        status: "rejected",
      });
      setMessage("Запрос отклонён.");
    } catch (error) {
      setMessage(error.message || "Не удалось отклонить запрос.");
    } finally {
      setSubmitting("");
    }
  };

  if (authLoading) {
    return (
      <main className="inner-page">
        <PageIntroCard
          description="Проверяем авторизацию администратора."
          eyebrow="Admin"
          title="Панель управления"
        >
          <div className="state-box">Загружаем панель...</div>
        </PageIntroCard>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="inner-page">
        <PageIntroCard
          description="После входа откроется управление клипами, участниками, наградами и пользовательскими запросами."
          eyebrow="Admin"
          title="Панель управления"
        >
          <form className="admin-auth" onSubmit={handleLogin}>
            <div className="admin-grid admin-grid--auth">
              <label className="admin-field">
                <span>Email</span>
                <input
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="admin@example.com"
                  type="email"
                  value={loginForm.email}
                />
              </label>

              <label className="admin-field">
                <span>Пароль</span>
                <input
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Введите пароль"
                  type="password"
                  value={loginForm.password}
                />
              </label>
            </div>

            {authError ? <div className="state-box state-box--error">{authError}</div> : null}

            <button className="admin-button" disabled={submitting === "login"} type="submit">
              {submitting === "login" ? "Входим..." : "Войти"}
            </button>
          </form>
        </PageIntroCard>
      </main>
    );
  }

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Слева переключай разделы, по центру добавляй или редактируй контент, а ниже смотри текущий список записей или запросов от пользователей."
        eyebrow="Admin"
        title="Панель управления"
      >
        <div className="admin-toolbar">
          <div className="admin-toolbar__user">
            Вошли как <strong>{user.email}</strong>
          </div>

          <div className="admin-toolbar__actions">
            <button
              className="admin-button"
              disabled={submitting === "seed"}
              onClick={handleSeed}
              type="button"
            >
              {submitting === "seed" ? "Заполняем..." : "Заполнить тестовыми данными"}
            </button>
            <button
              className="admin-button admin-button--ghost"
              disabled={submitting === "logout"}
              onClick={handleLogout}
              type="button"
            >
              Выйти
            </button>
          </div>
        </div>

        {status ? <div className="state-box">{status}</div> : null}

        <div className="admin-layout">
          <aside className="admin-sidebar">
            {adminTabs.map((tab) => (
              <button
                key={tab.id}
                className={`admin-tab ${activeTab === tab.id ? "admin-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
                {tab.id === "requests" && pendingSuggestions.length ? (
                  <span className="admin-tab__badge">{pendingSuggestions.length}</span>
                ) : null}
              </button>
            ))}
          </aside>

          <section className="admin-content">
            {activeTab === "clips" ? (
              <div className="admin-pane">
                <section className="admin-card">
                  <h2>{editingClipId ? "Редактировать клип" : "Добавить клип"}</h2>
                  <form className="admin-form" onSubmit={handleClipSubmit}>
                    <label className="admin-field">
                      <span>Название</span>
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
                      <span>Короткий текст на карточке</span>
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
                      <span>Описание popup</span>
                      <textarea
                        onChange={(event) =>
                          setClipForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Необязательно. Если пусто, возьмём текст карточки."
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
                      <span>Превью URL</span>
                      <input
                        onChange={(event) =>
                          setClipForm((current) => ({
                            ...current,
                            thumbnailUrl: event.target.value,
                          }))
                        }
                        placeholder="Необязательно. Без Twitch API автопревью недоступно."
                        type="url"
                        value={clipForm.thumbnailUrl}
                      />
                    </label>
                    <div className="admin-actions">
                      <button className="admin-button" disabled={submitting === "clip"} type="submit">
                        {submitting === "clip"
                          ? "Сохраняем..."
                          : editingClipId
                            ? "Сохранить клип"
                            : "Добавить клип"}
                      </button>
                      {editingClipId ? (
                        <button
                          className="admin-button admin-button--ghost"
                          onClick={resetClipForm}
                          type="button"
                        >
                          Отмена
                        </button>
                      ) : null}
                    </div>
                  </form>
                </section>

                <section className="admin-card">
                  <h2>Список клипов</h2>
                  <div className="admin-list">
                    {clipsState.items.map((clip) => (
                      <div className="admin-list__item" key={clip.id}>
                        <div>
                          <strong>{clip.title}</strong>
                          <div className="admin-list__meta">{clip.preview}</div>
                        </div>
                        <div className="admin-list__actions">
                          <button
                            className="admin-button admin-button--ghost"
                            onClick={() => {
                              setEditingClipId(clip.id);
                              setClipForm({
                                title: clip.title || "",
                                preview: clip.preview || "",
                                description: clip.description || "",
                                clipSlug: clip.clipSlug || "",
                                thumbnailUrl: clip.thumbnailUrl || "",
                              });
                              setActiveTab("clips");
                            }}
                            type="button"
                          >
                            Редактировать
                          </button>
                          <button
                            className="admin-button admin-button--ghost"
                            disabled={submitting === `delete-${clip.id}`}
                            onClick={() => handleDelete(collectionNames.clips, clip.id, "Клип")}
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "participants" ? (
              <div className="admin-pane">
                <section className="admin-card">
                  <h2>{editingParticipantId ? "Редактировать участника" : "Добавить участника"}</h2>
                  <form className="admin-form" onSubmit={handleParticipantSubmit}>
                    <label className="admin-field">
                      <span>Ник</span>
                      <input
                        onChange={(event) =>
                          setParticipantForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Необязательно. Если пусто, подтянем из Twitch."
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
                      <span>Изображение URL</span>
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
                    <label className="admin-field">
                      <span>Описание</span>
                      <textarea
                        onChange={(event) =>
                          setParticipantForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Необязательно. Можно дописать свой текст."
                        rows="3"
                        value={participantForm.description}
                      />
                    </label>
                    <div className="admin-actions">
                      <button
                        className="admin-button"
                        disabled={submitting === "participant"}
                        type="submit"
                      >
                        {submitting === "participant"
                          ? "Сохраняем..."
                          : editingParticipantId
                            ? "Сохранить участника"
                            : "Добавить участника"}
                      </button>
                      {editingParticipantId ? (
                        <button
                          className="admin-button admin-button--ghost"
                          onClick={resetParticipantForm}
                          type="button"
                        >
                          Отмена
                        </button>
                      ) : null}
                    </div>
                  </form>
                </section>

                <section className="admin-card">
                  <h2>Список участников</h2>
                  <div className="admin-list">
                    {participantsState.items.map((participant) => (
                      <div className="admin-list__item" key={participant.id}>
                        <div>
                          <strong>{participant.name}</strong>
                          <div className="admin-list__meta">{participant.channel}</div>
                          {participant.description ? (
                            <div className="admin-list__meta">{participant.description}</div>
                          ) : null}
                        </div>
                        <div className="admin-list__actions">
                          <button
                            className="admin-button admin-button--ghost"
                            onClick={() => {
                              setEditingParticipantId(participant.id);
                              setParticipantForm({
                                name: participant.name || "",
                                channel: participant.channel || "",
                                href: participant.href || "",
                                imageUrl: participant.imageUrl || "",
                                description: participant.description || "",
                              });
                              setActiveTab("participants");
                            }}
                            type="button"
                          >
                            Редактировать
                          </button>
                          <button
                            className="admin-button admin-button--ghost"
                            disabled={submitting === `delete-${participant.id}`}
                            onClick={() =>
                              handleDelete(
                                collectionNames.participants,
                                participant.id,
                                "Участник"
                              )
                            }
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "awards" ? (
              <div className="admin-pane">
                <section className="admin-card">
                  <h2>{editingAwardId ? "Редактировать награду" : "Добавить награду"}</h2>
                  <form className="admin-form" onSubmit={handleAwardSubmit}>
                    <label className="admin-field">
                      <span>Раздел</span>
                      <input
                        onChange={(event) =>
                          setAwardForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                        placeholder="Например: Основные, PvP, Боссы"
                        type="text"
                        value={awardForm.category}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Название награды</span>
                      <input
                        onChange={(event) =>
                          setAwardForm((current) => ({ ...current, title: event.target.value }))
                        }
                        required
                        type="text"
                        value={awardForm.title}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Баллы</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          setAwardForm((current) => ({ ...current, score: event.target.value }))
                        }
                        required
                        type="number"
                        value={awardForm.score}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Описание</span>
                      <textarea
                        onChange={(event) =>
                          setAwardForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Например: бонусные баллы за скорость, редкое условие и т.д."
                        rows="3"
                        value={awardForm.description}
                      />
                    </label>
                    <div className="admin-actions">
                      <button className="admin-button" disabled={submitting === "award"} type="submit">
                        {submitting === "award"
                          ? "Сохраняем..."
                          : editingAwardId
                            ? "Сохранить награду"
                            : "Добавить награду"}
                      </button>
                      {editingAwardId ? (
                        <button
                          className="admin-button admin-button--ghost"
                          onClick={resetAwardForm}
                          type="button"
                        >
                          Отмена
                        </button>
                      ) : null}
                    </div>
                  </form>
                </section>

                <section className="admin-card">
                  <h2>Список наград</h2>
                  <div className="admin-list">
                    {awardsState.items.map((award) => (
                      <div className="admin-list__item" key={award.id}>
                        <div>
                          <strong>{award.title}</strong>
                          <div className="admin-list__meta">
                            {(award.category || "Общие")} • {award.score} баллов
                          </div>
                          {award.description ? (
                            <div className="admin-list__meta">{award.description}</div>
                          ) : null}
                        </div>
                        <div className="admin-list__actions">
                          <button
                            className="admin-button admin-button--ghost"
                            onClick={() => {
                              setEditingAwardId(award.id);
                              setAwardForm({
                                category: award.category || "",
                                title: award.title || "",
                                score: String(award.score ?? ""),
                                description: award.description || "",
                              });
                              setActiveTab("awards");
                            }}
                            type="button"
                          >
                            Редактировать
                          </button>
                          <button
                            className="admin-button admin-button--ghost"
                            disabled={submitting === `delete-${award.id}`}
                            onClick={() =>
                              handleDelete(collectionNames.awards, award.id, "Награда")
                            }
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "requests" ? (
              <div className="admin-pane">
                <section className="admin-card">
                  <h2>Запросы на модерацию</h2>
                  {pendingSuggestions.length ? (
                    <div className="admin-list">
                      {pendingSuggestions.map((suggestion) => (
                        <div className="admin-list__item" key={suggestion.id}>
                          <div>
                            <strong>
                              {suggestion.type === "clip" ? "Клип" : "Участник"}:{" "}
                              {suggestion.title || suggestion.name}
                            </strong>
                            <div className="admin-list__meta">
                              {suggestion.preview || suggestion.channel || suggestion.description}
                            </div>
                            {suggestion.contact ? (
                              <div className="admin-list__meta">
                                Контакт: {suggestion.contact}
                              </div>
                            ) : null}
                          </div>
                          <div className="admin-list__actions">
                            <button
                              className="admin-button"
                              disabled={submitting === `approve-${suggestion.id}`}
                              onClick={() => handleApproveSuggestion(suggestion)}
                              type="button"
                            >
                              Принять
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              disabled={submitting === `reject-${suggestion.id}`}
                              onClick={() => handleRejectSuggestion(suggestion.id)}
                              type="button"
                            >
                              Отклонить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="state-box">Пока нет запросов на модерацию.</div>
                  )}
                </section>
              </div>
            ) : null}
          </section>
        </div>
      </PageIntroCard>
    </main>
  );
}

export default AdminPage;
