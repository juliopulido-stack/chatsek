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
const groupNameInput = document.getElementById('group-name');
const memberSearchInput = document.getElementById('member-search');

// --- Auth States ---

auth.onAuthStateChanged(async (user) => {
    if (user) {
        await handleUserLogin(user);
    } else {
        showLoginScreen();
    }
});

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
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userDocRef.set(currentUserData);
    } else {
        currentUserData = { uid: user.uid, ...doc.data() };
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

    callModal.classList.add('active');
    incomingCallOverlay.classList.remove('active');
    jitsiContainer.innerHTML = ''; // Clear previous calls

    // Show loader
    const loader = document.getElementById('jitsi-loader');
    if (loader) loader.classList.remove('jitsi-hidden');

    // Safety timeout: remove loader after 10s even if event fails
    const loaderTimeout = setTimeout(() => {
        if (loader) loader.classList.add('jitsi-hidden');
    }, 10000);

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

    // Force loader removal if taking too long (15s)
    const safetyJitsiTimeout = setTimeout(() => {
        console.warn("Jitsi connection timeout - removing loader manually");
        if (loader) loader.classList.add('jitsi-hidden');
    }, 15000);

    jitsiApi.addEventListeners({
        readyToClose: endCall,
        videoConferenceLeft: endCall,
        videoConferenceJoined: () => {
            console.log("SEK-Time: Conexión establecida");
            clearTimeout(loaderTimeout);
            clearTimeout(safetyJitsiTimeout);
            if (loader) loader.classList.add('jitsi-hidden');
        },
        participantJoined: (event) => {
            console.log("Participante unido:", event.displayName);
        },
        cameraError: (error) => {
            console.error("Error de cámara en Jitsi:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
            if (loader) loader.classList.add('jitsi-hidden');
        },
        micError: (error) => {
            console.error("Error de micrófono en Jitsi:", error);
        }
    });

    if (!isReceiver) {
        const type = audioOnly ? "Llamada de voz" : "Videollamada";
        sendMessage(`📞 ${type} iniciada. Únete ahora.`, 'call', audioOnly);
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

        if (currentUserData.role === 'super_admin' && user.uid !== auth.currentUser.uid) {
            actions += `<i class="fas fa-trash-alt" onclick="deleteUser('${user.uid}')" title="Borrar"></i>`;
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
    const combined = [...allGroups, ...allUsers];

    combined.forEach(entity => {
        const isGroup = entity.isGroup;
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
        item.className = 'contact-item';
        if (activeChatUser && activeChatUser.uid === entity.uid) item.classList.add('active');

        const avatar = isGroup ?
            `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=6366f1&color=fff` :
            `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.name)}&background=random&color=fff`;

        const indicator = (!isGroup && entity.status === "online") ? '<div class="online-indicator"></div>' : '';
        const badge = isGroup ? '<span class="group-badge">Grupo</span>' : `<span class="role-badge role-${entity.role}">${entity.role}</span>`;

        item.innerHTML = `
            ${indicator}
            <img src="${avatar}">
            <div class="contact-info">
                <div class="contact-name-time">
                    <span class="contact-name">${entity.name} ${badge}</span>
                    <span class="contact-time">${lastTime}</span>
                </div>
                <div class="contact-message">${lastText}</div>
            </div>`;
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
        });
        contactList.appendChild(item);
    });
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
