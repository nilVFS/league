import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageIntroCard from "../components/PageIntroCard";

function buildStatusMessage(status, channel, bot) {
  switch (status) {
    case "bot-connected":
      return {
        tone: "success",
        text: `Бот-аккаунт ${bot || ""} авторизован. Теперь можно подключать каналы стримеров.`,
      };
    case "connected":
      return {
        tone: "success",
        text: `Канал ${channel || ""} подключён. Команды из чата теперь могут попадать в ладдер.`,
      };
    case "already-connected":
      return {
        tone: "success",
        text: `Канал ${channel || ""} уже был подключён. Мы просто обновили связь.`,
      };
    case "error":
      return {
        tone: "error",
        text: "Подключение не завершилось. Посмотри текст ошибки ниже.",
      };
    default:
      return null;
  }
}

function BotPage() {
  const [searchParams] = useSearchParams();
  const [broadcasterLogin, setBroadcasterLogin] = useState(
    searchParams.get("channel") || ""
  );
  const status = searchParams.get("status") || "";
  const message = searchParams.get("message") || "";
  const channel = searchParams.get("channel") || "";
  const bot = searchParams.get("bot") || "";

  const statusBox = useMemo(
    () => buildStatusMessage(status, channel, bot),
    [status, channel, bot]
  );

  const handleBotAuth = () => {
    window.location.assign("/api/twitch/auth/start?kind=bot");
  };

  const handleBroadcasterAuth = (event) => {
    event.preventDefault();
    const normalizedLogin = broadcasterLogin.trim().replace(/^@/, "").toLowerCase();

    if (!normalizedLogin) {
      return;
    }

    window.location.assign(
      `/api/twitch/auth/start?kind=broadcaster&broadcasterLogin=${encodeURIComponent(
        normalizedLogin
      )}`
    );
  };

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Здесь живёт подключение Twitch-бота и каналов стримеров. Страница не светится в навигации, но полностью готова для онбординга."
        eyebrow="Bot"
        title="Подключение Twitch-бота"
      >
        {statusBox ? (
          <div
            className={`state-box ${statusBox.tone === "error" ? "state-box--error" : ""}`}
          >
            {statusBox.text}
          </div>
        ) : null}

        {status === "error" && message ? (
          <div className="state-box state-box--error">{message}</div>
        ) : null}

        <div className="admin-sections admin-auth">
          <section className="admin-card">
            <h2>Шаг 1. Авторизовать bot-аккаунт</h2>
            <p className="page-card__description">
              Этот шаг делается один раз владельцем бота. Twitch попросит дать права
              на чтение чата от bot-аккаунта.
            </p>
            <div className="admin-actions">
              <button className="admin-button" onClick={handleBotAuth} type="button">
                Авторизовать бота
              </button>
            </div>
          </section>

          <section className="admin-card">
            <h2>Шаг 2. Подключить канал стримера</h2>
            <p className="page-card__description">
              Стример вводит свой Twitch login, проходит авторизацию и даёт приложению
              право подписать его канал на chat EventSub.
            </p>
            <form className="admin-form" onSubmit={handleBroadcasterAuth}>
              <label className="admin-field">
                <span>Twitch login стримера</span>
                <input
                  onChange={(event) => setBroadcasterLogin(event.target.value)}
                  placeholder="streamer_login"
                  required
                  type="text"
                  value={broadcasterLogin}
                />
              </label>

              <div className="admin-actions">
                <button className="admin-button" type="submit">
                  Подключить канал
                </button>
              </div>
            </form>
          </section>
        </div>
      </PageIntroCard>
    </main>
  );
}

export default BotPage;
