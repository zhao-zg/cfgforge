use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::net::TcpStream;
use std::time::Duration;
use serde::Serialize;
use std::path::PathBuf;
use std::fs;
use std::io::Read;
use tauri::Manager;

// --- 后端进程生命周期管理 ---

struct BackendState {
    child: Option<Child>,
    port: u16,
}

impl Default for BackendState {
    fn default() -> Self {
        Self { child: None, port: 3456 }
    }
}

#[derive(Serialize)]
struct BackendStatus {
    running: bool,
    port: u16,
    url: String,
}

/// 在 resource_dir 下查找文件，兼容 Tauri v2 不同打包模式下资源可能在 `resources/` 子目录或根目录
fn resolve_resource(resource_dir: &PathBuf, relative: &str) -> Result<PathBuf, String> {
    // 先尝试 resource_dir/relative（Tauri 可能直接展开）
    let p1 = resource_dir.join(relative);
    if p1.exists() {
        return Ok(p1);
    }
    // 再尝试 resource_dir/resources/relative（Tauri 可能保留子目录结构）
    let p2 = resource_dir.join("resources").join(relative);
    if p2.exists() {
        return Ok(p2);
    }
    Err(format!("Resource not found: {} (tried {} and {})", relative, p1.display(), p2.display()))
}

/// 轮询 TCP 端口直到连通或超时
fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed().as_millis() < timeout_ms as u128 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// 启动内置 Java 后端，返回服务器 URL（如 "127.0.0.1:3456"）
#[tauri::command]
fn start_local_backend(
    datadir: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<BackendState>>,
) -> Result<String, String> {
    let mut backend = state.lock().unwrap();

    // 已在运行，直接返回
    if backend.child.is_some() {
        return Ok(format!("127.0.0.1:{}", backend.port));
    }

    // 定位 resource 目录下的 cfggen.jar 和 jre
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot find resource dir: {}", e))?;

    let jar_path = resolve_resource(&resource_dir, "cfggen.jar")?;
    let jre_dir = resolve_resource(&resource_dir, "jre")?;

    let java_exe = if cfg!(windows) {
        jre_dir.join("bin").join("java.exe")
    } else {
        jre_dir.join("bin").join("java")
    };

    if !java_exe.exists() {
        return Err(format!(
            "Java executable not found at: {}",
            java_exe.display()
        ));
    }

    let port = 3456;

    // 写启动日志到临时文件，便于排查后端启动失败
    let log_path = std::env::temp_dir().join("cfgeditor-backend.log");
    let log_msg = format!(
        "=== cfgeditor backend start ===\nresource_dir: {}\njar_path: {}\njre_dir: {}\njava_exe: {}\ndatadir: {}\nport: {}\n",
        resource_dir.display(), jar_path.display(), jre_dir.display(), java_exe.display(), datadir, port
    );
    let _ = fs::write(&log_path, &log_msg);

    let mut cmd = Command::new(&java_exe);
    cmd.arg("--sun-misc-unsafe-memory-access=allow")
        .arg("-jar")
        .arg(&jar_path)
        .arg("-datadir")
        .arg(&datadir)
        .arg("-gen")
        .arg("server")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 下隐藏控制台窗口
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Java backend: {}", e))?;

    // 取出 stdout/stderr handle 以便后续读取日志
    let mut stdout_handle = child.stdout.take();
    let mut stderr_handle = child.stderr.take();

    // 在后台线程读取 Java stdout/stderr 并追加到日志文件
    let log_path2 = log_path.clone();
    std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(ref mut h) = stdout_handle {
            let _ = h.read_to_string(&mut buf);
        }
        let mut buf2 = String::new();
        if let Some(ref mut h) = stderr_handle {
            let _ = h.read_to_string(&mut buf2);
        }
        let _ = fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(&log_path2)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(format!("\n--- stdout ---\n{}\n--- stderr ---\n{}\n", buf, buf2).as_bytes())
            });
    });

    backend.child = Some(child);
    backend.port = port;

    drop(backend); // 释放锁后再轮询

    // 等待服务器端口就绪（最多 30 秒）
    if !wait_for_port(port, 30000) {
        let mut backend = state.lock().unwrap();
        if let Some(mut child) = backend.child.take() {
            let _ = child.kill();
        }
        let log_info = match fs::read_to_string(&log_path) {
            Ok(content) => format!(" (check log at {}: {})", log_path.display(), content),
            Err(_) => format!(" (log at {})", log_path.display()),
        };
        return Err(format!("Backend failed to start within 30 seconds{}", log_info));
    }

    let _ = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(b"\n=== Backend started successfully ===\n")
        });

    Ok(format!("127.0.0.1:{}", port))
}

/// 停止内置 Java 后端
#[tauri::command]
fn stop_local_backend(state: tauri::State<'_, Mutex<BackendState>>) -> Result<(), String> {
    let mut backend = state.lock().unwrap();
    if let Some(mut child) = backend.child.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill backend: {}", e))?;
        let _ = child.wait();
    }
    Ok(())
}

/// 查询后端运行状态
#[tauri::command]
fn get_backend_status(state: tauri::State<'_, Mutex<BackendState>>) -> BackendStatus {
    let backend = state.lock().unwrap();
    BackendStatus {
        running: backend.child.is_some(),
        port: backend.port,
        url: format!("127.0.0.1:{}", backend.port),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(BackendState::default()))
        .invoke_handler(tauri::generate_handler![
            start_local_backend,
            stop_local_backend,
            get_backend_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // 应用退出时杀掉内置后端进程
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<Mutex<BackendState>>();
            let mut backend = state.lock().unwrap();
            if let Some(mut child) = backend.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
