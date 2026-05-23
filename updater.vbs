Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptPosition)
launcherPath = scriptDir & "\launcher.ps1"
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -File """ & launcherPath & """", 0, False
