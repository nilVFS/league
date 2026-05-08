import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import Header from "../components/Header";
import VideoBackground from "../components/VideoBackground";

const privacyBannerStorageKey = "hotv_privacy_banner_accepted_v1";

function AppLayout() {
  const location = useLocation();
  const homePage = location.pathname === "/";
  const [privacyAccepted, setPrivacyAccepted] = useState(true);

  useEffect(() => {
    try {
      setPrivacyAccepted(window.localStorage.getItem(privacyBannerStorageKey) === "true");
    } catch {
      setPrivacyAccepted(false);
    }
  }, []);

  const acceptPrivacyBanner = () => {
    setPrivacyAccepted(true);

    try {
      window.localStorage.setItem(privacyBannerStorageKey, "true");
    } catch {
      // Ignore storage errors and just hide for the current session.
    }
  };

  return (
    <div className={`app-shell ${homePage ? "app-shell--home" : ""}`}>
      <VideoBackground />
      <Header compact={!homePage} />
      <Outlet />

      {!privacyAccepted ? (
        <div className="legal-widget">
          <div className="legal-widget__title">Персональные данные</div>
          <div className="legal-widget__text">
            На сайте есть формы и Twitch-интеграции. Перед использованием можно посмотреть
            политику обработки данных.
          </div>
          <div className="legal-widget__actions">
            <Link className="legal-widget__link" to="/privacy">
              Открыть политику
            </Link>
            <button className="legal-widget__button" onClick={acceptPrivacyBanner} type="button">
              Принять
            </button>
          </div>
        </div>
      ) : null}

      {!homePage ? (
        <footer className="site-footer">
          <Link className="site-footer__link" to="/privacy">
            Политика обработки персональных данных
          </Link>
        </footer>
      ) : null}
    </div>
  );
}

export default AppLayout;
