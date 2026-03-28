# Editor Paquetes

App de escritorio local para editar y exportar paquetes/ofertas con imágenes para celular.  
Construida con **Tauri + React + TypeScript + Konva**.

## Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Dependencias del sistema para Tauri: [ver guía oficial](https://tauri.app/v1/guides/getting-started/prerequisites)
- En Windows: Visual Studio Build Tools con workload **"Desktop development with C++"**

## Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Desarrollo (inicia Vite + Tauri)
npm run tauri dev

# Compilar para producción
npm run tauri build
```

---

## Flujo completo: Catálogo → Proyectos → Editor → Exportar

### 1) Catálogo — Importar imágenes

1. Abre la app y ve a **Catálogo**.
2. Elige una **categoría** en el selector superior derecho.
3. Pulsa **"Importar imágenes"** y selecciona archivos `.png` / `.jpg` / `.jpeg`.
4. Las imágenes se copian a `<workspace>/images/` y se registran en `catalog.json`.
5. Puedes buscar por código o nombre, editar campos y eliminar ítems.

**Convención de nombre de archivo:** usa `CODIGO+NOMBRE.ext` para que el parser extraiga automáticamente código y nombre:

| Archivo | Código | Nombre |
|---|---|---|
| `206+dendur.png` | `206` | `dendur` |
| `392+desodorante ohm.png` | `392` | `desodorante ohm` |
| `logo.png` (sin `+`) | `pendiente` | `logo` |

---

### 2) Proyectos — Crear y gestionar

1. Ve a **Proyectos**.
2. Pulsa **"+ Nuevo proyecto"**, escribe el nombre y elige el preset por defecto.
3. El proyecto se guarda en `<workspace>/projects.json`.
4. Haz clic en **Abrir** para entrar al editor.

---

### 3) Editor — Diseñar una página

El editor tiene dos paneles: **Barra lateral** y **Canvas**.

#### Páginas

- El panel lateral muestra la lista de páginas del proyecto.
- Botón **＋** agrega una nueva página.
- Botón **⧉** duplica la página actual.
- Botón **✕** elimina la página (si hay más de una).
- **Doble clic** en el nombre para renombrarlo.

#### Generar layout por códigos

1. En **"Generar por códigos"** pega una lista:
   ```
   2221, 206x3, 392(2), 115
   ```
   - `2221` → producto 2221, cantidad 1
   - `206x3` → producto 206, cantidad 3 (mostrará badge `x3`)
   - `392(2)` → producto 392, cantidad 2
2. Pulsa **⚡ Generar**.
3. La app busca los códigos en el catálogo y genera el layout en el canvas.

**Heurística de layout:**
- 1 ítem → hero (imagen grande centrada)
- 2 ítems → dos columnas
- 3-4 ítems → grilla 2×N
- 5-6 ítems → grilla 3×N
- 7+ ítems → grilla automática

#### Edición manual en canvas

- **Clic** en un elemento para seleccionarlo (aparece el Transformer).
- **Arrastrar** para mover.
- Agarrar los manejadores del Transformer para **escalar** o **rotar**.
- Panel lateral → **Elemento seleccionado**:
  - **⧉ Duplicar** — copia el elemento.
  - **↑ Traer** / **↓ Enviar** — cambia el orden de capas.
  - **�� Eliminar** — borra el elemento.
  - Para textos: editar contenido, tamaño de fuente y color.
- Tecla **Delete/Backspace** elimina el elemento seleccionado.
- Tecla **Escape** deselecciona.

#### Fondo

Usa el selector de color en **"Fondo"** para cambiar el color de fondo de la página.

#### Textos de oferta

El panel **"Textos de oferta"** permite configurar 4 textos que se superponen en la parte inferior del canvas:

| Campo | Descripción |
|---|---|
| Título | Texto grande en la parte superior del área de texto |
| Precio público | Precio tachado o de referencia |
| Paga solo | Precio de oferta (resaltado en rojo) |
| Oferta hasta | Fecha/condición de vigencia |

Estos textos también son elementos del canvas y pueden moverse y redimensionarse manualmente.

---

### 4) Exportar

- **"Exportar página"** → guarda la página actual como PNG en `<workspace>/exports/`.
- **"Exportar todo"** → exporta la página visible (para exportar todas las páginas, navega a cada una y exporta).

El nombre del archivo incluye el nombre del proyecto, el número de página y un timestamp.

---

## Workspace

La app almacena todos los datos en el directorio de la aplicación del SO:

| OS | Ruta |
|---|---|
| Windows | `%APPDATA%\editor-paquetes\` |
| macOS | `~/Library/Application Support/editor-paquetes/` |
| Linux | `~/.local/share/editor-paquetes/` |

Estructura interna:

```
editor-paquetes/
├── images/          # Imágenes importadas al catálogo
├── exports/         # PNGs exportados
├── templates/       # (reservado para uso futuro)
├── catalog.json     # Registro del catálogo
└── projects.json    # Proyectos y páginas
```

---

## Estructura del código

```
editor-paquetes/
├── src/                      # Frontend React + TypeScript
│   ├── views/
│   │   ├── Catalogo.tsx      # Catálogo: importar, buscar, editar
│   │   ├── Proyectos.tsx     # Proyectos: crear, listar, abrir
│   │   └── Editor.tsx        # Editor: canvas Konva, códigos, exportar
│   ├── types/
│   │   ├── catalog.ts        # Tipos del catálogo
│   │   └── project.ts        # Tipos de proyectos/páginas/elementos
│   ├── components/
│   │   └── Navbar.tsx
│   ├── presets.ts            # Definición de presets de lienzo
│   └── App.tsx
├── src-tauri/                # Backend Rust (Tauri)
│   └── src/
│       └── main.rs           # Comandos: catálogo, proyectos, exportar
└── README.md
```

## Presets de lienzo

| ID | Dimensiones | Uso |
|---|---|---|
| `story` | 1080 × 1920 | Stories de Instagram/FB |
| `whatsapp_4_5` | 1080 × 1350 | WhatsApp vertical (4:5) |
