<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ReportDisplay from '../components/ReportDisplay.vue';

const route = useRoute();
const report = ref(null);
const errorMsg = ref('');
const loading = ref(true);

onMounted(async () => {
  try {
    const token = route.params.token;
 
    const response = await fetch(`http://localhost:8787/api/share/${token}`);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    report.value = data.report;
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="container">
    <div v-if="loading" class="loading">Chargement du document...</div>
    <div v-else-if="errorMsg" class="error">
      <h2>Oups ! 😕</h2>
      <p>{{ errorMsg }}</p>
      <router-link to="/">Aller à l'accueil</router-link>
    </div>
    <div v-else-if="report">
      <div class="shared-banner">
        🔒 Document partagé en lecture seule via CloudScribe AI
      </div>
      <ReportDisplay 
        :content="report.generated_text" 
        :tier="report.tier" 
        :date="report.created_at"
        :sentiment="report.sentiment"
        :sentimentScore="report.sentiment_score"
        :sentimentExplication="report.sentiment_explication"
      />
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 900px; margin: 40px auto; padding: 0 20px; }
.loading { text-align: center; font-size: 1.2rem; margin-top: 50px; }
.error { text-align: center; margin-top: 50px; color: #e53e3e; }
.shared-banner { background: #edf2f7; color: #4a5568; padding: 10px; text-align: center; border-radius: 8px; margin-bottom: 20px; font-weight: 600; font-size: 0.9rem; }
</style>