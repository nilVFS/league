import { NavLink } from "react-router-dom";
import { navItems } from "../data/siteData";

function Header({ compact = false }) {
  return (
    <header className={`site-header ${compact ? "site-header--compact" : ""}`}>
      <div className="site-header__inner">
        <NavLink className="site-header__logo" to="/">
          Fate of the Vaal
        </NavLink>

        <nav className="site-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `site-nav__link ${isActive ? "site-nav__link--active" : ""}`
              }
              end={item.to === "/"}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Header;
