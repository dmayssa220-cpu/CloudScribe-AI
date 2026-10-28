<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import ReportDisplay from '../components/ReportDisplay.vue';

const history = ref([]);
const loading = ref(true);
const errorMsg = ref('');

const fetchHistory = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('http://localhost:8787/api/history', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    history.value = data.history;
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => { fetchHistory(); });
</script>

<template>
  <div class="container">
    <h1>Mon Historique</h1>
    <p class="subtitle">Retrouvez, téléchargez et partagez vos comptes rendus.</p>

    <div v-if="loading" class="skeleton-wrapper">
      <!-- Skeleton Loader Moderne -->
      <div class="skeleton-card" v-for="i in 3" :key="i">
        <div class="skeleton-header"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text short"></div>
      </div>
    </div>
    
    <div v-else-if="errorMsg" class="error">{{ errorMsg }}</div>
    <div v-else-if="history.length === 0" class="empty">Aucun historique pour le moment.</div>
    
    <div v-else class="history-list">
      <div v-for="item in history" :key="item.id" class="history-item">
        <ReportDisplay 
          :content="item.generated_text" 
          :tier="item.tier" 
          :date="item.created_at"
          :imageBase64="item.image_base64"
          :imageMimeType="item.image_mime_type"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 900px; margin: 40px auto; padding: 0 20px; }
h1 { font-size: 2rem; color: #1a202c; }
.subtitle { color: #718096; margin-bottom: 30px; }

/* Skeleton Loader */
.skeleton-card { background: white; padding: 30px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.skeleton-header { height: 20px; width: 40%; background: #edf2f7; border-radius: 4px; margin-bottom: 15px; animation: pulse 1.5s infinite; }
.skeleton-text { height: 14px; width: 100%; background: #edf2f7; border-radius: 4px; margin-bottom: 10px; animation: pulse 1.5s infinite; }
.skeleton-text.short { width: 70%; }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

/* Liste */
.history-list { display: flex; flex-direction: column; gap: 40px; }
.history-item { border-bottom: 1px solid #e2e8f0; padding-bottom: 40px; }
</style>