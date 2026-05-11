import { useEffect, useMemo, useState } from "react";
import LadderModal from "../components/LadderModal";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { buildApiUrl } from "../lib/api";
import { collectionNames } from "../lib/content";

const initialClaimForm = {
  playerTag: "",
  achievementCode: "",
  achievementQuery: "",
  proofUrl: "",
};
const SINGLE_USE_AWARD_CODES = new Set([1, 64, 65, 66]);

function normalizeAchievementText(value = "") {
  return String(value).trim().toLowerCase();
}

function buildAchievementOptionLabel(award) {
  return `#${award.code} ${award.title || ""}`.trim();
}

function resolveAchievementCodeFromInput(value, awards) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return null;
  }

  const directCodeMatch = trimmedValue.match(/^#?(\d+)$/);
  if (directCodeMatch) {
    return Number(directCodeMatch[1]);
  }

  const prefixedCodeMatch = trimmedValue.match(/^#?(\d+)\s+/);
  if (prefixedCodeMatch) {
    return Number(prefixedCodeMatch[1]);
  }

  const normalizedQuery = normalizeAchievementText(trimmedValue);
  const matches = awards.filter((award) =>
    buildAchievementOptionLabel(award).toLowerCase().includes(normalizedQuery)
  );

  return matches.length === 1 ? Number(matches[0].code) : null;
}

function LadderPage() {
  const awardsState = useCollectionData(collectionNames.awards);
  const claimsState = useCollectionData(collectionNames.achievementClaims);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [search, setSearch] = useState("");
  const [isClaimFormOpen, setIsClaimFormOpen] = useState(false);
  const [claimForm, setClaimForm] = useState(initialClaimForm);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isClaimFormOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsClaimFormOpen(false);
      }
    };

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isClaimFormOpen]);

  const ladderRows = useMemo(() => {
    const achievementByCode = new Map(
      awardsState.items.map((award) => [Number(award.code), award])
    );
    const acceptedClaims = claimsState.items.filter(
      (claim) => !claim.status || claim.status === "accepted"
    );
    const firstClaimByCode = new Map();

    acceptedClaims.forEach((claim) => {
      const code = Number(claim.achievementCode);
      const currentFirst = firstClaimByCode.get(code);
      const currentTime = Date.parse(
        claim.submittedAt || claim.createdAt || claim.updatedAt || ""
      ) || 0;
      const firstTime = currentFirst
        ? Date.parse(
            currentFirst.submittedAt ||
              currentFirst.createdAt ||
              currentFirst.updatedAt ||
              ""
          ) || 0
        : Number.POSITIVE_INFINITY;

      if (!currentFirst || currentTime < firstTime) {
        firstClaimByCode.set(code, claim);
      }
    });

    const players = new Map();

    acceptedClaims.forEach((claim) => {
      const playerTag = claim.playerTag || claim.playerTagNormalized || "unknown#0000";
      const key = claim.playerTagNormalized || playerTag.toLowerCase();
      const achievement =
        achievementByCode.get(Number(claim.achievementCode)) || null;
      const baseScore = Number(claim.achievementScore ?? achievement?.score ?? 0);
      const bonusScore = Number(
        claim.achievementBonusScore ?? achievement?.bonusScore ?? 0
      );
      const isFirstCompletion =
        firstClaimByCode.get(Number(claim.achievementCode))?.id === claim.id;
      const totalClaimScore = baseScore + (isFirstCompletion ? bonusScore : 0);
      const title =
        claim.achievementTitle || achievement?.title || `Достижение #${claim.achievementCode}`;
      const broadcasterLabel = claim.broadcasterLogin
        ? `twitch.tv/${claim.broadcasterLogin}`
        : "";

      if (!players.has(key)) {
        players.set(key, {
          key,
          playerTag,
          totalScore: 0,
          achievements: [],
        });
      }

      const player = players.get(key);
      player.achievements.push({
        ...claim,
        achievementTitle: title,
        achievementScore: baseScore,
        achievementBonusScore: bonusScore,
        isFirstCompletion,
        totalClaimScore,
        broadcasterLabel,
      });
      player.totalScore += totalClaimScore;
    });

    return Array.from(players.values())
      .map((player) => ({
        ...player,
        achievements: [...player.achievements].sort(
          (left, right) => Number(left.achievementCode) - Number(right.achievementCode)
        ),
        achievementsCount: player.achievements.length,
      }))
      .sort((left, right) => {
        if (left.totalScore !== right.totalScore) {
          return right.totalScore - left.totalScore;
        }

        if (left.achievementsCount !== right.achievementsCount) {
          return right.achievementsCount - left.achievementsCount;
        }

        return left.playerTag.localeCompare(right.playerTag, "ru");
      });
  }, [awardsState.items, claimsState.items]);

  const loading = awardsState.loading || claimsState.loading;
  const error = awardsState.error || claimsState.error;
  const filteredLadderRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return ladderRows;
    }

    return ladderRows.filter((player) =>
      String(player.playerTag || "").toLowerCase().includes(query)
    );
  }, [ladderRows, search]);

  const unavailableSingleUseAwardCodes = useMemo(() => {
    const acceptedClaims = claimsState.items.filter(
      (claim) => !claim.status || claim.status === "accepted"
    );

    return new Set(
      acceptedClaims
        .map((claim) => Number(claim.achievementCode))
        .filter((code) => SINGLE_USE_AWARD_CODES.has(code))
    );
  }, [claimsState.items]);

  const sortedAwards = useMemo(
    () => [...awardsState.items].sort((left, right) => Number(left.code) - Number(right.code)),
    [awardsState.items]
  );
  const filteredAwards = useMemo(() => {
    const query = normalizeAchievementText(claimForm.achievementQuery);

    if (!query || claimForm.achievementCode) {
      return [];
    }

    return sortedAwards.filter((award) =>
      buildAchievementOptionLabel(award).toLowerCase().includes(query)
    );
  }, [claimForm.achievementCode, claimForm.achievementQuery, sortedAwards]);

  const closeClaimForm = () => {
    setIsClaimFormOpen(false);
    setClaimForm(initialClaimForm);
    setSubmitError("");
  };

  const handleClaimSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const playerTag = claimForm.playerTag.trim();
      const achievementCode =
        claimForm.achievementCode.trim() ||
        String(resolveAchievementCodeFromInput(claimForm.achievementQuery, sortedAwards) || "");
      const proofUrl = claimForm.proofUrl.trim();
      const achievementCodeNumber = Number(achievementCode);

      if (!achievementCode) {
        throw new Error("Выбери достижение из подсказок или укажи его номер.");
      }

      if (unavailableSingleUseAwardCodes.has(achievementCodeNumber)) {
        throw new Error("Достижение #1 уже выполнено и больше недоступно для выбора.");
      }

      const commandText = proofUrl
        ? `!выполнил ${playerTag} ${achievementCode} ${proofUrl}`
        : `!выполнил ${playerTag} ${achievementCode}`;

      const response = await fetch(buildApiUrl("/api/ladder/submit"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: commandText,
          chatterLogin: "site",
          chatterName: "site",
          submittedAt: new Date().toISOString(),
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось отправить заявку в ладдер.");
      }

      setClaimForm(initialClaimForm);
      setIsClaimFormOpen(false);
      setSubmitSuccess(
        payload?.status === "pending_moderation"
          ? "Заявка отправлена на модерацию. Игрока пока нет в белом списке ладдера."
          : "Заявка отправлена в ладдер."
      );

      if (payload?.status !== "pending_moderation") {
        void claimsState.refresh();
      }
    } catch (error) {
      setSubmitError(error.message || "Не удалось отправить заявку в ладдер.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Лидерборд собирается из подтверждённых выполнений достижений. Нажми на строку игрока, чтобы увидеть полный список и ссылки на подтверждение."
        eyebrow="Ладдер"
        title="Таблица лидеров"
        titleAction={
          <div className="page-card__action-group page-card__action-group--ladder">
            <button
              className="admin-button"
              onClick={() => {
                setSubmitError("");
                setSubmitSuccess("");
                setIsClaimFormOpen(true);
              }}
              type="button"
            >
              Подать заявку
            </button>

            <label className="page-search page-search--inline" htmlFor="ladder-search">
              <span className="sr-only">Поиск по игрокам</span>
              <span aria-hidden="true" className="page-search__icon">
                ⌕
              </span>
              <input
                id="ladder-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по игрокам"
                type="search"
                value={search}
              />
            </label>
          </div>
        }
      >
        {submitSuccess ? <div className="state-box">{submitSuccess}</div> : null}
        {loading ? <div className="state-box">Загружаем ладдер...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          ladderRows.length ? (
            <div className="ladder-table">
              <table>
                <thead>
                  <tr>
                    <th>Игрок</th>
                    <th>Выполнено</th>
                    <th>Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLadderRows.map((player, index) => (
                    <tr
                      className="ladder-table__row"
                      key={player.key}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <td data-label="Игрок">
                        <div className="ladder-table__player">
                          <span className="ladder-table__rank">{index + 1}</span>
                          <span>{player.playerTag}</span>
                        </div>
                      </td>
                      <td data-label="Выполнено">{player.achievementsCount}</td>
                      <td className="ladder-table__score" data-label="Баллы">
                        {player.totalScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-box">
              Пока нет выполненных достижений. Как только в чат начнут прилетать команды
              `!выполнил` или `!в`, здесь появятся игроки.
            </div>
          )
        ) : null}

        {!loading && !error && ladderRows.length && !filteredLadderRows.length ? (
          <div className="state-box">По этому запросу игроки не нашлись.</div>
        ) : null}
      </PageIntroCard>

      <LadderModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />

      {isClaimFormOpen ? (
        <div
          className="suggestion-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) {
              closeClaimForm();
            }
          }}
        >
          <div className="suggestion-modal__dialog ladder-claim-modal">
            <button
              aria-label="Закрыть"
              className="modal__close"
              disabled={isSubmitting}
              onClick={closeClaimForm}
              type="button"
            >
              <span className="modal__close-icon" aria-hidden="true">
                ×
              </span>
            </button>

            <div className="suggestion-modal__header">
              <h2 className="suggestion-modal__title">Заявка в ладдер</h2>
            </div>

            <form className="suggestion-form ladder-claim-form" onSubmit={handleClaimSubmit}>
              <label className="admin-field">
                <span>Тег аккаунта</span>
                <input
                  onChange={(event) =>
                    setClaimForm((current) => ({
                      ...current,
                      playerTag: event.target.value,
                    }))
                  }
                  pattern="^\S+#\d+$"
                  placeholder="nick#1234"
                  required
                  type="text"
                  value={claimForm.playerTag}
                />
              </label>

              <label className="admin-field">
                <span>
                  Номер достижения из{" "}
                  <a
                    href="https://docs.google.com/spreadsheets/d/1hnTlFLwf_wfy3xviqUAXE9yQ6bFbsgnOqHQo6_WBpas/edit?gid=0#gid=0"
                    rel="noreferrer"
                    target="_blank"
                  >
                    таблицы
                  </a>{" "}
                  или со страницы{" "}
                  <a
                    href="https://league-hazel.vercel.app/awards"
                    rel="noreferrer"
                    target="_blank"
                  >
                    награды
                  </a>
                </span>
                <div className="ladder-claim-autocomplete">
                  <input
                    autoComplete="off"
                    onChange={(event) =>
                      setClaimForm((current) => ({
                        ...current,
                        achievementCode: "",
                        achievementQuery: event.target.value,
                      }))
                    }
                    placeholder="Например, 1 или часть названия награды"
                    required
                    type="text"
                    value={claimForm.achievementQuery}
                  />

                  {filteredAwards.length ? (
                    <div className="ladder-claim-suggestions">
                      {filteredAwards.slice(0, 8).map((award) => {
                        const code = Number(award.code);
                        const isUnavailable = unavailableSingleUseAwardCodes.has(code);

                        return (
                          <button
                            className={`ladder-claim-suggestion${
                              isUnavailable ? " ladder-claim-suggestion--disabled" : ""
                            }`}
                            disabled={isUnavailable}
                            key={award.id || award.code}
                            onClick={() =>
                              setClaimForm((current) => ({
                                ...current,
                                achievementCode: String(code),
                                achievementQuery: buildAchievementOptionLabel(award),
                              }))
                            }
                            type="button"
                          >
                            {buildAchievementOptionLabel(award)}
                            {isUnavailable ? " — уже выполнено" : ""}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="admin-field">
                <span>Ссылка на пруф (клип/видео/скрин)</span>
                <input
                  onChange={(event) =>
                    setClaimForm((current) => ({
                      ...current,
                      proofUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                  type="url"
                  value={claimForm.proofUrl}
                />
              </label>

              {submitError ? <div className="state-box state-box--error">{submitError}</div> : null}

              <div className="admin-actions">
                <button className="admin-button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Отправляем..." : "Отправить заявку"}
                </button>
                <button
                  className="admin-button admin-button--ghost"
                  disabled={isSubmitting}
                  onClick={closeClaimForm}
                  type="button"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default LadderPage;
