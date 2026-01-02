import { WASocket, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { databaseService } from './DatabaseService.js';

export class ConnectionManager {
    private initializing: Map<string, boolean> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private maxAttempts = 5;

    /**
     * Verifica se uma instância já está em processo de inicialização
     */
    public isInitializing(instanceKey: string): boolean {
        return this.initializing.get(instanceKey) || false;
    }

    public setInitializing(instanceKey: string, value: boolean) {
        this.initializing.set(instanceKey, value);
        if (value) {
            // Failsafe: Se em 60s não terminar, libera a trava
            setTimeout(() => this.initializing.set(instanceKey, false), 60000);
        }
    }

    /**
     * Determina se deve reconectar e qual o delay necessário
     */
    public shouldReconnect(instanceKey: string, lastDisconnect: any): { should: boolean; delay: number } {
        const error = lastDisconnect?.error as Boom;
        const statusCode = error?.output?.statusCode;

        // Logouts manuais não devem reconectar
        if (statusCode === DisconnectReason.loggedOut) {
            return { should: false, delay: 0 };
        }

        const isConflict = statusCode === DisconnectReason.connectionReplaced;
        const attempts = this.reconnectAttempts.get(instanceKey) || 0;

        if (attempts > this.maxAttempts && !isConflict) {
            console.log(`⚠️ Máximo de tentativas atingido para [${instanceKey}]. Aguardando intervenção.`);
            return { should: false, delay: 0 };
        }

        // Delay base
        let delay = 5000;

        if (isConflict) {
            console.log(`🔄 Conflito de sessão detectado em [${instanceKey}]. Aplicando delay estendido.`);
            delay = 20000; // 20 segundos para o WhatsApp liberar a sessão antiga
        } else {
            this.reconnectAttempts.set(instanceKey, attempts + 1);
            delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Backoff exponencial
        }

        return { should: true, delay };
    }

    public resetAttempts(instanceKey: string) {
        this.reconnectAttempts.set(instanceKey, 0);
    }

    /**
     * Limpa o socket antigo de forma segura
     */
    public async cleanupSocket(sock: WASocket | null) {
        if (!sock) return;
        try {
            // Remove listeners antes de encerrar para evitar loops de erro
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.ev.removeAllListeners('creds.update');

            // Tenta encerrar graciosamente
            sock.end(undefined);

            if (sock.ws) {
                sock.ws.close();
            }
        } catch (e) {
            console.error('❌ Erro ao fechar socket antigo:', e);
        }
    }
}

export const connectionManager = new ConnectionManager();
