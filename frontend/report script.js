// State Management
const state = {
    files: [],
    reportData: null
};

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const placeholder = document.getElementById('placeholder');
const reportContent = document.getElementById('reportContent');
const loadingState = document.getElementById('loadingState');
const successMessage = document.getElementById('successMessage');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// File Upload Handlers
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    for (let file of files) {
        if (file.size > 10 * 1024 * 1024) {
            alert('File too large! Maximum size is 10MB');
            continue;
        }
        
        if (!['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(file.type) && !file.name.endsWith('.pdf')) {
            alert('Unsupported file type!');
            continue;
        }

        state.files.push(file);
    }

    renderFileList();
    updateButtonStates();
}

function renderFileList() {
    fileList.innerHTML = '';

    if (state.files.length === 0) return;

    state.files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileIcon = getFileIcon(file.type);
        const fileSize = (file.size / 1024).toFixed(2);

        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize} KB</div>
                </div>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})">Remove</button>
        `;

        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    state.files.splice(index, 1);
    renderFileList();
    updateButtonStates();
}

function getFileIcon(fileType) {
    if (fileType === 'application/pdf') return '📄';
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'text/plain') return '📝';
    return '📁';
}

function updateButtonStates() {
    const hasFiles = state.files.length > 0;
    analyzeBtn.disabled = !hasFiles;
    clearBtn.disabled = !hasFiles;
}

clearBtn.addEventListener('click', () => {
    state.files = [];
    fileInput.value = '';
    renderFileList();
    updateButtonStates();
    resetReport();
});

// Analysis
analyzeBtn.addEventListener('click', analyzeReport);

function analyzeReport() {
    loadingState.classList.add('active');
    placeholder.style.display = 'none';
    reportContent.classList.remove('active');
    successMessage.classList.remove('active');

    // Simulate API call
    setTimeout(() => {
        state.reportData = generateMockReport();
        displayReport(state.reportData);
        
        loadingState.classList.remove('active');
        reportContent.classList.add('active');
        successMessage.classList.add('active');

        setTimeout(() => {
            successMessage.classList.remove('active');
        }, 4000);
    }, 2000);
}

function generateMockReport() {
    const fileNames = state.files.map(f => f.name).join(', ');
    
    return {
        fileName: fileNames,
        uploadDate: new Date().toLocaleDateString(),
        reportType: 'Medical Imaging Report',
        status: 'Normal',
        confidence: '94%',
        summary: `This AI analysis of your medical report "${fileNames}" indicates healthy results with no critical findings detected. All measured parameters fall within normal ranges.`,
        details: `The report has been analyzed using advanced machine learning algorithms. Key areas examined include:
        
        • Patient Information: Verified and complete
        • Medical History: Reviewed and summarized
        • Test Results: All values within normal limits
        • Imaging Analysis: No abnormalities detected
        • Clinical Recommendations: Routine follow-up recommended
        
        The analysis was performed with 94% confidence level using the latest medical AI models.`,
        findings: [
            '✓ All vital signs within normal range',
            '✓ No acute findings detected',
            '✓ Previous conditions stable',
            '→ Continue current medication as prescribed',
            '→ Schedule routine follow-up in 6 months'
        ]
    };
}

function displayReport(data) {
    // Summary Tab
    const metricsContainer = document.getElementById('metricsContainer');
    metricsContainer.innerHTML = `
        <div class="metric-card">
            <div class="metric-value">${data.status}</div>
            <div class="metric-label">Overall Status</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${data.confidence}</div>
            <div class="metric-label">AI Confidence</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${data.reportType}</div>
            <div class="metric-label">Report Type</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${data.uploadDate}</div>
            <div class="metric-label">Analysis Date</div>
        </div>
    `;

    // Summary text
    const summaryText = document.getElementById('summaryText');
    if (summaryText) summaryText.textContent = data.summary || data.details || '';

    // Report Tab: show file previews / raw report
    populateReportView(state.files);

    // Findings Tab
    const findingsList = document.getElementById('findingsList');
    findingsList.innerHTML = data.findings
        .map(finding => `<li><span class="finding-indicator">•</span> ${finding}</li>`)
        .join('');
}

function populateReportView(files) {
    const reportView = document.getElementById('reportView');
    reportView.innerHTML = '';
    if (!files || files.length === 0) {
        reportView.textContent = 'No uploaded files to preview.';
        return;
    }

    files.forEach((file, i) => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '12px';

        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.style.marginBottom = '6px';
        title.textContent = `${i + 1}. ${file.name}`;
        wrapper.appendChild(title);

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.style.maxWidth = '100%';
            img.style.borderRadius = '6px';
            img.style.border = '1px solid #eef2ff';
            wrapper.appendChild(img);
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            const pre = document.createElement('pre');
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.background = '#fbfdff';
            pre.style.padding = '10px';
            pre.style.border = '1px solid #f1f5f9';
            pre.style.borderRadius = '6px';
            const reader = new FileReader();
            reader.onload = () => { pre.textContent = reader.result; };
            reader.readAsText(file);
            wrapper.appendChild(pre);
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Open PDF in new tab';
            link.style.display = 'inline-block';
            link.style.padding = '8px 10px';
            link.style.border = '1px solid #e6e9ef';
            link.style.borderRadius = '6px';
            link.style.background = '#ffffff';
            wrapper.appendChild(link);
        } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = file.name;
            link.textContent = 'Download file';
            wrapper.appendChild(link);
        }

        reportView.appendChild(wrapper);
    });
}

function resetReport() {
    placeholder.style.display = 'block';
    reportContent.classList.remove('active');
    state.reportData = null;
}

// Tab Switching
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');
    });
});

// Initialize
updateButtonStates();
