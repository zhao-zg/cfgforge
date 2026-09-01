#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[cfgeditor] starting...");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    println!("[cfgeditor] built successfully, running...");

    app.run(|_app_handle, event| {
        // 只打印生命周期关键事件，过滤高频窗口事件（鼠标移动/重绘等）
        match &event {
            tauri::RunEvent::Exit => println!("[cfgeditor] event: Exit"),
            tauri::RunEvent::ExitRequested { .. } => println!("[cfgeditor] event: ExitRequested"),
            tauri::RunEvent::Ready => println!("[cfgeditor] event: Ready"),
            tauri::RunEvent::Resumed => println!("[cfgeditor] event: Resumed"),
            _ => {}
        }
    });
}
