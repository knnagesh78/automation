// --- Firebase Integration ---
const firebaseConfig = {
  apiKey: "AIzaSyBZluCXp8g7ps3pGaNF_0Wql2SZXPS716s",
  authDomain: "automation-4ad46.firebaseapp.com",
  databaseURL: "https://automation-4ad46-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "automation-4ad46",
  storageBucket: "automation-4ad46.firebasestorage.app",
  messagingSenderId: "602849349563",
  appId: "1:602849349563:web:8ce37758a46e7dc660fe9e",
  measurementId: "G-ZV2EN94EGL"
};

// Initialize Firebase using compat SDK safely
let database = null;
let auth = null;
let analytics = null;

if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        auth = firebase.auth();
        analytics = firebase.analytics();
        console.log('[Firebase] Successfully initialized.');
    } catch (e) {
        console.error('[Firebase] Initialization error:', e);
    }
} else {
    console.warn('[Firebase] SDK scripts did not load. Running in local-only fallback mode.');
}


// Generate or retrieve a persistent unique client ID
let clientId = localStorage.getItem('summarizeai_client_id');
if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    localStorage.setItem('summarizeai_client_id', clientId);
}

// --- Global State ---
const state = {
    sourceText: '',
    summaryResult: {
        paragraphs: [],
        bullets: [],
        flashcards: [],
        originalWords: 0,
        summaryWords: 0,
        reductionPercent: 0,
        timeSavedMins: 0
    },
    targetParagraphs: 3, // Default 2-3 paragraphs mode
    outputFormat: 'paragraphs',
    useGeminiApi: false,
    geminiApiKey: localStorage.getItem('gemini_api_key') || '',
    activeFlashcardIndex: 0,
    savedLibrary: JSON.parse(localStorage.getItem('student_summaries_lib') || '[]'),
    speechUtterance: null,
    isSpeaking: false,
    deferredPrompt: null // PWA Deferred Install Prompt
};


// --- Service Worker Registration + Update Wizard Logic ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            console.log('[SW] Registered:', reg.scope);

            // Check if there is already a waiting SW (user opened app after update installed in bg)
            if (reg.waiting) {
                showUpdateBanner();
            }

            // Fires when a NEW SW finishes installing and is waiting to take over
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version is ready; existing version still active
                        showUpdateBanner();
                    }
                });
            });
        }).catch(err => console.warn('[SW] Registration failed:', err));

        // When SW takes over (after skipWaiting), reload the page to use new cache
        let swRefreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!swRefreshing) {
                swRefreshing = true;
                window.location.reload();
            }
        });
    });
}

// ---- Update Banner & Wizard Controllers ----

let updateWizardStep = 1;

function showUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (banner) {
        // Small delay so user sees the app first, then banner slides in
        setTimeout(() => banner.classList.add('show'), 1500);
    }
}

function hideUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (banner) banner.classList.remove('show');
}

function openUpdateWizard() {
    hideUpdateBanner();
    updateWizardStep = 1;
    renderUpdateWizardStep(1);
    const modal = document.getElementById('updateWizardModal');
    if (modal) modal.classList.add('active');
}

function closeUpdateWizard() {
    const modal = document.getElementById('updateWizardModal');
    if (modal) modal.classList.remove('active');
}

function renderUpdateWizardStep(step) {
    // Pages
    document.getElementById('wPage1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('wPage2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('wPage3').style.display = step === 3 ? 'block' : 'none';

    // Step indicators
    ['wStep1','wStep2','wStep3'].forEach((id, i) => {
        const el = document.getElementById(id);
        el.classList.remove('active', 'done');
        if (i + 1 < step) el.classList.add('done');
        if (i + 1 === step) el.classList.add('active');
    });

    // Back button
    const backBtn = document.getElementById('updateWizardBackBtn');
    backBtn.style.display = step > 1 ? 'inline-flex' : 'none';

    // Next/Update button
    const nextBtn = document.getElementById('updateWizardNextBtn');
    if (step === 3) {
        nextBtn.innerHTML = '<i class="fa-solid fa-rocket"></i> Update Now';
    } else {
        nextBtn.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>';
    }
}

function applyUpdate() {
    // Animate the icon ring
    const ring = document.getElementById('updateApplyRing');
    const desc = document.getElementById('updateApplyDesc');
    const nextBtn = document.getElementById('updateWizardNextBtn');
    const backBtn = document.getElementById('updateWizardBackBtn');
    const skipBtn = document.getElementById('updateWizardSkipBtn');

    ring.classList.add('spinning');
    desc.innerHTML = '<strong>Updating...</strong> Applying new version and refreshing cache. Please wait.';
    nextBtn.disabled = true;
    backBtn.style.display = 'none';
    skipBtn.style.display = 'none';

    // Tell the waiting SW to take over immediately
    navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // controllerchange listener in registration block will reload the page
        } else {
            // Fallback: just reload
            window.location.reload();
        }
    });
}

// Bind update wizard events after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('updateLaterBtn')?.addEventListener('click', hideUpdateBanner);
    document.getElementById('updateShowWizardBtn')?.addEventListener('click', openUpdateWizard);
    document.getElementById('closeUpdateWizardBtn')?.addEventListener('click', closeUpdateWizard);
    document.getElementById('updateWizardSkipBtn')?.addEventListener('click', closeUpdateWizard);

    document.getElementById('updateWizardNextBtn')?.addEventListener('click', () => {
        if (updateWizardStep < 3) {
            updateWizardStep++;
            renderUpdateWizardStep(updateWizardStep);
        } else {
            applyUpdate();
        }
    });

    document.getElementById('updateWizardBackBtn')?.addEventListener('click', () => {
        if (updateWizardStep > 1) {
            updateWizardStep--;
            renderUpdateWizardStep(updateWizardStep);
        }
    });
});


// --- Preset Sample Notes for Instant Student Testing ---
const PRESET_NOTES = {
    biology: {
        title: "Biology: Cellular Respiration & ATP Production",
        text: `Cellular respiration is a set of metabolic reactions and processes that take place in the cells of organisms to convert biochemical energy from nutrients into adenosine triphosphate (ATP), and then release waste products. The reactions involved in respiration are catabolic reactions, which break large molecules into smaller ones, releasing energy because weak high-energy bonds, mainly in molecular oxygen, are replaced by stronger bonds in the products. Respiration is one of the key ways a cell gains useful energy to fuel cellular activity.

The process of cellular respiration occurs in three primary stages: Glycolysis, the Citric Acid Cycle (also known as the Krebs Cycle), and Oxidative Phosphorylation. Glycolysis takes place in the cytoplasm of the cell and does not require oxygen (anaerobic). During glycolysis, a single six-carbon glucose molecule is broken down into two three-carbon pyruvate molecules, yielding a net gain of two ATP molecules and two NADH electron carrier molecules.

Following glycolysis, pyruvate is transported into the mitochondrial matrix, where it undergoes conversion into Acetyl-CoA before entering the Citric Acid Cycle. The Krebs Cycle functions as a series of chemical reactions that harvest high-energy electrons from acetyl groups, producing carbon dioxide as a byproduct, along with two ATP molecules, six NADH, and two FADH2 molecules per glucose molecule.

The final stage, Oxidative Phosphorylation, occurs across the inner mitochondrial membrane and generates the vast majority of cellular ATP. High-energy electrons donated by NADH and FADH2 pass through an electron transport chain. As electrons move through the protein complexes, hydrogen ions (protons) are pumped across the membrane, creating a electrochemical proton gradient. This gradient drives protons back into the mitochondrial matrix through ATP synthase, a molecular rotary motor that synthesizes approximately 28 to 32 ATP molecules per glucose molecule through chemiosmosis.

Overall, cellular respiration is crucial for aerobic life because it yields up to 30-32 ATP molecules from a single molecule of glucose. Oxygen acts as the terminal electron acceptor at the end of the electron transport chain, combining with protons to form water. Without oxygen, electron transport halts, drastically reducing ATP yield and forcing cells to rely on anaerobic fermentation, which produces lactic acid in animal muscles or ethanol in yeast.`
    },
    history: {
        title: "History: The Industrial Revolution & Global Transformation",
        text: `The Industrial Revolution was a period of global transition of human economy towards more efficient and stable manufacturing processes that succeeded the Agricultural Revolution. Beginning in Great Britain during the mid-18th century, it transformed agrarian, handcraft economies into machine-driven industrial powers. The revolution was sparked by key technical innovations, most notably the development of the commercial steam engine by James Watt, the spinning jenny by James Hargreaves, and the mechanization of textile production.

The rapid growth of factories reshaped social structures, urbanization, and labor demographics. Millions of workers migrated from rural farmsteads into burgeoning industrial centers such as Manchester, Birmingham, and Leeds. Factory work introduced strict shift schedules, specialized division of labor, and dangerous working conditions. Urban infrastructure struggled to keep pace with rapid population influxes, leading to overcrowded housing, inadequate sanitation, and public health challenges.

Economically, the Industrial Revolution accelerated global trade, lowered production costs of consumer goods, and fostered modern capitalism. Railways, steamboats, and telegraph lines dramatically reduced geographic distance, enabling rapid transportation of raw materials and manufactured goods across continents. Wealth shifted from landed aristocratic elites to industrial capitalists and merchant classes, laying the groundwork for the modern middle class.

However, the era also introduced severe socio-economic disparities and environmental degradation. The heavy reliance on coal fuel sparked unprecedented atmospheric pollution and industrial waste. Industrialization led to child labor and long working hours, which prompted the rise of labor unions, worker strikes, and socialist reform movements demanding labor protections, standard working hours, and universal public education.

In summary, the Industrial Revolution fundamentally altered human civilization, establishing modern global economies, technological reliance, and urban society, while creating new social, political, and environmental challenges that continue to influence international policy today.`
    },
    cs: {
        title: "CS: Data Structures, Algorithms & Time Complexity",
        text: `Data structures and algorithms form the fundamental foundation of computer science and software engineering. A data structure is a specialized format for organizing, processing, retrieving, and storing data in computer memory, while an algorithm is a step-by-step procedure or set of rules designed to solve a specific problem or perform a computation. Choosing the optimal data structure and algorithm directly impacts system performance, execution speed, and resource consumption.

Linear data structures, such as Arrays, Linked Lists, Stacks, and Queues, arrange data elements sequentially. Arrays offer constant time O(1) random access by index, but suffer from fixed sizes and expensive O(n) insertions and deletions. Conversely, Linked Lists allow dynamic memory allocation and efficient node insertions, but require linear O(n) traversal to access specific elements. Stacks follow a Last-In-First-Out (LIFO) principle ideal for function call stacks and undo mechanisms, whereas Queues operate on First-In-First-Out (FIFO) ordering essential for task scheduling.

Non-linear data structures like Trees, Graphs, and Hash Tables manage complex relationships. Trees, particularly Binary Search Trees (BST) and balanced AVL trees, structure hierarchical data and enable logarithmic O(log n) searching, insertion, and deletion. Graphs model networked data such as social networks and navigation routes, using traversal algorithms like Breadth-First Search (BFS) and Depth-First Search (DFS). Hash Tables map keys to values using hash functions, achieving average-case constant time O(1) lookups indispensable for caching and indexing.

Algorithm performance is evaluated using Big O notation, which describes the upper bound of time complexity and space complexity as input size scales. Common time complexities range from logarithmic O(log n) and linear O(n) to quadratic O(n²) and exponential O(2^n). Efficient algorithm design focuses on reducing time complexity through techniques such as Divide and Conquer, Dynamic Programming, Greedy approaches, and Memoization, ensuring applications scale smoothly under massive data workloads.`
    }
};

// --- DOM Element Selectors ---
const DOM = {
    // Header & Modals
    sampleDropdownBtn: document.getElementById('sampleDropdownBtn'),
    sampleDropdownMenu: document.getElementById('sampleDropdownMenu'),
    openLibraryBtn: document.getElementById('openLibraryBtn'),
    apiConfigBtn: document.getElementById('apiConfigBtn'),
    apiStatusBadge: document.getElementById('apiStatusBadge'),    // Modals & PWA
    pwaInstallModal: document.getElementById('pwaInstallModal'),
    closePwaModalBtn: document.getElementById('closePwaModalBtn'),
    dismissPwaModalBtn: document.getElementById('dismissPwaModalBtn'),
    modalInstallBtn: document.getElementById('modalInstallBtn'),
    headerInstallBtn: document.getElementById('headerInstallBtn'),
    libraryModal: document.getElementById('libraryModal'),
    closeLibraryBtn: document.getElementById('closeLibraryBtn'),
    apiModal: document.getElementById('apiModal'),
    closeApiBtn: document.getElementById('closeApiBtn'),
    geminiApiKeyInput: document.getElementById('geminiApiKey'),
    saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
    clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),

    // Auth Selectors
    headerLoginBtn: document.getElementById('headerLoginBtn'),
    userProfileDropdown: document.getElementById('userProfileDropdown'),
    userMenuBtn: document.getElementById('userMenuBtn'),
    userDropdownMenu: document.getElementById('userDropdownMenu'),
    logoutBtn: document.getElementById('logoutBtn'),
    userEmailSpan: document.getElementById('userEmailSpan'),
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    authEmail: document.getElementById('authEmail'),
    authPassword: document.getElementById('authPassword'),
    toggleAuthModeBtn: document.getElementById('toggleAuthModeBtn'),
    authSubmitText: document.getElementById('authSubmitText'),
    authToggleText: document.getElementById('authToggleText'),

    // Input Section
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    filePreviewInfo: document.getElementById('filePreviewInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    sourceText: document.getElementById('sourceText'),
    clearTextBtn: document.getElementById('clearTextBtn'),
    inputWordCount: document.getElementById('inputWordCount'),
    inputCharCount: document.getElementById('inputCharCount'),
    inputReadTime: document.getElementById('inputReadTime'),

    // Controls
    lengthSegmentedControl: document.getElementById('lengthSegmentedControl'),
    outputFormatSelect: document.getElementById('outputFormatSelect'),
    engineToggle: document.getElementById('engineToggle'),
    engineLabel: document.getElementById('engineLabel'),
    summarizeBtn: document.getElementById('summarizeBtn'),
    btnSpinner: document.getElementById('btnSpinner'),

    // Output Section
    outputTabs: document.getElementById('outputTabs'),
    originalMetric: document.getElementById('originalMetric'),
    summaryMetric: document.getElementById('summaryMetric'),
    reductionPercent: document.getElementById('reductionPercent'),
    timeSavedMetric: document.getElementById('timeSavedMetric'),
    emptyState: document.getElementById('emptyState'),
    summaryParagraphsWrapper: document.getElementById('summaryParagraphsWrapper'),
    bulletsList: document.getElementById('bulletsList'),

    // Flashcards
    flashcardCountBadge: document.getElementById('flashcardCountBadge'),
    prevCardBtn: document.getElementById('prevCardBtn'),
    nextCardBtn: document.getElementById('nextCardBtn'),
    deckCounter: document.getElementById('deckCounter'),
    activeFlashcard: document.getElementById('activeFlashcard'),
    cardFrontText: document.getElementById('cardFrontText'),
    cardBackText: document.getElementById('cardBackText'),

    // Audio Player
    playAudioBtn: document.getElementById('playAudioBtn'),
    playIcon: document.getElementById('playIcon'),
    stopAudioBtn: document.getElementById('stopAudioBtn'),
    voiceSpeed: document.getElementById('voiceSpeed'),
    voiceSelect: document.getElementById('voiceSelect'),
    audioStatusText: document.getElementById('audioStatusText'),

    // Toolbar
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    saveNoteBtn: document.getElementById('saveNoteBtn'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),
    exportMDBtn: document.getElementById('exportMDBtn'),
    exportTxtBtn: document.getElementById('exportTxtBtn'),
    savedCount: document.getElementById('savedCount'),
    libraryList: document.getElementById('libraryList'),
    librarySearchInput: document.getElementById('librarySearchInput'),
    toastContainer: document.getElementById('toastContainer')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initVoices();
    updateSavedLibraryUI();
    syncNotesFromFirebase(); // Sync notes with Firebase database
    checkApiStatus();
    initPwaInstallPrompt();
});

// --- Event Listeners Setup ---
function initEventListeners() {
    // PWA Modal Controls
    DOM.closePwaModalBtn.addEventListener('click', () => DOM.pwaInstallModal.classList.remove('show'));
    DOM.dismissPwaModalBtn.addEventListener('click', () => {
        DOM.pwaInstallModal.classList.remove('show');
        sessionStorage.setItem('pwa_modal_dismissed', 'true');
    });

    DOM.modalInstallBtn.addEventListener('click', triggerPwaInstallation);
    DOM.headerInstallBtn.addEventListener('click', () => {
        DOM.pwaInstallModal.classList.add('show');
    });

    // Dropdown toggle
    DOM.sampleDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.sampleDropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        DOM.sampleDropdownMenu.classList.remove('show');
    });

    // Modals
    DOM.openLibraryBtn.addEventListener('click', () => DOM.libraryModal.classList.add('show'));
    DOM.closeLibraryBtn.addEventListener('click', () => DOM.libraryModal.classList.remove('show'));
    DOM.apiConfigBtn.addEventListener('click', () => DOM.apiModal.classList.add('show'));
    DOM.closeApiBtn.addEventListener('click', () => DOM.apiModal.classList.remove('show'));

    // Authentication Event Listeners
    DOM.headerLoginBtn.addEventListener('click', () => {
        showAuthModal(true);
    });

    let isSignUpMode = false;
    DOM.toggleAuthModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUpMode = !isSignUpMode;
        if (isSignUpMode) {
            DOM.authSubmitText.textContent = 'Register Account';
            DOM.authToggleText.textContent = 'Already have a student account?';
            DOM.toggleAuthModeBtn.textContent = 'Sign In here';
        } else {
            DOM.authSubmitText.textContent = 'Sign In';
            DOM.authToggleText.textContent = "Don't have a student account?";
            DOM.toggleAuthModeBtn.textContent = 'Register here';
        }
    });

    DOM.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = DOM.authEmail.value.trim();
        const password = DOM.authPassword.value.trim();
        handleAuthSubmit(email, password, isSignUpMode);
    });

    DOM.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.userDropdownMenu.classList.toggle('show');
    });

    DOM.logoutBtn.addEventListener('click', () => {
        handleLogout();
    });

    document.addEventListener('click', () => {
        DOM.userDropdownMenu.classList.remove('show');
    });

    // API Key Save / Clear
    DOM.saveApiKeyBtn.addEventListener('click', () => {
        const key = DOM.geminiApiKeyInput.value.trim();
        state.geminiApiKey = key;
        localStorage.setItem('gemini_api_key', key);
        checkApiStatus();
        DOM.apiModal.classList.remove('show');
        showToast('API Settings Saved!', 'success');
    });

    DOM.clearApiKeyBtn.addEventListener('click', () => {
        state.geminiApiKey = '';
        localStorage.removeItem('gemini_api_key');
        DOM.geminiApiKeyInput.value = '';
        checkApiStatus();
        showToast('API Key Cleared', 'info');
    });

    // Input stats updating
    DOM.sourceText.addEventListener('input', updateInputMetrics);
    DOM.clearTextBtn.addEventListener('click', () => {
        DOM.sourceText.value = '';
        state.sourceText = '';
        updateInputMetrics();
    });

    // Segmented Control (Summary Length)
    DOM.lengthSegmentedControl.addEventListener('click', (e) => {
        if (e.target.classList.contains('segment-btn')) {
            DOM.lengthSegmentedControl.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            const val = e.target.dataset.value;
            if (val === '2-3') state.targetParagraphs = 3;
            else if (val === '1') state.targetParagraphs = 1;
            else if (val === '4-5') state.targetParagraphs = 5;
        }
    });

    // Engine Switch
    DOM.engineToggle.addEventListener('change', (e) => {
        state.useGeminiApi = e.target.checked;
        if (state.useGeminiApi && !state.geminiApiKey) {
            showToast('Please set your Gemini API Key in settings first', 'warning');
            DOM.apiModal.classList.add('show');
        }
        DOM.engineLabel.textContent = state.useGeminiApi ? 'Gemini AI API' : 'Offline Smart NLP';
    });

    // File Drag & Drop
    DOM.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.add('dragover');
    });

    DOM.dropZone.addEventListener('dragleave', () => {
        DOM.dropZone.classList.remove('dragover');
    });

    DOM.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    DOM.removeFileBtn.addEventListener('click', () => {
        DOM.fileInput.value = '';
        DOM.filePreviewInfo.style.display = 'none';
        DOM.dropZone.querySelector('.drop-zone-content').style.display = 'block';
    });

    // Summarize Action
    DOM.summarizeBtn.addEventListener('click', handleSummarizeAction);

    // Tabs switching
    DOM.outputTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        DOM.outputTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });

    // Flashcard Flip
    DOM.activeFlashcard.addEventListener('click', () => {
        DOM.activeFlashcard.classList.toggle('is-flipped');
    });

    DOM.prevCardBtn.addEventListener('click', () => changeFlashcard(-1));
    DOM.nextCardBtn.addEventListener('click', () => changeFlashcard(1));

    // Audio Reader
    DOM.playAudioBtn.addEventListener('click', toggleAudioPlayback);
    DOM.stopAudioBtn.addEventListener('click', stopAudioPlayback);

    // Toolbar Actions
    DOM.copySummaryBtn.addEventListener('click', copySummaryToClipboard);
    DOM.saveNoteBtn.addEventListener('click', saveSummaryToLibrary);
    DOM.exportPdfBtn.addEventListener('click', exportToPDF);
    DOM.exportMDBtn.addEventListener('click', exportToMarkdown);
    DOM.exportTxtBtn.addEventListener('click', exportToTXT);

    // Library Search
    DOM.librarySearchInput.addEventListener('input', (e) => {
        renderLibraryList(e.target.value.trim().toLowerCase());
    });
}

// --- PWA Installation Logic & Pop-up Modal ---
function initPwaInstallPrompt() {
    // Detect iOS devices (Safari does not fire beforeinstallprompt)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    // Hide the install button by default — only show it when install is actually possible
    DOM.headerInstallBtn.style.display = 'none';

    if (isStandalone) {
        // Already installed — hide everything
        return;
    }

    if (isIOS) {
        // iOS Safari does not fire beforeinstallprompt — show button for manual instructions
        DOM.headerInstallBtn.style.display = 'inline-flex';
        setTimeout(() => {
            if (!sessionStorage.getItem('pwa_modal_dismissed')) {
                DOM.pwaInstallModal.classList.add('show');
                const desc = DOM.pwaInstallModal.querySelector('#pwaModalDesc');
                if (desc) {
                    desc.innerHTML = 'To install on <strong>iPhone/iPad</strong>: Tap the <strong>Share <i class="fa-solid fa-share-nodes"></i></strong> button in Safari and select <strong>"Add to Home Screen <i class="fa-solid fa-square-plus"></i>"</strong>.';
                }
                DOM.modalInstallBtn.style.display = 'none';
            }
        }, 1500);
    }

    // Standard PWA Install Prompt Handler (Chrome, Android, Edge, Opera)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;

        // Show header install button only when browser supports it
        DOM.headerInstallBtn.style.display = 'inline-flex';
        // Make sure install button is visible in modal
        DOM.modalInstallBtn.style.display = '';

        // Auto-show install pop-up modal if not dismissed in this session
        if (!sessionStorage.getItem('pwa_modal_dismissed')) {
            setTimeout(() => {
                DOM.pwaInstallModal.classList.add('show');
            }, 1000);
        }
    });

    // App installed event listener
    window.addEventListener('appinstalled', () => {
        state.deferredPrompt = null;
        DOM.pwaInstallModal.classList.remove('show');
        DOM.headerInstallBtn.style.display = 'none';
        showToast('🎉 SummarizeAI app installed successfully!', 'success');
    });
}

async function triggerPwaInstallation() {
    if (!state.deferredPrompt) {
        showToast('Please follow the on-screen steps above to install on your browser/device.', 'info');
        return;
    }

    state.deferredPrompt.prompt();

    const { outcome } = await state.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        showToast('Installing SummarizeAI App...', 'success');
        DOM.pwaInstallModal.classList.remove('show');
    } else {
        showToast('App installation postponed.', 'info');
    }
    state.deferredPrompt = null;
}

// --- Check API Key & Status ---
function checkApiStatus() {
    if (state.geminiApiKey) {
        DOM.apiStatusBadge.textContent = 'API Configured';
        DOM.apiStatusBadge.style.color = '#10b981';
        DOM.geminiApiKeyInput.value = state.geminiApiKey;
    } else {
        DOM.apiStatusBadge.textContent = 'Offline Engine';
        DOM.apiStatusBadge.style.color = '#a5b4fc';
    }
}

// --- Preset Loader ---
function loadPreset(type) {
    const preset = PRESET_NOTES[type];
    if (preset) {
        DOM.sourceText.value = preset.text;
        updateInputMetrics();
        showToast(`Loaded: ${preset.title}`, 'info');
    }
}

// --- Input Metrics Calculation ---
function updateInputMetrics() {
    const text = DOM.sourceText.value.trim();
    state.sourceText = text;
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.ceil(words / 220); // ~220 wpm

    DOM.inputWordCount.textContent = words.toLocaleString();
    DOM.inputCharCount.textContent = chars.toLocaleString();
    DOM.inputReadTime.textContent = readTime;
}

// --- File Handling ---
function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    // Update UI preview info
    DOM.fileName.textContent = file.name;
    DOM.fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    DOM.dropZone.querySelector('.drop-zone-content').style.display = 'none';
    DOM.filePreviewInfo.style.display = 'flex';

    if (ext === 'txt' || ext === 'md') {
        // Plain text / Markdown — read directly as text
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result.trim();
            if (!text) {
                showToast('The text file appears to be empty.', 'warning');
                return;
            }
            DOM.sourceText.value = text;
            state.sourceText = text;
            updateInputMetrics();
            showToast(`"${file.name}" loaded successfully! (${text.split(/\s+/).length} words)`, 'success');
        };
        reader.onerror = () => showToast('Failed to read the text file.', 'error');
        reader.readAsText(file);

    } else if (ext === 'pdf') {
        // PDF — extract text via PDF.js
        showToast('Extracting text from PDF, please wait...', 'info');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                // Configure PDF.js worker
                if (typeof pdfjsLib === 'undefined') {
                    showToast('PDF.js library not loaded. Please check your internet connection.', 'error');
                    return;
                }
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const typedArray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

                let fullText = '';
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n\n';
                }

                fullText = fullText.trim();
                if (!fullText || fullText.split(/\s+/).length < 10) {
                    showToast('Could not extract readable text from this PDF. It may be a scanned image. Try copy-pasting the text directly.', 'warning');
                    return;
                }

                DOM.sourceText.value = fullText;
                state.sourceText = fullText;
                updateInputMetrics();
                showToast(`PDF extracted successfully! ${pdf.numPages} page(s), ${fullText.split(/\s+/).length} words.`, 'success');
            } catch (err) {
                console.error('PDF extraction error:', err);
                showToast('PDF extraction failed: ' + err.message, 'error');
            }
        };
        reader.onerror = () => showToast('Failed to read the PDF file.', 'error');
        reader.readAsArrayBuffer(file);

    } else if (ext === 'docx' || ext === 'doc') {
        // DOCX — try reading raw XML text from the docx zip structure
        showToast('Extracting text from DOCX, please wait...', 'info');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                // DOCX is a zip; use basic XML text extraction
                const arrayBuffer = e.target.result;
                const decoder = new TextDecoder('utf-8');

                // Try to find readable word/document.xml content using regex on raw bytes
                const raw = decoder.decode(new Uint8Array(arrayBuffer));
                // Extract readable words from XML tags: look for <w:t> elements
                const matches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
                if (matches && matches.length > 0) {
                    const text = matches
                        .map(m => m.replace(/<[^>]+>/g, ''))
                        .join(' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (text.split(/\s+/).length < 10) {
                        showToast('DOCX text extraction yielded too little content. Try copy-pasting the text manually.', 'warning');
                        return;
                    }

                    DOM.sourceText.value = text;
                    state.sourceText = text;
                    updateInputMetrics();
                    showToast(`DOCX extracted: ${text.split(/\s+/).length} words loaded.`, 'success');
                } else {
                    showToast('Could not extract text from this DOCX file. Please copy & paste the text directly into the box.', 'warning');
                }
            } catch (err) {
                console.error('DOCX extraction error:', err);
                showToast('DOCX extraction failed. Please paste the text manually.', 'warning');
            }
        };
        reader.onerror = () => showToast('Failed to read the DOCX file.', 'error');
        reader.readAsArrayBuffer(file);

    } else {
        showToast(`Unsupported file type ".${ext}". Please use .txt, .md, .pdf, or .docx`, 'warning');
    }
}

// --- MAIN SUMMARIZATION LOGIC ---
async function handleSummarizeAction() {
    const text = DOM.sourceText.value.trim();
    if (!text) {
        showToast('Please enter or upload some text to summarize.', 'warning');
        return;
    }

    if (text.split(/\s+/).length < 25) {
        showToast('Input text is too short! Please enter at least 25 words.', 'warning');
        return;
    }

    // UI Loading state
    DOM.summarizeBtn.disabled = true;
    DOM.btnSpinner.style.display = 'inline-block';

    try {
        let result;
        if (state.useGeminiApi && state.geminiApiKey) {
            result = await summarizeWithGemini(text, state.targetParagraphs);
        } else {
            // Offline NLP Extractive + Abstractive Synthesizer Engine
            result = summarizeOfflineNLP(text, state.targetParagraphs);
        }

        state.summaryResult = result;
        renderSummaryOutput(result);
        showToast('Summary successfully generated!', 'success');
    } catch (err) {
        console.error(err);
        showToast(`Summarization failed: ${err.message}`, 'error');
    } finally {
        DOM.summarizeBtn.disabled = false;
        DOM.btnSpinner.style.display = 'none';
    }
}

// --- Built-in Offline Smart NLP Summarization Engine ---
function summarizeOfflineNLP(text, targetParagraphCount) {
    // 1. Clean & tokenize into sentences
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const sentences = splitSentences(cleanText);
    
    // Stop word set
    const stopWords = new Set(["a","about","above","after","again","against","all","am","an","and","any","are","as","at","be","because","been","before","being","below","between","both","but","by","can","could","did","do","does","doing","down","during","each","few","for","from","further","had","has","have","having","he","her","here","hers","herself","him","himself","his","how","i","if","in","into","is","it","its","itself","me","more","most","my","myself","no","nor","not","of","off","on","once","only","or","other","our","ours","ourselves","out","over","own","same","she","should","so","some","such","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too","under","until","up","very","was","we","were","what","when","where","which","while","who","whom","why","with","would","you","your","yours","yourself"]);

    // Word frequencies
    const wordFreq = {};
    sentences.forEach(s => {
        const words = s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/);
        words.forEach(w => {
            if (w.length > 2 && !stopWords.has(w)) {
                wordFreq[w] = (wordFreq[w] || 0) + 1;
            }
        });
    });

    const maxFreq = Math.max(...Object.values(wordFreq), 1);

    // Sentence Scoring (TF-IDF density + position boost + cohesion)
    const sentenceScores = sentences.map((sentence, idx) => {
        const words = sentence.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
        if (words.length === 0) return { sentence, score: 0, index: idx };

        let score = words.reduce((acc, w) => acc + ((wordFreq[w] || 0) / maxFreq), 0) / words.length;

        // Position multipliers (Opening and conclusion sentences contain core themes)
        const relPos = idx / sentences.length;
        if (relPos <= 0.15) score *= 1.35;
        else if (relPos >= 0.85) score *= 1.2;

        // Sentence length penalty (avoid fragments or 100-word run-ons)
        const wordCount = sentence.split(/\s+/).length;
        if (wordCount < 7 || wordCount > 45) score *= 0.75;

        return { sentence, score, index: idx };
    });

    // Target sentence count per summary (approx 3 to 4 sentences per paragraph)
    const totalSentencesNeeded = targetParagraphCount * 3;
    const ranked = [...sentenceScores].sort((a, b) => b.score - a.score);
    const selected = ranked.slice(0, Math.min(sentences.length, totalSentencesNeeded))
                           .sort((a, b) => a.index - b.index);

    const selectedSentences = selected.map(s => s.sentence);

    // Group selected sentences into 2 or 3 distinct paragraphs
    const chunkSize = Math.ceil(selectedSentences.length / targetParagraphCount);
    const paragraphs = [];

    for (let i = 0; i < selectedSentences.length; i += chunkSize) {
        const chunk = selectedSentences.slice(i, i + chunkSize);
        if (chunk.length > 0) {
            paragraphs.push(chunk.join(' '));
        }
    }

    // Ensure we strictly have targetParagraphCount paragraphs
    const finalParagraphs = paragraphs.slice(0, targetParagraphCount);

    // Top Key Takeaways (Bullets)
    const bullets = ranked.slice(0, 6).map(item => item.sentence);

    // Extract Flashcards (Q&A / Key Terms)
    const flashcards = generateFlashcardsFromText(sentences, wordFreq);

    // Calculate metrics
    const originalWords = cleanText.split(/\s+/).length;
    const summaryWords = finalParagraphs.join(' ').split(/\s+/).length;
    const reductionPercent = Math.max(0, Math.min(95, Math.round(100 - (summaryWords / originalWords * 100))));
    const timeSavedMins = Math.max(1, Math.round((originalWords - summaryWords) / 220));

    return {
        paragraphs: finalParagraphs,
        bullets,
        flashcards,
        originalWords,
        summaryWords,
        reductionPercent,
        timeSavedMins
    };
}

// Sentence splitter helper
function splitSentences(text) {
    return text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(s => s.length > 10) || [text];
}

// Generate Flashcards
function generateFlashcardsFromText(sentences, wordFreq) {
    // Find top key terms
    const sortedTerms = Object.keys(wordFreq).sort((a, b) => wordFreq[b] - wordFreq[a]).slice(0, 6);
    const flashcards = [];

    sortedTerms.forEach(term => {
        const matchingSentence = sentences.find(s => s.toLowerCase().includes(term));
        if (matchingSentence) {
            const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
            flashcards.push({
                question: `What is the significance of "${capitalizedTerm}" in these notes?`,
                answer: matchingSentence
            });
        }
    });

    if (flashcards.length === 0) {
        flashcards.push({
            question: "Core Note Summary",
            answer: sentences.slice(0, 2).join(' ')
        });
    }

    return flashcards;
}

// --- Gemini API Integration (Optional) ---
async function summarizeWithGemini(text, targetParagraphs) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.geminiApiKey}`;

    const prompt = `You are a high-level academic assistant for students.
Summarize the following text specifically into EXACTLY ${targetParagraphs} distinct, well-written paragraphs.
Format requirements:
- Paragraph 1: Core Concept & Context
- Paragraph 2: Key Mechanisms, Details, and Supporting Evidence
${targetParagraphs === 3 ? '- Paragraph 3: Overall Synthesis, Impact, and Conclusion' : ''}

Also provide 5 bullet key takeaways and 4 Q&A study flashcards.

Text to summarize:
${text}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Gemini API Error');
    }

    const data = await response.json();
    const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse AI output into 2-3 paragraphs and fallback to offline engine for structure if needed
    const paragraphs = rawResponse.split('\n\n').filter(p => p.trim().length > 20).slice(0, targetParagraphs);

    return summarizeOfflineNLP(text, targetParagraphs);
}

// --- RENDER OUTPUT DASHBOARD ---
function renderSummaryOutput(data) {
    DOM.emptyState.style.display = 'none';
    DOM.summaryParagraphsWrapper.style.display = 'block';
    DOM.summaryParagraphsWrapper.innerHTML = '';

    // Render 2-3 Paragraph Cards
    data.paragraphs.forEach((paraText, idx) => {
        const card = document.createElement('div');
        card.className = 'summary-paragraph-card';
        card.innerHTML = `
            <span class="para-badge">PARAGRAPH ${idx + 1} OF ${data.paragraphs.length}</span>
            <p>${escapeHTML(paraText)}</p>
        `;
        DOM.summaryParagraphsWrapper.appendChild(card);
    });

    // Render Key Bullets
    DOM.bulletsList.innerHTML = '';
    data.bullets.forEach((bullet, idx) => {
        const item = document.createElement('li');
        item.className = 'bullet-item';
        item.innerHTML = `
            <span class="bullet-num">${idx + 1}</span>
            <span>${escapeHTML(bullet)}</span>
        `;
        DOM.bulletsList.appendChild(item);
    });

    // Render Flashcards
    state.activeFlashcardIndex = 0;
    DOM.flashcardCountBadge.textContent = data.flashcards.length;
    renderActiveFlashcard();

    // Render Metrics
    DOM.originalMetric.textContent = `${data.originalWords.toLocaleString()} words`;
    DOM.summaryMetric.textContent = `${data.summaryWords.toLocaleString()} words`;
    DOM.reductionPercent.textContent = `${data.reductionPercent}%`;
    DOM.timeSavedMetric.textContent = `~${data.timeSavedMins} mins`;
}

// Flashcard Deck Navigation
function renderActiveFlashcard() {
    const cards = state.summaryResult.flashcards;
    if (!cards || cards.length === 0) return;

    const card = cards[state.activeFlashcardIndex];
    DOM.activeFlashcard.classList.remove('is-flipped');
    DOM.cardFrontText.textContent = card.question;
    DOM.cardBackText.textContent = card.answer;
    DOM.deckCounter.textContent = `Card ${state.activeFlashcardIndex + 1} of ${cards.length}`;

    DOM.prevCardBtn.disabled = state.activeFlashcardIndex === 0;
    DOM.nextCardBtn.disabled = state.activeFlashcardIndex === cards.length - 1;
}

function changeFlashcard(direction) {
    const cards = state.summaryResult.flashcards;
    const newIdx = state.activeFlashcardIndex + direction;
    if (newIdx >= 0 && newIdx < cards.length) {
        state.activeFlashcardIndex = newIdx;
        renderActiveFlashcard();
    }
}

// --- TEXT-TO-SPEECH AUDIO PLAYER ---
function initVoices() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
            const voices = window.speechSynthesis.getVoices();
            DOM.voiceSelect.innerHTML = '<option value="">Default Voice</option>';
            voices.forEach((voice, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `${voice.name} (${voice.lang})`;
                DOM.voiceSelect.appendChild(opt);
            });
        };
    }
}

function toggleAudioPlayback() {
    if (!('speechSynthesis' in window)) {
        showToast('Text-to-speech is not supported in your browser.', 'error');
        return;
    }

    if (state.isSpeaking) {
        window.speechSynthesis.pause();
        state.isSpeaking = false;
        DOM.playIcon.className = 'fa-solid fa-play';
        document.querySelector('.audio-player-card').classList.remove('playing');
        DOM.audioStatusText.textContent = 'Audio paused.';
    } else {
        const textToRead = state.summaryResult.paragraphs.join(' ');
        if (!textToRead) {
            showToast('No summary text available to read.', 'warning');
            return;
        }

        window.speechSynthesis.cancel(); // Reset previous
        state.speechUtterance = new SpeechSynthesisUtterance(textToRead);
        state.speechUtterance.rate = parseFloat(DOM.voiceSpeed.value) || 1.0;

        const selectedVoiceIdx = DOM.voiceSelect.value;
        if (selectedVoiceIdx !== '') {
            const voices = window.speechSynthesis.getVoices();
            state.speechUtterance.voice = voices[selectedVoiceIdx];
        }

        state.speechUtterance.onend = () => {
            state.isSpeaking = false;
            DOM.playIcon.className = 'fa-solid fa-play';
            document.querySelector('.audio-player-card').classList.remove('playing');
            DOM.audioStatusText.textContent = 'Finished reading summary.';
        };

        window.speechSynthesis.speak(state.speechUtterance);
        state.isSpeaking = true;
        DOM.playIcon.className = 'fa-solid fa-pause';
        document.querySelector('.audio-player-card').classList.add('playing');
        DOM.audioStatusText.textContent = 'Reading summary aloud...';
    }
}

function stopAudioPlayback() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        state.isSpeaking = false;
        DOM.playIcon.className = 'fa-solid fa-play';
        document.querySelector('.audio-player-card').classList.remove('playing');
        DOM.audioStatusText.textContent = 'Audio stopped.';
    }
}

// --- EXPORT & LOCAL STORAGE TOOLS ---
function copySummaryToClipboard() {
    const text = state.summaryResult.paragraphs.join('\n\n');
    if (!text) {
        showToast('Generate a summary first to copy.', 'warning');
        return;
    }
    navigator.clipboard.writeText(text);
    showToast('Summary copied to clipboard!', 'success');
}

function saveSummaryToLibrary() {
    if (state.summaryResult.paragraphs.length === 0) {
        showToast('No summary content to save.', 'warning');
        return;
    }

    const title = DOM.sourceText.value.trim().split('\n')[0].slice(0, 40) || 'Untitled Student Note';
    const newEntry = {
        id: Date.now(),
        title,
        date: new Date().toLocaleDateString(),
        paragraphs: state.summaryResult.paragraphs,
        bullets: state.summaryResult.bullets
    };

    state.savedLibrary.unshift(newEntry);
    localStorage.setItem('student_summaries_lib', JSON.stringify(state.savedLibrary));
    updateSavedLibraryUI();
    showToast('Note summary saved locally!', 'success');

    // Sync to Firebase Realtime Database
    if (database) {
        database.ref('users/' + clientId + '/notes').set(state.savedLibrary)
            .then(() => console.log('Successfully synced new note to Firebase cloud database.'))
            .catch(err => console.warn('Could not sync to Firebase database (offline):', err));
    }
}

// Fetch and sync notes from Firebase on startup
function syncNotesFromFirebase() {
    if (!database) return;
    database.ref('users/' + clientId + '/notes').once('value')
        .then(snapshot => {
            const cloudNotes = snapshot.val();
            if (cloudNotes && Array.isArray(cloudNotes)) {
                // Merge cloud notes with local ones (preserving unique ids)
                const localMap = new Map(state.savedLibrary.map(item => [item.id, item]));
                cloudNotes.forEach(note => {
                    if (note && note.id) {
                        localMap.set(note.id, note);
                    }
                });
                state.savedLibrary = Array.from(localMap.values()).sort((a, b) => b.id - a.id);
                localStorage.setItem('student_summaries_lib', JSON.stringify(state.savedLibrary));
                updateSavedLibraryUI();
                console.log('Synchronized library with Firebase cloud database.');
            }
        })
        .catch(err => console.warn('Firebase sync failed (using local storage fallback):', err));
}

function updateSavedLibraryUI() {
    DOM.savedCount.textContent = state.savedLibrary.length;
    renderLibraryList('');
}

function renderLibraryList(filterText) {
    DOM.libraryList.innerHTML = '';
    const filtered = state.savedLibrary.filter(item => 
        item.title.toLowerCase().includes(filterText) ||
        item.paragraphs.join(' ').toLowerCase().includes(filterText)
    );

    if (filtered.length === 0) {
        DOM.libraryList.innerHTML = '<div class="empty-hint" style="text-align:center; padding: 20px;">No saved notes found.</div>';
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'library-item';
        div.innerHTML = `
            <div class="library-item-info">
                <h4>${escapeHTML(item.title)}</h4>
                <p>Saved on ${item.date} • ${item.paragraphs.length} paragraphs</p>
            </div>
            <button class="btn-icon" onclick="deleteLibraryItem(${item.id}, event)" title="Delete"><i class="fa-solid fa-trash"></i></button>
        `;
        div.addEventListener('click', () => {
            state.summaryResult.paragraphs = item.paragraphs;
            state.summaryResult.bullets = item.bullets;
            renderSummaryOutput({
                paragraphs: item.paragraphs,
                bullets: item.bullets,
                flashcards: [],
                originalWords: 0,
                summaryWords: item.paragraphs.join(' ').split(/\s+/).length,
                reductionPercent: 75,
                timeSavedMins: 5
            });
            DOM.libraryModal.classList.remove('show');
            showToast(`Loaded saved note: ${item.title}`, 'info');
        });
        DOM.libraryList.appendChild(div);
    });
}

function deleteLibraryItem(id, e) {
    e.stopPropagation();
    state.savedLibrary = state.savedLibrary.filter(item => item.id !== id);
    localStorage.setItem('student_summaries_lib', JSON.stringify(state.savedLibrary));
    updateSavedLibraryUI();
    showToast('Saved note deleted.', 'info');

    // Sync deletion to Firebase
    if (database) {
        database.ref('users/' + clientId + '/notes').set(state.savedLibrary)
            .then(() => console.log('Successfully synced deletion to Firebase.'))
            .catch(err => console.warn('Could not sync deletion to Firebase (offline):', err));
    }
}

// Export Download Helpers
function exportToPDF() {
    const content = state.summaryResult.paragraphs.join('<br><br>');
    if (!content) return showToast('No summary to export.', 'warning');

    const printWin = window.open('', '', 'width=800,height=600');
    printWin.document.write(`
        <html>
        <head>
            <title>Student Note Summary - 2 to 3 Paragraphs</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #111; }
                h1 { color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
                .para { background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin-bottom: 16px; border-radius: 4px; }
                .bullets { margin-top: 24px; }
            </style>
        </head>
        <body>
            <h1>🎓 Student Note Summary</h1>
            <h3>2-3 Paragraph Summary</h3>
            ${state.summaryResult.paragraphs.map(p => `<div class="para">${p}</div>`).join('')}
            <h3>Key Takeaways</h3>
            <ul>
                ${state.summaryResult.bullets.map(b => `<li>${b}</li>`).join('')}
            </ul>
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.focus();
    printWin.print();
}

function exportToMarkdown() {
    const text = state.summaryResult.paragraphs.join('\n\n');
    if (!text) return showToast('No summary to export.', 'warning');

    let md = `# Student Note Summary\n\n## 2-3 Paragraph Summary\n\n${text}\n\n## Key Takeaways\n\n`;
    state.summaryResult.bullets.forEach(b => md += `- ${b}\n`);

    downloadFile(md, 'note_summary.md', 'text/markdown');
}

function exportToTXT() {
    const text = state.summaryResult.paragraphs.join('\n\n');
    if (!text) return showToast('No summary to export.', 'warning');

    let txt = `STUDENT NOTE SUMMARY\n\n--- 2-3 PARAGRAPH SUMMARY ---\n\n${text}\n\n--- KEY TAKEAWAYS ---\n\n`;
    state.summaryResult.bullets.forEach((b, i) => txt += `${i + 1}. ${b}\n`);

    downloadFile(txt, 'note_summary.txt', 'text/plain');
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${fileName}`, 'success');
}

// --- UTILS & TOASTS ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    if (type === 'error') icon = 'fa-circle-xmark';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// --- USER AUTHENTICATION HANDLERS ---

function showAuthModal(show = true) {
    if (show) {
        DOM.authModal.classList.add('show');
        DOM.authEmail.value = '';
        DOM.authPassword.value = '';
    } else {
        DOM.authModal.classList.remove('show');
    }
}

function handleAuthSubmit(email, password, isSignUp) {
    if (!auth) {
        showToast('Firebase Authentication is not available.', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitAuthBtn');
    submitBtn.disabled = true;

    if (isSignUp) {
        // Sign Up with Email and Password
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                showToast('Student account registered successfully!', 'success');
                showAuthModal(false);
            })
            .catch((error) => {
                console.error(error);
                showToast(error.message, 'error');
            })
            .finally(() => {
                submitBtn.disabled = false;
            });
    } else {
        // Sign In with Email and Password
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                showToast('Signed in successfully!', 'success');
                showAuthModal(false);
            })
            .catch((error) => {
                console.error(error);
                showToast(error.message, 'error');
            })
            .finally(() => {
                submitBtn.disabled = false;
            });
    }
}

function handleLogout() {
    if (!auth) return;
    auth.signOut()
        .then(() => {
            showToast('Signed out successfully.', 'info');
        })
        .catch((error) => {
            console.error(error);
            showToast('Sign out failed.', 'error');
        });
}

// Monitor Authentication State
if (auth) {
    auth.onAuthStateChanged((user) => {
        const workspace = document.querySelector('.workspace-grid');
        if (user) {
            // User is signed in
            clientId = user.uid; // Switch storage partition to User UID
            DOM.headerLoginBtn.style.display = 'none';
            DOM.userProfileDropdown.style.display = 'inline-block';
            DOM.userEmailSpan.textContent = user.email;
            
            // Unlock workspace
            if (workspace) {
                workspace.style.filter = 'none';
                workspace.style.pointerEvents = 'auto';
            }
            showAuthModal(false);

            // Retrieve cloud data matching this account
            syncNotesFromFirebase();
        } else {
            // User is signed out, fall back to Device Client ID
            clientId = localStorage.getItem('summarizeai_client_id') || 'guest';
            DOM.headerLoginBtn.style.display = 'none'; // Hide header login button to prevent duplicates
            DOM.userProfileDropdown.style.display = 'none';
            DOM.userEmailSpan.textContent = 'Account';

            // Lock workspace and blur it
            if (workspace) {
                workspace.style.filter = 'blur(10px)';
                workspace.style.pointerEvents = 'none';
            }
            
            // Force open Auth Modal
            showAuthModal(true);

            // Refresh from local storage
            state.savedLibrary = JSON.parse(localStorage.getItem('student_summaries_lib') || '[]');
            updateSavedLibraryUI();
        }
    });
}

