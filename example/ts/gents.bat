rm ConfigUtil.ts
call %~dp0..\cfgforge_common.bat
%CFGFORGE% -gen ts -gen bytes
