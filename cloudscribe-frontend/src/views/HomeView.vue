<script setup>
import { onMounted, ref } from 'vue';
import { supabase } from '../supabase';
import * as pdfjsLib from 'pdfjs-dist';
import ReportDisplay from '../components/ReportDisplay.vue';


import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;


const notes = ref('');
const tier = ref('normal');
const result = ref('');
const loading = ref(false);
const errorMsg = ref('');
const fileInput = ref(null);
const imageBase64 = ref(null);
const imageMimeType = ref(null);

onMounted(() => {
  const savedResult = sessionStorage.getItem('cloudscribe-result');
  if (savedResult) result.value = savedResult;
});

// Gestion des fichiers (PDF et Image)
const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  errorMsg.value = '';
  imageBase64.value = null;
  imageMimeType.value = null;

  if (file.type === 'application/pdf') {
    try {
      loading.value = true;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let extractedText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map(item => item.str).join(' ') + '\n';
      }
      notes.value += `\n\n--- Contenu du PDF (${file.name}) ---\n${extractedText}`;
    } catch (err) {
      errorMsg.value = "Erreur lors de la lecture du PDF.";
    } finally {
      loading.value = false;
    }
  } else if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imageBase64.value = e.target.result.split(',')[1];
      imageMimeType.value = file.type;
    };
    reader.readAsDataURL(file);
  }
};

// Génération du compte rendu
const generateReport = async () => {
  if (!notes.value.trim() && !imageBase64.value) {
    errorMsg.value = "Veuillez entrer des notes ou joindre un fichier.";
    return;
  }
  
  loading.value = true;
  errorMsg.value = '';
  result.value = '';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Vous devez être connecté.");

    const response = await fetch('http://localhost:8787/api/generate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ 
        notes: notes.value, 
        tier: tier.value, 
        image: imageBase64.value, 
        mimeType: imageMimeType.value 
      })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la génération');
    
    result.value = data.result;
    sessionStorage.setItem('cloudscribe-result', data.result);
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
};

// Effacer le formulaire
const clearForm = () => {
  notes.value = '';
  imageBase64.value = null;
  imageMimeType.value = null;
  result.value = '';
  sessionStorage.removeItem('cloudscribe-result');
};
</script>

<template>
  <div class="container">
    <!-- En-tête -->
    <div class="header-title">
      <h1>CloudScribe <span>AI</span></h1>
      <p>Transformez vos notes désordonnées en comptes rendus impeccables en quelques secondes.</p>
    </div>
    
    <!-- Formulaire de saisie -->
    <div class="card input-card">
      <div class="card-header">
        <div class="file-upload">
          <label for="file-upload" class="btn-upload">📎 Ajouter un fichier (PDF/Image)</label>
          <input id="file-upload" type="file" @change="handleFileUpload" accept=".pdf, image/*" ref="fileInput" />
          <span v-if="imageBase64" class="badge-success">Image prête</span>
        </div>
        
        <div class="tools-header">
          <span class="char-count">{{ notes.length }} / 5000</span>
          <button class="btn-clear" @click="clearForm" title="Tout effacer">🗑️</button>
        </div>
      </div>

      <textarea 
        v-model="notes" 
        placeholder="Collez vos notes de réunion, de cours, ou un texte brut ici..." 
        rows="6"
        maxlength="5000"
      ></textarea>
      
      <div class="options-group">
        <span class="label-tier">Niveau de rédaction :</span>
        <div class="options">
          <label :class="{ active: tier === 'normal' }">
            <input type="radio" value="normal" v-model="tier"> Normal
          </label>
          <label :class="{ active: tier === 'pro' }">
            <input type="radio" value="pro" v-model="tier"> Pro
          </label>
          <label :class="{ active: tier === 'premium' }">
            <input type="radio" value="premium" v-model="tier"> Premium ⭐
          </label>
        </div>
      </div>

      <button @click="generateReport" :disabled="loading" class="btn-primary">
        <span v-if="loading" class="spinner"></span>
        {{ loading ? 'Génération magique...' : 'Générer le compte rendu' }}
      </button>
      
      <p v-if="errorMsg" class="error">⚠️ {{ errorMsg }}</p>
    </div>

    <!-- Affichage du résultat via le composant réutilisable -->
    <ReportDisplay 
      v-if="result" 
      :content="result" 
      :tier="tier" 
      :imageBase64="imageBase64" 
      :imageMimeType="imageMimeType"
      :date="new Date().toISOString()"
    />
  </div>
</template>

<style scoped>
/* --- THÈME GLOBAL --- */
.container { 
  max-width: 900px; 
  margin: 40px auto; 
  padding: 0 20px; 
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1a202c;
}

/* --- EN-TÊTE --- */
.header-title { text-align: center; margin-bottom: 40px; }
.header-title h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 10px; letter-spacing: -1px; }
.header-title h1 span { color: #3182ce; }
.header-title p { color: #718096; font-size: 1.1rem; max-width: 600px; margin: 0 auto; }

/* --- CARTE DU FORMULAIRE --- */
.card { 
  background: white; 
  padding: 30px; 
  border-radius: 16px; 
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05); 
  margin-bottom: 30px; 
  border: 1px solid #eaeaea; 
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tools-header { display: flex; align-items: center; gap: 15px; }
.char-count { font-size: 0.85rem; color: #a0aec0; font-weight: 500; }

.btn-clear { 
  background: none; 
  border: none; 
  font-size: 1.2rem; 
  cursor: pointer; 
  transition: transform 0.2s; 
  padding: 5px;
}
.btn-clear:hover { transform: scale(1.1) rotate(5deg); }

/* --- ZONE DE TEXTE --- */
textarea { 
  width: 100%; 
  padding: 16px; 
  border: 1px solid #e2e8f0; 
  border-radius: 12px; 
  margin-bottom: 25px; 
  font-family: inherit; 
  font-size: 16px; 
  background: #f8fafc; 
  box-sizing: border-box; 
  transition: border 0.3s, background 0.3s; 
  resize: vertical;
  min-height: 150px;
}
textarea:focus { 
  outline: none; 
  border-color: #3182ce; 
  background: white; 
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

/* --- UPLOAD --- */
.file-upload { display: flex; align-items: center; gap: 10px; }
input[type="file"] { display: none; }
.btn-upload { 
  display: inline-flex;
  align-items: center;
  padding: 8px 16px; 
  cursor: pointer; 
  background: #edf2f7; 
  border-radius: 8px; 
  font-weight: 600; 
  color: #4a5568; 
  transition: 0.3s; 
  border: 1px dashed #cbd5e0;
  font-size: 0.9rem;
}
.btn-upload:hover { background: #e2e8f0; color: #2d3748; }
.badge-success { 
  color: #38a169; 
  font-weight: 700; 
  font-size: 0.85em; 
  background: #f0fff4; 
  padding: 4px 10px; 
  border-radius: 6px; 
}

/* --- OPTIONS (NIVEAUX) --- */
.options-group { margin-bottom: 25px; }
.label-tier { display: block; font-size: 0.9rem; color: #4a5568; margin-bottom: 10px; font-weight: 600; }
.options { display: flex; gap: 10px; flex-wrap: wrap; }
.options label { 
  padding: 10px 20px; 
  border-radius: 8px; 
  border: 1px solid #e2e8f0; 
  cursor: pointer;
  background: #f8fafc; 
  transition: all 0.2s; 
  font-weight: 500; 
  font-size: 0.95rem;
  user-select: none;
}
.options label:hover { background: #edf2f7; }
.options label.active { 
  background: #ebf8ff; 
  border-color: #3182ce; 
  color: #2b6cb0; 
  font-weight: 700; 
  box-shadow: 0 2px 8px rgba(49, 130, 206, 0.2);
}
.options input[type="radio"] { display: none; }

/* --- BOUTON PRINCIPAL --- */
.btn-primary { 
  width: 100%; 
  background: #3182ce; 
  color: white; 
  border: none; 
  padding: 16px; 
  border-radius: 12px; 
  cursor: pointer; 
  font-size: 16px; 
  font-weight: 700; 
  transition: 0.3s; 
  box-shadow: 0 4px 12px rgba(49, 130, 206, 0.3); 
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}
.btn-primary:hover { background: #2b6cb0; transform: translateY(-1px); box-shadow: 0 6px 15px rgba(49, 130, 206, 0.4); }
.btn-primary:disabled { background: #a0aec0; cursor: not-allowed; box-shadow: none; transform: none; }

/* --- ERREUR --- */
.error { color: #e53e3e; font-weight: 600; margin-top: 15px; text-align: center; }

/* --- SPINNER --- */
.spinner {
  display: inline-block; 
  width: 18px; 
  height: 18px; 
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%; 
  border-top-color: white; 
  animation: spin 1s ease-in-out infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>