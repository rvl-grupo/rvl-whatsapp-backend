// DEPLOY_TRIGGER: 2026-01-02_11:15
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState,
    proto,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { pino } from 'pino';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { databaseService } from './services/DatabaseService.js';
import { connectionManager } from './services/ConnectionManager.js';
import { mediaService } from './services/MediaService.js';
import { useSupabaseAuthState } from './services/SupabaseAuthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger configuration
const logger = pino({ level: 'info' });

interface InstanceState {
    sock: WASocket | null;
    qr: string | null;
    status: 'connecting' | 'connected' | 'disconnected';
    subStatus?: string;
    diagnostics?: {
        dbLatency?: number;
        lastUpdate: string;
        step: string;
    };
}

export class WhatsAppService {
    private instances: Map<string, InstanceState> = new Map();
    private latestVersion: any = null;
    private baseAuthDir = path.resolve(__dirname, '..', 'sessions');

    constructor() {
        this.loadExistingSessions();
    }

    private async loadExistingSessions() {
        try {
            console.log('📦 Buscando sessões existentes no banco de dados...');
            const { data: instances, error } = await databaseService.supabase
                .schema('sistema')
                .from('whatsapp_instances')
                .select('instance_key');

            if (error) throw error;

            for (const inst of instances || []) {
                console.log(`📦 Restaurando sessão: ${inst.instance_key}`);
                this.initialize(inst.instance_key).catch(console.error);
            }
        } catch (e) {
            console.error('❌ Erro ao carregar sessões iniciais:', e);
        }
    }

    private async getBaileysVersion() {
        if (!this.latestVersion) {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            this.latestVersion = version;
            console.log(`📦 Usando Baileys v${version} (Latest: ${isLatest})`);
            console.log('🚀 [DIAGNOSTIC] Sessão limpa iniciada via banco de dados.');
        }
        return this.latestVersion;
    }

    public async initialize(instanceKey: string) {
        // Anti-duplicação de conexão
        if (connectionManager.isInitializing(instanceKey)) {
            console.log(`⚠️ Instância [${instanceKey}] já está inicializando. Abortando duplicata.`);
            return;
        }

        const currentState = this.instances.get(instanceKey);
        if (currentState?.status === 'connected') return;

        connectionManager.setInitializing(instanceKey, true);

        try {
            // Cleanup: Garante que a conexão anterior morreu de verdade
            if (currentState?.sock) {
                await connectionManager.cleanupSocket(currentState.sock);
            }

            await this.getBaileysVersion();
            const { state, saveCreds } = await useSupabaseAuthState(databaseService.supabase, instanceKey);

            const sock = makeWASocket({
                version: this.latestVersion,
                logger,
                printQRInTerminal: false, // Usar interface do CRM agora
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                browser: [`Grupo RVL [${instanceKey}]`, 'Chrome', '1.0.0'],
                generateHighQualityLinkPreview: true,
                syncFullHistory: false, // Otimização: Não carregar histórico gigante no primeiro par para não travar o Render
                shouldIgnoreJid: (jid) => jid.includes('status@broadcast'),
                linkPreviewImageThumbnailWidth: 192,
            });

            // Inicializa a instância no Map com status inicial
            this.updateInstanceState(instanceKey, {
                status: 'connecting',
                subStatus: 'Iniciando socket...',
                diagnostics: { step: 'Aguardando QR Code', lastUpdate: new Date().toISOString() }
            });
            await databaseService.syncInstanceStatus(instanceKey, 'connecting', null);

            // Listeners
            sock.ev.on('creds.update', async (creds) => {
                const start = Date.now();
                await saveCreds();
                const latency = Date.now() - start;
                this.updateInstanceState(instanceKey, {
                    diagnostics: {
                        step: 'Salvando chaves no DB',
                        dbLatency: latency,
                        lastUpdate: new Date().toISOString()
                    }
                });
            });
            sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(instanceKey, update));

            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        try {
                            await this.processIncomingMessage(msg, instanceKey);
                        } catch (e) {
                            console.error(`Erro [${instanceKey}] ao processar mensagem:`, e);
                        }
                    }
                }
            });

            sock.ev.on('messaging-history.set', async ({ chats, messages }) => {
                console.log(`📚 Sincronização de histórico [${instanceKey}]: ${chats.length} chats recebidos.`);

                // Filtro 1: Apenas chats ativos (não arquivados, não somente leitura)
                const activeChats = chats
                    .filter(c => !c.readOnly && c.id && (c.id.endsWith('@s.whatsapp.net') || c.id.endsWith('@lid')))
                    .sort((a, b) => (Number(b.conversationTimestamp) || 0) - (Number(a.conversationTimestamp) || 0))
                    .slice(0, 20); // Filtro 2: Apenas os 20 chats mais recentes

                const sevenDaysAgo = Date.now() / 1000 - (7 * 24 * 60 * 60); // Filtro 3: Últimos 7 dias

                for (const chat of activeChats) {
                    try {
                        const chatMsgs = messages
                            .filter(m => m.key.remoteJid === chat.id)
                            .filter(m => (Number(m.messageTimestamp) || 0) >= sevenDaysAgo) // Apenas últimos 7 dias
                            .sort((a, b) => (Number(b.messageTimestamp) || 0) - (Number(a.messageTimestamp) || 0))
                            .slice(0, 15); // Filtro 4: Máximo 15 mensagens por chat

                        if (chatMsgs.length > 0) {
                            for (const m of chatMsgs.reverse()) {
                                await this.processIncomingMessage(m, instanceKey, true);
                            }
                        } else {
                            await databaseService.upsertChat(chat.id!, instanceKey, chat.name || 'Desconhecido', '[Histórico]', new Date().toISOString(), true);
                        }
                    } catch (e) {
                        console.error(`Erro ao processar histórico do chat ${chat.id}:`, e);
                    }
                }
            });

            sock.ev.on('messages.update', async (updates) => {
                for (const update of updates) {
                    if (update.update.status) {
                        await databaseService.updateMessageStatus(update.key.id!, update.update.status);
                    }
                }
            });

        } catch (error) {
            console.error(`❌ Erro crítico na instância ${instanceKey}:`, error);
            this.updateInstanceState(instanceKey, { status: 'disconnected' });
            await databaseService.syncInstanceStatus(instanceKey, 'disconnected', null);
        } finally {
            connectionManager.setInitializing(instanceKey, false);
        }
    }

    private updateInstanceState(key: string, updates: Partial<InstanceState>) {
        const current = this.instances.get(key) || { sock: null, qr: null, status: 'disconnected' };
        this.instances.set(key, { ...current, ...updates });
    }

    private async handleConnectionUpdate(instanceKey: string, update: Partial<ConnectionState>) {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

            const { should, delay } = connectionManager.shouldReconnect(instanceKey, lastDisconnect);

            console.log(`🔴 Conexão [${instanceKey}] FECHADA (Code: ${statusCode}). Reconectando em ${delay}ms: ${should}`);

            // ✅ ESTABILIDADE: Se for apenas um reinício, não avisamos o frontend para não trocar o QR Code
            if (!isRestartRequired) {
                this.updateInstanceState(instanceKey, { status: 'disconnected', qr: null });
                await databaseService.syncInstanceStatus(instanceKey, 'disconnected', null);
            } else {
                console.log(`⏳ [${instanceKey}] Reinício técnico detectado (515). Mantendo estado para estabilidade...`);
            }

            if (should) {
                // Ajuste Fino: 2s é suficiente para FS rápido (Render) e evita timeout no celular
                const finalDelay = isRestartRequired ? Math.max(delay, 2000) : delay;
                console.log(`⏳ [${instanceKey}] Agendando reconexão em ${finalDelay}ms...`);
                setTimeout(() => this.initialize(instanceKey), finalDelay);
            } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log(`❌ Logout ou Sessão Inválida na instância [${instanceKey}]. Resetando...`);
                this.updateInstanceState(instanceKey, { status: 'disconnected', qr: null });
                await databaseService.syncInstanceStatus(instanceKey, 'disconnected', null);
                connectionManager.setInitializing(instanceKey, false);
            }
        } else if (connection === 'open') {
            const state = this.instances.get(instanceKey);
            const sock = state?.sock;
            const user = sock?.user;

            this.updateInstanceState(instanceKey, {
                subStatus: 'Handshake concluído!',
                diagnostics: { step: 'Aguardando Perfil', lastUpdate: new Date().toISOString() }
            });

            // ✅ SEGURANÇA MÁXIMA: Só marca como conectado se o ID estiver REALMENTE pronto
            if (user && user.id) {
                console.log(`✅ [${instanceKey}] Instância Conectada e Estável: ${user.id.split(':')[0]}`);
                connectionManager.resetAttempts(instanceKey);
                this.updateInstanceState(instanceKey, {
                    status: 'connected',
                    qr: null,
                    subStatus: 'Sincronizado',
                    diagnostics: { step: 'Pronto para uso', lastUpdate: new Date().toISOString() }
                });
                await databaseService.syncInstanceStatus(instanceKey, 'connected', null);
                await databaseService.updateInstanceDetails(instanceKey, user.id.split(':')[0], user.name || '');
            } else {
                console.log(`⏳ [${instanceKey}] Conexão física aberta, aguardando handshake final do WhatsApp...`);
                this.updateInstanceState(instanceKey, {
                    subStatus: 'Finalizando conexão...',
                    diagnostics: { step: 'Handshake WhatsApp', lastUpdate: new Date().toISOString() }
                });

                // Timeout de segurança: se após 90s ainda não tiver user.id, força reconexão
                setTimeout(async () => {
                    const currentState = this.instances.get(instanceKey);
                    if (currentState?.status === 'connecting') {
                        console.log(`⚠️ [${instanceKey}] Timeout de handshake detectado. Forçando reconexão...`);
                        await connectionManager.cleanupSocket(currentState.sock!);
                        this.instances.delete(instanceKey);
                        connectionManager.setInitializing(instanceKey, false);
                        setTimeout(() => this.initialize(instanceKey), 3000);
                    }
                }, 90000);
            }
        }

        if (qr) {
            // ✅ ESTABILIDADE: Só atualiza o QR se ele realmente mudou, evitando refrescos inúteis no frontend
            const currentState = this.instances.get(instanceKey);
            if (currentState?.qr !== qr) {
                console.log(`[${instanceKey}] Novo QR Code gerado. Aguardando scan...`);
                this.updateInstanceState(instanceKey, {
                    qr,
                    status: 'connecting',
                    subStatus: 'Escaneie o QR Code',
                    diagnostics: { step: 'Aguardando scan do celular', lastUpdate: new Date().toISOString() }
                });
                await databaseService.syncInstanceStatus(instanceKey, 'connecting', qr);
            }
        }
    }

    private async processIncomingMessage(msg: proto.IWebMessageInfo, instanceKey: string, isHistory: boolean = false) {
        if (!msg.key || !msg.key.remoteJid) return;
        const jid = msg.key.remoteJid;
        if (jid === 'status@broadcast' || jid.endsWith('@g.us')) return;

        try {
            const protocolMsg = msg.message?.protocolMessage;
            if (protocolMsg && protocolMsg.type === 0 && protocolMsg.key?.id) {
                await databaseService.deleteMessageByWhatsappId(protocolMsg.key.id);
                return;
            }

            const fromMe = msg.key.fromMe || false;
            const pushName = msg.pushName || 'Desconhecido';
            const messageContent = this.extractMessageContent(msg);
            const timestamp = new Date((msg.messageTimestamp as number) * 1000).toISOString();

            const chatId = await databaseService.upsertChat(jid, instanceKey, pushName, messageContent, timestamp, isHistory, fromMe);
            if (!chatId) return;

            await databaseService.syncContactAndLead(chatId, jid, pushName, instanceKey, isHistory, fromMe);

            let mediaUrl;
            if (this.isMediaMessage(msg)) {
                mediaUrl = await this.handleMediaDownload(msg, instanceKey);
            }

            await databaseService.saveMessage(chatId, instanceKey, msg, messageContent, fromMe, timestamp, mediaUrl);

        } catch (e) {
            console.error(`❌ Erro no processamento da mensagem [${instanceKey}]:`, e);
        }
    }

    private extractMessageContent(msg: proto.IWebMessageInfo): string {
        const m = msg.message;
        if (!m) return '[Mensagem vazia]';

        const type = Object.keys(m)[0];

        try {
            if (type === 'conversation') return m.conversation || '';
            if (type === 'extendedTextMessage') return m.extendedTextMessage?.text || '';
            if (type === 'imageMessage') return `📷 ${m.imageMessage?.caption || 'Foto'}`;
            if (type === 'videoMessage') return `🎥 ${m.videoMessage?.caption || 'Vídeo'}`;
            if (type === 'audioMessage') {
                const seconds = m.audioMessage?.seconds;
                const duration = seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : '';
                return `🎤 Áudio ${duration}`.trim();
            }
            if (type === 'documentMessage') return `📄 ${m.documentMessage?.title || 'Documento'}`;
            if (type === 'stickerMessage') return '🎨 Figurinha';
            if (type === 'contactMessage') return '👤 Contato';
            if (type === 'locationMessage') return '📍 Localização';
        } catch (e) {
            console.error('Erro ao extrair conteúdo:', e);
        }

        return '[mídia]';
    }

    private isMediaMessage(msg: proto.IWebMessageInfo): boolean {
        const m = msg.message;
        if (!m) return false;
        return !!(m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage);
    }

    private async handleMediaDownload(msg: proto.IWebMessageInfo, instanceKey: string): Promise<string | undefined> {
        try {
            const mediaUrl = await mediaService.processMedia(msg, instanceKey);
            return mediaUrl || undefined;
        } catch (e) {
            console.error('❌ Erro ao processar mídia:', e);
            return undefined;
        }
    }

    public async sendMessage(instanceKey: string, to: string, text: string, mediaUrl?: string, mediaType?: string, userName?: string) {
        try {
            const state = this.instances.get(instanceKey);

            // 🔥 SEGURANÇA: Verifica se a instância existe e se o 'sock' está pronto
            if (!state || !state.sock) {
                console.log(`⚠️ Tentativa de envio ignorada: Instância [${instanceKey}] não inicializada.`);
                return { success: false, error: 'Instância não inicializada' };
            }

            // 🔥 SEGURANÇA: Verifica se o usuário da conexão já foi carregado (Evita o crash do 'id')
            if (!state.sock.user || !state.sock.user.id) {
                console.log(`⚠️ Tentativa de envio ignorada: Instância [${instanceKey}] ainda está pareando.`);
                return { success: false, error: 'Conexão em fase de pareamento' };
            }

            let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
            const textToWhatsApp = userName ? `*${userName}*:\n${text}` : text;
            let payload: any = { text: textToWhatsApp };

            const sent = await state.sock.sendMessage(jid, payload);
            if (sent) {
                await this.processIncomingMessage(sent, instanceKey);
            }
            return { success: true, messageId: sent?.key.id };
        } catch (error: any) {
            // ✅ SOLUÇÃO DEFINITIVA: Loga o erro mas NÃO mata o servidor com 'throw'
            console.error(`❌ Erro [${instanceKey}] ao enviar. Sistema segue vivo. Detalhe:`, error.message);
            return { success: false, error: error.message };
        }
    }

    public getStatus(instanceKey: string) {
        return this.instances.get(instanceKey) || { status: 'disconnected', qr: null };
    }

    public async logout(instanceKey: string) {
        const state = this.instances.get(instanceKey);
        if (state?.sock) {
            await connectionManager.cleanupSocket(state.sock);
        }
        const authDir = path.join(this.baseAuthDir, instanceKey);
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        this.instances.delete(instanceKey);
        await this.initialize(instanceKey);
        return true;
    }

    public getAllInstances() {
        return Array.from(this.instances.keys()).map(key => {
            const state = this.instances.get(key);
            return {
                instance_key: key,
                status: state?.status || 'disconnected',
                qr: state?.qr || null
            };
        });
    }
}

export const whatsappService = new WhatsAppService();
