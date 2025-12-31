"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappService = exports.WhatsAppService = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DatabaseService_1 = require("./services/DatabaseService");
const ConnectionManager_1 = require("./services/ConnectionManager");
const MediaService_1 = require("./services/MediaService");
// Logger configuration
const logger = (0, pino_1.default)({ level: 'info' });
class WhatsAppService {
    constructor() {
        this.instances = new Map();
        this.latestVersion = null;
        this.baseAuthDir = path_1.default.resolve(__dirname, '..', 'sessions');
        this.loadExistingSessions();
    }
    loadExistingSessions() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!fs_1.default.existsSync(this.baseAuthDir)) {
                fs_1.default.mkdirSync(this.baseAuthDir, { recursive: true });
                return;
            }
            const folders = fs_1.default.readdirSync(this.baseAuthDir);
            for (const folder of folders) {
                const folderPath = path_1.default.join(this.baseAuthDir, folder);
                if (fs_1.default.lstatSync(folderPath).isDirectory()) {
                    console.log(`📦 Restaurando sessão: ${folder}`);
                    this.initialize(folder).catch(console.error);
                }
            }
        });
    }
    getBaileysVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.latestVersion) {
                const { version, isLatest } = yield (0, baileys_1.fetchLatestBaileysVersion)();
                this.latestVersion = version;
                console.log(`📦 Usando Baileys v${version} (Latest: ${isLatest})`);
            }
            return this.latestVersion;
        });
    }
    initialize(instanceKey) {
        return __awaiter(this, void 0, void 0, function* () {
            // Anti-duplicação de conexão
            if (ConnectionManager_1.connectionManager.isInitializing(instanceKey)) {
                console.log(`⚠️ Instância [${instanceKey}] já está inicializando. Abortando duplicata.`);
                return;
            }
            const currentState = this.instances.get(instanceKey);
            if ((currentState === null || currentState === void 0 ? void 0 : currentState.status) === 'connected')
                return;
            ConnectionManager_1.connectionManager.setInitializing(instanceKey, true);
            try {
                // Cleanup: Garante que a conexão anterior morreu de verdade
                if (currentState === null || currentState === void 0 ? void 0 : currentState.sock) {
                    yield ConnectionManager_1.connectionManager.cleanupSocket(currentState.sock);
                }
                yield this.getBaileysVersion();
                const authDir = path_1.default.join(this.baseAuthDir, instanceKey);
                const { state, saveCreds } = yield (0, baileys_1.useMultiFileAuthState)(authDir);
                const sock = (0, baileys_1.default)({
                    version: this.latestVersion,
                    logger,
                    printQRInTerminal: false, // Usar interface do CRM agora
                    auth: {
                        creds: state.creds,
                        keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, logger),
                    },
                    browser: [`Grupo RVL [${instanceKey}]`, 'Chrome', '1.0.0'],
                    generateHighQualityLinkPreview: true,
                    syncFullHistory: true,
                    shouldIgnoreJid: (jid) => jid.includes('status@broadcast'),
                    linkPreviewImageThumbnailWidth: 192,
                });
                this.instances.set(instanceKey, { sock, qr: null, status: 'connecting' });
                yield DatabaseService_1.databaseService.syncInstanceStatus(instanceKey, 'connecting', null);
                // 🔥 ITEM 3: Cleanup de Listeners (Memory Leak Fix)
                // Removemos qualquer listener antigo para esta instância antes de registrar novos
                sock.ev.removeAllListeners('creds.update');
                sock.ev.removeAllListeners('connection.update');
                sock.ev.removeAllListeners('messages.upsert');
                sock.ev.removeAllListeners('messaging-history.set');
                sock.ev.removeAllListeners('messages.update');
                // Listeners
                sock.ev.on('creds.update', saveCreds);
                sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(instanceKey, update));
                sock.ev.on('messages.upsert', (_a) => __awaiter(this, [_a], void 0, function* ({ messages, type }) {
                    if (type === 'notify') {
                        for (const msg of messages) {
                            try {
                                yield this.processIncomingMessage(msg, instanceKey);
                            }
                            catch (e) {
                                console.error(`Erro [${instanceKey}] ao processar mensagem:`, e);
                            }
                        }
                    }
                }));
                sock.ev.on('messaging-history.set', (_a) => __awaiter(this, [_a], void 0, function* ({ chats, messages }) {
                    console.log(`📚 Sincronização de histórico [${instanceKey}]: ${chats.length} chats recebidos.`);
                    const activeChats = chats
                        .filter(c => !c.readOnly && c.id && (c.id.endsWith('@s.whatsapp.net') || c.id.endsWith('@lid')))
                        .sort((a, b) => (Number(b.conversationTimestamp) || 0) - (Number(a.conversationTimestamp) || 0));
                    for (const chat of activeChats) {
                        try {
                            const chatMsgs = messages
                                .filter(m => m.key.remoteJid === chat.id)
                                .sort((a, b) => (Number(b.messageTimestamp) || 0) - (Number(a.messageTimestamp) || 0))
                                .slice(0, 50);
                            if (chatMsgs.length > 0) {
                                for (const m of chatMsgs.reverse()) {
                                    yield this.processIncomingMessage(m, instanceKey, true);
                                }
                            }
                            else {
                                yield DatabaseService_1.databaseService.upsertChat(chat.id, instanceKey, chat.name || 'Desconhecido', '[Histórico]', new Date().toISOString(), true);
                            }
                        }
                        catch (e) { }
                    }
                }));
                sock.ev.on('messages.update', (updates) => __awaiter(this, void 0, void 0, function* () {
                    for (const update of updates) {
                        if (update.update.status) {
                            yield DatabaseService_1.databaseService.updateMessageStatus(update.key.id, update.update.status);
                        }
                    }
                }));
            }
            catch (error) {
                console.error(`❌ Erro crítico na instância ${instanceKey}:`, error);
                this.updateInstanceState(instanceKey, { status: 'disconnected' });
                yield DatabaseService_1.databaseService.syncInstanceStatus(instanceKey, 'disconnected', null);
            }
            finally {
                ConnectionManager_1.connectionManager.setInitializing(instanceKey, false);
            }
        });
    }
    updateInstanceState(key, updates) {
        const current = this.instances.get(key) || { sock: null, qr: null, status: 'disconnected' };
        this.instances.set(key, Object.assign(Object.assign({}, current), updates));
    }
    handleConnectionUpdate(instanceKey, update) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const { connection, lastDisconnect, qr } = update;
            if (connection === 'close') {
                const { should, delay } = ConnectionManager_1.connectionManager.shouldReconnect(instanceKey, lastDisconnect);
                console.log(`🔴 Conexão [${instanceKey}] FECHADA. Reconectando em ${delay}ms: ${should}`);
                this.updateInstanceState(instanceKey, { status: 'disconnected', qr: null });
                yield DatabaseService_1.databaseService.syncInstanceStatus(instanceKey, 'disconnected', null);
                if (should) {
                    setTimeout(() => this.initialize(instanceKey), delay);
                }
                else if (((_b = (_a = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode) === baileys_1.DisconnectReason.loggedOut) {
                    console.log(`❌ Logout na instância [${instanceKey}]. Limpando arquivos...`);
                    const authDir = path_1.default.join(this.baseAuthDir, instanceKey);
                    if (fs_1.default.existsSync(authDir))
                        fs_1.default.rmSync(authDir, { recursive: true, force: true });
                }
            }
            else if (connection === 'open') {
                const sock = (_c = this.instances.get(instanceKey)) === null || _c === void 0 ? void 0 : _c.sock;
                const user = sock === null || sock === void 0 ? void 0 : sock.user;
                console.log(`✅ Instância [${instanceKey}] CONECTADA: ${user === null || user === void 0 ? void 0 : user.id.split(':')[0]}`);
                ConnectionManager_1.connectionManager.resetAttempts(instanceKey);
                this.updateInstanceState(instanceKey, { status: 'connected', qr: null });
                yield DatabaseService_1.databaseService.syncInstanceStatus(instanceKey, 'connected', null);
                if (user === null || user === void 0 ? void 0 : user.id) {
                    yield DatabaseService_1.databaseService.updateInstanceDetails(instanceKey, user.id.split(':')[0], user.name || '');
                }
            }
            if (qr) {
                this.updateInstanceState(instanceKey, { qr, status: 'connecting' });
                yield DatabaseService_1.databaseService.syncInstanceStatus(instanceKey, 'connecting', qr);
            }
        });
    }
    processIncomingMessage(msg_1, instanceKey_1) {
        return __awaiter(this, arguments, void 0, function* (msg, instanceKey, isHistory = false) {
            var _a, _b;
            if (!msg.key || !msg.key.remoteJid)
                return;
            const jid = msg.key.remoteJid;
            if (jid === 'status@broadcast' || jid.endsWith('@g.us'))
                return;
            try {
                const protocolMsg = (_a = msg.message) === null || _a === void 0 ? void 0 : _a.protocolMessage;
                if (protocolMsg && protocolMsg.type === 0 && ((_b = protocolMsg.key) === null || _b === void 0 ? void 0 : _b.id)) {
                    yield DatabaseService_1.databaseService.deleteMessageByWhatsappId(protocolMsg.key.id);
                    return;
                }
                const fromMe = msg.key.fromMe || false;
                const pushName = msg.pushName || 'Desconhecido';
                const messageContent = this.extractMessageContent(msg);
                const timestamp = new Date(msg.messageTimestamp * 1000).toISOString();
                const chatId = yield DatabaseService_1.databaseService.upsertChat(jid, instanceKey, pushName, messageContent, timestamp, isHistory, fromMe);
                if (!chatId)
                    return;
                yield DatabaseService_1.databaseService.syncContactAndLead(chatId, jid, pushName, instanceKey, isHistory, fromMe);
                let mediaUrl;
                if (this.isMediaMessage(msg)) {
                    mediaUrl = yield this.handleMediaDownload(msg, instanceKey);
                }
                yield DatabaseService_1.databaseService.saveMessage(chatId, instanceKey, msg, messageContent, fromMe, timestamp, mediaUrl);
            }
            catch (e) {
                console.error(`❌ Erro no processamento da mensagem [${instanceKey}]:`, e);
            }
        });
    }
    extractMessageContent(msg) {
        var _a, _b, _c, _d, _e;
        const m = msg.message;
        if (!m)
            return '[Mensagem vazia]';
        const type = Object.keys(m)[0];
        try {
            if (type === 'conversation')
                return m.conversation || '';
            if (type === 'extendedTextMessage')
                return ((_a = m.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text) || '';
            if (type === 'imageMessage')
                return `📷 ${((_b = m.imageMessage) === null || _b === void 0 ? void 0 : _b.caption) || 'Foto'}`;
            if (type === 'videoMessage')
                return `🎥 ${((_c = m.videoMessage) === null || _c === void 0 ? void 0 : _c.caption) || 'Vídeo'}`;
            if (type === 'audioMessage') {
                const seconds = (_d = m.audioMessage) === null || _d === void 0 ? void 0 : _d.seconds;
                const duration = seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : '';
                return `🎤 Áudio ${duration}`.trim();
            }
            if (type === 'documentMessage')
                return `📄 ${((_e = m.documentMessage) === null || _e === void 0 ? void 0 : _e.title) || 'Documento'}`;
            if (type === 'stickerMessage')
                return '🎨 Figurinha';
            if (type === 'contactMessage')
                return '👤 Contato';
            if (type === 'locationMessage')
                return '📍 Localização';
        }
        catch (e) {
            console.error('Erro ao extrair conteúdo:', e);
        }
        return '[mídia]';
    }
    isMediaMessage(msg) {
        const m = msg.message;
        if (!m)
            return false;
        return !!(m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage);
    }
    handleMediaDownload(msg, instanceKey) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mediaUrl = yield MediaService_1.mediaService.processMedia(msg, instanceKey);
                return mediaUrl || undefined;
            }
            catch (e) {
                console.error('❌ Erro ao processar mídia:', e);
                return undefined;
            }
        });
    }
    sendMessage(instanceKey, to, text, mediaUrl, mediaType, userName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const state = this.instances.get(instanceKey);
                if (!state || !state.sock)
                    throw new Error(`Instância [${instanceKey}] não está conectada`);
                let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
                const textToWhatsApp = userName ? `*${userName}*:\n${text}` : text;
                let payload = { text: textToWhatsApp };
                const sent = yield state.sock.sendMessage(jid, payload);
                if (sent) {
                    yield this.processIncomingMessage(sent, instanceKey);
                }
                return { success: true, messageId: sent === null || sent === void 0 ? void 0 : sent.key.id };
            }
            catch (error) {
                console.error(`❌ Erro fatal ao enviar mensagem [${instanceKey}]:`, error);
                throw error;
            }
        });
    }
    getStatus(instanceKey) {
        return this.instances.get(instanceKey) || { status: 'disconnected', qr: null };
    }
    logout(instanceKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = this.instances.get(instanceKey);
            if (state === null || state === void 0 ? void 0 : state.sock) {
                yield ConnectionManager_1.connectionManager.cleanupSocket(state.sock);
            }
            const authDir = path_1.default.join(this.baseAuthDir, instanceKey);
            if (fs_1.default.existsSync(authDir))
                fs_1.default.rmSync(authDir, { recursive: true, force: true });
            this.instances.delete(instanceKey);
            yield this.initialize(instanceKey);
            return true;
        });
    }
    getAllInstances() {
        return Array.from(this.instances.keys()).map(key => {
            const state = this.instances.get(key);
            return {
                instance_key: key,
                status: (state === null || state === void 0 ? void 0 : state.status) || 'disconnected',
                qr: (state === null || state === void 0 ? void 0 : state.qr) || null
            };
        });
    }
}
exports.WhatsAppService = WhatsAppService;
exports.whatsappService = new WhatsAppService();
