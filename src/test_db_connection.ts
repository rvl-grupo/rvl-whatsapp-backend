
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Credenciais do Supabase não encontradas no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'operacao' }
});

async function testConnection() {
    console.log('🔍 Testando acesso ao schema "operacao"...');

    // 1. Tentar ler a tabela chats
    const { data, error } = await supabase
        .from('chats')
        .select('count')
        .limit(1);

    if (error) {
        console.error('❌ Erro ao acessar a tabela "chats" no schema "operacao":');
        console.error(error);

        if (error.code === '42P01') { // undefined_table
            console.log('\n⚠️  CONCLUSÃO: A tabela "chats" NÃO EXISTE no schema "operacao".');
            console.log('👉  Você precisa rodar o script SQL "database/use_operacao_schema.sql" no Painel do Supabase!');
        } else if (error.code === '42501') { // insufficient_privilege
            console.log('\n⚠️  CONCLUSÃO: Erro de Permissão (RLS).');
        }
    } else {
        console.log('✅ Sucesso! A tabela "chats" existe e é acessível.');
        console.log('📊 Registros encontrados (exemplo):', data);
    }
}

testConnection();
