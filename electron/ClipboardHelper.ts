import { clipboard, BrowserWindow } from "electron";
import { getStoreValue, setStoreValue } from "./main";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ClipboardItem {
  id: string;
  text: string;
  pinned: boolean;
  timestamp: number;
}

type TypingState = "IDLE" | "WAITING_FOR_CLICK" | "TYPING" | "PAUSED";

export class ClipboardHelper {
  private getMainWindow: () => BrowserWindow | null;
  private monitorIntervalId: NodeJS.Timeout | null = null;
  private lastText: string = "";

  // Stateful typing – single PS process approach
  private typingState: TypingState = "IDLE";
  private sessionId: string = "";
  private psProcess: ChildProcess | null = null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  // ─── Clipboard Monitoring ─────────────────────────────────────────────────

  public startMonitoring() {
    this.lastText = clipboard.readText() || "";
    this.monitorIntervalId = setInterval(async () => {
      const currentText = clipboard.readText();
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText;
        await this.addTextToHistory(currentText);
      }
    }, 500);
  }

  public stopMonitoring() {
    if (this.monitorIntervalId) {
      clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }
    this.stopTyping();
  }

  private async addTextToHistory(text: string) {
    try {
      const history: ClipboardItem[] = (await getStoreValue("clipboard-history")) || [];
      if (history.some((item) => item.text === text && !item.pinned)) return;
      const newItem: ClipboardItem = {
        id: `clip-${Date.now()}`,
        text,
        pinned: false,
        timestamp: Date.now(),
      };
      const updatedHistory = [newItem, ...history].slice(0, 100);
      await setStoreValue("clipboard-history", updatedHistory);
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clipboard-update", updatedHistory);
      }
    } catch (e) {
      console.error("[ClipboardHelper] Error updating clipboard history:", e);
    }
  }

  // ─── Stateful Typing API ──────────────────────────────────────────────────

  public getTypingState(): TypingState {
    return this.typingState;
  }

  /**
   * Called by Alt+V or the Type button.
   * Hides the window, waits for user to click in any input field, then types.
   */
  public async startTyping(text?: string): Promise<void> {
    // Kill any active session first
    this._killActiveSession();

    const textToType = text !== undefined ? text : (clipboard.readText() ?? "");
    if (!textToType) {
      console.warn("[ClipboardHelper] startTyping: nothing to type");
      return;
    }

    this.sessionId = Date.now().toString();
    this.typingState = "WAITING_FOR_CLICK";

    // --- Prevent shortcut keys leaking into overlay ---
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      // Blur any focused input so Alt+V keypress doesn't land in the text box
      win.webContents.executeJavaScript("document.activeElement?.blur()").catch(() => {});
      // Small delay so the blur executes before hide
      await new Promise((r) => setTimeout(r, 50));
      win.hide();
    }

    const sid = this.sessionId;
    const pauseFile = path.join(os.tmpdir(), `chaitra_pause_${sid}`);
    const stopFile  = path.join(os.tmpdir(), `chaitra_stop_${sid}`);
    const scriptFile = path.join(os.tmpdir(), `chaitra_type_${sid}.ps1`);

    // Clean up any stale control files from a previous session
    [pauseFile, stopFile].forEach((f) => { try { fs.unlinkSync(f); } catch {} });

    const b64 = Buffer.from(textToType, "utf8").toString("base64");

    // Single PowerShell script that:
    //  1. Waits for Alt/modifier keys to be released (so Alt+V doesn't type "v")
    //  2. Waits for the user to click somewhere (LMB)
    //  3. Types all characters sequentially, polling pause/stop control files
    const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32Util {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
  }
"@

# 1. Wait until modifier keys (Alt=0x12, Ctrl=0x11) are released
while (([Win32Util]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 30 }
while (([Win32Util]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 30 }

# 2. Wait until mouse button is released (covers edge case where Alt+V held)
while (([Win32Util]::GetAsyncKeyState(1) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 30 }

# 3. Wait for fresh left-click
while (([Win32Util]::GetAsyncKeyState(1) -band 0x8000) -eq 0) { Start-Sleep -Milliseconds 30 }

Start-Sleep -Milliseconds 200

# 4. Type the text sequentially – check pause/stop files between every char
$pauseFile = '${pauseFile.replace(/\\/g, "\\\\")}'
$stopFile  = '${stopFile.replace(/\\/g, "\\\\")}'
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))
$wshell = New-Object -ComObject WScript.Shell

foreach ($c in $text.ToCharArray()) {
    if (Test-Path $stopFile) { break }
    # Busy-wait while paused (Poll every 100 ms)
    while ((Test-Path $pauseFile) -and -not (Test-Path $stopFile)) {
        Start-Sleep -Milliseconds 100
    }
    if (Test-Path $stopFile) { break }

    $s = $c.ToString()
    if ('+^%~(){}[]'.Contains($s)) { $s = "{$s}" }
    $wshell.SendKeys($s)
    Start-Sleep -Milliseconds 25
}
`;

    fs.writeFileSync(scriptFile, psScript, "utf8");

    const ps = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptFile,
    ]);

    this.psProcess = ps;

    ps.on("close", () => {
      // Cleanup temp files
      [scriptFile, pauseFile, stopFile].forEach((f) => { try { fs.unlinkSync(f); } catch {} });
      if (this.sessionId === sid) {
        this.typingState = "IDLE";
        this.psProcess = null;
        console.log("[ClipboardHelper] Typing session ended.");
      }
    });

    ps.on("error", (err: any) => {
      [scriptFile, pauseFile, stopFile].forEach((f) => { try { fs.unlinkSync(f); } catch {} });
      console.error("[ClipboardHelper] PS error:", err);
      if (this.sessionId === sid) {
        this.typingState = "IDLE";
        this.psProcess = null;
      }
    });

    // Update state to TYPING once click is detected.
    // We approximate this by polling the pauseFile absence + process alive.
    // In practice the state is set to TYPING right away since the PS script
    // itself manages click waiting internally.
    this.typingState = "TYPING";
    console.log(`[ClipboardHelper] Waiting for click then typing ${textToType.length} chars`);
  }

  /** Alt+S – pause typing */
  public pauseTyping(): void {
    if (this.typingState !== "TYPING") return;
    const pauseFile = path.join(os.tmpdir(), `chaitra_pause_${this.sessionId}`);
    try { fs.writeFileSync(pauseFile, ""); } catch {}
    this.typingState = "PAUSED";
    console.log("[ClipboardHelper] Typing paused.");
  }

  /** Alt+R – resume typing */
  public resumeTyping(): void {
    if (this.typingState !== "PAUSED") return;
    const pauseFile = path.join(os.tmpdir(), `chaitra_pause_${this.sessionId}`);
    try { fs.unlinkSync(pauseFile); } catch {}
    this.typingState = "TYPING";
    console.log("[ClipboardHelper] Typing resumed.");
  }

  /** Alt+E – stop typing entirely */
  public stopTyping(): void {
    this._killActiveSession();
    console.log("[ClipboardHelper] Typing stopped by user.");
  }

  /** Legacy API for the ClipboardPanel "Type" button */
  public async simulateBypassType(text: string): Promise<boolean> {
    await this.startTyping(text);
    return true;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private _killActiveSession(): void {
    if (this.sessionId) {
      const stopFile = path.join(os.tmpdir(), `chaitra_stop_${this.sessionId}`);
      const pauseFile = path.join(os.tmpdir(), `chaitra_pause_${this.sessionId}`);
      try { fs.writeFileSync(stopFile, ""); } catch {}
      try { fs.unlinkSync(pauseFile); } catch {}
    }
    if (this.psProcess) {
      try { this.psProcess.kill(); } catch {}
      this.psProcess = null;
    }
    this.typingState = "IDLE";
    this.sessionId = "";
  }
}
