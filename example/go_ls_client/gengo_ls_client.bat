rm -f config/stream.go config/LoadErrors.go config/Text.go
call %~dp0..\cfgforge_common.bat
%CFGFORGE% -langswitchdir ../i18n/langs -gen go,dir:.,encoding:UTF-8 -gen bytes
