import { useMemo, useState } from "react";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames, createDocument } from "../lib/content";
import { buildApiUrl } from "../lib/api";

const initialForm = {
  nickname: "",
  groupSize: "",
  playTime: "",
  description: "",
};

function formatPlayTime(value) {
  if (!value) {
    return "Время не указано";
  }

  const trimmedValue = String(value).trim();
  if (!trimmedValue) {
    return "Время не указано";
  }

  const looksLikeIsoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmedValue);
  if (!looksLikeIsoDateTime) {
    return trimmedValue;
  }

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TinderPage() {
  const { items, loading, error, refresh } = useCollectionData(collectionNames.tinderPosts);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [replyPostId, setReplyPostId] = useState("");
  const [replyNickname, setReplyNickname] = useState("");
  const [replySubmittingId, setReplySubmittingId] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replySuccess, setReplySuccess] = useState("");

  const sortedPosts = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftTime = Date.parse(left.createdAt || left.updatedAt || "") || 0;
        const rightTime = Date.parse(right.createdAt || right.updatedAt || "") || 0;
        return rightTime - leftTime;
      }),
    [items]
  );

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return sortedPosts;
    }

    return sortedPosts.filter((post) =>
      [post.nickname, post.description, post.playTime]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, sortedPosts]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const nickname = form.nickname.trim();
      const description = form.description.trim();
      const playTime = form.playTime.trim();
      const groupSizeRaw = String(form.groupSize || "").trim();
      const groupSize = groupSizeRaw ? Number(groupSizeRaw) : null;

      if (!nickname) {
        throw new Error("Укажи ник, чтобы люди понимали, кого искать.");
      }

      if (groupSizeRaw && (!Number.isFinite(groupSize) || groupSize < 1 || groupSize > 6)) {
        throw new Error("Размер группы должен быть числом от 1 до 6.");
      }

      await createDocument(collectionNames.tinderPosts, {
        nickname,
        status: "open",
        interestedPlayers: [],
        ...(groupSizeRaw ? { groupSize } : {}),
        ...(playTime ? { playTime } : {}),
        ...(description ? { description } : {}),
      });

      await refresh();
      setForm(initialForm);
      setSubmitSuccess("Заявка отправлена. Теперь можно ловить тиммейтов.");
    } catch (submitErrorValue) {
      setSubmitError(submitErrorValue.message || "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplySubmit = async (event, postId) => {
    event.preventDefault();
    setReplySubmittingId(postId);
    setReplyError("");
    setReplySuccess("");

    try {
      const nickname = replyNickname.trim();

      if (!nickname) {
        throw new Error("Напиши свой ник перед откликом.");
      }

      const response = await fetch(buildApiUrl("/api/tinder-respond"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          nickname,
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось отправить отклик.");
      }

      await refresh();
      setReplyNickname("");
      setReplyPostId("");
      setReplySuccess(
        payload?.duplicate
          ? "Этот ник уже есть в списке желающих."
          : "Ник добавлен в список желающих."
      );
    } catch (replySubmitError) {
      setReplyError(replySubmitError.message || "Не удалось отправить отклик.");
    } finally {
      setReplySubmittingId("");
    }
  };

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Страница для тех, кто хочет быстро найти себе пачку, добрать людей в группу или просто вписаться в забег."
        eyebrow="Тиндер"
        title="Ищу тиммейтов"
      >
        <div className="tinder-layout">
          <section className="tinder-panel tinder-panel--form">
            <div className="tinder-panel__header">
              <h2>Подать заявку</h2>
              <p>Оставь короткое объявление, и тебя смогут найти остальные игроки.</p>
            </div>

            <form className="tinder-form" onSubmit={handleSubmit}>
              <label className="admin-field">
                <span>Ник</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nickname: event.target.value }))
                  }
                  placeholder="Например, VaalEnjoyer"
                  required
                  type="text"
                  value={form.nickname}
                />
              </label>

              <label className="admin-field">
                <span>Размер группы</span>
                <input
                  max="6"
                  min="1"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, groupSize: event.target.value }))
                  }
                  placeholder="Например, 2"
                  type="number"
                  value={form.groupSize}
                />
              </label>

              <label className="admin-field">
                <span>Время</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, playTime: event.target.value }))
                  }
                  placeholder="Например, сегодня после 20:00"
                  type="text"
                  value={form.playTime}
                />
              </label>

              <label className="admin-field">
                <span>Описание</span>
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Кого ищете, какой вайб, что по ролям или по онлайну."
                  value={form.description}
                />
              </label>

              <button className="admin-button" disabled={submitting} type="submit">
                {submitting ? "Отправляем..." : "Найти тиммейтов"}
              </button>
            </form>

            {submitError ? <div className="state-box state-box--error">{submitError}</div> : null}
            {submitSuccess ? <div className="state-box">{submitSuccess}</div> : null}
          </section>

          <section className="tinder-panel tinder-panel--feed">
            <div className="tinder-panel__header tinder-panel__header--row">
              <div>
                <h2>Лента заявок</h2>
                <p>Свежие объявления от тех, кто прямо сейчас собирает группу.</p>
              </div>

              <label className="admin-field tinder-search">
                <span>Поиск</span>
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ник, описание, время"
                  type="search"
                  value={search}
                />
              </label>
            </div>

            {loading ? <div className="state-box">Загружаем заявки...</div> : null}
            {error ? <div className="state-box state-box--error">{error}</div> : null}

            {!loading && !error ? (
              filteredPosts.length ? (
                <div className="tinder-grid">
                  {filteredPosts.map((post) => (
                    <article className="tinder-card" key={post.id}>
                      <div className="tinder-card__topline">
                        <div>
                          <div className="tinder-card__nickname">{post.nickname || "Без ника"}</div>
                          <div className="tinder-card__time">
                            {formatPlayTime(post.playTime)}
                          </div>
                        </div>
                        <div className="tinder-card__badge">
                          {post.status === "closed"
                            ? "Набор закрыт"
                            : post.groupSize
                              ? `Группа: ${post.groupSize}`
                              : "Ищет тиммейтов"}
                        </div>
                      </div>

                      <p className="tinder-card__description">{post.description}</p>

                      <div className="tinder-card__responses">
                        <div className="tinder-card__responses-title">
                          Желающие поиграть вместе
                        </div>
                        {Array.isArray(post.interestedPlayers) && post.interestedPlayers.length ? (
                          <div className="tinder-card__responses-list">
                            {post.interestedPlayers.map((player) => (
                              <span className="tinder-card__response-chip" key={`${post.id}-${player}`}>
                                {player}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="tinder-card__responses-empty">
                            Пока никто не откликнулся.
                          </div>
                        )}
                      </div>

                      <div className="tinder-card__actions">
                        <button
                          className="admin-button admin-button--ghost"
                          disabled={post.status === "closed"}
                          onClick={() => {
                            setReplyError("");
                            setReplySuccess("");
                            setReplyPostId((current) => (current === post.id ? "" : post.id));
                          }}
                          type="button"
                        >
                          {post.status === "closed"
                            ? "Набор закрыт"
                            : replyPostId === post.id
                              ? "Скрыть"
                              : "Хочу играть с ним"}
                        </button>
                      </div>

                      {replyPostId === post.id ? (
                        <form
                          className="tinder-reply-form"
                          onSubmit={(event) => handleReplySubmit(event, post.id)}
                        >
                          <label className="admin-field">
                            <span>Твой ник</span>
                            <input
                              onChange={(event) => setReplyNickname(event.target.value)}
                              placeholder="Например, AuraBotEnjoyer"
                              type="text"
                              value={replyNickname}
                            />
                          </label>
                          <button
                            className="admin-button"
                            disabled={replySubmittingId === post.id}
                            type="submit"
                          >
                            {replySubmittingId === post.id ? "Отправляем..." : "Откликнуться"}
                          </button>
                        </form>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="state-box">
                  Пока пусто. Самое время закинуть первую заявку и собрать пачку.
                </div>
              )
            ) : null}

            {replyError ? <div className="state-box state-box--error">{replyError}</div> : null}
            {replySuccess ? <div className="state-box">{replySuccess}</div> : null}
          </section>
        </div>
      </PageIntroCard>
    </main>
  );
}

export default TinderPage;
