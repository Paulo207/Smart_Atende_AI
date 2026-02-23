const prisma = require('./db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log("🚀 Iniciando migração de JSON para PostgreSQL...");

    // 1. Migrar Configurações de IA
    const settingsFile = path.join(__dirname, 'ai_settings.json');
    if (fs.existsSync(settingsFile)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            await prisma.aISettings.upsert({
                where: { id: 1 },
                update: {
                    apiKey: settings.apiKey || null,
                    model: settings.model || "z-ai/glm-4.5-air:free",
                    temperature: settings.temperature?.toString() || "0.7",
                    systemPrompt: settings.systemPrompt || "Você é um assistente virtual prestativo e educado."
                },
                create: {
                    apiKey: settings.apiKey || null,
                    model: settings.model || "z-ai/glm-4.5-air:free",
                    temperature: settings.temperature?.toString() || "0.7",
                    systemPrompt: settings.systemPrompt || "Você é um assistente virtual prestativo e educado."
                }
            });
            console.log("✅ Configurações de IA migradas.");
        } catch (e) {
            console.error("❌ Erro ao migrar configurações:", e.message);
        }
    }

    // 2. Migrar Agendamentos
    const appointmentsFile = path.join(__dirname, 'appointments.json');
    if (fs.existsSync(appointmentsFile)) {
        try {
            const appointments = JSON.parse(fs.readFileSync(appointmentsFile, 'utf8'));
            for (const app of appointments) {
                await prisma.appointment.upsert({
                    where: { id: app.id },
                    update: {},
                    create: {
                        id: app.id,
                        userPhone: app.userPhone,
                        userName: app.userName || null,
                        date: app.date,
                        time: app.time,
                        service: app.service,
                        status: app.status || "confirmado",
                        createdAt: app.createdAt ? new Date(app.createdAt) : new Date()
                    }
                });
            }
            console.log(`✅ ${appointments.length} agendamentos migrados.`);
        } catch (e) {
            console.error("❌ Erro ao migrar agendamentos:", e.message);
        }
    }

    console.log("🏁 Migração concluída!");
}

migrate()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
