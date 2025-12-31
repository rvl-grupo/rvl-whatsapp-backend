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
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || ''; // Deve ser a SERVICE_ROLE_KEY para criar tabelas via SQL
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function createFeedbackTable() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const { error } = yield supabase.rpc('exec_sql', { sql_query: sql });
            if (error) {
                console.log('\n❌ Não consegui executar o SQL automaticamente (Permissão negada ou função RPC inexistente).');
                console.log('👉 Por favor, use o código SQL acima no painel do Supabase (SQL Editor).');
            }
            else {
                console.log('\n✅ Tabela criada com sucesso via RPC!');
            }
        }
        catch (e) {
            console.log('\n👉 Siga as instruções acima para criar a tabela manualmente.');
        }
    });
}
createFeedbackTable();
