import { BrowserWindow } from "electron";
import { execSync } from "child_process";

/**
 * Convert integer to hex string for logging
 */
function hexString(num: number): string {
  return "0x" + num.toString(16).toUpperCase();
}

/**
 * NoFocusMode - Shows the window without changing focus
 * 
 * This is the key to stealth: other apps don't detect focus change events
 * Window is fully interactive (mouse, keyboard work normally)
 * But focus stays with the previously focused window
 * 
 * Key Win32 technique: SW_SHOWNOACTIVATE (4) = show without activating
 */
export class NoFocusMode {
  private mainWindow: BrowserWindow;
  private hwnd: Buffer | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  public async initialize() {
    try {
      // Get native window handle for Win32 calls
      this.hwnd = this.mainWindow.getNativeWindowHandle();
      console.log("[NoFocusMode] Initialized - ready to show without focus");
    } catch (error) {
      console.warn("[NoFocusMode] Could not get window handle:", error);
    }
  }

  /**
   * Show window WITHOUT changing focus - Multi-layered Win32 approach
   * User can still click and type in the window
   * But other apps don't detect any focus change
   */
  public show() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("[NoFocusMode] Window not available");
      return;
    }

    console.log("[NoFocusMode] Showing window with multi-layered focus suppression...");

    try {
      // STEP 1: CRITICAL - Show with Electron FIRST (before any Win32 calls)
      console.log("[NoFocusMode] Step 1: Electron show()");
      this.mainWindow.show();

      // STEP 2: Make window interactive
      console.log("[NoFocusMode] Step 2: Enable mouse/keyboard interaction");
      this.mainWindow.setIgnoreMouseEvents(false);
      this.mainWindow.setFocusable(true);

      // STEP 3: Multi-layered Win32 focus suppression (for Windows only)
      if (this.hwnd && process.platform === "win32") {
        console.log("[NoFocusMode] Step 3: Applying multi-layered Win32 focus suppression");
        
        try {
          const hwndInt = this.hwnd.readUInt32LE(0);
          console.log("[NoFocusMode] Window HWND:", hexString(hwndInt));
          
          // Use a more robust approach: directly invoke with node's built-in capabilities
          // instead of relying on PowerShell output parsing
          
          // Try direct Win32 call via edge case: use child_process with proper error handling
          const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
$h = [IntPtr] 0x${hwndInt.toString(16)}
$r1 = [WinAPI]::ShowWindow($h, 4)
$r2 = [WinAPI]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0013)
"$r1,$r2"
`;

          console.log("[NoFocusMode] Executing Win32 via PowerShell...");
          let result = "";
          try {
            result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
              encoding: 'utf-8',
              timeout: 3000,
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true
            });
          } catch (psError: any) {
            console.error("[NoFocusMode] PowerShell execution error:", psError.message);
            console.error("[NoFocusMode] Trying fallback approach...");
            throw psError;
          }

          const results = result.trim().split(',');
          const showResult = results[0];
          const posResult = results[1];
          
          console.log("[NoFocusMode] ShowWindow result:", showResult);
          console.log("[NoFocusMode] SetWindowPos result:", posResult);
          
          if (showResult === '1' && posResult === '1') {
            console.log("[NoFocusMode] ✓ Win32 focus suppression SUCCESSFUL");
          } else {
            console.warn("[NoFocusMode] ⚠ Win32 calls may have failed (results not 1)");
          }
        } catch (winError: any) {
          console.error("[NoFocusMode] ✗ Win32 approach failed");
          console.error("[NoFocusMode] Error details:", winError.message || winError);
          console.warn("[NoFocusMode] Window is visible but focus suppression may not have worked");
        }
      } else {
        if (!this.hwnd) {
          console.log("[NoFocusMode] ⚠ hwnd not available");
        }
        if (process.platform !== "win32") {
          console.log("[NoFocusMode] ⚠ Not Windows platform - skipping Win32");
        }
      }

    } catch (error) {
      console.error("[NoFocusMode] ✗ Unexpected error:", error);
      try {
        this.mainWindow.show();
        console.log("[NoFocusMode] Failsafe: Window shown via fallback");
      } catch (e) {
        console.error("[NoFocusMode] Failsafe also failed:", e);
      }
    }
  }

  /**
   * Hide window normally
   */
  public hide() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    try {
      this.mainWindow.hide();
      console.log("[NoFocusMode] Window hidden");
    } catch (error) {
      console.error("[NoFocusMode] Error hiding window:", error);
    }
  }

  /**
   * Toggle visibility using no-focus mode
   */
  public toggle() {
    console.log("[NoFocusMode] Toggle called");
    
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("[NoFocusMode] Window not available for toggle");
      return;
    }

    const isVisible = this.mainWindow.isVisible();
    console.log("[NoFocusMode] Window visible state:", isVisible);

    if (isVisible) {
      console.log("[NoFocusMode] Window visible, hiding it");
      this.hide();
    } else {
      console.log("[NoFocusMode] Window hidden, showing it");
      this.show();
    }
  }
}
