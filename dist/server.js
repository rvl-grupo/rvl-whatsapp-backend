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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_crypto_1 = require("node:crypto");
const whatsapp_js_1 = require("./whatsapp.js");
// ✅ CORREÇÃO DE SEGURANÇA: Injeta a criptografia necessária para o Baileys v7
if (!globalThis.crypto) {
    globalThis.crypto = node_crypto_1.webcrypto;
}
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3005;
app.use((0, cors_1.default)({
    origin: ['https://app.gruporvl.com.br', 'http://localhost:5173'],
    credentials: true
}));
app.use(express_1.default.json());
// Basic health check
app.get('/', (req, res) => {
    res.send({ status: 'online', service: 'RVL WhatsApp Backend Multi-Instance' });
});
// Endpoint to get QR Code and Status for a specific instance
app.get('/status/:instance?', (req, res) => {
    const instanceKey = req.params.instance || 'default';
    const state = whatsapp_js_1.whatsappService.getStatus(instanceKey);
    res.json({
        instance_key: instanceKey,
        status: state.status,
        qrCode: state.qr // Mantendo compatibilidade de nome com o front
    });
});
// List all active instances
app.get('/instances', (req, res) => {
    const instances = whatsapp_js_1.whatsappService.getAllInstances();
    res.json(instances);
});
app.post('/reconnect/:instance?', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const instanceKey = req.params.instance || 'default';
    yield whatsapp_js_1.whatsappService.initialize(instanceKey);
    res.json({ success: true, message: `Reconexão iniciada para ${instanceKey}` });
}));
app.post('/logout/:instance?', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const instanceKey = req.params.instance || 'default';
    const success = yield whatsapp_js_1.whatsappService.logout(instanceKey);
    res.json({ success });
}));
app.post('/send-message', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { to, text, mediaUrl, mediaType, instanceKey, userName } = req.body;
        const targetInstance = instanceKey || 'default';
        if (!to) {
            return res.status(400).json({ error: 'Parâmetro "to" é obrigatório' });
        }
        const result = yield whatsapp_js_1.whatsappService.sendMessage(targetInstance, to, text || '', mediaUrl, mediaType, userName);
        res.json(result);
    }
    catch (error) {
        console.error('❌ Erro no envio:', error);
        res.status(500).json({ error: error.message });
    }
}));
// Initialize a new instance explicitly
app.post('/instances/init', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { instanceKey } = req.body;
    if (!instanceKey)
        return res.status(400).json({ error: 'instanceKey é obrigatório' });
    yield whatsapp_js_1.whatsappService.initialize(instanceKey);
    res.json({ success: true, message: `Instância ${instanceKey} inicializada` });
}));
app.listen(port, () => {
    console.log(`Servidor WhatsApp Multi-Instance rodando na porta ${port}`);
});
