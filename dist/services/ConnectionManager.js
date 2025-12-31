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
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = exports.ConnectionManager = void 0;
const baileys_1 = require("@whiskeysockets/baileys");
class ConnectionManager {
    constructor() {
        this.initializing = new Map();
        this.reconnectAttempts = new Map();
        this.maxAttempts = 5;
    }
    /**
     * Verifica se uma instância já está em processo de inicialização
     */
    isInitializing(instanceKey) {
        return this.initializing.get(instanceKey) || false;
    }
    setInitializing(instanceKey, value) {
        this.initializing.set(instanceKey, value);
        if (value) {
            // Failsafe: Se em 60s não terminar, libera a trava
            setTimeout(() => this.initializing.set(instanceKey, false), 60000);
        }
    }
    /**
     * Determina se deve reconectar e qual o delay necessário
     */
    shouldReconnect(instanceKey, lastDisconnect) {
        var _a;
        const error = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error;
        const statusCode = (_a = error === null || error === void 0 ? void 0 : error.output) === null || _a === void 0 ? void 0 : _a.statusCode;
        // Logouts manuais não devem reconectar
        if (statusCode === baileys_1.DisconnectReason.loggedOut) {
            return { should: false, delay: 0 };
        }
        const isConflict = statusCode === baileys_1.DisconnectReason.connectionReplaced;
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
        }
        else {
            this.reconnectAttempts.set(instanceKey, attempts + 1);
            delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Backoff exponencial
        }
        return { should: true, delay };
    }
    resetAttempts(instanceKey) {
        this.reconnectAttempts.set(instanceKey, 0);
    }
    /**
     * Limpa o socket antigo de forma segura
     */
    cleanupSocket(sock) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!sock)
                return;
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
            }
            catch (e) {
                console.error('❌ Erro ao fechar socket antigo:', e);
            }
        });
    }
}
exports.ConnectionManager = ConnectionManager;
exports.connectionManager = new ConnectionManager();
