import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { downloadMediaMessage, proto } from '@whiskeysockets/baileys';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ level: 'info' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export class MediaService {
    private supabase: SupabaseClient;
    private bucketName = 'chat-media';
    private maxFileSize = 20 * 1024 * 1024; // 20MB

    constructor() {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Detecta o tipo de mídia e retorna a extensão apropriada
     */
    private getMediaType(msg: proto.IWebMessageInfo): { type: string; extension: string } | null {
        const m = msg.message;
        if (!m) return null;

        if (m.imageMessage) return { type: 'image', extension: 'jpg' };
        if (m.videoMessage) return { type: 'video', extension: 'mp4' };
        if (m.audioMessage) return { type: 'audio', extension: 'ogg' };
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
    public async processMedia(msg: proto.IWebMessageInfo, instanceKey: string): Promise<string | null> {
        try {
            const mediaInfo = this.getMediaType(msg);
            if (!mediaInfo) {
                console.log('⚠️ Tipo de mídia não suportado');
                return null;
            }

            console.log(`📥 Baixando ${mediaInfo.type} do WhatsApp...`);

            // Download da mídia do WhatsApp
            const buffer = await downloadMediaMessage(
                msg as any,
                'buffer',
                {},
                {
                    logger,
                    reuploadRequest: () => Promise.resolve(msg as any)
                }
            ) as Buffer;

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
            const fileName = `${instanceKey}/${mediaInfo.type}/${uuidv4()}.${mediaInfo.extension}`;

            console.log(`📤 Fazendo upload para Supabase Storage: ${fileName}`);

            // Upload para o Supabase Storage
            const { data, error } = await this.supabase.storage
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

            if (!publicUrlData?.publicUrl) {
                console.error('❌ Erro ao gerar URL pública');
                return null;
            }

            console.log(`✅ Mídia salva com sucesso: ${fileName}`);
            return publicUrlData.publicUrl;

        } catch (error) {
            console.error('❌ Erro ao processar mídia:', error);
            return null;
        }
    }

    /**
     * Retorna o MIME type baseado no tipo e extensão
     */
    private getMimeType(type: string, extension: string): string {
        const mimeTypes: Record<string, string> = {
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

export const mediaService = new MediaService();
