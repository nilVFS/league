import { useEffect } from "react";

function LadderModal({ player, onClose }) {
  useEffect(() => {
    if (!player) {
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
  }, [player, onClose]);

  if (!player) {
    return null;
  }

  return (
    <div
      aria-hidden={player ? "false" : "true"}
      className="modal is-open"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal__dialog modal__dialog--ladder">
        <button
          aria-label="Закрыть"
          className="modal__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        <div className="modal__meta modal__meta--ladder">
          <div className="modal__title">{player.playerTag}</div>
          <div className="modal__text">
            Выполнено {player.achievementsCount} достижений • {player.totalScore} баллов
          </div>
        </div>

        <div className="ladder-modal__list">
          {player.achievements.map((achievement) => (
            <div className="ladder-modal__item" key={achievement.id}>
              <div className="ladder-modal__item-main">
                <div className="ladder-modal__item-title">
                  #{achievement.achievementCode} {achievement.achievementTitle}
                </div>
                <div className="ladder-modal__item-meta">
                  {achievement.achievementBonusScore && achievement.isFirstCompletion
                    ? `${achievement.achievementScore} + бонус ${achievement.achievementBonusScore} = ${achievement.totalClaimScore} баллов`
                    : `${achievement.achievementScore} баллов`}
                </div>
              </div>

              {achievement.proofUrl ? (
                <a
                  className="admin-button admin-button--ghost"
                  href={achievement.proofUrl}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Подтверждение
                </a>
              ) : (
                <span className="ladder-modal__item-empty">Нет ссылки</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LadderModal;
