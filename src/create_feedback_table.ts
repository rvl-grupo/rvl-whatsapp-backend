import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || ''; // Deve ser a SERVICE_ROLE_KEY para criar tabelas via SQL
const supabase = createClient(supabaseUrl, supabaseKey);

async function createFeedbackTable() {
    console.log('🏗️ Tentando criar tabela sistema.feedback...');

    // Nota: O Supabase JS não cria tabelas diretamente por padrão (DDL).
    // Mas podemos tentar usar o rpc se houver uma função de help ou 
    // simplesmente informar ao usuário o SQL exato.

    const sql = `
    CREATE TABLE IF NOT EXISTS sistema.feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        user_name TEXT,
        page_url TEXT,
        type TEXT,
        description TEXT,
        is_done BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    -- Habilitar RLS
    ALTER TABLE sistema.feedback ENABLE ROW LEVEL SECURITY;

    -- Política para inserção pública (para que feedbacks cheguem)
    CREATE POLICY "Permitir inserção de feedback" ON sistema.feedback
    FOR INSERT WITH CHECK (true);

    -- Política para leitura apenas para admins (você pode ajustar depois)
    CREATE POLICY "Permitir leitura de feedback para todos" ON sistema.feedback
    FOR SELECT USING (true);
    `;

    console.log('\n📋 COPIE E COLE O SQL ABAIXO NO SQL EDITOR DO SEU SUPABASE:\n');
    console.log('--------------------------------------------------');
    console.log(sql);
    console.log('--------------------------------------------------');

    // Tenta executar via RPC caso exista uma função genérica (raro, mas possível)
    try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
        if (error) {
            console.log('\n❌ Não consegui executar o SQL automaticamente (Permissão negada ou função RPC inexistente).');
            console.log('👉 Por favor, use o código SQL acima no painel do Supabase (SQL Editor).');
        } else {
            console.log('\n✅ Tabela criada com sucesso via RPC!');
        }
    } catch (e) {
        console.log('\n👉 Siga as instruções acima para criar a tabela manualmente.');
    }
}

createFeedbackTable();
