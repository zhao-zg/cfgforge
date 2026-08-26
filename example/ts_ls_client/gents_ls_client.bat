rm ConfigUtil.ts
call %~dp0..\cfgforge_common.bat
%CFGFORGE% -langswitchdir ../i18n/langs -gen ts -gen bytes
