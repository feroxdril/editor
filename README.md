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

## Workspace local

La app guarda datos en el directorio de datos de la aplicación:
- `images/` – catálogo de imágenes de productos
- `exports/` – exportaciones PNG/JPG
- `templates/` – plantillas (uso futuro)

Para obtener la ruta del workspace desde el frontend:
```ts
import { invoke } from "@tauri-apps/api/tauri";
const path = await invoke("get_workspace_path");
```
