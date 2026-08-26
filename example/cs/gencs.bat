rm Config/Loader.cs

call %~dp0..\cfgforge_common.bat
%CFGFORGE%  -gen cs,prefix:D,dir:.,encoding:UTF-8 -gen bytes,cipher=xyz

