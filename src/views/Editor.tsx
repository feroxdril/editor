import {
  useRef,
  useState,
  useEffect,
  useCallback,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stage, Layer, Rect, Image as KImage, Text, Transformer, Group } from "react-konva";
import Konva from "konva";
import { invoke } from "@tauri-apps/api/tauri";
import { PRESETS, getPreset } from "../presets";
import type { CatalogItem } from "../types/catalog";
import type {
  Project,
  Page,
  CanvasElement,
  ImageElement,
  TextElement,
  OfferTexts,
} from "../types/project";
import "./Editor.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return crypto.randomUUID();
}

function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Parse "2221, 206x3, 392(2)" → [{code, qty}] */
function parseCodeInput(input: string): { code: string; qty: number }[] {
  return input
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      // Match "CODE(N)" or "CODExN" or "CODE"
      const matchParen = token.match(/^(.+?)\((\d+)\)$/);
      const matchX = token.match(/^(.+?)x(\d+)$/i);
      if (matchParen) {
        return { code: matchParen[1].trim(), qty: parseInt(matchParen[2], 10) };
      }
      if (matchX) {
        return { code: matchX[1].trim(), qty: parseInt(matchX[2], 10) };
      }
      return { code: token, qty: 1 };
    });
}

/** Heuristic layout: place items in the upper 70% of canvas. */
function generateLayout(
  flatItems: CatalogItem[],
  totalOriginalCount: number,
  preset: { width: number; height: number }
): Omit<ImageElement, "id">[] {
  const pad = 60;
  const areaTop = pad;
  const areaLeft = pad;
  const areaWidth = preset.width - pad * 2;
  const areaHeight = preset.height * 0.68 - pad;
  const n = flatItems.length;

  if (n === 0) return [];

  let cols: number;
  let rows: number;
  if (n === 1) {
    cols = 1; rows = 1;
  } else if (n === 2) {
    cols = 2; rows = 1;
  } else if (n <= 4) {
    cols = 2; rows = Math.ceil(n / 2);
  } else if (n <= 6) {
    cols = 3; rows = Math.ceil(n / 3);
  } else {
    cols = Math.ceil(Math.sqrt(n));
    rows = Math.ceil(n / cols);
  }

  const gap = 20;
  const cellW = (areaWidth - gap * (cols - 1)) / cols;
  const cellH = (areaHeight - gap * (rows - 1)) / rows;

  const result: Omit<ImageElement, "id">[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const item = flatItems[i];
    // Find original qty to know if badge needed
    const origEntry = flatItems.filter((x) => x.id === item.id);
    const qty = totalOriginalCount > 0 ? origEntry.length : 1;
    result.push({
      type: "image",
      catalogItemId: item.id,
      storedRelativePath: item.storedRelativePath,
      badge: qty > 1 ? `x${qty}` : undefined,
      x: areaLeft + col * (cellW + gap),
      y: areaTop + row * (cellH + gap),
      width: cellW,
      height: cellH,
      rotation: 0,
      zIndex: i + 1,
    });
  }
  return result;
}

/** Build text elements for offer texts, placed in lower area. */
function buildOfferTextElements(
  texts: OfferTexts,
  preset: { width: number; height: number },
  existingTextEls: TextElement[]
): TextElement[] {
  const areaTop = preset.height * 0.70;
  const roles: Array<{
    role: TextElement["role"];
    default: (t: OfferTexts) => string;
    defaultY: number;
    fontSize: number;
    fill: string;
    fontStyle: string;
  }> = [
    {
      role: "title",
      default: (t) => t.title,
      defaultY: areaTop + 10,
      fontSize: 60,
      fill: "#ffffff",
      fontStyle: "bold",
    },
    {
      role: "publicPrice",
      default: (t) => t.publicPrice ? `Precio público: ${t.publicPrice}` : "",
      defaultY: areaTop + 90,
      fontSize: 44,
      fill: "#cccccc",
      fontStyle: "normal",
    },
    {
      role: "payOnly",
      default: (t) => t.payOnly ? `Paga solo: ${t.payOnly}` : "",
      defaultY: areaTop + 150,
      fontSize: 52,
      fill: "#e94560",
      fontStyle: "bold",
    },
    {
      role: "offerUntil",
      default: (t) => t.offerUntil ? `Oferta hasta: ${t.offerUntil}` : "",
      defaultY: areaTop + 220,
      fontSize: 36,
      fill: "#aaaaaa",
      fontStyle: "italic",
    },
  ];

  return roles.map(({ role, default: defaultFn, defaultY, fontSize, fill, fontStyle }) => {
    const existing = existingTextEls.find((el) => el.role === role);
    return {
      id: existing?.id ?? genId(),
      type: "text" as const,
      role,
      text: defaultFn(texts),
      x: existing?.x ?? 60,
      y: existing?.y ?? defaultY,
      width: existing?.width ?? preset.width - 120,
      height: existing?.height ?? 80,
      fontSize: existing?.fontSize ?? fontSize,
      fontStyle: existing?.fontStyle ?? fontStyle,
      fill: existing?.fill ?? fill,
      align: existing?.align ?? "center",
      rotation: existing?.rotation ?? 0,
      zIndex: existing?.zIndex ?? 100 + roles.findIndex((r) => r.role === role),
    };
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Editor() {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = (location.state as { projectId?: string } | null)?.projectId;

  // Project state
  const [project, setProject] = useState<Project | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // Catalog
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  // Canvas
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Image cache: elementId → HTMLImageElement
  const [imageCache, setImageCache] = useState<Record<string, HTMLImageElement>>({});

  // UI state
  const [codeInput, setCodeInput] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  // Rename page state
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Standalone preset (no project)
  const [standalonePresetId, setStandalonePresetId] = useState("story");

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const isStandalone = !projectId;
  const currentPage: Page | null = project?.pages[pageIndex] ?? null;
  const presetId = currentPage?.preset ?? standalonePresetId;
  const preset = getPreset(presetId);

  // Scale canvas to fit viewport
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth - 260 : 800;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight - 120 : 600;
  const scale = Math.min(viewportWidth / preset.width, viewportHeight / preset.height, 1);
  const stageWidth = preset.width * scale;
  const stageHeight = preset.height * scale;

  // -------------------------------------------------------------------------
  // Load project & catalog on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const loadAll = async () => {
      try {
        const _ws = await invoke<string>("get_workspace_path");
        void _ws; // ensure workspace dir is initialized
        const cat = await invoke<CatalogItem[]>("list_catalog");
        setCatalog(cat);

        if (projectId) {
          const projects = await invoke<Project[]>("list_projects");
          const found = projects.find((p) => p.projectId === projectId);
          if (found) {
            setProject(found);
          }
        }
      } catch (err) {
        console.error("Error loading editor data:", err);
      }
    };
    loadAll();
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Load images for current page
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!currentPage) return;
    const imageEls = currentPage.elements.filter(
      (el): el is ImageElement => el.type === "image"
    );
    const needed = imageEls.filter((el) => !imageCache[el.id]);
    if (needed.length === 0) return;

    needed.forEach((el) => {
      invoke<string>("read_image_data_url", { relativePath: el.storedRelativePath })
        .then((dataUrl) => {
          const img = new window.Image();
          img.src = dataUrl;
          img.onload = () => {
            setImageCache((prev) => ({ ...prev, [el.id]: img }));
          };
        })
        .catch((err) => console.warn("Error loading image:", err));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.elements]);

  // -------------------------------------------------------------------------
  // Transformer sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (selectedId) {
      const stage = tr.getStage();
      const node = stage?.findOne("#" + selectedId);
      if (node) {
        tr.nodes([node]);
      } else {
        tr.nodes([]);
      }
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId]);

  // -------------------------------------------------------------------------
  // Project persistence
  // -------------------------------------------------------------------------
  const saveProject = useCallback(
    async (updatedProject: Project) => {
      setSaveStatus("saving");
      try {
        await invoke("save_project", { project: updatedProject });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Error saving project:", err);
        setSaveStatus("error");
      }
    },
    []
  );

  const updateCurrentPageElements = useCallback(
    (updater: (els: CanvasElement[]) => CanvasElement[]) => {
      if (!project) return;
      const updated = cloneDeep(project);
      updated.pages[pageIndex].elements = updater(updated.pages[pageIndex].elements);
      updated.updatedAt = new Date().toISOString();
      setProject(updated);
      saveProject(updated);
    },
    [project, pageIndex, saveProject]
  );

  const updateCurrentPageOfferTexts = useCallback(
    (texts: OfferTexts) => {
      if (!project) return;
      const updated = cloneDeep(project);
      updated.pages[pageIndex].offerTexts = texts;
      // Rebuild text elements
      const existing = updated.pages[pageIndex].elements.filter(
        (el): el is TextElement => el.type === "text"
      );
      const textEls = buildOfferTextElements(texts, preset, existing);
      updated.pages[pageIndex].elements = [
        ...updated.pages[pageIndex].elements.filter((el) => el.type !== "text"),
        ...textEls,
      ];
      updated.updatedAt = new Date().toISOString();
      setProject(updated);
      saveProject(updated);
    },
    [project, pageIndex, preset, saveProject]
  );

  // -------------------------------------------------------------------------
  // Element operations
  // -------------------------------------------------------------------------
  const updateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      updateCurrentPageElements((els) =>
        els.map((el) => (el.id === id ? { ...el, ...updates } as CanvasElement : el))
      );
    },
    [updateCurrentPageElements]
  );

  const deleteElement = useCallback(
    (id: string) => {
      setSelectedId(null);
      updateCurrentPageElements((els) => els.filter((el) => el.id !== id));
    },
    [updateCurrentPageElements]
  );

  const duplicateElement = useCallback(
    (id: string) => {
      updateCurrentPageElements((els) => {
        const src = els.find((el) => el.id === id);
        if (!src) return els;
        const copy: CanvasElement = {
          ...cloneDeep(src),
          id: genId(),
          x: src.x + 30,
          y: src.y + 30,
          zIndex: Math.max(...els.map((e) => e.zIndex), 0) + 1,
        };
        return [...els, copy];
      });
    },
    [updateCurrentPageElements]
  );

  const bringForward = useCallback(
    (id: string) => {
      updateCurrentPageElements((els) => {
        const el = els.find((e) => e.id === id);
        if (!el) return els;
        const next = els.filter((e) => e.zIndex > el.zIndex).sort((a, b) => a.zIndex - b.zIndex)[0];
        if (!next) return els;
        const tmp = el.zIndex;
        return els.map((e) =>
          e.id === id ? { ...e, zIndex: next.zIndex } as CanvasElement :
          e.id === next.id ? { ...e, zIndex: tmp } as CanvasElement : e
        );
      });
    },
    [updateCurrentPageElements]
  );

  const sendBackward = useCallback(
    (id: string) => {
      updateCurrentPageElements((els) => {
        const el = els.find((e) => e.id === id);
        if (!el) return els;
        const prev = els.filter((e) => e.zIndex < el.zIndex).sort((a, b) => b.zIndex - a.zIndex)[0];
        if (!prev) return els;
        const tmp = el.zIndex;
        return els.map((e) =>
          e.id === id ? { ...e, zIndex: prev.zIndex } as CanvasElement :
          e.id === prev.id ? { ...e, zIndex: tmp } as CanvasElement : e
        );
      });
    },
    [updateCurrentPageElements]
  );

  // -------------------------------------------------------------------------
  // Keyboard handler
  // -------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          deleteElement(selectedId);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
      }
    },
    [selectedId, deleteElement]
  );

  // -------------------------------------------------------------------------
  // Code generation
  // -------------------------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    if (!project || !currentPage) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const entries = parseCodeInput(codeInput);
      if (entries.length === 0) {
        setGenerateError("Ingresa al menos un código.");
        return;
      }

      // Resolve catalog items
      const flatItems: CatalogItem[] = [];
      const notFound: string[] = [];
      for (const { code, qty } of entries) {
        const item = catalog.find(
          (c) => c.code.toLowerCase() === code.toLowerCase()
        );
        if (!item) {
          notFound.push(code);
        } else {
          for (let i = 0; i < qty; i++) {
            flatItems.push(item);
          }
        }
      }

      if (notFound.length > 0) {
        setGenerateError(`Códigos no encontrados: ${notFound.join(", ")}`);
        if (flatItems.length === 0) return;
      }

      const totalCount = entries.reduce((s, e) => s + e.qty, 0);
      const imageElDefs = generateLayout(flatItems, totalCount, preset);
      const newImageEls: ImageElement[] = imageElDefs.map((def) => ({
        ...def,
        id: genId(),
      }));

      // Load images for new elements
      const toLoad = newImageEls;
      toLoad.forEach((el) => {
        invoke<string>("read_image_data_url", { relativePath: el.storedRelativePath })
          .then((dataUrl) => {
            const img = new window.Image();
            img.src = dataUrl;
            img.onload = () => {
              setImageCache((prev) => ({ ...prev, [el.id]: img }));
            };
          })
          .catch((err) => console.warn("Error loading image:", err));
      });

      // Rebuild text elements from current offerTexts
      const existingTextEls = currentPage.elements.filter(
        (el): el is TextElement => el.type === "text"
      );
      const textEls = buildOfferTextElements(
        currentPage.offerTexts,
        preset,
        existingTextEls
      );

      const updated = cloneDeep(project);
      updated.pages[pageIndex].elements = [...newImageEls, ...textEls];
      updated.updatedAt = new Date().toISOString();
      setProject(updated);
      await saveProject(updated);
      setCodeInput("");
    } finally {
      setIsGenerating(false);
    }
  }, [project, currentPage, pageIndex, codeInput, catalog, preset, saveProject]);

  // -------------------------------------------------------------------------
  // Page operations
  // -------------------------------------------------------------------------
  const addPage = useCallback(() => {
    if (!project) return;
    const updated = cloneDeep(project);
    const newPage: Page = {
      pageId: genId(),
      name: `Página ${updated.pages.length + 1}`,
      preset: project.defaultPreset,
      elements: [],
      offerTexts: { title: "", publicPrice: "", payOnly: "", offerUntil: "" },
      background: "#16213e",
    };
    updated.pages.push(newPage);
    updated.updatedAt = new Date().toISOString();
    setProject(updated);
    setPageIndex(updated.pages.length - 1);
    setSelectedId(null);
    saveProject(updated);
  }, [project, saveProject]);

  const duplicatePage = useCallback(() => {
    if (!project || !currentPage) return;
    const updated = cloneDeep(project);
    const copy: Page = {
      ...cloneDeep(currentPage),
      pageId: genId(),
      name: `${currentPage.name} (copia)`,
    };
    updated.pages.splice(pageIndex + 1, 0, copy);
    updated.updatedAt = new Date().toISOString();
    setProject(updated);
    setPageIndex(pageIndex + 1);
    setSelectedId(null);
    saveProject(updated);
  }, [project, currentPage, pageIndex, saveProject]);

  const deletePage = useCallback(
    (idx: number) => {
      if (!project || project.pages.length <= 1) return;
      const updated = cloneDeep(project);
      updated.pages.splice(idx, 1);
      updated.updatedAt = new Date().toISOString();
      const newIdx = Math.min(idx, updated.pages.length - 1);
      setProject(updated);
      setPageIndex(newIdx);
      setSelectedId(null);
      saveProject(updated);
    },
    [project, saveProject]
  );

  const renamePage = useCallback(
    (pageId: string, newName: string) => {
      if (!project) return;
      const updated = cloneDeep(project);
      const pg = updated.pages.find((p) => p.pageId === pageId);
      if (pg) pg.name = newName.trim() || pg.name;
      updated.updatedAt = new Date().toISOString();
      setProject(updated);
      saveProject(updated);
    },
    [project, saveProject]
  );

  const updateBackground = useCallback(
    (color: string) => {
      if (!project) return;
      const updated = cloneDeep(project);
      updated.pages[pageIndex].background = color;
      updated.updatedAt = new Date().toISOString();
      setProject(updated);
      saveProject(updated);
    },
    [project, pageIndex, saveProject]
  );

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------
  const exportPage = useCallback(
    async (idx: number, filePrefix?: string) => {
      if (!stageRef.current || !project) return;
      // If exporting a different page, we can't use the current stage directly
      // For MVP, only export current visible page via stage
      const filename = `${filePrefix ?? project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_page${idx + 1}_${Date.now()}.png`;
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      await invoke("save_export", { dataUrl, filename });
    },
    [project]
  );

  const handleExportPage = useCallback(async () => {
    try {
      await exportPage(pageIndex);
      alert("¡Página exportada en exports/!");
    } catch (err) {
      alert("Error exportando: " + String(err));
    }
  }, [exportPage, pageIndex]);

  const handleExportAll = useCallback(async () => {
    if (!project) return;
    try {
      // We can only export the currently visible page via the stage
      // For a full export of all pages we need to navigate + wait, which is complex
      // MVP: Export current page, and note this limitation
      await exportPage(pageIndex);
      alert(
        `Página ${pageIndex + 1} exportada. Para exportar todas las páginas, navega a cada una y exporta individualmente.`
      );
    } catch (err) {
      alert("Error exportando: " + String(err));
    }
  }, [project, exportPage, pageIndex]);

  // -------------------------------------------------------------------------
  // Standalone export (no project)
  // -------------------------------------------------------------------------
  const handleStandaloneExport = useCallback(async () => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
    try {
      await invoke("save_export", {
        dataUrl,
        filename: `export_${standalonePresetId}_${Date.now()}.png`,
      });
      alert("¡Exportación guardada en exports/!");
    } catch (err) {
      alert("Error al exportar: " + String(err));
    }
  }, [standalonePresetId]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const sortedElements = currentPage
    ? [...currentPage.elements].sort((a, b) => a.zIndex - b.zIndex)
    : [];

  const selectedElement = selectedId
    ? currentPage?.elements.find((el) => el.id === selectedId) ?? null
    : null;

  // -------------------------------------------------------------------------
  // Render: Standalone mode (no project)
  // -------------------------------------------------------------------------
  if (isStandalone) {
    return (
      <div className="editor-layout" tabIndex={0}>
        <div className="editor-sidebar">
          <h2>Editor</h2>
          <div className="form-group">
            <label>Preset de lienzo</label>
            <select
              value={standalonePresetId}
              onChange={(e) => setStandalonePresetId(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="preset-info">
            {preset.width} × {preset.height} px
          </div>
          <div className="sidebar-hint">
            <p>
              Abre un <strong>Proyecto</strong> para acceder al editor
              completo (códigos, páginas, textos).
            </p>
            <button
              className="btn-secondary-sm"
              onClick={() => navigate("/proyectos")}
            >
              Ir a Proyectos
            </button>
          </div>
          <button className="btn-export" onClick={handleStandaloneExport}>
            Exportar PNG
          </button>
        </div>
        <div className="editor-canvas-area">
          <Stage ref={stageRef} width={stageWidth} height={stageHeight} scaleX={scale} scaleY={scale}>
            <Layer>
              <Rect x={0} y={0} width={preset.width} height={preset.height} fill="#16213e" />
              <Text
                text="Editor Paquetes"
                x={0}
                y={preset.height / 2 - 60}
                width={preset.width}
                align="center"
                fontSize={80}
                fill="#e94560"
                fontStyle="bold"
              />
              <Text
                text="Abre un proyecto para empezar"
                x={0}
                y={preset.height / 2 + 60}
                width={preset.width}
                align="center"
                fontSize={40}
                fill="#a0a0b0"
              />
            </Layer>
          </Stage>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Loading
  // -------------------------------------------------------------------------
  if (!project) {
    return (
      <div className="editor-loading">
        <p>Cargando proyecto…</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Full editor with project
  // -------------------------------------------------------------------------
  const offerTexts = currentPage?.offerTexts ?? {
    title: "",
    publicPrice: "",
    payOnly: "",
    offerUntil: "",
  };

  return (
    <div
      className="editor-layout"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: "none" }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Sidebar                                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="editor-sidebar editor-sidebar--wide">
        {/* Project title */}
        <div className="sidebar-project-name">
          <span title={project.name}>{project.name}</span>
          <span
            className={`save-status save-status--${saveStatus}`}
            title={saveStatus === "saving" ? "Guardando…" : saveStatus === "error" ? "Error al guardar" : "Guardado"}
          >
            {saveStatus === "saving" ? "⟳" : saveStatus === "error" ? "⚠" : "✓"}
          </span>
        </div>

        {/* Pages */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Páginas</span>
            <button className="btn-icon" onClick={addPage} title="Nueva página">＋</button>
          </div>
          <div className="pages-list">
            {project.pages.map((page, idx) => (
              <div
                key={page.pageId}
                className={`page-tab ${idx === pageIndex ? "page-tab--active" : ""}`}
              >
                {renamingPageId === page.pageId ? (
                  <input
                    className="page-rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      renamePage(page.pageId, renameValue);
                      setRenamingPageId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renamePage(page.pageId, renameValue);
                        setRenamingPageId(null);
                      }
                      if (e.key === "Escape") setRenamingPageId(null);
                    }}
                  />
                ) : (
                  <span
                    className="page-tab-name"
                    onClick={() => {
                      setPageIndex(idx);
                      setSelectedId(null);
                    }}
                    onDoubleClick={() => {
                      setRenamingPageId(page.pageId);
                      setRenameValue(page.name);
                    }}
                    title="Doble clic para renombrar"
                  >
                    {page.name}
                  </span>
                )}
                <div className="page-tab-actions">
                  <button
                    className="btn-icon-sm"
                    onClick={() => {
                      setPageIndex(idx);
                      duplicatePage();
                    }}
                    title="Duplicar"
                  >
                    ⧉
                  </button>
                  {project.pages.length > 1 && (
                    <button
                      className="btn-icon-sm btn-icon-sm--danger"
                      onClick={() => deletePage(idx)}
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Code generator */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Generar por códigos</span>
          </div>
          <textarea
            className="code-input"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder={"Ej: 2221, 206x3, 392(2)"}
            rows={3}
          />
          {generateError && <div className="generate-error">{generateError}</div>}
          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={isGenerating || !codeInput.trim()}
          >
            {isGenerating ? "Generando…" : "⚡ Generar"}
          </button>
        </div>

        {/* Background color */}
        {currentPage && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Fondo</span>
            </div>
            <div className="form-row">
              <input
                type="color"
                value={currentPage.background}
                onChange={(e) => updateBackground(e.target.value)}
                className="color-picker"
              />
              <span className="color-label">{currentPage.background}</span>
            </div>
          </div>
        )}

        {/* Offer texts */}
        <div className="sidebar-section sidebar-section--grow">
          <div className="sidebar-section-header">
            <span>Textos de oferta</span>
          </div>
          <div className="offer-texts-form">
            {(
              [
                { key: "title", label: "Título" },
                { key: "publicPrice", label: "Precio público" },
                { key: "payOnly", label: "Paga solo" },
                { key: "offerUntil", label: "Oferta hasta" },
              ] as { key: keyof OfferTexts; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="offer-text-row">
                <label>{label}</label>
                <input
                  type="text"
                  value={offerTexts[key]}
                  onChange={(e) => {
                    const updated = { ...offerTexts, [key]: e.target.value };
                    updateCurrentPageOfferTexts(updated);
                  }}
                  placeholder={label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Selected element controls */}
        {selectedElement && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Elemento seleccionado</span>
            </div>
            <div className="element-controls">
              <button
                className="btn-icon-action"
                onClick={() => duplicateElement(selectedElement.id)}
              >
                ⧉ Duplicar
              </button>
              <button
                className="btn-icon-action"
                onClick={() => bringForward(selectedElement.id)}
              >
                ↑ Traer
              </button>
              <button
                className="btn-icon-action"
                onClick={() => sendBackward(selectedElement.id)}
              >
                ↓ Enviar
              </button>
              <button
                className="btn-icon-action btn-icon-action--danger"
                onClick={() => deleteElement(selectedElement.id)}
              >
                🗑 Eliminar
              </button>
            </div>
            {selectedElement.type === "text" && (
              <div className="text-el-controls">
                <label>Texto</label>
                <textarea
                  value={selectedElement.text}
                  onChange={(e) =>
                    updateElement(selectedElement.id, { text: e.target.value })
                  }
                  rows={2}
                />
                <label>Tamaño fuente</label>
                <input
                  type="number"
                  value={selectedElement.fontSize}
                  min={8}
                  max={300}
                  onChange={(e) =>
                    updateElement(selectedElement.id, {
                      fontSize: Number(e.target.value),
                    })
                  }
                />
                <label>Color</label>
                <input
                  type="color"
                  value={selectedElement.fill}
                  onChange={(e) =>
                    updateElement(selectedElement.id, { fill: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* Export */}
        <div className="sidebar-export">
          <button className="btn-export" onClick={handleExportPage}>
            Exportar página
          </button>
          <button className="btn-export-all" onClick={handleExportAll}>
            Exportar todo
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Canvas area                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="editor-canvas-area">
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            // Deselect when clicking on empty area
            if (e.target === e.target.getStage() || e.target.name() === "background") {
              setSelectedId(null);
            }
          }}
        >
          <Layer>
            {/* Background */}
            <Rect
              name="background"
              x={0}
              y={0}
              width={preset.width}
              height={preset.height}
              fill={currentPage?.background ?? "#16213e"}
            />

            {/* Elements sorted by zIndex */}
            {sortedElements.map((el) => {
              if (el.type === "image") {
                const imgEl = el as ImageElement;
                const htmlImg = imageCache[imgEl.id];
                if (!htmlImg) {
                  // Placeholder rect while loading
                  return (
                    <Rect
                      key={el.id}
                      id={el.id}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      rotation={el.rotation}
                      fill="#0f3460"
                      stroke={selectedId === el.id ? "#e94560" : "transparent"}
                      strokeWidth={2}
                      draggable
                      onClick={() => setSelectedId(el.id)}
                      onTap={() => setSelectedId(el.id)}
                      onDragEnd={(e) => {
                        updateElement(el.id, { x: e.target.x(), y: e.target.y() });
                      }}
                    />
                  );
                }
                return (
                  <Group
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    rotation={el.rotation}
                    draggable
                    onClick={() => setSelectedId(el.id)}
                    onTap={() => setSelectedId(el.id)}
                    onDragEnd={(e) => {
                      updateElement(el.id, { x: e.target.x(), y: e.target.y() });
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      updateElement(el.id, {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(20, el.width * scaleX),
                        height: Math.max(20, el.height * scaleY),
                        rotation: node.rotation(),
                      });
                    }}
                  >
                    <KImage
                      image={htmlImg}
                      width={el.width}
                      height={el.height}
                    />
                    {imgEl.badge && (
                      <>
                        <Rect
                          x={el.width - 80}
                          y={10}
                          width={70}
                          height={40}
                          fill="#e94560"
                          cornerRadius={6}
                        />
                        <Text
                          text={imgEl.badge}
                          x={el.width - 80}
                          y={14}
                          width={70}
                          align="center"
                          fontSize={26}
                          fill="#ffffff"
                          fontStyle="bold"
                        />
                      </>
                    )}
                  </Group>
                );
              }

              if (el.type === "text") {
                const textEl = el as TextElement;
                return (
                  <Text
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    rotation={el.rotation}
                    text={textEl.text}
                    fontSize={textEl.fontSize}
                    fontStyle={textEl.fontStyle}
                    fill={textEl.fill}
                    align={textEl.align as "left" | "center" | "right"}
                    draggable
                    onClick={() => setSelectedId(el.id)}
                    onTap={() => setSelectedId(el.id)}
                    onDragEnd={(e) => {
                      updateElement(el.id, { x: e.target.x(), y: e.target.y() });
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      node.scaleX(1);
                      node.scaleY(1);
                      updateElement(el.id, {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(50, el.width * scaleX),
                        rotation: node.rotation(),
                      });
                    }}
                  />
                );
              }

              return null;
            })}

            {/* Transformer */}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 20 || newBox.height < 20) return oldBox;
                return newBox;
              }}
              rotateEnabled={true}
              keepRatio={false}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
