// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::api::path::app_data_dir;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Catalog types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogItem {
    id: String,
    code: String,
    name: String,
    category: String,
    original_filename: String,
    stored_filename: String,
    /// Relative path inside workspace, e.g. "images/foo.png"
    stored_relative_path: String,
    created_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the workspace path and ensures subdirectories exist.
#[tauri::command]
fn get_workspace_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let config = app_handle.config();
    let base = app_data_dir(&config)
        .ok_or_else(|| "No se pudo obtener el directorio de datos de la app".to_string())?;

    let workspace = base.join("editor-paquetes");

    // Create subdirectories
    for sub in &["images", "exports", "templates"] {
        let dir = workspace.join(sub);
        fs::create_dir_all(&dir).map_err(|e| format!("Error creando directorio {}: {}", sub, e))?;
    }

    Ok(workspace.to_string_lossy().to_string())
}

fn catalog_path_for(workspace: &PathBuf) -> PathBuf {
    workspace.join("catalog.json")
}

fn read_catalog(catalog_path: &PathBuf) -> Vec<CatalogItem> {
    if !catalog_path.exists() {
        return Vec::new();
    }
    fs::read_to_string(catalog_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_catalog(catalog_path: &PathBuf, items: &[CatalogItem]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(items)
        .map_err(|e| format!("Error serializando catálogo: {}", e))?;
    fs::write(catalog_path, json)
        .map_err(|e| format!("Error escribiendo catalog.json: {}", e))
}

/// Sanitize a filename: keep only the last component, reject path traversal.
fn sanitize_filename(path_str: &str) -> Option<String> {
    let p = PathBuf::from(path_str);
    // Reject any parent-directory components (handles "..", URL-encoded variants, etc.)
    for component in p.components() {
        if component == std::path::Component::ParentDir {
            return None;
        }
    }
    p.file_name().map(|n| n.to_string_lossy().to_string())
}

/// Extract (stem, lowercase_extension) from a filename string.
fn stem_and_ext(filename: &str) -> (String, String) {
    let p = PathBuf::from(filename);
    let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
        .to_string();
    (stem, ext)
}

/// Parse `CODIGO+NOMBRE.ext` → `(code, name)`.
/// Falls back to `("pendiente", stem)` when no `+` is found.
fn parse_filename(filename: &str) -> (String, String) {
    let (stem, _) = stem_and_ext(filename);

    if let Some(plus_pos) = stem.find('+') {
        let code = stem[..plus_pos].trim().to_string();
        let raw_name = stem[plus_pos + 1..].trim().to_string();
        let name = raw_name
            .replace('_', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        (code, name)
    } else {
        // No '+' – normalize and mark code as "pendiente"
        let name = stem
            .replace('_', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        ("pendiente".to_string(), name)
    }
}

// ---------------------------------------------------------------------------
// Catalog commands
// ---------------------------------------------------------------------------

/// Import images into the workspace, parse metadata, update catalog.json.
#[tauri::command]
fn import_images(
    app_handle: tauri::AppHandle,
    file_paths: Vec<String>,
    category: String,
) -> Result<Vec<CatalogItem>, String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let workspace = PathBuf::from(&workspace_str);
    let images_dir = workspace.join("images");
    let catalog_path = catalog_path_for(&workspace);

    let mut catalog = read_catalog(&catalog_path);
    let mut new_items: Vec<CatalogItem> = Vec::new();

    for file_path in &file_paths {
        let src_path = PathBuf::from(file_path);

        // Sanitize original filename (no path traversal)
        let original_filename = sanitize_filename(file_path)
            .ok_or_else(|| format!("Nombre de archivo inválido o path traversal: {}", file_path))?;

        // Only allow png/jpg/jpeg extensions
        let (stem, ext_lower) = stem_and_ext(&original_filename);
        if !["png", "jpg", "jpeg"].contains(&ext_lower.as_str()) {
            return Err(format!(
                "Extensión no permitida '{}' en: {}",
                ext_lower, original_filename
            ));
        }

        // Avoid filename collisions in images/ (max 1000 attempts)
        const MAX_COLLISION_ATTEMPTS: u32 = 1000;
        let stored_filename = {
            let mut candidate = original_filename.clone();
            let mut counter = 1u32;
            loop {
                if !images_dir.join(&candidate).exists() {
                    break candidate;
                }
                if counter > MAX_COLLISION_ATTEMPTS {
                    return Err(format!(
                        "No se pudo encontrar un nombre único para '{}' después de {} intentos",
                        original_filename, MAX_COLLISION_ATTEMPTS
                    ));
                }
                candidate = format!("{}_{}.{}", stem, counter, ext_lower);
                counter += 1;
            }
        };

        // Copy file to workspace/images/
        let dest_path = images_dir.join(&stored_filename);
        fs::copy(&src_path, &dest_path)
            .map_err(|e| format!("Error copiando '{}': {}", original_filename, e))?;

        // Parse code + name from original filename
        let (code, name) = parse_filename(&original_filename);

        let item = CatalogItem {
            id: Uuid::new_v4().to_string(),
            code,
            name,
            category: category.clone(),
            original_filename: original_filename.clone(),
            stored_filename: stored_filename.clone(),
            stored_relative_path: format!("images/{}", stored_filename),
            created_at: Utc::now().to_rfc3339(),
        };

        catalog.push(item.clone());
        new_items.push(item);
    }

    write_catalog(&catalog_path, &catalog)?;
    Ok(new_items)
}

/// Return all catalog items.
#[tauri::command]
fn list_catalog(app_handle: tauri::AppHandle) -> Result<Vec<CatalogItem>, String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let catalog_path = catalog_path_for(&PathBuf::from(&workspace_str));
    Ok(read_catalog(&catalog_path))
}

/// Update editable fields (code, name, category) of an existing item.
#[tauri::command]
fn update_catalog_item(
    app_handle: tauri::AppHandle,
    item: CatalogItem,
) -> Result<(), String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let catalog_path = catalog_path_for(&PathBuf::from(&workspace_str));

    let mut catalog = read_catalog(&catalog_path);
    let target = catalog
        .iter_mut()
        .find(|i| i.id == item.id)
        .ok_or_else(|| format!("Item no encontrado: {}", item.id))?;

    target.code = item.code;
    target.name = item.name;
    target.category = item.category;

    write_catalog(&catalog_path, &catalog)
}

/// Remove an item from the catalog (does NOT delete the image file).
#[tauri::command]
fn delete_catalog_item(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let catalog_path = catalog_path_for(&PathBuf::from(&workspace_str));

    let mut catalog = read_catalog(&catalog_path);
    let original_len = catalog.len();
    catalog.retain(|i| i.id != id);

    if catalog.len() == original_len {
        return Err(format!("Item no encontrado: {}", id));
    }

    write_catalog(&catalog_path, &catalog)
}

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct OfferTexts {
    title: String,
    public_price: String,
    pay_only: String,
    offer_until: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Page {
    page_id: String,
    name: String,
    preset: String,
    elements: serde_json::Value,
    offer_texts: OfferTexts,
    background: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Project {
    project_id: String,
    name: String,
    created_at: String,
    updated_at: String,
    default_preset: String,
    pages: Vec<Page>,
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

fn projects_path(workspace: &PathBuf) -> PathBuf {
    workspace.join("projects.json")
}

fn read_projects(workspace: &PathBuf) -> Vec<Project> {
    let path = projects_path(workspace);
    if !path.exists() {
        return Vec::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_projects(workspace: &PathBuf, projects: &[Project]) -> Result<(), String> {
    let path = projects_path(workspace);
    let json = serde_json::to_string_pretty(projects)
        .map_err(|e| format!("Error serializando proyectos: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Error escribiendo projects.json: {}", e))
}

/// Validate that a relative path is safe to use within the workspace:
/// - Rejects `..` (parent directory traversal).
/// - Rejects absolute paths and drive-letter prefixes (Windows).
/// - Only allows normal path components and the current-directory dot.
/// This prevents callers from escaping the workspace directory.
fn validate_relative_path(relative_path: &str) -> Result<(), String> {
    let p = PathBuf::from(relative_path);
    for component in p.components() {
        match component {
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => {
                return Err(format!(
                    "Ruta inválida (path traversal): {}",
                    relative_path
                ));
            }
            _ => {}
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Project commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_projects(app_handle: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let workspace = PathBuf::from(&workspace_str);
    Ok(read_projects(&workspace))
}

#[tauri::command]
fn save_project(app_handle: tauri::AppHandle, project: Project) -> Result<(), String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let workspace = PathBuf::from(&workspace_str);
    let mut projects = read_projects(&workspace);
    if let Some(pos) = projects
        .iter()
        .position(|p| p.project_id == project.project_id)
    {
        projects[pos] = project;
    } else {
        projects.push(project);
    }
    write_projects(&workspace, &projects)
}

#[tauri::command]
fn delete_project(app_handle: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let workspace_str = get_workspace_path(app_handle)?;
    let workspace = PathBuf::from(&workspace_str);
    let mut projects = read_projects(&workspace);
    let original_len = projects.len();
    projects.retain(|p| p.project_id != project_id);
    if projects.len() == original_len {
        return Err(format!("Proyecto no encontrado: {}", project_id));
    }
    write_projects(&workspace, &projects)
}

/// Read an image from the workspace by relative path and return a base64 data URL.
#[tauri::command]
fn read_image_data_url(
    app_handle: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    validate_relative_path(&relative_path)?;
    let workspace_str = get_workspace_path(app_handle)?;
    let workspace = PathBuf::from(&workspace_str);
    let full_path = workspace.join(&relative_path);

    let bytes =
        fs::read(&full_path).map_err(|e| format!("Error leyendo imagen '{}': {}", relative_path, e))?;

    let ext = full_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        _ => "image/png",
    };

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ---------------------------------------------------------------------------
// Export command (unchanged)
// ---------------------------------------------------------------------------

/// Saves a base64-encoded PNG data URL to the exports directory.
#[tauri::command]
fn save_export(
    app_handle: tauri::AppHandle,
    data_url: String,
    filename: String,
) -> Result<String, String> {
    // Get workspace path
    let workspace_str = get_workspace_path(app_handle)?;
    let exports_dir = PathBuf::from(&workspace_str).join("exports");

    // Sanitize filename (no path traversal)
    let safe_name = PathBuf::from(&filename)
        .file_name()
        .ok_or_else(|| "Nombre de archivo inválido".to_string())?
        .to_string_lossy()
        .to_string();

    let out_path = exports_dir.join(&safe_name);

    // Strip the "data:image/png;base64," prefix
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .or_else(|| data_url.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(&data_url);

    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Error decodificando base64: {}", e))?;

    fs::write(&out_path, &bytes).map_err(|e| format!("Error escribiendo archivo: {}", e))?;

    Ok(out_path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_workspace_path,
            save_export,
            import_images,
            list_catalog,
            update_catalog_item,
            delete_catalog_item,
            list_projects,
            save_project,
            delete_project,
            read_image_data_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
