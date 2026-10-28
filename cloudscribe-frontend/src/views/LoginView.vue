<script setup>
import { ref } from 'vue';
import { supabase } from '../supabase';

const email = ref('');
const loading = ref(false);
const message = ref('');

const handleLogin = async () => {
  loading.value = true;
  message.value = '';
  
  const { error } = await supabase.auth.signInWithOtp({ 
    email: email.value,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) message.value = error.message;
  else message.value = 'Un lien de connexion vous a été envoyé par email.';
  
  loading.value = false;
};
</script>

<template>
  <div class="login-wrapper">
    <div class="login-card">
      <h2>Bienvenue sur CloudScribe</h2>
      <p>Connectez-vous pour générer vos comptes rendus</p>
      
      <form @submit.prevent="handleLogin">
        <input 
          type="email" 
          v-model="email" 
          placeholder="votre@email.com" 
          required 
        />
        <button type="submit" :disabled="loading">
          {{ loading ? 'Envoi...' : 'Recevoir le lien magique' }}
        </button>
      </form>
      
      <p v-if="message" class="message">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
  background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  text-align: center;
  width: 100%;
  max-width: 400px;
}

.login-card h2 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.login-card p {
  color: #666;
  margin-bottom: 30px;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  margin-bottom: 20px;
  font-size: 16px;
  box-sizing: border-box;
}

button {
  width: 100%;
  padding: 12px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.3s;
}

button:hover { background: #219150; }
button:disabled { background: #95a5a6; }

.message { margin-top: 15px; color: #27ae60; font-weight: 500; font-size: 0.9em; }
</style>