"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaService = exports.MediaService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const baileys_1 = require("@whiskeysockets/baileys");
const pino_1 = require("pino");
const uuid_1 = require("uuid");
const logger = (0, pino_1.pino)({ level: 'info' });
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
class MediaService {
    constructor() {
        this.bucketName = 'chat-media';
        this.maxFileSize = 20 * 1024 * 1024; // 20MB
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
    }
    /**
     * Detecta o tipo de mídia e retorna a extensão apropriada
     */
    getMediaType(msg) {
        const m = msg.message;
        if (!m)
            return null;
        if (m.imageMessage)
            return { type: 'image', extension: 'jpg' };
        if (m.videoMessage)
            return { type: 'video', extension: 'mp4' };
        if (m.audioMessage)
            return { type: 'audio', extension: 'ogg' };
        if (m.documentMessage) {
            const fileName = m.documentMessage.fileName || 'document';
            const ext = fileName.split('.').pop() || 'bin';
            return { type: 'document', extension: ext };
        }
        return null;
    }
    /**
     * Baixa a mídia do WhatsApp e faz upload para o Supabase Storage
     */
    processMedia(msg, instanceKey) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mediaInfo = this.getMediaType(msg);
                if (!mediaInfo) {
                    console.log('⚠️ Tipo de mídia não suportado');
                    return null;
                }
                console.log(`📥 Baixando ${mediaInfo.type} do WhatsApp...`);
                // Download da mídia do WhatsApp
                const buffer = yield (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {}, {
                    logger,
                    reuploadRequest: () => Promise.resolve(msg)
                });
                if (!buffer || buffer.length === 0) {
                    console.log('⚠️ Buffer de mídia vazio');
                    return null;
                }
                // Verificar tamanho
                if (buffer.length > this.maxFileSize) {
                    console.log(`⚠️ Arquivo muito grande: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (máx: 20MB)`);
                    return null;
                }
                // Gerar nome único para o arquivo
                const fileName = `${instanceKey}/${mediaInfo.type}/${(0, uuid_1.v4)()}.${mediaInfo.extension}`;
                console.log(`📤 Fazendo upload para Supabase Storage: ${fileName}`);
                // Upload para o Supabase Storage
                const { data, error } = yield this.supabase.storage
                    .from(this.bucketName)
                    .upload(fileName, buffer, {
                    contentType: this.getMimeType(mediaInfo.type, mediaInfo.extension),
                    cacheControl: '3600',
                    upsert: false
                });
                if (error) {
                    console.error('❌ Erro ao fazer upload para Supabase Storage:', error);
                    return null;
                }
                // Gerar URL pública permanente
                const { data: publicUrlData } = this.supabase.storage
                    .from(this.bucketName)
                    .getPublicUrl(fileName);
                if (!(publicUrlData === null || publicUrlData === void 0 ? void 0 : publicUrlData.publicUrl)) {
                    console.error('❌ Erro ao gerar URL pública');
                    return null;
                }
                console.log(`✅ Mídia salva com sucesso: ${fileName}`);
                return publicUrlData.publicUrl;
            }
            catch (error) {
                console.error('❌ Erro ao processar mídia:', error);
                return null;
            }
        });
    }
    /**
     * Retorna o MIME type baseado no tipo e extensão
     */
    getMimeType(type, extension) {
        const mimeTypes = {
            'image/jpg': 'image/jpeg',
            'image/jpeg': 'image/jpeg',
            'image/png': 'image/png',
            'image/webp': 'image/webp',
            'video/mp4': 'video/mp4',
            'audio/ogg': 'audio/ogg',
            'audio/mpeg': 'audio/mpeg',
            'application/pdf': 'application/pdf'
        };
        const key = `${type}/${extension}`;
        return mimeTypes[key] || 'application/octet-stream';
    }
}
exports.MediaService = MediaService;
exports.mediaService = new MediaService();
