
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
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

const db = firebase.firestore();
const auth = firebase.auth();

// State
let currentUserData = null;
let activeChatUser = null;
let allMessages = [];
let allUsers = [];
let allGroups = [];
let isUserBanned = false; // New global ban state
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let unsubscribeGroups = null;
let editingUserId = null;
let jitsiApi = null;
let processedCallIds = new Set(); // To avoid duplicate alerts
let listenerStartTime = Date.now(); // Used to filter out old messages upon login

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

// Admin Modal Elements
const adminModal = document.getElementById('admin-modal');
const closeAdminModal = document.getElementById('close-admin-modal');
const adminUserList = document.getElementById('admin-user-list');
const adminCreateForm = document.getElementById('admin-create-user-form');
const adminFormTitle = document.getElementById('admin-form-title');
const adminFormSubmit = document.getElementById('admin-form-submit');
const adminFormCancel = document.getElementById('admin-form-cancel');
const optRoleAdmin = document.getElementById('opt-role-admin');
const optRoleSuperAdmin = document.getElementById('opt-role-superadmin');
const passwordContainer = document.getElementById('password-container');
const newUserPassword = document.getElementById('new-user-password');

// Call Modal Elements
const callModal = document.getElementById('call-modal');
const btnVideoCall = document.getElementById('btn-video-call');
const btnVoiceCall = document.getElementById('btn-voice-call');
const btnEndCall = document.getElementById('btn-end-call');
const jitsiContainer = document.getElementById('jitsi-container');

// Incoming Call Elements
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const callerAvatar = document.getElementById('caller-avatar');
const callerName = document.getElementById('caller-name');
const callTypeText = document.getElementById('call-type-text');
const btnAcceptCall = document.getElementById('btn-accept-call');
const btnDeclineCall = document.getElementById('btn-decline-call');

const idleModal = document.getElementById('idle-modal');
const btnIdleConfirm = document.getElementById('btn-idle-confirm');
const idleTimerDisplay = document.getElementById('idle-timer-display');

// Group Modal Elements
const btnNewGroup = document.getElementById('btn-new-group');
const groupModal = document.getElementById('group-modal');
const closeGroupModal = document.getElementById('close-group-modal');
const memberSelectionList = document.getElementById('member-selection-list');
const btnCreateGroupSubmit = document.getElementById('btn-create-group-submit');

// Dial Pad Elements
const dialpadModal = document.getElementById('dialpad-modal');
const btnOpenDialpad = document.getElementById('btn-dialpad');
const closeDialpadModal = document.getElementById('close-dialpad-modal');
const dialpadNumberDisplay = document.getElementById('dialpad-number');
const btnDialpadDelete = document.getElementById('btn-dialpad-delete');
const btnDialpadCall = document.getElementById('btn-dialpad-call');
const dialpadError = document.getElementById('dialpad-error');
const dialBtns = document.querySelectorAll('.dial-btn');
let currentDialedNumber = "";

// Directory Elements
const directoryModal = document.getElementById('directory-modal');
const btnOpenDirectory = document.getElementById('btn-directory');
const closeDirectoryModal = document.getElementById('close-directory-modal');
const directorySearchInput = document.getElementById('directory-search');
const directoryList = document.getElementById('directory-list');

const groupNameInput = document.getElementById('group-name');
const memberSearchInput = document.getElementById('member-search');
const btnBackSidebar = document.getElementById('btn-back-sidebar');
const appContainer = document.querySelector('.app-container');

// --- Profanity & Strike System ---
const PROFANITY_LIST = ["mierda", "puta", "puto", "gilipollas", "cabron", "cabrón", "follar", "hijo de puta", "joder", "coño", "maricon", "maricón", "zorra", "bollera", "pendejo", "idiota", "estupido", "estúpido"];

const STRIKE_BANS = {
    1: 1 * 60 * 60 * 1000,           // 1 hora
    2: 5 * 60 * 60 * 1000,           // 5 horas
    3: 24 * 60 * 60 * 1000,          // 1 día
    4: 15 * 24 * 60 * 60 * 1000,     // 15 días
    5: 30 * 24 * 60 * 60 * 1000,     // 1 mes
    6: "permanent"                    // Permanente
};

function hasProfanity(text) {
    const lowerText = text.toLowerCase();
    return PROFANITY_LIST.some(word => lowerText.includes(word));
}

async function applyStrike() {
    if (!auth.currentUser) return;

    const userRef = db.collection("users").doc(auth.currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    const currentStrikes = (data.strikes || 0) + 1;
    let banDuration = STRIKE_BANS[currentStrikes] || STRIKE_BANS[5];
    let banUntil = null;

    if (banDuration === "permanent" || currentStrikes >= 6) {
        banUntil = "permanent";
    } else {
        banUntil = firebase.firestore.Timestamp.fromMillis(Date.now() + banDuration);
    }

    await userRef.update({
        strikes: currentStrikes,
        banUntil: banUntil,
        status: "offline"
    });

    alert(`⚠️ SANCIÓN POR LENGUAJE INAPROPIADO\n\nHas acumulado ${currentStrikes} falta(s).\nTu cuenta ha sido suspendida temporalmente.`);
    location.reload(); // Force check
}

function checkBanStatus(data) {
    if (!data.banUntil) return false;

    if (data.banUntil === "permanent") {
        showBanScreen("Sanción Permanente", "Has sido expulsado definitivamente por acumular 6 faltas. Contacta con un SuperAdmin para solicitar el desbloqueo.");
        return true;
    }

    const now = Date.now();
    const banDate = data.banUntil.toMillis();

    if (now < banDate) {
        const timeLeft = banDate - now;
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const days = Math.floor(hours / 24);

        let msg = `Tu cuenta está suspendida. Quedan `;
        if (days > 0) msg += `${days} días y ${hours % 24} horas.`;
        else if (hours > 0) msg += `${hours} horas y ${minutes} minutos.`;
        else msg += `${minutes} minutos.`;

        showBanScreen("Cuenta Suspendida", msg);
        return true;
    }
    return false;
}

function showBanScreen(title, message) {
    isUserBanned = true;
    document.body.innerHTML = `
        <div style="background: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; color: white; font-family: 'Inter', sans-serif; text-align: center; padding: 20px;">
            <div style="max-width: 500px; background: #1e293b; padding: 40px; border-radius: 20px; border: 2px solid #f43f5e; box-shadow: 0 0 50px rgba(244, 63, 94, 0.2);">
                <i class="fas fa-gavel" style="font-size: 60px; color: #f43f5e; margin-bottom: 20px;"></i>
                <h1 style="font-size: 32px; margin-bottom: 20px;">${title}</h1>
                <p style="color: #94a3b8; font-size: 18px; line-height: 1.6; margin-bottom: 30px;">${message}</p>
                <button onclick="location.reload()" class="btn-login" style="width: 100%;">Reintentar conexión</button>
            </div>
        </div>
    `;
}

// --- Auth States ---

auth.onAuthStateChanged(async (user) => {
    if (user) {
        await handleUserLogin(user);
    } else {
        showLoginScreen();
    }
});

const reservedNumbers = {
    "pablopulido": "102948",
    "abuela": "582103",
    "gema": "739402",
    "alvaropulido": "294857",
    "juliopuli": "110948",
    "jggimenez": "647382",
    "fernandopulido": "384729",
    "titamaribel": "928374"
};

async function generateUniquePhoneNumber(name = "") {
    // Check if user has a reserved number
    const cleanName = name.toLowerCase().replace(/\s/g, '');
    if (reservedNumbers[cleanName]) {
        return reservedNumbers[cleanName];
    }

    let exists = true;
    let number = "";
    while (exists) {
        number = Math.floor(100000 + Math.random() * 900000).toString();
        const snapshot = await db.collection("users").where("phoneNumber", "==", number).get();
        if (snapshot.empty) exists = false;
    }
    return number;
}

async function handleUserLogin(user) {
    const userDocRef = db.collection("users").doc(user.uid);
    const doc = await userDocRef.get();

    if (!doc.exists) {
        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: user.email.split('@')[0],
            role: "usuario",
            status: "online",
            pinnedChats: [],
            phoneNumber: await generateUniquePhoneNumber(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userDocRef.set(currentUserData);
    } else {
        currentUserData = { uid: user.uid, ...doc.data() };

        // Assign phone number if missing (migration)
        if (!currentUserData.phoneNumber) {
            currentUserData.phoneNumber = await generateUniquePhoneNumber();
            await userDocRef.update({ phoneNumber: currentUserData.phoneNumber });
        }

        // Check Ban Status
        if (checkBanStatus(currentUserData)) {
            // If banned, the checkBanStatus function will display the ban screen
            // and we should prevent further login process.
            return;
        }
        await updateUserStatus("online");
    }

    setupUsersListener();
    setupMessagesListener();
    showChatScreen();
    startIdleMonitoring();
}

// --- Inactivity Logic ---

function startIdleMonitoring() {
    stopIdleMonitoring(); // Reset if already running
    resetIdleTimer();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
        window.addEventListener(evt, resetIdleTimer);
    });
}

function stopIdleMonitoring() {
    clearTimeout(idleTimeout);
    clearTimeout(logoutTimeout);
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
        window.removeEventListener(evt, resetIdleTimer);
    });
}

function resetIdleTimer() {
    if (idleModal.classList.contains('active')) return; // Don't reset if modal is showing

    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(showIdleModal, IDLE_TIME_LIMIT);
}

function showIdleModal() {
    idleModal.classList.add('active');
    updateUserStatus("offline"); // Mark as away/offline in background

    let secondsLeft = 120;
    idleTimerDisplay.textContent = `2:00`;

    clearInterval(window.logoutCountdown);
    window.logoutCountdown = setInterval(() => {
        secondsLeft--;
        const mins = Math.floor(secondsLeft / 60);
        const secs = secondsLeft % 60;
        idleTimerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        if (secondsLeft <= 0) {
            clearInterval(window.logoutCountdown);
            handleAutoLogout();
        }
    }, 1000);
}

async function handleAutoLogout() {
    idleModal.classList.remove('active');
    await updateUserStatus("offline");
    auth.signOut();
    alert("Sesión cerrada por inactividad.");
}

btnIdleConfirm.addEventListener('click', () => {
    idleModal.classList.remove('active');
    clearInterval(window.logoutCountdown);
    updateUserStatus("online");
    resetIdleTimer();
});

// --- Presence System ---

async function updateUserStatus(status) {
    if (!auth.currentUser) return;
    try {
        await db.collection("users").doc(auth.currentUser.uid).update({
            status: status,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("Error updating status:", e);
    }
}

// Handle Page Visibility (Online/Away)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateUserStatus("online");
    } else {
        // We set to offline or away when tab is hidden to be more accurate
        updateUserStatus("offline");
    }
});

// Handle Window Close
window.addEventListener('beforeunload', (event) => {
    if (auth.currentUser) {
        // Use a synchronous-ish update or navigator.sendBeacon if needed,
        // but for Firestore, a direct update usually works if not too many fields.
        db.collection("users").doc(auth.currentUser.uid).update({
            status: "offline",
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
});

function showLoginScreen() {
    currentUserData = null;
    activeChatUser = null;
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeGroups) unsubscribeGroups();
    chatScreen.classList.remove('active');
    loginScreen.classList.add('active');
}

function showChatScreen() {
    myProfileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserData.name)}&background=00a884&color=fff&size=100`;
    const roleClass = `role-${currentUserData.role}`;
    currentUserName.innerHTML = `${currentUserData.name} <span class="role-badge ${roleClass}">${currentUserData.role}</span>`;

    btnAdminPanel.style.display = (currentUserData.role === 'admin' || currentUserData.role === 'super_admin') ? 'block' : 'none';

    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');
}

// --- SEK-Time Call Logic ---

btnVideoCall.addEventListener('click', () => startCall(false));
btnVoiceCall.addEventListener('click', () => startCall(true));

function startCall(audioOnly, isReceiver = false, remoteUser = null) {
    const targetUser = isReceiver ? remoteUser : activeChatUser;
    if (!targetUser) return;

    // Verify Jitsi library availability
    if (typeof JitsiMeetExternalAPI === 'undefined') {
        alert("⚠️ Error: La librería de SEK-Time no se ha cargado correctamente. Por favor, recarga la página.");
        console.error("JitsiMeetExternalAPI is not defined");
        return;
    }

    callModal.classList.add('active');
    incomingCallOverlay.classList.remove('active');
    jitsiContainer.innerHTML = ''; // Clear previous calls

    // Show loader
    const loader = document.getElementById('jitsi-loader');
    if (loader) loader.classList.remove('jitsi-hidden');

    // Multi-stage safety nets for the loader
    const loaderTimeoutFast = setTimeout(() => {
        if (loader && !loader.classList.contains('jitsi-hidden')) {
            console.warn("Jitsi: Connection taking longer than expected...");
        }
    }, 5000);

    const loaderTimeoutFinal = setTimeout(() => {
        if (loader) loader.classList.add('jitsi-hidden');
        console.error("Jitsi: Connection timeout, hiding loader");
    }, 15000);

    try {
        const domain = "meet.jit.si";
        const ids = [auth.currentUser.uid, targetUser.uid].sort();
        const roomName = `ChatSEK-${ids[0].substring(0, 8)}-${ids[1].substring(0, 8)}`;

        const options = {
            roomName: roomName,
            width: '100%',
            height: '100%',
            parentNode: jitsiContainer,
            userInfo: {
                displayName: currentUserData.name
            },
            configOverwrite: {
                prejoinPageEnabled: false,
                prejoinConfig: { enabled: false },
                startWithAudioMuted: false,
                startWithVideoMuted: audioOnly,
                disableDeepLinking: true,
                enableWelcomePage: false,
                enableClosePage: false
            },
            interfaceConfigOverwrite: {
                SHOW_JITSI_WATERMARK: false,
                DEFAULT_REMOTE_DISPLAY_NAME: 'Usuario SEK',
                TOOLBAR_BUTTONS: [
                    'microphone', 'camera', 'desktop', 'fullscreen',
                    'fodeviceselection', 'hangup', 'profile', 'chat', 'settings', 'tileview'
                ]
            }
        };

        jitsiApi = new JitsiMeetExternalAPI(domain, options);

        jitsiApi.addEventListeners({
            readyToClose: endCall,
            videoConferenceLeft: endCall,
            videoConferenceJoined: () => {
                console.log("SEK-Time: Conexión establecida correctamente");
                clearTimeout(loaderTimeoutFast);
                clearTimeout(loaderTimeoutFinal);
                if (loader) loader.classList.add('jitsi-hidden');
            },
            participantJoined: (event) => {
                console.log("SEK-Time: Participante unido:", event.displayName);
            },
            cameraError: (error) => {
                console.error("SEK-Time: Error de cámara:", error);
                alert("No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
                if (loader) loader.classList.add('jitsi-hidden');
            },
            micError: (error) => {
                console.error("SEK-Time: Error de micrófono:", error);
            }
        });

        if (!isReceiver) {
            const type = audioOnly ? "Llamada de voz" : "Videollamada";
            sendMessage(`📞 ${type} iniciada. Únete ahora.`, 'call', audioOnly);
        }
    } catch (error) {
        console.error("SEK-Time: Error crítico iniciando llamada:", error);
        alert("Hubo un error al iniciar la llamada. Por favor, inténtalo de nuevo.");
        clearTimeout(loaderTimeoutFast);
        clearTimeout(loaderTimeoutFinal);
        if (loader) loader.classList.add('jitsi-hidden');
        endCall();
    }
}

function endCall() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    jitsiContainer.innerHTML = '';
    callModal.classList.remove('active');
}

btnEndCall.addEventListener('click', endCall);

// --- Incoming Call UI ---

function handleIncomingCall(msg) {
    if (processedCallIds.has(msg.id)) return;
    processedCallIds.add(msg.id);

    const caller = allUsers.find(u => u.uid === msg.senderId);
    if (!caller) return;

    callerName.textContent = caller.name;
    callerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(caller.name)}&background=random&color=fff&size=200`;
    callTypeText.textContent = msg.audioOnly ? "Llamada de voz entrante..." : "Videollamada entrante...";

    incomingCallOverlay.classList.add('active');

    // Button handlers for this specific call
    btnAcceptCall.onclick = () => {
        startCall(msg.audioOnly || false, true, caller);
    };

    btnDeclineCall.onclick = () => {
        incomingCallOverlay.classList.remove('active');
    };

    // Auto-close after 30 seconds if not answered
    setTimeout(() => {
        incomingCallOverlay.classList.remove('active');
    }, 30000);
}

// --- Admin Panel Logic ---

btnAdminPanel.addEventListener('click', () => {
    adminModal.classList.add('active');
    resetAdminForm();
    renderAdminUserList();
});

closeAdminModal.addEventListener('click', () => adminModal.classList.remove('active'));

function resetAdminForm() {
    editingUserId = null;
    adminFormTitle.textContent = "Crear Nuevo Usuario";
    adminFormSubmit.textContent = "Registrar Usuario";
    adminFormCancel.style.display = "none";
    document.getElementById('new-user-email').disabled = false;
    passwordContainer.style.display = "block";
    newUserPassword.required = true;
    newUserPassword.type = "password";
    newUserPassword.placeholder = "Contraseña";
    adminCreateForm.reset();

    if (currentUserData.role === 'super_admin') {
        optRoleAdmin.style.display = 'block';
        optRoleSuperAdmin.style.display = 'block';
    } else {
        optRoleAdmin.style.display = 'none';
        optRoleSuperAdmin.style.display = 'none';
        document.getElementById('new-user-role').value = 'usuario';
    }
}

adminFormCancel.addEventListener('click', resetAdminForm);

function renderAdminUserList() {
    adminUserList.innerHTML = '';
    const allRegistered = [currentUserData, ...allUsers];

    allRegistered.forEach(user => {
        const item = document.createElement('div');
        item.className = 'admin-user-item';
        const roleClass = `role-${user.role}`;

        let actions = `<div class="user-actions">`;
        let canEdit = (currentUserData.role === 'super_admin') || (currentUserData.role === 'admin' && user.role === 'usuario');

        if (canEdit) {
            actions += `<i class="fas fa-edit" onclick="startEditUser('${user.uid}')" style="color: var(--primary); margin-right: 15px;" title="Editar"></i>`;
        }

        const isSuperAdmin = currentUserData.role === 'super_admin';
        const isAdmin = currentUserData.role === 'admin';
        const targetIsUsuario = user.role === 'usuario';
        const isNotSelf = user.uid !== auth.currentUser.uid;

        if (currentUserData.role === 'super_admin' && user.uid !== auth.currentUser.uid) {
            actions += `<i class="fas fa-trash-alt" onclick="deleteUser('${user.uid}')" style="margin-left: 15px;" title="Borrar"></i>`;
            if (user.strikes > 0 || user.banUntil) {
                actions += `<i class="fas fa-undo" onclick="resetStrikes('${user.uid}')" style="color: #10b981; margin-left: 15px;" title="Resetear Faltas"></i>`;
            }
        }

        actions += `</div>`;

        item.innerHTML = `
            <div>
                <strong>${user.name}</strong> (${user.email})
                <span class="role-badge ${roleClass}">${user.role}</span>
            </div>
            ${actions}
        `;
        adminUserList.appendChild(item);
    });
}

window.startEditUser = (uid) => {
    const user = [currentUserData, ...allUsers].find(u => u.uid === uid);
    if (!user) return;

    editingUserId = uid;
    adminFormTitle.textContent = "Editando: " + user.name;
    adminFormSubmit.textContent = "Guardar Cambios";
    adminFormCancel.style.display = "block";

    document.getElementById('new-user-name').value = user.name;
    document.getElementById('new-user-email').value = user.email;
    document.getElementById('new-user-email').disabled = true;
    document.getElementById('new-user-role').value = user.role;

    if (currentUserData.role === 'super_admin') {
        passwordContainer.style.display = "block";
        newUserPassword.required = true;
        newUserPassword.type = "text";
        newUserPassword.placeholder = "Contraseña";
        newUserPassword.value = user.password || "";
    } else {
        passwordContainer.style.display = "none";
        newUserPassword.required = false;
        newUserPassword.value = "";
    }
};

window.deleteUser = async (uid) => {
    if (!confirm("¿Seguro que quieres borrar este usuario?")) return;
    try {
        await db.collection("users").doc(uid).delete();
        alert("Usuario eliminado.");
    } catch (e) {
        alert("Error: " + e.message);
    }
};

window.resetStrikes = async (uid) => {
    if (!confirm("¿Deseas resetear las faltas y el ban de este usuario?")) return;
    try {
        await db.collection("users").doc(uid).update({
            strikes: 0,
            banUntil: null
        });
        alert("Faltas reseteadas con éxito.");
    } catch (e) {
        alert("Error: " + e.message);
    }
};

adminCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value;
    const email = document.getElementById('new-user-email').value;
    const password = newUserPassword.value;
    const role = document.getElementById('new-user-role').value;

    try {
        if (editingUserId) {
            const updateData = {
                name: name,
                role: role
            };
            if (currentUserData.role === 'super_admin') {
                updateData.password = password;
            }
            await db.collection("users").doc(editingUserId).update(updateData);
            alert("Usuario actualizado");
        } else {
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            const newUid = cred.user.uid;
            await db.collection("users").doc(newUid).set({
                uid: newUid,
                email: email,
                name: name,
                role: role,
                password: password,
                status: "offline",
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
            await secondaryAuth.signOut();
            alert("Usuario registrado: " + email);
        }
        resetAdminForm();
    } catch (e) {
        console.error("Error completo en Admin Panel:", e);
        if (e.code === 'auth/too-many-requests') {
            alert("⚠️ BLOQUEO TEMPORAL DE FIREBASE:\nHas realizado demasiadas solicitudes de creación de usuario seguidas.\n\nPor seguridad, Firebase ha bloqueado tu IP unos minutos. Espera 5-10 minutos e inténtalo de nuevo, o prueba a cambiar de red (datos móviles).");
        } else {
            alert("Error: " + e.message);
        }
    }
});

// --- Chat Listeners ---

function setupUsersListener() {
    unsubscribeUsers = db.collection("users").onSnapshot((snapshot) => {
        allUsers = [];
        snapshot.forEach(doc => {
            if (doc.id !== auth.currentUser.uid) {
                allUsers.push({ uid: doc.id, ...doc.data() });
            } else {
                currentUserData = { uid: doc.id, ...doc.data() };
            }
        });
        renderContacts();
        setupGroupsListener(); // Refresh groups too
        if (activeChatUser && !activeChatUser.isGroup) {
            const updatedActive = allUsers.find(u => u.uid === activeChatUser.uid);
            if (updatedActive) {
                activeChatUser = updatedActive;
                updateHeaderStatus();
            }
        }
        if (adminModal.classList.contains('active')) renderAdminUserList();
    });
}

function setupGroupsListener() {
    if (unsubscribeGroups) unsubscribeGroups();
    unsubscribeGroups = db.collection("groups")
        .where("members", "array-contains", auth.currentUser.uid)
        .onSnapshot((snapshot) => {
            allGroups = [];
            snapshot.forEach(doc => {
                allGroups.push({ uid: doc.id, ...doc.data(), isGroup: true });
            });
            renderContacts();
            if (activeChatUser && activeChatUser.isGroup) {
                const updatedActive = allGroups.find(g => g.uid === activeChatUser.uid);
                if (updatedActive) {
                    activeChatUser = updatedActive;
                    updateHeaderStatus();
                }
            }
        });
}

function updateHeaderStatus() {
    if (!activeChatUser) return;

    if (activeChatUser.isGroup) {
        chatStatus.textContent = `${activeChatUser.members.length} miembros`;
        chatStatus.classList.remove('online');
        return;
    }

    if (activeChatUser.status === "online") {
        chatStatus.textContent = "en línea";
        chatStatus.classList.add('online');
    } else {
        chatStatus.classList.remove('online');
        if (activeChatUser.lastSeen) {
            const date = activeChatUser.lastSeen.toDate();
            const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            chatStatus.textContent = `últ. vez hoy a las ${time}`;
        } else {
            chatStatus.textContent = "desconectado";
        }
    }
}

function setupMessagesListener() {
    unsubscribeMessages = db.collection("messages").orderBy("timestamp", "asc")
        .onSnapshot((snapshot) => {
            const newMessages = [];
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const msg = { id: change.doc.id, ...change.doc.data() };

                    // Detect Incoming Call
                    if (msg.type === 'call' && msg.receiverId === auth.currentUser.uid) {
                        // FILTER: Only handle if the message is really new (within last 30s)
                        // This prevents "ghost calls" from old documents in Firestore
                        const msgTime = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
                        const thirtySecondsAgo = Date.now() - 30000;

                        if (msgTime > thirtySecondsAgo && msgTime > listenerStartTime) {
                            handleIncomingCall(msg);
                        } else {
                            console.log("Ignorando llamada antigua del:", new Date(msgTime).toLocaleTimeString());
                        }
                    }
                }
            });

            allMessages = [];
            snapshot.forEach((doc) => {
                allMessages.push({ id: doc.id, ...doc.data() });
            });
            renderContacts();
            if (activeChatUser) renderMessages();
        });
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
    } catch (e) {
        errorMessage.textContent = "Error: " + e.message;
        errorMessage.classList.add('show');
    }
});

btnLogout.addEventListener('click', async () => {
    await updateUserStatus("offline");
    auth.signOut();
});

// --- Render Chat ---

function renderContacts() {
    contactList.innerHTML = '';

    // Merge Users and Groups
    let combined = [...allGroups, ...allUsers];

    // Sorting Logic: Pinned first, then by last message time if possible
    const pinnedIds = currentUserData.pinnedChats || [];

    combined.sort((a, b) => {
        const aPinned = pinnedIds.includes(a.uid);
        const bPinned = pinnedIds.includes(b.uid);

        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        // If both pinned or both unpinned, we could sort by last message time here in the future
        return 0;
    });

    combined.forEach(entity => {
        const isGroup = entity.isGroup;
        const isPinned = pinnedIds.includes(entity.uid);

        const chatNotes = allMessages.filter(m =>
            isGroup ? (m.groupId === entity.uid) :
                ((m.senderId === auth.currentUser.uid && m.receiverId === entity.uid) ||
                    (m.senderId === entity.uid && m.receiverId === auth.currentUser.uid))
        );
        let lastText = isGroup ? "Grupo creado" : "Haz clic para chatear", lastTime = "";
        if (chatNotes.length > 0) {
            const last = chatNotes[chatNotes.length - 1];
            lastText = last.text; lastTime = last.time;
        }

        const item = document.createElement('div');
        item.className = 'contact-item' + (isPinned ? ' pinned' : '');
        if (activeChatUser && activeChatUser.uid === entity.uid) item.classList.add('active');

        const avatar = isGroup ?
            `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=6366f1&color=fff` :
            `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=random&color=fff`;

        const indicator = (!isGroup && entity.status === "online") ? '<div class="online-indicator"></div>' : '';
        const badge = isGroup ? '<span class="group-badge">Grupo</span>' : `<span class="role-badge role-${entity.role}">${entity.role}</span>`;
        const phoneDisplay = !isGroup && entity.phoneNumber ? `<span class="contact-phone">SEK: ${entity.phoneNumber}</span>` : '';

        item.innerHTML = `
            ${indicator}
            <img src="${avatar}">
            <div class="contact-info">
                <div class="contact-name-time">
                    <span class="contact-name">${entity.name} ${badge} ${phoneDisplay}</span>
                    <div style="display: flex; align-items: center;">
                        <span class="contact-time">${lastTime}</span>
                        <i class="fas fa-thumbtack btn-pin ${isPinned ? 'active' : ''}" data-id="${entity.uid}" title="${isPinned ? 'Desfijar' : 'Fijar'} chat"></i>
                    </div>
                </div>
                <div class="contact-message">${lastText}</div>
            </div>`;

        // Handle Pin Toggle
        const pinBtn = item.querySelector('.btn-pin');
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents opening the chat
            togglePin(entity.uid);
        });

        item.addEventListener('click', () => {
            activeChatUser = entity;
            document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            activeContactName.textContent = entity.name;
            activeContactImg.src = avatar;
            chatHeaderInfo.classList.add('active');
            chatHeaderText.classList.add('active');
            welcomeMessage.style.display = 'none';
            chatInputArea.style.display = 'flex';

            updateHeaderStatus();
            renderMessages();

            // Mobile view toggle
            if (window.innerWidth <= 768) {
                appContainer.classList.add('show-chat');
            }
        });
        contactList.appendChild(item);
    });
}

async function togglePin(entityId) {
    if (!currentUserData) return;

    let pinned = currentUserData.pinnedChats || [];
    if (pinned.includes(entityId)) {
        pinned = pinned.filter(id => id !== entityId);
    } else {
        pinned.push(entityId);
    }

    try {
        await db.collection("users").doc(auth.currentUser.uid).update({
            pinnedChats: pinned
        });
        // Listener will trigger renderContacts automatically
    } catch (e) {
        console.error("Error toggling pin:", e);
    }
}

function renderMessages() {
    Array.from(chatMessages.children).forEach(c => { if (c.id !== 'welcome-message') c.remove(); });
    if (!activeChatUser) return;

    const messagesToShow = activeChatUser.isGroup ?
        allMessages.filter(m => m.groupId === activeChatUser.uid) :
        allMessages.filter(m => (m.senderId === auth.currentUser.uid && m.receiverId === activeChatUser.uid) || (m.senderId === activeChatUser.uid && m.receiverId === auth.currentUser.uid));

    messagesToShow.forEach(msg => {
        const el = document.createElement('div');
        el.className = `message ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`;

        let senderName = "";
        if (activeChatUser.isGroup && msg.senderId !== auth.currentUser.uid) {
            const sender = allUsers.find(u => u.uid === msg.senderId);
            senderName = `<div style="font-size: 10px; color: var(--primary); font-weight: bold; margin-bottom: 4px;">${sender ? sender.name : 'Unknown'}</div>`;
        }

        if (msg.type === 'call') {
            el.innerHTML = `${senderName}<i class="fas fa-video" style="margin-right:8px;"></i> ${msg.text}<span class="time">${msg.time}</span>`;
            el.style.backgroundColor = 'var(--primary)';
            el.style.cursor = 'pointer';
            el.onclick = () => {
                const caller = allUsers.find(u => u.uid === msg.senderId) || currentUserData;
                startCall(msg.audioOnly || false, true, caller);
            };
        } else {
            el.innerHTML = `${senderName}${msg.text}<span class="time">${msg.time}</span>`;
        }
        chatMessages.appendChild(el);
    });
    setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);
}

sendBtn.addEventListener('click', () => sendMessage());
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage(overrideText = null, type = 'text', audioOnly = false) {
    const text = overrideText || messageInput.value.trim();
    if (!text || !activeChatUser) return;

    // Profanity Check
    if (hasProfanity(text)) {
        applyStrike();
        return; // Stop message from being sent
    }

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (!overrideText) messageInput.value = '';

    const messageData = {
        senderId: auth.currentUser.uid,
        text: text,
        type: type,
        audioOnly: audioOnly,
        time: time,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (activeChatUser.isGroup) {
        messageData.groupId = activeChatUser.uid;
    } else {
        messageData.receiverId = activeChatUser.uid;
    }

    try {
        await db.collection("messages").add(messageData);
    } catch (e) { console.error(e); }
}

// --- Group Management Logic ---

btnNewGroup.addEventListener('click', () => {
    groupModal.classList.add('active');
    renderMemberSelection();
});

closeGroupModal.addEventListener('click', () => {
    groupModal.classList.remove('active');
    groupNameInput.value = '';
    memberSearchInput.value = '';
});

memberSearchInput.addEventListener('input', () => {
    renderMemberSelection(memberSearchInput.value.trim().toLowerCase());
});

function renderMemberSelection(filter = '') {
    // Keep track of currently checked ones so we don't lose them on re-render
    const checkedUids = Array.from(memberSelectionList.querySelectorAll('input:checked'))
        .map(input => input.value);

    memberSelectionList.innerHTML = '';

    // Filter users (excluding self)
    const filteredUsers = allUsers.filter(user => {
        if (user.uid === auth.currentUser.uid) return false;
        if (!filter) return true;
        return user.name.toLowerCase().includes(filter) || user.email.toLowerCase().includes(filter);
    });

    if (filteredUsers.length === 0) {
        memberSelectionList.innerHTML = '<div style="color: var(--text-secondary); padding: 10px; text-align: center;">No se encontraron contactos</div>';
        return;
    }

    filteredUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = 'member-item';
        const isChecked = checkedUids.includes(user.uid) ? 'checked' : '';
        item.innerHTML = `
            <input type="checkbox" id="check-${user.uid}" value="${user.uid}" ${isChecked}>
            <label for="check-${user.uid}">${user.name} (${user.email})</label>
        `;
        memberSelectionList.appendChild(item);
    });
}

btnCreateGroupSubmit.addEventListener('click', async () => {
    const name = groupNameInput.value.trim();
    if (!name) return alert("Por favor, ponle un nombre al grupo.");

    const selectedMembers = Array.from(memberSelectionList.querySelectorAll('input:checked'))
        .map(input => input.value);

    if (selectedMembers.length === 0) return alert("Selecciona al menos un miembro.");

    // Include self
    selectedMembers.push(auth.currentUser.uid);

    try {
        await db.collection("groups").add({
            name: name,
            members: selectedMembers,
            createdBy: auth.currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        groupModal.classList.remove('active');
        groupNameInput.value = '';
        alert("¡Grupo creado con éxito!");
    } catch (e) {
        alert("Error creando grupo: " + e.message);
    }
});

// Mobile Back Button
btnBackSidebar.addEventListener('click', () => {
    appContainer.classList.remove('show-chat');
});

// --- Dial Pad Logic ---
btnOpenDialpad.addEventListener('click', () => {
    currentDialedNumber = "";
    dialpadNumberDisplay.textContent = "";
    dialpadError.textContent = "";
    dialpadModal.classList.add('active');
});

closeDialpadModal.addEventListener('click', () => {
    dialpadModal.classList.remove('active');
});

dialBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (val) {
            if (currentDialedNumber.length < 6) {
                currentDialedNumber += val;
                dialpadNumberDisplay.textContent = currentDialedNumber;
                dialpadError.textContent = "";
            }
        }
    });
});

btnDialpadDelete.addEventListener('click', () => {
    currentDialedNumber = currentDialedNumber.slice(0, -1);
    dialpadNumberDisplay.textContent = currentDialedNumber;
    dialpadError.textContent = "";
});

btnDialpadCall.addEventListener('click', async () => {
    if (currentDialedNumber.length < 6) {
        dialpadError.textContent = "El número debe tener 6 dígitos";
        return;
    }

    try {
        const snapshot = await db.collection("users").where("phoneNumber", "==", currentDialedNumber).get();
        if (snapshot.empty) {
            dialpadError.textContent = "Usuario no encontrado";
            return;
        }

        // We search in allUsers to ge the full entity object
        const entity = allUsers.find(u => u.phoneNumber === currentDialedNumber);

        if (entity) {
            dialpadModal.classList.remove('active');
            openChatWith(entity);
        } else {
            dialpadError.textContent = "Error al abrir el chat";
        }
    } catch (e) {
        console.error("Dialpad search error:", e);
        dialpadError.textContent = "Error en la búsqueda";
    }
});

function openChatWith(entity) {
    activeChatUser = entity;
    const items = document.querySelectorAll('.contact-item');
    items.forEach(el => el.classList.remove('active'));

    activeContactName.textContent = entity.name;
    const avatar = entity.isGroup ?
        `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=6366f1&color=fff` :
        `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=random&color=fff`;
    activeContactImg.src = avatar;

    chatHeaderInfo.classList.add('active');
    chatHeaderText.classList.add('active');
    welcomeMessage.style.display = 'none';
    chatInputArea.style.display = 'flex';

    updateHeaderStatus();
    renderMessages();

    if (window.innerWidth <= 768) {
        appContainer.classList.add('show-chat');
    }
}

// --- Directory Logic ---
btnOpenDirectory.addEventListener('click', () => {
    directoryModal.classList.add('active');
    directorySearchInput.value = "";
    renderDirectory();
});

closeDirectoryModal.addEventListener('click', () => {
    directoryModal.classList.remove('active');
});

directorySearchInput.addEventListener('input', () => {
    renderDirectory(directorySearchInput.value.trim().toLowerCase());
});

function renderDirectory(filter = "") {
    directoryList.innerHTML = "";

    const filteredUsers = allUsers.filter(u => {
        if (!filter) return true;
        const phone = u.phoneNumber || "";
        return u.name.toLowerCase().includes(filter) || phone.includes(filter);
    });

    if (filteredUsers.length === 0) {
        directoryList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No se encontraron usuarios</div>';
        return;
    }

    filteredUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = "directory-item";
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&color=fff`;
        const phone = user.phoneNumber || "S/N";

        item.innerHTML = `
            <div class="directory-item-info">
                <img src="${avatar}">
                <div class="directory-item-text">
                    <h4>${user.name}</h4>
                    <span>SEK: ${phone}</span>
                </div>
            </div>
            <button class="btn-directory-action" data-uid="${user.uid}">
                <i class="fas fa-comment"></i> Abrir Chat
            </button>
        `;

        item.querySelector('.btn-directory-action').addEventListener('click', () => {
            directoryModal.classList.remove('active');
            openChatWith(user);
        });

        directoryList.appendChild(item);
    });
}


