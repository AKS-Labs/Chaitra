# Stealth Mode Debugging Guide

## What You're Experiencing

When you press **Ctrl+\** to show Chaitra, the fullscreen app detects it and pops "desktop switch detected - closing app"

## Debug Steps

### 1. Check Stealth Mode Initialization (Console Logs)

When you start Chaitra, watch the console (Developer Tools) for:

```
[StealthMode] Activating stealth mode with Win32 APIs...
[StealthMode] Got window handle: [hex number]
[StealthMode] Applying Win32 flags to HWND: [number]
[StealthMode] Win32 API Success: [output]
[StealthMode] Stealth mode ACTIVATED - window is now invisible to OS
```

**If you see ANY errors like:**
- "Could not get native handle"
- "Win32 execution error"
- "Skipping Win32 APIs"

Then the Win32 API approach isn't working.

### 2. Check What Happens When You Toggle (Ctrl+\)

Watch console for:
```
[Shortcuts] Toggle shortcut (Ctrl/Cmd + \) triggered
[Shortcuts] Window was visible: [true/false]
[Shortcuts] Window [hidden/shown], [unregistering/registering] app shortcuts
[StealthMode] [Showing/Hiding] window in stealth mode...
[StealthMode] Window [shown/hidden] 
```

### 3. Test If Window is Actually Hidden from System

Run this PowerShell command while Chaitra is supposedly "invisible":

```powershell
Get-Window | Where-Object { $_.Name -match "Chaitra" }
```

If you see a "Chaitra" window listed, it's still enumerable by the OS.

### 4. Check Alt-Tab  

Press **Alt+Tab** while Chaitra is visible - it should NOT appear in the list.

If Chaitra appears in Alt+Tab, the `WS_EX_TOOLWINDOW` flag isn't being set.

### 5. Check Taskbar

While Chaitra is visible, there should be NO taskbar button.

If you see a taskbar button, `setSkipTaskbar(true)` isn't working.

## Possible Issues & Solutions

### Issue 1: Win32 PowerShell API Not Executing

**Symptom**: Console shows "Win32 execution error" or "Stderr" output

**Cause**: PowerShell doesn't have permission or syntax is wrong

**Solution**: Change approach from PowerShell to a native module

### Issue 2: Window Still in Alt-Tab

**Symptom**: You can see Chaitra in Alt+Tab menu

**Cause**: `type: "toolbar"` not being set during window creation

**Solution**: Verify in main.ts that BrowserWindow is created with `type: "toolbar"`

### Issue 3: Taskbar Button Still Shows

**Symptom**: Chaitra appears in taskbar while visible

**Cause**: `setSkipTaskbar(true)` not working or being overridden

**Solution**: Call `setSkipTaskbar(true)` multiple times and verify with PowerShell script below

### Issue 4: Still Triggers Fullscreen App Detection

**Symptom**: Other app pops "desktop switch detected" even with all above working

**Cause**: Windows is still sending focus/activation events to other apps

**Solution**: May need different approach entirely (see Alternative Solutions below)

## PowerShell Verification Scripts

### Script 1: Check if Window Exists and Its Properties

```powershell
$chaitra = Get-Window | Where-Object Name -match "Chaitra"
if ($chaitra) {
    Write-Host "Window Found: $($chaitra.Name)"
    Write-Host "Class: $($chaitra.ClassName)"
} else {
    Write-Host "Window NOT found in enumeration"
}
```

### Script 2: Check Taskbar Setting

```powershell
Get-AppxPackage | Where-Object Name -match "Chaitra"
# Or check:
Get-Process | Where-Object Name -match "Chaitra"
```

### Script 3: Check Extended Window Styles

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WinAPI {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
}
"@

$hwnd = [WinAPI]::FindWindow($null, "Chaitra")
if ($hwnd -ne [IntPtr]::Zero) {
    $exStyle = [WinAPI]::GetWindowLong($hwnd, -20)
    $binStyle = [System.Convert]::ToString($exStyle, 2)
    Write-Host "Window HWND: $hwnd"
    Write-Host "Extended Style: 0x$($exStyle.ToString('X8'))"
    Write-Host "Binary: $binStyle"
    
    # Check specific flags
    $hasToolWindow = ($exStyle -band 0x00000080) -ne 0
    $hasNoActivate = ($exStyle -band 0x08000000) -ne 0
    
    Write-Host "Has ToolWindow flag: $hasToolWindow"
    Write-Host "Has NoActivate flag: $hasNoActivate"
} else {
    Write-Host "Window NOT found!"
}
```

## Alternative Solutions to Investigate

### Option A: Persistent Invisible Window

Instead of show/hide, keep window always created but:
- Reposition off-screen when "hidden"
- Move back on-screen when "shown"
- This avoids triggering window activation messages

### Option B: OpenGL/DirectX Overlay

Create a low-level overlay that doesn't register as a traditional window:
- Doesn't get enumerated by Win32
- Doesn't trigger focus events
- Works over fullscreen apps
- Complex but most reliable

### Option C: System Tray Only

No visible window at all:
- Add system tray icon
- Right-click menu for actions
- Shows things in a context menu, not a window
- Completely undetectable but UX change

### Option D: Browser/CEF-Based Overlay

Use a simplified Chromium Embedded Framework instance instead of Electron window:
- May have different window behavior
- Potentially less detectable
- Requires significant refactoring

## Testing New Solution

Once we decide on an approach:

1. Rebuild: `npm run build`
2. Test over a fullscreen game
3. Check all the console logs above
4. Run verification PowerShell scripts
5. Report which steps fail/pass

## What To Report

When testing, please provide:
1. ✅/❌ "Stealth mode ACTIVATED" message in console
2. ✅/❌ Window appears in Alt+Tab
3. ✅/❌ Window appears in taskbar
4. ✅/❌ Fullscreen app detects Chaitra showing
5. Console logs if any errors appear

This will help identify exactly which part of the stealth solution isn't working.

---

**Next Steps**: Run these debug steps and report back with results. That will help us know which approach to take next.
