import { clipboard, BrowserWindow } from "electron";
import { exec } from "child_process";
import { getStoreValue, setStoreValue } from "./main";

export interface ClipboardItem {
  id: string;
  text: string;
  pinned: boolean;
  timestamp: number;
}

export class ClipboardHelper {
  private getMainWindow: () => BrowserWindow | null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastText: string = "";

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  public startMonitoring() {
    this.lastText = clipboard.readText() || "";
    this.intervalId = setInterval(async () => {
      const currentText = clipboard.readText();
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText;
        await this.addTextToHistory(currentText);
      }
    }, 500);
  }

  public stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async addTextToHistory(text: string) {
    try {
      const history: ClipboardItem[] = await getStoreValue("clipboard-history") || [];
      // Do not add if it already exists as the first unpinned item or if it's identical to the very first item
      if (history.length > 0 && history.some(item => item.text === text && !item.pinned)) {
        return; 
      }
      
      const newItem: ClipboardItem = {
        id: `clip-${Date.now()}`,
        text,
        pinned: false,
        timestamp: Date.now()
      };
      
      const updatedHistory = [newItem, ...history].slice(0, 100);
      await setStoreValue("clipboard-history", updatedHistory);
      
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clipboard-update", updatedHistory);
      }
    } catch (e) {
      console.error("Error updating clipboard history:", e);
    }
  }

  public async simulateBypassType(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      // We escape backticks, quotes, and some special characters by base64 encoding the text to pass to PowerShell securely.
      const base64Text = Buffer.from(text).toString("base64");
      
      const psScript = `
$sig = '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vkey);'
$type = Add-Type -MemberDefinition $sig -Name Keyboard -Namespace Win32 -PassThru

while (($type::GetAsyncKeyState(1) -band 0x8000) -ne 0) {
    Start-Sleep -Milliseconds 50
}

while (($type::GetAsyncKeyState(1) -band 0x8000) -eq 0) {
    Start-Sleep -Milliseconds 50
}

Start-Sleep -Milliseconds 300

$decodedText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${base64Text}"))
$wshell = New-Object -ComObject WScript.Shell
$chars = $decodedText.ToCharArray()
foreach ($c in $chars) {
    $s = $c.ToString()
    if ('+^%~(){}[]'.Contains($s)) {
        $s = "{$s}"
    }
    $wshell.SendKeys($s)
    Start-Sleep -Milliseconds 5
}
`;

      const { spawn } = require("child_process");
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      
      const tmpPath = path.join(os.tmpdir(), `chaitra_type_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
      
      try {
        fs.writeFileSync(tmpPath, psScript, "utf8");
      } catch (err) {
        console.error("Failed to write temporary PS script:", err);
        return resolve(false);
      }

      const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpPath]);

      ps.on("error", (error: any) => {
        console.error("Bypass Type Script error:", error);
        fs.unlink(tmpPath, () => {});
        resolve(false);
      });

      ps.on("close", (code: number) => {
        fs.unlink(tmpPath, () => {});
        if (code !== 0) {
          console.error("Bypass Type Script exited with code:", code);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
