// Publish to Gallery functionality

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3002/api'
  : `${window.location.protocol}//${window.location.hostname}/api`;

const publishModal = document.getElementById('publishModal');
const publishModalClose = document.getElementById('publishModalClose');
const publishToGalleryBtn = document.getElementById('publishToGalleryBtn');

// Steps
const publishStep1 = document.getElementById('publishStep1');
const publishStep2 = document.getElementById('publishStep2');
const publishStep3 = document.getElementById('publishStep3');
const publishStep4 = document.getElementById('publishStep4');
const publishStep5 = document.getElementById('publishStep5');
const publishStep6 = document.getElementById('publishStep6');

// Footers
const publishFooter1 = document.getElementById('publishFooter1');
const publishFooter2 = document.getElementById('publishFooter2');
const publishFooter3 = document.getElementById('publishFooter3');
const publishFooter5 = document.getElementById('publishFooter5');
const publishFooter6 = document.getElementById('publishFooter6');

// Inputs
const publishMapName = document.getElementById('publishMapName');
const publishAuthor = document.getElementById('publishAuthor');
const publishDescription = document.getElementById('publishDescription');
const publishAgreeOpenSource = document.getElementById('publishAgreeOpenSource');
const publishProofCanvas = document.getElementById('publishProofCanvas');
const publishDownloadProof = document.getElementById('publishDownloadProof');
const publishCopyrightNo = document.getElementById('publishCopyrightNo');
const publishCopyrightYes = document.getElementById('publishCopyrightYes');
const publishCopyrightDetails = document.getElementById('publishCopyrightDetails');
const publishCopyrightText = document.getElementById('publishCopyrightText');
const publishErrorMsg = document.getElementById('publishErrorMsg');
const publishPRLink = document.getElementById('publishPRLink');

// Buttons
const publishNextBtn = document.getElementById('publishNextBtn');
const publishCancelBtn = document.getElementById('publishCancelBtn');
const publishBackBtn = document.getElementById('publishBackBtn');
const publishContinueBtn = document.getElementById('publishContinueBtn');
const publishBackBtn2 = document.getElementById('publishBackBtn2');
const publishSubmitBtn = document.getElementById('publishSubmitBtn');
const publishDoneBtn = document.getElementById('publishDoneBtn');
const publishRetryBtn = document.getElementById('publishRetryBtn');
const publishCloseBtn = document.getElementById('publishCloseBtn');

let currentStep = 1;
let hasCopyright = false;
let proofDownloaded = false;

// Open modal
publishToGalleryBtn.addEventListener('click', () => {
  if (!window.outCanvas || !window.outCanvas.width || !window.nations || window.nations.length === 0) {
    alert('Please create a map and add at least one nation before publishing.');
    return;
  }
  
  currentStep = 1;
  hasCopyright = false;
  proofDownloaded = false;
  showStep(1);
  publishModal.classList.add('open');
});

// Close modal
publishModalClose.addEventListener('click', closePublishModal);
publishCancelBtn.addEventListener('click', closePublishModal);
publishCloseBtn.addEventListener('click', closePublishModal);

function closePublishModal() {
  publishModal.classList.remove('open');
  resetForm();
}

function resetForm() {
  publishMapName.value = '';
  publishAuthor.value = '';
  publishDescription.value = '';
  publishAgreeOpenSource.checked = false;
  publishCopyrightText.value = '';
  publishCopyrightDetails.style.display = 'none';
  publishNextBtn.disabled = true;
  publishSubmitBtn.disabled = true;
  proofDownloaded = false;
}

// Step navigation
function showStep(step) {
  currentStep = step;
  
  // Hide all steps
  [publishStep1, publishStep2, publishStep3, publishStep4, publishStep5, publishStep6].forEach(s => s.style.display = 'none');
  [publishFooter1, publishFooter2, publishFooter3, publishFooter5, publishFooter6].forEach(f => f.style.display = 'none');
  
  // Show current step
  if (step === 1) {
    publishStep1.style.display = 'block';
    publishFooter1.style.display = 'flex';
  } else if (step === 2) {
    publishStep2.style.display = 'block';
    publishFooter2.style.display = 'flex';
    generateProofImage();
  } else if (step === 3) {
    publishStep3.style.display = 'block';
    publishFooter3.style.display = 'flex';
  } else if (step === 4) {
    publishStep4.style.display = 'block';
  } else if (step === 5) {
    publishStep5.style.display = 'block';
    publishFooter5.style.display = 'flex';
  } else if (step === 6) {
    publishStep6.style.display = 'block';
    publishFooter6.style.display = 'flex';
  }
}

// Step 1: Validate inputs
publishMapName.addEventListener('input', validateStep1);
publishAgreeOpenSource.addEventListener('change', validateStep1);

function validateStep1() {
  const isValid = publishMapName.value.trim().length > 0 && publishAgreeOpenSource.checked;
  publishNextBtn.disabled = !isValid;
}

publishNextBtn.addEventListener('click', () => showStep(2));

// Step 2: Generate proof image
function generateProofImage() {
  const canvas = publishProofCanvas;
  const padding = 40;
  const footerHeight = 80;
  const mapWidth = window.outCanvas.width;
  const mapHeight = window.outCanvas.height;
  
  // Scale map to fit max 500px width
  const maxWidth = 500;
  const scale = Math.min(1, maxWidth / mapWidth);
  const scaledWidth = Math.floor(mapWidth * scale);
  const scaledHeight = Math.floor(mapHeight * scale);
  
  canvas.width = scaledWidth + padding * 2;
  canvas.height = scaledHeight + padding * 2 + footerHeight;
  
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Border
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 2;
  ctx.strokeRect(padding - 10, padding - 10, scaledWidth + 20, scaledHeight + 20);
  
  // Draw map
  ctx.drawImage(window.outCanvas, padding, padding, scaledWidth, scaledHeight);
  
  // Footer background
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
  
  // Text
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  
  const mapName = publishMapName.value.trim();
  const author = publishAuthor.value.trim() || 'Anonymous';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  ctx.fillText(`"${mapName}"`, canvas.width / 2, canvas.height - footerHeight + 25);
  
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#a0aec0';
  ctx.fillText(`Created by ${author}`, canvas.width / 2, canvas.height - footerHeight + 45);
  ctx.fillText(date, canvas.width / 2, canvas.height - footerHeight + 65);
}

publishDownloadProof.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `${publishMapName.value.trim().replace(/[^a-z0-9]+/gi, '-')}-proof.png`;
  link.href = publishProofCanvas.toDataURL('image/png');
  link.click();
  proofDownloaded = true;
});

publishBackBtn.addEventListener('click', () => showStep(1));
publishContinueBtn.addEventListener('click', () => showStep(3));

// Step 3: Copyright
publishCopyrightNo.addEventListener('click', () => {
  hasCopyright = false;
  publishCopyrightDetails.style.display = 'none';
  publishCopyrightNo.classList.add('active');
  publishCopyrightYes.classList.remove('active');
  publishSubmitBtn.disabled = false;
});

publishCopyrightYes.addEventListener('click', () => {
  hasCopyright = true;
  publishCopyrightDetails.style.display = 'block';
  publishCopyrightYes.classList.add('active');
  publishCopyrightNo.classList.remove('active');
  validateStep3();
});

publishCopyrightText.addEventListener('input', validateStep3);

function validateStep3() {
  if (hasCopyright) {
    publishSubmitBtn.disabled = publishCopyrightText.value.trim().length === 0;
  } else {
    publishSubmitBtn.disabled = false;
  }
}

publishBackBtn2.addEventListener('click', () => showStep(2));

// Step 4: Submit
publishSubmitBtn.addEventListener('click', async () => {
  showStep(4);
  
  try {
    // Prepare form data
    const formData = new FormData();
    
    // Add map image
    const mapBlob = await new Promise(resolve => window.outCanvas.toBlob(resolve, 'image/png'));
    formData.append('map', mapBlob, 'map.png');
    
    // Add metadata
    formData.append('mapName', publishMapName.value.trim());
    formData.append('authorNick', publishAuthor.value.trim() || 'Anonymous');
    formData.append('description', publishDescription.value.trim());
    formData.append('nations', JSON.stringify(window.nations));
    formData.append('mapWidth', window.outCanvas.width);
    formData.append('mapHeight', window.outCanvas.height);
    
    if (hasCopyright && publishCopyrightText.value.trim()) {
      formData.append('copyright', publishCopyrightText.value.trim());
    }
    
    // Upload
    const response = await fetch(`${API_URL}/submit-map`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    // Success
    publishPRLink.href = data.prUrl;
    showStep(5);
    
  } catch (error) {
    console.error('Upload error:', error);
    publishErrorMsg.textContent = error.message || 'Something went wrong. Please try again.';
    showStep(6);
  }
});

publishDoneBtn.addEventListener('click', closePublishModal);
publishRetryBtn.addEventListener('click', () => showStep(3));

// Add active class styles for copyright buttons
const style = document.createElement('style');
style.textContent = `
  .btn.active {
    background: var(--accent-dim) !important;
    border-color: var(--accent) !important;
    color: var(--accent) !important;
  }
`;
document.head.appendChild(style);
