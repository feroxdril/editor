import { NavLink } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">Editor Paquetes</span>
      <div className="navbar-links">
        <NavLink to="/catalogo" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Catálogo
        </NavLink>
        <NavLink to="/proyectos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Proyectos
        </NavLink>
        <NavLink to="/editor" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Editor
        </NavLink>
      </div>
    </nav>
  );
}
