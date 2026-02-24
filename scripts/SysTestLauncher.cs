// SysTestLauncher.cs - Bypasses SysTestConsole.17.0.exe's "Press any key"
// debug-attach prompt by directly invoking SysTestConsole.Main via reflection,
// with Console.ReadKey intercepted via a Harmony-style detour.
//
// Since Harmony isn't available, we use a simpler approach:
// Start SysTestConsole as a child process sharing our console, and use a
// background thread to inject Enter key via WriteConsoleInput on the shared
// console input buffer.
//
// Usage: SysTestLauncher.exe <SysTestConsole args...>

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

class SysTestLauncher
{
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteConsoleInput(IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer, uint nLength, out uint lpNumberOfEventsWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

    const int STD_INPUT_HANDLE = -10;
    const ushort KEY_EVENT = 0x0001;

    [StructLayout(LayoutKind.Explicit)]
    struct INPUT_RECORD
    {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct KEY_EVENT_RECORD
    {
        [FieldOffset(0)] public bool bKeyDown;
        [FieldOffset(4)] public ushort wRepeatCount;
        [FieldOffset(6)] public ushort wVirtualKeyCode;
        [FieldOffset(8)] public ushort wVirtualScanCode;
        [FieldOffset(10)] public char UnicodeChar;
        [FieldOffset(12)] public uint dwControlKeyState;
    }

    static int Main(string[] args)
    {
        string sysTestDir = @"C:\AosService\PackagesLocalDirectory\bin";
        string sysTestExe = Path.Combine(sysTestDir, "SysTestConsole.17.0.exe");

        if (!File.Exists(sysTestExe))
        {
            Console.Error.WriteLine("ERROR: SysTestConsole not found at: " + sysTestExe);
            return 1;
        }

        string arguments = string.Join(" ", args);
        Console.WriteLine("[Launcher] Starting SysTestConsole with: " + arguments);

        // Start a background thread that repeatedly injects Enter key into the
        // console input buffer. Since SysTestConsole inherits our console (no
        // redirection), Console.ReadKey() will pick up the injected keystroke.
        var cts = new CancellationTokenSource();
        var keyThread = new Thread(() => KeyInjectorLoop(cts.Token))
        {
            IsBackground = true,
            Name = "KeyInjector"
        };
        keyThread.Start();

        // Start SysTestConsole as a child process sharing our console
        var psi = new ProcessStartInfo
        {
            FileName = sysTestExe,
            Arguments = arguments,
            WorkingDirectory = sysTestDir,
            UseShellExecute = false,
            CreateNoWindow = false, // Inherit our console
        };

        Process proc;
        try
        {
            proc = Process.Start(psi);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Launcher] Failed to start: " + ex.Message);
            cts.Cancel();
            return 2;
        }

        if (proc == null)
        {
            Console.Error.WriteLine("[Launcher] Process.Start returned null");
            cts.Cancel();
            return 2;
        }

        Console.WriteLine("[Launcher] SysTestConsole PID: " + proc.Id);

        // Wait for the process to finish (up to 20 minutes)
        bool finished = proc.WaitForExit(20 * 60 * 1000);

        // Stop the key injector
        cts.Cancel();

        if (!finished)
        {
            Console.Error.WriteLine("[Launcher] TIMEOUT: killing SysTestConsole after 20 minutes");
            try { proc.Kill(); } catch { }
            return -1;
        }

        Console.WriteLine("[Launcher] SysTestConsole exited with code: " + proc.ExitCode);
        return proc.ExitCode;
    }

    /// <summary>
    /// Repeatedly injects Enter keystrokes into the console input buffer.
    /// Starts injecting after 5 seconds (to let the prompt appear),
    /// then injects every 2 seconds for up to 30 seconds total.
    /// After that, stops to avoid interfering with actual test execution.
    /// </summary>
    static void KeyInjectorLoop(CancellationToken ct)
    {
        // Wait for the "Press any key" prompt to appear
        Thread.Sleep(5000);

        IntPtr hInput = GetStdHandle(STD_INPUT_HANDLE);

        // Verify we have a valid console handle
        uint mode;
        if (!GetConsoleMode(hInput, out mode))
        {
            Console.Error.WriteLine("[KeyInjector] No valid console input handle (running in piped/redirected mode?)");
            return;
        }

        int attempts = 0;
        while (!ct.IsCancellationRequested && attempts < 15)
        {
            InjectEnterKey(hInput);
            attempts++;
            Thread.Sleep(2000);
        }
    }

    static void InjectEnterKey(IntPtr hInput)
    {
        var records = new INPUT_RECORD[2];

        // Key down - Enter
        records[0].EventType = KEY_EVENT;
        records[0].KeyEvent.bKeyDown = true;
        records[0].KeyEvent.wRepeatCount = 1;
        records[0].KeyEvent.wVirtualKeyCode = 0x0D; // VK_RETURN
        records[0].KeyEvent.wVirtualScanCode = 0x1C;
        records[0].KeyEvent.UnicodeChar = '\r';
        records[0].KeyEvent.dwControlKeyState = 0;

        // Key up - Enter
        records[1].EventType = KEY_EVENT;
        records[1].KeyEvent.bKeyDown = false;
        records[1].KeyEvent.wRepeatCount = 1;
        records[1].KeyEvent.wVirtualKeyCode = 0x0D;
        records[1].KeyEvent.wVirtualScanCode = 0x1C;
        records[1].KeyEvent.UnicodeChar = '\r';
        records[1].KeyEvent.dwControlKeyState = 0;

        uint written;
        WriteConsoleInput(hInput, records, 2, out written);
    }
}
