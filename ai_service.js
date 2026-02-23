const axios = require('axios');
const prisma = require('./db');

// In-memory session context for very recent messages
// We still use this for performance, but could eventually move to DB
const memoryStore = new Map();
const MAX_MEMORY_LENGTH = 10;

class AIService {
    constructor() {
        this.settings = {
            apiKey: '',
            model: 'z-ai/glm-4.5-air:free',
            temperature: 0.7,
            systemPrompt: 'Você é um assistente virtual prestativo e educado.'
        };
        this.init();
    }

    async init() {
        await this.loadSettings();
    }

    async loadSettings() {
        try {
            const dbSettings = await prisma.aISettings.findUnique({
                where: { id: 1 }
            });

            if (dbSettings) {
                this.settings = {
                    apiKey: dbSettings.apiKey || '',
                    model: dbSettings.model,
                    temperature: parseFloat(dbSettings.temperature) || 0.7,
                    systemPrompt: dbSettings.systemPrompt || 'Você é um assistente virtual prestativo e educado.'
                };
            } else {
                // Initialize default in DB if not exists
                await prisma.aISettings.create({
                    data: {
                        id: 1,
                        apiKey: this.settings.apiKey,
                        model: this.settings.model,
                        temperature: this.settings.temperature.toString(),
                        systemPrompt: this.settings.systemPrompt
                    }
                });
            }
        } catch (error) {
            console.error('Erro ao ler configurações da IA do Banco:', error);
        }
    }

    async saveSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            await prisma.aISettings.upsert({
                where: { id: 1 },
                update: {
                    apiKey: this.settings.apiKey,
                    model: this.settings.model,
                    temperature: this.settings.temperature.toString(),
                    systemPrompt: this.settings.systemPrompt
                },
                create: {
                    id: 1,
                    apiKey: this.settings.apiKey,
                    model: this.settings.model,
                    temperature: this.settings.temperature.toString(),
                    systemPrompt: this.settings.systemPrompt
                }
            });
            return true;
        } catch (error) {
            console.error('Erro ao salvar configurações da IA no Banco:', error);
            return false;
        }
    }

    getSettings() {
        return this.settings;
    }

    async processMessage(userPhone, messageText) {
        // Refresh settings from DB to be sure
        await this.loadSettings();

        if (!this.settings.apiKey) {
            console.log('⚠️ Chave da API OpenRouter não configurada. Ignorando mensagem.');
            return { aiReply: null, confirmation: null };
        }

        if (!memoryStore.has(userPhone)) {
            memoryStore.set(userPhone, []);
        }

        const userHistory = memoryStore.get(userPhone);
        userHistory.push({ role: 'user', content: messageText });

        if (userHistory.length > MAX_MEMORY_LENGTH) {
            userHistory.shift();
        }

        const messages = [
            { role: 'system', content: this.settings.systemPrompt },
            ...userHistory
        ];

        console.log(`🧠 Consultando IA para o número ${userPhone}...`);

        try {
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: this.settings.model,
                messages: messages,
                temperature: parseFloat(this.settings.temperature) || 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.settings.apiKey}`,
                    'HTTP-Referer': 'https://smartatende.ai',
                    'X-Title': 'SmartAtende AI',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const aiReply = response.data.choices[0].message.content;
                userHistory.push({ role: 'assistant', content: aiReply });

                const confirmation = await this.detectAndSaveAppointment(userPhone, aiReply);

                return { aiReply, confirmation };
            } else {
                console.error('Resposta inesperada da OpenRouter:', response.data);
                return { aiReply: null, confirmation: null };
            }

        } catch (error) {
            console.error('❌ Erro de comunicação com OpenRouter:', error.response ? error.response.data : error.message);
            return { aiReply: null, confirmation: null };
        }
    }

    async detectAndSaveAppointment(userPhone, aiReply) {
        const confirmRegex = /(?:agendei|agendado|marcado|confirmei).*?(?:para|dia)\s+([\w\d/.-]+).*?(?:às|as)\s+(\d{1,2}:\d{2})/i;
        const match = aiReply.match(confirmRegex);

        if (match) {
            const dateStr = match[1];
            const timeStr = match[2];
            const service = this.extractService(aiReply) || "Atendimento";

            try {
                const newApp = await prisma.appointment.create({
                    data: {
                        userPhone: userPhone,
                        userName: userPhone.split('@')[0],
                        date: dateStr,
                        time: timeStr,
                        service: service,
                        status: "confirmado"
                    }
                });

                console.log(`✅ Agendamento salvo automaticamente no PostgreSQL para ${userPhone}`);

                return `✅ *Agendamento Confirmado!*\n\n📅 *Data:* ${dateStr}\n⏰ *Horário:* ${timeStr}\n💅 *Serviço:* ${service}\n\n_Te esperamos com carinho!_ ✨`;

            } catch (e) {
                console.error("Erro ao salvar agendamento automático no Banco:", e);
            }
        }
        return null;
    }

    extractService(text) {
        const services = ["manicure", "pedicure", "corte", "gel", "manicure em gel", "unhas"];
        for (const s of services) {
            if (text.toLowerCase().includes(s)) return s.charAt(0).toUpperCase() + s.slice(1);
        }
        return null;
    }
}

module.exports = new AIService();
