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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseService = exports.DatabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
class DatabaseService {
    constructor() {
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
    }
    sanitizeJid(jid) {
        if (!jid)
            return '';
        if (jid.includes(':')) {
            const [number, domain] = jid.split('@');
            return `${number.split(':')[0]}@${domain}`;
        }
        return jid;
    }
    syncInstanceStatus(instanceKey, status, qr) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.supabase
                    .schema('sistema')
                    .from('whatsapp_instances')
                    .upsert({
                    instance_key: instanceKey,
                    status: status,
                    qr_code: qr,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'instance_key' });
            }
            catch (e) {
                console.error(`❌ Erro ao sincronizar status da instância [${instanceKey}]:`, e);
            }
        });
    }
    updateInstanceDetails(instanceKey, number, name) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.supabase
                    .schema('sistema')
                    .from('whatsapp_instances')
                    .update({
                    number,
                    name,
                    last_connected: new Date().toISOString()
                })
                    .eq('instance_key', instanceKey);
            }
            catch (e) {
                console.error(`❌ Erro ao atualizar detalhes da instância [${instanceKey}]:`, e);
            }
        });
    }
    upsertChat(jid_1, instanceKey_1, name_1, lastMessage_1, timestamp_1) {
        return __awaiter(this, arguments, void 0, function* (jid, instanceKey, name, lastMessage, timestamp, isHistory = false, fromMe = false) {
            const cleanJid = this.sanitizeJid(jid);
            try {
                // 🚀 Recuperar nome atual para evitar retrocesso para 'Desconhecido'
                const { data: existingChat } = yield this.supabase
                    .schema('operacao')
                    .from('chats')
                    .select('name')
                    .eq('whatsapp_id', cleanJid)
                    .maybeSingle();
                let finalName = name || 'Desconhecido';
                const isDefaultName = (n) => !n || n === 'Desconhecido' || n.includes('@s.whatsapp.net');
                if ((existingChat === null || existingChat === void 0 ? void 0 : existingChat.name) && !isDefaultName(existingChat.name)) {
                    if (isDefaultName(finalName)) {
                        finalName = existingChat.name;
                    }
                }
                const { data: chat, error } = yield this.supabase
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
                if (error)
                    throw error;
                return chat === null || chat === void 0 ? void 0 : chat.id;
            }
            catch (e) {
                console.error(`❌ Erro ao processar chat [${cleanJid}]:`, e);
                return null;
            }
        });
    }
    incrementUnreadCount(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.supabase.rpc('increment_unread_count', { chat_uuid: chatId });
            }
            catch (e) { }
        });
    }
    syncContactAndLead(chatId, jid, name, instanceKey, isHistory, fromMe) {
        return __awaiter(this, void 0, void 0, function* () {
            const cleanJid = this.sanitizeJid(jid);
            try {
                // 1. Verificar contato existente
                const { data: existingContact } = yield this.supabase
                    .schema('crm')
                    .from('contacts')
                    .select('id, name')
                    .eq('whatsapp_number', cleanJid)
                    .maybeSingle();
                let finalName = name || 'Desconhecido';
                const isDefaultName = (n) => !n || n === 'Desconhecido' || n.includes('@s.whatsapp.net');
                if ((existingContact === null || existingContact === void 0 ? void 0 : existingContact.name) && !isDefaultName(existingContact.name)) {
                    if (isDefaultName(finalName)) {
                        finalName = existingContact.name;
                    }
                }
                const { data: contact, error: contactError } = yield this.supabase
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
                if (contactError)
                    throw contactError;
                const contactId = contact === null || contact === void 0 ? void 0 : contact.id;
                if (contactId) {
                    const { data: lead } = yield this.supabase
                        .schema('crm')
                        .from('leads')
                        .select('id, title')
                        .eq('contact_id', contactId)
                        .maybeSingle();
                    let currentLeadId = lead === null || lead === void 0 ? void 0 : lead.id;
                    // Atualizar título do lead se for 'Novo Lead' ou 'Desconhecido'
                    if (currentLeadId && isDefaultName(lead === null || lead === void 0 ? void 0 : lead.title) && !isDefaultName(finalName)) {
                        yield this.supabase.schema('crm').from('leads').update({ title: `Oportunidade - ${finalName}` }).eq('id', currentLeadId);
                    }
                    if (!fromMe && !currentLeadId && !isHistory) {
                        const { data: instInfo } = yield this.supabase
                            .schema('sistema')
                            .from('whatsapp_instances')
                            .select('funnel_id')
                            .eq('instance_key', instanceKey)
                            .maybeSingle();
                        const funnelId = instInfo === null || instInfo === void 0 ? void 0 : instInfo.funnel_id;
                        if (funnelId) {
                            const { data: stages } = yield this.supabase
                                .schema('crm')
                                .from('funnel_stages')
                                .select('id')
                                .eq('funnel_id', funnelId)
                                .order('position', { ascending: true })
                                .limit(1);
                            if (stages && stages.length > 0) {
                                const { data: newLead } = yield this.supabase
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
                                if (newLead)
                                    currentLeadId = newLead.id;
                            }
                        }
                    }
                    return { contactId, leadId: currentLeadId };
                }
                return null;
            }
            catch (e) {
                console.error(`❌ Erro ao processar contato/lead [${cleanJid}]:`, e);
                return null;
            }
        });
    }
    saveMessage(chatId, instanceKey, msg, content, fromMe, timestamp, mediaUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!msg.key)
                return false;
            const jid = this.sanitizeJid(msg.key.remoteJid);
            try {
                const { error } = yield this.supabase
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
                if (error)
                    throw error;
                return true;
            }
            catch (e) {
                console.error(`❌ Erro ao salvar mensagem [${(_a = msg.key) === null || _a === void 0 ? void 0 : _a.id}]:`, e);
                return false;
            }
        });
    }
    updateMessageStatus(messageId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const statusText = status === 2 ? 'delivered' : status === 3 ? 'read' : status === 4 ? 'played' : 'sent';
            try {
                yield this.supabase
                    .schema('operacao')
                    .from('messages')
                    .update({ status: statusText })
                    .eq('whatsapp_message_id', messageId);
            }
            catch (e) { }
        });
    }
    updateMessageMetadata(messageId, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.supabase
                    .schema('operacao')
                    .from('messages')
                    .update({ metadata })
                    .eq('whatsapp_message_id', messageId);
            }
            catch (e) { }
        });
    }
    deleteMessageByWhatsappId(whatsappMessageId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.updateMessageMetadata(whatsappMessageId, { is_deleted: true, deleted_at: new Date().toISOString() });
        });
    }
}
exports.DatabaseService = DatabaseService;
exports.databaseService = new DatabaseService();
