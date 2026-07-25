Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & folder & "\start-server.ps1""" , 0, False

WScript.Sleep 2000

WshShell.Run "http://localhost:8000"
