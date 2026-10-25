<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const notes = ref('');
const tier = ref('normal');
const result = ref('');
const loading = ref(false);
const errorMsg = ref('');

const router = useRouter();

const generateReport = async () => {
  if (!notes.value.trim()) {
    errorMsg.value = "Veuillez entrer des notes.";
    return;
  }
  
  loading.value = true;
  errorMsg.value = '';
  result.value = '';

  try {
    const response = await fetch('http://localhost:8787/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes.value, tier: tier.value })
    });

    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la génération');
    
    result.value = data.result;
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="container">
    <h1>CloudScribe AI</h1>
    <p>Transformez vos notes brutes en comptes rendus structurés.</p>

   
    <div class="card">
      <textarea 
        v-model="notes" 
        placeholder="Collez vos notes ici (ex: Réunion lundi, budget validé, Marie fait le rapport...)"
        rows="6"
      ></textarea>
      
      <div class="options">
        <label>
          <input type="radio" value="normal" v-model="tier"> Normal (Gratuit)
        </label>
        <label>
          <input type="radio" value="pro" v-model="tier"> Professionnel
        </label>
        <label>
          <input type="radio" value="premium" v-model="tier"> Premium
        </label>
      </div>

      <button @click="generateReport" :disabled="loading">
        {{ loading ? 'Génération en cours...' : 'Générer le compte rendu' }}
      </button>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>

    
    <div v-if="result" class="card result">
      <h2>Résultat</h2>
      <pre>{{ result }}</pre>
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 800px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
.card { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px; font-family: inherit; }
.options { display: flex; gap: 15px; margin-bottom: 15px; }
button { background: #42b883; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; }
button:disabled { background: #a0d8bf; cursor: not-allowed; }
.error { color: red; margin-top: 10px; }
.result pre { white-space: pre-wrap; font-family: inherit; background: white; padding: 15px; border-radius: 4px; border: 1px solid #eee; }
</style>