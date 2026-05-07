import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../../lib/api";

function PanelApp() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [theme, setTheme] = useState("dark");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    const twitchExt = window.Twitch?.ext;

    if (!twitchExt) {
      return undefined;
    }

    const handleContext = (context) => {
      if (context?.theme) {
        setTheme(context.theme);
      }
    };

    twitchExt.onContext(handleContext);

    return () => {
      if (typeof twitchExt.unlisten === "function") {
        twitchExt.unlisten("context", handleContext);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/ladder/public?limit=50"));
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Не удалось загрузить ладдер.");
        }

        if (cancelled) {
          return;
        }

        setItems(Array.isArray(payload.items) ? payload.items : []);
        setUpdatedAt(payload.updatedAt || new Date().toISOString());
        setError("");
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(nextError.message || "Не удалось загрузить ладдер.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    const intervalId = window.setInterval(load, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const selectedPlayer = useMemo(
    () => items.find((item) => item.key === selectedKey) || null,
    [items, selectedKey]
  );

  const shellClassName =
    theme === "light" ? "panel-shell panel-shell--light" : "panel-shell";
  const updatedAtLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <main className={shellClassName}>
      <section className="panel-card-frame">
        <header className="panel-header">
          <div className="panel-header__copy">
            <div className="panel-league">Hate of the Vaal</div>
            <h1>Таблица лидеров</h1>
          </div>
          <div className="panel-header__actions">
            {updatedAtLabel ? (
              <div className="panel-updated">Обновлено в {updatedAtLabel}</div>
            ) : null}
            <button
              className="panel-refresh"
              onClick={() => window.location.reload()}
              type="button"
            >
              Обновить
            </button>
          </div>
        </header>

        {loading ? <div className="panel-state">Загружаем очки...</div> : null}
        {error ? <div className="panel-state panel-state--error">{error}</div> : null}

        {!loading && !error ? (
          items.length ? (
            <div className="panel-list">
              {items.map((player, index) => {
                const isSelected = selectedPlayer?.key === player.key;

                return (
                  <section className="panel-card" key={player.key}>
                    <button
                      className="panel-row"
                      onClick={() =>
                        setSelectedKey((current) =>
                          current === player.key ? "" : player.key
                        )
                      }
                      type="button"
                    >
                      <div className="panel-rank">{index + 1}</div>
                      <div className="panel-player">
                        <div className="panel-player__name">{player.playerTag}</div>
                        <div className="panel-player__meta">
                          <span>{player.achievementsCount} достиж.</span>
                          <span>{player.totalScore} очков</span>
                        </div>
                      </div>
                      <div className="panel-toggle">{isSelected ? "−" : "+"}</div>
                    </button>

                    {isSelected ? (
                      <div className="panel-achievements">
                        {player.achievements.map((achievement) => (
                          <div className="panel-achievement" key={achievement.id}>
                            <div className="panel-achievement__title">
                              #{achievement.achievementCode} {achievement.achievementTitle}
                            </div>
                            <div className="panel-achievement__meta">
                              <span>{achievement.totalClaimScore} очков</span>
                              {achievement.broadcasterLabel ? (
                                <span>{achievement.broadcasterLabel}</span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="panel-state">Пока нет подтвержденных результатов.</div>
          )
        ) : null}
      </section>
    </main>
  );
}

export default PanelApp;
