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
        const isSelf = user.uid === auth.currentUser.uid;
        const isSuperAdmin = currentUserData.role === 'super_admin';
        const targetIsSuperAdmin = user.role === 'super_admin';
        const isDisabled = user.disabled === true;

        let actions = `<div class="user-actions">`;

        // Editar: solo super_admin puede editar a cualquiera
        if (isSuperAdmin) {
            actions += `<i class="fas fa-edit" onclick="startEditUser('${user.uid}')" style="color: var(--primary);" title="Editar"></i>`;
        }

        // Cambiar rol: solo super_admin
        if (isSuperAdmin && !targetIsSuperAdmin) {
            actions += `<i class="fas fa-user-shield" onclick="changeUserRole('${user.uid}')" style="color: var(--primary);" title="Cambiar rol"></i>`;
        }

        // Banear / desbanear: solo super_admin
        if (isSuperAdmin && !targetIsSuperAdmin) {
            if (isDisabled) {
                actions += `<i class="fas fa-unlock" onclick="toggleUserDisabled('${user.uid}', false)" style="color: var(--primary);" title="Desactivar"></i>`;
            } else {
                actions += `<i class="fas fa-ban" onclick="toggleUserDisabled('${user.uid}', true)" style="color: var(--error);" title="Desactivar"></i>`;
            }
        }

        // Borrar: solo super_admin puede borrar a otros (no a sí mismo)
        if (isSuperAdmin && !isSelf) {
            actions += `<i class="fas fa-trash-alt" onclick="deleteUser('${user.uid}')" style="color: var(--error);" title="Eliminar"></i>`;
        }

        actions += `</div>`;

        item.innerHTML = `
            <span>${user.email}</span>
            <span class="${roleClass} role-badge">${user.role}</span>
            ${actions}
        `;
        adminUserList.appendChild(item);
    });
}

// --- Funciones de Admin (editar, cambiar rol, banear, eliminar) ---
async function startEditUser(uid) {
    const user = allUsers.find(u => u.uid === uid) || currentUserData;
    if (!user) return;
    editingUserId = uid;
    adminFormTitle.textContent = "Editar Usuario";
    adminFormSubmit.textContent = "Actualizar Usuario";
    adminFormCancel.style.display = "block";

    document.getElementById('new-user-name').value = user.name || '';
    document.getElementById('new-user-email').value = user.email || '';
    document.getElementById('new-user-email').disabled = true; // No cambiar email
    passwordContainer.style.display = "none"; // No cambiar contraseña aquí
    document.getElementById('new-user-role').value = user.role || 'usuario';
}

adminCreateForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const role = document.getElementById('new-user-role').value;
    const password = newUserPassword.value;

    try {
        if (editingUserId) {
            // UPDATE
            await db.collection('users').doc(editingUserId).update({ name, role });
            alert('Usuario actualizado.');
        } else {
            // CREATE
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            const uid = cred.user.uid;
            const newUser = {
                uid,
                email,
                name,
                role,
                status: 'offline',
                strikes: 0,
                disabled: false,
                createdBy: auth.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(uid).set(newUser);
            alert('Usuario creado.');
        }
        resetAdminForm();
        renderAdminUserList();
    } catch (err) {
        console.error(err);
        alert('Error en la operación de usuarios: ' + err.message);
    }
});

async function changeUserRole(uid) {
    const newRole = prompt('Introduce el nuevo rol (usuario, admin, super_admin):');
    if (!['usuario', 'admin', 'super_admin'].includes(newRole)) {
        alert('Rol inválido.');
        return;
    }
    await db.collection('users').doc(uid).update({ role: newRole });
    renderAdminUserList();
}

async function toggleUserDisabled(uid, disable) {
    await db.collection('users').doc(uid).update({ disabled: disable });
    renderAdminUserList();
}

async function deleteUser(uid) {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    await db.collection('users').doc(uid).delete();
    renderAdminUserList();
}

// --- Final del archivo ----------------------------------------------------
// (Todas las funciones de manejo de llamadas, mensajes, UI, etc. ya estaban
// presentes en las secciones anteriores del archivo.)
