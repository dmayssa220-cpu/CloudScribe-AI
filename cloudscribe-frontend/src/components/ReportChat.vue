<script setup>
import { ref } from 'vue';
import { supabase } from '../supabase';

const props = defineProps({
  documentText: { type: String, required: true }
});

const question = ref('');
const messages = ref([]);
const loading = ref(false);

const askQuestion = async () => {
  if (!question.value.trim()) return;
  
  const userMsg = question.value;
  messages.value.push({ role: 'user', content: userMsg });
  question.value = '';
  loading.value = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    // On ne garde que les 5 derniers messages pour le contexte
    const contextHistory = messages.value.slice(-5);

    const response = await fetch('http://localhost:8787/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        document: props.documentText,
        question: userMsg,
        history: contextHistory
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    messages.value.push({ role: 'assistant', content: data.answer });
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: err instanceof Error ? err.message : 'Une erreur est survenue pendant la discussion.'
    });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="chat-container">
    <h3>💬 Discuter avec ce document</h3>
    <div class="chat-messages">
      <div v-if="messages.length === 0" class="chat-empty">
        Posez une question sur le compte rendu (ex: "Quelles sont les actions assignées à Marie ?")
      </div>
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <strong v-if="msg.role === 'user'">Vous :</strong>
        <strong v-else>IA :</strong>
        <p>{{ msg.content }}</p>
      </div>
      <div v-if="loading" class="message assistant">
        <em>Réflexion en cours...</em>
      </div>
    </div>
    
    <form @submit.prevent="askQuestion" class="chat-input-area">
      <input 
        type="text" 
        v-model="question" 
        placeholder="Posez votre question..." 
        :disabled="loading"
      />
      <button type="submit" :disabled="loading || !question.trim()">Envoyer</button>
    </form>
  </div>
</template>

<style scoped>
.chat-container { margin-top: 30px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
.chat-container h3 { margin-top: 0; color: #2d3748; }
.chat-messages { max-height: 300px; overflow-y: auto; margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px; }
.chat-empty { color: #a0aec0; font-style: italic; text-align: center; padding: 20px; }
.message { padding: 10px 15px; border-radius: 8px; max-width: 80%; }
.message.user { background: #ebf8ff; align-self: flex-end; color: #2b6cb0; }
.message.assistant { background: #f7fafc; align-self: flex-start; color: #4a5568; border: 1px solid #edf2f7; }
.message p { margin: 5px 0 0 0; white-space: pre-wrap; }
.chat-input-area { display: flex; gap: 10px; }
.chat-input-area input { flex: 1; padding: 12px; border: 1px solid #cbd5e0; border-radius: 8px; }
.chat-input-area button { padding: 12px 20px; background: #3182ce; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
.chat-input-area button:disabled { background: #a0aec0; }
</style>