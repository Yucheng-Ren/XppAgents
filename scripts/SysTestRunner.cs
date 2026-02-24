// SysTestRunner.cs - Tiny wrapper around SysTestConsole.17.0.exe
// Spawns SysTestConsole in a way that handles the "Press any key" debug prompt.
// Compile: csc /out:SysTestRunner.exe SysTestRunner.cs
using System;
using System.Diagnostics;
using System.Threading;
using System.IO;

class SysTestRunner
{
    static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("Usage: SysTestRunner.exe <SysTestConsole args...>");
            Console.WriteLine("Example: SysTestRunner.exe /test:MyTestClass /xml:results.xml");
            return 1;
        }

        string packagesDir = FindPackagesDir();
        if (packagesDir == null)
        {
            Console.Error.WriteLine("ERROR: Could not find PackagesLocalDirectory");
            return 1;
        }

        string exePath = Path.Combine(packagesDir, "bin", "SysTestConsole.17.0.exe");
        if (!File.Exists(exePath))
        {
            Console.Error.WriteLine("ERROR: SysTestConsole.17.0.exe not found at: " + exePath);
            return 1;
        }

        string arguments = string.Join(" ", args);
        Console.WriteLine("[SysTestRunner] Starting: SysTestConsole.17.0.exe " + arguments);
        Console.WriteLine("[SysTestRunner] Working dir: " + packagesDir + "\\bin");
        Console.WriteLine();

        var psi = new ProcessStartInfo
        {
            FileName = exePath,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            WorkingDirectory = Path.Combine(packagesDir, "bin")
        };

        var proc = Process.Start(psi);

        // Background thread to read and display stdout
        var stdoutThread = new Thread(() =>
        {
            try
            {
                string line;
                while ((line = proc.StandardOutput.ReadLine()) != null)
                {
                    Console.WriteLine(line);
                    // Detect the debug prompt
                    if (line.Contains("Press any key to continue"))
                    {
                        Console.WriteLine("[SysTestRunner] Detected debug prompt - auto-pressing Enter...");
                        Thread.Sleep(200);
                        try { proc.StandardInput.WriteLine(); }
                        catch { /* ignore if already closed */ }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[SysTestRunner] stdout reader error: " + ex.Message);
            }
        });
        stdoutThread.IsBackground = true;
        stdoutThread.Start();

        // Background thread to read stderr
        var stderrThread = new Thread(() =>
        {
            try
            {
                string line;
                while ((line = proc.StandardError.ReadLine()) != null)
                {
                    Console.Error.WriteLine(line);
                }
            }
            catch { }
        });
        stderrThread.IsBackground = true;
        stderrThread.Start();

        proc.WaitForExit();
        stdoutThread.Join(5000);
        stderrThread.Join(5000);

        Console.WriteLine();
        Console.WriteLine("[SysTestRunner] Exit code: " + proc.ExitCode);
        return proc.ExitCode;
    }

    static string FindPackagesDir()
    {
        string[] candidates = {
            @"C:\AosService\PackagesLocalDirectory",
            @"K:\AosService\PackagesLocalDirectory",
            @"J:\AosService\PackagesLocalDirectory",
            @"E:\AosService\PackagesLocalDirectory"
        };
        foreach (var c in candidates)
        {
            if (Directory.Exists(c)) return c;
        }
        return null;
    }
}
