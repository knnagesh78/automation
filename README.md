# 🎓 Student Note & Large Data Summarizer Automation

An automated student study tool and notes summarizer designed to condense massive lecture notes, textbook chapters, PDF documents, and research papers into crisp, structured **2 to 3 paragraph summaries**, key takeaways, and revision flashcards.

---

## 🌟 Key Features

1. **Strict 2-3 Paragraph Summarization Engine**:
   - Condenses long inputs down specifically to 2-3 structured paragraphs (Core Concept, Supporting Evidence/Mechanisms, Synthesis & Impact).
   - Adjustable summary targets: **2-3 Paragraphs (Standard)**, **1 Paragraph (Ultra-Concise)**, **4-5 Paragraphs (Detailed)**.

2. **Dual Automation Interfaces**:
   - **Interactive Web App**: Modern glassmorphism student workspace with drag-and-drop file upload, real-time analytics, 3D flip study flashcards, audio player, export options, and saved study library.
   - **Standalone Python CLI Tool (`summarize.py`)**: Zero-dependency Python automation script for batch processing single text files or entire folders of notes into `.summary.txt` files.

3. **Offline & Online AI Engines**:
   - **Built-in Offline Smart NLP**: Powered by sentence scoring, TF-IDF term density, and TextRank graph centrality. Works 100% offline out-of-the-box with zero setup!
   - **Optional Gemini API Integration**: Enter an API key in settings for deep LLM abstractive summaries.

4. **Student Productivity Utilities**:
   - **🔊 Text-to-Speech Audio Player**: Listen to 2-3 paragraph summaries with adjustable playback speed (0.8x - 1.5x).
   - **🎴 Flashcard Generator**: Automatically generates Q&A study cards for active recall revision.
   - **📊 Compression Metrics**: Displays word count reduction %, chars, and estimated reading time saved.
   - **💾 Saved Study Library**: Save summaries to browser storage with search/filter tagging.
   - **📄 Multi-Format Exporter**: Export as PDF, Markdown (`.md`), Plain Text (`.txt`), or Copy to Clipboard.

---

## 🚀 How to Run

### Option 1: Web Application (Browser)

Simply double-click `index.html` in your browser!

```bash
# Or run with any local dev server:
npx http-server ./ -p 3000
```

### Option 2: Python CLI Automation (`summarize.py`)

No external pip packages required! Works with standard Python 3.6+.

#### 1. Summarize a single text file into 2-3 paragraphs:
```bash
python summarize.py --input "path/to/lecture_notes.txt" --paragraphs 3
```

#### 2. Batch summarize an entire folder of note files:
```bash
python summarize.py --batch "path/to/notes_folder/" --paragraphs 3
```

#### 3. Summarize raw text string directly from CLI:
```bash
python summarize.py --text "Paste long text here..." --paragraphs 2
```

---

## 📁 Project Structure

```
automation/
├── index.html        # Main Web App UI structure
├── styles.css        # Modern glassmorphism CSS design system & dark theme
├── app.js            # Offline NLP summarizer, Flashcards, TTS player, & Library logic
├── summarize.py      # Python CLI batch automation script for files & folders
├── package.json      # Project metadata & start script
└── README.md         # User guide and documentation
```

---

## 💡 Quick Tips for Students
- **Preset Notes**: Click **"Load Preset Notes"** in the top header to instantly test the tool with Biology, History, or Computer Science sample notes.
- **Audio Reading**: Switch to the **Audio Reader** tab in the summary dashboard to listen to your summary while multitasking.
- **Save for Exams**: Click **"Save Note"** to store summaries in your local browser library for quick revision before exams!
