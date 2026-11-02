#[cfg(windows)]
mod backend {
  use std::net::TcpStream;
  use std::os::windows::process::CommandExt;
  use std::process::{Child, Command};
  use std::sync::Mutex;
  use tauri::Manager;

  const PORT: u16 = 8010;
  const CREATE_NO_WINDOW: u32 = 0x0800_0000;

  #[derive(Default)]
  pub struct Backend(Mutex<Option<Child>>);

  impl Backend {
    pub fn stop(&self) {
      if let Some(mut child) = self.0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  }

  fn plain(path: std::path::PathBuf) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    std::path::PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
  }

  /// Starts the bundled backend unless one is already listening (e.g. a dev backend).
  pub fn start(app: &tauri::AppHandle) {
    if TcpStream::connect(("127.0.0.1", PORT)).is_ok() {
      return;
    }
    let Ok(resources) = app.path().resource_dir() else { return };
    let root = plain(resources).join("backend");
    let python = root.join("python").join("python.exe");
    if !python.exists() {
      return;
    }
    let data = app.path().app_data_dir().map(plain).unwrap_or_else(|_| root.join("data"));
    let _ = std::fs::create_dir_all(&data);
    let path = format!(
      "{};{}",
      root.join("bin").display(),
      std::env::var("PATH").unwrap_or_default()
    );
    let child = Command::new(python)
      .args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", &PORT.to_string()])
      .current_dir(root.join("app_root"))
      .env("CANTO_DATA_DIR", &data)
      .env("PATH", path)
      .env("PYTHONUTF8", "1")
      .creation_flags(CREATE_NO_WINDOW)
      .spawn();
    match child {
      Ok(child) => *app.state::<Backend>().0.lock().unwrap() = Some(child),
      Err(e) => log::error!("could not start the backend: {e}"),
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .runtime(tauri_runtime_wry::Wry::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(windows)]
      {
        use tauri::Manager;
        app.manage(backend::Backend::default());
        if !cfg!(debug_assertions) {
          backend::start(app.handle());
        }
      }
      Ok(())
    });

  let app = builder
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|_handle, event| {
    #[cfg(windows)]
    if let tauri::RunEvent::Exit = event {
      use tauri::Manager;
      _handle.state::<backend::Backend>().stop();
    }
    #[cfg(not(windows))]
    let _ = event;
  });
}
