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
$sig = @'
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vkey);
'@
$type = Add-Type -MemberDefinition $sig -Name Keyboard -Namespace Win32 -PassThru

# Wait until Left Mouse Button (0x01) is clicked
while (($type::GetAsyncKeyState(1) -band 0x8000) -eq 0) {
    Start-Sleep -Milliseconds 50
}

# Add a tiny delay to ensure the UI field has received focus from the click
Start-Sleep -Milliseconds 100

Add-Type -AssemblyName System.Windows.Forms
$decodedText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${base64Text}"))
[System.Windows.Forms.SendKeys]::SendWait($decodedText)
`;

      exec(`powershell -Command "${psScript.replace(/\n/g, '; ')}"`, (error) => {
        if (error) {
          console.error("Bypass Type Script error:", error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }
}
