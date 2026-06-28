// Import Firebase modules directly from the CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🔴 PASTE YOUR FIREBASE CONFIG HERE 🔴
// ==========================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAnxIsftWdUxtHEh7nxX1UPRA29c0n1444",
  authDomain: "quiz-master-3e489.firebaseapp.com",
  projectId: "quiz-master-3e489",
  storageBucket: "quiz-master-3e489.firebasestorage.app",
  messagingSenderId: "741393992507",
  appId: "1:741393992507:web:b28cd8fcda2b74f85b851e",
  measurementId: "G-K3W2FKZRN9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);


// DOM Utilities
const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");
const escapeHtml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

let allQuizzes = []; 
let quizData = [], currentQuestion = 0, userAnswers = [], isStudentMode = false;
let studentDetails = { name: "", place: "" };
let currentMeta = { creator: "", email: "", exam: "", subject: "" }; 
let mainTimerInterval, questionTimerInterval, autoAdvanceTimer;
let totalSeconds = 0, elapsedSeconds = 0, perQuestionRemaining = 0;
let hasUnsavedChanges = false;
let editingQuizId = null; // Track if we are editing an existing cloud document

window.addEventListener('load', async () => {
    checkUrlForSharedQuiz();
    await loadLibraryFromCloud();
});

window.onbeforeunload = () => {
    if (hasUnsavedChanges) return "You have unsaved changes. Save before leaving?";
};

function showToast(msg, type = 'info') {
    const container = $("toastContainer");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.borderLeft = type === 'error' ? "4px solid #ef4444" : "4px solid #10b981";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

$("themeToggleBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const icon = document.querySelector("#themeToggleBtn i");
    icon.className = document.body.classList.contains("dark-mode") ? "ri-sun-line" : "ri-moon-line";
});

$("toggleCreatorBtn").addEventListener("click", () => { 
    resetCreatorInputs();
    show($("creatorPanel")); hide($("librarySection")); $("toggleCreatorBtn").classList.add("hidden"); 
});

$("closeCreatorBtn").addEventListener("click", () => { 
    if(hasUnsavedChanges && !confirm("Discard unsaved changes?")) return;
    hasUnsavedChanges = false;
    hide($("creatorPanel")); show($("librarySection")); show($("toggleCreatorBtn")); 
});

// --- CLOUD DATABASE FUNCTIONS ---

async function loadLibraryFromCloud() {
    $("libCount").textContent = "Loading cloud data...";
    try {
        const querySnapshot = await getDocs(collection(db, "quizzes"));
        const cloudQuizzes = [];
        querySnapshot.forEach((doc) => {
            cloudQuizzes.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by timestamp (newest first) if we save one, otherwise general
        allQuizzes = cloudQuizzes;
        renderGrid(allQuizzes);
        populateFilters();
    } catch (error) {
        console.error("Error loading quizzes: ", error);
        showToast("Failed to load from cloud. Check your database rules.", "error");
        $("libCount").textContent = "Error loading";
    }
}

function renderGrid(dataset) {
    const grid = $("libraryGrid");
    $("libCount").textContent = `${dataset.length} Quiz${dataset.length !== 1 ? 'zes' : ''}`;
    grid.innerHTML = "";

    if (dataset.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px; color:#888;"><p>No quizzes available in the cloud database.</p></div>`;
        return;
    }

    dataset.forEach((quiz, index) => {
        const card = document.createElement("div");
        card.className = "quiz-card";
        
        card.innerHTML = `
          <div>
            <span class="card-badge" style="background:var(--primary)">🌍 CLOUD</span>
            <span class="card-badge" style="background:#eee; color:#333; margin-left:5px;">${escapeHtml(quiz.meta.class)}</span>
          </div>
          <h4 class="card-title" style="margin:5px 0;">${escapeHtml(quiz.meta.exam)}</h4>
          <div class="card-sub">${escapeHtml(quiz.meta.subject)} • ${escapeHtml(quiz.meta.topic)}</div>
          <div class="card-sub" style="font-size:0.8rem; color:var(--text-light);">👤 ${escapeHtml(quiz.meta.creator || "Admin")}</div>
          <div class="card-sub" style="font-size:0.8rem">❓ ${quiz.questions.length} Questions</div>
          <div class="card-actions" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-top:10px;">
              <button class="btn-sm btn-primary play-lib-btn">Play</button>
              <button class="btn-sm btn-secondary edit-lib-btn" style="color:#f59e0b"><i class="ri-edit-line"></i></button>
              <button class="btn-sm btn-secondary del-lib-btn" style="color:var(--danger)"><i class="ri-delete-bin-line"></i></button>
          </div>`;
        
        card.querySelector(".play-lib-btn").onclick = () => {
           applyConfig(quiz.config || {});
           currentMeta = quiz.meta || {};
           initQuiz(quiz.questions);
        };

        card.querySelector(".edit-lib-btn").onclick = () => editQuizFromCloud(quiz);
        card.querySelector(".del-lib-btn").onclick = () => deleteFromCloud(quiz);
        
        grid.appendChild(card);
    });
}

function populateFilters() {
    const subjects = [...new Set(allQuizzes.map(q => q.meta.subject))].sort();
    const classes = [...new Set(allQuizzes.map(q => q.meta.class))].sort();
    const subSel = $("filterSubject");
    subSel.innerHTML = '<option value="all">All Subjects</option>';
    subjects.forEach(s => { if(s) { const o = document.createElement("option"); o.value = s; o.textContent = s; subSel.appendChild(o); }});
    const clsSel = $("filterClass");
    clsSel.innerHTML = '<option value="all">All Classes</option>';
    classes.forEach(c => { if(c) { const o = document.createElement("option"); o.value = c; o.textContent = c; clsSel.appendChild(o); }});
}

function filterLibrary() {
    const term = $("libSearch").value.toLowerCase();
    const sub = $("filterSubject").value;
    const cls = $("filterClass").value;

    const filtered = allQuizzes.filter(q => {
        const m = q.meta;
        const matchText = (m.exam+m.subject+m.topic+m.creator).toLowerCase().includes(term);
        const matchSub = sub === "all" || m.subject === sub;
        const matchCls = cls === "all" || m.class === cls;
        return matchText && matchSub && matchCls;
    });
    renderGrid(filtered);
}

$("libSearch").addEventListener("input", filterLibrary);
$("filterSubject").addEventListener("change", filterLibrary);
$("filterClass").addEventListener("change", filterLibrary);

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1).map(line => {
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim()); 
      return { question: cols[0]||"", A: cols[1]||"", B: cols[2]||"", C: cols[3]||"", D: cols[4]||"", answer: cols[5]||"" };
    });
}

function getMetaFromInputs() {
    return {
        creator: $("creatorName").value.trim(),
        password: $("creatorPassword").value.trim(),
        email: $("creatorEmail").value.trim(),
        exam: $("metaExam").value.trim(),
        subject: $("metaSubject").value.trim(),
        class: $("metaClass").value,
        topic: $("metaTopic").value
    };
}

async function saveQuizLogic() {
    const data = getCurrentData();
    if (!data.length) return showToast("Add questions first!", "error");
    
    const meta = getMetaFromInputs();
    if (!meta.exam) return showToast("Exam Name required.", "error");
    if (!meta.password) return showToast("Password required.", "error");

    const newQuizData = { 
        meta: meta, 
        config: getConfig(), 
        questions: data,
        createdAt: Date.now()
    };
    
    try {
        showToast("Publishing to cloud... please wait.", "info");
        
        if (editingQuizId) {
            // Update existing cloud doc
            await updateDoc(doc(db, "quizzes", editingQuizId), newQuizData);
            showToast("Quiz updated in cloud successfully!");
        } else {
            // Create new cloud doc
            await addDoc(collection(db, "quizzes"), newQuizData);
            showToast("Quiz published to cloud successfully!");
        }
        
        hasUnsavedChanges = false;
        editingQuizId = null;
        $("closeCreatorBtn").click();
        await loadLibraryFromCloud();
        
    } catch (error) {
        console.error("Error saving: ", error);
        showToast("Error saving to cloud.", "error");
    }
}

$("saveToLibraryBtn").onclick = saveQuizLogic;
if ($("saveCsvToLibBtn")) {
    $("saveCsvToLibBtn").onclick = saveQuizLogic;
}

const downloadBtn = document.createElement("button");
downloadBtn.className = "btn-accent";
downloadBtn.innerHTML = "<i class='ri-download-line'></i> Download CSV";
downloadBtn.onclick = downloadCurrentAsCSV;
$("saveToLibraryBtn").parentNode.insertBefore(downloadBtn, $("shareQuizBtn")); 

function downloadCurrentAsCSV() {
    const data = getCurrentData();
    if(!data.length) return showToast("No questions to extract.", "error");
    let csv = "Question,A,B,C,D,Answer\n";
    data.forEach(row => { csv += [row.question,row.A,row.B,row.C,row.D,row.answer].map(f=>`"${String(f).replace(/"/g,'""')}"`).join(",") + "\n"; });
    const link = document.createElement("a"); link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); link.download = ($("metaExam").value||"quiz")+".csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

async function deleteFromCloud(quiz) {
    if(quiz.meta.password) {
        if(prompt(`Enter password to delete "${quiz.meta.exam}":`) !== quiz.meta.password) return showToast("Invalid Password!", "error");
    }
    
    try {
        await deleteDoc(doc(db, "quizzes", quiz.id));
        showToast("Deleted from cloud.");
        loadLibraryFromCloud();
    } catch (e) {
        showToast("Error deleting from cloud.", "error");
        console.error(e);
    }
}

function editQuizFromCloud(quiz) {
    if(quiz.meta.password) {
        if(prompt(`Enter password to edit "${quiz.meta.exam}":`) !== quiz.meta.password) return showToast("Invalid Password!", "error");
    }
    
    editingQuizId = quiz.id; // Mark that we are editing an existing cloud document
    
    $("creatorName").value = quiz.meta.creator||""; $("creatorPassword").value = quiz.meta.password||""; $("creatorEmail").value = quiz.meta.email||"";
    $("metaExam").value = quiz.meta.exam||""; $("metaSubject").value = quiz.meta.subject||""; $("metaClass").value = quiz.meta.class||""; $("metaTopic").value = quiz.meta.topic||"";
    applyConfig(quiz.config);

    const tbody = document.querySelector("#manualTable tbody"); tbody.innerHTML = "";
    quiz.questions.forEach((q, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i+1}</td><td contenteditable>${q.question}</td><td contenteditable>${q.A}</td><td contenteditable>${q.B}</td><td contenteditable>${q.C}</td><td contenteditable>${q.D}</td><td contenteditable>${q.answer}</td><td><button style="color:red" onclick="this.closest('tr').remove()">×</button></td>`;
        tbody.appendChild(tr);
    });
    hasUnsavedChanges = true;
    show($("creatorPanel")); hide($("librarySection")); $("toggleCreatorBtn").classList.add("hidden"); show($("manualSection")); hide($("csvPreview"));
}

function resetCreatorInputs() {
    editingQuizId = null;
    document.querySelectorAll("#creatorPanel input").forEach(i => { if(i.id !== "totalMarks" && i.id !== "minPassMarks") i.value = ""; });
    document.querySelector("#manualTable tbody").innerHTML = "";
    $("totalMarks").value = "100"; $("minPassMarks").value = "40";
    hasUnsavedChanges = false;
}

document.querySelector("#manualTable").addEventListener("input", () => hasUnsavedChanges = true);

function getCurrentData() {
    if (!$("manualSection").classList.contains("hidden")) {
        return [...document.querySelectorAll("#manualTable tbody tr")].map(tr => {
            const c = tr.querySelectorAll("td");
            return { question: c[1].innerHTML, A: c[2].innerHTML, B: c[3].innerHTML, C: c[4].innerHTML, D: c[5].innerHTML, answer: c[6].innerHTML };
        }).filter(q => q.question.trim());
    } else if ($("csvPreview")._rows) return $("csvPreview")._rows;
    return [];
}
function getConfig() { return { time: $("totalMinutes").value, perQ: $("perQuestionSeconds").value, marks: $("totalMarks").value || 100, pass: $("minPassMarks").value, shuffle: $("shuffleQuestions").checked, contact: $("teacherWhatsapp").value }; }
function applyConfig(cfg) { $("totalMinutes").value = cfg.time||""; $("perQuestionSeconds").value = cfg.perQ||""; $("totalMarks").value = cfg.marks||100; $("minPassMarks").value = cfg.pass||40; $("shuffleQuestions").checked = cfg.shuffle||false; $("teacherWhatsapp").value = cfg.contact||""; }

$("loadCSVBtn").addEventListener("click", () => $("csvFileInput").click());
$("csvFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const rows = parseCSV(ev.target.result); $("csvPreview")._rows = rows;
    $("csvTableContainer").innerHTML = `<table><thead><tr><th>#</th><th>Question Text</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Correct Choice</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.question}</td><td>${r.A}</td><td>${r.B}</td><td>${r.C}</td><td>${r.D}</td><td style="font-weight:bold;color:green">${r.answer}</td></tr>`).join('')}</tbody></table>`;
    show($("csvPreview")); hide($("manualSection")); hasUnsavedChanges = true;
  }; reader.readAsText(file);
});

$("createManualBtn").addEventListener("click", () => { show($("manualSection")); hide($("csvPreview")); });
$("addRowBtn").addEventListener("click", () => {
    const tbody = document.querySelector("#manualTable tbody"); const tr = document.createElement("tr");
    tr.innerHTML = `<td>${tbody.children.length+1}</td><td contenteditable></td><td contenteditable></td><td contenteditable></td><td contenteditable></td><td contenteditable></td><td contenteditable></td><td><button style="color:red" onclick="this.closest('tr').remove()">×</button></td>`;
    tbody.appendChild(tr); hasUnsavedChanges = true;
});

$("startQuizBtn_manual").addEventListener("click", () => initQuiz(getCurrentData()));
$("startQuizBtn_csv").addEventListener("click", () => initQuiz(getCurrentData()));

function initQuiz(data) {
    if (!data || !data.length) return showToast("No quiz parameters found!", "error");
    if (!isStudentMode && !currentMeta.creator) { currentMeta = getMetaFromInputs(); }
    if (!isStudentMode && !studentDetails.name) { show($("studentLoginModal")); window.tempQuizData = data; return; }
    runQuiz(data);
}

$("startStudentQuizBtn").addEventListener("click", () => {
    const name = $("studentName").value.trim(); const place = $("studentPlace").value.trim();
    if(!name) return showToast("Please enter your name.", "error");
    studentDetails = { name, place };
    hide($("studentLoginModal")); $("dispName").textContent = name; $("dispPlace").textContent = place || "Unassigned Class"; show($("studentInfoDisplay"));
    if (window.tempQuizData) runQuiz(window.tempQuizData);
});

function runQuiz(data) {
    if ($("shuffleQuestions").checked) data.sort(() => Math.random() - 0.5);
    quizData = data; currentQuestion = 0; userAnswers = Array(data.length).fill(null);
    hide($("librarySection")); hide($("creatorPanel")); hide(document.querySelector(".app-header")); show($("quizSection"));
    const mins = parseFloat($("totalMinutes").value) || 0; totalSeconds = mins * 60; elapsedSeconds = 0; startMainTimer(); renderQuestion();
}

function renderQuestion() {
    if(autoAdvanceTimer) clearTimeout(autoAdvanceTimer); if(questionTimerInterval) clearInterval(questionTimerInterval);
    const q = quizData[currentQuestion]; 
    
    $("questionBox").innerHTML = q.question;
    
    $("optionsBox").innerHTML = ["A","B","C","D"].map(k => {
        return `<button class="opt-btn" onclick="handleOpt(this, '${k}')"><span style="background:var(--secondary);padding:4px 10px;border-radius:6px;font-weight:bold;">${k}</span> ${q[k]}</button>`;
    }).join("");
    
    const pct = ((currentQuestion+1)/quizData.length)*100; $("progressBarFill").style.width = `${pct}%`; $("questionProgressLabel").textContent = `Question ${currentQuestion+1} / ${quizData.length}`;
    const perQ = parseFloat($("perQuestionSeconds").value) || 0; if (perQ>0) runPerQTimer(perQ);
}

// Make sure handleOpt is attached to window since we are in a module now
window.handleOpt = (btn, optionKey) => {
    document.querySelectorAll(".opt-btn").forEach(b=>b.disabled=true); 
    userAnswers[currentQuestion] = optionKey;
    
    const correctKey = quizData[currentQuestion].answer.trim(); 
    btn.classList.add(optionKey === correctKey ? "correct" : "wrong");
    
    if(optionKey !== correctKey) {
        document.querySelectorAll(".opt-btn").forEach(b => {
            if(b.getAttribute('onclick').includes(`'${correctKey}'`)) b.classList.add("correct");
        });
    }
    
    const correctCount = userAnswers.reduce((acc, ans, i) => acc + (ans === (quizData[i].answer||"").trim() ? 1 : 0), 0);
    const totalM = parseFloat($("totalMarks").value) || 100; 
    $("liveScore").textContent = `Score: ${Math.round(correctCount * (totalM / quizData.length))}`;
    
    autoAdvanceTimer = setTimeout(() => { 
        if(currentQuestion < quizData.length-1) { 
            currentQuestion++; 
            renderQuestion(); 
        } else {
            finishQuiz(); 
        }
    }, 1500);
};

$("prevBtn").addEventListener("click",()=>{if(currentQuestion>0){currentQuestion--;renderQuestion();}});
$("nextBtn").addEventListener("click",()=>{if(currentQuestion<quizData.length-1){currentQuestion++;renderQuestion();}});
$("finishBtn").addEventListener("click", finishQuiz);

function startMainTimer() { if(mainTimerInterval) clearInterval(mainTimerInterval); mainTimerInterval = setInterval(() => { if(totalSeconds > 0) { totalSeconds--; $("mainTimerLabel").textContent = formatTime(totalSeconds); if(totalSeconds<=0) finishQuiz(); } else { elapsedSeconds++; $("mainTimerLabel").textContent = formatTime(elapsedSeconds); } }, 1000); }
function runPerQTimer(sec) { perQuestionRemaining = sec; show($("timerPerQ")); $("timerPerQ").textContent = sec; questionTimerInterval = setInterval(() => { perQuestionRemaining--; $("timerPerQ").textContent = perQuestionRemaining; if(perQuestionRemaining<=0) { clearInterval(questionTimerInterval); if(currentQuestion<quizData.length-1) { currentQuestion++; renderQuestion(); } else finishQuiz(); } }, 1000); }

function finishQuiz() {
    clearInterval(mainTimerInterval); clearInterval(questionTimerInterval); clearTimeout(autoAdvanceTimer);
    hide($("quizSection")); show($("reviewSection")); show(document.querySelector(".app-header"));
    
    let score = 0, correct = 0, skipped = 0; 
    const totalM = parseFloat($("totalMarks").value) || 100; 
    const markPerQ = totalM / quizData.length;
    let listHtml = '';
    
    quizData.forEach((q, i) => {
        const uKey = (userAnswers[i] || "").trim();
        const cKey = (q.answer || "").trim();
        
        let userClass = "wrong-ans";
        let userText = q[uKey] || "---";
        
        if(!uKey) { 
            skipped++; 
            userClass = "skipped-ans"; 
            userText = "No Answer Given"; 
        } else if(uKey === cKey) { 
            score += markPerQ; 
            correct++; 
            userClass = "correct-ans"; 
        }
        
        listHtml += `
          <div class="review-card">
              <div class="review-q-row">
                  <span class="q-num">Q${i+1}.</span>
                  <span class="q-text">${q.question}</span>
              </div>
              <div class="review-ans-row">
                  <div class="ans-box ${userClass}">
                      <span class="ans-label"><i class="ri-user-line"></i> Response [${uKey || 'None'}]:</span>
                      <span class="ans-val">${userText}</span>
                  </div>
                  <div class="ans-box correct-ans">
                      <span class="ans-label"><i class="ri-check-double-line"></i> Correct [${cKey}]:</span>
                      <span class="ans-val">${q[cKey]}</span>
                  </div>
              </div>
          </div>`;
    });
    
    const finalScore = Math.round(score);
    const summaryHtml = `
      <div class="report-header">
          <h2 style="margin:0 0 10px 0; color:var(--primary); border-bottom:2px solid var(--border); padding-bottom:10px;">🎓 QUIZ RESPONSE REPORT</h2>
          <div class="report-meta-grid">
              <div><strong>Student:</strong> ${escapeHtml(studentDetails.name)}</div>
              <div><strong>Location/Class:</strong> ${escapeHtml(studentDetails.place)}</div>
              <div><strong>Exam:</strong> ${escapeHtml(currentMeta.exam || "Quiz")}</div>
              <div><strong>Subject:</strong> ${escapeHtml(currentMeta.subject || "General")}</div>
              <div><strong>Teacher Name:</strong> ${escapeHtml(currentMeta.creator || "Instructor")}</div>
              <div><strong>Teacher Email:</strong> ${escapeHtml(currentMeta.email || "N/A")}</div>
          </div>
          <div class="report-score-box">
              <div class="score-item"><span class="score-lbl">Total Marks</span><span class="score-val">${finalScore} / ${totalM}</span></div>
              <div class="score-item" style="color:var(--success)"><span class="score-lbl">Correct</span><span class="score-val">${correct}</span></div>
              <div class="score-item" style="color:var(--danger)"><span class="score-lbl">Incorrect</span><span class="score-val">${quizData.length - correct - skipped}</span></div>
          </div>
      </div>`;
      
    $("finalScoreDisplay").textContent = finalScore; 
    $("reviewTableContainer").innerHTML = summaryHtml + `<div class="review-list-container">${listHtml}</div>`;
    
    const pass = parseFloat($("minPassMarks").value)||0; 
    $("passFailText").innerHTML = finalScore >= pass ? "<span style='color:var(--success)'>PASSED</span>" : "<span style='color:var(--danger)'>FAILED</span>";
    
    const msgString = `*Quiz Performance Report*\nStudent: ${studentDetails.name}\nExam: ${currentMeta.exam}\nSubject: ${currentMeta.subject}\nScore: ${finalScore}/${totalM}`;
    const contact = $("teacherWhatsapp").value;
    
    $("submitWhatsappBtn").onclick = () => { window.open(contact ? `https://wa.me/${contact}?text=${encodeURIComponent(msgString)}` : `https://wa.me/?text=${encodeURIComponent(msgString)}`, "_blank"); };
    $("submitEmailBtn").onclick = () => window.open(`mailto:${currentMeta.email || ""}?subject=Quiz Result: ${studentDetails.name}&body=${encodeURIComponent(msgString)}`, "_self");
}

$("printPdfBtn").addEventListener("click", () => window.print()); 
$("homeBtn_review").addEventListener("click", () => location.reload());

function checkUrlForSharedQuiz() {
    const hash = location.hash; if (hash && hash.includes("quiz=")) {
        try { 
            const str = LZString.decompressFromEncodedURIComponent(hash.split("quiz=")[1]); 
            const data = JSON.parse(str); 
            isStudentMode = true; 
            applyConfig(data.config); 
            if(data.meta) currentMeta = data.meta; 
            hide($("librarySection")); hide($("toggleCreatorBtn")); hide($("creatorPanel")); 
            window.tempQuizData = data.questions; 
            show($("studentLoginModal")); 
        } catch(e) { 
            showToast("Error processing shared reference key", "error"); 
        }
    }
}

$("shareQuizBtn").addEventListener("click", () => { 
    const qData = getCurrentData(); if(!qData.length) return showToast("No valid structural data to share.", "error"); 
    const str = LZString.compressToEncodedURIComponent(JSON.stringify({ questions: qData, config: getConfig(), meta: getMetaFromInputs() })); 
    $("shareLinkInput").value = `${location.origin}${location.pathname}#quiz=${str}`; 
    show($("shareModal")); 
});
$("copyLinkBtn").addEventListener("click", () => { $("shareLinkInput").select(); document.execCommand("copy"); showToast("URL Copied!"); });
$("closeShareBtn").addEventListener("click", () => hide($("shareModal")));