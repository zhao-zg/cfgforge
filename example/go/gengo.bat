@rem rm -f config/stream.go config/LoadErrors.go
call %~dp0..\cfgforge_common.bat
%CFGFORGE% -gen go,dir:.,encoding:UTF-8 -gen bytes
