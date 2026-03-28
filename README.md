# Editor Paquetes

App de escritorio local para editar y exportar paquetes/ofertas con imágenes para celular.
Construida con **Tauri + React + TypeScript + Konva**.

## Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Dependencias del sistema para Tauri: [ver guía oficial](https://tauri.app/v1/guides/getting-started/prerequisites)

## Instalación de dependencias

```bash
npm install
```

## Correr en desarrollo

```bash
npm run tauri dev
```

Esto inicia el servidor Vite en `http://localhost:1420` y abre la ventana de Tauri.

## Compilar para producción

```bash
npm run tauri build
```

El instalador se genera en `src-tauri/target/release/bundle/`.

## Estructura del proyecto

```
editor-paquetes/
├── src/                    # Frontend React + TypeScript
│   ├── views/
│   │   ├── Catalogo.tsx    # Vista de catálogo de productos (placeholder)
│   │   ├── Proyectos.tsx   # Vista de proyectos (placeholder)
│   │   └── Editor.tsx      # Vista del editor con canvas Konva
│   ├── components/
│   │   └── Navbar.tsx      # Barra de navegación
│   ├── presets.ts          # Definición de presets de lienzo
│   └── App.tsx             # Enrutamiento principal
├── src-tauri/              # Backend Rust (Tauri)
│   └── src/
│       └── main.rs         # Comandos Tauri: workspace, exportación
└── README.md
```

## Presets de lienzo

| ID             | Dimensiones    | Uso                        |
|----------------|---------------|----------------------------|
| `story`        | 1080 × 1920   | Stories de Instagram/FB    |
| `whatsapp_4_5` | 1080 × 1350   | WhatsApp vertical (4:5)    |

## Catálogo de productos

La vista **Catálogo** permite importar imágenes de productos, organizarlas por categoría y buscarlas rápidamente.

### Cómo importar imágenes

1. Ve a **Catálogo** en la barra de navegación.
2. Selecciona la **categoría** destino en el selector de la esquina superior derecha.
3. Pulsa **"Importar imágenes"** y elige uno o varios archivos `.png` / `.jpg` / `.jpeg`.
4. Las imágenes se copian automáticamente a `<workspace>/images/` y se registran en `<workspace>/catalog.json`.

### Convención de nombre de archivo

El parser extrae **código** y **nombre** del nombre del archivo usando el separador `+`:

| Archivo                         | Código | Nombre             |
|---------------------------------|--------|--------------------|
| `206+dendur.png`                | `206`  | `dendur`           |
| `392+desodorante ohm.png`       | `392`  | `desodorante ohm`  |
| `logo_producto.png` (sin `+`)   | `pendiente` | `logo producto` |

Reglas:
- Todo antes del primer `+` → **código** (se hace trim).
- Todo después del `+` hasta la extensión → **nombre** (se hace trim, `_` → espacio, espacios múltiples colapsados).
- Sin `+`: código queda como `pendiente` y puede editarse después.

### Dónde se guarda el workspace

La app usa el directorio de datos de la aplicación del sistema operativo:

| OS      | Ruta                                               |
|---------|----------------------------------------------------|
| Windows | `%APPDATA%\editor-paquetes\`                       |
| macOS   | `~/Library/Application Support/editor-paquetes/`  |
| Linux   | `~/.local/share/editor-paquetes/`                  |

Dentro del workspace:
- `images/` – imágenes importadas al catálogo
- `catalog.json` – registro persistente del catálogo
- `exports/` – exportaciones PNG/JPG generadas por el editor
- `templates/` – plantillas (uso futuro)

La ruta completa del workspace se muestra en gris debajo del encabezado de la vista Catálogo (útil para depuración).


