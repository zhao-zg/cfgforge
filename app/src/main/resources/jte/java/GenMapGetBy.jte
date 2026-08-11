@import configgen.genjava.code.*
@import configgen.genjava.code.MethodStr
@import configgen.schema.*
@param KeySchema keySchema
@param NameableName name
@param boolean isPrimaryKey
@param String codeTopPkg
    !{
        String methodName = Name.GetByKeyFunctionNameInConfigMgr(keySchema, isPrimaryKey, name.nameable);
        String getByName = Name.GetByKeyFunctionName(keySchema, isPrimaryKey);
    }
public static ${name.className} ${getByName}(${MethodStr.formalParams(keySchema.fieldSchemas())}) {
        ${codeTopPkg}.ConfigMgr mgr = ${codeTopPkg}.ConfigMgr.getMgr();
        return mgr.${methodName}(${MethodStr.actualParamsKeyRaw(keySchema, "")});
    }
