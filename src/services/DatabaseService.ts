import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { proto } from '@whiskeysockets/baileys';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export class DatabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    private sanitizeJid(jid: string): string {
        if (!jid) return '';
        if (jid.includes(':')) {
            const [number, domain] = jid.split('@');
            return `${number.split(':')[0]}@${domain}`;
        }
        return jid;
    }

    async syncInstanceStatus(instanceKey: string, status: string, qr: string | null) {
        try {
            await this.supabase
                .schema('sistema')
                .from('whatsapp_instances')
                .upsert({
                    instance_key: instanceKey,
                    status: status,
                    qr_code: qr,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'instance_key' });
        } catch (e) {
            console.error(`❌ Erro ao sincronizar status da instância [${instanceKey}]:`, e);
        }
    }

    async updateInstanceDetails(instanceKey: string, number: string, name: string) {
        try {
            await this.supabase
                .schema('sistema')
                .from('whatsapp_instances')
                .update({
                    number,
                    name,
                    last_connected: new Date().toISOString()
                })
                .eq('instance_key', instanceKey);
        } catch (e) {
            console.error(`❌ Erro ao atualizar detalhes da instância [${instanceKey}]:`, e);
        }
    }

    async upsertChat(jid: string, instanceKey: string, name: string, lastMessage: string, timestamp: string, isHistory: boolean = false, fromMe: boolean = false) {
        const cleanJid = this.sanitizeJid(jid);
        try {
            // 🚀 Recuperar nome atual para evitar retrocesso para 'Desconhecido'
            const { data: existingChat } = await this.supabase
                .schema('operacao')
                .from('chats')
                .select('name')
                .eq('whatsapp_id', cleanJid)
                .maybeSingle();

            let finalName = name || 'Desconhecido';
            const isDefaultName = (n: string) => !n || n === 'Desconhecido' || n.includes('@s.whatsapp.net');

            if (existingChat?.name && !isDefaultName(existingChat.name)) {
                if (isDefaultName(finalName)) {
                    finalName = existingChat.name;
                }
            }

            const { data: chat, error } = await this.supabase
                .schema('operacao')
                .from('chats')
                .upsert({
                    whatsapp_id: cleanJid,
                    instance_key: instanceKey,
                    name: finalName,
                    last_message: lastMessage,
                    last_message_at: timestamp,
                    unread_count: (fromMe || isHistory) ? undefined : 1,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'whatsapp_id,instance_key'
                })
                .select('id')
                .single();

            if (error) throw error;
            return chat?.id;
        } catch (e) {
            console.error(`❌ Erro ao processar chat [${cleanJid}]:`, e);
            return null;
        }
    }

    async incrementUnreadCount(chatId: string) {
        try {
            await this.supabase.rpc('increment_unread_count', { chat_uuid: chatId });
        } catch (e) { }
    }

    async syncContactAndLead(chatId: string, jid: string, name: string, instanceKey: string, isHistory: boolean, fromMe: boolean) {
        const cleanJid = this.sanitizeJid(jid);
        try {
            // 1. Verificar contato existente
            const { data: existingContact } = await this.supabase
                .schema('crm')
                .from('contacts')
                .select('id, name')
                .eq('whatsapp_number', cleanJid)
                .maybeSingle();

            let finalName = name || 'Desconhecido';
            const isDefaultName = (n: string) => !n || n === 'Desconhecido' || n.includes('@s.whatsapp.net');

            if (existingContact?.name && !isDefaultName(existingContact.name)) {
                if (isDefaultName(finalName)) {
                    finalName = existingContact.name;
                }
            }

            const { data: contact, error: contactError } = await this.supabase
                .schema('crm')
                .from('contacts')
                .upsert({
                    chat_id: chatId,
                    name: finalName,
                    whatsapp_number: cleanJid,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'whatsapp_number' })
                .select('id')
                .single();

            if (contactError) throw contactError;
            const contactId = contact?.id;

            if (contactId) {
                const { data: lead } = await this.supabase
                    .schema('crm')
                    .from('leads')
                    .select('id, title')
                    .eq('contact_id', contactId)
                    .maybeSingle();

                let currentLeadId = lead?.id;

                // Atualizar título do lead se for 'Novo Lead' ou 'Desconhecido'
                if (currentLeadId && isDefaultName(lead?.title) && !isDefaultName(finalName)) {
                    await this.supabase.schema('crm').from('leads').update({ title: `Oportunidade - ${finalName}` }).eq('id', currentLeadId);
                }

                if (!fromMe && !currentLeadId && !isHistory) {
                    const { data: instInfo } = await this.supabase
                        .schema('sistema')
                        .from('whatsapp_instances')
                        .select('funnel_id')
                        .eq('instance_key', instanceKey)
                        .maybeSingle();

                    const funnelId = instInfo?.funnel_id;
                    if (funnelId) {
                        const { data: stages } = await this.supabase
                            .schema('crm')
                            .from('funnel_stages')
                            .select('id')
                            .eq('funnel_id', funnelId)
                            .order('position', { ascending: true })
                            .limit(1);

                        if (stages && stages.length > 0) {
                            const { data: newLead } = await this.supabase
                                .schema('crm')
                                .from('leads')
                                .insert({
                                    contact_id: contactId,
                                    funnel_id: funnelId,
                                    stage_id: stages[0].id,
                                    title: finalName !== 'Desconhecido' ? `Oportunidade - ${finalName}` : 'Novo Lead WhatsApp',
                                    status: 'triagem',
                                    created_at: new Date().toISOString()
                                })
                                .select()
                                .single();

                            if (newLead) currentLeadId = newLead.id;
                        }
                    }
                }
                return { contactId, leadId: currentLeadId };
            }
            return null;
        } catch (e) {
            console.error(`❌ Erro ao processar contato/lead [${cleanJid}]:`, e);
            return null;
        }
    }

    async saveMessage(chatId: string, instanceKey: string, msg: proto.IWebMessageInfo, content: string, fromMe: boolean, timestamp: string, mediaUrl?: string) {
        if (!msg.key) return false;
        const jid = this.sanitizeJid(msg.key.remoteJid!);
        try {
            const { error } = await this.supabase
                .schema('operacao')
                .from('messages')
                .upsert({
                    chat_id: chatId,
                    instance_key: instanceKey,
                    whatsapp_message_id: msg.key.id,
                    sender_id: fromMe ? 'me' : jid,
                    content: content,
                    from_me: fromMe,
                    timestamp: timestamp,
                    type: mediaUrl ? 'media' : 'text',
                    media_url: mediaUrl,
                    created_at: new Date().toISOString()
                }, { onConflict: 'whatsapp_message_id' });

            if (error) throw error;
            return true;
        } catch (e) {
            console.error(`❌ Erro ao salvar mensagem [${msg.key?.id}]:`, e);
            return false;
        }
    }

    async updateMessageStatus(messageId: string, status: number) {
        const statusText = status === 2 ? 'delivered' : status === 3 ? 'read' : status === 4 ? 'played' : 'sent';
        try {
            await this.supabase
                .schema('operacao')
                .from('messages')
                .update({ status: statusText })
                .eq('whatsapp_message_id', messageId);
        } catch (e) { }
    }

    async updateMessageMetadata(messageId: string, metadata: any) {
        try {
            await this.supabase
                .schema('operacao')
                .from('messages')
                .update({ metadata })
                .eq('whatsapp_message_id', messageId);
        } catch (e) { }
    }

    async deleteMessageByWhatsappId(whatsappMessageId: string) {
        await this.updateMessageMetadata(whatsappMessageId, { is_deleted: true, deleted_at: new Date().toISOString() });
    }
}

export const databaseService = new DatabaseService();
