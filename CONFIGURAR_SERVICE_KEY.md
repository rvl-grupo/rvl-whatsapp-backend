# ============================================
# INSTRUÇÕES PARA CONFIGURAR O BACKEND
# ============================================

## 🔑 Como obter a Service Role Key do Supabase

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto: seuwdlkaxakqkwmeecpu
3. No menu lateral, clique em **Settings** (⚙️)
4. Clique em **API**
5. Role até a seção **Project API keys**
6. Copie a chave **`service_role`** (não a `anon`!)
   
   ⚠️ **ATENÇÃO**: Esta chave tem poderes TOTAIS no seu banco de dados.
   NUNCA a exponha em código frontend ou repositórios públicos!

## 📝 Onde colar a chave

Abra o arquivo: `whatsapp-backend/.env`

Substitua a linha:
```
SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
```

Por:
```
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldXdkbGtheGFrcWt3bWVlY3B1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczODEyNCwiZXhwIjoyMDgyMzE0MTI0fQ.COLE_SUA_CHAVE_AQUI
```

## 🔄 Reiniciar o backend

Após colar a chave, você precisa reiniciar o servidor backend para que as mudanças tenham efeito.

## ✅ Testando

Depois de reiniciar:
1. Envie uma mensagem de um novo número para o WhatsApp conectado
2. O contato deve aparecer automaticamente na lista de contatos do CRM
3. Verifique os logs do backend para confirmar que o contato foi criado

## 🐛 Se ainda não funcionar

Verifique os logs do backend para mensagens de erro relacionadas a:
- Permissões do Supabase
- Erros de criação de contatos
- Problemas de conexão com o banco de dados
