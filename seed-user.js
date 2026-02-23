const prisma = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('🚀 Iniciando criação do usuário mestre...');

    const email = 'admin@smartatende.ai';
    const password = 'admin'; // Senha padrão inicial
    const name = 'Administrador';

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.upsert({
            where: { email },
            update: {
                password: hashedPassword
            },
            create: {
                email,
                name,
                password: hashedPassword
            }
        });

        console.log('✅ Usuário criado com sucesso!');
        console.log(`📧 E-mail: ${email}`);
        console.log(`🔑 Senha: ${password}`);
        console.log('\n⚠️ Lembre-se de mudar a senha após o primeiro login.');
    } catch (error) {
        console.error('❌ Erro ao criar usuário:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
