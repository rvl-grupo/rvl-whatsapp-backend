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

    // Auxiliar para ler dados do Supabase
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

    // Auxiliar para escrever dados no Supabase
    const writeData = async (type: string, id: string, payload: any) => {
        try {
            // Se for undefined ou null, deletamos o registro
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

    // Carregar creds iniciais
    const creds: AuthenticationCreds = (await readData('creds', 'main')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(type, id);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            tasks.push(writeData(category, id, value));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData('creds', 'main', creds),
    };
};
