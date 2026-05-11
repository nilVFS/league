import { Outlet, useLocation } from "react-router-dom";
import Header from "../components/Header";
import VideoBackground from "../components/VideoBackground";

function AppLayout() {
  const location = useLocation();
  const homePage = location.pathname === "/";

  return (
    <div className={`app-shell ${homePage ? "app-shell--home" : ""}`}>
      <VideoBackground />
      <Header compact={!homePage} />
      <Outlet />
    </div>
  );
}

export default AppLayout;
