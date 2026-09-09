Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c cd /d """ & scriptDir & """ && (py -3 stop_services.py || python stop_services.py)"

shell.Run command, 0, False
