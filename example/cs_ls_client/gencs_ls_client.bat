rm Config/Loader.cs

call %~dp0..\cfgforge_common.bat
%CFGFORGE% -langswitchdir ../i18n/langs -gen cs,dir:.,encoding:UTF-8,unity -gen bytes

