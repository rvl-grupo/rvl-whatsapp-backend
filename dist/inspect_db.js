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
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function inspect() {
    return __awaiter(this, void 0, void 0, function* () {
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
                const { data, error } = yield supabase.schema(t.schema).from(t.table).select('*').limit(1);
                if (error) {
                    console.log(`\u274c Tabela [${t.schema}.${t.table}]: Erro - ${error.message} (Code: ${error.code})`);
                }
                else {
                    const columns = data && data.length > 0 ? Object.keys(data[0]) : 'Tabela vazia (n\u00e3o consigo ver colunas)';
                    console.log(`\u2705 Tabela [${t.schema}.${t.table}]: Online! Colunas: ${Array.isArray(columns) ? columns.join(', ') : columns}`);
                }
            }
            catch (e) {
                console.log(`\u274c Tabela [${t.schema}.${t.table}]: Erro cr\u00edtico - ${e.message}`);
            }
        }
    });
}
inspect();
