import { clipboard, BrowserWindow } from "electron";
import { getStoreValue, setStoreValue } from "./main";
import { spawn } from "child_process";
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

  // Stateful typing
  private typingState: TypingState = "IDLE";
  private textToType: string = "";
  private charIndex: number = 0;
  private typingInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 5;
  private readonly BATCH_DELAY_MS = 80;

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
   * Start typing. If text is omitted, uses the latest clipboard contents.
   * Hides the main window and waits for user to click in any input field.
   */
  public async startTyping(text?: string): Promise<void> {
    this._stopTypingInterval();

    this.textToType = text !== undefined ? text : (clipboard.readText() ?? "");
    if (!this.textToType) {
      console.warn("[ClipboardHelper] startTyping: clipboard is empty");
      return;
    }

    this.charIndex = 0;
    this.typingState = "WAITING_FOR_CLICK";
    console.log("[ClipboardHelper] Hiding window, waiting for click...");

    // Hide window so user can focus another app
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    // Small PS script: wait for LMB release then LMB press
    const clickScript = `
$sig = '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vkey);'
$type = Add-Type -MemberDefinition $sig -Name Keyboard -Namespace Win32 -PassThru
while (($type::GetAsyncKeyState(1) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 50 }
while (($type::GetAsyncKeyState(1) -band 0x8000) -eq 0) { Start-Sleep -Milliseconds 50 }
Start-Sleep -Milliseconds 200
`;
    const tmpClick = path.join(os.tmpdir(), `chaitra_click_${Date.now()}.ps1`);
    fs.writeFileSync(tmpClick, clickScript, "utf8");

    const ps = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tmpClick,
    ]);

    ps.on("close", () => {
      fs.unlink(tmpClick, () => {});
      if (this.typingState === "WAITING_FOR_CLICK") {
        this.typingState = "TYPING";
        console.log("[ClipboardHelper] Click detected – starting typing.");
        this._startTypingInterval();
      }
    });

    ps.on("error", (err: any) => {
      fs.unlink(tmpClick, () => {});
      console.error("[ClipboardHelper] Click watcher error:", err);
      this.typingState = "IDLE";
    });
  }

  /** Alt+S – pause mid-flow */
  public pauseTyping(): void {
    if (this.typingState !== "TYPING") return;
    this._stopTypingInterval();
    this.typingState = "PAUSED";
    console.log(`[ClipboardHelper] Paused at char ${this.charIndex}/${this.textToType.length}`);
  }

  /** Alt+R – resume from where we left off */
  public resumeTyping(): void {
    if (this.typingState !== "PAUSED") return;
    this.typingState = "TYPING";
    console.log(`[ClipboardHelper] Resumed from char ${this.charIndex}/${this.textToType.length}`);
    this._startTypingInterval();
  }

  /** Alt+E – stop completely and reset */
  public stopTyping(): void {
    this._stopTypingInterval();
    this.typingState = "IDLE";
    this.textToType = "";
    this.charIndex = 0;
    console.log("[ClipboardHelper] Typing stopped.");
  }

  /** Legacy single-call API kept for the ClipboardPanel "Type" button */
  public async simulateBypassType(text: string): Promise<boolean> {
    await this.startTyping(text);
    return true;
  }

  // ─── Internal Typing Engine ───────────────────────────────────────────────

  private _startTypingInterval(): void {
    if (this.typingInterval) return;
    this.typingInterval = setInterval(() => {
      if (this.typingState !== "TYPING") {
        this._stopTypingInterval();
        return;
      }
      if (this.charIndex >= this.textToType.length) {
        this._stopTypingInterval();
        this.typingState = "IDLE";
        console.log("[ClipboardHelper] Typing complete.");
        return;
      }
      const batch = this.textToType.substring(this.charIndex, this.charIndex + this.BATCH_SIZE);
      this.charIndex += batch.length;
      this._sendBatch(batch);
    }, this.BATCH_DELAY_MS);
  }

  private _stopTypingInterval(): void {
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
  }

  private _sendBatch(batch: string): void {
    const b64 = Buffer.from(batch, "utf8").toString("base64");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))
$wshell = New-Object -ComObject WScript.Shell
foreach ($c in $text.ToCharArray()) {
    $s = $c.ToString()
    if ('+^%~(){}[]'.Contains($s)) { $s = "{$s}" }
    $wshell.SendKeys($s)
    Start-Sleep -Milliseconds 3
}
`;
    const tmpPath = path.join(
      os.tmpdir(),
      `chaitra_batch_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`
    );
    try {
      fs.writeFileSync(tmpPath, script, "utf8");
    } catch (e) {
      console.error("[ClipboardHelper] Failed to write batch script:", e);
      return;
    }
    const ps = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tmpPath,
    ]);
    ps.on("close", () => { fs.unlink(tmpPath, () => {}); });
    ps.on("error", (e: any) => {
      fs.unlink(tmpPath, () => {});
      console.error("[ClipboardHelper] Batch send error:", e);
    });
  }
}
