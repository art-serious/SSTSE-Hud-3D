# Microsoft Developer Studio Project File - Name="GameGUIMP" - Package Owner=<4>
# Microsoft Developer Studio Generated Build File, Format Version 6.00
# ** DO NOT EDIT **

# TARGTYPE "Win32 (x86) Dynamic-Link Library" 0x0102

CFG=GameGUIMP - Win32 Debug
!MESSAGE This is not a valid makefile. To build this project using NMAKE,
!MESSAGE use the Export Makefile command and run
!MESSAGE 
!MESSAGE NMAKE /f "GameGUIMP.mak".
!MESSAGE 
!MESSAGE You can specify a configuration when running NMAKE
!MESSAGE by defining the macro CFG on the command line. For example:
!MESSAGE 
!MESSAGE NMAKE /f "GameGUIMP.mak" CFG="GameGUIMP - Win32 Debug"
!MESSAGE 
!MESSAGE Possible choices for configuration are:
!MESSAGE 
!MESSAGE "GameGUIMP - Win32 Release" (based on "Win32 (x86) Dynamic-Link Library")
!MESSAGE "GameGUIMP - Win32 Debug" (based on "Win32 (x86) Dynamic-Link Library")
!MESSAGE 

# Begin Project
# PROP AllowPerConfigDependencies 0
# PROP Scc_ProjName ""$/Sources/GameGUIMP", QGCAAAAA"
# PROP Scc_LocalPath "."
CPP=cl.exe
MTL=midl.exe
RSC=rc.exe

!IF  "$(CFG)" == "GameGUIMP - Win32 Release"

# PROP BASE Use_MFC 0
# PROP BASE Use_Debug_Libraries 0
# PROP BASE Output_Dir "Release"
# PROP BASE Intermediate_Dir "Release"
# PROP BASE Target_Dir ""
# PROP Use_MFC 2
# PROP Use_Debug_Libraries 0
# PROP Output_Dir "Release"
# PROP Intermediate_Dir "Release"
# PROP Ignore_Export_Lib 0
# PROP Target_Dir ""
# ADD BASE CPP /nologo /MT /W3 /GX /O2 /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "GAMEGUI_EXPORTS" /Yu"stdafx.h" /FD /c
# ADD CPP /nologo /G5 /MD /W3 /GX /Zi /Ox /Ot /Og /Oi /Oy- /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "GAMEGUI_EXPORTS" /D "_WINDLL" /D "_AFXDLL" /Yu"stdafx.h" /FD /c
# SUBTRACT CPP /Ow
# ADD BASE MTL /nologo /D "NDEBUG" /mktyplib203 /win32
# ADD MTL /nologo /D "NDEBUG" /mktyplib203 /win32
# ADD BASE RSC /l 0x409 /d "NDEBUG"
# ADD RSC /l 0x409 /d "NDEBUG" /d "_AFXDLL"
BSC32=bscmake.exe
# ADD BASE BSC32 /nologo
# ADD BSC32 /nologo
LINK32=link.exe
# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /dll /machine:I386
# ADD LINK32 /nologo /dll /map /debug /machine:I386 /pdbtype:sept
# Begin Custom Build - Copying $(InputName) binaries to d:\DebugSam\TSE\Bin
InputPath=.\Release\GameGUIMP.dll
InputName=GameGUIMP
SOURCE="$(InputPath)"

"d:\DebugSam\TSE\Bin\$(InputName).dll" : $(SOURCE) "$(INTDIR)" "$(OUTDIR)"
	copy Release\$(InputName).dll d:\DebugSam\TSE\Bin\Bin >nul

# End Custom Build

!ELSEIF  "$(CFG)" == "GameGUIMP - Win32 Debug"

# PROP BASE Use_MFC 0
# PROP BASE Use_Debug_Libraries 1
# PROP BASE Output_Dir "Debug"
# PROP BASE Intermediate_Dir "Debug"
# PROP BASE Target_Dir ""
# PROP Use_MFC 2
# PROP Use_Debug_Libraries 1
# PROP Output_Dir "Debug"
# PROP Intermediate_Dir "Debug"
# PROP Ignore_Export_Lib 0
# PROP Target_Dir ""
# ADD BASE CPP /nologo /MTd /W3 /Gm /GX /ZI /Od /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "GAMEGUI_EXPORTS" /Yu"stdafx.h" /FD /GZ /c
# ADD CPP /nologo /G5 /MDd /W3 /Gm /GX /Zi /Od /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "GAMEGUI_EXPORTS" /D "_WINDLL" /D "_AFXDLL" /Yu"stdafx.h" /FD /GZ /c
# ADD BASE MTL /nologo /D "_DEBUG" /mktyplib203 /win32
# ADD MTL /nologo /D "_DEBUG" /mktyplib203 /win32
# ADD BASE RSC /l 0x409 /d "_DEBUG"
# ADD RSC /l 0x409 /d "_DEBUG" /d "_AFXDLL"
BSC32=bscmake.exe
# ADD BASE BSC32 /nologo
# ADD BSC32 /nologo
LINK32=link.exe
# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /dll /debug /machine:I386 /pdbtype:sept
# ADD LINK32 /nologo /dll /map /debug /machine:I386 /out:"Debug/GameGUIMPD.dll" /pdbtype:sept
# Begin Custom Build - Copying $(InputName) binaries to $(ENGINE_DIR)\Bin\Debug
InputPath=.\Debug\GameGUIMPD.dll
InputName=GameGUIMPD
SOURCE="$(InputPath)"

"$(ENGINE_DIR)\Bin\Debug\$(InputName).dll" : $(SOURCE) "$(INTDIR)" "$(OUTDIR)"
	copy Debug\$(InputName).dll $(ENGINE_DIR)\Bin\Debug >nul

# End Custom Build

!ENDIF 

# Begin Target

# Name "GameGUIMP - Win32 Release"
# Name "GameGUIMP - Win32 Debug"
# Begin Group "Source Files"

# PROP Default_Filter "cpp;c;cxx;rc;def;r;odl;idl;hpj;bat"
# Begin Source File

SOURCE=.\ActionsListControl.cpp
# End Source File
# Begin Source File

SOURCE=.\AxisListCtrl.cpp
# End Source File
# Begin Source File

SOURCE=.\ConsoleSymbolsCombo.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgAudioQuality.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgConsole.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgEditButtonAction.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerAppearance.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerControls.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerSettings.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgRenameControls.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgSelectPlayer.cpp
# End Source File
# Begin Source File

SOURCE=.\DlgVideoQuality.cpp
# End Source File
# Begin Source File

SOURCE=.\EditConsole.cpp
# End Source File
# Begin Source File

SOURCE=.\GameGUI.cpp
# End Source File
# Begin Source File

SOURCE=.\LocalPlayersList.cpp
# End Source File
# Begin Source File

SOURCE=.\PressKeyEditControl.cpp
# End Source File
# Begin Source File

SOURCE=.\StdAfx.cpp
# ADD CPP /Yc"stdafx.h"
# End Source File
# End Group
# Begin Group "Header Files"

# PROP Default_Filter "h;hpp;hxx;hm;inl"
# Begin Source File

SOURCE=.\ActionsListControl.h
# End Source File
# Begin Source File

SOURCE=.\AxisListCtrl.h
# End Source File
# Begin Source File

SOURCE=.\ConsoleSymbolsCombo.h
# End Source File
# Begin Source File

SOURCE=.\DlgAudioQuality.h
# End Source File
# Begin Source File

SOURCE=.\DlgConsole.h
# End Source File
# Begin Source File

SOURCE=.\DlgEditButtonAction.h
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerAppearance.h
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerControls.h
# End Source File
# Begin Source File

SOURCE=.\DlgPlayerSettings.h
# End Source File
# Begin Source File

SOURCE=.\DlgRenameControls.h
# End Source File
# Begin Source File

SOURCE=.\DlgSelectPlayer.h
# End Source File
# Begin Source File

SOURCE=.\DlgVideoQuality.h
# End Source File
# Begin Source File

SOURCE=.\EditConsole.h
# End Source File
# Begin Source File

SOURCE=.\GameGUI.h
# End Source File
# Begin Source File

SOURCE=.\LocalPlayersList.h
# End Source File
# Begin Source File

SOURCE=.\PressKeyEditControl.h
# End Source File
# Begin Source File

SOURCE=.\resource.h
# End Source File
# Begin Source File

SOURCE=.\StdAfx.h
# End Source File
# End Group
# Begin Group "Resource Files"

# PROP Default_Filter "ico;cur;bmp;dlg;rc2;rct;bin;rgs;gif;jpg;jpeg;jpe"
# Begin Source File

SOURCE=.\bmp00001.bmp
# End Source File
# Begin Source File

SOURCE=.\cursor_u.bmp
# End Source File
# Begin Source File

SOURCE=.\GameGUI.rc
# End Source File
# End Group
# Begin Group "Wizard Files"

# PROP Default_Filter ""
# Begin Source File

SOURCE=.\GameGUIMP.clw
# End Source File
# End Group
# Begin Source File

SOURCE=.\ReadMe.txt
# End Source File
# End Target
# End Project
