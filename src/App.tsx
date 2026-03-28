import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Catalogo from "./views/Catalogo";
import Proyectos from "./views/Proyectos";
import Editor from "./views/Editor";
import "./App.css";

function App() {
  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/editor" element={<Editor />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
