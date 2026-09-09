Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c cd /d """ & scriptDir & """ && (py -3 start_services.py --hidden || python start_services.py --hidden)"

shell.Run command, 0, False
