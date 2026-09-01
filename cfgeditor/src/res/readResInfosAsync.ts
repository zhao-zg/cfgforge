import {
    readStoreStateOnce,
    getMyStore,
    setResourceDir,
    setResMap
} from "@/store/store";
import {readDir} from "@tauri-apps/plugin-fs";
import {refetchResInfoCache} from "@/services/queryKeys.ts";
import {ext2type, findKeyEndIndex} from "./resUtils.ts";
import {ResAudioTrack, ResInfo, ResSubtitlesTrack, ResType} from "@/domain/resInfo";
import {isTauri} from "@tauri-apps/api/core";
import {join} from "@tauri-apps/api/path";
import {path} from "@tauri-apps/api";
import {isDockerMode} from "@/services/BrowserFsApi.ts";
import {getDefaultFileSystem} from "@cfgforge/shared";
import {normalize as pathNormalize, join as pathJoin} from "@cfgforge/shared";

async function processDirRecursively(dir: string,
                                      txtAsSrt: boolean,
                                      lang: string | undefined,
                                      result: Map<string, ResInfo[]>,
                                      stat: Map<string, number>) {
    const entries = await readDir(dir);

    for (const {name, isFile, isDirectory} of entries) {
        if (isDirectory) {
            const subDir = await join(dir, name);
            await processDirRecursively(subDir, txtAsSrt, lang, result, stat);
        } else if (isFile && !name.endsWith(".meta")) {
            const path = await join(dir, name);

            const idx = findKeyEndIndex(name);
            if (idx == -1) {
                console.log(`ignore  ${path}`);
            } else {
                const extIdx = name.lastIndexOf('.');
                if (extIdx == -1) {
                    console.log(`ignore ${path}`);
                } else {
                    const ext = name.substring(extIdx).toLowerCase();
                    let type: ResType = 'other';
                    let thisLang;
                    if (ext in ext2type) {
                        type = ext2type[ext];
                    } else if (txtAsSrt && ext == '.txt') {
                        type = 'subtitles';
                        thisLang = lang
                    }

                    const key = name.substring(0, idx);
                    const value = result.get(key);
                    const resInfo: ResInfo = {type, name, path, lang: thisLang};
                    if (value) {
                        value.push(resInfo);
                    } else {
                        result.set(key, [resInfo]);
                    }

                    const extCnt = stat.get(ext);
                    let cnt = 1;
                    if (extCnt) {
                        cnt += extCnt;
                    }
                    stat.set(ext, cnt);
                }
            }
        }
    }
}

/**
 * Docker 版递归目录处理。
 *
 * 与 Tauri 版差异：
 * - readDir 返回 string[]（文件名列表），无 isFile/isDirectory 标志
 * - 用 listFilesRecursive 获取全部文件路径（含子目录），再提取文件名
 * - 不需要递归遍历子目录（listFilesRecursive 已做）
 */
async function processDirDocker(dir: string,
                                txtAsSrt: boolean,
                                lang: string | undefined,
                                result: Map<string, ResInfo[]>,
                                stat: Map<string, number>) {
    const fs = getDefaultFileSystem();
    // 规范化目录路径（去掉前缀 dataRoot 如 /data）
    const normDir = pathNormalize(dir);
    // Docker 后端 listFilesRecursive 返回绝对路径列表
    const allFiles = await fs.listFilesRecursive(normDir);

    for (const fullPath of allFiles) {
        // 提取文件名（最后一部分）
        const parts = fullPath.split(/[\\/]/);
        const name = parts[parts.length - 1];
        if (name.endsWith(".meta")) continue;

        const idx = findKeyEndIndex(name);
        if (idx == -1) {
            console.log(`ignore  ${fullPath}`);
        } else {
            const extIdx = name.lastIndexOf('.');
            if (extIdx == -1) {
                console.log(`ignore ${fullPath}`);
            } else {
                const ext = name.substring(extIdx).toLowerCase();
                let type: ResType = 'other';
                let thisLang;
                if (ext in ext2type) {
                    type = ext2type[ext];
                } else if (txtAsSrt && ext == '.txt') {
                    type = 'subtitles';
                    thisLang = lang
                }

                const key = name.substring(0, idx);
                const value = result.get(key);
                const resInfo: ResInfo = {type, name, path: fullPath, lang: thisLang};
                if (value) {
                    value.push(resInfo);
                } else {
                    result.set(key, [resInfo]);
                }

                const extCnt = stat.get(ext);
                let cnt = 1;
                if (extCnt) {
                    cnt += extCnt;
                }
                stat.set(ext, cnt);
            }
        }
    }
}

function packTracks(resInfos: ResInfo[]): ResInfo[] {
    if (resInfos.length == 1) {
        return resInfos;
    }
    const videos = [];
    const audios: (ResInfo & { _picked?: boolean }) [] = [];
    const subtitles: (ResInfo & { _picked?: boolean }) [] = [];
    const imageAndOthers = [];
    for (const r of resInfos) {
        switch (r.type) {
            case "video":
                videos.push(r);
                break;
            case "audio":
                audios.push(r);
                break;
            case "subtitles":
                subtitles.push(r);
                break;
            default:
                imageAndOthers.push(r);
                break;
        }
    }
    if (videos.length == 0 || (audios.length == 0 && subtitles.length == 0)) {
        return resInfos;
    }

    videos.sort((a, b) => b.name.length - a.name.length);
    let picked = 0;
    for (const v of videos) {
        const idx = v.name.lastIndexOf('.');
        if (idx != -1) {
            const noExtName = v.name.substring(0, idx);
            for (const a of audios) {
                if (!a._picked && a.name.startsWith(noExtName)) {
                    const at: ResAudioTrack = {name: a.name, path: a.path};
                    if (v.audioTracks) {
                        v.audioTracks.push(at);
                    } else {
                        v.audioTracks = [at];
                    }
                    a._picked = true;
                    picked++;
                }
            }
            for (const s of subtitles) {
                if (!s._picked && s.name.startsWith(noExtName)) {
                    const st: ResSubtitlesTrack = {name: s.name, path: s.path, lang: s.lang ?? 'zh'};
                    if (v.subtitlesTracks) {
                        v.subtitlesTracks.push(st);
                    } else {
                        v.subtitlesTracks = [st];
                    }
                    s._picked = true;
                    picked++;
                }
            }
        }
    }
    if (picked == 0) {
        return resInfos;
    }

    const result: ResInfo[] = videos.reverse();
    for (const a of audios) {
        if (!a._picked) {
            result.push(a);
        }
    }
    for (const s of subtitles) {
        if (!s._picked) {
            result.push(s);
        }
    }
    result.push(...imageAndOthers);
    return result;
}

function packAllTracks(raws: Map<string, ResInfo[]>) {
    const packed = new Map<string, ResInfo[]>();
    for (const [key, resInfos] of raws.entries()) {
        packed.set(key, packTracks(resInfos));
    }
    return packed;
}

let alreadyRead = false;

export function invalidateResInfos() {
    refetchResInfoCache();
    alreadyRead = false;
}

export async function readResInfosAsync() {
    if (alreadyRead) {
        return true;
    }
    alreadyRead = true;
    readStoreStateOnce();
    if (!isTauri() && !isDockerMode()) {
        return true;
    }

    const {tauriConf} = getMyStore();
    try {
        const result = new Map<string, ResInfo[]>();
        const stat = new Map<string, number>();

        if (isDockerMode()) {
            // Docker 网页版：用 BrowserFsApi 扫描资源目录
            // Docker 后端没有 resourceDir() 概念，用 dataRoot 作为 resourceDir
            const dataRoot = localStorage.getItem('dataDir') || '/data';
            setResourceDir(dataRoot);

            for (const resDir of tauriConf.resDirs) {
                let dir = resDir.dir;
                if (dir.startsWith('.')) {
                    dir = pathJoin(dataRoot, dir);
                }
                try {
                    await processDirDocker(dir, !!resDir.txtAsSrt, resDir.lang, result, stat);
                } catch (reason: unknown) {
                    console.error(reason);
                }
            }
        } else {
            // Tauri 桌面端：用 plugin-fs 扫描资源目录
            const baseDir = await path.resourceDir();
            setResourceDir(baseDir);

            for (const resDir of tauriConf.resDirs) {
                let dir = resDir.dir;
                if (dir.startsWith('.')) {
                    dir = await path.join(baseDir, dir);
                }
                try {
                    await processDirRecursively(dir, !!resDir.txtAsSrt, resDir.lang, result, stat);
                } catch (reason: unknown) {
                    console.error(reason);
                }
            }
        }

        const packed = packAllTracks(result);
        setResMap(packed);
        // console.log(`read res file for ${packed.size} node`, packed, stat);
        return true;
    } catch (e) {
        // 读失败：复位守卫放行重试（对照 readPrefAsyncOnce），避免启动期一次瞬时失败后 resMap 永久为空。
        // re-throw 让上层感知失败；invalidateResInfos 仍负责主动失效
        alreadyRead = false;
        throw e;
    }
}

