import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { join } from "@tauri-apps/api/path";
import type { CatalogItem } from "../types/catalog";
import { CATEGORIES } from "../types/catalog";

// ---------------------------------------------------------------------------
// Thumbnail component
// ---------------------------------------------------------------------------

interface ThumbnailProps {
  workspacePath: string;
  storedFilename: string;
  name: string;
}

function Thumbnail({ workspacePath, storedFilename, name }: ThumbnailProps) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    if (!workspacePath || !storedFilename) return;
    join(workspacePath, "images", storedFilename)
      .then((abs) => setSrc(convertFileSrc(abs)))
      .catch(() => setSrc(""));
  }, [workspacePath, storedFilename]);

  if (!src) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontSize: "0.75rem",
        }}
      >
        Sin imagen
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  item: CatalogItem;
  onSave: (updated: CatalogItem) => void;
  onClose: () => void;
}

function EditModal({ item, onSave, onClose }: EditModalProps) {
  const [code, setCode] = useState(item.code);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);

  function handleSave() {
    onSave({ ...item, code: code.trim(), name: name.trim(), category });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e1e1e",
          padding: "2rem",
          borderRadius: "12px",
          width: "420px",
          maxWidth: "90vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1.5rem", fontSize: "1.1rem" }}>
          Editar producto
        </h2>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}
          >
            Código
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}
          >
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label
            style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}
          >
            Categoría
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "#333", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer" }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function Catalogo() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [workspacePath, setWorkspacePath] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [importCategory, setImportCategory] = useState<string>(CATEGORIES[0]);
  const [importing, setImporting] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    try {
      const catalog = await invoke<CatalogItem[]>("list_catalog");
      setItems(catalog);
    } catch (e) {
      setError(`Error cargando catálogo: ${e}`);
    }
  }, []);

  useEffect(() => {
    invoke<string>("get_workspace_path")
      .then(setWorkspacePath)
      .catch(() => {});
    loadCatalog();
  }, [loadCatalog]);

  async function handleImport() {
    setError("");
    setImporting(true);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newItems = await invoke<CatalogItem[]>("import_images", {
        filePaths: paths,
        category: importCategory,
      });
      setItems((prev) => [...prev, ...newItems]);
    } catch (e) {
      setError(`Error importando imágenes: ${e}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveEdit(updated: CatalogItem) {
    try {
      await invoke("update_catalog_item", { item: updated });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditItem(null);
    } catch (e) {
      setError(`Error actualizando producto: ${e}`);
    }
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q);
    const matchCat = !categoryFilter || item.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div style={{ padding: "1.5rem", maxHeight: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Catálogo</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={importCategory}
            onChange={(e) => setImportCategory(e.target.value)}
            title="Categoría para las imágenes a importar"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={handleImport}
            disabled={importing}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              cursor: importing ? "not-allowed" : "pointer",
              opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? "Importando…" : "Importar imágenes"}
          </button>
        </div>
      </div>

      {/* Workspace path debug label */}
      {workspacePath && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "#666",
            marginBottom: "0.75rem",
            wordBreak: "break-all",
          }}
        >
          Workspace: {workspacePath}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            color: "#f87171",
            background: "#3b1111",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
          <button
            onClick={() => setError("")}
            style={{ marginLeft: "0.75rem", background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar por código o nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "180px" }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Item count */}
      {items.length > 0 && (
        <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.75rem" }}>
          {filtered.length} de {items.length} producto{filtered.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Grid / empty state */}
      {filtered.length === 0 ? (
        <p style={{ color: "#666", marginTop: "2rem", textAlign: "center" }}>
          {items.length === 0
            ? "No hay productos en el catálogo. Usa «Importar imágenes» para comenzar."
            : "No se encontraron productos con ese filtro."}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: "1rem",
          }}
        >
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setEditItem({ ...item })}
              title="Haz clic para editar"
              style={{
                border: "1px solid #2e2e2e",
                borderRadius: "8px",
                overflow: "hidden",
                cursor: "pointer",
                transition: "border-color 0.15s",
                background: "#181818",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#2e2e2e";
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  height: "140px",
                  background: "#141414",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <Thumbnail
                  workspacePath={workspacePath}
                  storedFilename={item.storedFilename}
                  name={item.name}
                />
              </div>

              {/* Info */}
              <div style={{ padding: "0.5rem 0.6rem" }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    color: "#e0e0e0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.code}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#bbb",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.name}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#666", marginTop: "0.2rem" }}>
                  {item.category}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <EditModal
          item={editItem}
          onSave={handleSaveEdit}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

