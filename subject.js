// 🔥 Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, getDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// 🔥 Storage (ADDED)
import { getStorage, ref, uploadBytes, getDownloadURL } 
from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

// 🔥 Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC94uOY2xUFO00lYU3V9rMW8n5r5stTeJw",
  authDomain: "mark-verification-system.firebaseapp.com",
  projectId: "mark-verification-system",
  storageBucket: "mark-verification-system.firebasestorage.app",
  messagingSenderId: "361707277001",
  appId: "1:361707277001:web:f161fc8e379fc4139e9b18"
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// 🔥 Get subject
const subject = new URLSearchParams(window.location.search).get("name");

// 🔥 Set title
document.getElementById("subjectTitle").innerText =
  (subject || "Subject") + " Marks";

// =========================
// 📸 FILE PREVIEW
// =========================
function previewFile(input) {
  const file = input.files[0];
  const container = input.parentElement;

  const fileName = container.querySelector(".file-name");
  const preview = container.querySelector(".preview");

  if (file) {
    fileName.innerText = file.name;

    if (file.type.startsWith("image/")) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  }
}

// =========================
// 📤 HANDLE UPLOAD
// =========================
function handleUpload(event, form) {
  event.preventDefault();

  const fileInput = form.querySelector('input[type="file"]');

  if (!fileInput.files.length) {
    alert("Please select a file first");
    return;
  }

  alert("File submitted!");

  fileInput.value = "";

  const fileName = form.querySelector(".file-name");
  const preview = form.querySelector(".preview");

  if (fileName) fileName.innerText = "";
  if (preview) preview.style.display = "none";
}

// =========================
// 🔍 OCR PROCESS (FIXED)
// =========================
async function processImage(input) {
  const file = input.files[0];
  if (!file) return;

  const row = input.closest("tr");
  const taskName = row.children[0].innerText.trim();

  let currentSemester = "";
  let prev = row.previousElementSibling;

  while (prev) {
    if (prev.querySelector(".semtitle")) {
      currentSemester = prev.innerText.trim();
      break;
    }
    prev = prev.previousElementSibling;
  }

  const paperMarkCell = row.children[1];
  const statusCell = row.children[3];
  const manualInput = row.querySelector(".manual-mark");

  statusCell.innerText = "PROCESSING...";
  statusCell.style.color = "blue";
  paperMarkCell.innerText = "Reading...";

  try {
    const result = await Promise.race([
      Tesseract.recognize(file, 'eng'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OCR Timeout")), 15000) 
      )
    ]);

    const text = result.data.text;
    const match = text.match(/(\d{1,3})\s?%/);

    if (match) {
      const percentage = Number(match[1]);
      paperMarkCell.innerText = percentage + "%";
      const id = subject + "_" + currentSemester + "_" + taskName;

      // 🔥 UPLOAD IMAGE
      const fileName = subject + "_" + Date.now() + "_" + file.name;
      const storageRef = ref(storage, "proofs/" + fileName);

      await uploadBytes(storageRef, file);
      const imageURL = await getDownloadURL(storageRef);

      // 🔥 SAVE
      await setDoc(doc(db, "marks", id), {
        subject,
        semester: currentSemester,
        task: taskName,
        studentMark: percentage,
        image: imageURL
      }, { merge: true });

      // 🔥 COMPARE
      const docSnap = await getDoc(doc(db, "marks", id));
      const data = docSnap.data();

      if (data.lecturerMark !== undefined) {
        if (percentage === data.lecturerMark) {
          statusCell.innerText = "MATCH ✅";
          statusCell.style.color = "green";
        } else {
          statusCell.innerText = "MISMATCH ❌";
          statusCell.style.color = "red";
        }
      } else {
        statusCell.innerText = "WAITING FOR LECTURER ⏳";
        statusCell.style.color = "orange";
      }

      manualInput.style.display = "block";
      manualInput.value = percentage;

    } else {
      paperMarkCell.innerText = "Not found";
      statusCell.innerText = "NO MARK DETECTED ❌";
      statusCell.style.color = "red";
      manualInput.style.display = "block";
    }

  } catch (error) {
    console.error(error);
    paperMarkCell.innerText = "Failed";
    statusCell.innerText = error.message === "OCR Timeout" ? "OCR TOO SLOW ⏳" : "ERROR ❌";
    statusCell.style.color = "red";
    manualInput.style.display = "block";
  }
}

// =========================
// ✏️ MANUAL EDIT
// =========================
async function updateMark(input) {
  const row = input.closest("tr");
  const paperMarkCell = row.children[1];
  const statusCell = row.children[3];

  const value = input.value;
  if (!value) return;

  paperMarkCell.innerText = value + "%";

  const taskName = row.children[0].innerText.trim();

  let currentSemester = "";
  let prev = row.previousElementSibling;

  while (prev) {
    if (prev.querySelector(".semtitle")) {
      currentSemester = prev.innerText.trim();
      break;
    }
    prev = prev.previousElementSibling;
  }

  const id = subject + "_" + currentSemester + "_" + taskName;

  try {
    await setDoc(doc(db, "marks", id), {
      studentMark: Number(value)
    }, { merge: true });

    const lecturerDoc = await getDoc(doc(db, "marks", id));

    if (lecturerDoc.exists() && lecturerDoc.data().lecturerMark !== undefined) {
      const lecturerMark = lecturerDoc.data().lecturerMark;

      if (Number(value) === lecturerMark) {
        statusCell.innerText = "MATCH ✅";
        statusCell.style.color = "green";
      } else {
        statusCell.innerText = "MISMATCH ❌";
        statusCell.style.color = "red";
      }
    } else {
      statusCell.innerText = "WAITING FOR LECTURER ⏳";
      statusCell.style.color = "orange";
    }

  } catch (err) {
    console.error(err);
  }
}

// =========================
// 🔥 LOAD LECTURER MARKS
// =========================
async function loadLecturerMarks() {
  let currentSemester = "";
  const rows = document.querySelectorAll("table tr");

  for (const row of rows) {
    const firstCell = row.children[0];

    if (firstCell && firstCell.colSpan == 5) {
      currentSemester = firstCell.innerText.trim();
      continue;
    }

    const taskCell = row.children[0];
    const lectureCell = row.children[2];

    if (!taskCell || !lectureCell) continue;

    const taskName = taskCell.innerText.trim();
    const id = subject + "_" + currentSemester + "_" + taskName;

    try {
      const docSnap = await getDoc(doc(db, "marks", id));
      if (docSnap.exists() && docSnap.data().lecturerMark !== undefined) {
        lectureCell.innerText = docSnap.data().lecturerMark + "%";
      }
    } catch (err) {
      console.error("Error loading:", err);
    }
  }
}

// =========================
// 🚀 RUN
// =========================
window.onload = function () {
  loadLecturerMarks();
};

// 🔥 GLOBAL
window.previewFile = previewFile;
window.handleUpload = handleUpload;
window.processImage = processImage;
window.updateMark = updateMark;
