import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { whatsappService } from './whatsapp';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;

app.use(cors({
    origin: ['https://app.gruporvl.com.br', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json());

// Basic health check
app.get('/', (req, res) => {
    res.send({ status: 'online', service: 'RVL WhatsApp Backend Multi-Instance' });
});

// Endpoint to get QR Code and Status for a specific instance
app.get('/status/:instance?', (req, res) => {
    const instanceKey = req.params.instance || 'default';
    const state = whatsappService.getStatus(instanceKey);
    res.json({
        instance_key: instanceKey,
        status: state.status,
        qrCode: state.qr // Mantendo compatibilidade de nome com o front
    });
});

// List all active instances
app.get('/instances', (req, res) => {
    const instances = whatsappService.getAllInstances();
    res.json(instances);
});

app.post('/reconnect/:instance?', async (req, res) => {
    const instanceKey = req.params.instance || 'default';
    await whatsappService.initialize(instanceKey);
    res.json({ success: true, message: `Reconexão iniciada para ${instanceKey}` });
});

app.post('/logout/:instance?', async (req, res) => {
    const instanceKey = req.params.instance || 'default';
    const success = await whatsappService.logout(instanceKey);
    res.json({ success });
});

app.post('/send-message', async (req, res) => {
    try {
        const { to, text, mediaUrl, mediaType, instanceKey, userName } = req.body;
        const targetInstance = instanceKey || 'default';

        if (!to) {
            return res.status(400).json({ error: 'Parâmetro "to" é obrigatório' });
        }

        const result = await whatsappService.sendMessage(targetInstance, to, text || '', mediaUrl, mediaType, userName);
        res.json(result);
    } catch (error: any) {
        console.error('❌ Erro no envio:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize a new instance explicitly
app.post('/instances/init', async (req, res) => {
    const { instanceKey } = req.body;
    if (!instanceKey) return res.status(400).json({ error: 'instanceKey é obrigatório' });

    await whatsappService.initialize(instanceKey);
    res.json({ success: true, message: `Instância ${instanceKey} inicializada` });
});

app.listen(port, () => {
    console.log(`Servidor WhatsApp Multi-Instance rodando na porta ${port}`);
});
