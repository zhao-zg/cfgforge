@rem rm -rf common
call %~dp0..\cfgforge_common.bat
%CFGFORGE%  -gen lua,dir:.,emmylua,sharedEmptyTable,shared,mkcfgdir:common
