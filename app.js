// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyChRpWOi8UON6LvU3ERmSNQ04IwtRUoZDc",
    authDomain: "chatprivado-33d21.firebaseapp.com",
    projectId: "chatprivado-33d21",
    storageBucket: "chatprivado-33d21.firebasestorage.app",
    messagingSenderId: "823294283727",
    appId: "1:823294283727:web:f3df8f62461ed1d0004cba"
};

// Initialize Firebase using compat SDK
const app = firebase.initializeApp(firebaseConfig);

// App Check con reCAPTCHA v3 — REQUERIDO porque Firebase Console lo tiene activado
// tanto para Auth como para Firestore. Sin esto, el login y el envío de mensajes fallan.
try {
    if (typeof firebase !== 'undefined' && typeof firebase.appCheck === 'function') {
        const appCheck = firebase.appCheck();
        appCheck.activate(
            new firebase.appCheck.ReCaptchaV3Provider('6LdyqYMsAAAAAPjGQD-PSjuIjarpCBXO-E-sw9sW'),
            true
        );
        console.log("ChatSEK v3.2.7 - App Check activado.");
    }
} catch (e) {
    console.error("App Check error:", e.message);
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// ─── Security Helper: XSS Prevention ───────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// State
let currentUserData = null;
let activeChatUser = null;
let allMessages = [];
let allUsers = [];
let allGroups = [];
let myStream = null;
let currentCallId = null;
let isAudioOnlyCall = false;
let isCaller = false;
let webrtcInitTimeout = null;
let audioContext = null;

// New message mechanics
let editingMessageId = null;
let replyingToMessage = null;
let isUserBanned = false; // New global ban state
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let unsubscribeGroups = null;
let editingUserId = null;
let jitsiApi = null;
let processedCallIds = new Set(); // To avoid duplicate alerts
let readMessageIds = new Set();   // IDs de mensajes ya leídos localmente
let listenerStartTime = Date.now(); // Used to filter out old messages upon login

// Voice Recording State (Removed duplicate variables)

// Inactivity Settings
let idleTimeout;
let logoutTimeout;
const IDLE_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes
const LOGOUT_TIME_LIMIT = 2 * 60 * 1000; // 2 minutes

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const forgotPasswordBtn = document.getElementById('forgot-password');

const myProfileImg = document.getElementById('my-profile-img');
const currentUserName = document.getElementById('current-user-name');
const btnLogout = document.getElementById('btn-logout');
const btnAdminPanel = document.getElementById('btn-admin-panel');

const contactList = document.getElementById('contact-list');
const activeContactName = document.getElementById('active-contact-name');
const activeContactImg = document.getElementById('active-contact-img');
const chatHeaderInfo = document.querySelector('.chat-header-info');
const chatHeaderText = document.querySelector('.chat-header-text');
const chatStatus = document.querySelector('.status');
const chatMessages = document.getElementById('chat-messages');
const welcomeMessage = document.getElementById('welcome-message');
const chatInputArea = document.getElementById('chat-input-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');

// --- Audio Recording Logic ---
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingSeconds = 0;
let recordingCancelled = false;

const recordingBar = document.getElementById('recording-bar');
const recordingTimerEl = document.getElementById('recording-timer');

// cancelRecording y send-recording se obtienen lazy porque pueden ser null al cargar
function startRecording() {
    if (!activeChatUser) return;
    recordingCancelled = false;
    audioChunks = [];
    recordingSeconds = 0;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        // Elegir el mejor formato disponible
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
            .find(t => MediaRecorder.isTypeSupported(t)) || '';

        try {
            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }

        // Recoger chunks continuamente
        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            stopRecordingUI();

            if (recordingCancelled) return;
            if (audioChunks.length === 0) {
                alert("No se grabó nada. Inténtalo de nuevo.");
                return;
            }

            const mimeUsed = mediaRecorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(audioChunks, { type: mimeUsed });

            if (blob.size > 900 * 1024) {
                alert("⚠️ Audio demasiado largo. Máximo 30 segundos.");
                return;
            }

            // Subir a Firebase Storage y enviar URL
            const fileName = `audio_${Date.now()}_${auth.currentUser.uid}.webm`;
            const storageRef = storage.ref().child(`chat_audios/${fileName}`);

            storageRef.put(blob).then(snapshot => {
                return snapshot.ref.getDownloadURL();
            }).then(url => {
                sendMessage(url, 'audio').catch(err => console.error(err));
            }).catch(err => {
                console.error("Error subiendo audio:", err);
                alert("Error al subir la nota de voz.");
            });
        };

        mediaRecorder.start(250); // chunk cada 250ms — más fiable
        startRecordingUI();
    }).catch((err) => {
        console.error("Micrófono error:", err);
        alert("No se pudo acceder al micrófono. Comprueba los permisos.");
    });
}

function stopRecording(cancel = false) {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === 'inactive') return;
    recordingCancelled = cancel;
    mediaRecorder.stop(); // onstop se dispara cuando termina — no tocar nada más
}

function startRecordingUI() {
    recordingBar.style.display = 'flex';
    chatInputArea.style.display = 'none';
    voiceBtn.classList.add('recording');
    recordingSeconds = 0;
    recordingTimerEl.textContent = '0:00';
    recordingTimerInterval = setInterval(() => {
        recordingSeconds++;
        const m = Math.floor(recordingSeconds / 60);
        const s = recordingSeconds % 60;
        recordingTimerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        // Límite de 30 segundos
        if (recordingSeconds >= 30) stopRecording(false);
    }, 1000);
}

// Declared before stopRecordingUI to avoid temporal dead zone with let
let isRecording = false;

function stopRecordingUI() {
    clearInterval(recordingTimerInterval);
    recordingBar.style.display = 'none';
    chatInputArea.style.display = 'flex';
    voiceBtn.classList.remove('recording');
    isRecording = false;
}

// Clic en micro: empezar o parar grabación (sin enviar)
voiceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRecording) {
        isRecording = true;
        startRecording();
    } else {
        isRecording = false;
        stopRecording(true); // parar SIN enviar — el botón enviar es el que envía
    }
});

// Botones de grabación — usar listeners permanentes montados sobre el document si no coge bien a la primera
document.addEventListener('click', (e) => {
    const btnSend = e.target.closest('#send-recording');
    const btnCancel = e.target.closest('#cancel-recording');

    if (btnSend) {
        e.preventDefault();
        e.stopPropagation();
        isRecording = false;
        stopRecording(false);
    }

    if (btnCancel) {
        e.preventDefault();
        e.stopPropagation();
        isRecording = false;
        stopRecording(true);
    }
});

/* ... resto del archivo (no modificado) ... */
