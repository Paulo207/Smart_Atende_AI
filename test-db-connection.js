const { Client } = require('pg');

async function testConnection() {
    const connectionString = "postgresql://postgres:Paulo051051*@localhost:5432/Smart_Atende_AI?schema=public";
    const client = new Client({ connectionString });
    try {
        console.log("Tentando conectar ao PostgreSQL...");
        await client.connect();
        console.log("Conectado com sucesso!");
        await client.end();
    } catch (err) {
        console.error("Erro ao conectar:", err.message);
        process.exit(1);
    }
}

testConnection();
