// 1. IMPORT FIREBASE MODULES
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAnxIsftWdUxtHEh7nxX1UPRA29c0n1444",
    authDomain: "quiz-master-3e489.firebaseapp.com",
    projectId: "quiz-master-3e489",
    storageBucket: "quiz-master-3e489.firebasestorage.app",
    messagingSenderId: "741393992507",
    appId: "1:741393992507:web:b28cd8fcda2b74f85b851e"
};

// 3. INITIALIZATION
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. UTILITY & DOM HELPERS
const $ = (id) => document.getElementById(id);

function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.backgroundColor = type === 'error' ? 'var(--danger)' : (type === 'success' ? 'var(--success)' : '#333');
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function shuffleArray(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 5. GLOBAL STATE
let globalQuizzes = [];
let currentQuizData = null;
let currentQuestions = [];
let studentAnswers = {};
let currentQIndex = 0;
let mainTimerInterval = null;
let perQTimerInterval = null;
let mainSecondsLeft = 0;
let perQSecondsLeft = 0;
let studentProfile = { name: '', place: '' };
let csvParsedQuestions = [];

// 6. INITIALIZATION & ROUTING
window.addEventListener('load', async () => {
    initTheme();
    loadLocalProfiles();
    attachEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('quiz');

    if (quizId) {
        // Direct link to play a quiz
        $('librarySection').classList.add('hidden');
        await fetchAndStartSharedQuiz(quizId);
    } else {
        await loadLibraryFromCloud();
    }
});

function initTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

function loadLocalProfiles() {
    const cName = localStorage.getItem('creatorName');
    const cEmail = localStorage.getItem('creatorEmail');
    const tWa = localStorage.getItem('teacherWhatsapp');
    if (cName) $('creatorName').value = cName;
    if (cEmail) $('creatorEmail').value = cEmail;
    if (tWa) $('teacherWhatsapp').value = tWa;
}

function saveLocalProfiles() {
    localStorage.setItem('creatorName', $('creatorName').value.trim());
    localStorage.setItem('creatorEmail', $('creatorEmail').value.trim());
    localStorage.setItem('teacherWhatsapp', $('teacherWhatsapp').value.trim());
}

// 7. EVENT LISTENERS SETUP
function attachEventListeners() {
    // Top bar actions
    $('themeToggleBtn').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    $('toggleCreatorBtn').addEventListener('click', () => {
        $('librarySection').classList.toggle('hidden');
        $('creatorPanel').classList.toggle('hidden');
    });

    $('closeCreatorBtn').addEventListener('click', () => {
        $('creatorPanel').classList.add('hidden');
        $('librarySection').classList.remove('hidden');
        loadLibraryFromCloud(); // Refresh
    });

    // Library Filters
    $('libSearch').addEventListener('input', renderLibraryGrid);
    $('filterSubject').addEventListener('change', renderLibraryGrid);
    $('filterClass').addEventListener('change', renderLibraryGrid);

    // Creator Actions
    $('createManualBtn').addEventListener('click', () => {
        $('manualSection').classList.remove('hidden');
        $('csvPreview').classList.add('hidden');
        if ($('manualTable').getElementsByTagName('tbody')[0].children.length === 0) {
            addManualRow();
        }
    });

    $('addRowBtn').addEventListener('click', addManualRow);
    $('startQuizBtn_manual').addEventListener('click', () => testQuizLocally('manual'));
    $('saveToLibraryBtn').addEventListener('click', () => publishQuizToCloud('manual'));

    // CSV Actions
    $('loadCSVBtn').addEventListener('click', () => $('csvFileInput').click());
    $('csvFileInput').addEventListener('change', handleCSVUpload);
    $('startQuizBtn_csv').addEventListener('click', () => testQuizLocally('csv'));
    $('saveCsvToLibBtn').addEventListener('click', () => publishQuizToCloud('csv'));

    // Student Modals & Actions
    $('startStudentQuizBtn').addEventListener('click', beginQuizEngine);
    
    // Quiz Engine Navigation
    $('prevBtn').addEventListener('click', () => navigateQuestion(-1));
    $('nextBtn').addEventListener('click', () => navigateQuestion(1));
    $('finishBtn').addEventListener('click', () => confirmFinishQuiz());

    // Review Actions
    $('printPdfBtn').addEventListener('click', () => window.print());
    $('homeBtn_review').addEventListener('click', () => window.location.href = window.location.pathname);
    $('submitWhatsappBtn').addEventListener('click', sendResultViaWhatsApp);
    $('submitEmailBtn').addEventListener('click', sendResultViaEmail);

    // Share Modal
    $('closeShareBtn').addEventListener('click', () => $('shareModal').classList.add('hidden'));
    $('copyLinkBtn').addEventListener('click', () => {
        $('shareLinkInput').select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    });
    $('shareQuizBtn').addEventListener('click', () => {
        showToast('Please publish to cloud first to get a share link.', 'warning');
    });
}

// 8. CLOUD LIBRARY MANAGEMENT
async function loadLibraryFromCloud() {
    const libCount = $("libCount");
    if (!libCount) return;
    libCount.textContent = "Fetching library...";
    
    try {
        const querySnapshot = await getDocs(collection(db, "quizzes"));
        globalQuizzes = [];
        let subjects = new Set();
        let classes = new Set();

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            globalQuizzes.push({ id: doc.id, ...data });
            if (data.metaSubject) subjects.add(data.metaSubject);
            if (data.metaClass) classes.add(data.metaClass);
        });

        // Populate filters
        populateDropdown('filterSubject', subjects, 'All Subjects');
        populateDropdown('filterClass', classes, 'All Classes');

        libCount.textContent = `${globalQuizzes.length} Quizzes Available`;
        renderLibraryGrid();
        
    } catch (error) {
        console.error("Database Error:", error);
        showToast("Error loading cloud library", "error");
        libCount.textContent = "Error loading";
    }
}

function populateDropdown(id, itemsSet, defaultText) {
    const select = $(id);
    select.innerHTML = `<option value="all">${defaultText}</option>`;
    Array.from(itemsSet).sort().forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
    });
}

function renderLibraryGrid() {
    const grid = $('libraryGrid');
    const searchTerm = $('libSearch').value.toLowerCase();
    const filterSub = $('filterSubject').value;
    const filterCls = $('filterClass').value;

    grid.innerHTML = '';

    const filtered = globalQuizzes.filter(q => {
        const matchesSearch = (q.metaExam || '').toLowerCase().includes(searchTerm) || 
                              (q.metaTopic || '').toLowerCase().includes(searchTerm) ||
                              (q.creatorName || '').toLowerCase().includes(searchTerm);
        const matchesSub = filterSub === 'all' || q.metaSubject === filterSub;
        const matchesCls = filterCls === 'all' || q.metaClass === filterCls;
        return matchesSearch && matchesSub && matchesCls;
    }).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); // Newest first

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 20px; color: var(--text-light);">No quizzes found matching filters.</div>';
        return;
    }

    filtered.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <span class="card-badge" style="background:var(--primary)">${quiz.metaClass || 'N/A'} - ${quiz.metaSubject || 'N/A'}</span>
                <span class="card-badge" style="background:var(--accent)">${quiz.questions?.length || 0} Qs</span>
            </div>
            <h4 class="card-title">${quiz.metaExam || 'Untitled Exam'}</h4>
            <div class="card-sub">Topic: ${quiz.metaTopic || 'N/A'}</div>
            <div class="card-sub">By: ${quiz.creatorName || 'Unknown'}</div>
            <div style="display:flex; gap:5px; margin-top:10px;">
                <button class="btn-sm btn-primary" onclick="window.playQuiz('${quiz.id}')"><i class="ri-play-fill"></i> Play</button>
                <button class="btn-sm btn-secondary" onclick="window.shareExistingQuiz('${quiz.id}')"><i class="ri-share-line"></i></button>
                <button class="btn-sm btn-secondary" onclick="window.deleteQuiz('${quiz.id}', '${quiz.creatorPassword}')" style="color:var(--danger);"><i class="ri-delete-bin-line"></i></button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Global exposure for dynamically created buttons
window.playQuiz = async (quizId) => {
    $('librarySection').classList.add('hidden');
    await fetchAndStartSharedQuiz(quizId);
};

window.shareExistingQuiz = (quizId) => {
    const link = `${window.location.origin}${window.location.pathname}?quiz=${quizId}`;
    $('shareLinkInput').value = link;
    $('shareModal').classList.remove('hidden');
};

window.deleteQuiz = async (quizId, correctPwd) => {
    const pwd = prompt("Enter the Creator Password to delete this quiz:");
    if (!pwd) return;
    if (pwd !== correctPwd) {
        showToast("Incorrect password!", "error");
        return;
    }
    
    if (confirm("Are you sure you want to permanently delete this quiz?")) {
        try {
            await deleteDoc(doc(db, "quizzes", quizId));
            showToast("Quiz deleted successfully.", "success");
            loadLibraryFromCloud();
        } catch (e) {
            showToast("Error deleting quiz.", "error");
        }
    }
};

// 9. CREATOR STUDIO & DATA GATHERING
function getMetadata() {
    return {
        creatorName: $('creatorName').value.trim(),
        creatorPassword: $('creatorPassword').value.trim(),
        creatorEmail: $('creatorEmail').value.trim(),
        metaExam: $('metaExam').value.trim(),
        metaSubject: $('metaSubject').value.trim(),
        metaClass: $('metaClass').value.trim(),
        metaTopic: $('metaTopic').value.trim(),
        totalMinutes: Number($('totalMinutes').value) || 0,
        totalMarks: Number($('totalMarks').value) || 100,
        perQuestionSeconds: Number($('perQuestionSeconds').value) || 0,
        minPassMarks: Number($('minPassMarks').value) || 40,
        shuffleQuestions: $('shuffleQuestions').checked,
        teacherWhatsapp: $('teacherWhatsapp').value.trim()
    };
}

function validateMetadata(meta) {
    if (!meta.creatorName || !meta.creatorPassword || !meta.metaExam) {
        showToast("Creator Name, Password, and Exam Name are required.", "error");
        return false;
    }
    return true;
}

// 10. MANUAL EDITOR
function addManualRow() {
    const tbody = $('manualTable').getElementsByTagName('tbody')[0];
    const rowCount = tbody.children.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${rowCount}</td>
        <td><input type="text" class="q-val" placeholder="Question HTML allowed"></td>
        <td><input type="text" class="opt-a" placeholder="Opt A"></td>
        <td><input type="text" class="opt-b" placeholder="Opt B"></td>
        <td><input type="text" class="opt-c" placeholder="Opt C"></td>
        <td><input type="text" class="opt-d" placeholder="Opt D"></td>
        <td><input type="text" class="ans-val" placeholder="Exact Ans Text"></td>
        <td><button class="btn-icon" style="color:var(--danger);" onclick="this.closest('tr').remove()"><i class="ri-close-line"></i></button></td>
    `;
    tbody.appendChild(tr);
}

function extractManualQuestions() {
    const rows = $('manualTable').getElementsByTagName('tbody')[0].children;
    let questions = [];
    for (let i = 0; i < rows.length; i++) {
        const q = rows[i].querySelector('.q-val').value.trim();
        const a = rows[i].querySelector('.opt-a').value.trim();
        const b = rows[i].querySelector('.opt-b').value.trim();
        const c = rows[i].querySelector('.opt-c').value.trim();
        const d = rows[i].querySelector('.opt-d').value.trim();
        const ans = rows[i].querySelector('.ans-val').value.trim();

        if (q && ans) {
            questions.push({
                text: q,
                options: [a, b, c, d].filter(Boolean),
                answer: ans
            });
        }
    }
    return questions;
}

// 11. CSV PARSER
function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        parseAndPreviewCSV(text);
    };
    reader.readAsText(file, 'UTF-8');
}

function parseAndPreviewCSV(csvText) {
    // Basic CSV parser handling quotes
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (inQuotes) {
            if (char === '"') {
                if (csvText[i + 1] === '"') { currentCell += '"'; i++; } // Escaped quote
                else { inQuotes = false; }
            } else { currentCell += char; }
        } else {
            if (char === '"') { inQuotes = true; }
            else if (char === ',') { currentRow.push(currentCell.trim()); currentCell = ''; }
            else if (char === '\n' || char === '\r') {
                currentRow.push(currentCell.trim());
                if (currentRow.some(c => c)) rows.push(currentRow); // Skip entirely empty rows
                currentRow = []; currentCell = '';
                if (char === '\r' && csvText[i + 1] === '\n') i++; // Skip Windows CRLF
            } else { currentCell += char; }
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }

    // Process rows to Questions
    csvParsedQuestions = [];
    let htmlPreview = `<table><thead><tr><th>#</th><th>Question</th><th>Options</th><th>Answer</th></tr></thead><tbody>`;
    
    // Assume Header row exists if first row contains "Question"
    let startIndex = rows[0].join('').toLowerCase().includes('question') ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < 3) continue; // Need at least Q, 1 Opt, Ans
        
        const qText = r[0];
        const ansText = r[r.length - 1]; // Assume last column is exact answer
        const options = r.slice(1, r.length - 1).filter(Boolean);

        if (qText && ansText) {
            csvParsedQuestions.push({ text: qText, options: options, answer: ansText });
            htmlPreview += `<tr>
                <td>${csvParsedQuestions.length}</td>
                <td>${qText}</td>
                <td>${options.join(' | ')}</td>
                <td><b>${ansText}</b></td>
            </tr>`;
        }
    }
    htmlPreview += `</tbody></table>`;
    
    if (csvParsedQuestions.length > 0) {
        $('csvTableContainer').innerHTML = htmlPreview;
        $('manualSection').classList.add('hidden');
        $('csvPreview').classList.remove('hidden');
        showToast(`Successfully parsed ${csvParsedQuestions.length} questions.`, 'success');
    } else {
        showToast(`Failed to parse CSV. Ensure columns: Question, OptA, OptB..., Answer`, 'error');
    }
}

// 12. PUBLISH & TEST MECHANICS
async function publishQuizToCloud(source) {
    const meta = getMetadata();
    if (!validateMetadata(meta)) return;

    let questions = source === 'manual' ? extractManualQuestions() : csvParsedQuestions;
    if (questions.length === 0) {
        showToast("No valid questions found to publish.", "error");
        return;
    }

    saveLocalProfiles();
    const btn = source === 'manual' ? $('saveToLibraryBtn') : $('saveCsvToLibBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = "Publishing...";
    btn.disabled = true;

    const quizPayload = {
        ...meta,
        questions: questions,
        createdAt: serverTimestamp()
    };

    try {
        const docRef = await addDoc(collection(db, "quizzes"), quizPayload);
        showToast("Quiz Published to Cloud!", "success");
        $('creatorPanel').classList.add('hidden');
        $('librarySection').classList.remove('hidden');
        
        // Setup Share Link directly
        window.shareExistingQuiz(docRef.id);
        loadLibraryFromCloud();
    } catch (e) {
        console.error(e);
        showToast("Error publishing quiz", "error");
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

function testQuizLocally(source) {
    const meta = getMetadata();
    let questions = source === 'manual' ? extractManualQuestions() : csvParsedQuestions;
    
    if (questions.length === 0) {
        showToast("Add questions to test.", "error");
        return;
    }

    currentQuizData = { ...meta, questions: questions };
    $('creatorPanel').classList.add('hidden');
    // Add this single line before you render the first question
if (window.EnterpriseModule) {
    window.EnterpriseModule.applyRandomizationIfEnabled(currentQuizData);
}
    
    // Automatically fill test info
    $('studentName').value = "Creator Test";
    $('studentPlace').value = "Studio";
    $('studentLoginModal').classList.remove('hidden');
}


// 13. QUIZ ENGINE - FETCH & LOGIN
async function fetchAndStartSharedQuiz(quizId) {
    try {
        const docRef = doc(db, "quizzes", quizId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            currentQuizData = docSnap.data();
            currentQuizData.id = docSnap.id;
            $('studentLoginModal').classList.remove('hidden');
        } else {
            showToast("Quiz not found or deleted.", "error");
            $('librarySection').classList.remove('hidden');
        }
    } catch (error) {
        showToast("Error fetching quiz link.", "error");
    }
}

function beginQuizEngine() {
    const sName = $('studentName').value.trim();
    const sPlace = $('studentPlace').value.trim();
    
    if (!sName) {
        showToast("Please enter your name.", "warning");
        return;
    }

    studentProfile = { name: sName, place: sPlace || 'Unknown' };
    $('dispName').textContent = sName;
    $('dispPlace').textContent = studentProfile.place;
    $('studentInfoDisplay').classList.remove('hidden');

    $('studentLoginModal').classList.add('hidden');
    $('librarySection').classList.add('hidden');
    $('appContainer').style.paddingBottom = "0"; // remove container padding for full screen quiz

    startQuizEnvironment();
}

// 14. QUIZ ENVIRONMENT & LOGIC
function startQuizEnvironment() {
    $('quizSection').classList.remove('hidden');
    
    // Prepare Questions
    currentQuestions = JSON.parse(JSON.stringify(currentQuizData.questions)); // Deep copy
    if (currentQuizData.shuffleQuestions) {
        currentQuestions = shuffleArray(currentQuestions);
    }
    
    studentAnswers = {}; // Reset answers
    currentQIndex = 0;

    // Start Main Timer
    if (currentQuizData.totalMinutes > 0) {
        mainSecondsLeft = currentQuizData.totalMinutes * 60;
        updateTimerDisplay('mainTimerLabel', mainSecondsLeft);
        mainTimerInterval = setInterval(() => {
            mainSecondsLeft--;
            updateTimerDisplay('mainTimerLabel', mainSecondsLeft);
            if (mainSecondsLeft <= 0) autoSubmitQuiz();
        }, 1000);
    } else {
        $('mainTimerLabel').textContent = "Unlimited Time";
    }

    renderCurrentQuestion();
}

function renderCurrentQuestion() {
    if (currentQIndex < 0) currentQIndex = 0;
    if (currentQIndex >= currentQuestions.length) currentQIndex = currentQuestions.length - 1;

    const qData = currentQuestions[currentQIndex];
    
    // UI Progress
    $('questionProgressLabel').textContent = `Q ${currentQIndex + 1}/${currentQuestions.length}`;
    const percent = ((currentQIndex + 1) / currentQuestions.length) * 100;
    $('progressBarFill').style.width = `${percent}%`;
    calculateLiveScore();

    // Render Question HTML
    $('questionBox').innerHTML = qData.text;

    // Render Options
    const optBox = $('optionsBox');
    optBox.innerHTML = '';
    
    let optionsToRender = [...qData.options];
    if (currentQuizData.shuffleQuestions) {
        optionsToRender = shuffleArray(optionsToRender); // Shuffle options per view
    }

    optionsToRender.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        
        // Assign letters A, B, C, D...
        const letter = String.fromCharCode(65 + index);
        btn.innerHTML = `<span style="font-weight:bold; width:24px;">${letter}.</span> <span>${optText}</span>`;
        
        if (studentAnswers[currentQIndex] === optText) {
            btn.style.borderColor = 'var(--primary)';
            btn.style.background = 'var(--bg-body)';
        }

        btn.onclick = () => selectOption(optText);
        optBox.appendChild(btn);
    });

    // Handle Per Question Timer
    clearInterval(perQTimerInterval);
    const perQBadge = $('timerPerQ');
    if (currentQuizData.perQuestionSeconds > 0) {
        perQBadge.classList.remove('hidden');
        perQSecondsLeft = currentQuizData.perQuestionSeconds;
        perQBadge.textContent = `${perQSecondsLeft}s`;
        perQBadge.style.color = "inherit";

        perQTimerInterval = setInterval(() => {
            perQSecondsLeft--;
            perQBadge.textContent = `${perQSecondsLeft}s`;
            if (perQSecondsLeft <= 5) perQBadge.style.color = "var(--danger)";
            if (perQSecondsLeft <= 0) {
                clearInterval(perQTimerInterval);
                navigateQuestion(1); // Force next
            }
        }, 1000);
    } else {
        perQBadge.classList.add('hidden');
    }

    // Nav Buttons logic
    $('prevBtn').disabled = currentQIndex === 0;
    
    if (currentQIndex === currentQuestions.length - 1) {
        $('nextBtn').classList.add('hidden');
        $('finishBtn').classList.remove('hidden');
    } else {
        $('nextBtn').classList.remove('hidden');
        $('finishBtn').classList.add('hidden');
    }
}

function selectOption(selectedText) {
    studentAnswers[currentQIndex] = selectedText;
    renderCurrentQuestion(); // re-render to highlight selection
}

function navigateQuestion(step) {
    currentQIndex += step;
    
    if (currentQIndex >= currentQuestions.length) {
        currentQIndex = currentQuestions.length - 1;
        confirmFinishQuiz();
    } else {
        renderCurrentQuestion();
    }
}

function updateTimerDisplay(id, totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    const el = $(id);
    el.textContent = `${m}:${s}`;
    if (totalSeconds <= 60 && el.parentElement.classList.contains('timer-badge')) {
        el.parentElement.style.animation = 'pulse 1s infinite';
    }
}

function calculateLiveScore() {
    let correctCount = 0;
    for (let i = 0; i < currentQuestions.length; i++) {
        if (studentAnswers[i] && studentAnswers[i] === currentQuestions[i].answer) {
            correctCount++;
        }
    }
    const marksPerQ = currentQuizData.totalMarks / currentQuestions.length;
    $('liveScore').textContent = `Score: ${(correctCount * marksPerQ).toFixed(1)}`;
}

// 15. SUBMISSION & REVIEW
function confirmFinishQuiz() {
    if (confirm("Are you sure you want to submit the quiz?")) {
        autoSubmitQuiz();
    }
}

function autoSubmitQuiz() {
    clearInterval(mainTimerInterval);
    clearInterval(perQTimerInterval);
    $('quizSection').classList.add('hidden');
    $('studentInfoDisplay').classList.add('hidden');
    $('appContainer').style.paddingBottom = "80px"; // restore padding
    
    generateReport();
}

function generateReport() {
    $('reviewSection').classList.remove('hidden');

    const totalQ = currentQuestions.length;
    const marksPerQ = currentQuizData.totalMarks / totalQ;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    let reviewHtml = `<div class="review-list-container">
        <div class="report-header">
            <div class="report-meta-grid">
                <div><b>Student:</b> ${studentProfile.name} (${studentProfile.place})</div>
                <div><b>Exam:</b> ${currentQuizData.metaExam || 'N/A'}</div>
                <div><b>Subject:</b> ${currentQuizData.metaSubject || 'N/A'}</div>
                <div><b>Date:</b> ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="report-score-box">
                <div class="score-item"><span class="score-lbl">Total Qs</span><span class="score-val">${totalQ}</span></div>
                <div class="score-item"><span class="score-lbl">Correct</span><span class="score-val" style="color:var(--success)" id="rcCount">0</span></div>
                <div class="score-item"><span class="score-lbl">Wrong</span><span class="score-val" style="color:var(--danger)" id="rwCount">0</span></div>
                <div class="score-item"><span class="score-lbl">Skipped</span><span class="score-val" id="rsCount">0</span></div>
            </div>
        </div>
    `;

    currentQuestions.forEach((q, i) => {
        const sAns = studentAnswers[i];
        const isCorrect = sAns === q.answer;
        const isSkipped = !sAns;

        if (isCorrect) correctCount++;
        else if (isSkipped) skippedCount++;
        else wrongCount++;

        let boxClass = isCorrect ? 'correct-ans' : (isSkipped ? 'skipped-ans' : 'wrong-ans');
        let icon = isCorrect ? '✅' : (isSkipped ? '⏭️' : '❌');

        reviewHtml += `
            <div class="review-card">
                <div class="review-q-row">
                    <span class="q-num">${i + 1}.</span>
                    <div>${q.text}</div>
                </div>
                <div class="review-ans-row">
                    <div class="ans-box ${boxClass}">
                        <span class="ans-label">Your Answer:</span>
                        <span class="ans-val">${icon} ${sAns || 'Not Answered'}</span>
                    </div>
                    <div class="ans-box" style="background:var(--secondary);">
                        <span class="ans-label">Correct Answer:</span>
                        <span class="ans-val" style="color:var(--primary)">${q.answer}</span>
                    </div>
                </div>
            </div>
        `;
    });

    reviewHtml += `</div>`;
    $('reviewTableContainer').innerHTML = reviewHtml;

    // Update Totals
    const finalScore = (correctCount * marksPerQ).toFixed(1);
    $('finalScoreDisplay').textContent = finalScore;
    $('rcCount').textContent = correctCount;
    $('rwCount').textContent = wrongCount;
    $('rsCount').textContent = skippedCount;

    const pfElement = $('passFailText');
    if (parseFloat(finalScore) >= currentQuizData.minPassMarks) {
        pfElement.textContent = "PASS";
        pfElement.style.color = "var(--success)";
    } else {
        pfElement.textContent = "FAIL";
        pfElement.style.color = "var(--danger)";
    }
    if (window.EnterpriseModule) {
    const totalQ = currentQuizData.questions ? currentQuizData.questions.length : 100;
    window.EnterpriseModule.submitEnterpriseResult(
        parseInt($('finalScoreDisplay').textContent), 
        totalQ, 
        currentQuizData.metaExam
    );
}
}

// 16. SHARING & COMMUNICATION
function generateResultTextForShare() {
    const finalScore = $('finalScoreDisplay').textContent;
    const pf = $('passFailText').textContent;
    return `*Quiz Result*\n\nStudent: ${studentProfile.name}\nExam: ${currentQuizData.metaExam}\nScore: ${finalScore}/${currentQuizData.totalMarks}\nStatus: ${pf}\n\nGenerated via Quiz Master Pro`;
}

function sendResultViaWhatsApp() {
    let phone = currentQuizData.teacherWhatsapp || '';
    // Strip non-numeric
    phone = phone.replace(/\D/g, ''); 
    const text = encodeURIComponent(generateResultTextForShare());
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
    window.open(url, '_blank');
}

function sendResultViaEmail() {
    const email = currentQuizData.creatorEmail || '';
    const subject = encodeURIComponent(`Quiz Result: ${studentProfile.name} - ${currentQuizData.metaExam}`);
    const body = encodeURIComponent(generateResultTextForShare());
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
}

// Inject keyframes for pulse animation dynamically
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(styleSheet);
// ==========================================
// v18 ENTERPRISE EXTENSION LOGIC
// ==========================================
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const EnterpriseModule = {
    state: {
        profile: {},
        currentSessionId: null,
        autoSaveInterval: null
    },

    init() {
        console.log("🚀 Quiz Master Pro v18 Enterprise Initialized");
        this.bindEvents();
        this.injectEnterpriseImporter();
    },

    bindEvents() {
        // Intercept standard quiz start to require profile
        const originalStartBtn = document.getElementById('startQuizBtn'); // Assuming this is your v17 start button ID
        if (originalStartBtn) {
            originalStartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('v18-profile-modal').style.display = 'flex';
            }, true);
        }

        // Handle Enterprise Profile Submission
        document.getElementById('v18-start-exam-btn').addEventListener('click', () => {
            const name = document.getElementById('v18-student-name').value;
            const id = document.getElementById('v18-student-id').value;
            if (!name || !id) {
                alert("Name and Student ID are required!");
                return;
            }

            this.state.profile = {
                name: name,
                studentId: id,
                city: document.getElementById('v18-student-city').value || 'N/A',
                school: document.getElementById('v18-student-school').value || 'N/A',
                device: navigator.userAgent,
                startTime: Date.now()
            };

            document.getElementById('v18-profile-modal').style.display = 'none';
            this.startAutoSaveSession();
            
            // Trigger original v17 start logic programmatically
            // If your original script relies on inline onclick, you might need to invoke that function directly here.
            if (typeof window.startQuiz === "function") window.startQuiz(); 
        });

        // Leaderboard Controls
        document.getElementById('v18-leaderboard-trigger').addEventListener('click', () => this.fetchAndShowLeaderboard());
        document.getElementById('v18-close-leaderboard').addEventListener('click', () => {
            document.getElementById('v18-leaderboard-modal').style.display = 'none';
        });

        // Enterprise File Upload Listener
        const excelInput = document.getElementById('v18-excel-upload');
        if(excelInput) {
            excelInput.addEventListener('change', (e) => this.handleExcelImport(e));
        }
    },

    // ------------------------------------------
    // FEATURE: AUTO SAVE & SESSION MANAGER
    // ------------------------------------------
    startAutoSaveSession() {
        this.state.currentSessionId = `session_${this.state.profile.studentId}_${Date.now()}`;
        
        this.state.autoSaveInterval = setInterval(() => {
            // Assuming your v17 state holds answers in a global variable like `studentAnswers`
            const sessionData = {
                profile: this.state.profile,
                answers: window.studentAnswers || {}, 
                lastSaved: Date.now()
            };
            
            // Save locally for offline resilience (IndexedDB via localForage)
            localforage.setItem(this.state.currentSessionId, sessionData).then(() => {
                console.log("💾 Offline Session Auto-Saved");
            });

        }, 5000); // Save every 5 seconds
    },

    // ------------------------------------------
    // FEATURE: ENTERPRISE LEADERBOARD SUBMISSION
    // ------------------------------------------
    async submitEnterpriseResult(finalScore, totalQuestions, metaExamName) {
        clearInterval(this.state.autoSaveInterval);
        const timeTakenMs = Date.now() - this.state.profile.startTime;
        
        const resultData = {
            ...this.state.profile,
            examName: metaExamName,
            score: finalScore,
            percentage: (finalScore / totalQuestions) * 100,
            timeTaken: timeTakenMs,
            submittedAt: serverTimestamp()
        };

        try {
            // Write to v18 specific collection, leaving v17 data untouched
            await addDoc(collection(db, "exam_results"), resultData);
            console.log("✅ Result logged to Enterprise Leaderboard");
        } catch (error) {
            console.error("Firebase Leaderboard Error:", error);
            // Fallback to offline sync queue here
        }
    },

    // ------------------------------------------
    // FEATURE: GLOBAL LEADERBOARD FETCHING
    // ------------------------------------------
    async fetchAndShowLeaderboard() {
        const modal = document.getElementById('v18-leaderboard-modal');
        const tbody = document.getElementById('v18-leaderboard-body');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading Enterprise Data...</td></tr>';
        modal.style.display = 'flex';

        try {
            const q = query(collection(db, "exam_results"), orderBy("score", "desc"), limit(50));
            const querySnapshot = await getDocs(q);
            
            tbody.innerHTML = '';
            let rank = 1;
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const timeMinutes = Math.floor(data.timeTaken / 60000);
                const timeSeconds = Math.floor((data.timeTaken % 60000) / 1000);
                const timeStr = `${timeMinutes}m ${timeSeconds}s`;

                let rankMedal = rank;
                if (rank === 1) rankMedal = '🥇';
                if (rank === 2) rankMedal = '🥈';
                if (rank === 3) rankMedal = '🥉';

                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px; font-weight: bold;">${rankMedal}</td>
                    <td style="padding: 10px;">${this.sanitizeHTML(data.name)}<br><small style="color:var(--text-light)">ID: ${this.sanitizeHTML(data.studentId)}</small></td>
                    <td style="padding: 10px; color: var(--success); font-weight: bold;">${data.score}</td>
                    <td style="padding: 10px;">${this.sanitizeHTML(data.city)}</td>
                    <td style="padding: 10px;">${timeStr}</td>
                `;
                tbody.appendChild(tr);
                rank++;
            });

            if (querySnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No submissions yet.</td></tr>';
            }

        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger);">Failed to load data. Check permissions.</td></tr>';
        }
    },

    // ------------------------------------------
    // FEATURE: EXCEL & RICH TEXT IMPORTER (SheetJS)
    // ------------------------------------------
    injectEnterpriseImporter() {
        // Appends the advanced import UI near the existing Creator Studio area
        const creatorArea = document.getElementById('creatorStudioSection'); // Assuming v17 ID
        if (creatorArea) {
            creatorArea.appendChild(document.getElementById('v18-enterprise-import-ui'));
            document.getElementById('v18-enterprise-import-ui').style.display = 'block';
        }
    },

    handleExcelImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON with raw values preserved for Rich Text processing later
            const json = XLSX.utils.sheet_to_json(worksheet, {defval: ""});
            
            this.processEnterpriseQuestions(json);
        };
        reader.readAsArrayBuffer(file);
    },

    processEnterpriseQuestions(rows) {
        let imported = 0, duplicates = 0, skipped = 0;
        const processedBank = window.currentQuizData?.questions || []; // Hooking into v17 state
        const existingQuestionTexts = new Set(processedBank.map(q => q.qText.trim().toLowerCase()));

        rows.forEach(row => {
            // Mapping assumptions based on standard formats: Q, A, B, C, D, Answer
            const qText = row['Question'] || row['Q'];
            if (!qText) { skipped++; return; }

            // DUPLICATE DETECTOR
            if (existingQuestionTexts.has(qText.trim().toLowerCase())) {
                duplicates++;
                return;
            }

            const newQuestion = {
                qText: this.sanitizeHTML(qText),
                options: [
                    this.sanitizeHTML(row['Option 1'] || row['A']),
                    this.sanitizeHTML(row['Option 2'] || row['B']),
                    this.sanitizeHTML(row['Option 3'] || row['C']),
                    this.sanitizeHTML(row['Option 4'] || row['D'])
                ].filter(Boolean),
                correctAnswer: this.sanitizeHTML(row['Correct'] || row['Answer']),
                difficulty: row['Difficulty'] || 'Medium'
            };

            processedBank.push(newQuestion);
            existingQuestionTexts.add(newQuestion.qText.trim().toLowerCase());
            imported++;
        });

        // Update v17 global state safely
        if (window.currentQuizData) {
            window.currentQuizData.questions = processedBank;
        }

        document.getElementById('v18-import-stats').innerHTML = `
            <span style="color:var(--success)">✅ Imported: ${imported}</span> | 
            <span style="color:var(--accent)">⚠️ Duplicates: ${duplicates}</span> | 
            <span style="color:var(--danger)">❌ Skipped: ${skipped}</span>
        `;
        
        // Trigger v17 UI refresh if applicable
        if (typeof window.renderCreatorQuestions === "function") window.renderCreatorQuestions();
    },

    // ------------------------------------------
    // SECURITY: XSS SANITIZATION
    // ------------------------------------------
    sanitizeHTML(str) {
        if (!str) return "";
        // Safely allows formatting but strips dangerous script tags
        const temp = document.createElement('div');
        temp.textContent = str;
        let safeStr = temp.innerHTML;
        
        // Restore safe HTML tags requested by user (Rich Text)
        safeStr = safeStr.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
        safeStr = safeStr.replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>');
        safeStr = safeStr.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
        safeStr = safeStr.replace(/&lt;br&gt;/g, '<br>');
        
        return safeStr;
    }
};

// Initialize Enterprise features once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    EnterpriseModule.init();
});
// Add this to your main init
localforage.getItem('last_active_session').then(session => {
    if(session) {
        // Logic to prompt user: "Do you want to resume your previous exam?"
    }
});
// To hook the submission into your v17 completion function:
// In your original code, find where `generateResultTextForShare` or the final score calculation happens,
// and append this line:
// if (window.EnterpriseModule) window.EnterpriseModule.submitEnterpriseResult(finalScore, currentQuizData.totalMarks, currentQuizData.metaExam);

window.EnterpriseModule = EnterpriseModule;
// ==========================================
// v18 ENTERPRISE: PHASE 2 INJECTION
// Random Engine & Analytics Integration
// ==========================================

// Ensure Firebase imports are available in this scope (from Phase 1)
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

if (window.EnterpriseModule) {
    Object.assign(window.EnterpriseModule, {
        
        // ------------------------------------------
        // FEATURE 9 & 10: RANDOM QUESTION ENGINE
        // ------------------------------------------
        
        /**
         * Takes a large question bank and securely extracts a randomized subset.
         * Also randomizes the options for each question while preserving the correct answer index.
         * * @param {Array} fullQuestionBank - The complete array of imported questions
         * @param {Number} count - How many questions to deliver to the student
         */
        generateRandomExam(fullQuestionBank, count) {
            if (!fullQuestionBank || fullQuestionBank.length === 0) return [];
            
            // 1. Shuffle the entire question bank (Fisher-Yates)
            let shuffledBank = [...fullQuestionBank];
            for (let i = shuffledBank.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledBank[i], shuffledBank[j]] = [shuffledBank[j], shuffledBank[i]];
            }
            
            // 2. Slice the requested number of questions
            let selectedQuestions = shuffledBank.slice(0, count);
            
            // 3. Randomize options independently for each question
            selectedQuestions = selectedQuestions.map(q => {
                let options = [...q.options];
                let correctText = q.correctAnswer; 
                
                // Shuffle options
                for (let i = options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [options[i], options[j]] = [options[j], options[i]];
                }
                
                return {
                    ...q,
                    options: options,
                    // The correct answer text remains exactly the same, 
                    // your v17 checking logic will still match it correctly by value.
                    correctAnswer: correctText 
                };
            });
            
            console.log(`🎲 Generated random exam: ${count} questions from a pool of ${fullQuestionBank.length}`);
            return selectedQuestions;
        },

        // Hook to intercept v17 quiz start if randomization is toggled
        applyRandomizationIfEnabled(currentQuizData) {
            // Check if teacher set a specific chunk size in the data (e.g., from Creator Studio)
            const requestedSize = currentQuizData.randomSubsetSize || null; 
            if (requestedSize && currentQuizData.questions.length > requestedSize) {
                currentQuizData.questions = this.generateRandomExam(currentQuizData.questions, requestedSize);
                currentQuizData.totalMarks = currentQuizData.questions.length;
            }
        },

        // ------------------------------------------
        // FEATURE 18: EXAM ANALYTICS DASHBOARD
        // ------------------------------------------
        
        bindAnalyticsEvents() {
            const trigger = document.getElementById('v18-analytics-trigger');
            const closeBtn = document.getElementById('v18-close-analytics');
            
            if(trigger) {
                // Only show analytics trigger if user is a creator (you can tie this to your v17 auth state)
                trigger.style.display = 'block'; 
                trigger.addEventListener('click', () => this.fetchAndRenderAnalytics());
            }
            if(closeBtn) {
                closeBtn.addEventListener('click', () => {
                    document.getElementById('v18-analytics-modal').style.display = 'none';
                });
            }
        },

        async fetchAndRenderAnalytics() {
            const modal = document.getElementById('v18-analytics-modal');
            const tbody = document.getElementById('v18-analytics-table-body');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Calculating Enterprise Analytics...</td></tr>';
            modal.style.display = 'flex';

            try {
                // Fetch all results (In a true production environment with 10k+ rows, you'd paginate this)
                const q = query(collection(window.db, "exam_results"), orderBy("submittedAt", "desc"));
                const querySnapshot = await getDocs(q);
                
                let totalScore = 0;
                let highestScore = 0;
                let submissionCount = 0;
                
                tbody.innerHTML = '';
                
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    submissionCount++;
                    totalScore += data.percentage || 0;
                    
                    if (data.score > highestScore) highestScore = data.score;

                    // Format Time
                    const timeMinutes = Math.floor((data.timeTaken || 0) / 60000);
                    const timeSeconds = Math.floor(((data.timeTaken || 0) % 60000) / 1000);
                    
                    // Format Date safely
                    const dateStr = data.submittedAt ? new Date(data.submittedAt.toDate()).toLocaleDateString() : 'N/A';

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = "1px solid var(--border)";
                    tr.innerHTML = `
                        <td style="padding: 10px;">${dateStr}</td>
                        <td style="padding: 10px;"><b>${this.sanitizeHTML(data.name)}</b> <br><small>${this.sanitizeHTML(data.studentId)}</small></td>
                        <td style="padding: 10px; color: var(--primary); font-weight: bold;">${data.score} (${Math.round(data.percentage || 0)}%)</td>
                        <td style="padding: 10px;">${timeMinutes}m ${timeSeconds}s</td>
                    `;
                    tbody.appendChild(tr);
                });

                // Update Dashboard Metric Cards
                const avgPercentage = submissionCount > 0 ? (totalScore / submissionCount).toFixed(1) : 0;
                
                document.getElementById('v18-stat-avg').textContent = `${avgPercentage}%`;
                document.getElementById('v18-stat-high').textContent = highestScore;
                document.getElementById('v18-stat-total').textContent = submissionCount;

                if (querySnapshot.empty) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No analytics data available yet.</td></tr>';
                }

            } catch (error) {
                console.error("Analytics Error:", error);
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--danger);">Failed to load analytics.</td></tr>';
            }
        }
    });

    // Initialize the new bindings
    window.EnterpriseModule.bindAnalyticsEvents();
}
// Logic hint for pagination
const PAGE_SIZE = 50;
function renderQuestionBankPage(pageIndex) {
    const start = pageIndex * PAGE_SIZE;
    const slice = allQuestions.slice(start, start + PAGE_SIZE);
    // Render only this slice
}