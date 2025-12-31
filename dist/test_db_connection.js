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
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Credenciais do Supabase não encontradas no .env');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    db: { schema: 'operacao' }
});
function testConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Testando acesso ao schema "operacao"...');
        // 1. Tentar ler a tabela chats
        const { data, error } = yield supabase
            .from('chats')
            .select('count')
            .limit(1);
        if (error) {
            console.error('❌ Erro ao acessar a tabela "chats" no schema "operacao":');
            console.error(error);
            if (error.code === '42P01') { // undefined_table
                console.log('\n⚠️  CONCLUSÃO: A tabela "chats" NÃO EXISTE no schema "operacao".');
                console.log('👉  Você precisa rodar o script SQL "database/use_operacao_schema.sql" no Painel do Supabase!');
            }
            else if (error.code === '42501') { // insufficient_privilege
                console.log('\n⚠️  CONCLUSÃO: Erro de Permissão (RLS).');
            }
        }
        else {
            console.log('✅ Sucesso! A tabela "chats" existe e é acessível.');
            console.log('📊 Registros encontrados (exemplo):', data);
        }
    });
}
testConnection();
