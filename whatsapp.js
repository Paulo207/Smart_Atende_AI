const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const aiService = require("./ai_service");
const { EventEmitter } = require("events");

class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.state = null;
    this.saveCreds = null;
    this.connectionStatus = "disconnected";
    this.qrCodeStr = null;
    this.chats = new Map();
  }

  async init() {
    const authPath = path.join(__dirname, "auth");
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    this.state = state;
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["Chrome (Linux)", "", ""],
      syncFullHistory: false
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCodeStr = qr;
        console.log("📲 Novo QR Code recebido!");
      }

      if (connection) {
        this.connectionStatus = connection;
        console.log(`📡 Status da conexão: ${connection}`);
      }

      if (connection === "open") {
        console.log("✅ Conectado com sucesso!");
        this.qrCodeStr = null;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`❌ Conexão fechada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => this.reconnect(), 5000);
        } else {
          console.log("Conexão encerrada. Deslogado. Limpando credenciais antigas...");
          this.logout();
        }
      }
    });

    this.sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0];
      if (!msg.message) return; // Ignora se não houver mensagem

      const remoteJid = msg.key.remoteJid;
      // Permitir apenas conversas individuais (evitar grupos @g.us)
      if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

      const messageType = Object.keys(msg.message)[0];
      let text = '';

      if (messageType === 'conversation') {
        text = msg.message.conversation;
      } else if (messageType === 'extendedTextMessage') {
        text = msg.message.extendedTextMessage.text;
      }

      if (!text) return; // Apenas processa textos

      const isFromMe = msg.key.fromMe;

      const messageData = {
        id: msg.key.id,
        remoteJid,
        text,
        fromMe: isFromMe,
        timestamp: msg.messageTimestamp
      };

      // Save to local chat history
      if (!this.chats.has(remoteJid)) this.chats.set(remoteJid, []);
      this.chats.get(remoteJid).push(messageData);
      if (this.chats.get(remoteJid).length > 50) this.chats.get(remoteJid).shift(); // Guarda últimas 50 mensagens

      // Emit to websocket
      this.emit('new_message', messageData);

      // Process only incoming messages for AI
      if (!isFromMe) {
        console.log(`📩 Nova mensagem de ${remoteJid}: ${text}`);

        try {
          // Envia lido
          await this.sock.readMessages([msg.key]);

          // Simula digitação por 1 a 3 segundos
          await this.sock.sendPresenceUpdate('composing', remoteJid);
          const typingDelay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
          await new Promise(r => setTimeout(r, typingDelay));

          // Processa IA
          const { aiReply, confirmation } = await aiService.processMessage(remoteJid, text);

          await this.sock.sendPresenceUpdate('paused', remoteJid);

          if (aiReply) {
            await this.sock.sendMessage(remoteJid, { text: aiReply });
            console.log(`🤖 IA respondeu para ${remoteJid}`);

            // Se houver uma confirmação de agendamento, envia logo em seguida
            if (confirmation) {
              await new Promise(r => setTimeout(r, 1500)); // Pequeno delay antes do comprovante
              await this.sock.sendMessage(remoteJid, { text: confirmation });
              console.log(`✅ Comprovante de agendamento enviado para ${remoteJid}`);
            }
          }
        } catch (err) {
          console.error(`Erro ao processar mensagem de ${remoteJid}:`, err);
        }
      }
    });

    return this.sock;
  }

  async reconnect() {
    if (this.sock) {
      try {
        this.sock.end();
      } catch (e) { }
    }
    return this.init();
  }

  async logout() {
    if (this.sock) {
      try {
        await this.sock.logout();
        this.sock.end();
      } catch (e) {
        console.error("Erro ao deslogar socket:", e);
      }
    }
    this.sock = null;
    this.connectionStatus = "logged_out";
    this.qrCodeStr = null;

    const authPath = path.join(__dirname, "auth");
    if (fs.existsSync(authPath)) {
      try {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log("📂 Pasta auth removida com sucesso.");
      } catch (err) {
        console.error("Erro ao remover pasta auth:", err);
      }
    }
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  getQR() {
    return this.qrCodeStr;
  }

  getAllChats() {
    // Retorna os chats formatados para o dashboard
    return Array.from(this.chats.entries()).map(([jid, messages]) => ({
      jid,
      messages,
      lastMessage: messages[messages.length - 1]?.text || ""
    }));
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      qrData: this.qrCodeStr
    };
  }
}

module.exports = new WhatsAppService();
