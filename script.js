// 1. IMPORT FIREBASE MODULES
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, serverTimestamp,
    query, where, orderBy, limit, startAfter
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
    if (!container) return;
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
    if (!Array.isArray(array)) return [];
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
let studentProfile = { name: '', place: '', studentId: '', school: '' };
let csvParsedQuestions = [];

// ==========================================
// UNIFIED ENTERPRISE MODULE
// ==========================================
const EnterpriseModule = {
    state: {
        currentSessionId: null,
        autoSaveInterval: null
    },

    init() {
        this.bindEvents();
        this.injectEnterpriseImporter();
        this.checkOfflineSession();
    },

    bindEvents() {
        const leaderboardTrigger = $('v18-leaderboard-trigger');
        const closeLeaderboard = $('v18-close-leaderboard');
        const excelUpload = $('v18-excel-upload');
        const analyticsTrigger = $('v18-analytics-trigger');
        const closeAnalytics = $('v18-close-analytics');

        if (leaderboardTrigger) leaderboardTrigger.addEventListener('click', () => this.fetchAndShowLeaderboard());
        if (closeLeaderboard) closeLeaderboard.addEventListener('click', () => $('v18-leaderboard-modal').classList.add('hidden'));
        if (excelUpload) excelUpload.addEventListener('change', (e) => this.handleExcelImport(e));
        
        if (analyticsTrigger) {
            analyticsTrigger.style.display = 'block';
            analyticsTrigger.addEventListener('click', () => this.fetchAndRenderAnalytics());
        }
        if (closeAnalytics) closeAnalytics.addEventListener('click', () => $('v18-analytics-modal').classList.add('hidden'));
    },

    startAutoSaveSession() {
        if (this.state.autoSaveInterval) clearInterval(this.state.autoSaveInterval);
        this.state.currentSessionId = `session_${studentProfile.studentId}_${Date.now()}`;
        
        this.state.autoSaveInterval = setInterval(() => {
            const sessionData = {
                profile: studentProfile,
                answers: studentAnswers || {}, 
                lastSaved: Date.now()
            };
            
            if (window.localforage) {
                localforage.setItem(this.state.currentSessionId, sessionData).catch(console.warn);
            }
        }, 5000); 
    },

    async submitEnterpriseResult(finalScore, totalQuestions, metaExamName) {
        if (this.state.autoSaveInterval) clearInterval(this.state.autoSaveInterval);
        
        const timeTakenMs = Date.now() - (studentProfile.startTime || Date.now());
        
        const resultData = {
            ...studentProfile,
            examName: metaExamName,
            score: finalScore,
            percentage: totalQuestions > 0 ? (finalScore / totalQuestions) * 100 : 0,
            timeTaken: timeTakenMs,
            submittedAt: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "exam_results"), resultData);
        } catch (error) {
            console.error("Firebase Leaderboard Error:", error);
        }
    },

    async fetchAndShowLeaderboard() {
        const modal = $('v18-leaderboard-modal');
        const tbody = $('v18-leaderboard-body');
        if (!modal || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading Enterprise Data...</td></tr>';
        modal.classList.remove('hidden');

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
                    <td style="padding: 10px;">${this.sanitizeHTML(data.place)}</td>
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

    async fetchAndRenderAnalytics() {
        const modal = $('v18-analytics-modal');
        const tbody = $('v18-analytics-table-body');
        if (!modal || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Calculating Enterprise Analytics...</td></tr>';
        modal.classList.remove('hidden');

        try {
            const q = query(collection(db, "exam_results"), orderBy("submittedAt", "desc"));
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

                const timeMinutes = Math.floor((data.timeTaken || 0) / 60000);
                const timeSeconds = Math.floor(((data.timeTaken || 0) % 60000) / 1000);
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

            const avgPercentage = submissionCount > 0 ? (totalScore / submissionCount).toFixed(1) : 0;
            const avgEl = $('v18-stat-avg');
            const highEl = $('v18-stat-high');
            const totalEl = $('v18-stat-total');

            if (avgEl) avgEl.textContent = `${avgPercentage}%`;
            if (highEl) highEl.textContent = highestScore;
            if (totalEl) totalEl.textContent = submissionCount;

            if (querySnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No analytics data available yet.</td></tr>';
            }

        } catch (error) {
            console.error("Analytics Error:", error);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--danger);">Failed to load analytics.</td></tr>';
        }
    },

    injectEnterpriseImporter() {
        const creatorArea = $('creatorPanel');
        const importUI = $('v18-enterprise-import-ui');
        if (creatorArea && importUI) {
            creatorArea.appendChild(importUI);
            importUI.style.display = 'block';
        }
    },

    handleExcelImport(event) {
        const file = event.target.files[0];
        if (!file || !window.XLSX) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array', cellStyles: true});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                const rawRows = [];
                if (worksheet['!ref']) {
                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                    for (let R = range.s.r; R <= range.e.r; ++R) {
                        const row = [];
                        for (let C = range.s.c; C <= range.e.c; ++C) {
                            const cellAddress = XLSX.utils.encode_cell({c: C, r: R});
                            const cell = worksheet[cellAddress];
                            row.push(cell ? this.excelCellToHTML(cell) : "");
                        }
                        rawRows.push(row);
                    }
                }
                
                if (rawRows.length < 2) throw new Error("File seems empty or missing data.");
                
                this.processEnterpriseQuestions(rawRows);
            } catch (err) {
                showToast("Invalid Excel Format. Please download the template.", "error");
            }
        };
        reader.readAsArrayBuffer(file);
    },

    excelCellToHTML(cell) {
        if (!cell) return "";
        
        // 1. Process Rich Text Runs
        if (cell.r && Array.isArray(cell.r)) {
            let html = "";
            cell.r.forEach(run => {
                let text = run.t;
                if (!text) return;
                
                if (run.font) {
                    if (run.font.bold) text = `<b>${text}</b>`;
                    if (run.font.italic) text = `<i>${text}</i>`;
                    if (run.font.underline) text = `<u>${text}</u>`;
                    if (run.font.vertAlign === 'superscript') text = `<sup>${text}</sup>`;
                    if (run.font.vertAlign === 'subscript') text = `<sub>${text}</sub>`;
                    
                    let styleStr = "";
                    if (run.font.color && run.font.color.rgb) {
                        let color = run.font.color.rgb;
                        if (color.length === 8) color = "#" + color.substring(2); 
                        else color = "#" + color;
                        styleStr += `color:${color};`;
                    }
                    if (styleStr) {
                        text = `<span style="${styleStr}">${text}</span>`;
                    }
                }
                html += text;
            });
            return html;
        }
        
        // 2. Fallback: Process Cell-Level formatting for plain cells
        let val = cell.w !== undefined ? cell.w : (cell.v !== undefined ? String(cell.v) : "");
        
        if (cell.s && cell.s.font) {
            if (cell.s.font.bold) val = `<b>${val}</b>`;
            if (cell.s.font.italic) val = `<i>${val}</i>`;
            if (cell.s.font.underline) val = `<u>${val}</u>`;
            if (cell.s.font.vertAlign === 'superscript') val = `<sup>${val}</sup>`;
            if (cell.s.font.vertAlign === 'subscript') val = `<sub>${val}</sub>`;
            
            let styleStr = "";
            if (cell.s.font.color && cell.s.font.color.rgb) {
                let color = cell.s.font.color.rgb;
                if (color.length === 8) color = "#" + color.substring(2);
                else color = "#" + color;
                styleStr += `color:${color};`;
            }
            if (cell.s.fill && cell.s.fill.fgColor && cell.s.fill.fgColor.rgb) {
                let bg = cell.s.fill.fgColor.rgb;
                if (bg.length === 8) bg = "#" + bg.substring(2);
                else bg = "#" + bg;
                styleStr += `background-color:${bg};`;
            }
            if (styleStr) {
                val = `<span style="${styleStr}">${val}</span>`;
            }
        }
        
        return val;
    },

    sanitizeHTML(str) {
        if (!str) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        let safeStr = temp.innerHTML;
        
        const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'sup', 'sub'];
        allowedTags.forEach(tag => {
            safeStr = safeStr.replace(new RegExp(`&lt;${tag}&gt;`, 'gi'), `<${tag}>`);
            safeStr = safeStr.replace(new RegExp(`&lt;\\/${tag}&gt;`, 'gi'), `</${tag}>`);
        });
        
        safeStr = safeStr.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        
        // Ensure complex styles are preserved securely (colors, hex, rgba, etc.)
        safeStr = safeStr.replace(/&lt;span style=(?:&quot;|"|')([^"&']+)(?:&quot;|"|')&gt;/gi, (match, styleContent) => {
            const safeStyle = styleContent.replace(/[^a-zA-Z0-9:#;\-\s,().%!]/g, '');
            return `<span style="${safeStyle}">`;
        });
        safeStr = safeStr.replace(/&lt;\/span&gt;/gi, '</span>');

        return safeStr;
    },

    processEnterpriseQuestions(rawRows) {
        let imported = 0, duplicates = 0, skipped = 0, errors = 0;
        const processedBank = csvParsedQuestions || [];
        const existingQuestionHashes = new Set(processedBank.map(q => this.hashQuestion(q)));

        const headers = rawRows[0].map(h => h.toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
        
        const getColIndex = (aliases) => {
            for (let alias of aliases) {
                const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
                const idx = headers.findIndex(h => h.includes(cleanAlias) || cleanAlias.includes(h));
                if (idx !== -1) return idx;
            }
            return -1;
        };

        const colMap = {
            q: getColIndex(['question', 'q', 'questiontext', 'questionname']),
            optA: getColIndex(['optiona', 'a', 'option1', 'choicea']),
            optB: getColIndex(['optionb', 'b', 'option2', 'choiceb']),
            optC: getColIndex(['optionc', 'c', 'option3', 'choicec']),
            optD: getColIndex(['optiond', 'd', 'option4', 'choiced']),
            ans: getColIndex(['answer', 'correct', 'ans', 'correctoption'])
        };

        if (colMap.q === -1 || colMap.ans === -1) {
            showToast("Could not detect Question or Answer columns. Download template.", "error");
            return;
        }

        for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            const qText = row[colMap.q] ? row[colMap.q].toString().trim() : '';
            
            if (!qText) { skipped++; continue; }

            const options = [
                colMap.optA !== -1 ? row[colMap.optA]?.toString().trim() : null,
                colMap.optB !== -1 ? row[colMap.optB]?.toString().trim() : null,
                colMap.optC !== -1 ? row[colMap.optC]?.toString().trim() : null,
                colMap.optD !== -1 ? row[colMap.optD]?.toString().trim() : null
            ].filter(Boolean);

            const answer = colMap.ans !== -1 ? row[colMap.ans]?.toString().trim() : '';

            if (options.length < 2) { errors++; continue; }
            if (!answer || !options.includes(answer)) { errors++; continue; }

            const newQuestion = {
                text: this.sanitizeHTML(qText),
                options: options.map(o => this.sanitizeHTML(o)),
                answer: this.sanitizeHTML(answer)
            };

            const qHash = this.hashQuestion(newQuestion);
            if (existingQuestionHashes.has(qHash)) {
                duplicates++;
                continue;
            }

            processedBank.push(newQuestion);
            existingQuestionHashes.add(qHash);
            imported++;
        }

        csvParsedQuestions = processedBank;

        const importStats = $('v18-import-stats');
        if (importStats) {
            importStats.innerHTML = `
                <span style="color:var(--success)">✅ Imported: ${imported}</span> | 
                <span style="color:var(--accent)">⚠️ Dups: ${duplicates}</span> | 
                <span style="color:var(--danger)">❌ Skipped/Errors: ${skipped + errors}</span>
            `;
        }

        if (csvParsedQuestions.length > 0) {
            $('manualSection').classList.add('hidden');
            $('csvPreview').classList.remove('hidden');
            this.forceRenderCSVPreview();
            showToast(`Successfully imported ${imported} new questions.`, 'success');
        }
    },

    hashQuestion(qObj) {
        const stripHTML = (str) => str.replace(/<[^>]*>?/gm, '');
        const clean = (str) => stripHTML(str).toLowerCase().replace(/\s+/g, '').trim();
        return clean(qObj.text) + '_' + qObj.options.map(clean).sort().join('_');
    },

    forceRenderCSVPreview() {
        let htmlPreview = `<table><thead><tr><th>#</th><th>Question</th><th>Options</th><th>Answer</th></tr></thead><tbody>`;
        csvParsedQuestions.forEach((q, idx) => {
            htmlPreview += `<tr>
                <td>${idx + 1}</td>
                <td>${q.text}</td>
                <td>${q.options.join(' | ')}</td>
                <td><b>${q.answer}</b></td>
            </tr>`;
        });
        htmlPreview += `</tbody></table>`;
        $('csvTableContainer').innerHTML = htmlPreview;
    },
    
    generateRandomExam(fullQuestionBank, count) {
        if (!fullQuestionBank || fullQuestionBank.length === 0) return [];
        
        let shuffledBank = shuffleArray([...fullQuestionBank]);
        let selectedQuestions = shuffledBank.slice(0, count);
        
        return selectedQuestions.map(q => {
            let options = shuffleArray([...q.options]);
            return { ...q, options: options };
        });
    },

    applyRandomizationIfEnabled(quizData) {
        if (!quizData || !quizData.questions) return;
        const requestedSize = quizData.randomSubsetSize || null; 
        if (requestedSize && quizData.questions.length > requestedSize) {
            quizData.questions = this.generateRandomExam(quizData.questions, requestedSize);
            quizData.totalMarks = quizData.questions.length;
        }
    },

    checkOfflineSession() {
        if (window.localforage) {
            localforage.getItem('last_active_session').then(session => {
                if (session) console.log("Previous session found, restoration possible.");
            }).catch(() => {});
        }
    }
};

// 6. INITIALIZATION & ROUTING
window.addEventListener('load', async () => {
    initTheme();
    loadLocalProfiles();
    attachEventListeners();
    EnterpriseModule.init();

    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('quiz');

    if (quizId) {
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
    if (cName && $('creatorName')) $('creatorName').value = cName;
    if (cEmail && $('creatorEmail')) $('creatorEmail').value = cEmail;
    if (tWa && $('teacherWhatsapp')) $('teacherWhatsapp').value = tWa;
}

function saveLocalProfiles() {
    localStorage.setItem('creatorName', $('creatorName').value.trim());
    localStorage.setItem('creatorEmail', $('creatorEmail').value.trim());
    localStorage.setItem('teacherWhatsapp', $('teacherWhatsapp').value.trim());
}

// 7. EVENT LISTENERS SETUP
function attachEventListeners() {
    if ($('themeToggleBtn')) $('themeToggleBtn').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    if ($('toggleCreatorBtn')) $('toggleCreatorBtn').addEventListener('click', () => {
        $('librarySection').classList.toggle('hidden');
        $('creatorPanel').classList.toggle('hidden');
    });

    if ($('closeCreatorBtn')) $('closeCreatorBtn').addEventListener('click', () => {
        $('creatorPanel').classList.add('hidden');
        $('librarySection').classList.remove('hidden');
        loadLibraryFromCloud();
    });

    if ($('libSearch')) $('libSearch').addEventListener('input', renderLibraryGrid);
    if ($('filterSubject')) $('filterSubject').addEventListener('change', renderLibraryGrid);
    if ($('filterClass')) $('filterClass').addEventListener('change', renderLibraryGrid);

    if ($('createManualBtn')) $('createManualBtn').addEventListener('click', () => {
        $('manualSection').classList.remove('hidden');
        $('csvPreview').classList.add('hidden');
        if ($('manualTable').getElementsByTagName('tbody')[0].children.length === 0) {
            addManualRow();
        }
    });

    if ($('addRowBtn')) $('addRowBtn').addEventListener('click', addManualRow);
    if ($('startQuizBtn_manual')) $('startQuizBtn_manual').addEventListener('click', () => testQuizLocally('manual'));
    if ($('saveToLibraryBtn')) $('saveToLibraryBtn').addEventListener('click', () => publishQuizToCloud('manual'));

    if ($('loadCSVBtn')) $('loadCSVBtn').addEventListener('click', () => $('csvFileInput').click());
    if ($('csvFileInput')) $('csvFileInput').addEventListener('change', handleCSVUpload);
    if ($('startQuizBtn_csv')) $('startQuizBtn_csv').addEventListener('click', () => testQuizLocally('csv'));
    if ($('saveCsvToLibBtn')) $('saveCsvToLibBtn').addEventListener('click', () => publishQuizToCloud('csv'));

    if ($('startStudentQuizBtn')) $('startStudentQuizBtn').addEventListener('click', beginQuizEngine);
    
    if ($('prevBtn')) $('prevBtn').addEventListener('click', () => navigateQuestion(-1));
    if ($('nextBtn')) $('nextBtn').addEventListener('click', () => navigateQuestion(1));
    if ($('finishBtn')) $('finishBtn').addEventListener('click', () => confirmFinishQuiz());

    if ($('printPdfBtn')) $('printPdfBtn').addEventListener('click', () => window.print());
    if ($('homeBtn_review')) $('homeBtn_review').addEventListener('click', () => window.location.href = window.location.pathname);
    if ($('submitWhatsappBtn')) $('submitWhatsappBtn').addEventListener('click', sendResultViaWhatsApp);
    if ($('submitEmailBtn')) $('submitEmailBtn').addEventListener('click', sendResultViaEmail);

    if ($('closeShareBtn')) $('closeShareBtn').addEventListener('click', () => $('shareModal').classList.add('hidden'));
    if ($('copyLinkBtn')) $('copyLinkBtn').addEventListener('click', () => {
        $('shareLinkInput').select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    });
    if ($('shareQuizBtn')) $('shareQuizBtn').addEventListener('click', () => {
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
    if (!select) return;
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
    if (!grid) return;
    
    const searchTerm = ($('libSearch')?.value || '').toLowerCase();
    const filterSub = $('filterSubject')?.value || 'all';
    const filterCls = $('filterClass')?.value || 'all';

    const stripTags = (str) => str ? str.replace(/<[^>]*>?/gm, '') : '';

    grid.innerHTML = '';

    const filtered = globalQuizzes.filter(q => {
        const cleanExam = stripTags(q.metaExam).toLowerCase();
        const cleanTopic = stripTags(q.metaTopic).toLowerCase();
        const cleanCreator = stripTags(q.creatorName).toLowerCase();
        
        const matchesSearch = cleanExam.includes(searchTerm) || 
                              cleanTopic.includes(searchTerm) ||
                              cleanCreator.includes(searchTerm);
        const matchesSub = filterSub === 'all' || q.metaSubject === filterSub;
        const matchesCls = filterCls === 'all' || q.metaClass === filterCls;
        return matchesSearch && matchesSub && matchesCls;
    }).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 20px; color: var(--text-light);">No quizzes found matching filters.</div>';
        return;
    }

    filtered.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <span class="card-badge" style="background:var(--primary)">${EnterpriseModule.sanitizeHTML(quiz.metaClass) || 'N/A'} - ${EnterpriseModule.sanitizeHTML(quiz.metaSubject) || 'N/A'}</span>
                <span class="card-badge" style="background:var(--accent)">${quiz.questions?.length || 0} Qs</span>
            </div>
            <h4 class="card-title">${EnterpriseModule.sanitizeHTML(quiz.metaExam) || 'Untitled Exam'}</h4>
            <div class="card-sub">Topic: ${EnterpriseModule.sanitizeHTML(quiz.metaTopic) || 'N/A'}</div>
            <div class="card-sub">By: ${EnterpriseModule.sanitizeHTML(quiz.creatorName) || 'Unknown'}</div>
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
        creatorName: $('creatorName')?.value.trim(),
        creatorPassword: $('creatorPassword')?.value.trim(),
        creatorEmail: $('creatorEmail')?.value.trim(),
        metaExam: $('metaExam')?.value.trim(),
        metaSubject: $('metaSubject')?.value.trim(),
        metaClass: $('metaClass')?.value.trim(),
        metaTopic: $('metaTopic')?.value.trim(),
        totalMinutes: Number($('totalMinutes')?.value) || 0,
        totalMarks: Number($('totalMarks')?.value) || 100,
        perQuestionSeconds: Number($('perQuestionSeconds')?.value) || 0,
        minPassMarks: Number($('minPassMarks')?.value) || 40,
        shuffleQuestions: $('shuffleQuestions')?.checked || false,
        teacherWhatsapp: $('teacherWhatsapp')?.value.trim()
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
    const tbody = $('manualTable')?.getElementsByTagName('tbody')[0];
    if (!tbody) return;
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
    const rows = $('manualTable')?.getElementsByTagName('tbody')[0]?.children || [];
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
                text: EnterpriseModule.sanitizeHTML(q),
                options: [a, b, c, d].filter(Boolean).map(val => EnterpriseModule.sanitizeHTML(val)),
                answer: EnterpriseModule.sanitizeHTML(ans)
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
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (inQuotes) {
            if (char === '"') {
                if (csvText[i + 1] === '"') { currentCell += '"'; i++; } 
                else { inQuotes = false; }
            } else { currentCell += char; }
        } else {
            if (char === '"') { inQuotes = true; }
            else if (char === ',') { currentRow.push(currentCell.trim()); currentCell = ''; }
            else if (char === '\n' || char === '\r') {
                currentRow.push(currentCell.trim());
                if (currentRow.some(c => c)) rows.push(currentRow); 
                currentRow = []; currentCell = '';
                if (char === '\r' && csvText[i + 1] === '\n') i++; 
            } else { currentCell += char; }
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }

    csvParsedQuestions = [];
    let htmlPreview = `<table><thead><tr><th>#</th><th>Question</th><th>Options</th><th>Answer</th></tr></thead><tbody>`;
    
    if(rows.length === 0) return showToast("Empty CSV file.", "error");

    let startIndex = rows[0].join('').toLowerCase().includes('question') ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < 3) continue; 
        
        const qText = r[0];
        const ansText = r[r.length - 1]; 
        const options = r.slice(1, r.length - 1).filter(Boolean);

        if (qText && ansText) {
            csvParsedQuestions.push({ 
                text: EnterpriseModule.sanitizeHTML(qText), 
                options: options.map(o => EnterpriseModule.sanitizeHTML(o)), 
                answer: EnterpriseModule.sanitizeHTML(ansText) 
            });
            htmlPreview += `<tr>
                <td>${csvParsedQuestions.length}</td>
                <td>${EnterpriseModule.sanitizeHTML(qText)}</td>
                <td>${options.map(o => EnterpriseModule.sanitizeHTML(o)).join(' | ')}</td>
                <td><b>${EnterpriseModule.sanitizeHTML(ansText)}</b></td>
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
    if (!btn) return;

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
    
    EnterpriseModule.applyRandomizationIfEnabled(currentQuizData);
    
    $('studentName').value = "Creator Test";
    $('v18-student-id').value = "TEST-001";
    $('studentPlace').value = "Studio";
    $('studentLoginModal').classList.remove('hidden');
}


// 13. QUIZ ENGINE - FETCH & LOGIN
async function fetchAndStartSharedQuiz(quizId) {
    try {
        if (quizId.startsWith('group_')) {
            const actualGroupId = quizId.replace('group_', '');
            const docSnap = await getDoc(doc(db, "exam_groups", actualGroupId));
            
            if (docSnap.exists()) {
                const group = docSnap.data();
                let combinedQuestions = [];
                let combinedMinutes = 0;
                let maxPerQTimer = 0;

                for (let qId of group.quizIds) {
                    const qSnap = await getDoc(doc(db, "quizzes", qId));
                    if (qSnap.exists()) {
                        const data = qSnap.data();
                        combinedQuestions = combinedQuestions.concat(data.questions || []);
                        combinedMinutes += parseInt(data.totalMinutes || 0);
                        if (data.perQuestionSeconds > maxPerQTimer) {
                            maxPerQTimer = parseInt(data.perQuestionSeconds);
                        }
                    }
                }
                
                if (combinedQuestions.length === 0) {
                    showToast("No questions found in this group exam.", "error");
                    $('librarySection').classList.remove('hidden');
                    return;
                }

                currentQuizData = {
                    id: quizId,
                    metaExam: group.groupName,
                    metaSubject: group.subject,
                    metaClass: group.class,
                    totalMarks: group.totalMarks,
                    totalMinutes: combinedMinutes,
                    questions: combinedQuestions,
                    shuffleQuestions: true,
                    perQuestionSeconds: maxPerQTimer,
                    minPassMarks: Math.floor(group.totalMarks * 0.4) 
                };
                
                $('studentLoginModal').classList.remove('hidden');
            } else {
                showToast("Exam Group not found or deleted.", "error");
                $('librarySection').classList.remove('hidden');
            }
        } else {
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
        }
    } catch (error) {
        console.error(error);
        showToast("Error fetching quiz link.", "error");
        $('librarySection').classList.remove('hidden');
    }
}

function beginQuizEngine() {
    const sName = $('studentName')?.value.trim();
    const sId = $('v18-student-id')?.value.trim();
    const sPlace = $('studentPlace')?.value.trim();
    const sSchool = $('v18-student-school')?.value.trim();
    
    if (!sName || !sId) {
        showToast("Full Name and Student ID are required.", "warning");
        return;
    }

    studentProfile = { 
        name: sName, 
        studentId: sId,
        place: sPlace || 'Unknown', 
        school: sSchool || 'Unknown',
        startTime: Date.now()
    };
    
    if ($('dispName')) $('dispName').textContent = sName;
    if ($('dispPlace')) $('dispPlace').textContent = studentProfile.place;
    if ($('studentInfoDisplay')) $('studentInfoDisplay').classList.remove('hidden');

    if ($('studentLoginModal')) $('studentLoginModal').classList.add('hidden');
    if ($('librarySection')) $('librarySection').classList.add('hidden');
    if ($('v20-group-manager-panel')) $('v20-group-manager-panel').classList.add('hidden');
    if ($('appContainer')) $('appContainer').style.paddingBottom = "0";

    EnterpriseModule.startAutoSaveSession();
    startQuizEnvironment();
}

// 14. QUIZ ENVIRONMENT & LOGIC
function startQuizEnvironment() {
    $('quizSection').classList.remove('hidden');
    
    EnterpriseModule.applyRandomizationIfEnabled(currentQuizData);

    currentQuestions = JSON.parse(JSON.stringify(currentQuizData.questions));
    if (currentQuizData.shuffleQuestions) {
        currentQuestions = shuffleArray(currentQuestions);
    }
    
    studentAnswers = {}; 
    currentQIndex = 0;

    clearInterval(mainTimerInterval);
    clearInterval(perQTimerInterval);

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
    if (!qData) return;
    
    $('questionProgressLabel').textContent = `Q ${currentQIndex + 1}/${currentQuestions.length}`;
    const percent = ((currentQIndex + 1) / currentQuestions.length) * 100;
    $('progressBarFill').style.width = `${percent}%`;
    calculateLiveScore();

    $('questionBox').innerHTML = qData.text;

    const optBox = $('optionsBox');
    optBox.innerHTML = '';
    
    let optionsToRender = [...qData.options];
    if (currentQuizData.shuffleQuestions) {
        optionsToRender = shuffleArray(optionsToRender);
    }

    optionsToRender.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        const letter = String.fromCharCode(65 + index);
        btn.innerHTML = `<span style="font-weight:bold; width:24px;">${letter}.</span> <span>${optText}</span>`;
        
        if (studentAnswers[currentQIndex] === optText) {
            btn.style.borderColor = 'var(--primary)';
            btn.style.background = 'var(--bg-body)';
        }

        btn.onclick = () => selectOption(optText);
        optBox.appendChild(btn);
    });

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
                navigateQuestion(1); 
            }
        }, 1000);
    } else {
        perQBadge.classList.add('hidden');
    }

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
    renderCurrentQuestion(); 
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
    if (!el) return;
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
    if ($('liveScore')) $('liveScore').textContent = `Score: ${(correctCount * marksPerQ).toFixed(1)}`;
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
    if ($('quizSection')) $('quizSection').classList.add('hidden');
    if ($('studentInfoDisplay')) $('studentInfoDisplay').classList.add('hidden');
    if ($('appContainer')) $('appContainer').style.paddingBottom = "80px";
    
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
                <div><b>Student:</b> ${EnterpriseModule.sanitizeHTML(studentProfile.name)} (${EnterpriseModule.sanitizeHTML(studentProfile.place)})</div>
                <div><b>ID:</b> ${EnterpriseModule.sanitizeHTML(studentProfile.studentId)}</div>
                <div><b>Exam:</b> ${EnterpriseModule.sanitizeHTML(currentQuizData.metaExam) || 'N/A'}</div>
                <div><b>Subject:</b> ${EnterpriseModule.sanitizeHTML(currentQuizData.metaSubject) || 'N/A'}</div>
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
    
    EnterpriseModule.submitEnterpriseResult(
        parseFloat(finalScore), 
        totalQ, 
        currentQuizData.metaExam
    );
}

// 16. SHARING & COMMUNICATION
function generateResultTextForShare() {
    const finalScore = $('finalScoreDisplay')?.textContent || '0';
    const pf = $('passFailText')?.textContent || '';
    return `*Quiz Result*\n\nStudent: ${studentProfile.name}\nID: ${studentProfile.studentId}\nExam: ${currentQuizData.metaExam}\nScore: ${finalScore}/${currentQuizData.totalMarks}\nStatus: ${pf}\n\nGenerated via Quiz Master Pro`;
}

function sendResultViaWhatsApp() {
    let phone = currentQuizData.teacherWhatsapp || '';
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
// V20 ENTERPRISE EXAM GROUP & EXPORT MODULE
// ==========================================
const EnterpriseV20Module = {
    selectedQuizIdsForGroup: new Set(),
    globalExamGroups: [],

    init() {
        this.bindEvents();
    },

    bindEvents() {
        const downloadTplBtn = $('v20-download-template');
        if (downloadTplBtn) downloadTplBtn.addEventListener('click', () => this.downloadExcelTemplate());

        const tabQuizzes = $('v20-tab-quizzes');
        const tabGroups = $('v20-tab-groups');
        const createGroupBtn = $('v20-create-group-btn');

        if (tabQuizzes) tabQuizzes.addEventListener('click', () => this.switchTab('quizzes'));
        if (tabGroups) tabGroups.addEventListener('click', () => {
            this.switchTab('groups');
            this.fetchExamGroups();
        });

        if (createGroupBtn) createGroupBtn.addEventListener('click', () => this.createExamGroup());
    },

    downloadExcelTemplate() {
        if (!window.XLSX) return showToast("Excel library not loaded.", "error");
        
        const wb = XLSX.utils.book_new();
        const ws_data = [
            ["Question", "Option A", "Option B", "Option C", "Option D", "Answer", "Subject", "Class", "Topic", "Difficulty", "Creator"],
            ["Capital of India?", "Delhi", "Mumbai", "Chennai", "Kolkata", "Delhi", "Geography", "10", "India", "Easy", "Teacher"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "QuizMaster_Template.xlsx");
    },

    switchTab(tab) {
        const tabQuizzes = $('v20-tab-quizzes');
        const tabGroups = $('v20-tab-groups');
        const gridQuizzes = $('libraryGrid');
        const panelGroups = $('v20-group-manager-panel');

        if (tab === 'quizzes') {
            tabQuizzes.className = 'btn-primary';
            tabQuizzes.style.flex = '1';
            tabGroups.className = 'btn-secondary';
            tabGroups.style.flex = '1';
            gridQuizzes.classList.remove('hidden');
            panelGroups.classList.add('hidden');
            this.disableMultiSelectMode();
        } else {
            tabGroups.className = 'btn-primary';
            tabQuizzes.className = 'btn-secondary';
            gridQuizzes.classList.remove('hidden'); 
            panelGroups.classList.remove('hidden');
            this.enableMultiSelectMode();
        }
    },

    enableMultiSelectMode() {
        this.selectedQuizIdsForGroup.clear();
        const cards = document.querySelectorAll('#libraryGrid .quiz-card');
        cards.forEach(card => {
            const playBtn = card.querySelector('.ri-play-fill').parentElement;
            const onclickAttr = playBtn.getAttribute('onclick');
            const quizId = onclickAttr.match(/'([^']+)'/)[1];

            card.classList.add('quiz-card-selectable');
            
            if (!card.querySelector('.select-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'select-indicator';
                indicator.innerHTML = '<i class="ri-check-line"></i>';
                card.appendChild(indicator);
            }

            card.onclick = (e) => {
                if (e.target.closest('button')) return; 
                
                if (this.selectedQuizIdsForGroup.has(quizId)) {
                    this.selectedQuizIdsForGroup.delete(quizId);
                    card.classList.remove('selected');
                } else {
                    this.selectedQuizIdsForGroup.add(quizId);
                    card.classList.add('selected');
                }
            };
        });
    },

    disableMultiSelectMode() {
        const cards = document.querySelectorAll('#libraryGrid .quiz-card');
        cards.forEach(card => {
            card.classList.remove('quiz-card-selectable', 'selected');
            card.onclick = null;
            const indicator = card.querySelector('.select-indicator');
            if (indicator) indicator.remove();
        });
    },

    async createExamGroup() {
        const groupName = $('v20-group-name').value.trim();
        const creatorPassword = $('creatorPassword')?.value.trim() || '';
        const creatorEmail = $('creatorEmail')?.value.trim() || '';

        if (!groupName) return showToast("Enter an Exam Group Name.", "warning");
        if (this.selectedQuizIdsForGroup.size < 2) return showToast("Select at least 2 quizzes to group.", "warning");
        if (!creatorPassword) return showToast("Set a Creator Password in the Creator Studio to secure this group.", "warning");

        const selectedQuizzes = globalQuizzes.filter(q => this.selectedQuizIdsForGroup.has(q.id));
        
        let totalQuestions = 0;
        let topics = new Set();
        let totalMarks = 0;

        selectedQuizzes.forEach(q => {
            totalQuestions += (q.questions || []).length;
            totalMarks += parseInt(q.totalMarks || 0);
            if (q.metaTopic) topics.add(q.metaTopic);
        });

        const newGroup = {
            groupName: groupName,
            quizIds: Array.from(this.selectedQuizIdsForGroup),
            topics: Array.from(topics).join(', '),
            questionCount: totalQuestions,
            totalMarks: totalMarks,
            subject: selectedQuizzes[0].metaSubject || 'Mixed',
            class: selectedQuizzes[0].metaClass || 'Mixed',
            creator: localStorage.getItem('creatorName') || 'Unknown',
            creatorPassword: creatorPassword,
            creatorEmail: creatorEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            const docRef = await addDoc(collection(db, "exam_groups"), newGroup);
            showToast("Exam Group Created!", "success");
            $('v20-group-name').value = '';
            this.selectedQuizIdsForGroup.clear();
            this.fetchExamGroups();
        } catch (error) {
            console.error(error);
            showToast("Failed to create group", "error");
        }
    },

    async fetchExamGroups() {
        const grid = $('v20-group-grid');
        grid.innerHTML = '<p>Loading groups...</p>';
        
        try {
            const qSnap = await getDocs(query(collection(db, "exam_groups"), orderBy("createdAt", "desc")));
            this.globalExamGroups = [];
            grid.innerHTML = '';

            qSnap.forEach(doc => {
                const data = doc.data();
                this.globalExamGroups.push({ id: doc.id, ...data });

                const card = document.createElement('div');
                card.className = 'quiz-card';
                card.style.border = '2px solid var(--accent)';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <span class="card-badge" style="background:var(--accent)">📦 GROUP</span>
                        <span class="card-badge" style="background:var(--primary)">${data.questionCount} Qs | ${data.quizIds.length} Topics</span>
                    </div>
                    <h4 class="card-title">${EnterpriseModule.sanitizeHTML(data.groupName)}</h4>
                    <div class="card-sub">Class: ${data.class} | Subject: ${data.subject}</div>
                    <div class="card-sub">Topics: <small>${data.topics}</small></div>
                    <div class="group-actions">
                        <button class="btn-sm btn-primary" onclick="EnterpriseV20Module.playGroup('${doc.id}')"><i class="ri-play-fill"></i> Play</button>
                        <button class="btn-sm btn-secondary" onclick="window.shareExistingQuiz('group_${doc.id}')"><i class="ri-share-line"></i> Share</button>
                        <button class="btn-sm btn-accent" onclick="EnterpriseV20Module.generateGroupPDF('${doc.id}')"><i class="ri-file-pdf-line"></i> PDF</button>
                        <button class="btn-sm btn-secondary" onclick="EnterpriseV20Module.deleteGroup('${doc.id}', '${data.creatorPassword || ''}')" style="color:var(--danger);"><i class="ri-delete-bin-line"></i></button>
                    </div>
                `;
                grid.appendChild(card);
            });

            if (this.globalExamGroups.length === 0) {
                grid.innerHTML = '<p>No exam groups found. Select quizzes above and merge them.</p>';
            }

        } catch (err) {
            console.error(err);
            grid.innerHTML = '<p>Error loading groups.</p>';
        }
    },

    async playGroup(groupId) {
        const group = this.globalExamGroups.find(g => g.id === groupId);
        if (!group) return;

        showToast("Merging Quizzes...", "info");
        try {
            let combinedQuestions = [];
            let combinedMinutes = 0;
            let missingCount = 0;
            let maxPerQTimer = 0;

            for (let qId of group.quizIds) {
                const docSnap = await getDoc(doc(db, "quizzes", qId));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    combinedQuestions = combinedQuestions.concat(data.questions || []);
                    combinedMinutes += parseInt(data.totalMinutes || 0);
                    if (data.perQuestionSeconds > maxPerQTimer) {
                        maxPerQTimer = parseInt(data.perQuestionSeconds);
                    }
                } else {
                    missingCount++;
                }
            }
            
            if (missingCount > 0) {
                showToast(`Warning: ${missingCount} quiz(zes) were unavailable and skipped.`, "warning");
            }

            if (combinedQuestions.length === 0) throw new Error("No questions found in referenced quizzes.");

            currentQuizData = {
                id: `group_${groupId}`,
                metaExam: group.groupName,
                metaSubject: group.subject,
                metaClass: group.class,
                totalMarks: group.totalMarks,
                totalMinutes: combinedMinutes,
                questions: combinedQuestions,
                shuffleQuestions: true, 
                perQuestionSeconds: maxPerQTimer,
                minPassMarks: Math.floor(group.totalMarks * 0.4) 
            };

            $('librarySection').classList.add('hidden');
            $('v20-group-manager-panel').classList.add('hidden');
            $('studentLoginModal').classList.remove('hidden');

        } catch (error) {
            console.error(error);
            showToast("Failed to load group exam", "error");
        }
    },

    async deleteGroup(groupId, correctPwd) {
        const pwd = prompt("Enter the Creator Password to delete this group:");
        if (pwd === null) return;
        if (pwd !== correctPwd && correctPwd !== '') {
            return showToast("Incorrect Password", "error");
        }
        
        if (confirm("Delete this Exam Group? (Original quizzes will NOT be deleted)")) {
            try {
                await deleteDoc(doc(db, "exam_groups", groupId));
                showToast("Group deleted successfully.", "success");
                this.fetchExamGroups();
            } catch (err) {
                showToast("Error deleting group.", "error");
            }
        }
    },

    async generateGroupPDF(groupId) {
        const group = this.globalExamGroups.find(g => g.id === groupId);
        if (!group) return;

        showToast("Generating Professional Print/PDF View...", "info");

        try {
            let allQuestions = [];
            let answerKeyMap = {};
            let globalQNum = 1;

            for (let qId of group.quizIds) {
                const docSnap = await getDoc(doc(db, "quizzes", qId));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const topicName = data.metaTopic || "General";
                    if (!answerKeyMap[topicName]) answerKeyMap[topicName] = [];

                    (data.questions || []).forEach(q => {
                        allQuestions.push(q);
                        answerKeyMap[topicName].push({
                            num: globalQNum,
                            ans: q.answer
                        });
                        globalQNum++;
                    });
                }
            }

            // Using native window print allows 100% flawless CSS/HTML rendering natively vs jsPDF text extraction
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                showToast("Please allow pop-ups to generate PDF/Print.", "warning");
                return;
            }

            let html = `<!DOCTYPE html><html><head><title>${group.groupName} - Question Bank</title>
            <style>
                body { font-family: 'Inter', sans-serif; line-height: 1.6; padding: 30px; color: #000; background: #fff; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                h1, h2, h3, p { margin: 5px 0; }
                .q-container { margin-bottom: 25px; page-break-inside: avoid; }
                .q-text { font-size: 1.1em; font-weight: bold; margin-bottom: 10px; }
                .options { margin-left: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .ans-key { page-break-before: always; }
                .topic-title { margin-top: 20px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                @media print { body { padding: 0; } }
            </style></head><body>
            
            <div class="header">
                <h2>QUIZ MASTER PRO</h2>
                <h1>${group.groupName}</h1>
                <p><b>Subject:</b> ${group.subject} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Class:</b> ${group.class}</p>
                <p><b>Total Questions:</b> ${allQuestions.length} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Total Marks:</b> ${group.totalMarks}</p>
                <p><b>Topics:</b> ${group.topics}</p>
            </div>
            
            <div class="questions-section">
                <h3>QUESTION BANK</h3><hr><br>`;

            allQuestions.forEach((q, idx) => {
                html += `
                <div class="q-container">
                    <div class="q-text">${idx + 1}. ${q.text}</div>
                    <div class="options">
                        <div><b>A.</b> ${q.options[0] || ''}</div>
                        <div><b>B.</b> ${q.options[1] || ''}</div>
                        <div><b>C.</b> ${q.options[2] || ''}</div>
                        <div><b>D.</b> ${q.options[3] || ''}</div>
                    </div>
                </div>`;
            });

            html += `
            </div>
            <div class="ans-key">
                <div class="header"><h2>ANSWER KEY (TOPIC-WISE)</h2></div>`;

            for (const [topic, answers] of Object.entries(answerKeyMap)) {
                html += `<div class="topic-title">${topic}</div><ul style="list-style:none; padding-left:0;">`;
                answers.forEach(ansObj => {
                    html += `<li style="margin-bottom: 5px;"><b>${ansObj.num}.</b> ${ansObj.ans}</li>`;
                });
                html += `</ul>`;
            }

            html += `</div></body></html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            
            setTimeout(() => {
                printWindow.print();
            }, 800);

        } catch (err) {
            console.error("PDF Gen Error:", err);
            showToast("Error generating PDF.", "error");
        }
    }
};

window.addEventListener('load', () => {
    setTimeout(() => {
        EnterpriseV20Module.init();
    }, 500); 
});