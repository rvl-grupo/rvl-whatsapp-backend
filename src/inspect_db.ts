import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('🔍 Iniciando Inspe\u00e7\u00e3o de Banco de Dados...');

    const tablesToCheck = [
        { schema: 'sistema', table: 'feedback' },
        { schema: 'sistema', table: 'profiles' },
        { schema: 'operacao', table: 'messages' },
        { schema: 'operacao', table: 'chats' },
        { schema: 'crm', table: 'leads' },
        { schema: 'crm', table: 'contacts' }
    ];

    for (const t of tablesToCheck) {
        try {
            const { data, error } = await supabase.schema(t.schema).from(t.table).select('*').limit(1);
            if (error) {
                console.log(`\u274c Tabela [${t.schema}.${t.table}]: Erro - ${error.message} (Code: ${error.code})`);
            } else {
                const columns = data && data.length > 0 ? Object.keys(data[0]) : 'Tabela vazia (n\u00e3o consigo ver colunas)';
                console.log(`\u2705 Tabela [${t.schema}.${t.table}]: Online! Colunas: ${Array.isArray(columns) ? columns.join(', ') : columns}`);
            }
        } catch (e: any) {
            console.log(`\u274c Tabela [${t.schema}.${t.table}]: Erro cr\u00edtico - ${e.message}`);
        }
    }
}

inspect();
