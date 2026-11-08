<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';

const workspaces = ref([]);
const newWorkspaceName = ref('');
const loading = ref(false);
const errorMsg = ref('');
const inviteEmails = ref({});

const fetchWorkspaces = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Vous devez être connecté.');
    const res = await fetch('http://localhost:8787/api/workspaces', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Impossible de charger les équipes.');
    if (data.workspaces) workspaces.value = data.workspaces;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Impossible de charger les équipes.";
  }
};

const createWorkspace = async () => {
  if (!newWorkspaceName.value.trim()) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Vous devez être connecté.');
    const res = await fetch('http://localhost:8787/api/workspaces', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ name: newWorkspaceName.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la création.');
    newWorkspaceName.value = '';
    await fetchWorkspaces();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Erreur lors de la création.";
  } finally {
    loading.value = false;
  }
};
const inviteMember = async (workspaceId) => {
  const email = inviteEmails.value[workspaceId]?.trim();
  if (!email) return;
  const { data: { session } } = await supabase.auth.getSession();
  await fetch('http://localhost:8787/api/workspaces/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspaceId, email })
  });
  alert("Invitation envoyée !");
  inviteEmails.value[workspaceId] = '';
};
onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await fetch('http://localhost:8787/api/workspaces/accept-invites', {
      method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
  }
  fetchWorkspaces();
});
</script>

<template>
  <div class="container">
    <h1>Mes Espaces de Travail</h1>
    <p class="subtitle">Créez des équipes pour partager vos comptes rendus avec vos collègues.</p>

    <div class="card create-card">
      <h3>Créer une nouvelle équipe</h3>
      <div class="input-group">
        <input 
          type="text" 
          v-model="newWorkspaceName" 
          placeholder="Nom de l'équipe (ex: Marketing, Projet Alpha)" 
          @keyup.enter="createWorkspace"
        />
        <button @click="createWorkspace" :disabled="loading || !newWorkspaceName.trim()">
          {{ loading ? 'Création...' : 'Créer' }}
        </button>
      </div>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>

    <div class="workspace-list">
      <div v-for="ws in workspaces" :key="ws.workspace_id" class="workspace-card">
        <div class="ws-icon">🏢</div>
        <div class="ws-info">
          <h3>{{ ws.workspaces.name }}</h3>
          <p>Rôle : {{ ws.role === 'owner' ? 'Propriétaire' : 'Membre' }}</p>
          <div v-if="ws.role === 'owner'" class="invite-box">
            <input type="email" v-model="inviteEmails[ws.workspace_id]" placeholder="Email du collègue" />
            <button @click="inviteMember(ws.workspace_id)">Inviter</button>
          </div>
        </div>
      </div>
      <div v-if="workspaces.length === 0" class="empty">
        Vous ne faites partie d'aucune équipe pour le moment.
      </div>
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 800px; margin: 40px auto; padding: 0 20px; }
h1 { color: #1a202c; }
.subtitle { color: #718096; margin-bottom: 30px; }

.card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 30px; }
.create-card h3 { margin-top: 0; color: #2d3748; }
.input-group { display: flex; gap: 10px; }
.input-group input { flex: 1; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 15px; }
.input-group button { padding: 12px 25px; background: #3182ce; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
.input-group button:disabled { background: #a0aec0; }

.workspace-list { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.workspace-card { background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; transition: transform 0.2s; }
.workspace-card:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.05); }
.ws-icon { font-size: 2rem; background: #edf2f7; padding: 10px; border-radius: 12px; }
.ws-info h3 { margin: 0 0 5px 0; color: #2d3748; font-size: 1.1rem; }
.ws-info p { margin: 0; color: #718096; font-size: 0.9rem; }

.empty { grid-column: 1 / -1; text-align: center; color: #a0aec0; padding: 30px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e0; }
.error { color: #e53e3e; font-weight: bold; margin-top: 10px; }
</style>