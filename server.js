const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./db');
const whatsappService = require('./whatsapp');
const aiService = require('./ai_service');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'smart-atende-ai-secret-key-2026';

app.use(express.json());

// Middleware de Autenticação
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// --- Auth Routes ---

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign(
                { id: user.id, email: user.email, name: user.name },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            res.json({ token, user: { name: user.name, email: user.email } });
        } else {
            res.status(401).json({ error: 'E-mail ou senha inválidos' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro no servidor durante login' });
    }
});

app.get('/api/auth/me', authenticateJWT, (req, res) => {
    res.json(req.user);
});

// --- WhatsApp Routes (Protected) ---

app.get('/api/whatsapp/status', authenticateJWT, (req, res) => {
    res.json({ status: whatsappService.getConnectionStatus() });
});

app.get('/api/whatsapp/qr', authenticateJWT, (req, res) => {
    const qr = whatsappService.getQR();
    if (qr) {
        res.json({ qr });
    } else {
        res.json({ qr: null, status: whatsappService.getConnectionStatus() });
    }
});

app.post('/api/whatsapp/restart', authenticateJWT, async (req, res) => {
    res.json({ status: whatsappService.getConnectionStatus() });
});

app.post('/api/whatsapp/connect', authenticateJWT, async (req, res) => {
    try {
        await whatsappService.reconnect();
        res.json({ success: true, message: 'Solicitando novo QR Code...' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/whatsapp/disconnect', authenticateJWT, async (req, res) => {
    try {
        await whatsappService.logout();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/whatsapp/send', authenticateJWT, async (req, res) => {
    const { jid, text } = req.body;
    try {
        const result = await whatsappService.sendMessage(jid, text);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Settings Routes (Protected) ---

app.get('/api/settings/ai', authenticateJWT, async (req, res) => {
    try {
        const settings = await prisma.aISettings.findUnique({ where: { id: 1 } });
        res.json(settings || aiService.getSettings());
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar configurações" });
    }
});

app.post('/api/settings/ai', authenticateJWT, async (req, res) => {
    try {
        await aiService.saveSettings(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar configurações" });
    }
});

// --- Appointments Routes (Protected) ---

app.get('/api/appointments', authenticateJWT, async (req, res) => {
    try {
        const appointments = await prisma.appointment.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar agendamentos" });
    }
});

app.post('/api/appointments', authenticateJWT, async (req, res) => {
    try {
        const newApp = await prisma.appointment.create({
            data: {
                ...req.body,
                status: "confirmado"
            }
        });
        broadcastToDashboard({ type: 'new_appointment', data: newApp });
        res.json(newApp);
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar agendamento" });
    }
});

app.delete('/api/appointments/:id', authenticateJWT, async (req, res) => {
    try {
        await prisma.appointment.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Erro ao deletar agendamento" });
    }
});

// --- Contacts Routes (Protected) ---

app.get('/api/contacts', authenticateJWT, async (req, res) => {
    try {
        const contacts = await prisma.contact.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar contatos" });
    }
});

// Serving Files
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// App presentation landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});

// Main dashboard application
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(path.join(__dirname)));

// WebSocket Broadcasting
function broadcastToDashboard(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// WebSocket Events
wss.on('connection', async (ws) => {
    console.log('🔗 Painel conectado ao WebSocket');

    // Send initial chat list
    ws.send(JSON.stringify({
        type: 'init_chats',
        data: whatsappService.getAllChats()
    }));
});

// WhatsApp Event Listeners
whatsappService.on('connection_update', (update) => {
    broadcastToDashboard({ type: 'wa_status', data: update });
});

whatsappService.on('qr_code', (qrDataUrl) => {
    broadcastToDashboard({ type: 'wa_qr', qr: qrDataUrl });
});

whatsappService.on('new_message', async (msg) => {
    broadcastToDashboard({ type: 'new_message', data: msg });

    // Auto-save contact if new
    if (!msg.fromMe && msg.remoteJid) {
        try {
            await prisma.contact.upsert({
                where: { phone: msg.remoteJid },
                update: {},
                create: {
                    phone: msg.remoteJid,
                    name: msg.pushName || msg.remoteJid.split('@')[0]
                }
            });
        } catch (e) {
            console.error("Erro ao salvar contato automático:", e.message);
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`Painel SmartAtende AI disponível.`);

    // Initialize WhatsApp
    whatsappService.init().catch(err => {
        console.error("Erro ao inicializar WhatsApp:", err);
    });
});
