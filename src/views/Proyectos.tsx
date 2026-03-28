import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import type { Project } from "../types/project";
import { PRESETS } from "../presets";
import "./Proyectos.css";

function generateId(): string {
  return crypto.randomUUID();
}

export default function Proyectos() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState("story");
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const list = await invoke<Project[]>("list_projects");
      setProjects(list.slice().reverse());
    } catch (err) {
      setError("Error cargando proyectos: " + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const project: Project = {
      projectId: generateId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      defaultPreset: newPreset,
      pages: [
        {
          pageId: generateId(),
          name: "Página 1",
          preset: newPreset,
          elements: [],
          offerTexts: {
            title: "",
            publicPrice: "",
            payOnly: "",
            offerUntil: "",
          },
          background: "#16213e",
        },
      ],
    };
    try {
      await invoke("save_project", { project });
      setNewName("");
      setNewPreset("story");
      setShowCreate(false);
      await loadProjects();
    } catch (err) {
      setError("Error creando proyecto: " + String(err));
    }
  };

  const handleOpen = (project: Project) => {
    navigate("/editor", { state: { projectId: project.projectId } });
  };

  const handleDelete = async (projectId: string) => {
    try {
      await invoke("delete_project", { projectId });
      setDeleteConfirm(null);
      await loadProjects();
    } catch (err) {
      setError("Error eliminando proyecto: " + String(err));
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return <div className="proyectos-loading">Cargando proyectos…</div>;
  }

  return (
    <div className="proyectos-container">
      <div className="proyectos-header">
        <h1>Proyectos</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Nuevo proyecto
        </button>
      </div>

      {error && (
        <div className="proyectos-error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo proyecto</h2>
            <div className="modal-form">
              <label>Nombre del proyecto</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Story Semana 24"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <label>Preset por defecto</label>
              <select
                value={newPreset}
                onChange={(e) => setNewPreset(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
            <h2>¿Eliminar proyecto?</h2>
            <p>Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancelar
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="proyectos-empty">
          <p>No hay proyectos todavía.</p>
          <p>
            Haz clic en <strong>+ Nuevo proyecto</strong> para empezar.
          </p>
        </div>
      ) : (
        <div className="proyectos-grid">
          {projects.map((project) => (
            <div key={project.projectId} className="proyecto-card">
              <div className="proyecto-card-body" onClick={() => handleOpen(project)}>
                <h3 className="proyecto-name">{project.name}</h3>
                <div className="proyecto-meta">
                  <span className="proyecto-pages">
                    {project.pages.length}{" "}
                    {project.pages.length === 1 ? "página" : "páginas"}
                  </span>
                  <span className="proyecto-preset">
                    {PRESETS.find((p) => p.id === project.defaultPreset)?.label ??
                      project.defaultPreset}
                  </span>
                </div>
                <div className="proyecto-date">
                  Actualizado: {formatDate(project.updatedAt)}
                </div>
              </div>
              <div className="proyecto-card-actions">
                <button
                  className="btn-open"
                  onClick={() => handleOpen(project)}
                >
                  Abrir
                </button>
                <button
                  className="btn-delete-card"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(project.projectId);
                  }}
                  title="Eliminar proyecto"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
