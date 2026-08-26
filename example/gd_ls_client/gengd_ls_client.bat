REM 删除通过 copyFileIfNotExist 复制的支持文件
rm -f config/ConfigStream.gd
rm -f config/ConfigLoader.gd
rm -f config/ConfigErrors.gd
rm -f config/TextPoolManager.gd
rm -f config/ConfigText.gd

call %~dp0..\cfgforge_common.bat
%CFGFORGE% -langswitchdir ../i18n/langs -gen gd,own:-nogd,dir:config -gen bytes,own:-nogd

echo Generated GDScript client code to gd_ls_client/

rm -rf jte-classes
