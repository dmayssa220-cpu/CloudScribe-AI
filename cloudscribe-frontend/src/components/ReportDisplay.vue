<script setup>
import { computed, ref } from 'vue';
import { marked } from 'marked';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const props = defineProps({
  content: { type: String, required: true },
  tier: { type: String, default: 'normal' },
  date: { type: String, default: () => new Date().toISOString() },
  imageBase64: { type: String, default: null },
  imageMimeType: { type: String, default: null }
});

const isDownloading = ref(false);
const isCopied = ref(false);

const htmlContent = computed(() => marked.parse(props.content || ''));
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
  const text = el.innerText || props.content;
  navigator.clipboard.writeText(text);
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
</script>

<template>
  <div class="report-wrapper">
    <!-- Zone capturée pour le PDF -->
    <div :id="`report-${date}`" class="report-design">
      <div class="report-header">
        <div class="logo-area">
          <span class="logo-icon">✦</span> CloudScribe 
          <span class="badge" :class="tier">{{ tier }}</span>
        </div>
        <span class="date">{{ formattedDate }}</span>
      </div>
      
      <!-- Contenu Markdown rendu -->
      <div class="report-body markdown-body" v-html="htmlContent"></div>

      <!-- Image Source si présente -->
      <div v-if="getImageSrc" class="report-image">
        <p class="image-title">📸 Image source analysée :</p>
        <img :src="getImageSrc" alt="Image analysée" />
      </div>

      <div class="report-footer">
        Document confidentiel généré par CloudScribe AI
      </div>
    </div>

    <!-- Barre d'actions moderne -->
    <div class="action-bar">
      <button @click="copyToClipboard" class="action-btn btn-gray" :title="isCopied ? 'Copié !' : 'Copier le texte'">
        {{ isCopied ? '✅' : '📋' }}
      </button>
      <button @click="downloadPDF" class="action-btn btn-blue" :disabled="isDownloading" title="Télécharger PDF">
        {{ isDownloading ? '⏳' : '📥' }}
      </button>
      <button @click="shareNative" class="action-btn btn-green" title="Partager le fichier">📤</button>
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
.btn-gray { color: #4a5568; border: 1px solid #e2e8f0; }
.btn-blue { color: #3182ce; border: 1px solid #bee3f8; background: #ebf8ff; }
.btn-green { color: #38a169; border: 1px solid #c6f6d5; background: #f0fff4; }
</style>