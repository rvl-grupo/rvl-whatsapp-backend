import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'operacao' }
});

async function testContactCreation() {
    console.log('🧪 ========================================');
    console.log('🧪 TESTE DE CRIAÇÃO DE CONTATO');
    console.log('🧪 ========================================\n');

    // Gerar um número de teste único
    const testNumber = `5511${Date.now().toString().slice(-8)}@s.whatsapp.net`;
    const testName = `Teste ${new Date().toLocaleTimeString()}`;

    console.log('📋 Dados do teste:');
    console.log(`   Nome: ${testName}`);
    console.log(`   Número: ${testNumber}\n`);

    try {
        // 1. Criar Chat
        console.log('1️⃣ Criando chat...');
        const { data: newChat, error: chatError } = await supabase
            .schema('operacao')
            .from('chats')
            .insert({
                whatsapp_id: testNumber,
                name: testName,
                last_message: 'Mensagem de teste',
                last_message_at: new Date().toISOString()
            })
            .select()
            .single();

        if (chatError) {
            console.error('❌ Erro ao criar chat:', chatError);
            return;
        }

        console.log('✅ Chat criado com sucesso!');
        console.log(`   ID: ${newChat.id}\n`);

        // 2. Criar Contato
        console.log('2️⃣ Criando contato no CRM...');
        const contactPayload = {
            chat_id: newChat.id,
            name: testName,
            whatsapp_number: testNumber,
            created_at: new Date().toISOString()
        };

        console.log('📋 Payload do contato:', JSON.stringify(contactPayload, null, 2));

        const { data: newContact, error: contactError } = await supabase
            .schema('crm')
            .from('contacts')
            .insert(contactPayload)
            .select()
            .single();

        if (contactError) {
            console.error('\n❌ ========================================');
            console.error('❌ ERRO AO CRIAR CONTATO:');
            console.error('   Mensagem:', contactError.message);
            console.error('   Código:', contactError.code);
            console.error('   Detalhes:', contactError.details);
            console.error('   Hint:', contactError.hint);
            console.error('❌ ========================================\n');

            // Tentar limpar o chat criado
            await supabase.schema('operacao').from('chats').delete().eq('id', newChat.id);
            return;
        }

        console.log('\n✅ ========================================');
        console.log('✅ CONTATO CRIADO COM SUCESSO!');
        console.log('   ID:', newContact.id);
        console.log('   Nome:', newContact.name);
        console.log('   Número:', newContact.whatsapp_number);
        console.log('   Chat ID:', newContact.chat_id);
        console.log('✅ ========================================\n');

        // 3. Verificar se o contato aparece na lista
        console.log('3️⃣ Verificando se o contato aparece na lista...');
        const { data: contacts, error: listError } = await supabase
            .schema('crm')
            .from('contacts')
            .select('*')
            .eq('id', newContact.id);

        if (listError) {
            console.error('❌ Erro ao buscar contato:', listError);
        } else if (contacts && contacts.length > 0) {
            console.log('✅ Contato encontrado na lista!');
            console.log('   Dados:', JSON.stringify(contacts[0], null, 2));
        } else {
            console.log('⚠️ Contato não encontrado na lista (pode ser problema de RLS no frontend)');
        }

        console.log('\n🎉 ========================================');
        console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
        console.log('🎉 ========================================\n');

        console.log('💡 Próximos passos:');
        console.log('   1. Abra o CRM no navegador');
        console.log('   2. Verifique se o contato aparece na lista');
        console.log('   3. Se não aparecer, pode ser problema de RLS no frontend\n');

    } catch (error) {
        console.error('\n💥 Erro inesperado:', error);
    }
}

// Executar teste
testContactCreation()
    .then(() => {
        console.log('✅ Script finalizado');
        process.exit(0);
    })
    .catch((err) => {
        console.error('💥 Erro fatal:', err);
        process.exit(1);
    });
