# Testing NoFocusMode for Detection Issues

## What We're Testing
The Win32 API call `ShowWindow(hwnd, 4)` which should show the window **without changing focus** to prevent other apps from detecting activation.

## Complete Testing Steps

### Step 1: Open Developer Console
1. Open the Chaitra app from the terminal where `npm run dev` is running
2. Keep the terminal window visible to watch logs
3. **IMPORTANT**: Look at console logs as you perform actions

### Step 2: Test the Hide → Show Cycle

#### 2A: Hide the Window
1. Move to a different application or desktop
2. Press **Ctrl + \** (Ctrl + Backslash)
3. **Expected**: Window disappears
4. **Console Should Show**:
   ```
   [Shortcuts] Toggle shortcut (Ctrl/Cmd + \) triggered
   [Shortcuts] toggleMainWindow called
   [Shortcuts] Using NoFocusMode.toggle()
   [NoFocusMode] Toggle called
   [NoFocusMode] Window visible state: true
   [NoFocusMode] Window visible, hiding it
   [NoFocusMode] Window hidden
   ```

#### 2B: Show the Window WITHOUT Focus
1. Keep focus on the other application
2. Press **Ctrl + \** again while the other app is in focus
3. **Expected**: Chaitra window appears but OTHER APP STAYS FOCUSED
4. **Console Should Show**:
   ```
   [Shortcuts] Toggle shortcut (Ctrl/Cmd + \) triggered
   [Shortcuts] toggleMainWindow called
   [Shortcuts] Using NoFocusMode.toggle()
   [NoFocusMode] Toggle called
   [NoFocusMode] Window visible state: false
   [NoFocusMode] Showing window...
   [NoFocusMode] Used Electron show() for Windows/Linux
   [NoFocusMode] hwnd present and Windows platform detected
   [NoFocusMode] Attempting Win32 focus suppression for HWND: [some_number]
   [NoFocusMode] Executing PowerShell for Win32 call...
   [NoFocusMode] Win32 ShowWindow result: 1
   ```

### Step 3: Test with Fullscreen App for Detection

#### 3A: Launch Fullscreen Game/App
1. Launch a fullscreen game (like Windows Notepad fullscreen test, or an actual game)
2. In the game, have a debug overlay or way to detect when window focus changes

#### 3B: Invoke Chaitra While in Fullscreen
1. Press **Ctrl + \** to show Chaitra
2. **WATCH THE GAME**: Does the game detect focus change? Does desktop switch warning appear?
3. **Check Console Logs**: Look for the Win32 call execution

#### 3C: Check for Errors
If you see instead:
```
[NoFocusMode] hwnd not available - window handle not obtained
```
→ This means `getNativeWindowHandle()` failed, we need to handle this differently

If you see:
```
[NoFocusMode] Win32 call failed (but window is still visible): [error details]
```
→ The PowerShell/Win32 execution failed, provide full error message

If you see:
```
[NoFocusMode] Not Windows - skipping Win32 call (platform: win32)
```
→ Platform detection might be wrong

## Expected Success Criteria

✅ **PASS**: Chaitra window appears, **other app doesn't lose focus**, and Win32 call logs show successful result
❌ **FAIL**: Other app loses focus when Chaitra appears, or Win32 call errors appear in logs

## Debugging Information to Share

If the app still detects Chaitra, please share:
1. **Complete console output** when Ctrl+\ is pressed (show window step)
2. **Visual behavior**: Does the other app visibly lose focus?
3. **Error messages** from the Win32 pathway
4. **Any OS/Windows version details** (the Win32 API behavior can vary)

## Why This Approach

The Win32 `ShowWindow(hwnd, SW_SHOWNOACTIVATE)` API is specifically designed to show a window without firing `WM_ACTIVATE` events that other applications listen for. This should be undetectable at the OS level.

If it's not working, the issue might be:
- PowerShell execution timeout
- hwnd becoming invalid/stale
- Windows restricting this API (some versions/security settings)
- Need for additional Win32 calls like `SetWindowPos()` with `SWP_NOACTIVATE`
