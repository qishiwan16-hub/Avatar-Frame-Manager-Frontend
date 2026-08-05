//name: 头像框管理器
//原作者：毛毛雨Rain，二改：祀骨祈Meoroll。

(async function() {
    // ===========================
    // 0. 全局配置区
    // ===========================
    const SCRIPT_NAME = "头像框管理"; 
    const SCRIPT_VERSION = '2.7.0';
    const STYLE_ID = 'native-avatar-frame-style'; 
    const APPLIED_STYLE_ID = 'st-avatar-frame-applied-css';
    const MENU_BTN_ID = 'st-avatar-frame-ext-btn';
    const INITIAL_SCRIPT_URL = document.currentScript && document.currentScript.src || '';
    const DARK_MODE_STORAGE_KEY = 'ST_AFM_DarkMode';
    
    // 数据库配置
    const DB_NAME = 'ST_AvatarFrameDB';
    const STORE_NAME = 'frame_store';
    const DATA_KEY = 'frame_data_v2';
    const DEFAULT_CONFIG = { top: -15, left: -15, width: 130, height: 130 };
    const DEFAULT_GROUP = '未分组';

    function normalizeBindingSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        const normalized = { ...DEFAULT_CONFIG };
        ['top', 'left', 'width', 'height'].forEach(key => {
            const value = Number(source[key]);
            if (Number.isFinite(value)) normalized[key] = value;
        });
        return normalized;
    }

    function normalizeThemeBindings(bindings) {
        if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return {};
        const normalized = {};
        Object.entries(bindings).forEach(([rawId, rawBinding]) => {
            const binding = rawBinding && typeof rawBinding === 'object' ? rawBinding : {};
            const themeId = String(binding.themeId || rawId || '').trim();
            if (!themeId) return;
            normalized[themeId] = {
                themeId,
                themeName: String(binding.themeName || themeId).trim() || themeId,
                userFrameSrc: String(binding.userFrameSrc || binding.frameSrc || binding.src || '').trim(),
                charFrameSrc: String(binding.charFrameSrc || '').trim(),
                userSettings: normalizeBindingSettings(binding.userSettings || binding.settings),
                charSettings: normalizeBindingSettings(binding.charSettings),
                updatedAt: Number(binding.updatedAt) || Date.now()
            };
        });
        return normalized;
    }

    function clearFrameFromThemeBindings(data, role, frameSrc) {
        if (!data || !data.themeBindings || !frameSrc) return;
        const key = role === 'char' ? 'charFrameSrc' : 'userFrameSrc';
        Object.keys(data.themeBindings).forEach(themeId => {
            const binding = data.themeBindings[themeId];
            if (binding[key] === frameSrc) binding[key] = '';
            if (!binding.userFrameSrc && !binding.charFrameSrc) delete data.themeBindings[themeId];
        });
    }

    function normalizeFrameList(list) {
        const now = Date.now();
        if (!Array.isArray(list)) return [];
        let maxOrder = list.reduce((max, item) => Math.max(max, Number(item && item.order) || 0), 0);
        return list.map((item, index) => {
            const frame = item && typeof item === 'object' ? item : {};
            if (!frame.src) frame.src = '';
            if (!frame.name) frame.name = `头像框 ${index + 1}`;
            frame.favorite = !!frame.favorite;
            frame.group = (typeof frame.group === 'string' && frame.group.trim()) ? frame.group.trim() : DEFAULT_GROUP;
            frame.createdAt = Number(frame.createdAt) || (now + index);
            frame.order = Number(frame.order) || (++maxOrder);
            return frame;
        });
    }

    function normalizeFrameData(data) {
        if (!data || typeof data !== 'object') data = {};
        data.userFrames = normalizeFrameList(data.userFrames);
        data.charFrames = normalizeFrameList(data.charFrames);
        if (!data.userSettings) data.userSettings = { ...DEFAULT_CONFIG };
        if (!data.charSettings) data.charSettings = { ...DEFAULT_CONFIG };
        if (!data.pseudoTarget) data.pseudoTarget = 'after';
        data.userSettings = normalizeBindingSettings(data.userSettings);
        data.charSettings = normalizeBindingSettings(data.charSettings);
        data.themeBindings = normalizeThemeBindings(data.themeBindings);
        return data;
    }

    function getSillyTavernContext() {
        try {
            if (typeof getContext === 'function') return getContext() || {};
        } catch (error) {}
        try {
            if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') return window.SillyTavern.getContext() || {};
        } catch (error) {}
        return {};
    }

    function getCurrentThemeSnapshot() {
        const context = getSillyTavernContext();
        const $themeSelect = $('#themes').first();
        const selectedId = $themeSelect.length ? String($themeSelect.val() || '').trim() : '';
        const selectedName = $themeSelect.length ? String($themeSelect.find('option:selected').text() || '').trim() : '';
        const themeId = String(
            selectedId || context.powerUserSettings?.theme || context.power_user?.theme || window.power_user?.theme || ''
        ).trim();
        const themeName = String(selectedName || themeId).trim() || themeId;
        return { id: themeId, name: themeName };
    }

    function getFrameNameFromFile(file, fallbackIndex) {
        const rawName = file && file.name ? String(file.name).trim() : '';
        const withoutExt = rawName.replace(/\.[^/.\\]+$/, '').trim();
        return withoutExt || rawName || `头像框 ${fallbackIndex || 1}`;
    }

    function getRoleLabel(role) {
        return role === 'user' ? 'User' : 'Char';
    }

    async function askImportTarget(activeRole, importItems, previewDialog) {
        const activeLabel = getRoleLabel(activeRole);
        const result = await previewDialog({
            title: '选择导入目标',
            message: `已选择 ${importItems.length} 张图片，可先预览、改名或删除误选项。`,
            items: importItems,
            options: [
                { value: 'current', label: `当前列表（${activeLabel}）`, icon: 'fa-solid fa-location-dot' },
                { value: 'user', label: 'User', icon: 'fa-solid fa-user' },
                { value: 'char', label: 'Char', icon: 'fa-solid fa-robot' },
                { value: 'both', label: 'User + Char', icon: 'fa-solid fa-people-arrows' }
            ]
        });
        if (!result || !result.value || !result.items || result.items.length === 0) return null;
        let roles = null;
        if (result.value === 'current') roles = [activeRole];
        if (result.value === 'user') roles = ['user'];
        if (result.value === 'char') roles = ['char'];
        if (result.value === 'both') roles = ['user', 'char'];
        return roles ? { roles, items: result.items } : null;
    }

    function formatBackupTime(date = new Date()) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
    }

    function makeBackupZipName(prefix, suffix = '总备份') {
        const safePrefix = sanitizeFileName(prefix || '头像框备份');
        const safeSuffix = sanitizeFileName(suffix || '总备份');
        return `${safePrefix}-${formatBackupTime()}-${safeSuffix}.zip`;
    }


    // ===========================
    // 1. 数据逻辑层
    // ===========================
    const BACKEND_BASE_URL = '/api/plugins/avatar-frame-manager';
    const BACKEND_PENDING_SYNC_KEY = 'afm_backend_pending_sync_v1';

    function cloneFrameData(data) {
        return JSON.parse(JSON.stringify(data));
    }

    function getBackendRequestHeaders() {
        const context = getSillyTavernContext();
        try {
            if (typeof context.getRequestHeaders === 'function') return context.getRequestHeaders();
        } catch (error) {}
        try {
            if (typeof window.getRequestHeaders === 'function') return window.getRequestHeaders();
        } catch (error) {}
        const headers = { 'Content-Type': 'application/json' };
        if (window.token) headers['X-CSRF-Token'] = window.token;
        return headers;
    }

    async function requestBackend(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);
        try {
            const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
                method: options.method || 'GET',
                headers: getBackendRequestHeaders(),
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: controller.signal,
                cache: 'no-store'
            });
            if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
            return response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    const LocalDataStore = {
        _db: null,
        _init: function() {
            return new Promise((resolve, reject) => {
                if (this._db) return resolve(this._db);
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = e => { e.target.result.createObjectStore(STORE_NAME); };
                req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
                req.onerror = () => reject("IndexedDB 初始化失败");
            });
        },
        load: async function() {
            const db = await this._init();
            let shouldPersist = false;
            let data = await new Promise(resolve => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(DATA_KEY);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });

            // 兼容旧版 LocalStorage
            if (!data) {
                const oldData = localStorage.getItem('st_avatar_frame_data_v1');
                if (oldData) {
                    try { data = JSON.parse(oldData); } catch(e){}
                    if (data) { await this.save(data); localStorage.removeItem('st_avatar_frame_data_v1'); }
                }
            }
            // 初始化默认值并兼容旧数据结构
            if (!data) {
                data = {
                    userFrames: [], charFrames: [],
                    activeUserSrc: null, activeCharSrc: null, pseudoTarget: 'after',
                    userSettings: { ...DEFAULT_CONFIG }, charSettings: { ...DEFAULT_CONFIG }
                };
                shouldPersist = true;
            }
            data = normalizeFrameData(data);
            if (shouldPersist) await this.save(data);
            return data;
        },
        save: async function(data) {
            data = normalizeFrameData(data);
            const db = await this._init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const req = tx.objectStore(STORE_NAME).put(data, DATA_KEY);
                req.onsuccess = () => resolve();
                req.onerror = () => { if (window.toastr) toastr.error("存储出错！"); reject(); };
            });
        }
    };

    const DataManager = {
        _mode: 'unknown',
        _cache: null,
        _detectPromise: null,
        _saveQueue: Promise.resolve(),
        _detectBackend: async function() {
            if (this._mode !== 'unknown') return this._mode === 'server';
            if (!this._detectPromise) {
                this._detectPromise = requestBackend('/status', { timeout: 2500 })
                    .then(result => {
                        this._mode = result && result.ok ? 'server' : 'local';
                        return this._mode === 'server';
                    })
                    .catch(() => {
                        this._mode = 'local';
                        return false;
                    });
            }
            return this._detectPromise;
        },
        _loadServer: async function() {
            const result = await requestBackend('/data');
            if (!result || !result.ok) throw new Error('头像框后端返回了无效数据');
            let data = normalizeFrameData(result.data);
            const pendingSync = localStorage.getItem(BACKEND_PENDING_SYNC_KEY) === '1';
            if (!data.schemaVersion || pendingSync) {
                const localData = await LocalDataStore.load();
                const hasLocalData = localData.userFrames.length > 0 || localData.charFrames.length > 0 || Object.keys(localData.themeBindings || {}).length > 0;
                if (hasLocalData || pendingSync) {
                    data = await this._saveServer(localData);
                    localStorage.removeItem(BACKEND_PENDING_SYNC_KEY);
                    if (!result.data?.schemaVersion && window.toastr) toastr.success('本地头像框已迁移到酒馆后端');
                }
            }
            this._cache = normalizeFrameData(data);
            await LocalDataStore.save(this._cache).catch(() => {});
            return cloneFrameData(this._cache);
        },
        _saveServer: async function(data) {
            const result = await requestBackend('/data', { method: 'PUT', body: normalizeFrameData(data), timeout: 30000 });
            if (!result || !result.ok || !result.data) throw new Error('头像框后端保存失败');
            return normalizeFrameData(result.data);
        },
        load: async function() {
            if (this._cache) return cloneFrameData(this._cache);
            if (await this._detectBackend()) {
                try {
                    return await this._loadServer();
                } catch (error) {
                    console.warn('[头像框管理器] 后端读取失败，临时使用 IndexedDB', error);
                    this._mode = 'local';
                }
            }
            this._cache = normalizeFrameData(await LocalDataStore.load());
            return cloneFrameData(this._cache);
        },
        save: async function(data) {
            const task = async () => {
                const normalized = normalizeFrameData(data);
                if (await this._detectBackend()) {
                    try {
                        const saved = await this._saveServer(normalized);
                        Object.keys(data).forEach(key => delete data[key]);
                        Object.assign(data, cloneFrameData(saved));
                        this._cache = saved;
                        localStorage.removeItem(BACKEND_PENDING_SYNC_KEY);
                        await LocalDataStore.save(saved).catch(() => {});
                        return;
                    } catch (error) {
                        console.warn('[头像框管理器] 后端保存失败，保留到 IndexedDB', error);
                        localStorage.setItem(BACKEND_PENDING_SYNC_KEY, '1');
                        if (window.toastr) toastr.warning('后端保存失败，当前修改已暂存到浏览器');
                    }
                }
                this._cache = normalized;
                await LocalDataStore.save(normalized);
            };
            const next = this._saveQueue.then(task, task);
            this._saveQueue = next.catch(() => {});
            return next;
        },
        getStorageMode: function() {
            return this._mode;
        }
    };

    function downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function sanitizeFileName(name) {
        return String(name || 'avatar-frame').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'avatar-frame';
    }

    async function blobToUint8Array(blob) {
        return new Uint8Array(await blob.arrayBuffer());
    }

    async function dataUrlToBlob(source) {
        const value = String(source || '');
        if (!value.startsWith('data:')) {
            try {
                const response = await fetch(value);
                return response.ok ? await response.blob() : new Blob([], { type: 'application/octet-stream' });
            } catch (error) {
                return new Blob([], { type: 'application/octet-stream' });
            }
        }
        const parts = value.split(',');
        if (parts.length < 2) return new Blob([], { type: 'application/octet-stream' });
        const mimeMatch = parts[0].match(/data:([^;]+)/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const binary = atob(parts.slice(1).join(','));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    async function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
            reader.readAsDataURL(blob);
        });
    }

    function getImageExtFromDataUrl(dataUrl) {
        const mime = (String(dataUrl || '').match(/^data:([^;]+)/) || [])[1] || '';
        if (mime.includes('png')) return 'png';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('webp')) return 'webp';
        if (mime.includes('svg')) return 'svg';
        return 'png';
    }

    const AFM_CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) crc = AFM_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function writeU16(arr, value) { arr.push(value & 255, (value >>> 8) & 255); }
    function writeU32(arr, value) { arr.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }

    async function createStoredZip(entries) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        for (const entry of entries) {
            const nameBytes = encoder.encode(entry.name);
            const dataBytes = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data || ''));
            const crc = crc32(dataBytes);
            const local = [];
            writeU32(local, 0x04034b50); writeU16(local, 20); writeU16(local, 0x0800); writeU16(local, 0); writeU16(local, 0); writeU16(local, 0);
            writeU32(local, crc); writeU32(local, dataBytes.length); writeU32(local, dataBytes.length); writeU16(local, nameBytes.length); writeU16(local, 0);
            localParts.push(new Uint8Array(local), nameBytes, dataBytes);
            const central = [];
            writeU32(central, 0x02014b50); writeU16(central, 20); writeU16(central, 20); writeU16(central, 0x0800); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0);
            writeU32(central, crc); writeU32(central, dataBytes.length); writeU32(central, dataBytes.length); writeU16(central, nameBytes.length); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0); writeU32(central, 0); writeU32(central, offset);
            centralParts.push(new Uint8Array(central), nameBytes);
            offset += 30 + nameBytes.length + dataBytes.length;
        }
        const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
        const end = [];
        writeU32(end, 0x06054b50); writeU16(end, 0); writeU16(end, 0); writeU16(end, entries.length); writeU16(end, entries.length); writeU32(end, centralSize); writeU32(end, offset); writeU16(end, 0);
        return new Blob([...localParts, ...centralParts, new Uint8Array(end)], { type: 'application/zip' });
    }

    async function parseStoredZip(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoder = new TextDecoder();
        const files = {};
        let pos = 0;
        const readU16 = (p) => bytes[p] | (bytes[p + 1] << 8);
        const readU32 = (p) => (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0;
        while (pos + 30 <= bytes.length) {
            const sig = readU32(pos);
            if (sig !== 0x04034b50) break;
            const method = readU16(pos + 8);
            const compSize = readU32(pos + 18);
            const nameLen = readU16(pos + 26);
            const extraLen = readU16(pos + 28);
            const nameStart = pos + 30;
            const dataStart = nameStart + nameLen + extraLen;
            const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
            if (method !== 0) throw new Error('备份 ZIP 使用了不支持的压缩方式，请导入本插件导出的备份 ZIP');
            files[name] = bytes.slice(dataStart, dataStart + compSize);
            pos = dataStart + compSize;
        }
        return files;
    }

    async function inflateZipEntry(bytes) {
        if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持解压普通 ZIP，请更新浏览器或酒馆 WebView');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function extractGifItemsFromZip(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const readU16 = pos => bytes[pos] | (bytes[pos + 1] << 8);
        const readU32 = pos => (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
        const minEocd = Math.max(0, bytes.length - 65557);
        let eocd = -1;
        for (let pos = bytes.length - 22; pos >= minEocd; pos--) {
            if (readU32(pos) === 0x06054b50) { eocd = pos; break; }
        }
        if (eocd < 0) throw new Error(`“${file.name}”不是有效的 ZIP 文件`);
        const entryCount = readU16(eocd + 10);
        let centralPos = readU32(eocd + 16);
        const utf8 = new TextDecoder('utf-8');
        const items = [];
        let totalBytes = 0;
        for (let index = 0; index < entryCount; index++) {
            if (centralPos + 46 > bytes.length || readU32(centralPos) !== 0x02014b50) throw new Error('ZIP 中央目录损坏或使用了不支持的 ZIP64 格式');
            const flags = readU16(centralPos + 8);
            const method = readU16(centralPos + 10);
            const compressedSize = readU32(centralPos + 20);
            const uncompressedSize = readU32(centralPos + 24);
            const nameLength = readU16(centralPos + 28);
            const extraLength = readU16(centralPos + 30);
            const commentLength = readU16(centralPos + 32);
            const localOffset = readU32(centralPos + 42);
            const nameBytes = bytes.slice(centralPos + 46, centralPos + 46 + nameLength);
            const entryName = utf8.decode(nameBytes).replace(/\\/g, '/');
            centralPos += 46 + nameLength + extraLength + commentLength;
            if (!/\.gif$/i.test(entryName) || entryName.endsWith('/') || /(^|\/)__MACOSX\//i.test(entryName)) continue;
            if (flags & 0x0001) throw new Error(`ZIP 内的“${entryName}”已加密，无法导入`);
            if (items.length >= 500) throw new Error('单个 ZIP 最多导入 500 个 GIF 文件');
            if (!uncompressedSize || uncompressedSize > 20 * 1024 * 1024) throw new Error(`“${entryName}”为空或超过 20 MB`);
            totalBytes += uncompressedSize;
            if (totalBytes > 300 * 1024 * 1024) throw new Error('ZIP 内 GIF 解压后总大小不能超过 300 MB');
            if (localOffset + 30 > bytes.length || readU32(localOffset) !== 0x04034b50) throw new Error(`“${entryName}”的 ZIP 条目损坏`);
            const localNameLength = readU16(localOffset + 26);
            const localExtraLength = readU16(localOffset + 28);
            const dataStart = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = bytes.slice(dataStart, dataStart + compressedSize);
            let data;
            if (method === 0) data = compressed;
            else if (method === 8) data = await inflateZipEntry(compressed);
            else throw new Error(`“${entryName}”使用了不支持的 ZIP 压缩方式`);
            if (data.length !== uncompressedSize) throw new Error(`“${entryName}”解压后的大小不正确`);
            const signature = String.fromCharCode(...data.slice(0, 12));
            let mime = '';
            if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) mime = 'image/gif';
            else if (data[0] === 0x89 && signature.slice(1, 4) === 'PNG') mime = 'image/png';
            else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mime = 'image/jpeg';
            else if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') mime = 'image/webp';
            else if (signature.startsWith('BM')) mime = 'image/bmp';
            if (!mime) continue;
            const blob = new Blob([data], { type: mime });
            const baseName = entryName.split('/').pop() || `头像框${items.length + 1}.gif`;
            const previewUrl = URL.createObjectURL(blob);
            items.push({ src: previewUrl, previewUrl, blob, name: getFrameNameFromFile({ name: baseName }, items.length + 1) });
        }
        return items;
    }

    async function mapWithConcurrency(items, concurrency, mapper) {
        const results = new Array(items.length);
        let cursor = 0;
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                results[index] = await mapper(items[index], index);
            }
        });
        await Promise.all(workers);
        return results;
    }

    async function persistImportedImages(items) {
        const useBackend = await DataManager._detectBackend();
        return mapWithConcurrency(items, useBackend ? 3 : 4, async item => {
            if (!item.blob) return { ...item };
            const dataUrl = await blobToDataUrl(item.blob);
            if (useBackend) {
                try {
                    const stored = await requestBackend('/images', { method: 'POST', body: { dataUrl }, timeout: 45000 });
                    if (stored && stored.ok && stored.url) return { ...item, src: stored.url };
                } catch (error) {
                    console.warn('[头像框管理器] 后端保存导入图片失败，交由配置保存流程重试', error);
                }
            }
            return { ...item, src: dataUrl };
        });
    }

    function releaseImportPreviews(items) {
        (items || []).forEach(item => {
            if (!item.previewUrl) return;
            try { URL.revokeObjectURL(item.previewUrl); } catch (error) {}
        });
    }

    async function buildBackupZip(data, selectedRole = null, selectedIndexSet = null) {
        const normalized = normalizeFrameData(JSON.parse(JSON.stringify(data || {})));
        const pickFrames = (role, frames) => {
            if (!selectedRole) return frames;
            if (selectedRole !== role) return [];
            if (!selectedIndexSet) return frames;
            return frames.filter((_, index) => selectedIndexSet.has(index));
        };
        const isUserScope = !selectedRole || selectedRole === 'user';
        const isCharScope = !selectedRole || selectedRole === 'char';
        const backup = {
            plugin: 'st-avatar-frame-manager',
            version: 1,
            exportedAt: new Date().toISOString(),
            scope: selectedRole || 'all',
            userFrames: isUserScope ? pickFrames('user', normalized.userFrames) : [],
            charFrames: isCharScope ? pickFrames('char', normalized.charFrames) : [],
            activeUserSrc: isUserScope ? normalized.activeUserSrc : null,
            activeCharSrc: isCharScope ? normalized.activeCharSrc : null,
            userSettings: isUserScope ? normalized.userSettings : null,
            charSettings: isCharScope ? normalized.charSettings : null,
            pseudoTarget: normalized.pseudoTarget,
            themeBindings: normalized.themeBindings
        };
        const settingsBackup = {
            pseudoTarget: backup.pseudoTarget
        };
        if (backup.userSettings) settingsBackup.userSettings = backup.userSettings;
        if (backup.charSettings) settingsBackup.charSettings = backup.charSettings;
        settingsBackup.themeBindings = backup.themeBindings;
        const imageReplacements = new Map();
        const hydrateImages = async frames => {
            for (const frame of frames || []) {
                if (!frame || !frame.src || String(frame.src).startsWith('data:')) continue;
                try {
                    const original = String(frame.src);
                    const blob = await dataUrlToBlob(frame.src);
                    if (blob.size > 0) {
                        frame.src = await blobToDataUrl(blob);
                        imageReplacements.set(original, frame.src);
                    }
                } catch (error) {}
            }
        };
        await hydrateImages(backup.userFrames);
        await hydrateImages(backup.charFrames);
        const replaceImageReferences = value => {
            if (typeof value === 'string') return imageReplacements.get(value) || value;
            if (Array.isArray(value)) return value.map(replaceImageReferences);
            if (!value || typeof value !== 'object') return value;
            Object.keys(value).forEach(key => { value[key] = replaceImageReferences(value[key]); });
            return value;
        };
        replaceImageReferences(backup);
        const entries = [
            { name: 'avatar-frame-backup.json', data: JSON.stringify(backup, null, 2) },
            { name: 'config/avatar-frame-settings.json', data: JSON.stringify(settingsBackup, null, 2) }
        ];
        const addImages = async (role, frames) => {
            for (let i = 0; i < frames.length; i++) {
                const frame = frames[i];
                if (!frame.src || !String(frame.src).startsWith('data:')) continue;
                const ext = getImageExtFromDataUrl(frame.src);
                entries.push({ name: `images/${role}/${String(i + 1).padStart(3, '0')}_${sanitizeFileName(frame.name)}.${ext}`, data: await blobToUint8Array(await dataUrlToBlob(frame.src)) });
            }
        };
        if (isUserScope) await addImages('user', backup.userFrames);
        if (isCharScope) await addImages('char', backup.charFrames);
        return createStoredZip(entries);
    }

    async function importPluginBackupZip(file) {
        const files = await parseStoredZip(file);
        if (!files['avatar-frame-backup.json']) throw new Error('未找到 avatar-frame-backup.json，这不是本插件导出的备份 ZIP');
        const text = new TextDecoder().decode(files['avatar-frame-backup.json']);
        const json = JSON.parse(text);
        if (json.plugin !== 'st-avatar-frame-manager') throw new Error('备份标识不匹配，仅允许导入本插件导出的备份 ZIP');
        return normalizeFrameData(json);
    }

    // ===========================
    // 2. 核心 CSS 注入逻辑
    // ===========================
    async function applyInjectedCSS(sourceData = null) {
        const data = normalizeFrameData(sourceData || await DataManager.load());
        $(`#${APPLIED_STYLE_ID}`).remove();
        let css = '';

        const u = data.userSettings;
        const c = data.charSettings;
        const pseudo = data.pseudoTarget || 'after';

        const cssUrl = (src) => `url("${String(src || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
        const getBackgroundRule = (src) => `background: transparent ${cssUrl(src)} center / contain no-repeat !important; background-image: ${cssUrl(src)} !important;`;
        const getRule = (settings) => `
            content: "" !important;
            background-color: transparent !important;
            background-size: contain !important;
            background-repeat: no-repeat !important;
            background-position: center !important;
            border: 0 !important;
            box-shadow: none !important;
            filter: none !important;
            position: absolute !important;
            top: ${settings.top}% !important;
            left: ${settings.left}% !important;
            width: ${settings.width}% !important;
            height: ${settings.height}% !important;
            pointer-events: none !important;
            z-index: 10 !important;
        `;

        if (data.activeUserSrc) css += `\n.mes[is_user="true"] .avatar::${pseudo} { ${getBackgroundRule(data.activeUserSrc)} ${getRule(u)} }`;
        // Via 浏览器的 WebView 对 :not([attr=...]) + 伪元素组合选择器兼容性较差，
        // 会导致整条 char 规则失效；拆成多条简单选择器，并保留原版的精确选择器作为第一条。
        if (data.activeCharSrc) {
            const charRule = `${getBackgroundRule(data.activeCharSrc)} ${getRule(c)}`;
            css += `
.mes[is_user="false"] .avatar::${pseudo} { ${charRule} }`;
            css += `
.mes:not([is_user="true"]) .avatar::${pseudo} { ${charRule} }`;
            css += `
.mes:not([is_user]) .avatar::${pseudo} { ${charRule} }`;
        }

        if (css) $('head').append(`<style id="${APPLIED_STYLE_ID}">${css}</style>`);
    }

    let lastThemeBindingId = null;
    let pendingThemeBindingId = null;
    let themeBindingWatcherInitialized = false;
    let themeBindingSyncPromise = Promise.resolve();

    function bindingSettingsEqual(left, right) {
        const a = normalizeBindingSettings(left);
        const b = normalizeBindingSettings(right);
        return ['top', 'left', 'width', 'height'].every(key => Number(a[key]) === Number(b[key]));
    }

    async function syncThemeBinding() {
        const theme = getCurrentThemeSnapshot();
        if (!theme.id || theme.id === lastThemeBindingId || theme.id === pendingThemeBindingId) return;
        pendingThemeBindingId = theme.id;
        lastThemeBindingId = theme.id;
        themeBindingSyncPromise = themeBindingSyncPromise.then(async () => {
            const data = await DataManager.load();
            const binding = data.themeBindings[theme.id];
            const userFrameExists = binding && binding.userFrameSrc && data.userFrames.some(frame => frame.src === binding.userFrameSrc);
            const charFrameExists = binding && binding.charFrameSrc && data.charFrames.some(frame => frame.src === binding.charFrameSrc);
            const nextUserFrameSrc = userFrameExists ? binding.userFrameSrc : null;
            const nextCharFrameSrc = charFrameExists ? binding.charFrameSrc : null;
            const nextUserSettings = userFrameExists ? normalizeBindingSettings(binding.userSettings) : data.userSettings;
            const nextCharSettings = charFrameExists ? normalizeBindingSettings(binding.charSettings) : data.charSettings;
            const changed = data.activeUserSrc !== nextUserFrameSrc || data.activeCharSrc !== nextCharFrameSrc ||
                (userFrameExists && !bindingSettingsEqual(data.userSettings, nextUserSettings)) ||
                (charFrameExists && !bindingSettingsEqual(data.charSettings, nextCharSettings));
            if (changed) {
                data.activeUserSrc = nextUserFrameSrc;
                data.activeCharSrc = nextCharFrameSrc;
                if (userFrameExists) data.userSettings = nextUserSettings;
                if (charFrameExists) data.charSettings = nextCharSettings;
                await DataManager.save(data);
            }
            await applyInjectedCSS(data);
            if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('afm-theme-binding-applied', { detail: theme }));
        }).catch(error => console.warn('[头像框管理器] 美化绑定同步失败', error)).finally(() => {
            pendingThemeBindingId = null;
        });
        return themeBindingSyncPromise;
    }

    function installThemeBindingWatcher() {
        if (window.__afmThemeBindingWatcherTimer) clearInterval(window.__afmThemeBindingWatcherTimer);
        if (window.__afmThemeBindingDebounceTimer) clearTimeout(window.__afmThemeBindingDebounceTimer);
        const scheduleSync = () => {
            const expectedThemeId = getCurrentThemeSnapshot().id;
            if (!expectedThemeId) return;
            if (!themeBindingWatcherInitialized) {
                lastThemeBindingId = expectedThemeId;
                themeBindingWatcherInitialized = true;
                return;
            }
            if (expectedThemeId === lastThemeBindingId) return;
            if (window.__afmThemeBindingDebounceTimer) clearTimeout(window.__afmThemeBindingDebounceTimer);
            window.__afmThemeBindingDebounceTimer = setTimeout(() => {
                const stableThemeId = getCurrentThemeSnapshot().id;
                if (stableThemeId === expectedThemeId && stableThemeId !== lastThemeBindingId) syncThemeBinding();
            }, 350);
        };
        const bindThemeSelector = () => {
            const $themes = $('#themes').first();
            if (!$themes.length) return;
            if (!$themes.data('afm-theme-watcher-bound')) {
                $themes.data('afm-theme-watcher-bound', true).off('change.afmThemeBinding').on('change.afmThemeBinding', scheduleSync);
            }
            if (!themeBindingWatcherInitialized) scheduleSync();
        };
        bindThemeSelector();
        window.__afmThemeBindingWatcherTimer = setInterval(bindThemeSelector, 1200);
    }

    const EXTENSION_RAW_MANIFEST_URL = 'https://raw.githubusercontent.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend/main/manifest.json';
    const EXTENSION_DEFAULT_FOLDER = 'Avatar-Frame-Manager-Frontend';
    const extensionUpdateState = {
        phase: 'idle',
        message: '点击检查 GitHub 是否有更新',
        canUpdate: false,
        latestVersion: '',
        extensionName: EXTENSION_DEFAULT_FOLDER,
        global: false
    };

    function getInstalledExtensionName() {
        const scripts = Array.from(document.scripts || []);
        const current = INITIAL_SCRIPT_URL || scripts.find(script => new RegExp(`/scripts/extensions/(?:third-party/)?${EXTENSION_DEFAULT_FOLDER}/index\\.js(?:[?#]|$)`, 'i').test(script.src || ''))?.src || '';
        if (!current) return EXTENSION_DEFAULT_FOLDER;
        const match = current.match(/\/scripts\/extensions\/(?:third-party\/)?([^/]+)\/index\.js(?:[?#]|$)/i);
        return match ? decodeURIComponent(match[1]) : EXTENSION_DEFAULT_FOLDER;
    }

    function getExtensionRequestHeaders() {
        const context = getSillyTavernContext();
        try {
            if (typeof context.getRequestHeaders === 'function') return context.getRequestHeaders();
        } catch (error) {}
        try {
            if (typeof window.getRequestHeaders === 'function') return window.getRequestHeaders();
        } catch (error) {}
        const headers = { 'Content-Type': 'application/json' };
        if (window.token) headers['X-CSRF-Token'] = window.token;
        return headers;
    }

    async function requestExtensionApi(endpoint, options = {}) {
        const names = Array.from(new Set([options.extensionName, getInstalledExtensionName(), EXTENSION_DEFAULT_FOLDER].filter(Boolean)));
        const scopes = options.global === undefined ? [false, true] : [!!options.global];
        let lastError = '扩展更新接口不可用';
        for (const extensionName of names) {
            for (const global of scopes) {
                const response = await fetch(`/api/extensions/${endpoint}`, {
                    method: 'POST',
                    headers: getExtensionRequestHeaders(),
                    body: JSON.stringify({ extensionName, global })
                });
                if (response.ok) return { data: await response.json(), extensionName, global };
                const text = await response.text();
                lastError = text || response.statusText || lastError;
                if (response.status !== 404) break;
            }
        }
        throw new Error(lastError);
    }

    async function getLatestManifestVersion() {
        try {
            const response = await fetch(`${EXTENSION_RAW_MANIFEST_URL}?afm=${Date.now()}`);
            if (!response.ok) return '';
            const manifest = await response.json();
            return String(manifest.version || '').trim();
        } catch (error) {
            return '';
        }
    }

    async function checkExtensionUpdate() {
        extensionUpdateState.phase = 'checking';
        extensionUpdateState.message = '正在检查 GitHub 更新...';
        extensionUpdateState.canUpdate = false;
        try {
            const result = await requestExtensionApi('version');
            extensionUpdateState.extensionName = result.extensionName;
            extensionUpdateState.global = result.global;
            extensionUpdateState.latestVersion = await getLatestManifestVersion();
            extensionUpdateState.canUpdate = result.data.isUpToDate === false;
            extensionUpdateState.phase = extensionUpdateState.canUpdate ? 'available' : 'latest';
            extensionUpdateState.message = extensionUpdateState.canUpdate
                ? `发现新版本${extensionUpdateState.latestVersion ? ` v${extensionUpdateState.latestVersion}` : ''}`
                : `当前已是最新版本 v${SCRIPT_VERSION}`;
        } catch (error) {
            extensionUpdateState.phase = 'error';
            extensionUpdateState.message = `检查失败：${error.message || error}`;
            extensionUpdateState.canUpdate = false;
        }
    }

    function waitForManagerMenu(timeout = 8000) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const check = () => {
                if ($(`#${MENU_BTN_ID}`).length) return resolve();
                if (Date.now() - startedAt >= timeout) return reject(new Error('扩展菜单未能重新初始化'));
                setTimeout(check, 100);
            };
            check();
        });
    }

    async function hotReloadUpdatedExtension() {
        if (window.__afmHotReloadPromise) return window.__afmHotReloadPromise;
        window.__afmHotReloadPromise = (async () => {
            if (typeof window.__afmHotCleanup === 'function') window.__afmHotCleanup();
            const scriptPattern = new RegExp(`/scripts/extensions/(?:third-party/)?${EXTENSION_DEFAULT_FOLDER}/index\\.js(?:[?#]|$)`, 'i');
            const scripts = Array.from(document.scripts || []).filter(item => scriptPattern.test(item.src || ''));
            const scriptUrl = INITIAL_SCRIPT_URL || (scripts[0] && scripts[0].src) || `/scripts/extensions/third-party/${EXTENSION_DEFAULT_FOLDER}/index.js`;
            const cacheBustedUrl = new URL(scriptUrl, document.baseURI || window.location.href);
            cacheBustedUrl.searchParams.set('afm_update', String(Date.now()));

            // Match SillyTavern's native extension loader: inject a fresh module script.
            scripts.forEach(script => script.remove());
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.type = 'module';
                script.async = true;
                script.src = cacheBustedUrl.href;
                script.onload = resolve;
                script.onerror = () => reject(new Error('重新加载扩展脚本失败'));
                document.body.appendChild(script);
            });
            try {
                await waitForManagerMenu();
            } catch (moduleError) {
                // Some embedded WebViews report module load success before the
                // async extension initializer completes. Evaluate the fetched
                // source as a fallback so the update still takes effect.
                const response = await fetch(cacheBustedUrl.href, { cache: 'no-store' });
                if (!response.ok) throw moduleError;
                const source = await response.text();
                try {
                    new Function(`${source}\n//# sourceURL=${cacheBustedUrl.href}`)();
                } catch (evaluationError) {
                    throw new Error(`${moduleError.message}；备用加载失败：${evaluationError.message || evaluationError}`);
                }
                await waitForManagerMenu();
            }
            $(`#${MENU_BTN_ID}`).trigger('click');
        })();
        try {
            await window.__afmHotReloadPromise;
        } finally {
            window.__afmHotReloadPromise = null;
        }
    }

    async function updateExtensionFromSettings() {
        extensionUpdateState.phase = 'updating';
        extensionUpdateState.message = '正在更新扩展...';
        extensionUpdateState.canUpdate = false;
        let result;
        try {
            result = await requestExtensionApi('update', {
                extensionName: extensionUpdateState.extensionName,
                global: extensionUpdateState.global
            });
            if (result.data.isUpToDate) {
                extensionUpdateState.phase = 'latest';
                extensionUpdateState.message = `当前已是最新版本 v${SCRIPT_VERSION}`;
                return;
            }
        } catch (error) {
            extensionUpdateState.phase = 'error';
            extensionUpdateState.message = `更新失败：${error.message || error}`;
            return;
        }

        try {
            if (window.toastr) toastr.success(`扩展已更新到 ${result.data.shortCommitHash || '最新提交'}`);
            await hotReloadUpdatedExtension();
        } catch (error) {
            extensionUpdateState.phase = 'error';
            extensionUpdateState.message = `扩展已更新，但无法热加载，请刷新页面：${error.message || error}`;
        }
    }
    
    await applyInjectedCSS();

    // ===========================
    // 3. 样式定义
    // ===========================
    $(`#${STYLE_ID}`).remove();
    $('head').append(`
        <style id="${STYLE_ID}">
            .nsk-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                z-index: 99999; background: transparent; 
            }
            .nsk-box {
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%); 
                width: 90%; max-width: 500px;
                height: 80vh; max-height: 800px;
                background-color: var(--SmartThemeBlurTintColor);
                backdrop-filter: blur(10px);
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15); 
                display: flex; flex-direction: column; overflow: hidden;
                animation: nsk-center-pop 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                font-family: sans-serif; color: var(--SmartThemeBodyColor);
            }
            @keyframes nsk-center-pop { 
                from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } 
                to   { opacity: 1; transform: translate(-50%, -50%) scale(1); } 
            }
            .nsk-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;
            }
            .nsk-title { font-weight: bold; font-size: 1.1em; display: flex; align-items: center; gap: 8px; }
            .nsk-version { font-size: 0.68em; line-height: 1; font-weight: 600; opacity: 0.58; padding: 4px 6px; border: 1px solid currentColor; border-radius: 6px; }
            .nsk-header-actions { display: flex; align-items: center; gap: 5px; }
            .nsk-theme-toggle {
                cursor: pointer; background: none; border: none; padding: 0; opacity: 0.55; font-size: 1.25em;
                display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;
                transition: 0.2s; border-radius: 50%; color: inherit;
            }
            .nsk-theme-toggle:hover { opacity: 1; background: rgba(0,0,0,0.05); color: var(--SmartThemeQuoteColor); }
            .nsk-close {
                cursor: pointer; background: none; border: none; padding: 0; opacity: 0.5; font-size: 1.4em;
                display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;
                transition: 0.2s; border-radius: 50%; color: inherit;
            }
            .nsk-close:hover { opacity: 1; background: rgba(0,0,0,0.05); color: var(--SmartThemeQuoteColor); }

            .nsk-overlay.afm-dark-mode .nsk-box,
            .nsk-overlay.afm-dark-mode .afm-modal-box {
                background-color: rgba(30,30,30,0.96) !important; color: #eee !important;
            }
            .nsk-overlay.afm-dark-mode .nsk-header,
            .nsk-overlay.afm-dark-mode .nsk-tabs,
            .nsk-overlay.afm-dark-mode #grid-container,
            .nsk-overlay.afm-dark-mode .afm-setting-header {
                border-color: rgba(255,255,255,0.1) !important;
            }
            .nsk-overlay.afm-dark-mode .nsk-theme-toggle:hover,
            .nsk-overlay.afm-dark-mode .nsk-close:hover { background: rgba(255,255,255,0.1); }
            .nsk-overlay.afm-dark-mode .afm-sub-tab,
            .nsk-overlay.afm-dark-mode .afm-tool-btn,
            .nsk-overlay.afm-dark-mode .afm-card,
            .nsk-overlay.afm-dark-mode .afm-setting-group,
            .nsk-overlay.afm-dark-mode .afm-modal-option,
            .nsk-overlay.afm-dark-mode .afm-backup-btn,
            .nsk-overlay.afm-dark-mode .afm-binding-item,
            .nsk-overlay.afm-dark-mode .afm-binding-current,
            .nsk-overlay.afm-dark-mode .afm-storage-status,
            .nsk-overlay.afm-dark-mode .afm-update-status,
            .nsk-overlay.afm-dark-mode .afm-import-preview-card {
                background: rgba(0,0,0,0.28); border-color: rgba(255,255,255,0.12); color: #eee;
            }
            .nsk-overlay.afm-dark-mode .afm-card.active,
            .nsk-overlay.afm-dark-mode .afm-modal-option.active { border-color: var(--SmartThemeQuoteColor); }
            .nsk-overlay.afm-dark-mode .afm-sub-tab.active {
                background: var(--SmartThemeQuoteColor); border-color: var(--SmartThemeQuoteColor); color: white;
            }
            .nsk-overlay.afm-dark-mode .afm-search-input,
            .nsk-overlay.afm-dark-mode .afm-select,
            .nsk-overlay.afm-dark-mode .afm-num-input,
            .nsk-overlay.afm-dark-mode .afm-modal-input,
            .nsk-overlay.afm-dark-mode .afm-modal-select,
            .nsk-overlay.afm-dark-mode .afm-binding-select,
            .nsk-overlay.afm-dark-mode .afm-import-name-input {
                background: rgba(0,0,0,0.42); border-color: rgba(255,255,255,0.15); color: #eee;
            }
            .nsk-overlay.afm-dark-mode .afm-btn-sm,
            .nsk-overlay.afm-dark-mode .afm-modal-cancel,
            .nsk-overlay.afm-dark-mode .afm-reset-setting-btn,
            .nsk-overlay.afm-dark-mode .afm-save-setting-btn,
            .nsk-overlay.afm-dark-mode .afm-binding-action:not(.primary),
            .nsk-overlay.afm-dark-mode .afm-page-btn {
                background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.14); color: #eee;
            }
            .nsk-overlay.afm-dark-mode .afm-card-img-box,
            .nsk-overlay.afm-dark-mode .afm-modal-details,
            .nsk-overlay.afm-dark-mode .afm-import-preview-img { background: rgba(0,0,0,0.42); }

            .nsk-tabs {
                display: flex; border-bottom: 1px solid rgba(0,0,0,0.05); padding: 0 10px; flex-shrink: 0;
            }
            .nsk-tab {
                flex: 1; text-align: center; padding: 12px; cursor: pointer;
                opacity: 0.6; transition: 0.2s; border-bottom: 3px solid transparent;
                font-size: 0.95em; font-weight: 500;
            }
            .nsk-tab.active { 
                opacity: 1; color: var(--SmartThemeQuoteColor); border-bottom-color: var(--SmartThemeQuoteColor);
            }

            .nsk-content { 
                flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; 
            }
            .nsk-panel { 
                display: none; height: 100%; flex-direction: column; padding: 0 12px 10px 12px; 
            }
            .nsk-panel.active { display: flex; animation: nsk-fade 0.2s; }
            @keyframes nsk-fade { from { opacity: 0; } to { opacity: 1; } }

            /* 二级 Tab (User/Char) */
            .afm-sub-tabs-row { display: flex; justify-content: center; gap: 12px; margin: 12px 0; flex-shrink: 0; }
            .afm-sub-tab { 
                padding: 6px 24px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); 
                background: rgba(255,255,255,0.5); cursor: pointer; 
                font-size: 0.9em; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; user-select: none; 
            }
            .afm-sub-tab:hover { border-color: var(--SmartThemeQuoteColor); color: var(--SmartThemeQuoteColor); }
            .afm-sub-tab.active { background: var(--SmartThemeQuoteColor); color: white; border-color: var(--SmartThemeQuoteColor); }

            /* 工具栏 */
            .afm-toolbar { display: flex; align-items: center; margin-bottom: 10px; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
            .afm-search-box { flex: 1 1 160px; display: flex; align-items: center; position: relative; }
            .afm-search-input { 
                width: 100%; padding: 4px 10px 4px 28px; border-radius: 15px; 
                border: 1px solid rgba(0,0,0,0.1); outline: none; font-size: 0.85em; 
                background: rgba(255,255,255,0.5); color: inherit; transition: all 0.2s; height: 30px; 
            }
            .afm-search-input:focus { border-color: var(--SmartThemeQuoteColor); background: rgba(255,255,255,0.9); }
            .afm-search-icon { position: absolute; left: 10px; opacity: 0.5; font-size: 0.8em; }
            .afm-select { height: 30px; max-width: 120px; padding: 3px 8px; border-radius: 15px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.5); color: inherit; font-size: 0.8em; outline: none; }
            .afm-select:focus { border-color: var(--SmartThemeQuoteColor); background: rgba(255,255,255,0.9); }
            
            .afm-tool-btn { 
                width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; 
                border-radius: 8px; cursor: pointer; opacity: 0.7; transition: all 0.2s; 
                background: rgba(255,255,255,0.5); font-size: 0.9em; border: 1px solid rgba(0,0,0,0.05);
            }
            .afm-tool-btn:hover { background: rgba(255,255,255,0.9); opacity: 1; }
            .afm-tool-btn.danger:hover { color: #e57373; background: #fff2f2; }
            .afm-tool-btn.active-mode { background: var(--SmartThemeQuoteColor); color: white; opacity: 1; }

            /* 网格区域 */
            #grid-container { flex: 1; overflow-y: auto; min-height: 0; padding: 4px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); }
            
            .afm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; display: none; padding-bottom: 5px; }
            .afm-grid.active { display: grid; }
            
            .afm-empty-state { 
                grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; 
                justify-content: center; height: 100%; min-height: 150px; opacity: 0.5; gap: 10px; font-size: 0.9em; user-select: none; 
            }
            .afm-empty-state i { font-size: 2em; }

            /* 卡片 */
            .afm-card { 
                background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.1); 
                border-radius: 12px; padding: 6px; overflow: hidden; display: flex; flex-direction: column; 
                transition: all 0.2s; position: relative; cursor: pointer; contain: layout paint style; content-visibility: auto; contain-intrinsic-size: 150px 190px; 
            }
            .afm-card.active { 
                box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: var(--SmartThemeQuoteColor); transform: translateY(-2px); background: white;
            }
            .afm-card.favorite { border-color: #f5c542; }
            .afm-card-fav-badge { position: absolute; top: 7px; right: 7px; z-index: 3; color: #f5c542; text-shadow: 0 1px 3px rgba(0,0,0,0.35); }       
            .afm-star-icon { width: 15px; height: 15px; display: inline-block; vertical-align: middle; fill: currentColor; stroke: currentColor; }
            @media (hover: hover) and (pointer: fine) { 
                .afm-card:not(.active):hover { border-color: var(--SmartThemeQuoteColor); transform: translateY(-2px); } 
            }
            .afm-card.multi-selected { border-color: #e57373; background: #fffafa; transform: translateY(-2px); }
            
            .afm-wrapper.multi-mode .afm-card-actions { visibility: hidden; pointer-events: none; }
            
            .afm-card-img-box { 
                width: 100%; aspect-ratio: 1/1; background: rgba(0,0,0,0.03); 
                border-radius: 8px; position: relative; overflow: hidden; transition: all 0.2s;
            }
            .afm-card.multi-selected .afm-card-img-box { opacity: 0.8; }
            .afm-frame-img { 
                position: absolute; top: 7.5%; left: 7.5%; width: 85%; height: 85%; 
                object-fit: contain; pointer-events: none; user-select: none; -webkit-user-drag: none; 
            }
            
            .afm-card-footer { padding: 6px 2px 0px 2px; display: flex; flex-direction: column; align-items: center; }
            .afm-card-name { 
                font-size: 0.75em; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; 
                white-space: nowrap; width: 100%; text-align: center; margin-bottom: 2px; 
            }
            .afm-card-group { font-size: 0.68em; opacity: 0.55; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 4px; }
            .afm-card-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; justify-content: center; align-items: center; width: 100%; transition: all 0.2s; }
            .afm-action-btn { 
                width: 100%; min-width: 0; height: 24px; display: flex; align-items: center; justify-content: center; 
                cursor: pointer; opacity: 0.58; transition: all 0.2s; font-size: 0.9em; z-index: 10; border-radius: 5px; box-sizing: border-box; 
            }
            .afm-action-btn:hover { opacity: 1; color: var(--SmartThemeQuoteColor); background: rgba(0,0,0,0.05); }
            .afm-action-btn.del:hover { color: #e57373; }
            .afm-action-btn.favorite { color: #777; opacity: 0.55; }
            .afm-action-btn.favorite.active { opacity: 1; color: #f5c542; }
            .afm-action-btn.group:hover { color: #66bb6a; }

            /* 底部按钮 */
            .afm-bottom-actions { margin-top: auto; display: flex; gap: 10px; flex-shrink: 0; padding-bottom: 5px; width: 100%; }
            .afm-bottom-group { display: flex !important; width: 100%; gap: 10px; }
            .afm-hidden { display: none !important; }

            .afm-btn-lg { 
                flex: 2; padding: 10px; border-radius: 20px; border: none; cursor: pointer; 
                font-size: 0.95em; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; 
            }
            .afm-btn-sm { 
                flex: 1; padding: 10px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); 
                cursor: pointer; font-size: 0.95em; display: flex; align-items: center; justify-content: center; gap: 8px; 
                transition: all 0.2s; background: rgba(255,255,255,0.5); color: inherit;
            }
            .afm-import-btn { background: var(--SmartThemeQuoteColor); color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .afm-import-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.15); filter: brightness(1.1); }
            .afm-restore-btn:hover { color: var(--SmartThemeQuoteColor); border-color: var(--SmartThemeQuoteColor); background: white; }
            
            .afm-delete-multi-btn { background: #e57373; color: white; }
            .afm-delete-multi-btn:hover { background: #ef5350; transform: translateY(-2px); }
            .afm-export-multi-btn { background: var(--SmartThemeQuoteColor); color: white; }
            .afm-group-multi-btn { background: #66bb6a; color: white; }
            .afm-group-multi-btn:hover { background: #57ad5b; transform: translateY(-2px); }
            .afm-select-all-btn:hover, .afm-cancel-multi-btn:hover { color: var(--SmartThemeQuoteColor); border-color: var(--SmartThemeQuoteColor); }

            .afm-modal-mask { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; min-height: 100svh; z-index: 100000; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); box-sizing: border-box; overflow: hidden; }
            .afm-modal-box { width: min(420px, 92vw); max-height: min(80vh, calc(100dvh - 24px)); overflow: auto; overscroll-behavior: contain; background: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border-radius: 14px; box-shadow: 0 12px 38px rgba(0,0,0,0.25); padding: 16px; border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(10px); box-sizing: border-box; margin: auto; }
            .afm-modal-title { font-weight: bold; font-size: 1.05em; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
            .afm-modal-message { opacity: 0.82; font-size: 0.9em; line-height: 1.45; margin-bottom: 10px; }
            .afm-modal-details { max-height: 120px; overflow: auto; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.06); font-size: 0.82em; margin-bottom: 10px; }
            .afm-modal-option { width: 100%; margin: 6px 0; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.55); color: inherit; display: flex; align-items: center; gap: 8px; cursor: pointer; }
            .afm-modal-option:hover { border-color: var(--SmartThemeQuoteColor); color: var(--SmartThemeQuoteColor); background: rgba(255,255,255,0.85); }
            .afm-modal-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
            .afm-modal-cancel { padding: 7px 16px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.55); color: inherit; cursor: pointer; }
            .afm-modal-input { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.75); color: inherit; outline: none; }
            .afm-modal-select { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.75); color: inherit; outline: none; margin-bottom: 8px; }
            .afm-group-new-row { margin-top: 8px; }
            .afm-group-new-row.afm-hidden { display: none !important; }
            .afm-modal-confirm { padding: 7px 16px; border-radius: 16px; border: none; background: var(--SmartThemeQuoteColor); color: white; cursor: pointer; }
            .afm-preview-box { width: min(520px, 94vw); }
            .afm-import-preview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
            .afm-import-preview-card { position: relative; background: rgba(255,255,255,0.45); border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 7px; min-width: 0; }
            .afm-import-preview-img { width: 100%; aspect-ratio: 1/1; object-fit: contain; background: rgba(0,0,0,0.05); border-radius: 8px; display: block; }
            .afm-import-name-row { display: flex; gap: 4px; align-items: center; margin-top: 6px; }
            .afm-import-name-input { min-width: 0; flex: 1; height: 28px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12); padding: 3px 6px; background: rgba(255,255,255,0.78); color: inherit; font-size: 0.78em; }
            .afm-import-delete-btn { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.6); color: #e57373; cursor: pointer; display: flex; align-items: center; justify-content: center; }
            .afm-import-delete-btn:hover { background: #fff2f2; }
            .afm-import-pager { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 12px; }
            .afm-page-btn { min-width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.55); color: inherit; cursor: pointer; }
            .afm-page-btn.active { background: var(--SmartThemeQuoteColor); color: white; }
            .afm-page-btn:disabled { opacity: 0.35; cursor: default; }
            .afm-list-pager { flex-shrink: 0; display: flex; justify-content: center; align-items: center; gap: 8px; margin: 0 0 10px 0; min-height: 30px; flex-wrap: wrap; }
            .afm-list-pager .afm-page-info { font-size: 0.82em; opacity: 0.72; min-width: 108px; text-align: center; }
            .afm-list-pager .afm-page-btn { min-width: 64px; padding: 0 10px; }
            .afm-import-targets { margin-top: 12px; }
            .afm-import-targets .afm-modal-option.active { border-color: var(--SmartThemeQuoteColor); color: var(--SmartThemeQuoteColor); background: rgba(255,255,255,0.92); }
            .afm-backup-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .afm-backup-btn { flex: 1 1 160px; padding: 9px 10px; border-radius: 18px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.55); color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .afm-backup-btn.primary { background: var(--SmartThemeQuoteColor); color: white; }
            .afm-update-status { padding: 9px 10px; margin-bottom: 10px; border-left: 3px solid var(--SmartThemeQuoteColor); background: rgba(0,0,0,0.04); font-size: 0.84em; line-height: 1.45; overflow-wrap: anywhere; }
            .afm-update-status.error { border-left-color: #d65353; color: #d65353; }
            .afm-storage-status { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-left: 3px solid var(--SmartThemeQuoteColor); background: rgba(0,0,0,0.04); }
            .afm-storage-status i { width: 18px; text-align: center; color: var(--SmartThemeQuoteColor); }
            .afm-storage-status strong, .afm-storage-status span { display: block; }
            .afm-storage-status strong { font-size: 0.92em; }
            .afm-storage-status span { margin-top: 2px; font-size: 0.78em; opacity: 0.68; overflow-wrap: anywhere; }

            /* 设置面板 */
            .afm-settings-container { padding: 10px 5px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 20px; }
            .afm-setting-group { background: rgba(255,255,255,0.4); padding: 15px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05); }
            .afm-setting-header { 
                margin-bottom: 15px; font-size: 1em; opacity: 0.8; display: flex; align-items: center; 
                gap: 8px; border-bottom: 1.5px solid rgba(0,0,0,0.05); padding-bottom: 8px; justify-content: space-between; 
            }
            .afm-setting-header i { color: var(--SmartThemeQuoteColor); }
            .afm-control-row { display: flex; align-items: center; margin-bottom: 10px; font-size: 0.9em; }
            .afm-control-label { width: 50px; flex-shrink: 0; opacity: 0.7; }
            .afm-slider { flex: 1; margin: 0 10px !important; cursor: pointer; accent-color: var(--SmartThemeQuoteColor); }
            .afm-num-input { 
                width: 50px; text-align: center; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; 
                padding: 4px; font-size: 0.9em; background: rgba(255,255,255,0.8); color: inherit; 
            }
            .afm-num-input:focus { border-color: var(--SmartThemeQuoteColor); }
            
            .afm-setting-actions { display: flex; align-items: center; gap: 6px; }
            .afm-reset-setting-btn, .afm-save-setting-btn { 
                font-size: 0.75em; padding: 4px 10px; border: 1px solid rgba(0,0,0,0.1); 
                border-radius: 12px; cursor: pointer; opacity: 0.72; background: white; transition: all 0.2s; 
            }
            .afm-save-setting-btn { color: var(--SmartThemeQuoteColor); border-color: rgba(0,0,0,0.14); font-weight: 600; }
            .afm-save-setting-btn.dirty { opacity: 1; background: var(--SmartThemeQuoteColor); color: white; border-color: var(--SmartThemeQuoteColor); }
            .afm-reset-setting-btn:hover, .afm-save-setting-btn:hover { opacity: 1; color: var(--SmartThemeQuoteColor); border-color: var(--SmartThemeQuoteColor); }
            .afm-save-setting-btn.dirty:hover { color: white; }

            .afm-checkbox-wrapper { display: flex; align-items: center; gap: 10px; font-size: 0.95em; opacity: 0.9; }
            .afm-checkbox-input { width: 18px; height: 18px; accent-color: var(--SmartThemeQuoteColor); cursor: pointer; }

            .afm-binding-current { padding: 10px 12px; margin-bottom: 12px; border-left: 3px solid var(--SmartThemeQuoteColor); background: rgba(0,0,0,0.04); font-size: 0.86em; line-height: 1.45; }
            .afm-binding-current strong { display: block; font-size: 1.05em; }
            .afm-binding-current code { display: block; margin-top: 2px; opacity: 0.62; overflow-wrap: anywhere; }
            .afm-binding-field { margin-bottom: 12px; }
            .afm-binding-field-label { display: block; margin-bottom: 5px; font-size: 0.82em; opacity: 0.7; }
            .afm-binding-select { width: 100%; min-width: 0; box-sizing: border-box; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; background: rgba(255,255,255,0.72); color: inherit; }
            .afm-binding-actions { display: flex; gap: 8px; margin-top: 14px; }
            .afm-binding-action { min-height: 34px; padding: 7px 13px; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; background: rgba(255,255,255,0.62); color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
            .afm-binding-action.primary { flex: 1; border-color: var(--SmartThemeQuoteColor); background: var(--SmartThemeQuoteColor); color: white; }
            .afm-binding-action.danger { color: #d65353; }
            .afm-binding-action:disabled { opacity: 0.4; cursor: default; }
            .afm-binding-list { display: flex; flex-direction: column; gap: 7px; }
            .afm-binding-item { display: grid; grid-template-columns: 42px 42px minmax(0, 1fr); align-items: center; gap: 7px; padding: 8px; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; background: rgba(255,255,255,0.35); }
            .afm-binding-item.active { border-color: var(--SmartThemeQuoteColor); box-shadow: inset 3px 0 0 var(--SmartThemeQuoteColor); }
            .afm-binding-thumb { width: 42px; height: 42px; object-fit: contain; display: block; background: rgba(0,0,0,0.05); border-radius: 6px; }
            .afm-binding-thumb-empty { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.05); border-radius: 6px; opacity: 0.42; font-size: 0.7em; }
            .afm-binding-info { min-width: 0; }
            .afm-binding-name { font-size: 0.9em; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .afm-binding-meta { margin-top: 2px; font-size: 0.74em; opacity: 0.62; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .afm-binding-empty { padding: 20px 8px; text-align: center; opacity: 0.55; font-size: 0.86em; }
            .afm-binding-settings-title { margin: 13px 0 8px; font-size: 0.82em; font-weight: 600; opacity: 0.72; }

            @media (max-width: 600px) {
                .nsk-box { width: min(96vw, 500px); height: min(86dvh, 800px); max-height: calc(100dvh - 20px); }
                .afm-card { padding: 5px; }
                .afm-card-footer { padding-top: 5px; }
                .afm-card-actions { gap: 2px; }
                .afm-action-btn { height: 26px; font-size: 0.86em; opacity: 0.62; }
                .afm-star-icon { width: 14px; height: 14px; }
                .afm-modal-mask { align-items: center !important; justify-content: center !important; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
                .afm-modal-box { width: min(94vw, 420px); max-height: calc(100dvh - 20px); padding: 14px; }
                .afm-preview-box { width: min(94vw, 520px); max-height: calc(100dvh - 20px); }
                .afm-import-preview-grid { gap: 6px; }
                .afm-import-preview-card { padding: 5px; }
                .afm-import-name-input { height: 26px; font-size: 0.72em; }
                .afm-import-delete-btn { width: 26px; height: 26px; flex: 0 0 26px; }
                .afm-import-pager { gap: 5px; flex-wrap: wrap; }
                .afm-page-btn { min-width: 28px; height: 28px; }
                .afm-list-pager { gap: 5px; margin: 0 0 6px 0; min-height: 28px; flex-wrap: nowrap; }
                .afm-list-pager .afm-page-info { min-width: 54px; font-size: 0.76em; white-space: nowrap; }
                .afm-list-pager .afm-page-btn { min-width: 50px; height: 28px; padding: 0 8px; font-size: 0.78em; white-space: nowrap; line-height: 1; }
                .afm-bottom-actions { gap: 6px; padding-bottom: 2px; overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap; justify-content: flex-start; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
                .afm-bottom-actions::-webkit-scrollbar { display: none; }
                .afm-bottom-group { width: max-content; min-width: 100%; gap: 6px; flex-wrap: nowrap; align-items: center; }
                .afm-bottom-group .afm-btn-lg, .afm-bottom-group .afm-btn-sm { flex: 0 0 auto; min-width: max-content; height: 36px; min-height: 36px; padding: 0 11px; border-radius: 14px; font-size: 0.8em; line-height: 1; gap: 5px; white-space: nowrap; flex-direction: row; }
                .afm-bottom-group .afm-btn-lg i, .afm-bottom-group .afm-btn-sm i { flex: 0 0 auto; font-size: 0.95em; line-height: 1; }
                .afm-select-all-btn, .afm-export-multi-btn, .afm-group-multi-btn, .afm-delete-multi-btn, .afm-cancel-multi-btn { max-width: none; writing-mode: horizontal-tb; text-orientation: mixed; }
                .afm-binding-actions { flex-wrap: wrap; }
                .afm-binding-action.primary { flex-basis: 100%; }
                .afm-binding-item { grid-template-columns: 36px 36px minmax(0, 1fr); gap: 6px; }
                .afm-binding-thumb, .afm-binding-thumb-empty { width: 36px; height: 36px; }
            }
        </style>
    `);

    // ===========================
    // 4. UI 模板生成函数
    // ===========================
    function escapeHTML(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getStarIconHTML() {
        return '<svg class="afm-star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.84 5.76 6.36.92-4.6 4.48 1.09 6.33L12 17.1l-5.69 2.99 1.09-6.33-4.6-4.48 6.36-.92L12 2.6z"></path></svg>';
    }

    const AFM_LIST_PAGE_SIZE = 9;

    function createGridHTML(gridId, frames, activeSrc, page = 0) {
        const total = Array.isArray(frames) ? frames.length : 0;
        const totalPages = Math.max(1, Math.ceil(total / AFM_LIST_PAGE_SIZE));
        const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
        const start = safePage * AFM_LIST_PAGE_SIZE;
        const visibleFrames = total > 0 ? frames.slice(start, start + AFM_LIST_PAGE_SIZE) : [];
        if (total === 0) {
            return `
                <div id="${gridId}" class="afm-grid" style="height:100%; display:none;" data-page="0" data-total="0" data-total-pages="1">
                    <div class="afm-empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <span>当前没有头像框</span>
                    </div>
                </div>
            `;
        }
        let html = `<div id="${gridId}" class="afm-grid" data-page="${safePage}" data-total="${total}" data-total-pages="${totalPages}">`;
        visibleFrames.forEach((item) => {
            const realIndex = Number(item._index);
            const isActive = (item.src === activeSrc) ? 'active' : '';
            const isFavorite = item.favorite ? 'favorite' : '';
            const safeName = escapeHTML(item.name);
            const safeGroup = escapeHTML(item.group || DEFAULT_GROUP);
            html += `
                <div class="afm-card ${isActive} ${isFavorite}" data-index="${realIndex}">
                    ${item.favorite ? `<div class="afm-card-fav-badge">${getStarIconHTML()}</div>` : ''}
                    <div class="afm-card-img-box" title="应用此头像框"><img src="${item.src}" class="afm-frame-img" loading="lazy" decoding="async" fetchpriority="low" alt="${safeName}"></div>
                    <div class="afm-card-footer">
                        <div class="afm-card-name" title="${safeName}">${safeName}</div>
                        <div class="afm-card-group" title="分组：${safeGroup}"><i class="fa-solid fa-layer-group"></i> ${safeGroup}</div>
                        <div class="afm-card-actions">
                            <div class="afm-action-btn favorite ${item.favorite ? 'active' : ''}" title="${item.favorite ? '取消收藏' : '收藏'}">${getStarIconHTML()}</div>
                            <div class="afm-action-btn group" title="编辑分组"><i class="fa-solid fa-layer-group"></i></div>
                            <div class="afm-action-btn rename" title="重命名"><i class="fa-solid fa-pencil"></i></div>
                            <div class="afm-action-btn del" title="删除"><i class="fa-solid fa-trash-can"></i></div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        return html;
    }

    function createPagerHTML(role, total, page) {
        const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / AFM_LIST_PAGE_SIZE));
        const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
        const start = total > 0 ? safePage * AFM_LIST_PAGE_SIZE + 1 : 0;
        const end = total > 0 ? Math.min(total, (safePage + 1) * AFM_LIST_PAGE_SIZE) : 0;
        return `
            <div class="afm-list-pager" data-role="${role}">
                <button class="afm-page-btn afm-list-page-prev" data-nav="prev" ${safePage <= 0 ? 'disabled' : ''}>上一页</button>
                <span class="afm-page-info">${total > 0 ? `${safePage + 1}/${totalPages} 页 · ${start}-${end}/${total}` : '0/0 页'}</span>
                <button class="afm-page-btn afm-list-page-next" data-nav="next" ${safePage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
            </div>
        `;
    }

    function createSettingsHTML(data) {
        const u = data.userSettings;
        const c = data.charSettings;
        const pseudo = data.pseudoTarget || 'after';
        const storageMode = DataManager.getStorageMode();
        const storageStatus = storageMode === 'server'
            ? { icon: 'fa-server', title: '当前存储：酒馆后端', detail: '头像框配置和图片保存在服务器' }
            : storageMode === 'local'
                ? { icon: 'fa-database', title: '当前存储：浏览器', detail: '后端不可用，使用 IndexedDB 保存' }
                : { icon: 'fa-spinner fa-spin', title: '当前存储：检测中', detail: '正在检测酒馆后端连接' };

        const createSlider = (label, key, val, group, min=-100, max=200) => `
            <div class="afm-control-row">
                <div class="afm-control-label">${label}</div>
                <input type="range" class="afm-slider" data-group="${group}" data-key="${key}" value="${val}" min="${min}" max="${max}">
                <input type="number" class="afm-num-input" data-group="${group}" data-key="${key}" value="${val}">
            </div>
        `;

        return `
            <div class="afm-settings-container">
                <div class="afm-storage-status">
                    <i class="fa-solid ${storageStatus.icon}"></i>
                    <div><strong>${storageStatus.title}</strong><span>${storageStatus.detail}</span></div>
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-user"></i> User 头像框调整 (%)</span>
                        <div class="afm-setting-actions">
                            <div class="afm-save-setting-btn" data-target="userSettings"><i class="fa-solid fa-floppy-disk"></i> 保存</div>
                            <div class="afm-reset-setting-btn" data-target="userSettings"><i class="fa-solid fa-rotate-left"></i> 重置</div>
                        </div>
                    </div>
                    ${createSlider('Top', 'top', u.top, 'userSettings')}
                    ${createSlider('Left', 'left', u.left, 'userSettings')}
                    ${createSlider('宽', 'width', u.width, 'userSettings', 0, 300)}
                    ${createSlider('高', 'height', u.height, 'userSettings', 0, 300)}
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-robot"></i> Char 头像框调整 (%)</span>
                        <div class="afm-setting-actions">
                            <div class="afm-save-setting-btn" data-target="charSettings"><i class="fa-solid fa-floppy-disk"></i> 保存</div>
                            <div class="afm-reset-setting-btn" data-target="charSettings"><i class="fa-solid fa-rotate-left"></i> 重置</div>
                        </div>
                    </div>
                    ${createSlider('Top', 'top', c.top, 'charSettings')}
                    ${createSlider('Left', 'left', c.left, 'charSettings')}
                    ${createSlider('宽', 'width', c.width, 'charSettings', 0, 300)}
                    ${createSlider('高', 'height', c.height, 'charSettings', 0, 300)}
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-code"></i> 伪元素位置</span>
                    </div>
                    <div class="afm-checkbox-wrapper">
                        <input type="checkbox" id="opt-pseudo-target" class="afm-checkbox-input" ${pseudo === 'before' ? 'checked' : ''}>
                        <span class="afm-checkbox-text">应用到 ::before (默认 ::after)</span>
                    </div>
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-box-archive"></i> ZIP 备份</span>
                    </div>
                    <div class="afm-backup-actions">
                        <button class="afm-backup-btn primary" id="btn-export-zip-all"><i class="fa-solid fa-file-zipper"></i> 导出完整 ZIP</button>
                        <button class="afm-backup-btn" id="btn-import-plugin-zip"><i class="fa-solid fa-upload"></i> 导入本插件备份 ZIP</button>
                    </div>
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-cloud-arrow-down"></i> 扩展更新</span>
                    </div>
                    <div class="afm-update-status ${extensionUpdateState.phase === 'error' ? 'error' : ''}">${escapeHTML(extensionUpdateState.message)}</div>
                    <div class="afm-backup-actions">
                        <button class="afm-backup-btn" id="afm-check-update" ${extensionUpdateState.phase === 'checking' || extensionUpdateState.phase === 'updating' ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate ${extensionUpdateState.phase === 'checking' ? 'fa-spin' : ''}"></i> 检查更新</button>
                        ${extensionUpdateState.canUpdate ? `<button class="afm-backup-btn primary" id="afm-apply-update"><i class="fa-solid fa-download"></i> 更新${extensionUpdateState.latestVersion ? `到 v${escapeHTML(extensionUpdateState.latestVersion)}` : ''}</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function createBindingsHTML(data) {
        const currentTheme = getCurrentThemeSnapshot();
        const bindings = Object.values(data.themeBindings || {}).sort((a, b) => a.themeName.localeCompare(b.themeName, 'zh-Hans-CN'));
        const currentThemeId = String(currentTheme.id || '').trim();
        const selectedBinding = data.themeBindings[currentThemeId] || null;
        const currentUserFrame = data.userFrames.find(frame => frame.src === data.activeUserSrc);
        const currentCharFrame = data.charFrames.find(frame => frame.src === data.activeCharSrc);
        const formatSettings = settings => {
            const value = normalizeBindingSettings(settings);
            return `Top ${value.top}% / Left ${value.left}% / 宽 ${value.width}% / 高 ${value.height}%`;
        };
        const renderThumb = (src, role) => src ? `<img class="afm-binding-thumb" src="${escapeHTML(src)}" alt="${role}">` : `<div class="afm-binding-thumb-empty">${role}</div>`;
        const bindingItems = bindings.length ? bindings.map(binding => `
            <div class="afm-binding-item ${binding.themeId === currentThemeId ? 'active' : ''}" data-theme-id="${escapeHTML(binding.themeId)}">
                ${renderThumb(binding.userFrameSrc, 'User')}
                ${renderThumb(binding.charFrameSrc, 'Char')}
                <div class="afm-binding-info">
                    <div class="afm-binding-name">${escapeHTML(binding.themeName)}</div>
                    <div class="afm-binding-meta">${escapeHTML(binding.themeId)}</div>
                </div>
            </div>
        `).join('') : '<div class="afm-binding-empty">还没有美化绑定</div>';

        return `
            <div class="afm-settings-container">
                <div class="afm-setting-group">
                    <div class="afm-setting-header">
                        <span><i class="fa-solid fa-link"></i> 美化绑定</span>
                    </div>
                    <div class="afm-binding-current"><strong>当前美化：${escapeHTML(currentTheme.name || '未检测到')}</strong><code>${escapeHTML(currentTheme.id || '未检测到美化标识')}</code></div>
                    <div class="afm-binding-current">
                        <strong>保存时直接读取当前配置</strong>
                        <code>User：${escapeHTML(currentUserFrame ? currentUserFrame.name : '未选择')} · ${escapeHTML(formatSettings(data.userSettings))}</code>
                        <code>Char：${escapeHTML(currentCharFrame ? currentCharFrame.name : '未选择')} · ${escapeHTML(formatSettings(data.charSettings))}</code>
                    </div>
                    <div class="afm-binding-actions">
                        <button class="afm-binding-action primary" id="afm-save-binding" type="button"><i class="fa-solid fa-floppy-disk"></i> 保存绑定</button>
                        <button class="afm-binding-action danger" id="afm-delete-binding" type="button" ${selectedBinding ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i> 删除</button>
                    </div>
                </div>
                <div class="afm-setting-group">
                    <div class="afm-setting-header"><span><i class="fa-solid fa-list"></i> 已保存绑定</span></div>
                    <div class="afm-binding-list">${bindingItems}</div>
                </div>
            </div>
        `;
    }

    // ===========================
    // 5. 弹窗主逻辑 
    // ===========================
    async function showManagerUI() {
        if ($('.nsk-overlay').length > 0) return; // 防止重复打开

        let isMultiMode = false;
        let selectedIndices = new Set();
        let currentData = await DataManager.load();
        const isDarkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
        const uiState = {
            user: { sort: 'order', group: 'all', search: '', page: 0 },
            char: { sort: 'order', group: 'all', search: '', page: 0 }
        };

        const popupHTML = `
            <div class="nsk-overlay ${isDarkMode ? 'afm-dark-mode' : ''}">
                <div class="nsk-box">
                    
                    <div class="nsk-header">
                        <div class="nsk-title"><i class="fa-solid fa-crop-simple"></i> ${SCRIPT_NAME}<span class="nsk-version">v${SCRIPT_VERSION}</span></div>
                        <div class="nsk-header-actions">
                            <button class="nsk-theme-toggle" id="afm-theme-toggle" title="切换日间/夜间模式"><i class="fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'}"></i></button>
                            <button class="nsk-close"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>

                    <div class="nsk-tabs">
                        <div class="nsk-tab active" data-target="view-frames"><i class="fa-solid fa-image"></i> 列表</div>
                        <div class="nsk-tab" data-target="view-bindings"><i class="fa-solid fa-link"></i> 绑定</div>
                        <div class="nsk-tab" data-target="view-settings"><i class="fa-solid fa-sliders"></i> 设置</div>
                    </div>

                    <div class="nsk-content">
                        <!-- Panel 1: 列表视图 -->
                        <div class="nsk-panel active" id="view-frames">
                            <div class="afm-sub-tabs-row">
                                <div class="afm-sub-tab active" data-target="grid-user"><i class="fa-solid fa-user"></i> User</div>
                                <div class="afm-sub-tab" data-target="grid-char"><i class="fa-solid fa-robot"></i> Char</div>
                            </div>

                            <div class="afm-toolbar">
                                <div class="afm-search-box">
                                    <i class="fa-solid fa-magnifying-glass afm-search-icon"></i>
                                    <input type="text" class="afm-search-input" placeholder="搜索...">
                                </div>
                                <select class="afm-select afm-sort-select" title="排序方式">
                                    <option value="order">导入顺序</option>
                                    <option value="name">按名称</option>
                                    <option value="favorite">收藏优先</option>
                                </select>
                                <select class="afm-select afm-group-filter" title="分组筛选">
                                    <option value="all">全部分组</option>
                                </select>
                                <div class="afm-tool-btn" id="btn-export-json" title="导出 JSON 数据"><i class="fa-solid fa-file-export"></i></div>
                                <div class="afm-tool-btn" id="btn-export-zip" title="导出当前 User/Char ZIP 备份"><i class="fa-solid fa-file-zipper"></i></div>
                                <div class="afm-tool-btn" id="btn-import-json" title="导入备份数据"><i class="fa-solid fa-file-import"></i></div>
                                <div class="afm-tool-btn danger" id="btn-clear-all" title="清空当前列表"><i class="fa-solid fa-trash"></i></div>
                                <div class="afm-tool-btn" id="btn-multi-select" title="批量选择"><i class="fa-solid fa-list-check"></i></div>
                            </div>

                            <div id="grid-container"></div>
                            <div id="afm-list-pager-container"></div>

                            <div class="afm-bottom-actions">
                                <div class="afm-bottom-group afm-bottom-default">
                                    <button class="afm-btn-lg afm-import-btn" title="支持从相册或文件管理器多选批量导入"><i class="fa-solid fa-cloud-arrow-up"></i> 从相册/文件导入</button>
                                    <button class="afm-btn-sm afm-restore-btn"><i class="fa-solid fa-rotate-left"></i> 恢复默认</button>
                                </div>
                                <div class="afm-bottom-group afm-bottom-multi afm-hidden">
                                    <button class="afm-btn-sm afm-select-all-btn"><i class="fa-solid fa-check-double"></i> 全选</button>
                                    <button class="afm-btn-lg afm-export-multi-btn"><i class="fa-solid fa-file-zipper"></i> 导出选中 (<span class="multi-count">0</span>)</button>
                                    <button class="afm-btn-lg afm-group-multi-btn"><i class="fa-solid fa-layer-group"></i> 分组选中</button>
                                    <button class="afm-btn-lg afm-delete-multi-btn"><i class="fa-solid fa-trash-can"></i> 删除选中</button>
                                    <button class="afm-btn-sm afm-cancel-multi-btn">取消</button>
                                </div>
                            </div>
                            <!-- 隐藏的文件输入框 -->
                            <input type="file" id="afm-file-input" accept="image/*,.zip,application/zip" multiple style="display:none;">
                            <input type="file" id="afm-json-input" accept="application/json" style="display:none;">
                            <input type="file" id="afm-zip-input" accept=".zip,application/zip" style="display:none;">
                        </div>

                        <!-- Panel 2: 设置视图 -->
                        <div class="nsk-panel" id="view-settings">
                            ${createSettingsHTML(currentData)}
                        </div>
                        <div class="nsk-panel" id="view-bindings">
                            ${createBindingsHTML(currentData)}
                        </div>
                    </div>

                </div>
            </div>
        `;

        const $popup = $(popupHTML);
        $('body').append($popup);
        $popup.find('#afm-theme-toggle').on('click', function() {
            const darkModeEnabled = !$popup.hasClass('afm-dark-mode');
            $popup.toggleClass('afm-dark-mode', darkModeEnabled);
            $(this).find('i').toggleClass('fa-moon', !darkModeEnabled).toggleClass('fa-sun', darkModeEnabled);
            localStorage.setItem(DARK_MODE_STORAGE_KEY, String(darkModeEnabled));
        });
        let themeBindingAppliedHandler = null;

        const showAFMChoiceDialog = ({ title, message, details = [], options = [] }) => new Promise(resolve => {
            const detailHTML = details.length ? `<div class="afm-modal-details">${details.map(item => `<div>${escapeHTML(item)}</div>`).join('')}</div>` : '';
            const $modal = $(`
                <div class="afm-modal-mask">
                    <div class="afm-modal-box">
                        <div class="afm-modal-title"><i class="fa-solid fa-circle-question"></i> ${escapeHTML(title)}</div>
                        <div class="afm-modal-message">${escapeHTML(message)}</div>
                        ${detailHTML}
                        <div class="afm-modal-options">
                            ${options.map(opt => `<button class="afm-modal-option" data-value="${escapeHTML(opt.value)}"><i class="${escapeHTML(opt.icon || 'fa-solid fa-circle')}"></i><span>${escapeHTML(opt.label)}</span></button>`).join('')}
                        </div>
                        <div class="afm-modal-actions"><button class="afm-modal-cancel">取消</button></div>
                    </div>
                </div>
            `);
            $modal.on('click', '.afm-modal-option', function() { const value = $(this).data('value'); $modal.remove(); resolve(value); });
            $modal.on('click', '.afm-modal-cancel, .afm-modal-mask', function(e) { if ($(e.target).is('.afm-modal-cancel, .afm-modal-mask')) { $modal.remove(); resolve(null); } });
            $popup.append($modal);
        });

        const showAFMTextDialog = ({ title, message, value = '' }) => new Promise(resolve => {
            const $modal = $(`
                <div class="afm-modal-mask">
                    <div class="afm-modal-box">
                        <div class="afm-modal-title"><i class="fa-solid fa-pen-to-square"></i> ${escapeHTML(title)}</div>
                        <div class="afm-modal-message">${escapeHTML(message)}</div>
                        <input class="afm-modal-input" type="text" value="${escapeHTML(value)}">
                        <div class="afm-modal-actions"><button class="afm-modal-cancel">取消</button><button class="afm-modal-confirm" data-value="ok">确定</button></div>
                    </div>
                </div>
            `);
            const finish = (result) => { const val = $modal.find('.afm-modal-input').val(); $modal.remove(); resolve(result ? val : null); };
            $modal.on('click', '.afm-modal-confirm', () => finish(true));
            $modal.on('click', '.afm-modal-cancel, .afm-modal-mask', function(e) { if ($(e.target).is('.afm-modal-cancel, .afm-modal-mask')) finish(false); });
            $modal.find('.afm-modal-input').on('keydown', function(e) { if (e.key === 'Enter') finish(true); });
            $popup.append($modal);
            setTimeout(() => $modal.find('.afm-modal-input').trigger('focus').trigger('select'), 0);
        });

        const showAFMGroupDialog = ({ title, message, groups = [], value = DEFAULT_GROUP }) => new Promise(resolve => {
            const uniqueGroups = Array.from(new Set([DEFAULT_GROUP].concat(groups || []).filter(Boolean)));
            const current = value || DEFAULT_GROUP;
            const hasCurrent = uniqueGroups.includes(current);
            const initialSelect = hasCurrent ? current : '__new__';
            const $modal = $(`
                <div class="afm-modal-mask">
                    <div class="afm-modal-box">
                        <div class="afm-modal-title"><i class="fa-solid fa-layer-group"></i> ${escapeHTML(title)}</div>
                        <div class="afm-modal-message">${escapeHTML(message)}</div>
                        <select class="afm-modal-select afm-group-select">
                            ${uniqueGroups.map(group => `<option value="${escapeHTML(group)}" ${group === initialSelect ? 'selected' : ''}>${escapeHTML(group)}</option>`).join('')}
                            <option value="__new__" ${initialSelect === '__new__' ? 'selected' : ''}>+ 新建分组</option>
                        </select>
                        <div class="afm-group-new-row ${initialSelect === '__new__' ? '' : 'afm-hidden'}">
                            <input class="afm-modal-input afm-group-new-input" type="text" value="${escapeHTML(hasCurrent ? '' : current)}" placeholder="输入新分组名称，留空为未分组">
                        </div>
                        <div class="afm-modal-actions"><button class="afm-modal-cancel">取消</button><button class="afm-modal-confirm">确定</button></div>
                    </div>
                </div>
            `);
            const finish = (result) => {
                if (!result) { $modal.remove(); resolve(null); return; }
                const selected = $modal.find('.afm-group-select').val();
                const raw = selected === '__new__' ? $modal.find('.afm-group-new-input').val() : selected;
                $modal.remove();
                resolve((raw || '').trim() || DEFAULT_GROUP);
            };
            $modal.on('change', '.afm-group-select', function() {
                $modal.find('.afm-group-new-row').toggleClass('afm-hidden', $(this).val() !== '__new__');
                if ($(this).val() === '__new__') setTimeout(() => $modal.find('.afm-group-new-input').trigger('focus').trigger('select'), 0);
            });
            $modal.on('click', '.afm-modal-confirm', () => finish(true));
            $modal.on('click', '.afm-modal-cancel, .afm-modal-mask', function(e) { if ($(e.target).is('.afm-modal-cancel, .afm-modal-mask')) finish(false); });
            $modal.find('.afm-group-new-input').on('keydown', function(e) { if (e.key === 'Enter') finish(true); });
            $popup.append($modal);
            setTimeout(() => {
                if (initialSelect === '__new__') $modal.find('.afm-group-new-input').trigger('focus').trigger('select');
                else $modal.find('.afm-group-select').trigger('focus');
            }, 0);
        });

        const showAFMConfirmDialog = ({ title, message, details = [], okText = '确定', danger = false }) => new Promise(resolve => {
            const detailHTML = details.length ? `<div class="afm-modal-details">${details.map(item => `<div>${escapeHTML(item)}</div>`).join('')}</div>` : '';
            const $modal = $(`
                <div class="afm-modal-mask">
                    <div class="afm-modal-box">
                        <div class="afm-modal-title"><i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i> ${escapeHTML(title)}</div>
                        <div class="afm-modal-message">${escapeHTML(message)}</div>
                        ${detailHTML}
                        <div class="afm-modal-actions"><button class="afm-modal-cancel">取消</button><button class="afm-modal-confirm">${escapeHTML(okText)}</button></div>
                    </div>
                </div>
            `);
            const finish = (result) => { $modal.remove(); resolve(result); };
            $modal.on('click', '.afm-modal-confirm', () => finish(true));
            $modal.on('click', '.afm-modal-cancel, .afm-modal-mask', function(e) { if ($(e.target).is('.afm-modal-cancel, .afm-modal-mask')) finish(false); });
            $popup.append($modal);
        });

        const showAFMImportPreviewDialog = ({ title, message, items, options }) => new Promise(resolve => {
            let page = 0;
            let selected = options[0] ? options[0].value : null;
            const pageSize = 6;
            const localItems = items.map(item => ({ ...item }));
            const $modal = $(`
                <div class="afm-modal-mask">
                    <div class="afm-modal-box afm-preview-box">
                        <div class="afm-modal-title"><i class="fa-solid fa-images"></i> ${escapeHTML(title)}</div>
                        <div class="afm-modal-message afm-import-summary"></div>
                        <div class="afm-import-preview-grid"></div>
                        <div class="afm-import-pager"></div>
                        <div class="afm-import-targets"></div>
                        <div class="afm-modal-actions"><button class="afm-modal-cancel">取消</button><button class="afm-modal-confirm">导入</button></div>
                    </div>
                </div>
            `);
            const totalPages = () => Math.max(1, Math.ceil(localItems.length / pageSize));
            const render = () => {
                if (page >= totalPages()) page = totalPages() - 1;
                const start = page * pageSize;
                const visible = localItems.slice(start, start + pageSize);
                $modal.find('.afm-import-summary').text(`${message} 当前保留 ${localItems.length} 张。`);
                $modal.find('.afm-import-preview-grid').html(visible.map((item, offset) => `
                    <div class="afm-import-preview-card" data-index="${start + offset}">
                        <img class="afm-import-preview-img" src="${item.src}" title="${escapeHTML(item.name)}">
                        <div class="afm-import-name-row">
                            <input class="afm-import-name-input" value="${escapeHTML(item.name)}" maxlength="80">
                            <button class="afm-import-delete-btn" title="删除此图片"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `).join(''));
                const pages = Array.from({ length: totalPages() }, (_, i) => `<button class="afm-page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i + 1}</button>`).join('');
                $modal.find('.afm-import-pager').html(`<button class="afm-page-btn" data-nav="prev" ${page === 0 ? 'disabled' : ''}>‹</button>${pages}<button class="afm-page-btn" data-nav="next" ${page >= totalPages() - 1 ? 'disabled' : ''}>›</button>`);
                $modal.find('.afm-import-targets').html(options.map(opt => `<button class="afm-modal-option ${opt.value === selected ? 'active' : ''}" data-value="${escapeHTML(opt.value)}"><i class="${escapeHTML(opt.icon || 'fa-solid fa-circle')}"></i><span>${escapeHTML(opt.label)}</span></button>`).join(''));
                $modal.find('.afm-modal-confirm').prop('disabled', localItems.length === 0).css('opacity', localItems.length === 0 ? 0.5 : 1);
            };
            const finish = (result) => { $modal.remove(); resolve(result ? { value: selected, items: localItems } : null); };
            $modal.on('input', '.afm-import-name-input', function() { const idx = Number($(this).closest('.afm-import-preview-card').data('index')); if (localItems[idx]) localItems[idx].name = $(this).val().trim() || `头像框 ${idx + 1}`; });
            $modal.on('click', '.afm-import-delete-btn', async function(e) { e.preventDefault(); const idx = Number($(this).closest('.afm-import-preview-card').data('index')); const ok = await showAFMConfirmDialog({ title: '删除导入项', message: `确定从本次导入列表移除“${localItems[idx] ? localItems[idx].name : ''}”吗？`, okText: '删除', danger: true }); if (ok) { localItems.splice(idx, 1); render(); } });
            $modal.on('click', '.afm-page-btn', function() { const nav = $(this).data('nav'); const p = $(this).data('page'); if (nav === 'prev' && page > 0) page--; else if (nav === 'next' && page < totalPages() - 1) page++; else if (p !== undefined) page = Number(p); render(); });
            $modal.on('click', '.afm-import-targets .afm-modal-option', function() { selected = $(this).data('value'); render(); });
            $modal.on('click', '.afm-modal-confirm', () => finish(true));
            $modal.on('click', '.afm-modal-cancel, .afm-modal-mask', function(e) { if ($(e.target).is('.afm-modal-cancel, .afm-modal-mask')) finish(false); });
            $popup.append($modal);
            render();
        });

        // --- 绑定关闭逻辑 ---
        const closePopup = () => {
            if (themeBindingAppliedHandler) window.removeEventListener('afm-theme-binding-applied', themeBindingAppliedHandler);
            $popup.fadeOut(200, () => $popup.remove());
        };
        $popup.find('.nsk-close').on('click', closePopup);
        $popup.on('click', (e) => { if ($(e.target).hasClass('nsk-overlay')) closePopup(); });

        $popup.find('.nsk-tab').on('click', function() {
            const target = $(this).data('target');
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            $popup.find('.nsk-panel').removeClass('active');
            $popup.find('#' + target).addClass('active');
        });

        // ===========================
        // 6. 功能绑定
        // ===========================
        
        // 刷新网格
        const getActiveRole = () => ($popup.find('#grid-char').hasClass('active') ? 'char' : 'user');
        const getListByRole = (role) => role === 'user' ? currentData.userFrames : currentData.charFrames;
        const getGroups = (list) => Array.from(new Set((list || []).map(item => item.group || DEFAULT_GROUP))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
        const getAllGroups = (data) => getGroups([...(data.userFrames || []), ...(data.charFrames || [])]);
        const buildDisplayFrames = (role) => {
            const state = uiState[role];
            const keyword = (state.search || '').toLowerCase();
            let frames = getListByRole(role).map((item, index) => ({ ...item, _index: index }));
            if (state.group !== 'all') frames = frames.filter(item => (item.group || DEFAULT_GROUP) === state.group);
            if (keyword) frames = frames.filter(item => String(item.name || '').toLowerCase().includes(keyword));
            frames.sort((a, b) => {
                if (state.sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN') || ((a.order || 0) - (b.order || 0));
                if (state.sort === 'favorite') return (Number(!!b.favorite) - Number(!!a.favorite)) || ((a.order || 0) - (b.order || 0));
                return (a.order || 0) - (b.order || 0);
            });
            return frames;
        };
        const refreshControls = () => {
            const role = getActiveRole();
            const state = uiState[role];
            const groups = getGroups(getListByRole(role));
            if (state.group !== 'all' && !groups.includes(state.group)) state.group = 'all';
            $popup.find('.afm-search-input').val(state.search);
            $popup.find('.afm-sort-select').val(state.sort);
            $popup.find('.afm-group-filter').html(`<option value="all">全部分组</option>` + groups.map(group => `<option value="${escapeHTML(group)}">${escapeHTML(group)}</option>`).join('')).val(state.group);
        };
        const clampPageForRole = (role, total) => {
            const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / AFM_LIST_PAGE_SIZE));
            uiState[role].page = Math.min(Math.max(Number(uiState[role].page) || 0, 0), totalPages - 1);
        };
        const renderRoleGrid = (role) => {
            const gridId = role === 'user' ? 'grid-user' : 'grid-char';
            const activeSrc = role === 'user' ? currentData.activeUserSrc : currentData.activeCharSrc;
            const frames = buildDisplayFrames(role);
            clampPageForRole(role, frames.length);
            $popup.find('#grid-container').html(createGridHTML(gridId, frames, activeSrc, uiState[role].page));
            $popup.find('#' + gridId).addClass('active').show();
            $popup.find('#afm-list-pager-container').html(createPagerHTML(role, frames.length, uiState[role].page));
            if (isMultiMode) {
                $popup.find('.afm-grid.active .afm-card').each(function() {
                    const index = parseInt($(this).attr('data-index'));
                    $(this).toggleClass('multi-selected', selectedIndices.has(index));
                });
            }
            $popup.find('#grid-container').scrollTop(0);
        };
        const refreshGrids = async (role = getActiveRole()) => {
            currentData = await DataManager.load();
            renderRoleGrid(role);
            refreshControls();
        };

        const renderSettings = () => {
            $popup.find('#view-settings').html(createSettingsHTML(currentData));
            bindSettingsEvents(); 
        };

        const renderBindings = () => {
            $popup.find('#view-bindings').html(createBindingsHTML(currentData));
            bindBindingEvents();
        };

        function bindBindingEvents() {
            $popup.find('#afm-save-binding').on('click', async function() {
                const activeTheme = getCurrentThemeSnapshot();
                const themeId = String(activeTheme.id || '').trim();
                const themeName = String(activeTheme.name || themeId).trim() || themeId;
                currentData = await DataManager.load();
                const userFrameSrc = String(currentData.activeUserSrc || '').trim();
                const charFrameSrc = String(currentData.activeCharSrc || '').trim();
                if (!themeId) {
                    if (window.toastr) toastr.warning('未检测到当前美化，无法保存绑定');
                    return;
                }
                if (!userFrameSrc && !charFrameSrc) {
                    if (window.toastr) toastr.warning('当前 User 和 Char 都没有应用头像框，无法保存绑定');
                    return;
                }
                currentData.themeBindings[themeId] = {
                    themeId,
                    themeName,
                    userFrameSrc,
                    charFrameSrc,
                    userSettings: normalizeBindingSettings(currentData.userSettings),
                    charSettings: normalizeBindingSettings(currentData.charSettings),
                    updatedAt: Date.now()
                };
                if (activeTheme.id === themeId) {
                    currentData.activeUserSrc = userFrameSrc || null;
                    currentData.activeCharSrc = charFrameSrc || null;
                    if (userFrameSrc) currentData.userSettings = normalizeBindingSettings(currentData.themeBindings[themeId].userSettings);
                    if (charFrameSrc) currentData.charSettings = normalizeBindingSettings(currentData.themeBindings[themeId].charSettings);
                }
                await DataManager.save(currentData);
                await applyInjectedCSS(currentData);
                renderRoleGrid(getActiveRole());
                renderSettings();
                renderBindings();
                if (window.toastr) toastr.success('美化绑定已保存');
            });
            $popup.find('#afm-delete-binding').on('click', async function() {
                const themeId = String(getCurrentThemeSnapshot().id || '').trim();
                if (!themeId || !currentData.themeBindings[themeId]) return;
                const ok = await showAFMConfirmDialog({ title: '删除美化绑定', message: `确定删除“${themeId}”的美化绑定吗？`, okText: '删除', danger: true });
                if (!ok) return;
                currentData = await DataManager.load();
                delete currentData.themeBindings[themeId];
                if (getCurrentThemeSnapshot().id === themeId) {
                    currentData.activeUserSrc = null;
                    currentData.activeCharSrc = null;
                }
                await DataManager.save(currentData);
                await applyInjectedCSS(currentData);
                renderRoleGrid(getActiveRole());
                renderSettings();
                renderBindings();
                if (window.toastr) toastr.success('美化绑定已删除');
            });
        }

        await refreshGrids();
        bindBindingEvents();
        themeBindingAppliedHandler = async () => {
            currentData = await DataManager.load();
            renderRoleGrid(getActiveRole());
            renderSettings();
            renderBindings();
        };
        window.addEventListener('afm-theme-binding-applied', themeBindingAppliedHandler);

        // 退出多选模式
        const exitMultiMode = () => {
            isMultiMode = false;
            selectedIndices.clear();
            $popup.removeClass('multi-mode');
            $popup.find('#btn-multi-select').removeClass('active-mode');
            $popup.find('.afm-bottom-multi').addClass('afm-hidden');
            $popup.find('.afm-bottom-default').removeClass('afm-hidden');
            $popup.find('.afm-card').removeClass('multi-selected');
            $popup.find('.multi-count').text('0');
        };

        // 绑定设置页面的事件
        function bindSettingsEvents() {
            $popup.find('#afm-check-update').on('click', async function() {
                extensionUpdateState.phase = 'checking';
                extensionUpdateState.message = '正在检查 GitHub 更新...';
                extensionUpdateState.canUpdate = false;
                renderSettings();
                await checkExtensionUpdate();
                renderSettings();
            });

            $popup.find('#afm-apply-update').on('click', async function() {
                extensionUpdateState.phase = 'updating';
                extensionUpdateState.message = '正在更新扩展...';
                extensionUpdateState.canUpdate = false;
                renderSettings();
                await updateExtensionFromSettings();
                if ($('.nsk-overlay').length) renderSettings();
            });

            $popup.find('#opt-pseudo-target').on('change', async function() {
                currentData.pseudoTarget = $(this).is(':checked') ? 'before' : 'after';
                await DataManager.save(currentData);
                await applyInjectedCSS();
            });

            $popup.find('.afm-num-input').on('focus', function() {
                $(this).data('focus-val', $(this).val());
            });

            const markSettingDirty = (group) => {
                $popup.find(`.afm-save-setting-btn[data-target="${group}"]`).addClass('dirty');
            };

            const readPendingSettings = (group) => {
                const base = currentData[group] || DEFAULT_CONFIG;
                const pending = { ...base };
                ['top', 'left', 'width', 'height'].forEach(key => {
                    const $input = $popup.find(`.afm-num-input[data-group="${group}"][data-key="${key}"]`);
                    let val = parseInt($input.val());
                    if (isNaN(val)) val = Number(base[key]) || 0;
                    pending[key] = val;
                    $popup.find(`.afm-slider[data-group="${group}"][data-key="${key}"], .afm-num-input[data-group="${group}"][data-key="${key}"]`).val(val);
                });
                return pending;
            };

            $popup.find('.afm-slider, .afm-num-input').on('input', function() {
                const group = $(this).data('group');
                const key = $(this).data('key');
                let val = parseInt($(this).val());
                
                if (!isNaN(val)) {
                    const selector = `.afm-slider[data-group="${group}"][data-key="${key}"], .afm-num-input[data-group="${group}"][data-key="${key}"]`;
                    $popup.find(selector).not(this).val(val);
                    markSettingDirty(group);
                }
            });

            // 失焦只修正非法输入，不再自动保存，避免移动端数字输入乱跳
            $popup.find('.afm-num-input').on('blur', function() {
                const group = $(this).data('group');
                const key = $(this).data('key');
                let val = parseInt($(this).val());
                if (isNaN(val)) {
                    const saved = currentData[group] || DEFAULT_CONFIG;
                    val = Number(saved[key]);
                    if (isNaN(val)) val = parseInt($(this).data('focus-val')) || 0;
                    $(this).val(val);
                    $popup.find(`.afm-slider[data-group="${group}"][data-key="${key}"]`).val(val);
                }
            });

            $popup.find('.afm-save-setting-btn').on('click', async function() {
                const target = $(this).data('target');
                currentData[target] = readPendingSettings(target);
                await DataManager.save(currentData);
                await applyInjectedCSS(currentData);
                $(this).removeClass('dirty');
                if(window.toastr) toastr.success(`${target === 'userSettings' ? 'User' : 'Char'} 头像框调整已保存`);
            });

            $popup.find('.afm-reset-setting-btn').on('click', async function() {
                const target = $(this).data('target'); 
                currentData[target] = { ...DEFAULT_CONFIG }; 
                await DataManager.save(currentData);
                await applyInjectedCSS();
                renderSettings(); 
                if(window.toastr) toastr.success("设置已重置");
            });
        }
        bindSettingsEvents();

        // 绑定二级 Tab (User/Char)
        $popup.find('.afm-sub-tab').on('click', function() {
            if (isMultiMode) exitMultiMode();
            const target = $(this).data('target');
            const role = target === 'grid-char' ? 'char' : 'user';
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            renderRoleGrid(role);
            refreshControls();
        });

        // 绑定多选按钮
        $popup.find('#btn-multi-select').on('click', function() {
            const $activeGrid = $popup.find('.afm-grid.active');
            if ($activeGrid.find('.afm-empty-state').length > 0) return;

            if (isMultiMode) {
                exitMultiMode();
            } else {
                isMultiMode = true;
                selectedIndices.clear();
                $popup.addClass('multi-mode');
                $(this).addClass('active-mode');
                $popup.find('.afm-bottom-default').addClass('afm-hidden');
                $popup.find('.afm-bottom-multi').removeClass('afm-hidden');
                $popup.find('.multi-count').text('0');
            }
        });

        $popup.find('.afm-cancel-multi-btn').on('click', exitMultiMode);

        $popup.find('.afm-select-all-btn').on('click', function() {
            const role = getActiveRole();
            const displayIndices = buildDisplayFrames(role).map(item => Number(item._index)).filter(index => !isNaN(index));
            const allSelected = displayIndices.length > 0 && displayIndices.every(index => selectedIndices.has(index));
            displayIndices.forEach(index => {
                if (allSelected) selectedIndices.delete(index);
                else selectedIndices.add(index);
            });
            $popup.find('.afm-grid.active .afm-card').each(function() {
                const index = parseInt($(this).attr('data-index'));
                $(this).toggleClass('multi-selected', selectedIndices.has(index));
            });
            $popup.find('.multi-count').text(selectedIndices.size);
        });

        $popup.find('.afm-export-multi-btn').on('click', async function() {
            if (selectedIndices.size === 0) {
                if (window.toastr) toastr.warning('请先选择要导出的头像框');
                return;
            }
            const ok = await showAFMConfirmDialog({ title: '导出选中 ZIP', message: `确定要导出当前选中的 ${selectedIndices.size} 个头像框吗？`, okText: '继续导出' });
            if (!ok) return;
            const prefix = await showAFMTextDialog({ title: '备份文件名前缀', message: '可自定义 ZIP 文件名前缀，留空使用“头像框备份”。', value: '头像框备份' });
            if (prefix === null) return;
            currentData = await DataManager.load();
            const role = getActiveRole();
            const zip = await buildBackupZip(currentData, role, new Set(selectedIndices));
            downloadBlob(zip, makeBackupZipName(prefix, role));
            if (window.toastr) toastr.success(`已导出 ${selectedIndices.size} 个选中头像框 ZIP`);
        });

        // 列表分页
        $popup.on('click', '.afm-list-pager .afm-page-btn', async function() {
            const nav = $(this).data('nav');
            const role = getActiveRole();
            const frames = buildDisplayFrames(role);
            const totalPages = Math.max(1, Math.ceil(frames.length / AFM_LIST_PAGE_SIZE));
            if (nav === 'prev' && uiState[role].page > 0) uiState[role].page -= 1;
            if (nav === 'next' && uiState[role].page < totalPages - 1) uiState[role].page += 1;
            renderRoleGrid(role);
        });

        // 卡片点击逻辑
        $popup.on('click', '.afm-card', async function(e) {
            const $card = $(this);
            const index = parseInt($card.attr('data-index'));

            if (isMultiMode) {
                if (selectedIndices.has(index)) {
                    selectedIndices.delete(index);
                    $card.removeClass('multi-selected');
                } else {
                    selectedIndices.add(index);
                    $card.addClass('multi-selected');
                }
                $popup.find('.multi-count').text(selectedIndices.size);
                return;
            }

            if ($(e.target).closest('.afm-action-btn').length > 0) return;

            const $grid = $card.closest('.afm-grid');
            const isUser = $grid.attr('id') === 'grid-user';
            const imgSrc = $card.find('img').attr('src');

            $grid.find('.afm-card').removeClass('active');
            $card.addClass('active');

            currentData = await DataManager.load();
            const list = isUser ? currentData.userFrames : currentData.charFrames;
            const frameName = (list[index] && list[index].name) ? list[index].name : '未命名头像框';
            if (isUser) currentData.activeUserSrc = imgSrc;
            else currentData.activeCharSrc = imgSrc;
            await DataManager.save(currentData);
            await applyInjectedCSS(currentData);
            if (window.toastr) toastr.success(`已更换${isUser ? 'user' : 'char'}头像框为${frameName}`);
        });

        // 收藏切换
        $popup.on('click', '.afm-action-btn.favorite', async function(e) {
            e.stopPropagation();
            if (isMultiMode) return;
            const $card = $(this).closest('.afm-card');
            const index = parseInt($card.attr('data-index'));
            const isUser = $card.closest('.afm-grid').attr('id') === 'grid-user';
            currentData = await DataManager.load();
            const list = isUser ? currentData.userFrames : currentData.charFrames;
            if (!list[index]) return;
            list[index].favorite = !list[index].favorite;
            await DataManager.save(currentData);
            await refreshGrids();
        });

        // 编辑分组
        $popup.on('click', '.afm-action-btn.group', async function(e) {
            e.stopPropagation();
            if (isMultiMode) return;
            const $card = $(this).closest('.afm-card');
            const index = parseInt($card.attr('data-index'));
            const isUser = $card.closest('.afm-grid').attr('id') === 'grid-user';
            currentData = await DataManager.load();
            const list = isUser ? currentData.userFrames : currentData.charFrames;
            if (!list[index]) return;
            const oldGroup = list[index].group || DEFAULT_GROUP;
            const newGroup = await showAFMGroupDialog({ title: '编辑分组', message: '请选择已有分组，或新建一个分组。', groups: getAllGroups(currentData), value: oldGroup });
            if (newGroup === null) return;
            list[index].group = newGroup;
            await DataManager.save(currentData);
            await refreshGrids();
        });

        // 批量分组
        $popup.find('.afm-group-multi-btn').on('click', async function() {
            if (selectedIndices.size === 0) {
                if (window.toastr) toastr.warning('请先选择要分组的头像框');
                return;
            }
            const activeGridId = $popup.find('.afm-grid.active').attr('id');
            const isUser = activeGridId === 'grid-user';
            currentData = await DataManager.load();
            const list = isUser ? currentData.userFrames : currentData.charFrames;
            const selectedList = Array.from(selectedIndices).map(idx => list[idx]).filter(Boolean);
            if (selectedList.length === 0) return;
            const oldGroup = selectedList[0].group || DEFAULT_GROUP;
            const sameGroup = selectedList.every(item => (item.group || DEFAULT_GROUP) === oldGroup);
            const newGroup = await showAFMGroupDialog({ title: '批量分组', message: `将 ${selectedList.length} 个选中头像框移动到指定分组。`, groups: getAllGroups(currentData), value: sameGroup ? oldGroup : DEFAULT_GROUP });
            if (newGroup === null) return;
            selectedList.forEach(item => { item.group = newGroup; });
            await DataManager.save(currentData);
            await refreshGrids();
            exitMultiMode();
            if (window.toastr) toastr.success(`已将 ${selectedList.length} 个头像框移动到“${newGroup}”分组`);
        });

        // 批量删除
        $popup.find('.afm-delete-multi-btn').on('click', async function() {
            if (selectedIndices.size === 0) return;
            const ok = await showAFMConfirmDialog({ title: '批量删除头像框', message: `确定要删除选中的 ${selectedIndices.size} 个头像框吗？此操作不可恢复。`, okText: '删除', danger: true });
            if (ok) {
                const activeGridId = $popup.find('.afm-grid.active').attr('id');
                const isUser = activeGridId === 'grid-user';
                currentData = await DataManager.load();
                const list = isUser ? currentData.userFrames : currentData.charFrames;
                const indicesArray = Array.from(selectedIndices).sort((a, b) => b - a);
                indicesArray.forEach(idx => {
                    if (list[idx]) {
                        const deletedSrc = list[idx].src;
                        if (isUser && currentData.activeUserSrc === deletedSrc) currentData.activeUserSrc = null;
                        if (!isUser && currentData.activeCharSrc === deletedSrc) currentData.activeCharSrc = null;
                        clearFrameFromThemeBindings(currentData, isUser ? 'user' : 'char', deletedSrc);
                        list.splice(idx, 1);
                    }
                });
                await DataManager.save(currentData);
                await applyInjectedCSS();
                exitMultiMode();
                await refreshGrids();
                renderBindings();
                if (window.toastr) toastr.success(`成功删除 ${indicesArray.length} 个头像框`);
            }
        });

        // 恢复默认
        $popup.find('.afm-restore-btn').on('click', async function() {
            const activeGridId = $popup.find('.afm-grid.active').attr('id');
            const isUser = activeGridId === 'grid-user';
            if ($popup.find('#' + activeGridId + ' .afm-empty-state').length > 0) return;
            $popup.find('#' + activeGridId + ' .afm-card').removeClass('active');
            currentData = await DataManager.load();
            if (isUser) currentData.activeUserSrc = null;
            else currentData.activeCharSrc = null;
            await DataManager.save(currentData);
            await applyInjectedCSS();
            if (window.toastr) toastr.success("已恢复默认头像框");
        });

        // 重命名
        $popup.on('click', '.afm-action-btn.rename', async function(e) {
            e.stopPropagation();
            if (isMultiMode) return;
            const $card = $(this).closest('.afm-card');
            const index = parseInt($card.attr('data-index')); 
            const isUser = $card.closest('.afm-grid').attr('id') === 'grid-user';
            currentData = await DataManager.load();
            const list = isUser ? currentData.userFrames : currentData.charFrames;
            if (!list[index]) return;
            const newName = await showAFMTextDialog({ title: '重命名头像框', message: '请输入新的头像框名称。', value: list[index].name });
            if (newName && newName.trim() !== "") {
                list[index].name = newName.trim();
                await DataManager.save(currentData);
                await refreshGrids(); 
            }
        });

        // 单个删除
        $popup.on('click', '.afm-action-btn.del', async function(e) {
            e.stopPropagation();
            if (isMultiMode) return;
            const $card = $(this).closest('.afm-card');
            const index = parseInt($card.attr('data-index'));
            const isUser = $card.closest('.afm-grid').attr('id') === 'grid-user';
            const ok = await showAFMConfirmDialog({ title: '删除头像框', message: '确定要删除这个头像框吗？此操作不可恢复。', okText: '删除', danger: true });
            if(ok) {
                currentData = await DataManager.load();
                const list = isUser ? currentData.userFrames : currentData.charFrames;
                if (!list[index]) return;
                const deletedSrc = list[index].src;
                if (isUser && currentData.activeUserSrc === deletedSrc) { currentData.activeUserSrc = null; await applyInjectedCSS(); }
                if (!isUser && currentData.activeCharSrc === deletedSrc) { currentData.activeCharSrc = null; await applyInjectedCSS(); }
                clearFrameFromThemeBindings(currentData, isUser ? 'user' : 'char', deletedSrc);
                list.splice(index, 1);
                await DataManager.save(currentData);
                await refreshGrids();
                renderBindings();
            }
        });

        // 导出
        $popup.find('#btn-export-json').on('click', async function() {
            currentData = await DataManager.load();
            const exportData = {
                userFrames: currentData.userFrames,
                charFrames: currentData.charFrames,
                userSettings: currentData.userSettings,
                charSettings: currentData.charSettings,
                pseudoTarget: currentData.pseudoTarget,
                themeBindings: currentData.themeBindings
            };
            downloadJSON(exportData, 'Avatar_Frames_Backup.json');
        });

        $popup.on('click', '#btn-export-zip', async function() {
            const role = getActiveRole();
            const roleLabel = getRoleLabel(role);
            const ok = await showAFMConfirmDialog({ title: `导出 ${roleLabel} ZIP 备份`, message: `确定要导出当前 ${roleLabel} 列表的 ZIP 备份吗？备份会包含该列表头像框图片和配置文件。`, okText: '继续导出' });
            if (!ok) return;
            const prefix = await showAFMTextDialog({ title: '备份文件名前缀', message: '可自定义 ZIP 文件名前缀，留空使用“头像框备份”。', value: '头像框备份' });
            if (prefix === null) return;
            currentData = await DataManager.load();
            const zip = await buildBackupZip(currentData, role);
            downloadBlob(zip, makeBackupZipName(prefix, role));
            if (window.toastr) toastr.success(`${roleLabel} ZIP 备份已导出`);
        });

        $popup.on('click', '#btn-export-zip-all', async function() {
            const ok = await showAFMConfirmDialog({ title: '导出完整 ZIP 备份', message: '确定要导出完整头像框 ZIP 备份吗？备份会包含 User/Char 头像框图片和配置文件。', okText: '继续导出' });
            if (!ok) return;
            const prefix = await showAFMTextDialog({ title: '备份文件名前缀', message: '可自定义 ZIP 文件名前缀，留空使用“头像框备份”。', value: '头像框备份' });
            if (prefix === null) return;
            currentData = await DataManager.load();
            const zip = await buildBackupZip(currentData);
            downloadBlob(zip, makeBackupZipName(prefix, '总备份'));
            if (window.toastr) toastr.success('完整 ZIP 备份已导出');
        });

        $popup.on('click', '#btn-import-plugin-zip', function() {
            $popup.find('#afm-zip-input').click();
        });

        $popup.on('change', '#afm-zip-input', async function(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const ok = await showAFMConfirmDialog({ title: '导入本插件备份 ZIP', message: `确定要导入“${file.name}”吗？仅支持本插件导出的备份 ZIP，导入会合并头像框并恢复配置。`, okText: '继续导入' });
            if (!ok) { $(this).val(''); return; }
            try {
                const backup = await importPluginBackupZip(file);
                currentData = await DataManager.load();
                const mergeList = (targetList, sourceList) => {
                    let count = 0;
                    (sourceList || []).forEach(item => {
                        if (item.src && !targetList.some(ex => ex.src === item.src)) {
                            const maxOrder = targetList.reduce((max, frame) => Math.max(max, Number(frame.order) || 0), 0);
                            targetList.push({ ...item, favorite: !!item.favorite, group: (item.group || DEFAULT_GROUP), createdAt: Number(item.createdAt) || Date.now(), order: Number(item.order) || (maxOrder + 1) });
                            count++;
                        }
                    });
                    return count;
                };
                const added = mergeList(currentData.userFrames, backup.userFrames) + mergeList(currentData.charFrames, backup.charFrames);
                if (backup.userSettings) currentData.userSettings = { ...backup.userSettings };
                if (backup.charSettings) currentData.charSettings = { ...backup.charSettings };
                if (backup.pseudoTarget) currentData.pseudoTarget = backup.pseudoTarget;
                if (backup.themeBindings) currentData.themeBindings = { ...currentData.themeBindings, ...normalizeThemeBindings(backup.themeBindings) };
                await DataManager.save(currentData);
                await refreshGrids();
                await applyInjectedCSS();
                renderSettings();
                renderBindings();
                if (window.toastr) toastr.success(`ZIP 备份导入完成，新增 ${added} 个头像框，并已恢复配置`);
            } catch (err) {
                if (window.toastr) toastr.error('ZIP 导入失败: ' + err.message);
            }
            $(this).val('');
        });

        // 导入 JSON
        $popup.find('#btn-import-json').on('click', function() {
            $popup.find('#afm-json-input').click();
        });

        $popup.find('#afm-json-input').on('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    currentData = await DataManager.load();
                    let addedCount = 0;
                    const mergeList = (targetList, sourceList) => {
                        if (!sourceList || !Array.isArray(sourceList)) return;
                        sourceList.forEach(item => {
                            if (item.src && item.name) {
                                if (!targetList.some(ex => ex.src === item.src)) {
                                    const maxOrder = targetList.reduce((max, frame) => Math.max(max, Number(frame.order) || 0), 0);
                                    targetList.push({ ...item, favorite: !!item.favorite, group: (item.group || DEFAULT_GROUP), createdAt: Number(item.createdAt) || Date.now(), order: Number(item.order) || (maxOrder + 1) });
                                    addedCount++;
                                }
                            }
                        });
                    };
                    if (json.userFrames || json.charFrames) {
                        mergeList(currentData.userFrames, json.userFrames);
                        mergeList(currentData.charFrames, json.charFrames);
                        if (json.userSettings) currentData.userSettings = { ...json.userSettings };
                        if (json.charSettings) currentData.charSettings = { ...json.charSettings };
                        if (json.pseudoTarget) currentData.pseudoTarget = json.pseudoTarget;
                        if (json.themeBindings) currentData.themeBindings = { ...currentData.themeBindings, ...normalizeThemeBindings(json.themeBindings) };
                    } 
                    else if (Array.isArray(json)) {
                        const isUser = $popup.find('#grid-user').hasClass('active');
                        const list = isUser ? currentData.userFrames : currentData.charFrames;
                        mergeList(list, json);
                    }
                    if (addedCount > 0 || json.userSettings || json.themeBindings) {
                        await DataManager.save(currentData);
                        await refreshGrids();
                        await applyInjectedCSS(); 
                        renderSettings(); 
                        renderBindings();
                        if (window.toastr) toastr.success(`导入成功，新增 ${addedCount} 个`);
                    } else {
                        if (window.toastr) toastr.warning("未发现新数据");
                    }
                } catch (err) { if (window.toastr) toastr.error("导入失败: " + err.message); }
                $(this).val('');
            };
            reader.readAsText(file);
        });

        // 清空列表
        $popup.find('#btn-clear-all').on('click', async function() {
            const isUser = $popup.find('#grid-user').hasClass('active');
            if ($popup.find('#grid-' + (isUser?'user':'char') + ' .afm-empty-state').length > 0) return;
            const roleName = isUser ? "User" : "Char";
            const ok = await showAFMConfirmDialog({ title: `清空 ${roleName} 列表`, message: `确定要清空 ${roleName} 列表下的所有头像框吗？此操作不可恢复！`, okText: '清空', danger: true });
            if (ok) {
                currentData = await DataManager.load();
                if (isUser) {
                    currentData.userFrames.forEach(frame => clearFrameFromThemeBindings(currentData, 'user', frame.src));
                    currentData.userFrames = [];
                    currentData.activeUserSrc = null;
                } else {
                    currentData.charFrames.forEach(frame => clearFrameFromThemeBindings(currentData, 'char', frame.src));
                    currentData.charFrames = [];
                    currentData.activeCharSrc = null;
                }
                await DataManager.save(currentData);
                await applyInjectedCSS();
                await refreshGrids();
                renderBindings();
                if (isMultiMode) exitMultiMode();
                if (window.toastr) toastr.success("列表已清空");
            }
        });

        // 导入图片
        $popup.find('.afm-import-btn').on('click', function() {
            $popup.find('#afm-file-input').click();
        });

        $popup.find('#afm-file-input').on('change', async function(e) {
            const selectedFiles = Array.from(e.target.files || []);
            const activeRole = $popup.find('#grid-char').hasClass('active') ? 'char' : 'user';
            const initialItems = [];
            try {
                for (const file of selectedFiles) {
                    const isZip = /\.zip$/i.test(file.name || '') || /(?:application\/zip|application\/x-zip-compressed)/i.test(file.type || '');
                    if (isZip) {
                        initialItems.push(...await extractGifItemsFromZip(file));
                        continue;
                    }
                    if (file.type && !file.type.startsWith('image/')) continue;
                    const previewUrl = URL.createObjectURL(file);
                    initialItems.push({ src: previewUrl, previewUrl, blob: file, name: getFrameNameFromFile(file, initialItems.length + 1) });
                }
                if (initialItems.length === 0) {
                    if (window.toastr) toastr.warning('未找到可导入的图片；ZIP 中只会读取 GIF 文件');
                    return;
                }
                const importPlan = await askImportTarget(activeRole, initialItems, showAFMImportPreviewDialog);
                if (!importPlan || !importPlan.roles || importPlan.items.length === 0) return;
                const persistedItems = await persistImportedImages(importPlan.items);
                currentData = await DataManager.load();
                let addedCount = 0;
                const now = Date.now();
                importPlan.roles.forEach(role => {
                    const list = role === 'user' ? currentData.userFrames : currentData.charFrames;
                    const existingSources = new Set(list.map(item => item.src));
                    let maxOrder = list.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
                    persistedItems.forEach(item => {
                        if (!item.src || existingSources.has(item.src)) return;
                        maxOrder += 1;
                        existingSources.add(item.src);
                        list.push({ src: item.src, name: item.name, favorite: false, group: DEFAULT_GROUP, createdAt: now + addedCount, order: maxOrder });
                        addedCount++;
                    });
                });
                if (addedCount > 0) {
                    await DataManager.save(currentData);
                    renderRoleGrid(getActiveRole());
                    refreshControls();
                    renderBindings();
                    const targetText = importPlan.roles.map(getRoleLabel).join(' + ');
                    if (window.toastr) toastr.success(`成功导入 ${addedCount} 条头像框记录到 ${targetText}`);
                } else if (window.toastr) toastr.warning('所选图片已存在，未新增数据');
            } catch (error) {
                if (window.toastr) toastr.error(`头像框导入失败：${error.message || error}`);
            } finally {
                releaseImportPreviews(initialItems);
                $(this).val('');
            }
        });
        // 搜索 / 排序 / 分组筛选
        $popup.find('.afm-search-input').on('input', function() {
            const role = getActiveRole();
            uiState[role].search = $(this).val().toLowerCase();
            uiState[role].page = 0;
            renderRoleGrid(role);
            refreshControls();
        });
        $popup.find('.afm-sort-select').on('change', function() {
            const role = getActiveRole();
            uiState[role].sort = $(this).val();
            uiState[role].page = 0;
            renderRoleGrid(role);
            refreshControls();
        });
        $popup.find('.afm-group-filter').on('change', function() {
            const role = getActiveRole();
            uiState[role].group = $(this).val();
            uiState[role].page = 0;
            renderRoleGrid(role);
            refreshControls();
        });
    }

    // ===========================
    // 7. 菜单注册
    // ===========================
    function injectToExtensionsMenu() {
        const $menu = $('#extensionsMenu');
        if ($menu.length > 0 && $(`#${MENU_BTN_ID}`).length === 0) {
            const $menuItem = $(`
                <div id="${MENU_BTN_ID}" class="list-group-item flex-container flexGap5 interactable" title="${SCRIPT_NAME}">
                    <i class="fa-solid fa-crop-simple"></i>
                    <span>${SCRIPT_NAME}</span>
                </div>
            `);
            $menuItem.on('click', showManagerUI);
            $menu.append($menuItem);
        }
    }
    
    if (window.__afmMenuWatcherTimer) clearInterval(window.__afmMenuWatcherTimer);
    window.__afmMenuWatcherTimer = setInterval(injectToExtensionsMenu, 2000);
    setTimeout(injectToExtensionsMenu, 500);
    installThemeBindingWatcher();
    window.__afmHotCleanup = () => {
        if (window.__afmMenuWatcherTimer) clearInterval(window.__afmMenuWatcherTimer);
        if (window.__afmThemeBindingWatcherTimer) clearInterval(window.__afmThemeBindingWatcherTimer);
        if (window.__afmThemeBindingDebounceTimer) clearTimeout(window.__afmThemeBindingDebounceTimer);
        $('#themes').removeData('afm-theme-watcher-bound').off('change.afmThemeBinding');
        $('.nsk-overlay').remove();
        $(`#${MENU_BTN_ID}`).remove();
        $(`#${STYLE_ID}`).remove();
        $(`#${APPLIED_STYLE_ID}`).remove();
    };

})();
