// index.js
import makeWASocket, { fetchLatestBaileysVersion, useMultiFileAuthState, delay, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

// 🔧 CONFIGURAÇÕES
const PASTA_ARQUIVOS = `${process.env.HOME}/storage/shared/Disparos`; // Pasta com os arquivos
const INTERVALO_ENTRE_NUMEROS = 25000; // 25 segundos entre números (ajustável)
const NUMEROS_FILE = 'numeros.txt';
const LEGENDA_FILE = 'legenda.txt';
const PRODUTOS_FILE = 'produtos.txt'; // Lista de arquivos que serão enviados

// 🔹 Função para normalizar números para WhatsApp
function normalizarNumero(numero) {
    let n = numero.replace(/\D/g, '');
    // Ajuste do quinto dígito se necessário
    if (n.length === 13) {
        const quinto = n[4];
        if (quinto === '9') {
            n = n.slice(0, 4) + n.slice(5);
        }
    }
    return n;
}

// 🚀 Iniciar WhatsApp
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('📱 Escaneie o QR code com o WhatsApp!');
        }

        if (connection === 'close') {
            console.log('❌ Conexão fechada');
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Tentando reconectar...');
                startWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

// 🧠 Função principal
async function startBot() {
    const sock = await startWhatsApp();

    console.log('⏳ Aguardando conexão...');
    await new Promise((resolve) => {
        const listener = (update) => {
            if (update.connection === 'open') {
                sock.ev.off('connection.update', listener);
                resolve();
            }
        };
        sock.ev.on('connection.update', listener);
    });

    console.log('🚀 Conexão estabelecida!');

    // 📄 Ler números e legenda
    const numeros = fs.readFileSync(NUMEROS_FILE, 'utf-8')
                     .split('\n')
                     .map(n => normalizarNumero(n))
                     .filter(n => n);

    const legenda = fs.readFileSync(LEGENDA_FILE, 'utf-8').trim();

    // 📄 Ler produtos a enviar
    const produtos = fs.readFileSync(PRODUTOS_FILE, 'utf-8')
                      .split('\n')
                      .map(p => p.trim())
                      .filter(p => p);

    for (const numero of numeros) {
        const jid = numero + '@s.whatsapp.net';
        console.log(`📤 Enviando para ${numero}...`);

        for (const arquivo of produtos) {
            const caminho = path.join(PASTA_ARQUIVOS, arquivo);
            if (!fs.existsSync(caminho)) {
                console.log(`⚠️ Arquivo não encontrado: ${arquivo}`);
                continue;
            }

            const ext = path.extname(arquivo).toLowerCase();
            try {
                if (['.mp3', '.wav', '.ogg'].includes(ext)) {
                    // Envia áudio
                    await sock.sendMessage(jid, { audio: { url: caminho }, mimetype: 'audio/mpeg' });
                    // Envia legenda separada
                    await sock.sendMessage(jid, { text: legenda });
                } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                    // Envia imagem com legenda
                    await sock.sendMessage(jid, { image: { url: caminho }, caption: legenda });
                } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
                    // Envia vídeo com legenda
                    await sock.sendMessage(jid, { video: { url: caminho }, caption: legenda });
                } else {
                    // Envia documento
                    await sock.sendMessage(jid, { document: { url: caminho }, mimetype: 'application/octet-stream', fileName: arquivo });
                    // Envia legenda separada
                    await sock.sendMessage(jid, { text: legenda });
                }

                console.log(`📎 Arquivo enviado: ${arquivo}`);
                await delay(2000); // 2 segundos entre arquivos
            } catch (err) {
                console.error(`⚠️ Erro ao enviar ${arquivo}:`, err);
            }
        }

        console.log(`⏱ Aguardando ${INTERVALO_ENTRE_NUMEROS / 1000}s antes do próximo número...`);
        await delay(INTERVALO_ENTRE_NUMEROS);
    }

    console.log('✅ Todos os envios foram concluídos!');
}

startBot();
