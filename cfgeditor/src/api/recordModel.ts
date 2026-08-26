export type JSONValue =
    | string
    | number
    | boolean
    | JSONObject & Refs
    | JSONArray;

export interface JSONObject {
    [x: string]: JSONValue;

    "$type": string;
}

export type JSONArray = Array<JSONValue>

export interface Refs {
    "$refs"?: FieldRef[];
}

export interface BriefDescription {
    field: string;
    value: string;
    comment: string;
}

// BriefRecord 字段名与 editor-core 对齐：
// $refs = FieldRef[]（出边引用），与 ValueToJson 产出的 JSON $refs 键名一致。
export interface BriefRecord extends Refs {
    table: string;
    id: string;

    title?: string;
    descriptions?: BriefDescription[];

    value: string;
    depth: number;  // 若ref in为-1，自身为0，ref出去的1,2...
}

export interface FieldRef {
    firstField: string;
    label?: string;
    toTable: string;
    toId: string;
}

export interface RefId {
    table: string;
    id: string;
}


export interface RecordRefId {
    table: string;
    id: string;
    title: string;
    depth: number;
}

export type ResultCode =
    'ok'
    | 'tableNotSet'
    | 'idNotSet'
    | 'tableNotFound'
    | 'idParseErr'
    | 'idNotFound'
    | 'paramErr';

// editor-core 的 RecordResult 允许 object/refs 为 null（错误码路径），
// cfgeditor 本地类型与之对齐以保持结构兼容。
export interface RecordResult {
    resultCode: ResultCode;
    table: string;
    id: string;
    maxObjs: number;
    object: Record<string, unknown> | null;  //自身详细信息
    refs: BriefRecord[] | null;
}

// editor-core 的 RecordRefsResult 允许 refs 为 null（错误码路径）
export interface RecordRefsResult {
    resultCode: ResultCode;
    table: string;
    id: string;
    depth: number;
    in: boolean;
    maxObjs: number;
    refs: BriefRecord[] | null;
}

// editor-core 的 UnreferencedRecordsResult 允许 refs 为 null（错误码路径）
export interface UnreferencedRecordsResult {
    resultCode: ResultCode;
    table: string;
    maxObjs: number;
    refs: BriefRecord[] | null;  // 复用BriefRecord，表示所有未引用的记录
}

export interface RecordRefIdsResult {
    resultCode: ResultCode;
    table: string;
    id: string;
    inDepth: number;
    outDepth: number;
    maxRefIds: number;
    recordRefIds: RecordRefId[];
}


export type EditResultCode =
    'addOk'
    | 'updateOk'
    | 'deleteOk'
    | 'serverNotEditable'
    | 'tableNotSet'
    | 'idNotSet'
    | 'tableNotFound'
    | 'idParseErr'
    | 'idNotFound'
    | 'jsonParseErr'
    | 'storeErr';

export interface RecordEditResult {
    resultCode: EditResultCode;
    table: string;
    id: string;
    valueErrs: string[];
}
