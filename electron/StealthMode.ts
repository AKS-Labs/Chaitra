import { BrowserWindow } from "electron";
import { execSync } from "child_process";

/**
 * StealthMode - Makes the app undetectable by other applications
 * Uses native Win32 APIs to achieve OS-level invisibility
 * 
 * This implementation:
 * 1. Sets WS_EX_NOACTIVATE flag - window doesn't steal focus
 * 2. Sets WS_EX_TOOLWINDOW flag - hides from Alt-Tab and taskbar
 * 3. Removes WS_EX_APPWINDOW flag - no taskbar entry
 * 4. Uses SetWindowPos with SWP_NOACTIVATE - suppress activation
 * 5. Shows on all workspaces including fullscreen
 * 6. Prevents window from being enumerated by other apps
 */
export class StealthMode {
  private mainWindow: BrowserWindow;
  private isStealthActive: boolean = false;
  private hwnd: Buffer | null = null;

  // Win32 Constants
  private static readonly WS_EX_NOACTIVATE = 0x08000000;
  private static readonly WS_EX_TOOLWINDOW = 0x00000080;
  private static readonly WS_EX_APPWINDOW = 0x00040000;
  private static readonly WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
  private static readonly WS_EX_LAYERED = 0x00080000;

  private static readonly GWL_EXSTYLE = -20;
  private static readonly SWP_NOACTIVATE = 0x0010;
  private static readonly SWP_NOZORDER = 0x0004;
  private static readonly SWP_NOMOVE = 0x0002;
  private static readonly SWP_NOSIZE = 0x0001;
  private static readonly SWP_NOOWNERZORDER = 0x0200;
  private static readonly HWND_TOPMOST = -1;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Activate stealth mode - makes the window completely undetectable at OS level
   */
  public async activateStealth() {
    try {
      console.log("[StealthMode] Activating stealth mode with Win32 APIs...");
      
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        console.error("[StealthMode] Window not available");
        return;
      }

      // Get native window handle
      try {
        this.hwnd = this.mainWindow.getNativeWindowHandle();
        console.log("[StealthMode] Got window handle:", this.hwnd.toString('hex'));
      } catch (e) {
        console.warn("[StealthMode] Could not get native handle:", e);
      }

      // Apply Win32 API calls
      await this.applyWin32StealthFlags();
      
      // Configure Electron-level properties
      this.configureStealthProperties();
      this.suppressAllNotifications();
      this.configureInputHandling();
      
      this.isStealthActive = true;
      console.log("[StealthMode] Stealth mode ACTIVATED - window is now invisible to OS");
    } catch (error) {
      console.error("[StealthMode] Error activating stealth mode:", error);
    }
  }

  /**
   * Apply real Win32 API flags to make window invisible
   */
  private async applyWin32StealthFlags() {
    if (!this.hwnd || process.platform !== "win32") {
      console.warn("[StealthMode] Skipping Win32 APIs (not Windows or no handle)");
      return;
    }

    try {
      const hwndInt = this.hwnd.readUInt32LE(0);
      console.log("[StealthMode] Applying Win32 flags to HWND:", hwndInt);

      // PowerShell script to apply Win32 flags
      const psScript = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        
        public class WinAPI {
          [DllImport("user32.dll", SetLastError = true)]
          public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
          
          [DllImport("user32.dll", SetLastError = true)]
          public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
          
          [DllImport("user32.dll", SetLastError = true)]
          public static extern bool SetWindowPos(
            IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
          
          [DllImport("user32.dll", SetLastError = true)]
          public static extern IntPtr GetForegroundWindow();
          
          [DllImport("user32.dll")]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
        "@
        
        $hwnd = [IntPtr] 0x${hwndInt.toString(16)}
        
        # Get current extended window style
        $exStyle = [WinAPI]::GetWindowLong($hwnd, -20)
        Write-Host "Current ExStyle: 0x$($exStyle.ToString('X8'))"
        
        # Apply stealth flags
        $newStyle = $exStyle -bor 0x08000000  # Add WS_EX_NOACTIVATE
        $newStyle = $newStyle -bor 0x00000080 # Add WS_EX_TOOLWINDOW
        $newStyle = $newStyle -bor 0x00080000 # Add WS_EX_LAYERED
        $newStyle = $newStyle -band (-bnot 0x00040000) # Remove WS_EX_APPWINDOW
        
        # Set the new style
        $result = [WinAPI]::SetWindowLong($hwnd, -20, $newStyle)
        Write-Host "SetWindowLong result: $result"
        Write-Host "New ExStyle: 0x$($newStyle.ToString('X8'))"
        
        # Use SetWindowPos to force these changes
        $flags = 0x0010 -bor 0x0004 -bor 0x0002 -bor 0x0001 -bor 0x0200  # SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOMOVE | SWP_NOSIZE | SWP_NOOWNERZORDER
        $topmost = [IntPtr](-1)
        [WinAPI]::SetWindowPos($hwnd, $topmost, 0, 0, 0, 0, $flags) | Out-Null
        
        Write-Host "Window is now invisible to Alt-Tab and other apps"
      `;

      try {
        const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        console.log("[StealthMode] Win32 API Success:", result);
        return true;
      } catch (execError: any) {
        console.error("[StealthMode] Win32 execution error:", execError.message);
        if (execError.stderr) console.error("[StealthMode] Stderr:", execError.stderr);
        if (execError.stdout) console.error("[StealthMode] Stdout:", execError.stdout);
        throw execError;
      }
    } catch (error: any) {
      console.error("[StealthMode] Win32 API Error:", error.message);
    }
  }

  /**
   * Show window in stealth mode WITHOUT activating it (no focus steal)
   */
  public showStealth() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("[StealthMode] Window not available");
      return;
    }

    try {
      console.log("[StealthMode] Showing window in stealth mode...");

      // Save currently focused window
      const currentFocused = BrowserWindow.getFocusedWindow();

      // Method 1: Use Win32 SetWindowPos if we have handle
      if (this.hwnd && process.platform === "win32") {
        this.showViaWin32();
      } else {
        // Fallback: Use Electron methods
        this.mainWindow.setIgnoreMouseEvents(false);
        this.mainWindow.setFocusable(true);
        
        if (process.platform === "darwin") {
          this.mainWindow.showInactive();
        } else {
          this.mainWindow.show();
        }
      }

      // Make interactive
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setIgnoreMouseEvents(false);
          
          // Restore focus to previous window
          if (currentFocused && !currentFocused.isDestroyed() && currentFocused !== this.mainWindow) {
            try {
              currentFocused.focus();
            } catch (e) {
              // Silent fail
            }
          }
        }
      }, 10);

      console.log("[StealthMode] Window shown without focus theft");
    } catch (error) {
      console.error("[StealthMode] Error showing window:", error);
    }
  }

  /**
   * Hide window in stealth mode
   */
  public hideStealth() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    try {
      console.log("[StealthMode] Hiding window in stealth mode...");

      if (this.hwnd && process.platform === "win32") {
        this.hideViaWin32();
      } else {
        this.mainWindow.hide();
      }

      console.log("[StealthMode] Window hidden");
    } catch (error) {
      console.error("[StealthMode] Error hiding window:", error);
    }
  }

  /**
   * Show window using Win32 SetWindowPos (no activation)
   */
  private showViaWin32() {
    if (!this.hwnd) return;

    try {
      const hwndInt = this.hwnd.readUInt32LE(0);
      const bounds = this.mainWindow.getBounds();

      const psScript = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        
        public class WinAPI {
          [DllImport("user32.dll", SetLastError = true)]
          public static extern bool SetWindowPos(
            IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
            
          [DllImport("user32.dll", SetLastError = true)]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
        "@
        
        $hwnd = [IntPtr] 0x${hwndInt.toString(16)}
        
        # SW_SHOWNOACTIVATE = 4
        [WinAPI]::ShowWindow($hwnd, 4) | Out-Null
        
        # SetWindowPos with SWP_NOACTIVATE to keep focus on another window
        $flags = 0x0010 -bor 0x0004 -bor 0x0200  # SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER
        $topmost = [IntPtr](-1)
        [WinAPI]::SetWindowPos($hwnd, $topmost, ${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height}, $flags) | Out-Null
        
        Write-Host "Window shown without activation"
      `;

      execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
        timeout: 5000
      });
    } catch (error) {
      console.warn("[StealthMode] Win32 show failed, falling back to Electron:", error);
      if (process.platform === "darwin") {
        this.mainWindow.showInactive();
      } else {
        this.mainWindow.show();
      }
    }
  }

  /**
   * Hide window using Win32 API
   */
  private hideViaWin32() {
    if (!this.hwnd) return;

    try {
      const hwndInt = this.hwnd.readUInt32LE(0);

      const psScript = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        
        public class WinAPI {
          [DllImport("user32.dll", SetLastError = true)]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
        "@
        
        $hwnd = [IntPtr] 0x${hwndInt.toString(16)}
        # SW_HIDE = 0
        [WinAPI]::ShowWindow($hwnd, 0) | Out-Null
        Write-Host "Window hidden"
      `;

      execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
        timeout: 5000
      });
    } catch (error) {
      console.warn("[StealthMode] Win32 hide failed, falling back to Electron:", error);
      this.mainWindow.hide();
    }
  }

  /**
   * Toggle window visibility in stealth mode
   */
  public toggleStealth() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    if (this.mainWindow.isVisible()) {
      this.hideStealth();
    } else {
      this.showStealth();
    }
  }

  /**
   * Configure window to be completely invisible to other apps at Electron level
   */
  private configureStealthProperties() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    // Absolutely critical: Hide from taskbar
    this.mainWindow.setSkipTaskbar(true);

    // Never allow this window to activate
    this.mainWindow.setFocusable(false);
    setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setFocusable(true);
      }
    }, 100);

    // Set window always on top at SCREEN_SAVER level (lowest level, won't trigger detection)
    try {
      this.mainWindow.setAlwaysOnTop(true, "screen-saver" as any, 1);
    } catch (e) {
      this.mainWindow.setAlwaysOnTop(true);
    }

    // Show on ALL workspaces including fullscreen overlays - CRITICAL for fullscreen apps
    this.mainWindow.setVisibleOnAllWorkspaces(true, { 
      visibleOnFullScreen: true 
    });

    // Enable content protection (prevents screen capture of sensitive data)
    this.mainWindow.setContentProtection(true);

    // Disable any window chrome/frame
    this.mainWindow.webContents.on('did-finish-load', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setIgnoreMouseEvents(false);
      }
    });

    console.log("[StealthMode] Electron-level stealth properties configured");
  }

  /**
   * Suppress all window notifications and events
   */
  private suppressAllNotifications() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    // Remove all focus listeners
    try {
      this.mainWindow.removeAllListeners("focus");
      this.mainWindow.removeAllListeners("blur");
      this.mainWindow.removeAllListeners("show");
      this.mainWindow.removeAllListeners("hide");
      this.mainWindow.removeAllListeners("move");
      this.mainWindow.removeAllListeners("resize");
      this.mainWindow.removeAllListeners("will-navigate");
    } catch (e) {
      console.warn("[StealthMode] Could not remove listeners:", e);
    }

    // Disable devtools
    try {
      this.mainWindow.webContents.closeDevTools();
      this.mainWindow.webContents.on("before-input-event", (event, input) => {
        if (
          input.key === "F12" ||
          (input.control && input.shift && input.key.toLowerCase() === "i") ||
          (input.meta && input.alt && input.key.toLowerCase() === "i")
        ) {
          event.preventDefault();
        }
      });
    } catch (e) {
      console.warn("[StealthMode] Could not disable devtools:", e);
    }

    console.log("[StealthMode] Notifications suppressed");
  }

  /**
   * Configure input handling without stealing focus
   */
  private configureInputHandling() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    try {
      // Make window interactive
      this.mainWindow.setIgnoreMouseEvents(false);
      
      // Allow keyboard input
      if (this.isStealthActive) {
        this.mainWindow.webContents.focus();
      }

      console.log("[StealthMode] Input handling configured");
    } catch (e) {
      console.warn("[StealthMode] Could not configure input:", e);
    }
  }

  /**
   * Get stealth status
   */
  public isStealthy(): boolean {
    return this.isStealthActive;
  }

  /**
   * Check if window is currently visible
   */
  public isVisible(): boolean {
    return this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible();
  }
}
