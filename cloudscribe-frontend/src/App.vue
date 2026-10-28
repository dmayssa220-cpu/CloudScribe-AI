<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from './supabase';

const router = useRouter();
const user = ref(null);

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  user.value = data.session?.user;
  
  supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user;
  });
});

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/login');
};
</script>

<template>
  <nav class="navbar">
    <div class="nav-links">
      <router-link to="/">Accueil</router-link>
      <router-link to="/pricing">Tarifs</router-link>
      <router-link to="/history">Historique</router-link>
    </div>
    <div v-if="user" class="nav-user">
      <span>{{ user.email }}</span>
      <button @click="handleLogout" class="btn-logout">Se déconnecter</button>
    </div>
  </nav>
  <router-view />
</template>

<style>
/* Thème global sombre/élégant */
:root {
  --bg-color: #f4f7f6;
  --primary-color: #2c3e50;
  --accent-color: #27ae60;
  --text-color: #333;
  --font-family: 'Inter', 'Segoe UI', sans-serif;
}

body {
  margin: 0;
  background-color: var(--bg-color);
  font-family: var(--font-family);
  color: var(--text-color);
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--primary-color);
  padding: 15px 30px;
  color: white;
}
.nav-links a {
  color: white;
  text-decoration: none;
  margin-right: 20px;
  font-weight: 500;
}
.nav-links a.router-link-active {
  color: var(--accent-color);
}
.nav-user {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 0.9em;
}
.btn-logout {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
}
</style>