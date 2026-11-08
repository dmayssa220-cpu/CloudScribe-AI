<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';

const customPrompt = ref('');
const loading = ref(false);
const saved = ref(false);

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const { data } = await supabase.from('user_settings').select('custom_prompt').eq('user_id', session.user.id).single();
  if (data) customPrompt.value = data.custom_prompt;
});

const saveSettings = async () => {
  loading.value = true;
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.from('user_settings').upsert({ 
    user_id: session.user.id, 
    custom_prompt: customPrompt.value,
    updated_at: new Date()
  });
  loading.value = false;
  saved.value = true;
  setTimeout(() => saved.value = false, 2000);
};
</script>

<template>
  <div class="container">
    <h1>Paramètres</h1>
    <div class="card">
      <h3>Style de rédaction personnalisé</h3>
      <p>Ajoutez des instructions que l'IA suivra pour tous vos comptes rendus.</p>
      <textarea v-model="customPrompt" placeholder="Ex: Utilise un ton formel. Ne mentionne pas les pauses café. Utilise le vocabulaire technique de l'entreprise." rows="5"></textarea>
      <button @click="saveSettings" :disabled="loading">
        {{ loading ? 'Enregistrement...' : (saved ? '✅ Enregistré !' : 'Enregistrer') }}
      </button>
    </div>
  </div>
</template>