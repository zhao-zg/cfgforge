rm cfg/mkcfg.lua
rm cfg/mkcfginit.lua

call %~dp0..\cfgforge_common.bat
%CFGFORGE% -langswitchdir ../i18n/langs -gen lua,dir:.,emmylua,sharedEmptyTable,shared,mkcfgdir:cfg

