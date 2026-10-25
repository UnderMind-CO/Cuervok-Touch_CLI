# Watch visible windows of Cuervok.exe processes and log every
# appear/disappear change so the flicker can be attributed to a PID.
param([int]$Seconds = 25)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinEnum {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static string Snapshot() {
    var sb = new System.Collections.Generic.List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var name = new StringBuilder(128); GetWindowText(h, name, 128);
      RECT r; GetWindowRect(h, out r);
      sb.Add(pid + "|" + name + "|" + (r.R - r.L) + "x" + (r.B - r.T) + "@" + r.L + "," + r.T);
      return true;
    }, IntPtr.Zero);
    return string.Join("\n", sb);
  }
}
"@

$end = (Get-Date).AddSeconds($Seconds)
$start = Get-Date
$prev = @{}
while ((Get-Date) -lt $end) {
  $pids = (Get-Process -Name Cuervok -ErrorAction SilentlyContinue).Id
  $probe = @([WinEnum]::Snapshot() -split "\n" | Where-Object {
    $pidField = ($_ -split '\|')[0]
    $pids -contains [int]$pidField
  })
  $key = $probe -join ';'
  if ($key -ne $prev['key']) {    Write-Output ("[t+" + [int](((Get-Date) - $start).TotalSeconds) + "s] ENTERS: " + 
      (($probe | Where-Object { $prev['set'] -notcontains $_ }) -join ' ; ') +
      " | LEAVES: " + (($prev['set'] | Where-Object { $probe -notcontains $_ }) -join ' ; '))
    $prev['key'] = $key
    $prev['set'] = $probe
  }
  Start-Sleep -Milliseconds 400
}
Write-Output 'watch-done'
