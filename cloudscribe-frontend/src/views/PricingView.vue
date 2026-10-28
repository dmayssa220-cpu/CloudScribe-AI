<script setup>
import { ref } from 'vue';
import { supabase } from '../supabase';

const loading = ref(false);

const subscribePremium = async () => {
  loading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Utilisateur non connecté');

    const response = await fetch('http://localhost:8787/api/create-checkout-session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
    const data = await response.json();
    
    if (data.url) {
      window.location.href = data.url; 
    } else {
      alert("Erreur lors de la création de la session de paiement.");
    }
  } catch (error) {
    console.error(error);
    alert("Erreur de connexion au serveur.");
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="container">
    <h1>Tarifs</h1>
    <div class="plans">
      <div class="plan">
        <h2>Normal</h2>
        <p class="price">Gratuit</p>
        <p>Comptes rendus simples et concis.</p>
      </div>
      
      <div class="plan premium">
        <h2>Premium</h2>
        <p class="price">19$ / mois</p>
        <p>Comptes rendus détaillés avec plan d'action et résumé exécutif.</p>
        <button @click="subscribePremium" :disabled="loading">
          {{ loading ? 'Redirection...' : "S'abonner à Premium" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plans { display: flex; gap: 20px; }
.plan { flex: 1; border: 1px solid #ccc; padding: 20px; border-radius: 8px; text-align: center; }
.plan.premium { border-color: #42b883; box-shadow: 0 4px 8px rgba(66, 184, 131, 0.2); }
.price { font-size: 24px; font-weight: bold; margin: 10px 0; }
button { background: #42b883; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 15px; }
</style>