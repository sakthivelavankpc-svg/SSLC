// ===== GLOBAL VARIABLES =====

let questions = [];
let userAnswers = [];
let currentQuestion = 0;

let score = 0;

let studentName = "";

let quizTitle = "Quiz";

let timer;

let totalSeconds = 0;


// ===== ELEMENTS =====

const homePage=document.getElementById("homePage");

const quizPage=document.getElementById("quizPage");

const resultPage=document.getElementById("resultPage");

const reviewPage=document.getElementById("reviewPage");



// ===== DARK MODE =====

document.getElementById("darkModeBtn")

.addEventListener("click",()=>{

document.body.classList.toggle("dark");

localStorage.setItem(

"darkMode",

document.body.classList.contains("dark")

);

});


if(localStorage.getItem("darkMode")=="true"){

document.body.classList.add("dark");

}



// ===== CSV UPLOAD =====

document

.getElementById("uploadBtn")

.addEventListener("click",()=>{


studentName=

document

.getElementById("studentName")

.value.trim();



if(studentName==""){

alert("Enter Student Name");

return;

}



let file=

document

.getElementById("csvFile")

.files[0];



if(!file){

alert("Select CSV File");

return;

}



quizTitle=file.name;



Papa.parse(file,{

header:true,

skipEmptyLines:true,

complete:function(result){

questions=result.data;

prepareQuiz();

}

});



});



// ===== PUBLIC QUIZZES =====

document

.querySelectorAll(".quizBtn")

.forEach(btn=>{


btn.addEventListener(

"click",

()=>{


studentName=

document

.getElementById("studentName")

.value.trim();



if(studentName==""){

alert("Enter Student Name");

return;

}



let file=btn.dataset.file;



quizTitle=

btn.innerText;



Papa.parse(file,{

download:true,

header:true,

skipEmptyLines:true,

complete:function(result){

questions=result.data;

prepareQuiz();

}

});



}

);



});




// ===== PREPARE QUIZ =====

function prepareQuiz(){



let limit=

parseInt(

document

.getElementById("questionLimit")

.value

);



if(

!isNaN(limit)

&&

limit<questions.length

){

questions=

shuffleArray(

questions

).slice(0,limit);

}



if(

document

.getElementById(

"shuffleQuestions"

).checked

){

questions=

shuffleArray(

questions

);

}



userAnswers=

new Array(

questions.length

).fill(null);



currentQuestion=0;



startTimer();



homePage.style.display="none";

quizPage.style.display="block";



showQuestion();

showPalette();

}



// ===== SHUFFLE =====

function shuffleArray(array){



return

array

.sort(

()=>Math.random()-0.5

);



}




// ===== SHOW QUESTION =====

function showQuestion(){



let q=

questions[currentQuestion];



document

.getElementById(

"questionNumber"

)

.innerHTML=

"Question "

+(currentQuestion+1)

+" of "

+questions.length;



document

.getElementById(

"questionText"

)

.innerHTML=

q.QUESTION;



let options=`

<label class="option">

<input

type="radio"

name="option"

value="1"

${userAnswers[currentQuestion]=="1"?"checked":""}

>

${q.OPTION1}

</label>



<label class="option">

<input

type="radio"

name="option"

value="2"

${userAnswers[currentQuestion]=="2"?"checked":""}

>

${q.OPTION2}

</label>



<label class="option">

<input

type="radio"

name="option"

value="3"

${userAnswers[currentQuestion]=="3"?"checked":""}

>

${q.OPTION3}

</label>



<label class="option">

<input

type="radio"

name="option"

value="4"

${userAnswers[currentQuestion]=="4"?"checked":""}

>

${q.OPTION4}

</label>

`;



document

.getElementById(

"optionsContainer"

)

.innerHTML=

options;



showPalette();



}



// ===== SAVE ANSWER =====

function saveAnswer(){



let selected=

document

.querySelector(

'input[name="option"]:checked'

);



if(selected){

userAnswers[currentQuestion]

=

selected.value;

}



}



// ===== NEXT =====

document

.getElementById("nextBtn")

.addEventListener("click",()=>{



saveAnswer();



if(

currentQuestion

<

questions.length-1

){

currentQuestion++;

showQuestion();

}



});




// ===== PREVIOUS =====

document

.getElementById("prevBtn")

.addEventListener("click",()=>{



saveAnswer();



if(currentQuestion>0){

currentQuestion--;

showQuestion();

}



});




// ===== QUESTION PALETTE =====

function showPalette(){



let html="";



for(

let i=0;

i<questions.length;

i++

){



let cls="paletteUnanswered";



if(i==currentQuestion)

cls="paletteCurrent";



else if(

userAnswers[i]!=null

)

cls="paletteAnswered";



html+=`

<button

class="paletteBtn ${cls}"

onclick="gotoQuestion(${i})"

>

${i+1}

</button>

`;



}



document

.getElementById(

"questionPalette"

)

.innerHTML=

html;



}



function gotoQuestion(i){



saveAnswer();



currentQuestion=i;



showQuestion();

}



// ===== TIMER =====

function startTimer(){



let minutes=

parseInt(

document

.getElementById("quizTime")

.value

)||30;



totalSeconds=minutes*60;



updateTimer();



timer=setInterval(()=>{



totalSeconds--;



updateTimer();



if(totalSeconds<=0){



clearInterval(timer);



submitQuiz();



}



},1000);



}



function updateTimer(){



let mins=

Math.floor(

totalSeconds/60

);



let secs=

totalSeconds%60;



document

.getElementById(

"timer"

)

.innerHTML=

String(mins)

.padStart(2,'0')

+

":"

+

String(secs)

.padStart(2,'0');



}




// ===== SUBMIT =====

document

.getElementById("submitBtn")

.addEventListener(

"click",

submitQuiz

);



function submitQuiz(){



saveAnswer();



clearInterval(timer);



score=0;



for(

let i=0;

i<questions.length;

i++

){



if(

userAnswers[i]

==

questions[i].ANSWER

){

score++;

}



}



showResult();



}



// ===== RESULT =====

function showResult(){



quizPage.style.display="none";



resultPage.style.display="block";



let percent=

(

score/

questions.length

*100

)

.toFixed(2);



document

.getElementById(

"resultStudent"

)

.innerHTML=

studentName;



document

.getElementById(

"resultQuiz"

)

.innerHTML=

quizTitle;



document

.getElementById(

"resultDate"

)

.innerHTML=

new Date()

.toLocaleDateString();



document

.getElementById(

"resultTotal"

)

.innerHTML=

questions.length;



document

.getElementById(

"resultCorrect"

)

.innerHTML=

score;



document

.getElementById(

"resultWrong"

)

.innerHTML=

questions.length-score;



document

.getElementById(

"resultScore"

)

.innerHTML=

percent+"%";



document

.getElementById(

"resultStatus"

)

.innerHTML=

percent>=40?

"PASS":

"FAIL";



}




// ===== PDF =====

document

.getElementById(

"downloadPdfBtn"

)

.addEventListener(

"click",

()=>{



const {

jsPDF

}

=

window.jspdf;



const pdf=

new jsPDF();



pdf.setFontSize(20);

pdf.text(

"STUDENT QUIZ RESULT",

20,

20

);



pdf.setFontSize(12);



pdf.text(

"Student : "

+studentName,

20,

40

);



pdf.text(

"Quiz : "

+quizTitle,

20,

50

);



pdf.text(

"Date : "

+

new Date()

.toLocaleDateString(),

20,

60

);



pdf.text(

"Total Questions : "

+

questions.length,

20,

80

);



pdf.text(

"Correct : "

+

score,

20,

90

);



pdf.text(

"Wrong : "

+

(questions.length-score),

20,

100

);



pdf.text(

"Percentage : "

+

(

score/

questions.length

*100

)

.toFixed(2)

+"%",

20,

110

);



pdf.text(

"Teacher Signature",

20,

150

);



pdf.line(

20,

155,

90,

155

);



pdf.save(

studentName

+"_"

+

quizTitle

+

".pdf"

);



}

);




// ===== REVIEW =====

document

.getElementById(

"reviewBtn"

)

.addEventListener(

"click",

()=>{



resultPage.style.display="none";



reviewPage.style.display="block";



let html="";



questions.forEach(

(q,index)=>{



let ua=

userAnswers[index];



let correct=

q["OPTION"+q.ANSWER];



let user=

ua?

q["OPTION"+ua]

:

"Not Answered";



html+=`

<div class="reviewItem">

<div class="reviewQuestion">

${index+1}.

${q.QUESTION}

</div>



<p>

Your Answer :

<b>

${user}

</b>

</p>



<p>

Correct Answer :

<b class="correct">

${correct}

</b>

</p>

</div>

`;



}

);



document

.getElementById(

"reviewContainer"

)

.innerHTML=

html;



}

);




// ===== HOME =====

document

.getElementById("homeBtn")

.addEventListener(

"click",

()=>{

location.reload();

}

);



document

.getElementById(

"reviewHomeBtn"

)

.addEventListener(

"click",

()=>{

location.reload();

}

);