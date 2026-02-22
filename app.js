// CONFIGURACIÓN FIREBASE (RELLENAR CON TUS DATOS)
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_DOMINIO.firebaseapp.com",
    projectId: "TU_PROYECTO_ID",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "TU_ID",
    appId: "TU_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// VARIABLES GLOBALES
let currentUser = null;
let activeChatId = null;

// ELEMENTOS DEL DOM
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const sidebar = document.getElementById('sidebar');
const chatMessages = document.getElementById('chat-messages');
const btnBack = document.getElementById('btn-back-sidebar');

// --- AUTENTICACIÓN ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        loadUserData();
        loadContacts();
    } else {
        loginScreen.style.display = 'flex';
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
});

// --- FUNCIONES DE CHAT ---
function loadContacts() {
    db.collection('users').onSnapshot(snapshot => {
        const list = document.getElementById('contacts-list');
        list.innerHTML = '';
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = 'contact-item';
                div.innerHTML = `
                    <img src="${data.photoURL || 'https://via.placeholder.com/40'}" alt="">
                    <div class="contact-info">
                        <h4>${data.name}</h4>
                        <p>${data.status || 'Disponible'}</p>
                    </div>
                `;
                div.onclick = () => openChat(doc.id, data.name, data.photoURL);
                list.appendChild(div);
            }
        });
    });
}

function openChat(contactId, name, photo) {
    activeChatId = contactId;
    document.getElementById('active-contact-name').innerText = name;
    document.getElementById('active-contact-img').src = photo || 'https://via.placeholder.com/40';
    
    // En móviles: ocultar sidebar
    if (window.innerWidth <= 768) {
        sidebar.classList.add('hidden');
    }

    loadMessages(contactId);
}

function loadMessages(contactId) {
    const chatId = [currentUser.uid, contactId].sort().join('_');
    db.collection('chats').doc(chatId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            chatMessages.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
                msgDiv.innerHTML = `<p>${msg.text}</p>`;
                chatMessages.appendChild(msgDiv);
            });
            scrollToBottom();
        });
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Enviar Mensaje
document.getElementById('btn-send-message').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = document.getElementById('message-input').value;
    if (text.trim() && activeChatId) {
        const chatId = [currentUser.uid, activeChatId].sort().join('_');
        db.collection('chats').doc(chatId).collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('message-input').value = '';
    }
}

// Volver en móvil
btnBack.onclick = () => {
    sidebar.classList.remove('hidden');
};

// Logout
document.getElementById('btn-logout').onclick = () => auth.signOut();
