// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::api::path::app_data_dir;
use base64::{engine::general_purpose, Engine as _};

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
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Error creando directorio {}: {}", sub, e))?;
    }

    Ok(workspace.to_string_lossy().to_string())
}

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

    fs::write(&out_path, &bytes)
        .map_err(|e| format!("Error escribiendo archivo: {}", e))?;

    Ok(out_path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_workspace_path, save_export])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
