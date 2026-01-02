import {
    AuthenticationCreds,
    AuthenticationState,
    SignalDataTypeMap,
    initAuthCreds,
    BufferJSON,
    proto
} from '@whiskeysockets/baileys';
import { SupabaseClient } from '@supabase/supabase-js';

export const useSupabaseAuthState = async (
    supabase: SupabaseClient,
    instanceKey: string
): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    // Auxiliar para ler dados do Supabase (único ID)
    const readData = async (type: string, id: string) => {
        try {
            const { data, error } = await supabase
                .schema('sistema')
                .from('whatsapp_sessions')
                .select('payload')
                .eq('instance_key', instanceKey)
                .eq('data_type', type)
                .eq('data_id', id)
                .maybeSingle();

            if (error) throw error;
            return data?.payload ? JSON.parse(JSON.stringify(data.payload), BufferJSON.reviver) : null;
        } catch (error) {
            console.error(`❌ Erro ao ler ${type}:${id} do Supabase:`, error);
            return null;
        }
    };

    // Auxiliar para escrever dados no Supabase (único ID)
    const writeData = async (type: string, id: string, payload: any) => {
        try {
            if (!payload) {
                await supabase
                    .schema('sistema')
                    .from('whatsapp_sessions')
                    .delete()
                    .eq('instance_key', instanceKey)
                    .eq('data_type', type)
                    .eq('data_id', id);
                return;
            }

            const { error } = await supabase
                .schema('sistema')
                .from('whatsapp_sessions')
                .upsert({
                    instance_key: instanceKey,
                    data_type: type,
                    data_id: id,
                    payload: JSON.parse(JSON.stringify(payload, BufferJSON.replacer)),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'instance_key,data_type,data_id' });

            if (error) throw error;
        } catch (error) {
            console.error(`❌ Erro ao escrever ${type}:${id} no Supabase:`, error);
        }
    };

    // Auxiliar para ler vários dados de uma vez
    const readMany = async (type: string, ids: string[]) => {
        try {
            const { data, error } = await supabase
                .schema('sistema')
                .from('whatsapp_sessions')
                .select('data_id, payload')
                .eq('instance_key', instanceKey)
                .eq('data_type', type)
                .in('data_id', ids);

            if (error) throw error;

            const results: { [id: string]: any } = {};
            data?.forEach(row => {
                results[row.data_id] = JSON.parse(JSON.stringify(row.payload), BufferJSON.reviver);
            });
            return results;
        } catch (error) {
            console.error(`❌ Erro ao ler lote ${type} do Supabase:`, error);
            return {};
        }
    };

    // Auxiliar para escrever vários dados de uma vez (com chunking para evitar timeout)
    const writeMany = async (type: string, dataMap: { [id: string]: any }) => {
        try {
            const entries = Object.entries(dataMap);
            if (entries.length === 0) return;

            // Divide em lotes de 50 para não sobrecarregar o Render/Supabase
            const chunkSize = 50;
            for (let i = 0; i < entries.length; i += chunkSize) {
                const chunk = entries.slice(i, i + chunkSize);
                const upserts = chunk.map(([id, payload]) => ({
                    instance_key: instanceKey,
                    data_type: type,
                    data_id: id,
                    payload: JSON.parse(JSON.stringify(payload, BufferJSON.replacer)),
                    updated_at: new Date().toISOString()
                }));

                const { error } = await supabase
                    .schema('sistema')
                    .from('whatsapp_sessions')
                    .upsert(upserts, { onConflict: 'instance_key,data_type,data_id' });

                if (error) throw error;
                console.log(`[Auth] Gravado lote de ${chunk.length} chaves (${type}) no DB.`);
            }
        } catch (error) {
            console.error(`❌ Erro ao salvar lote ${type} no Supabase:`, error);
        }
    };

    // Carregar creds iniciais
    const initialCreds = await readData('creds', 'main');
    const creds: AuthenticationCreds = initialCreds || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const results = await readMany(type, ids);
                    const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};

                    for (const id of ids) {
                        let value = results[id];
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        tasks.push(writeMany(category, data[category]));
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData('creds', 'main', creds),
    };
};
