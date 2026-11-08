<script setup>
import { computed, onMounted, ref } from 'vue';
import { marked } from 'marked';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../supabase';
import ReportChat from './ReportChat.vue';


const props = defineProps({
  id: { type: String, default: null },
  content: { type: String, required: true },
  tier: { type: String, default: 'normal' },
  date: { type: String, default: () => new Date().toISOString() },
  imageBase64: { type: String, default: null },
  imageMimeType: { type: String, default: null },
  sentiment: { type: String, default: 'Neutre' },
  sentimentScore: { type: Number, default: 50 },
  sentimentExplication: { type: String, default: '' }
});


const isDownloading = ref(false);
const isCopied = ref(false);
const currentContent = ref(props.content); 
const isTranslating = ref(false);
const selectedLang = ref('fr');
const tasks = ref([]);
const isExtracting = ref(false);
const tasksError = ref('');
const isSharing = ref(false);
const shareError = ref('');
const selectedText = ref('');
const commentInput = ref('');
const comments = ref([]);


const htmlContent = computed(() => marked.parse(currentContent.value || ''));
const formattedDate = computed(() => {
  return new Date(props.date).toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
});

const getImageSrc = computed(() => {
  if (props.imageBase64 && props.imageMimeType) {
    return `data:${props.imageMimeType};base64,${props.imageBase64}`;
  }
  return null;
});

const downloadPDF = async () => {
  isDownloading.value = true;
  const element = document.getElementById(`report-${props.date}`);
  try {
    const canvas = await html2canvas(element, { scale: 2, useCORS: true }); 
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`CloudScribe_${new Date(props.date).getTime()}.pdf`);
  } catch (err) {
    alert("Erreur PDF.");
  } finally {
    isDownloading.value = false;
  }
};

const copyToClipboard = () => {
  const el = document.getElementById(`report-${props.date}`);
  navigator.clipboard.writeText(el.innerText || currentContent.value);
  isCopied.value = true;
  setTimeout(() => isCopied.value = false, 2000);
};

const shareNative = async () => {
  try {
    const element = document.getElementById(`report-${props.date}`);
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const pdfBlob = pdf.output('blob');
    
    const file = new File([pdfBlob], 'Compte_Rendu.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Compte Rendu', text: 'Généré par CloudScribe AI' });
    } else {
      downloadPDF();
    }
  } catch (err) { console.log(err); }
};


const translateReport = async () => {
  if (selectedLang.value === 'fr' && currentContent.value === props.content) return; // Déjà en FR
  isTranslating.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('http://localhost:8787/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ text: props.content, language: selectedLang.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    currentContent.value = data.translatedText;
  } catch (err) {
    alert("Erreur de traduction: " + err.message);
  } finally {
    isTranslating.value = false;
  }
};


const extractTasks = async () => {
  isExtracting.value = true;
  tasksError.value = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Vous devez être connecté pour extraire les tâches.');

    const res = await fetch('http://localhost:8787/api/extract-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ reportId: props.id, text: props.content })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l’extraction des tâches.');
    tasks.value = data.tasks || [];
    if (data.warning) tasksError.value = data.warning;
  } catch (err) {
    tasksError.value = err instanceof Error ? err.message : 'Erreur lors de l’extraction des tâches.';
  } finally {
    isExtracting.value = false;
  }
};

const toggleTask = async (task) => {
  if (task.id) {
    const { error } = await supabase.from('tasks').update({ is_done: task.is_done }).eq('id', task.id);
    if (error) tasksError.value = 'La tâche est cochée, mais son état n’a pas pu être sauvegardé.';
  }
};
const sentimentColor = computed(() => {
  if (props.sentimentScore > 60) return '#38a169'; 
  if (props.sentimentScore < 40) return '#e53e3e'; 
  return '#d69e2e'; 
});
const generateShareLink = async () => {
  if (!props.id) {
    shareError.value = "Ce compte rendu n’a pas été sauvegardé et ne peut pas être partagé.";
    return;
  }
  isSharing.value = true;
  shareError.value = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Vous devez être connecté pour partager ce compte rendu.');
    const res = await fetch('http://localhost:8787/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ reportId: props.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la création du lien.');
    if (!data.shareToken) throw new Error('Le lien de partage n’a pas pu être créé.');

    const url = `${window.location.origin}/share/${data.shareToken}`;
    await navigator.clipboard.writeText(url);
    alert("Lien de partage copié dans le presse-papiers !\n" + url);
  } catch (err) {
    shareError.value = err instanceof Error ? err.message : "Erreur lors de la création du lien.";
  } finally {
    isSharing.value = false;
  }
};
const handleTextSelection = () => {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 5) {
    selectedText.value = text;
  }
};

const loadComments = async () => {
  if (!props.id) return;
  const { data } = await supabase.from('comments').select('*').eq('report_id', props.id);
  if (data) comments.value = data;
};
onMounted(() => { loadComments(); });

const submitComment = async () => {
  if (!commentInput.value.trim()) return;
  const { data: { session } } = await supabase.auth.getSession();
  await fetch('http://localhost:8787/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ 
      reportId: props.id, 
      selectedText: selectedText.value, 
      commentText: commentInput.value 
    })
  });
  commentInput.value = '';
  showCommentBox.value = false;
  loadComments(); 
};
</script>

<template>
  <div class="report-wrapper">
     <div class="top-toolbar">
      <div class="lang-selector">
        <span>🌐 Traduire :</span>
        <select v-model="selectedLang" @change="translateReport" :disabled="isTranslating">
          <option value="fr">Français</option>
          <option value="en">Anglais</option>
          <option value="es">Espagnol</option>
          <option value="de">Allemand</option>
          <option value="ar">Arabe</option>
        </select>
        <span v-if="isTranslating" class="translating-text">Traduction...</span>
      </div>
    </div>    
    <div :id="`report-${date}`" class="report-design">
      <div class="report-header">
        <div class="logo-area">
          <span class="logo-icon">✦</span> CloudScribe 
          <span class="badge" :class="tier">{{ tier }}</span>
        </div>
        <span class="date">{{ formattedDate }}</span>
      </div>
      
      <div class="report-body markdown-body" @mouseup="handleTextSelection" v-html="htmlContent"></div>

      <div v-if="getImageSrc" class="report-image">
        <p class="image-title">📸 Image source analysée :</p>
        <img :src="getImageSrc" alt="Image analysée" />
      </div>

      <div class="report-footer">
        Document confidentiel généré par CloudScribe AI
      </div>
    </div>
<div class="sentiment-banner" v-if="sentiment">
        <div class="sentiment-header">
          <span class="sentiment-badge" :style="{ color: sentimentColor, borderColor: sentimentColor }">
            {{ sentiment }}
          </span>
          <span class="sentiment-score">Score : {{ sentimentScore }}/100</span>
        </div>
        <p class="sentiment-desc">{{ sentimentExplication }}</p>
      </div>
    
    <div class="action-bar">
      <button @click="copyToClipboard" class="action-btn btn-gray" :title="isCopied ? 'Copié !' : 'Copier le texte'">
        {{ isCopied ? '✅' : '📋' }}
      </button>
      <button @click="downloadPDF" class="action-btn btn-blue" :disabled="isDownloading" title="Télécharger PDF">
        {{ isDownloading ? '⏳' : '📥' }}
      </button>
      <button @click="generateShareLink" class="action-btn btn-purple" :disabled="isSharing" title="Partager par lien public">
        {{ isSharing ? '⏳' : '🔗' }}
      </button>
    </div>
    <p v-if="shareError" class="share-error">{{ shareError }}</p>

    
    <div class="tasks-section">
      <button @click="extractTasks" :disabled="isExtracting" class="btn-tasks">
        {{ isExtracting ? '⏳ Extraction...' : '✅ Extraire les actions (To-Do)' }}
      </button>
      <p v-if="tasksError" class="tasks-error">{{ tasksError }}</p>
      
      <div v-if="tasks.length > 0" class="task-list">
        <div v-for="task in tasks" :key="task.id" class="task-item">
          <input type="checkbox" v-model="task.is_done" @change="toggleTask(task)" />
          <span :class="{ 'done': task.is_done }">{{ task.content }}</span>
        </div>
      </div>
    </div>    
    <ReportChat v-if="currentContent" :documentText="currentContent" />
    <div class="report-body" @mouseup="handleTextSelection" v-html="htmlContent"></div>
    <div v-if="showCommentBox" class="comment-popup">
    <p>Commenter : "<em>{{ selectedText }}</em>"</p>
    <textarea v-model="commentInput" placeholder="Votre commentaire..."></textarea>
    <button @click="submitComment">Enregistrer</button>
  </div>
    <div class="comments-section" v-if="props.id">
  <h4>💬 Commentaires de l'équipe</h4>
  <div v-for="c in comments" :key="c.id" class="comment-item">
    <p class="comment-quote">"{{ c.selected_text }}"</p>
    <p class="comment-text">{{ c.comment_text }}</p>
  </div>
</div>
  </div>
</template>

<style scoped>

.report-wrapper {
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.report-design {
  background: #ffffff;
  width: 100%;
  max-width: 800px;
  padding: 50px;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.08);
  border: 1px solid #eaeaea;
  color: #1a202c;
  box-sizing: border-box;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f7fafc;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.logo-area {
  font-size: 20px;
  font-weight: 800;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-icon { color: #3182ce; }

.badge {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 1px;
  background: #edf2f7;
  color: #4a5568;
}
.badge.premium { background: #faf089; color: #b7791f; }
.badge.pro { background: #e6fffa; color: #319795; }

.date { color: #a0aec0; font-size: 14px; font-weight: 500; }


.markdown-body {
  font-family: 'Inter', -apple-system, sans-serif;
  line-height: 1.7;
  font-size: 16px;
}
.markdown-body :deep(h1), .markdown-body :deep(h2) {
  color: #2d3748;
  font-weight: 700;
  margin-top: 30px;
  margin-bottom: 15px;
  border-bottom: 1px solid #edf2f7;
  padding-bottom: 10px;
}
.markdown-body :deep(h3) {
  color: #4a5568;
  font-weight: 600;
  margin-top: 20px;
  margin-bottom: 10px;
}
.markdown-body :deep(strong) {
  color: #2d3748;
  font-weight: 700;
}
.markdown-body :deep(ul) {
  padding-left: 20px;
  margin-bottom: 20px;
}
.markdown-body :deep(li) {
  margin-bottom: 8px;
}


.report-image {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px dashed #cbd5e0;
}
.image-title {
  font-size: 14px;
  color: #718096;
  font-weight: 600;
  margin-bottom: 10px;
}
.report-image img {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.report-footer {
  margin-top: 50px;
  text-align: center;
  font-size: 12px;
  color: #a0aec0;
  border-top: 1px solid #edf2f7;
  padding-top: 20px;
  letter-spacing: 0.5px;
}


.action-bar {
  display: flex;
  gap: 15px;
  margin-top: 25px;
}
.action-btn {
  width: 48px; height: 48px; border-radius: 12px; border: none; cursor: pointer;
  font-size: 20px; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05); transition: all 0.2s ease;
  background: white;
}
.action-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.1); }
.btn-purple { color: #805ad5; border: 1px solid #e9d8fd; background: #faf5ff; }
.btn-gray { color: #4a5568; border: 1px solid #e2e8f0; }
.btn-blue { color: #3182ce; border: 1px solid #bee3f8; background: #ebf8ff; }
.btn-green { color: #38a169; border: 1px solid #c6f6d5; background: #f0fff4; }
.top-toolbar { display: flex; justify-content: flex-end; margin-bottom: 15px; width: 100%; max-width: 800px; }
.lang-selector { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: #4a5568; }
.lang-selector select { padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e0; outline: none; font-family: inherit; font-size: 0.9rem; cursor: pointer; }
.translating-text { color: #3182ce; font-style: italic; font-size: 0.85rem; }

.tasks-section { margin-top: 20px; width: 100%; max-width: 800px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
.btn-tasks { background: #edf2f7; color: #2d3748; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-tasks:hover { background: #e2e8f0; }
.tasks-error { color: #b42318; margin: 8px 0; }
.task-list { margin-top: 15px; display: flex; flex-direction: column; gap: 10px; }
.task-item { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; color: #2d3748; }
.task-item input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #38a169; }
.task-item .done { text-decoration: line-through; color: #a0aec0; }
.sentiment-banner { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 25px; }
.sentiment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.sentiment-badge { font-weight: 700; padding: 4px 12px; border-radius: 20px; border: 2px solid; font-size: 0.85rem; text-transform: uppercase; }
.sentiment-score { font-weight: 600; color: #4a5568; font-size: 0.9rem; }
.sentiment-desc { font-size: 0.9rem; color: #718096; margin: 0; }
.share-error { color: #b42318; margin: 10px 0 0; text-align: center; }
.comments-section { width: 100%; max-width: 800px; margin-top: 20px; padding: 20px; box-sizing: border-box; background: white; border: 1px solid #e2e8f0; border-radius: 12px; }
.comments-section h3 { margin: 0 0 8px; color: #2d3748; }
.comment-hint, .selected-quote { color: #718096; margin: 8px 0; }
.comments-section textarea { width: 100%; min-height: 90px; box-sizing: border-box; padding: 12px; border: 1px solid #cbd5e0; border-radius: 8px; font: inherit; resize: vertical; }
.comments-section button { margin-top: 10px; padding: 10px 16px; border: 0; border-radius: 8px; background: #3182ce; color: white; font-weight: 600; cursor: pointer; }
.comments-section button:disabled { background: #a0aec0; cursor: not-allowed; }
.comment-list { display: grid; gap: 12px; padding: 0; list-style: none; }
.comment-list li { padding: 12px; background: #f8fafc; border-radius: 8px; color: #4a5568; }
.comment-list blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid #90cdf4; color: #718096; }
.comment-list p { margin: 0; white-space: pre-wrap; }
</style>